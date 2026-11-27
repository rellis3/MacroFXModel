"""gold-line-target-stop (forge/GOLD_LINE_TARGET_STOP_PREREG.md, pushed fea07968).

Entry = gold-band-fade-stop's arm-then-retest mechanism, unchanged. Lines = shadow N7_ALL OH/OL at P75/P90.
Grid = stop f in {0.15,0.25,0.35} x P90 distance  x  target T1..T6  x  break-even at +1R on/off.

    python scripts/gold-line-target-stop/run.py control      positive control: parent A2 reproduced
    python scripts/gold-line-target-stop/run.py gold         part G: 36 cells on GC (+ PL1 placebo, gold CFD check)
    python scripts/gold-line-target-stop/run.py wide         part W: all cells on the 17 other futures + PL1 for the gold-selected cell
"""
from __future__ import annotations

import importlib.util
import json
import sys
import warnings
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd
from numba import njit

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts/ladder-v2"))
import ladder as L  # noqa: E402

OUT = ROOT / "analysis/output/gold-line-target-stop"
WD = OUT / "widths"
SEED, B, BLOCK = 20261127, 2000, 63
NPERM_G, NPERM_W = 200, 100
FS = (0.15, 0.25, 0.35)
TGTS = ("T1_vwap+1s", "T2_vwap+0.5s", "T3_vwap", "T4_p50", "T5_open", "T6_none")
NHIST = 20
TGT, STP, TIME, GAP, BEX = 0, 1, 2, 3, 4
HALVES = ((2020, 2022), (2023, 2026))
CLASS = {**{s: "FX" for s in ("EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF")},
         **{s: "index" for s in ("NQ", "SPX500", "US30", "US2000", "DE30")},
         **{s: "metal" for s in ("GOLD", "SILVER", "PLATINUM", "COPPER")}, **{s: "energy" for s in ("WTI", "BRENT")}}
CELLS = [(f, t, be) for f in FS for t in range(6) for be in (0, 1)]


def cname(c):
    f, t, be = c
    return f"f{f:.2f}|{TGTS[t]}|BE{'on' if be else 'off'}"


