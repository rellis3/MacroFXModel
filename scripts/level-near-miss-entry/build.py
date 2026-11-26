"""level-near-miss-entry: approach episodes, pre-touch states, entry-method trades (forge/LEVEL_NEAR_MISS_ENTRY_PREREG.md).

    python scripts/level-near-miss-entry/build.py [SYM ...]   -> analysis/output/level-near-miss-entry/{episodes,states,agg}/

Lower lines are handled by mirroring prices (h' = -l, l' = -h, c' = -c, P' = -P), so all logic is for an upper line.
Episode: first comes within 0.25 W (high), re-armed at >= 0.35 W; ends at touch / retreat (>= 0.35 W) / 120 min.
States: first bar close whose high reaches within x W (x = .20 .15 .10 .05) before the touch.
"""
from __future__ import annotations

import importlib.util
import sys
import warnings
import zlib
from concurrent.futures import ProcessPoolExecutor
from math import erf, sqrt
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[2]


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


LCE = _load("lce", "scripts/level-context-engine/build.py")
VB = _load("vb", "scripts/jordan-vwap-band-tp/run.py")
L, JLM = LCE.L, LCE.JLM
SEED = 20261125
OUT = ROOT / "analysis/output/level-near-miss-entry"
ZONE, RESET, CAP, U = 0.25, 0.35, 120, 0.25
XS = (0.20, 0.15, 0.10, 0.05)
KS = (0.25, 0.5, 0.75, 1.0)
TS = (5, 15, 30, 60)
NO = 10 ** 6
C156 = 1.56
ZB = [0, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, np.inf]
EB = [0, 5, 15, 30, 60, 121]
PB = np.linspace(0, 1, 21)


def Phi(x):
    return 0.5 * (1 + np.vectorize(erf)(np.asarray(x, float) / sqrt(2)))


def fpt(d, s, mu):
    """P(first passage of an upper barrier d above, within the horizon) for BM with total drift mu and sd s."""
    s = np.maximum(s, 1e-12)
    ex = np.clip(2 * mu * d / s ** 2, -50, 50)
    return np.clip(Phi((mu - d) / s) + np.exp(ex) * Phi((-mu - d) / s), 0, 1)


def first(mask):
    k = np.flatnonzero(mask)
    return int(k[0]) if len(k) else NO


def bracket(h, l, c, k0, entry, u, n, short, fill_bar_through):
    """Return (R gross, hold bars, mfe60/u, mae60/u). short=True = fade at an upper line (price must fall).
    fill_bar_through: the stop side may hit on bar k0 (limit fill); else the race starts at k0+1 (close entry)."""
    e = min(n, k0 + 1 + CAP)
    a = k0 if fill_bar_through else k0 + 1
    if a >= e:
        return 0.0, 0, 0.0, 0.0
    if short:
        js = first(h[a:e] >= entry + u) + (a - k0)
        jt = first(l[k0 + 1:e] <= entry - u) + 1
    else:
        js = first(l[k0 + 1:e] <= entry - u) + 1
        jt = first(h[a:e] >= entry + u) + (a - k0)
    stop_j, tgt_j = js, jt
    if stop_j >= NO and tgt_j >= NO:
        R = ((entry - c[e - 1]) if short else (c[e - 1] - entry)) / u
        R, hold = float(np.clip(R, -1, 1)), e - 1 - k0
    elif tgt_j < stop_j:
        R, hold = 1.0, tgt_j
    else:
        R, hold = -1.0, stop_j
    e60 = min(n, k0 + 61)
    if k0 + 1 < e60:
        hi, lo = h[k0 + 1:e60].max(), l[k0 + 1:e60].min()
        mfe = (entry - lo) if short else (hi - entry)
        mae = (hi - entry) if short else (entry - lo)
    else:
        mfe = mae = 0.0
    return R, hold, max(mfe, 0) / u, max(mae, 0) / u


def profile(sym, m, lt):
    """Train-years (2020-2022) intraday variance share by London minute."""
    mins = (lt.hour * 60 + lt.minute).to_numpy()
    r = np.r_[0.0, np.diff(np.log(m["close"].to_numpy()))]
    day = lt.normalize()
    newday = np.r_[True, day[1:] != day[:-1]]
    r[newday] = 0.0
    tr = (lt.year >= 2020) & (lt.year <= 2022)
    v = pd.Series(r[tr] ** 2).groupby(mins[tr]).mean().reindex(range(1320)).fillna(0).to_numpy()
    v = np.maximum(v, 1e-3 * np.median(v[v > 0]))
    return v / v.sum()


