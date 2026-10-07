"""LIVE-RANGE-CONFLUENCE-BOOK build (forge/LIVE_RANGE_CONFLUENCE_BOOK_PREREG.md).

Every pass of every line (moving hourly lines and the static morning lines), the full-day record after each pass, and the
confluence columns at the touch. No Vote Atlas input: all computed from the local M1.

    python -m forge.live_range_conf
"""
from __future__ import annotations

import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd
from numba import njit

from forge.bars import load_m1
from forge.live_range_replay import H, m1_key, m1_root, offsets_from_frame_fit
from forge.run_live_range_history_build import cls_of, meta

OUT = Path("analysis/output/live_range_confluence"); OUT.mkdir(parents=True, exist_ok=True)
EC2 = ["h", "side", "rung", "ti", "tmin", "off", "over", "j1", "a", "b", "pre", "code", "inhour", "rtjump", "cell", "used", "speed",
       "seq", "held", "ext", "t_ext", "mfe", "mae", "t_mfe", "t_mae", "r15", "r60", "r180", "rclose",
       "roc15", "roc60", "roc180", "accel", "wt1", "wtd", "wtcross", "wtdiv", "vwapd", "rv", "volapp",
       "L_pdH", "L_pdL", "L_pdC", "L_pwH", "L_pwL", "L_wo", "L_poc", "L_vah", "L_val", "npoc", "nstack"]
NE = len(EC2)
NLEV = 19                      # 0 pdH,1 pdL,2 pdC,3 pwH,4 pwL,5 weekOpen,6 POC,7 VAH,8 VAL, 9..18 naked POCs
REARM = 0.15; ZONE = 0.15; MAXSEQ_M = 5; MAXSEQ_S = 8