@njit(cache=True)
def sim_day(O, H, Lo, C, VB, sv, lines, p50, s_side, sess_open, pess, mode, be, slip_in, slip_out, comm, flat, out, cnt):
    """As gold-band-fade-stop sim_day (arm, retest fill, cancel 1.2s, chase), with the target chosen by `mode`
    (0 VWAP+1sv, 1 VWAP+0.5sv, 2 VWAP, 3 same-side P50, 4 open, 5 none) fixed at the fill bar, and break-even at +1R.
    out[i] = (side, k, entry, exit, s, outcome, netR, notgt). cnt = [armed, chased, cancelled, filled]."""
    n = O.shape[0]
    nL = lines.shape[1]
    spent = np.zeros((2, nL), np.bool_)
    armed = np.array([-1, -1])
    armbar = np.array([-1, -1])
    inpos = False
    pside = 0; pk = 0; entry = 0.0; s = 0.0; SP = 0.0; TP = 0.0; moved = False; notgt = 0
    nt = 0
    for j in range(n):
        if inpos:
            ex = np.nan; oc = -1
            stop_code = BEX if moved else STP
            if pside == 0:
                if O[j] >= SP:
                    ex = O[j]; oc = GAP if not moved else BEX
                else:
                    hs = H[j] >= SP; ht = Lo[j] <= TP
                    if pess:
                        if hs: ex = SP; oc = stop_code
                        elif ht: ex = TP; oc = TGT
                    else:
                        if ht: ex = TP; oc = TGT
                        elif hs: ex = SP; oc = stop_code
            else:
                if O[j] <= SP:
                    ex = O[j]; oc = GAP if not moved else BEX
                else:
                    hs = Lo[j] <= SP; ht = H[j] >= TP
                    if pess:
                        if hs: ex = SP; oc = stop_code
                        elif ht: ex = TP; oc = TGT
                    else:
                        if ht: ex = TP; oc = TGT
                        elif hs: ex = SP; oc = stop_code
            if oc < 0 and j == n - 1:
                ex = C[j]; oc = TIME
            if oc >= 0:
                g = (entry - ex) if pside == 0 else (ex - entry)
                cost = slip_in + comm + flat + (0.0 if oc == TGT else slip_out)
                out[nt, 0] = pside; out[nt, 1] = pk; out[nt, 2] = entry; out[nt, 3] = ex; out[nt, 4] = s
                out[nt, 5] = oc; out[nt, 6] = (g - cost) / s; out[nt, 7] = notgt
                nt += 1
                inpos = False
            elif be == 1 and not moved:                    # BE: trigger on this bar, effective from the next bar
                if (pside == 0 and Lo[j] <= entry - s) or (pside == 1 and H[j] >= entry + s):
                    SP = entry; moved = True
            continue
        filled = False
        for side in range(2):
            if filled:
                break
            sd = s_side[side]
            a = 0.10 * sd
            best = -1
            for k in range(nL):
                if spent[side, k]:
                    continue
                lv = lines[side, k]
                if (side == 0 and H[j] >= lv + a) or (side == 1 and Lo[j] <= lv - a):
                    best = k
            if best >= 0 and best > armed[side]:
                if armed[side] >= 0:
                    cnt[1] += 1
                for k in range(best):
                    spent[side, k] = True
                armed[side] = best; armbar[side] = j
                cnt[0] += 1
            if armed[side] < 0:
                continue
            k = armed[side]; lv = lines[side, k]
            same = armbar[side] == j
            if side == 0:
                hit_c = H[j] >= lv + 1.2 * sd; hit_f = (C[j] <= lv) if same else (Lo[j] <= lv)
            else:
                hit_c = Lo[j] <= lv - 1.2 * sd; hit_f = (C[j] >= lv) if same else (H[j] >= lv)
            if hit_c and (not hit_f or not pess):
                spent[side, k] = True; armed[side] = -1; cnt[2] += 1
                continue
            if not hit_f:
                continue
            e = lv
            if armbar[side] < j:
                if side == 0 and O[j] < lv: e = O[j]
                if side == 1 and O[j] > lv: e = O[j]
            # ---- fill ----
            spent[side, k] = True
            cnt[3] += 1
            for o2 in range(2):
                if armed[o2] >= 0 and o2 != side:
                    spent[o2, armed[o2]] = True
                armed[o2] = -1
            inpos = True; filled = True; moved = False
            pside = side; pk = k; entry = e; s = sd
            sg = 1.0 if side == 0 else -1.0                 # short: bands above VWAP; long: below
            if mode == 0: tp = VB[j] + sg * sv
            elif mode == 1: tp = VB[j] + sg * 0.5 * sv
            elif mode == 2: tp = VB[j]
            elif mode == 3: tp = p50[side]
            elif mode == 4: tp = sess_open
            else: tp = np.nan
            notgt = 0
            if side == 0:
                SP = e + sd
                if not (np.isfinite(tp) and tp < e):
                    tp = -1e18; notgt = 1 if mode != 5 else 0
            else:
                SP = e - sd
                if not (np.isfinite(tp) and tp > e):
                    tp = 1e18; notgt = 1 if mode != 5 else 0
            TP = tp
            ex = np.nan; oc = -1
            if side == 0:
                hs = H[j] >= SP; ht = Lo[j] <= TP; cs = C[j] >= SP
            else:
                hs = Lo[j] <= SP; ht = H[j] >= TP; cs = C[j] <= SP
            if pess:
                if hs: ex = SP; oc = STP
                elif ht: ex = TP; oc = TGT
            else:
                if ht: ex = TP; oc = TGT
                elif cs: ex = SP; oc = STP
            if oc < 0 and j == n - 1:
                ex = C[j]; oc = TIME
            if oc >= 0:
                g = (entry - ex) if side == 0 else (ex - entry)
                cost = slip_in + comm + flat + (0.0 if oc == TGT else slip_out)
                out[nt, 0] = side; out[nt, 1] = k; out[nt, 2] = entry; out[nt, 3] = ex; out[nt, 4] = s
                out[nt, 5] = oc; out[nt, 6] = (g - cost) / s; out[nt, 7] = notgt
                nt += 1
                inpos = False
    return nt


# ------------------------------------------------------------------ data
def tick_of(px):
    u = np.unique(np.round(px[np.isfinite(px)], 8))
    d = np.diff(u)
    d = d[d > 1e-9]
    return float(np.quantile(d, 0.01)) if len(d) else np.nan