def run(sym):
    dates, lv, sg, vr = LCE.levels(sym, "F")
    m = VB.load_m1v(sym)
    lt = m.index.tz_convert("Europe/London")
    keep = (lt.hour < 22) & (lt.dayofweek < 5)
    m, lt = m[keep], lt[keep]
    w = profile(sym, m, lt)
    di = pd.Index(lt.tz_localize(None).normalize())
    mins = (lt.hour * 60 + lt.minute).to_numpy()
    H, Lo, O, C, V = (m[c].to_numpy() for c in ("high", "low", "open", "close", "volume"))
    tick = JLM.tick_of(C[-200000:])
    st = np.flatnonzero(np.r_[True, di[1:] != di[:-1]]); en = np.r_[st[1:], len(di)]
    pos = {di[s]: (s, e) for s, e in zip(st, en)}
    closes = {di[s]: C[e - 1] for s, e in zip(st, en)}
    sess = sorted(closes)
    prev_ret = {sess[k]: closes[sess[k - 1]] - closes[sess[k - 2]] for k in range(2, len(sess))}
    rng = np.random.default_rng([SEED, zlib.crc32(f"{sym}:F:nme".encode())])
    EP, ST = [], []
    haz = {}
    br1 = np.zeros((2, len(PB) - 1, 3))  # spacing (1,5) x bin x (n, sum p, actual)
    ar = {"px": np.zeros(5), "vw": np.zeros(5)}  # n, sx, sy, sxx, sxy (x = level, y = change)
    for i, dt in enumerate(dates):
        if dt.year < 2020 or dt not in pos:
            continue
        s, e = pos[dt]
        if e - s < 600 or not all(np.isfinite(lv[q][i, 0]) for q in lv):
            continue
        h0, l0, c0, op0, v0, n = H[s:e], Lo[s:e], C[s:e], O[s:e], V[s:e], e - s
        o = op0[0]
        mn = mins[s:e]
        cw = np.r_[0.0, np.cumsum(w[np.clip(mn, 0, 1319)])]            # cw[t+1] - cw[a] = share over bars a..t
        W = lv["hl"][i, 0] * o / 100
        sd = W / C156
        hlc3 = (h0 + l0 + c0) / 3
        cv = np.cumsum(v0)
        vwap = np.where(cv > 0, np.cumsum(hlc3 * v0) / np.maximum(cv, 1e-12), hlc3)
        rl = np.minimum(o, np.r_[o, np.minimum.accumulate(l0)[:-1]])
        rh = np.maximum(o, np.r_[o, np.maximum.accumulate(h0)[:-1]])
        rng_used = np.maximum.accumulate(h0) - np.minimum.accumulate(l0)
        pr = prev_ret.get(dt, np.nan)
        tr_year = dt.year <= 2022
        # AR(1) / DF ingredients (train years only), price - open and close - vwap, in sd units
        if tr_year:
            for key, x in (("px", (c0 - o) / sd), ("vw", (c0 - vwap) / sd)):
                xl, dy = x[:-1], np.diff(x)
                ar[key] += [len(xl), xl.sum(), dy.sum(), (xl * xl).sum(), (xl * dy).sum()]
        mults = {(ln, j): (rng.uniform(0.75, 0.90) if rng.random() < 0.5 else rng.uniform(1.10, 1.25))
                 for _, ln, _, _ in LCE.LINES for j in range(3)}
        for kind in ("line", "placebo"):
            for fam, ln, ab, sq in LCE.LINES:
                sig = sg[sq][i] * o / 100
                u = U * sig
                sgn = 1.0 if ab else -1.0
                h, l, c, op = (h0, l0, c0, op0) if ab else (-l0, -h0, -c0, -op0)
                vw = vwap * sgn
                for j, tau in enumerate(LCE.TAUS):
                    mk = 1.0 if kind == "line" else mults[(ln, j)]
                    if ln in ("oh", "cup"):
                        P = np.full(n, o * (1 + lv[ln][i, j] * mk / 100))
                    elif ln in ("ol", "cdn"):
                        P = np.full(n, o * (1 - lv[ln][i, j] * mk / 100))
                    elif ln == "hlH":
                        P = rl + lv["hl"][i, j] * mk * o / 100
                    else:
                        P = rh - lv["hl"][i, j] * mk * o / 100
                    P = P * sgn
                    dist = P - h                                           # closest approach on each bar
                    at, away = dist <= ZONE * W, dist >= RESET * W
                    if not at.any():
                        continue
                    idx = np.arange(n)
                    pa = np.r_[-1, np.maximum.accumulate(np.where(at, idx, -1))[:-1]]
                    pw = np.r_[-1, np.maximum.accumulate(np.where(away, idx, -1))[:-1]]
                    starts = np.flatnonzero(at & ((pa < 0) | (pw > pa)))
                    n_touch_before, n_miss_before = 0, 0
                    for s0 in starts:
                        if s0 > 0 and dist[s0 - 1] <= 0:       # already beyond (not an inside approach)
                            continue
                        cap = min(n - 1, s0 + CAP)
                        tb = first(dist[s0:cap + 1] <= 0); tb = s0 + tb if tb < NO else NO
                        rt = first(away[s0 + 1:cap + 1]); rt = s0 + 1 + rt if rt < NO else NO
                        end = min(tb, rt, cap)
                        outc = "touch" if tb <= min(rt, cap) else ("retreat" if rt < NO and rt <= cap else "neither")
                        pre = dist[s0:min(end, tb)] if tb > s0 else np.array([0.0])
                        closest = float(max(pre.min(), 0.0)) if len(pre) else 0.0
                        kc = s0 + int(np.argmin(pre)) if len(pre) else s0
                        srem60 = sd * sqrt(max(cw[min(n, kc + 61)] - cw[kc + 1], 1e-12))
                        reach010 = bool(len(pre) and pre.min() <= 0.10 * W)
                        tod = int(mn[s0])
                        ep = [sym, dt, kind, fam, ln, tau, s0, tod, outc, end - s0, closest / W, closest / srem60,
                              closest / tick, reach010, n_touch_before, n_miss_before,
                              vr[sq][i], rng_used[s0] / W]
                        # ---- execution methods (per episode)
                        cost = 2.5 * tick / u
                        through = (first(h[tb:min(n, tb + CAP + 1)] >= P[tb] + u) < NO) if tb < NO else False
                        # A: touch
                        if tb < NO:
                            a_f = bracket(h, l, c, tb, P[tb], u, n, True, True)
                            a_c = bracket(h, l, c, tb, P[tb], u, n, False, True)
                        else:
                            a_f = a_c = (np.nan,) * 4
                        # B: fixed proximity limits
                        bres = []
                        for x in XS:
                            kx = first(dist[s0:end + 1] <= x * W)
                            if kx < NO:
                                kx += s0
                                F = P[kx] - x * W
                                bres += [kx, *bracket(h, l, c, kx, F, u, n, True, True)[:2]]
                            else:
                                bres += [np.nan, np.nan, np.nan]
                        # C: sigma-remaining proximity (moving)
                        cres = []
                        sr30 = sd * np.sqrt(np.maximum(cw[np.minimum(np.arange(n) + 31, n)] - cw[np.arange(n) + 1], 1e-12))
                        for kk in KS:
                            Lc = P - kk * sr30
                            kx = first(h[s0:end + 1] >= Lc[s0:end + 1])
                            if kx < NO:
                                kx += s0
                                F = Lc[kx]
                                bres_c = bracket(h, l, c, kx, F, u, n, True, True)
                                cres += [kx, bres_c[0], bres_c[1]]
                            else:
                                cres += [np.nan, np.nan, np.nan]
                        EP.append(ep + [tb if tb < NO else -1, through, u / sig, cost] + list(a_f) + list(a_c) + bres + cres)
                        # ---- states (pre-touch)
                        if kind == "line" or True:
                            done = set()
                            for x in XS:
                                k = first(dist[s0:min(end, tb)] <= x * W) if tb > s0 else NO
                                if k >= NO:
                                    continue
                                k += s0
                                if k in done:
                                    continue
                                done.add(k)
                                d = P[k] - c[k]
                                if d <= 0:
                                    continue
                                sr60 = sd * sqrt(max(cw[min(n, k + 61)] - cw[k + 1], 1e-12))
                                def mv(mm):
                                    a = max(k - mm, 0)
                                    return c[k] - c[a], sd * sqrt(max(cw[k + 1] - cw[a + 1], 1e-12))
                                m5, s5 = mv(5); m15, s15 = mv(15); m30, s30 = mv(30)
                                fp0, fpd = [], []
                                for T in TS:
                                    sT = sd * sqrt(max(cw[min(n, k + 1 + T)] - cw[k + 1], 1e-12))
                                    fp0.append(float(fpt(d, sT, 0.0)))
                                    muT = m30 * (sT ** 2 / max(s30 ** 2, 1e-12)) if s30 > 0 else 0.0
                                    muT = float(np.clip(muT, -3 * sT, 3 * sT))
                                    fpd.append(float(fpt(d, sT, muT)))
                                reach = [float(tb <= k + T) for T in TS]
                                retreat = float(outc == "retreat")
                                cthru = float(tb < NO and through and tb <= k + CAP)
                                rf = bracket(h, l, c, k, c[k], u, n, True, False)
                                rc = bracket(h, l, c, k, c[k], u, n, False, False)
                                lim = min(k + 10, (tb - 1) if tb < NO else n - 1, n - 1)
                                jf = first((c[k + 1:lim + 1] < op[k + 1:lim + 1])); jf = k + 1 + jf if jf < NO else -1
                                jc = first((c[k + 1:lim + 1] > op[k + 1:lim + 1])); jc = k + 1 + jc if jc < NO else -1
                                ef = bracket(h, l, c, jf, c[jf], u, n, True, False)[0] if jf >= 0 else np.nan
                                ec = bracket(h, l, c, jc, c[jc], u, n, False, False)[0] if jc >= 0 else np.nan
                                f15 = (c[min(n - 1, k + 15)] - c[k]) / sd
                                f30 = (c[min(n - 1, k + 30)] - c[k]) / sd
                                ST.append([sym, dt, kind, fam, ln, tau, s0, k, x, int(mn[k]), d / sr60, d / W, d / tick,
                                           m5 / s5 if s5 > 0 else 0.0, m15 / s15 if s15 > 0 else 0.0,
                                           m30 / s30 if s30 > 0 else 0.0, (m5 - m30 / 6) / sd,
                                           vr[sq][i], (c[k] - vw[k]) / sd, rng_used[k] / W, n_touch_before,
                                           n_miss_before, (np.sign(pr) == sgn) if np.isfinite(pr) else np.nan]
                                          + fp0 + fpd + reach + [retreat, cthru, rf[0], rf[1], rf[2], rf[3], rc[0],
                                                                 jf - k if jf >= 0 else -1, ef,
                                                                 jc - k if jc >= 0 else -1, ec, f15, f30, cost,
                                                                 outc])
                        # ---- competing-risk hazard counts (minute after episode start)
                        if end > s0:
                            seg = np.arange(s0, end)
                            zs = (P[seg] - h[seg]) / (sd * np.sqrt(np.maximum(cw[np.minimum(seg + 61, n)] - cw[seg + 1], 1e-12)))
                            mom = (c[seg] - c[np.maximum(seg - 15, 0)]) / sd
                            zb = np.digitize(np.maximum(zs, 0), ZB) - 1
                            mb = np.digitize(mom, [0.0, 0.1]) if True else 0
                            eb = np.digitize(seg - s0, EB) - 1
                            tb_ = np.digitize(mn[seg], [420, 600, 780, 960])
                            evt = np.zeros(len(seg), int)
                            if outc == "touch":
                                evt[-1] = 1
                            elif outc == "retreat":
                                evt[-1] = 2
                            for key in zip(zb, mb, eb, tb_, evt):
                                kk = (kind,) + tuple(int(v) for v in key[:4])
                                a = haz.setdefault(kk, [0, 0, 0])
                                a[0] += 1
                                if key[4]:
                                    a[key[4]] += 1
                        # ---- Brownian bridge (line only): consecutive closes both below the line
                        if kind == "line" and end > s0 + 1:
                            seg = np.arange(max(s0, 1), end + 1)
                            for sp, slot in ((1, 0), (5, 1)):
                                sg2 = seg[seg >= sp]
                                if not len(sg2):
                                    continue
                                a0, a1 = P[sg2] - c[sg2 - sp], P[sg2] - c[sg2]
                                ok = (a0 > 0) & (a1 > 0)
                                if not ok.any():
                                    continue
                                var = sd ** 2 * np.maximum(cw[sg2 + 1] - cw[sg2 - sp + 1], 1e-12)
                                pbr = np.exp(-2 * a0 * a1 / var)[ok]
                                if sp == 1:
                                    act = (h[sg2] >= P[sg2])[ok]
                                else:
                                    hm = np.array([h[t - sp + 1:t + 1].max() for t in sg2[ok]])
                                    act = hm >= P[sg2][ok]
                                bi = np.clip(np.digitize(pbr, PB) - 1, 0, len(PB) - 2)
                                np.add.at(br1[slot, :, 0], bi, 1)
                                np.add.at(br1[slot, :, 1], bi, pbr)
                                np.add.at(br1[slot, :, 2], bi, act.astype(float))
                        if outc == "touch":
                            n_touch_before += 1
                        elif outc == "retreat":
                            n_miss_before += 1
    epc = (["sym", "date", "kind", "family", "line", "tier", "start", "minute", "outcome", "dur", "closest_W",
            "closest_Z", "closest_ticks", "reach010", "touches_before", "misses_before", "vol_reg", "consumed",
            "touch_bar", "through", "u_over_sig", "cost_R"]
           + [f"A_fade_{a}" for a in ("R", "hold", "mfe60", "mae60")] + [f"A_cont_{a}" for a in ("R", "hold", "mfe60", "mae60")]
           + [f"B{int(x * 100)}_{a}" for x in XS for a in ("bar", "R", "hold")]
           + [f"C{kk:g}_{a}" for kk in KS for a in ("bar", "R", "hold")])
    stc = (["sym", "date", "kind", "family", "line", "tier", "start", "bar", "x", "minute", "z60", "dW", "dticks",
            "vel5", "vel15", "vel30", "momdet", "vol_reg", "vwap_dev", "consumed", "touches_before", "misses_before",
            "trend_agree"] + [f"fp0_{T}" for T in TS] + [f"fpd_{T}" for T in TS] + [f"reach{T}" for T in TS]
           + ["retreat", "cont_through", "R_fade", "hold_fade", "mfe60_fade", "mae60_fade", "R_follow",
              "conf_fade_lag", "R_fade_conf", "conf_follow_lag", "R_follow_conf", "fwd15", "fwd30", "cost_R", "ep_outcome"])
    E = pd.DataFrame(EP, columns=epc); S = pd.DataFrame(ST, columns=stc)
    E["tick"] = S["tick"] = tick
    E.to_parquet(OUT / "episodes" / f"{sym}.parquet"); S.to_parquet(OUT / "states" / f"{sym}.parquet")
    Hz = pd.DataFrame([(k[0], k[1], k[2], k[3], k[4], *v) for k, v in haz.items()],
                      columns=["kind", "zb", "mb", "eb", "todb", "at_risk", "touch", "retreat"])
    Hz["sym"] = sym
    Hz.to_parquet(OUT / "agg" / f"hazard_{sym}.parquet")
    np.save(OUT / "agg" / f"bridge_{sym}.npy", br1)
    pd.DataFrame(ar).T.set_axis(["n", "sx", "sy", "sxx", "sxy"], axis=1).assign(sym=sym).to_csv(OUT / "agg" / f"ar1_{sym}.csv")
    ln = E[E.kind == "line"]
    return f"{sym}: {len(ln)} line episodes, touch {np.mean(ln.outcome == 'touch'):.3f} retreat {np.mean(ln.outcome == 'retreat'):.3f}; {len(S)} states"


def main():
    for d in ("episodes", "states", "agg"):
        (OUT / d).mkdir(parents=True, exist_ok=True)
    args = sys.argv[1:]
    J = args or [s for s in LCE.RF.syms() if not (OUT / "episodes" / f"{s}.parquet").exists()]
    print(f"{len(J)} jobs", flush=True)
    with ProcessPoolExecutor(max_workers=5) as ex:
        for msg in ex.map(run, J):
            print(msg, flush=True)


if __name__ == "__main__":
    main()
