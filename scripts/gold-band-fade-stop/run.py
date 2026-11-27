"""gold-band-fade-stop: the ForecastBandFade.cs mechanism (owner's PDF, no source) rebuilt from the document and run on
gold, 2020 -> 2026-08-21. Prereg: forge/GOLD_BAND_FADE_STOP_PREREG.md.

    python scripts/gold-band-fade-stop/run.py   -> analysis/output/gold-band-fade-stop/{RESULTS_raw.txt,results.json,trades_*.parquet}

Per session (00:00-22:00 London): forecast HIGH = open x (1 + OH width), LOW = open x (1 - OL width), at P75 and P90
(widths walk-forward, from scripts/gold-calc-upgrades/score.py). Short side: touch HIGH + arm margin -> sell-stop armed at
the line -> fill on the way back -> stop = line + s, target = session open; cancel if price runs to line + 1.2 s while
armed; chase to the further line. Long side mirrored. Two intrabar bounds (pessimistic = primary, optimistic).
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from numba import njit

ROOT = Path(__file__).resolve().parents[2]
sp = importlib.util.spec_from_file_location("g", ROOT / "scripts/gold-calc-upgrades/score.py")
G = importlib.util.module_from_spec(sp)
sp.loader.exec_module(G)
L = G.L
OUT = ROOT / "analysis/output/gold-band-fade-stop"
SEED, B, BLOCK, NPERM = 20261127, 2000, 63, 200
FIXED_STOP, SCALE_K = 7.50, 0.375
CALCS = {"F": {"export": ("HARCJ", "HARCJ"), "shadow": ("N7_ALL", "N7_ALL")},
         "C": {"export": ("R15", "HARCJ"), "shadow": ("N7_ALL", "N7_ALL")}}       # (OH column, OL column)
COST = {"F": (0.10, 0.10, 0.12, 0.0), "C": (0.0, 0.0, 0.0, 0.40)}             # entry slip, exit slip, commission, flat
ARMS = [("A1", "fixed", "export"), ("A2", "fixed", "shadow"), ("A3", "scaled", "export"), ("A4", "scaled", "shadow")]

# outcome codes
TGT, STP, TIME, GAP = 0, 1, 2, 3


@njit(cache=True)
def sim_day(O, H, Lo, C, lines, s_side, sess_open, pess, raw, tgt_fixed, slip_in, slip_out, comm, flat, out, cnt):
    """lines[side, k]: side 0 = short (HIGH lines, nearer -> further), side 1 = long (LOW lines). Writes trades into
    out[i] = (side, k, entry, exit, s, outcome, netR); cnt = [armed, chased, cancelled, filled]. Returns n trades."""
    n = O.shape[0]
    nL = lines.shape[1]
    spent = np.zeros((2, nL), np.bool_)
    armed = np.array([-1, -1])
    armbar = np.array([-1, -1])
    inpos = False
    pside = 0; pk = 0; entry = 0.0; s = 0.0; SP = 0.0; TP = 0.0
    nt = 0
    for j in range(n):
        if inpos:
            ex = np.nan; oc = -1
            if pside == 0:
                if O[j] >= SP:
                    ex = O[j]; oc = GAP
                else:
                    hs = H[j] >= SP; ht = Lo[j] <= TP
                    if pess:
                        if hs: ex = SP; oc = STP
                        elif ht: ex = TP; oc = TGT
                    else:
                        if ht: ex = TP; oc = TGT
                        elif hs: ex = SP; oc = STP
            else:
                if O[j] <= SP:
                    ex = O[j]; oc = GAP
                else:
                    hs = Lo[j] <= SP; ht = H[j] >= TP
                    if pess:
                        if hs: ex = SP; oc = STP
                        elif ht: ex = TP; oc = TGT
                    else:
                        if ht: ex = TP; oc = TGT
                        elif hs: ex = SP; oc = STP
            if oc < 0 and j == n - 1:
                ex = C[j]; oc = TIME
            if oc >= 0:
                g = (entry - ex) if pside == 0 else (ex - entry)
                cost = slip_in + comm + flat + (0.0 if oc == TGT else slip_out)
                out[nt, 0] = pside; out[nt, 1] = pk; out[nt, 2] = entry; out[nt, 3] = ex; out[nt, 4] = s
                out[nt, 5] = oc; out[nt, 6] = (g - cost) / s
                nt += 1
                inpos = False
            continue
        filled = False
        for side in range(2):
            if filled:
                break
            sd = s_side[side]
            a = 0.10 * sd
            if raw:
                for k in range(nL):
                    if spent[side, k]:
                        continue
                    lv = lines[side, k]
                    if (side == 0 and H[j] >= lv) or (side == 1 and Lo[j] <= lv):
                        spent[side, k] = True
                        cnt[0] += 1
                        armed[side] = k; armbar[side] = j
                        break
                if armed[side] < 0:
                    continue
                k = armed[side]; lv = lines[side, k]; e = lv
            else:
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
                # in the bar that armed it, the low is under the line just because the bar crossed it on the way up:
                # count a retest there only if the bar closes back through the line
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
                if armbar[side] < j:                       # stop order resting before this bar: gaps fill at the open
                    if side == 0 and O[j] < lv: e = O[j]
                    if side == 1 and O[j] > lv: e = O[j]
            # ---- fill ----
            spent[side, k] = True
            cnt[3] += 1
            for o2 in range(2):
                if armed[o2] >= 0 and o2 != side:
                    spent[o2, armed[o2]] = True
                armed[o2] = -1
            inpos = True; filled = True
            pside = side; pk = k; entry = e; s = sd
            if side == 0:
                SP = e + sd
                TP = (e - tgt_fixed) if tgt_fixed > 0 else min(sess_open, e)
            else:
                SP = e - sd
                TP = (e + tgt_fixed) if tgt_fixed > 0 else max(sess_open, e)
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
                out[nt, 5] = oc; out[nt, 6] = (g - cost) / s
                nt += 1
                inpos = False
    return nt


def sessions(track):
    m = L.load_m1("GOLD", track, "unadj")
    lt = m.index.tz_convert("Europe/London")
    m = m[(lt.hour < 22) & (lt.dayofweek < 5)]
    d = m.index.tz_convert("Europe/London").tz_localize(None).normalize()
    out = {}
    for k, g in m.groupby(d):
        if len(g) >= 600:
            out[k] = tuple(np.ascontiguousarray(g[c].to_numpy(float)) for c in ("open", "high", "low", "close"))
    return out


def widths(track):
    T, Q, masks, test, _ = G.run(track)
    W = {}
    for calc, (ohc, olc) in CALCS[track].items():
        W[calc] = {}
        for q, col in (("oh", ohc), ("ol", olc)):
            _, lvl = G.hits_and_gap(T, col, test, masks[q], q)
            W[calc][q] = np.vstack([lvl[50], lvl[75], lvl[90]]).T          # % of open, rows = T rows
    idx = np.flatnonzero(test)
    return T, idx, W


def run_arm(track, D, T, idx, W, calc, stop, pess=True, raw=False, tgt_fixed=0.0, tiers=(1, 2), perm=None):
    si, so, cm, fl = COST[track]
    trades = []
    cnt = np.zeros(4, np.int64)
    out = np.zeros((32, 7))
    src = idx if perm is None else perm
    for i, i_w in zip(idx, src):
        d = pd.Timestamp(T["date"].iat[i])
        if d not in D:
            continue
        wh, wl = W[calc]["oh"][i_w], W[calc]["ol"][i_w]
        if not (np.all(np.isfinite(wh)) and np.all(np.isfinite(wl))):
            continue
        O, H, Lo, C = D[d]
        op = O[0]
        t = list(tiers)
        lines = np.vstack([op * (1 + wh[t] / 100), op * (1 - wl[t] / 100)])
        if stop == "fixed":
            ss = np.array([FIXED_STOP, FIXED_STOP])
        else:
            ss = SCALE_K * np.array([op * wh[2] / 100, op * wl[2] / 100])
        nt = sim_day(O, H, Lo, C, lines, ss, op, pess, raw, tgt_fixed, si, so, cm, fl, out, cnt)
        for r in out[:nt]:
            trades.append((d, int(r[0]), int(r[1]), r[2], r[3], r[4], int(r[5]), r[6]))
        if nt == 0:
            trades.append((d, -1, -1, np.nan, np.nan, np.nan, -1, np.nan))   # keep the session for the bootstrap
    X = pd.DataFrame(trades, columns=["date", "side", "k", "entry", "exit", "s", "oc", "R"])
    return X, dict(zip(["armed", "chased", "cancelled", "filled"], cnt.tolist()))


def per_session(X):
    g = X.groupby("date")
    return g["R"].sum(min_count=1).fillna(0.0).to_numpy(), g["R"].count().to_numpy(), np.array([d.year for d in g.groups])


def boot(X, rng):
    r, n, yrs = per_session(X)
    N = len(r)
    nb = int(np.ceil(N / BLOCK))
    vals = np.empty(B)
    for b in range(B):
        st = rng.integers(0, N - BLOCK + 1, nb)
        ii = (st[:, None] + np.arange(BLOCK)).ravel()[:N]
        vals[b] = r[ii].sum() / max(n[ii].sum(), 1)
    pt = r.sum() / max(n.sum(), 1)
    return pt, np.percentile(vals, [5, 95]), float(np.mean(vals <= 0))


def summ(X):
    t = X[X.R.notna()]
    if not len(t):
        return {"trades": 0}
    yrs = t.date.dt.year
    usd = (t.R * t.s * 10)                                       # $ per MGC ($10 per $1)
    return {"trades": len(t), "meanR": t.R.mean(), "win%": 100 * (t.R > 0).mean(),
            "target%": 100 * (t.oc == TGT).mean(), "stop%": 100 * t.oc.isin([STP, GAP]).mean(),
            "time%": 100 * (t.oc == TIME).mean(), "avg_win_R": t.R[t.R > 0].mean(), "avg_loss_R": t.R[t.R <= 0].mean(),
            "stop_$_median": t.s.median(), "net_$_per_MGC_per_year": usd.sum() / max(yrs.nunique(), 1),
            "half_2020_22": t.R[yrs <= 2022].mean(), "half_2023_26": t.R[yrs >= 2023].mean()}


def bh(p, q=0.10):
    p = np.asarray(p); o = np.argsort(p); m = len(p)
    ok = np.zeros(m, bool)
    passed = [i for i in range(m) if p[o[i]] <= q * (i + 1) / m]
    if passed:
        ok[o[: max(passed) + 1]] = True
    return ok


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    res, lines_txt = {"seed": SEED, "arms": {}, "descriptive": {}}, []
    say = lambda s="": (print(s), lines_txt.append(s))
    data = {}
    for track in ("F", "C"):
        T, idx, W = widths(track)
        D = sessions(track)
        data[track] = (T, idx, W, D)
        say(f"track {track}: {len(idx)} test sessions, {sum(pd.Timestamp(T['date'].iat[i]) in D for i in idx)} with M1")

    T, idx, W, D = data["F"]
    pvals = []
    for aid, stop, calc in ARMS:
        X, cnt = run_arm("F", D, T, idx, W, calc, stop)
        X.to_parquet(OUT / f"trades_F_{aid}_pess.parquet")
        pt, ci, p = boot(X, rng)
        # PL1 shuffled lines: widths from another test day of the same year
        yrs = T["year"].to_numpy()[idx]
        perm_means = []
        prng = np.random.default_rng(SEED + 1)
        for _ in range(NPERM):
            perm = idx.copy()
            for y in np.unique(yrs):
                m = yrs == y
                perm[m] = prng.permutation(idx[m])
            Xp, _ = run_arm("F", D, T, idx, W, calc, stop, perm=perm)
            perm_means.append(Xp.R.mean())
        pl1_95 = float(np.percentile(perm_means, 95))
        Xr, cr = run_arm("F", D, T, idx, W, calc, stop, raw=True)
        Xo, co = run_arm("F", D, T, idx, W, calc, stop, pess=False)
        Tc, idc, Wc, Dc = data["C"]
        XC, cC = run_arm("C", Dc, Tc, idc, Wc, calc, stop)
        XCo, _ = run_arm("C", Dc, Tc, idc, Wc, calc, stop, pess=False)
        XC.to_parquet(OUT / f"trades_C_{aid}_pess.parquet")
        S = summ(X)
        res["arms"][aid] = {"stop": stop, "calc": calc, "meanR": pt, "ci90": ci.tolist(), "p": p, "counts": cnt,
                            "summary": S, "pl1_mean": float(np.mean(perm_means)), "pl1_p95": pl1_95,
                            "pl2_raw": summ(Xr), "optimistic": summ(Xo), "cfd": summ(XC), "cfd_opt": summ(XCo),
                            "cfd_counts": cC}
        pvals.append(p)
        say(f"{aid} {stop}/{calc}: meanR {pt:+.3f} [{ci[0]:+.3f},{ci[1]:+.3f}] p={p:.3f} n={S['trades']} "
            f"halves {S['half_2020_22']:+.3f}/{S['half_2023_26']:+.3f} PL1 mean {np.mean(perm_means):+.3f} p95 {pl1_95:+.3f} "
            f"| raw {res['arms'][aid]['pl2_raw'].get('meanR', np.nan):+.3f} | opt {res['arms'][aid]['optimistic'].get('meanR', np.nan):+.3f} "
            f"| CFD {res['arms'][aid]['cfd'].get('meanR', np.nan):+.3f} (opt {res['arms'][aid]['cfd_opt'].get('meanR', np.nan):+.3f})")
    ok = bh(pvals)
    for (aid, _, _), b in zip(ARMS, ok):
        A = res["arms"][aid]; S = A["summary"]
        A["bh"] = bool(b)
        if A["ci90"][1] < 0.05:
            v = "NULL"
        elif (A["ci90"][0] > 0 and b and S["half_2020_22"] > 0 and S["half_2023_26"] > 0 and A["meanR"] > A["pl1_p95"]
              and A["cfd"].get("meanR", -1) > 0):
            v = "VALIDATED"
        else:
            v = "UNDERPOWERED"
        A["verdict"] = v
        say(f"{aid}: {v}")

    # descriptive variants on A1 (the document as written)
    for lab, kw in (("fixed $20 target", dict(tgt_fixed=20.0)), ("P50 lines added", dict(tiers=(0, 1, 2)))):
        X, c = run_arm("F", D, T, idx, W, "export", "fixed", **kw)
        res["descriptive"][lab] = {"summary": summ(X), "counts": c}
        say(f"A1 variant {lab}: {summ(X)}")
    X = pd.read_parquet(OUT / "trades_F_A1_pess.parquet")
    t = X[X.R.notna()]
    by = t.groupby([t.side.map({0: "short @HIGH", 1: "long @LOW"}), t.k.map({0: "P75", 1: "P90"})]).R.agg(["count", "mean"])
    say("A1 by side/level:\n" + by.round(3).to_string())
    byy = t.groupby(t.date.dt.year).agg(n=("R", "count"), meanR=("R", "mean"), stop_pct=("oc", lambda o: 100 * o.isin([STP, GAP]).mean()))
    say("A1 by year:\n" + byy.round(3).to_string())
    for aid in ("A3",):
        X = pd.read_parquet(OUT / f"trades_F_{aid}_pess.parquet"); t = X[X.R.notna()]
        byy = t.groupby(t.date.dt.year).agg(n=("R", "count"), meanR=("R", "mean"), stop_med=("s", "median"))
        say(f"{aid} by year:\n" + byy.round(3).to_string())
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=float), encoding="utf-8")
    (OUT / "RESULTS_raw.txt").write_text("\n".join(lines_txt), encoding="utf-8")


if __name__ == "__main__":
    main()