def sessions(sym, track="F"):
    """date -> (O, H, L, C, VB, sv, tick). VWAP / sigma_v exactly as scripts/jordan-vwap-band-tp/run.py."""
    m = L.load_m1(sym, track, "unadj")
    inv = track == "F" and L.SYMS[sym]["invert"]
    if track == "F":
        raw = pd.read_parquet(L.m1_paths(sym, "F", "unadj"), columns=["timestamp", "volume", "close"])
        raw.index = pd.to_datetime(raw.pop("timestamp"), utc=True) - pd.Timedelta(minutes=1)
        raw = raw[~raw.index.duplicated()]
        m["volume"] = raw["volume"].reindex(m.index).fillna(0).astype(float)
        tick_raw = tick_of(raw["close"].to_numpy(float)[-200000:])
    else:
        m["volume"] = np.nan
        tick_raw = np.nan
    lt = m.index.tz_convert("Europe/London")
    keep = (lt.hour < 22) & (lt.dayofweek < 5)
    m, lt = m[keep], lt[keep]
    di = pd.Index(lt.tz_localize(None).normalize())
    O, H, Lo, C, V = (m[c].to_numpy(float) for c in ("open", "high", "low", "close", "volume"))
    starts = np.flatnonzero(np.r_[True, di[1:] != di[:-1]])
    ends = np.r_[starts[1:], len(di)]
    hist, out = [], {}
    for s, e in zip(starts, ends):
        h, l, c, o, v = H[s:e], Lo[s:e], C[s:e], O[s:e], V[s:e]
        sv = float(np.median(hist[-NHIST:])) if len(hist) >= NHIST else np.nan
        if track == "F":
            hl3 = (h + l + c) / 3
            cv = np.cumsum(v)
            run_ = np.where(cv > 0, np.cumsum(hl3 * v) / np.maximum(cv, 1e-12), np.nan)
            ok = np.isfinite(run_)
            if ok.sum() > 1:
                hist.append(float(np.sqrt(np.mean((hl3[ok] - run_[ok]) ** 2))))
            vb = np.r_[np.nan, run_[:-1]]
        else:
            vb = np.full(e - s, np.nan)
        if e - s < 600:
            continue
        tk = tick_raw * o[0] ** 2 if inv else tick_raw     # inverted quote: d(1/p) = dp * (1/p)^2
        out[di[s]] = (np.ascontiguousarray(o), np.ascontiguousarray(h), np.ascontiguousarray(l), np.ascontiguousarray(c),
                      np.ascontiguousarray(vb), sv, tk)
    return out, tick_raw


def widths(sym):
    W = pd.read_parquet(WD / f"F_{sym}.parquet")
    W["date"] = pd.to_datetime(W["date"])
    return W


def costs(sym, track, tk):
    if sym == "GOLD":
        return (0.10, 0.10, 0.12, 0.0) if track == "F" else (0.0, 0.0, 0.0, 0.40)
    return (tk, tk, tk, 0.0)


# ------------------------------------------------------------------ one cell
def run_cell(sym, track, D, W, cell, pess=True, perm=None, fixed_stop=None, need_vwap=True):
    f, mode, be = cell
    out = np.zeros((32, 8))
    cnt = np.zeros(4, np.int64)
    rows = []
    dates = W["date"].to_numpy()
    wh = W[["oh50", "oh75", "oh90"]].to_numpy(); wl = W[["ol50", "ol75", "ol90"]].to_numpy()
    src = np.arange(len(W)) if perm is None else perm
    for i, iw in enumerate(src):
        d = pd.Timestamp(dates[i])
        x = D.get(d)
        if x is None:
            continue
        h_, l_ = wh[iw], wl[iw]
        if not (np.all(np.isfinite(h_)) and np.all(np.isfinite(l_))):
            continue
        O, H, Lo, C, VB, sv, tk = x
        if need_vwap and not (np.isfinite(sv) and sv > 0):
            continue
        si, so, cm, fl = costs(sym, track, tk)
        op = O[0]
        lines = np.vstack([op * (1 + h_[1:] / 100), op * (1 - l_[1:] / 100)])
        p50 = np.array([op * (1 + h_[0] / 100), op * (1 - l_[0] / 100)])
        ss = (np.array([fixed_stop, fixed_stop]) if fixed_stop else
              f * np.array([op * h_[2] / 100, op * l_[2] / 100]))
        nt = sim_day(O, H, Lo, C, VB, sv if np.isfinite(sv) else 0.0, lines, p50, ss, op, pess, mode, be,
                     si, so, cm, fl, out, cnt)
        for r in out[:nt]:
            rows.append((d, int(r[0]), int(r[1]), r[2], r[3], r[4], int(r[5]), r[6], int(r[7])))
        if nt == 0:
            rows.append((d, -1, -1, np.nan, np.nan, np.nan, -1, np.nan, 0))
    X = pd.DataFrame(rows, columns=["date", "side", "k", "entry", "exit", "s", "oc", "R", "notgt"])
    return X, dict(zip(["armed", "chased", "cancelled", "filled"], cnt.tolist()))