def load_sessions_v(name):
    m = load_m1(m1_key(name), m1_root(m1_key(name))).tz_convert("Europe/London")
    m = m[m.index.hour < 22]
    f = m.resample("5min").agg({"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}).dropna(subset=["open"])
    date = f.index.strftime("%Y-%m-%d").to_numpy()
    hrs = (f.index.hour + f.index.minute / 60.0).to_numpy(float)
    arr = f[["open", "high", "low", "close", "volume"]].to_numpy(float)
    cut = np.flatnonzero(date[1:] != date[:-1]) + 1
    st = np.r_[0, cut]; en = np.r_[cut, len(date)]
    return {date[s]: (hrs[s:e], *[arr[s:e, j] for j in range(5)]) for s, e in zip(st, en)}


def profile(hi, lo, cl, vol, unit):
    """volume profile on a 0.05-sigma grid; returns (POC, VAH, VAL) of the session (tick volume at the typical price)."""
    tp = (hi + lo + cl) / 3.0
    w = 0.05 * unit
    b = np.floor((tp - tp.min()) / w).astype(int)
    v = np.bincount(b, weights=np.maximum(vol, 0) + 1e-9)
    poc = int(np.argmax(v)); tot = v.sum(); lo_i = hi_i = poc; acc = v[poc]
    while acc < 0.7 * tot and (lo_i > 0 or hi_i < len(v) - 1):
        up = v[hi_i + 1] if hi_i < len(v) - 1 else -1; dn = v[lo_i - 1] if lo_i > 0 else -1
        if up >= dn:
            hi_i += 1; acc += v[hi_i]
        else:
            lo_i -= 1; acc += v[lo_i]
    c = lambda i: tp.min() + (i + 0.5) * w
    return c(poc), c(hi_i), c(lo_i)


def level_table(S, M):
    """per date: array of NLEV level prices from PRIOR sessions only."""
    dates = [d for d in sorted(S)]
    info = {}
    for d, sg in zip(M.date, M.pit_sig_daily):
        if d in S and len(S[d][0]) >= 60:
            hrs, o, h, l, c, v = S[d]
            info[d] = dict(O=o[0], H=h.max(), L=l.min(), C=c[-1], prof=profile(h, l, c, v, sg / 100 * o[0]))
    ds = sorted(info)
    wk = {d: pd.Timestamp(d).isocalendar()[:2] for d in ds}
    out = {}
    for i, d in enumerate(ds):
        lv = np.full(NLEV, np.nan)
        if i == 0:
            out[d] = lv; continue
        p = info[ds[i - 1]]
        lv[0], lv[1], lv[2] = p["H"], p["L"], p["C"]
        # previous ISO week: the latest earlier week key
        prev_keys = sorted({wk[x] for x in ds[:i] if wk[x] != wk[d]})
        if prev_keys:
            pk = prev_keys[-1]; wd = [x for x in ds[:i] if wk[x] == pk]
            lv[3] = max(info[x]["H"] for x in wd); lv[4] = min(info[x]["L"] for x in wd)
        wo = [x for x in ds[:i + 1] if wk[x] == wk[d]]
        lv[5] = info[wo[0]]["O"]
        lv[6], lv[7], lv[8] = p["prof"]
        k = 9
        for j in range(max(0, i - 10), i - 1):                                 # naked POCs of sessions i-10 .. i-2
            poc = info[ds[j]]["prof"][0]
            if not any(info[ds[m]]["L"] <= poc <= info[ds[m]]["H"] for m in range(j + 1, i)):
                lv[k] = poc; k += 1
                if k >= NLEV:
                    break
        out[d] = lv
    return out


@njit(cache=True)
def _scan(side, line, outE, backE, anchorE, w0, w1, maxseq, hrs, op, hi, lo, cl, vol, unit, tci, wt2, cumV, cumPV, cumRV, lv, first_jump,
          kh_end, h, rung, off, cell, used, speed, EV, nev):
    n = len(hrs)
    sgn = 1.0 if side > 0 else -1.0
    seq = 0; armed = True
    lineE = line
    i = w0
    while i < w1 and seq < maxseq:
        hiE = hi[i] if side > 0 else -lo[i]
        loE = lo[i] if side > 0 else -hi[i]
        clE = sgn * cl[i]
        if armed and hiE >= lineE:
            ti = i
            cE = clE
            a = (outE - cE) / unit; b = (cE - backE) / unit
            pre = 0.0; code = 0.0; inh = 0.0
            if a <= 0:
                pre = 1.0; code = 1.0
            elif b <= 0:
                pre = 2.0; code = 2.0
            else:
                for j in range(ti + 1, n):
                    hj = hi[j] if side > 0 else -lo[j]
                    lj = lo[j] if side > 0 else -hi[j]
                    ho = hj >= outE; lb = lj <= backE
                    if ho and lb:
                        code = 3.0
                    elif ho:
                        code = 1.0
                    elif lb:
                        code = 2.0
                    if code != 0.0:
                        inh = 1.0 if j < kh_end else 0.0
                        break
            e = nev
            EV[e, 0] = h; EV[e, 1] = side; EV[e, 2] = rung; EV[e, 3] = ti; EV[e, 4] = hrs[ti] * 60.0
            EV[e, 5] = off; EV[e, 6] = ((hi[ti] if side > 0 else -lo[ti]) - lineE) / unit
            EV[e, 7] = 1.0 if (hi[ti] if side > 0 else -lo[ti]) >= outE else 0.0
            EV[e, 8] = a; EV[e, 9] = b; EV[e, 10] = pre; EV[e, 11] = code; EV[e, 12] = inh
            EV[e, 13] = 1.0 if first_jump < ti else 0.0; EV[e, 14] = cell; EV[e, 15] = used; EV[e, 16] = speed
            EV[e, 17] = seq + 1
            if h == 0:
                EV[e, 0] = float(int(hrs[ti]))
            if used != used:
                mxh = hi[0]; mnl = lo[0]
                for q in range(ti):
                    mxh = max(mxh, hi[q]); mnl = min(mnl, lo[q])
                EV[e, 15] = (mxh - mnl) / unit
                lh = -1e18; ll = 1e18
                for q in range(max(0, ti - 12), ti):
                    lh = max(lh, hi[q]); ll = min(ll, lo[q])
                EV[e, 16] = (lh - ll) / unit if ti > 0 else 0.0
            # ---- full-day record after the pass
            mx = -1e18; mn = 1e18; tmx = 0; tmn = 0; ex = -1e18; tex = 0
            for j in range(ti, n):
                hj = hi[j] if side > 0 else -lo[j]
                lj = lo[j] if side > 0 else -hi[j]
                if hj > ex:
                    ex = hj; tex = j
                if j > ti:
                    if hj > mx:
                        mx = hj; tmx = j
                    if lj < mn:
                        mn = lj; tmn = j
            ext = max(0.0, ex - lineE) / unit
            EV[e, 18] = 1.0 if ext <= 0.25 else 0.0; EV[e, 19] = ext; EV[e, 20] = (hrs[tex] - hrs[ti]) * 60.0
            if mx > -1e17:
                EV[e, 21] = max(0.0, mx - cE) / unit; EV[e, 22] = max(0.0, cE - mn) / unit
                EV[e, 23] = (hrs[tmx] - hrs[ti]) * 60.0; EV[e, 24] = (hrs[tmn] - hrs[ti]) * 60.0
            for kk, bars in ((25, 3), (26, 12), (27, 36)):
                j = min(ti + bars, n - 1)
                EV[e, kk] = (sgn * cl[j] - cE) / unit
            EV[e, 28] = (sgn * cl[n - 1] - cE) / unit
            # ---- confluences at the touch (bars strictly before ti)
            if ti >= 2:
                p = ti - 1
                EV[e, 29] = sgn * (cl[p] - cl[max(p - 3, 0)]) / unit
                EV[e, 30] = sgn * (cl[p] - cl[max(p - 12, 0)]) / unit
                EV[e, 31] = sgn * (cl[p] - cl[max(p - 36, 0)]) / unit
                if p >= 12:
                    EV[e, 32] = sgn * ((cl[p] - cl[p - 6]) - (cl[p - 6] - cl[p - 12])) / unit
                EV[e, 33] = sgn * tci[p]; EV[e, 34] = sgn * (tci[p] - wt2[p])
                cr = 0.0
                for q in range(max(p - 2, 1), p + 1):
                    if (tci[q] - wt2[q]) * (tci[q - 1] - wt2[q - 1]) < 0:
                        cr = 1.0
                EV[e, 35] = cr
                # divergence: touch makes a new oriented session extreme and WT is lower than at the prior extreme
                pm = -1e18; ip = 0
                for q in range(ti):
                    hq = hi[q] if side > 0 else -lo[q]
                    if hq > pm:
                        pm = hq; ip = q
                if (hi[ti] if side > 0 else -lo[ti]) > pm:
                    EV[e, 36] = 1.0 if sgn * tci[p] < sgn * tci[ip] else 0.0
                if cumV[p] > 0:
                    EV[e, 37] = sgn * (cl[p] - cumPV[p] / cumV[p]) / unit
                EV[e, 38] = cumRV[p] / (unit * unit)
                vv = 0.0
                for q in range(max(0, ti - 12), ti):
                    vv += vol[q]
                EV[e, 39] = vv
            ns = 0.0; npk = 0.0
            for k in range(19):
                if lv[k] == lv[k] and abs(line_price(side, lineE) - lv[k]) <= 0.15 * unit:
                    if k < 9:
                        EV[e, 40 + k] = 1.0
                    else:
                        npk += 1.0
                    ns += 1.0
            EV[e, 49] = npk; EV[e, 50] = ns
            nev += 1
            seq += 1
            armed = False
        elif (not armed) and clE <= lineE - 0.15 * unit:
            armed = True
        i += 1
    return nev


@njit(cache=True)
def line_price(side, lineE):
    return lineE if side > 0 else -lineE


@njit(cache=True)
def replay_all(hrs, op, hi, lo, cl, vol, unit, ue, se, offU, offD, stat, lv, mode):
    """mode 0: moving hourly lines (offsets); mode 1: static lines stat[0..5] = up p50,p75,p90, dn p50,p75,p90 (prices)."""
    n = len(hrs)
    EV = np.full((700, 51), np.nan)
    nev = 0
    kh = np.empty(23, np.int64)
    for h in range(23):
        k = 0
        while k < n and hrs[k] < h:
            k += 1
        kh[h] = k
    first_jump = n
    for i in range(n):
        prev = op[0] if i == 0 else cl[i - 1]
        if abs(cl[i] - prev) >= 0.5 * unit:
            first_jump = i; break
    ap = (hi + lo + cl) / 3.0
    a1 = 2.0 / 11.0; a2 = 2.0 / 22.0
    esa = np.empty(n); d = np.empty(n); tci = np.empty(n); wt2 = np.empty(n)
    esa[0] = ap[0]; d[0] = 0.0; tci[0] = 0.0
    for i in range(1, n):
        esa[i] = esa[i - 1] + a1 * (ap[i] - esa[i - 1])
        d[i] = d[i - 1] + a1 * (abs(ap[i] - esa[i]) - d[i - 1])
        ci = (ap[i] - esa[i]) / (0.015 * d[i]) if d[i] > 1e-12 else 0.0
        tci[i] = tci[i - 1] + a2 * (ci - tci[i - 1])
    for i in range(n):
        s = 0.0; c = 0
        for j in range(max(0, i - 3), i + 1):
            s += tci[j]; c += 1
        wt2[i] = s / c
    cumV = np.cumsum(vol); cumPV = np.cumsum(ap * vol)
    rv = np.zeros(n)
    for i in range(1, n):
        rv[i] = rv[i - 1] + (cl[i] - cl[i - 1]) ** 2
    if mode == 1:
        runH = hi[0]; runL = lo[0]
        for side in (1, -1):
            sgn = float(side)
            anchor = sgn * op[0]
            L = np.empty(3)
            for q in range(3):
                L[q] = sgn * stat[q] if side > 0 else sgn * stat[3 + q]
            for q in range(3):
                outE = L[q + 1] if q < 2 else L[2] + (L[2] - L[1])
                backE = L[q - 1] if q > 0 else anchor
                used = 0.0; speed = 0.0
                nev = _scan(side, L[q], outE, backE, anchor, 1, n, MAXSEQ_S_C, hrs, op, hi, lo, cl, vol, unit, tci, wt2, cumV, cumPV, rv,
                            lv, first_jump, 0, 0, q, (L[q] - anchor) / unit, np.nan, np.nan, np.nan, EV, nev)
        return EV[:nev]
    sufH = np.empty(n + 1); sufL = np.empty(n + 1)
    sufH[n] = -np.inf; sufL[n] = np.inf
    for i in range(n - 1, -1, -1):
        sufH[i] = max(sufH[i + 1], hi[i]); sufL[i] = min(sufL[i + 1], lo[i])
    for h in range(1, 22):
        k = kh[h]
        if k == 0 or hrs[n - 1] < h:
            continue
        kp = kh[h - 1]
        runH = hi[0]; runL = lo[0]
        for i in range(k):
            runH = max(runH, hi[i]); runL = min(runL, lo[i])
        lastH = -np.inf; lastL = np.inf; has = False
        for i in range(kp, k):
            has = True
            lastH = max(lastH, hi[i]); lastL = min(lastL, lo[i])
        used = (runH - runL) / unit
        speed = (lastH - lastL) / unit if has else 0.0
        tu = 0 if used < ue[h, 0] else (1 if used < ue[h, 1] else 2)
        ts = 0 if speed < se[h, 0] else (1 if speed < se[h, 1] else 2)
        c = tu * 3 + ts
        k2 = kh[h + 1]
        for side in (1, -1):
            sgn = float(side)
            anchor = sgn * (runH if side > 0 else runL)
            L = np.empty(3)
            for q in range(3):
                o2 = offU[h, c, q] if side > 0 else offD[h, c, q]
                L[q] = anchor + o2 * unit
            for q in range(3):
                off = offU[h, c, q] if side > 0 else offD[h, c, q]
                if off <= 1e-9:
                    continue
                outE = L[q + 1] if q < 2 else L[2] + (L[2] - L[1])
                backE = L[q - 1] if q > 0 else anchor
                nev = _scan(side, L[q], outE, backE, anchor, k, k2, MAXSEQ_M_C, hrs, op, hi, lo, cl, vol, unit, tci, wt2, cumV, cumPV, rv,
                            lv, first_jump, k2, h, q, off, c, used, speed, EV, nev)
    return EV[:nev]


MAXSEQ_M_C = MAXSEQ_M
MAXSEQ_S_C = MAXSEQ_S


def run_instrument(args):
    name, idx, fits = args
    S = load_sessions_v(name); M = meta(name)
    csv = pd.read_csv(H / f"{name}.csv", usecols=["date", "open", "pit_oh_p50", "pit_oh_p75", "pit_oh_p90", "pit_ol_p50", "pit_ol_p75", "pit_ol_p90"]).set_index("date")
    LV = level_table(S, M)
    qs = np.array(sorted(fits)); mov, sta = [], []
    for d, sg, rr in zip(M.date, M.pit_sig_daily, M.regime_ratio):
        do = pd.Timestamp(d).toordinal()
        if do < qs[0] or d not in S or len(S[d][0]) < 60 or d not in LV:
            continue
        P = fits[qs[np.searchsorted(qs, do, side="right") - 1]]
        hrs, o, h, l, c, v = S[d]
        unit = sg / 100 * o[0]
        lv = LV[d]
        EV = replay_all(hrs, o, h, l, c, v, unit, *P, np.zeros(6), lv, 0)
        r = csv.loc[d]
        stat = np.array([o[0] * (1 + r.pit_oh_p50 / 100), o[0] * (1 + r.pit_oh_p75 / 100), o[0] * (1 + r.pit_oh_p90 / 100),
                         o[0] * (1 - r.pit_ol_p50 / 100), o[0] * (1 - r.pit_ol_p75 / 100), o[0] * (1 - r.pit_ol_p90 / 100)])
        ES = replay_all(hrs, o, h, l, c, v, unit, *P, stat, lv, 1)
        for tgt, E_ in ((mov, EV), (sta, ES)):
            if len(E_):
                tgt.append(np.column_stack([np.full(len(E_), idx), np.full(len(E_), do), np.full(len(E_), rr), E_]))
    print("done", name, flush=True)
    mk = lambda rows: pd.DataFrame(np.vstack(rows), columns=["inst", "date", "regime_ratio"] + EC2) if rows else None
    return mk(mov), mk(sta)


def main():
    names = sorted(p.stem for p in H.glob("*.csv"))
    F = pd.read_parquet("analysis/output/live_range_wf/frame.parquet"); F["cls"] = F.inst.map(cls_of)
    fits = {c: {} for c in ("fx_gold", "indices")}
    for q in pd.date_range("2018-04-01", "2026-07-01", freq="QS"):
        for c in fits:
            fits[c][q.toordinal()] = offsets_from_frame_fit(F[F.cls == c], q.toordinal())
    jobs = [(n, i, fits[cls_of(n)]) for i, n in enumerate(names)]
    with ProcessPoolExecutor(8) as ex:
        res = list(ex.map(run_instrument, jobs))
    for tag, k in (("moving", 0), ("static", 1)):
        X = pd.concat([r[k] for r in res if r[k] is not None], ignore_index=True)
        for c in X.columns:
            if c not in ("inst", "date"):
                X[c] = X[c].astype(np.float32)
        X["inst"] = X.inst.astype(np.int16); X["date"] = X.date.astype(np.int32)
        X.to_parquet(OUT / f"ev_{tag}.parquet")
        print(tag, len(X), flush=True)
    pd.Series(names).to_json(OUT / "names.json")


if __name__ == "__main__":
    main()