def per_session(X):
    g = X.groupby("date")
    return g["R"].sum(min_count=1).fillna(0.0), g["R"].count()


def boot_rs(r, n, rng, years):
    N = len(r); nb = int(np.ceil(N / BLOCK)); vals = np.empty(B)
    for b in range(B):
        st = rng.integers(0, N - BLOCK + 1, nb)
        ii = (st[:, None] + np.arange(BLOCK)).ravel()[:N]
        vals[b] = r[ii].sum() / max(n[ii].sum(), 1)
    pt = r.sum() / max(n.sum(), 1)
    hv = [float(r[(years >= a) & (years <= z)].sum() / max(n[(years >= a) & (years <= z)].sum(), 1)) for a, z in HALVES]
    return float(pt), np.percentile(vals, [5, 95]).tolist(), float(np.mean(vals <= 0)), hv


def summ(X):
    t = X[X.R.notna()]
    if not len(t):
        return {"trades": 0}
    yrs = t.date.dt.year
    return {"trades": int(len(t)), "meanR": float(t.R.mean()), "win%": float(100 * (t.R > 0).mean()),
            "target%": float(100 * (t.oc == TGT).mean()), "stop%": float(100 * t.oc.isin([STP, GAP]).mean()),
            "be%": float(100 * (t.oc == BEX).mean()), "time%": float(100 * (t.oc == TIME).mean()),
            "no_target%": float(100 * t.notgt.mean()),
            "avg_win_R": float(t.R[t.R > 0].mean()) if (t.R > 0).any() else np.nan,
            "avg_loss_R": float(t.R[t.R <= 0].mean()) if (t.R <= 0).any() else np.nan,
            "half_2020_22": float(t.R[yrs <= 2022].mean()), "half_2023_26": float(t.R[yrs >= 2023].mean()),
            "by_year": {int(y): round(float(v), 4) for y, v in t.R.groupby(yrs).mean().items()}}


def perms(W, rng, nperm):
    yrs = W["year"].to_numpy()
    base = np.arange(len(W))
    P = []
    for _ in range(nperm):
        p = base.copy()
        for y in np.unique(yrs):
            m = yrs == y
            p[m] = rng.permutation(base[m])
        P.append(p)
    return P


def bh(p, q=0.10):
    p = np.asarray(p); o = np.argsort(p); m = len(p)
    passed = p[o] <= q * np.arange(1, m + 1) / m
    k = np.max(np.flatnonzero(passed)) + 1 if passed.any() else 0
    out = np.zeros(m, bool); out[o[:k]] = True
    return out


# ------------------------------------------------------------------ commands
def cmd_control():
    """Parent A2 (fixed $7.50, open target, BE off) on the parent's sample (no sigma_v requirement)."""
    D, _ = sessions("GOLD")
    W = widths("GOLD")
    X, cnt = run_cell("GOLD", "F", D, W, (0.0, 4, 0), fixed_stop=7.50, need_vwap=False)
    parent = json.loads((ROOT / "analysis/output/gold-band-fade-stop/results.json").read_text())["arms"]["A2"]
    m = X.R.mean()
    print(f"control: A2 rebuilt {m:+.5f} on {X.R.notna().sum()} trades; parent {parent['meanR']:+.5f} on "
          f"{parent['summary']['trades']} trades; counts {cnt} vs parent {parent['counts']}")
    ok = abs(m - parent["meanR"]) < 5e-4 and X.R.notna().sum() == parent["summary"]["trades"]
    print("POSITIVE CONTROL", "PASS" if ok else "FAIL")
    return ok


def cmd_gold():
    OUT.mkdir(parents=True, exist_ok=True)
    if not cmd_control():
        raise SystemExit("positive control failed")
    rng = np.random.default_rng(SEED)
    D, _ = sessions("GOLD")
    DC, _ = sessions("GOLD", "C")
    W = widths("GOLD")
    P = perms(W, np.random.default_rng(SEED + 1), NPERM_G)
    res = {"seed": SEED, "cells": {}}
    pv = []
    for c in CELLS:
        X, cnt = run_cell("GOLD", "F", D, W, c)
        r, n = per_session(X)
        yrs = np.array([d.year for d in r.index])
        pt, ci, p, hv = boot_rs(r.to_numpy(), n.to_numpy(), rng, yrs)
        pl = [run_cell("GOLD", "F", D, W, c, perm=pp)[0].R.mean() for pp in P]
        opt = summ(run_cell("GOLD", "F", D, W, c, pess=False)[0])
        cfd = summ(run_cell("GOLD", "C", DC, W, c, need_vwap=False)[0]) if c[1] >= 3 else None
        res["cells"][cname(c)] = {"meanR": pt, "ci90": ci, "p": p, "halves": hv, "pl1_mean": float(np.mean(pl)),
                                  "pl1_p95": float(np.percentile(pl, 95)), "summary": summ(X), "counts": cnt,
                                  "optimistic": opt, "cfd": cfd}
        pv.append(p)
        print(f"{cname(c):28s} {pt:+.3f} [{ci[0]:+.3f},{ci[1]:+.3f}] halves {hv[0]:+.3f}/{hv[1]:+.3f} "
              f"PL1 p95 {np.percentile(pl, 95):+.3f} n {X.R.notna().sum()} tgt {summ(X)['target%']:.0f}% "
              f"CFD {cfd['meanR'] if cfd else float('nan'):+.3f}", flush=True)
    ok = bh(pv)
    for c, b in zip(CELLS, ok):
        A = res["cells"][cname(c)]
        A["bh"] = bool(b)
        cfd_ok = A["cfd"] is None or A["cfd"].get("meanR", -1) > 0
        if A["ci90"][1] < 0.05:
            A["verdict"] = "NULL"
        elif A["ci90"][0] > 0 and b and min(A["halves"]) > 0 and A["meanR"] > A["pl1_p95"] and cfd_ok:
            A["verdict"] = "VALIDATED"
        else:
            A["verdict"] = "UNDERPOWERED"
    best = max(CELLS, key=lambda c: res["cells"][cname(c)]["meanR"])
    res["gold_selected_cell"] = cname(best)
    res["gold_selected_tuple"] = list(best)
    (OUT / "results_gold.json").write_text(json.dumps(res, indent=1, default=float), encoding="utf-8")
    print("gold-selected cell:", cname(best), res["cells"][cname(best)]["verdict"])


def wide_one(job):
    sym, sel = job
    try:
        D, tk = sessions(sym)
        W = widths(sym)
        res = {"sym": sym, "tick": tk, "cells": {}}
        ps = {}
        for c in CELLS:
            X, cnt = run_cell(sym, "F", D, W, c)
            r, n = per_session(X)
            ps[cname(c)] = pd.DataFrame({"r": r, "n": n})
            res["cells"][cname(c)] = {"summary": summ(X), "counts": cnt}
        sel = tuple(sel)
        P = perms(W, np.random.default_rng([SEED, sum(map(ord, sym))]), NPERM_W)
        pl = []
        for pp in P:
            X, _ = run_cell(sym, "F", D, W, sel, perm=pp)
            r, n = per_session(X)
            pl.append(pd.DataFrame({"r": r, "n": n}))
        return sym, res, ps, pl, None
    except Exception as e:  # noqa: BLE001
        import traceback
        return sym, None, None, None, f"{e}\n{traceback.format_exc()[-1500:]}"


def cmd_wide():
    G = json.loads((OUT / "results_gold.json").read_text())
    sel = G["gold_selected_tuple"]; seln = G["gold_selected_cell"]
    syms = [s for s in json.loads((ROOT / "js/ladderV2QlikeParams.json").read_text())["instruments"]
            if s != "GOLD" and (WD / f"F_{s}.parquet").exists()]
    missing = [s for s in json.loads((ROOT / "js/ladderV2QlikeParams.json").read_text())["instruments"]
               if s != "GOLD" and not (WD / f"F_{s}.parquet").exists()]
    print(f"{len(syms)} instruments; missing widths: {missing}; selected cell {seln}", flush=True)
    allres, PS, PL, fails = {}, {}, {}, {}
    with ProcessPoolExecutor(max_workers=4) as ex:
        for sym, res, ps, pl, err in ex.map(wide_one, [(s, sel) for s in syms]):
            if err:
                fails[sym] = err; print(sym, "FAILED", err[:300], flush=True); continue
            if not any(res["cells"][cname(c)]["summary"].get("trades", 0) for c in CELLS):
                fails[sym] = "no trades (no shadow widths on the M1 sample)"; print(sym, "no trades, excluded", flush=True); continue
            allres[sym], PS[sym], PL[sym] = res, ps, pl
            s = res["cells"][seln]["summary"]
            print(f"{sym}: selected {s.get('meanR', np.nan):+.3f} n {s.get('trades', 0)}", flush=True)
    rng = np.random.default_rng(SEED + 2)

    def pool(frames):
        frames = [f.astype(float) for f in frames if len(f)]
        idx = sorted(set().union(*[set(f.index) for f in frames]))
        r = np.zeros(len(idx)); n = np.zeros(len(idx))
        for f in frames:
            g = f.reindex(idx).fillna(0.0)
            r += g["r"].to_numpy(); n += g["n"].to_numpy()
        return r, n, np.array([d.year for d in idx])

    pooled = {}
    for c in CELLS:
        r, n, yrs = pool([PS[s][cname(c)] for s in PS])
        pt, ci, p, hv = boot_rs(r, n, rng, yrs)
        pos = float(np.mean([allres[s]["cells"][cname(c)]["summary"].get("meanR", -1) > 0 for s in PS]))
        pooled[cname(c)] = {"meanR": pt, "ci90": ci, "p": p, "halves": hv, "share_pos": pos, "trades": int(n.sum())}
    plm = []
    for k in range(NPERM_W):
        r, n, _ = pool([PL[s][k] for s in PL])
        plm.append(r.sum() / max(n.sum(), 1))
    S = pooled[seln]
    S["pl1_mean"] = float(np.mean(plm)); S["pl1_p95"] = float(np.percentile(plm, 95))
    if S["ci90"][1] < 0.05:
        v = "NULL"
    elif S["ci90"][0] > 0 and min(S["halves"]) > 0 and S["meanR"] > S["pl1_p95"] and S["share_pos"] >= 0.6:
        v = "VALIDATED"
    else:
        v = "UNDERPOWERED"
    S["verdict"] = v
    cls = {}
    for c in CELLS:
        for k in sorted(set(CLASS.get(s, "other") for s in PS)):
            mem = [s for s in PS if CLASS.get(s, "other") == k]
            r, n, _ = pool([PS[s][cname(c)] for s in mem])
            cls.setdefault(cname(c), {})[k] = {"meanR": float(r.sum() / max(n.sum(), 1)), "trades": int(n.sum()), "n_inst": len(mem)}
    out = {"seed": SEED, "selected": seln, "verdict_W": v, "pooled": pooled, "by_class": cls,
           "per_instrument": {s: {"tick": allres[s]["tick"], "cells": allres[s]["cells"]} for s in allres},
           "failed": fails, "missing_widths": missing}
    (OUT / "results_wide.json").write_text(json.dumps(out, indent=1, default=float), encoding="utf-8")
    print(f"W pooled {seln}: {S['meanR']:+.3f} [{S['ci90'][0]:+.3f},{S['ci90'][1]:+.3f}] halves "
          f"{S['halves'][0]:+.3f}/{S['halves'][1]:+.3f} PL1 p95 {S['pl1_p95']:+.3f} share+ {S['share_pos']:.2f} -> {v}")
    for c in CELLS:
        x = pooled[cname(c)]
        print(f"  {cname(c):28s} {x['meanR']:+.3f} [{x['ci90'][0]:+.3f},{x['ci90'][1]:+.3f}] share+ {x['share_pos']:.2f} n {x['trades']}")


if __name__ == "__main__":
    {"control": cmd_control, "gold": cmd_gold, "wide": cmd_wide}[sys.argv[1]]()
