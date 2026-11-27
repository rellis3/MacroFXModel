"""gold-line-system-base (forge/GOLD_LINE_SYSTEM_BASE_PREREG.md): 18 shadow lines + Jordan's gold entry (arm-retest,
the arm-E engine of gold-rolling-mae-window A2) + VWAP + 0.5 sigma_v target. S1 stop = 0.15 x open->P90; S2 = rolling MAE.

    python scripts/gold-line-system-base/run.py [SYM]       (default GOLD)
"""
from __future__ import annotations

import importlib.util
import json
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from numba import njit

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[2]


def _imp(name, rel):
    sp = importlib.util.spec_from_file_location(name, ROOT / rel)
    m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m); return m


R = _imp("rmw", "scripts/gold-rolling-mae-window/run.py")
E = _imp("rme", "scripts/gold-rolling-mae-window/run_entry.py")
LT = _imp("lts", "scripts/gold-line-target-stop/run.py")
LEVELS, SHORT_V, TIERS = E.LEVELS, E.SHORT_V, E.TIERS
NL = len(LEVELS)
SEED, B, BLOCK, NPERM = 20261127, 2000, 63, 100
IS_END, START = 2022, pd.Timestamp("2021-01-01")
TGT, STP, BEX, TIME = 0, 1, 2, 3
TNAMES = ("vwap+1s", "vwap+0.5s", "vwap", "line-inside")
OUT = None
tgt_at = E.tgt_at
LINES4 = np.array([l in ("oh75", "oh90", "ol75", "ol90") for l in LEVELS])


@njit(cache=False)
def manage(O, H, Lo, C, j, n, sh, SP, TP, fbar, moved):
    ex = np.nan; oc = -1
    if sh:
        if j > fbar and O[j] >= SP: ex = O[j]; oc = BEX if moved else STP
        elif H[j] >= SP: ex = SP; oc = BEX if moved else STP
        elif j > fbar and Lo[j] <= TP: ex = TP; oc = TGT
    else:
        if j > fbar and O[j] <= SP: ex = O[j]; oc = BEX if moved else STP
        elif Lo[j] <= SP: ex = SP; oc = BEX if moved else STP
        elif j > fbar and H[j] >= TP: ex = TP; oc = TGT
    if oc < 0 and j == n - 1:
        ex = C[j]; oc = TIME
    return ex, oc


@njit(cache=False)
def sim(O, H, Lo, C, VB, sv, P, short, S, sg, o, tmode, be, slip_in, slip_out, comm, out, cnt):
    """Arm E (identical arming / fill / cancel / chase to run_entry.sim kmode 0); target by tmode at the fill bar:
    0 VWAP+1sv, 1 VWAP+0.5sv, 2 VWAP, 3 the line inside (at the arming bar). out[i] = (k, entry, exit, S, oc, netR,
    grossR, armbar, fillbar, exitbar, tp, notgt)."""
    n = O.shape[0]
    nl = P.shape[0]
    spent = np.zeros(nl, np.bool_)
    for k in range(nl):
        if not np.isfinite(S[k]): spent[k] = True
    armed = np.array([-1, -1]); armbar = np.array([-1, -1]); alv = np.zeros(2); atp = np.zeros(2)
    inpos = False; sh = False; pk = 0; entry = 0.0; SP = 0.0; TP = 0.0; sd = 0.0; fbar = 0; moved = False; ab = 0; nog = 0
    nt = 0
    for j in range(n):
        if inpos:
            ex, oc = manage(O, H, Lo, C, j, n, sh, SP, TP, fbar, moved)
            if oc >= 0:
                g = (entry - ex) if sh else (ex - entry)
                cost = slip_in + comm + (0.0 if oc == TGT else slip_out)
                out[nt, 0] = pk; out[nt, 1] = entry; out[nt, 2] = ex; out[nt, 3] = sd; out[nt, 4] = oc
                out[nt, 5] = (g - cost) / sd; out[nt, 6] = g / sd; out[nt, 7] = ab; out[nt, 8] = fbar; out[nt, 9] = j
                out[nt, 10] = TP; out[nt, 11] = nog
                nt += 1; inpos = False
            elif be and not moved and j > fbar:
                if (sh and Lo[j] <= entry - sd) or ((not sh) and H[j] >= entry + sd):
                    SP = entry; moved = True
            continue
        fk = -1; fe = 0.0; ftp = 0.0; fab = 0
        for side in range(2):
            ss = side == 0
            best = -1; bp = 0.0
            for k in range(nl):
                if spent[k] or short[k] != ss: continue
                lv = P[k, j]; a = 0.10 * S[k]
                if (ss and H[j] >= lv + a) or ((not ss) and Lo[j] <= lv - a):
                    if best < 0 or (ss and lv > bp) or ((not ss) and lv < bp):
                        best = k; bp = lv
            if best >= 0:
                for k in range(nl):
                    if spent[k] or short[k] != ss: continue
                    lv = P[k, j]; a = 0.10 * S[k]
                    if (ss and H[j] >= lv + a) or ((not ss) and Lo[j] <= lv - a):
                        spent[k] = True
                if armed[side] < 0 or (ss and bp > alv[side]) or ((not ss) and bp < alv[side]):
                    if armed[side] >= 0: cnt[1] += 1
                    armed[side] = best; armbar[side] = j; alv[side] = bp
                    atp[side] = tgt_at(P, short, best, j, bp, sg, o)
                    cnt[0] += 1
            if armed[side] < 0: continue
            k = armed[side]; lv = alv[side]; s_ = S[k]; same = armbar[side] == j
            if ss:
                hit_c = H[j] >= lv + 1.2 * s_; hit_f = (C[j] <= lv) if same else (Lo[j] <= lv)
            else:
                hit_c = Lo[j] <= lv - 1.2 * s_; hit_f = (C[j] >= lv) if same else (H[j] >= lv)
            if hit_c and not hit_f:
                armed[side] = -1; cnt[2] += 1
                continue
            if not hit_f: continue
            e = lv
            if not same:
                if ss and O[j] < lv: e = O[j]
                if (not ss) and O[j] > lv: e = O[j]
            fk = k; fe = e; ftp = atp[side]; fab = armbar[side]
            break
        if fk < 0: continue
        cnt[3] += 1
        spent[fk] = True
        armed[0] = -1; armed[1] = -1
        inpos = True; sh = short[fk]; pk = fk; entry = fe; sd = S[fk]; fbar = j; moved = False; ab = fab
        SP = entry + sd if sh else entry - sd
        sgn = 1.0 if sh else -1.0
        if tmode == 0: tp = VB[j] + sgn * sv
        elif tmode == 1: tp = VB[j] + sgn * 0.5 * sv
        elif tmode == 2: tp = VB[j]
        else: tp = ftp
        nog = 0
        if sh:
            if not (np.isfinite(tp) and tp < entry): tp = -1e18; nog = 1
        else:
            if not (np.isfinite(tp) and tp > entry): tp = 1e18; nog = 1
        TP = tp
        ex, oc = manage(O, H, Lo, C, j, n, sh, SP, TP, fbar, moved)
        if oc >= 0:
            g = (entry - ex) if sh else (ex - entry)
            cost = slip_in + comm + (0.0 if oc == TGT else slip_out)
            out[nt, 0] = pk; out[nt, 1] = entry; out[nt, 2] = ex; out[nt, 3] = sd; out[nt, 4] = oc
            out[nt, 5] = (g - cost) / sd; out[nt, 6] = g / sd; out[nt, 7] = ab; out[nt, 8] = fbar; out[nt, 9] = j
            out[nt, 10] = TP; out[nt, 11] = nog
            nt += 1; inpos = False
    return nt


def prep(DV, W, perm=None):
    cols = {q: W[[f"{q}{t}" for t in TIERS]].to_numpy() for q in ("oh", "ol", "cup", "cdn", "hl")}
    sig = W["sig"].to_numpy(); dates = W["date"].to_numpy()
    src = np.arange(len(W)) if perm is None else perm
    S = []
    for si, iw in enumerate(src):
        d = pd.Timestamp(dates[si])
        x = DV.get(d)
        if x is None: continue
        O, H, Lo, C, VB, sv, _ = x
        if not (np.isfinite(sv) and sv > 0): continue
        if not all(np.all(np.isfinite(cols[q][iw])) for q in cols) or not np.isfinite(sig[iw]): continue
        o = O[0]
        P = E.build_P(H, Lo, o, {q: cols[q][iw] for q in cols})
        p90 = (o * cols["oh"][iw, 2] / 100, o * cols["ol"][iw, 2] / 100)
        S.append((si, d, O, H, Lo, C, VB, sv, P, sig[iw] / 100 * o, o, p90))
    return S


def stop_vec(kind, si, sg, p90, stops, sstops, floor):
    if kind == "S1":
        v = np.where(SHORT_V, 0.15 * p90[0], 0.15 * p90[1])
    elif kind == "S2":
        v = np.array([stops["3m"][l][si] for l in LEVELS])
    elif kind == "S2pooled":
        v = np.full(NL, stops["3m"]["all"][si])
    else:                                               # S2sig6m: pooled 6-month MAE/sigma ratio x today's sigma
        v = np.full(NL, sstops["6m"]["all"][si] * sg)
    return np.where(np.isfinite(v), np.maximum(v, floor), np.nan)


def run(sess, kind, tmode, be, stops, sstops, costs, floor, lines4=False):
    si_, so, cm = costs
    out = np.zeros((64, 12)); cnt = np.zeros(4, np.int64); rows = []
    for (si, d, O, H, Lo, C, VB, sv, P, sg, o, p90) in sess:
        S = stop_vec(kind, si, sg, p90, stops, sstops, floor)
        if lines4: S = np.where(LINES4, S, np.nan)
        nt = sim(O, H, Lo, C, VB, sv, P, SHORT_V, S, sg, o, tmode, be, si_, so, cm, out, cnt)
        for r in out[:nt]:
            rows.append((d, si) + tuple(r))
    X = pd.DataFrame(rows, columns=["date", "si", "k", "entry", "exit", "S", "oc", "R", "gR", "armbar", "fillbar",
                                    "exitbar", "tp", "notgt"])
    return X[X["date"] >= START].reset_index(drop=True), dict(zip(["armed", "chased", "cancelled", "filled"], cnt.tolist()))


def pval(X, seed):
    o_ = X[X["date"].dt.year > IS_END]
    g = o_.groupby("date")["R"]; r, nn = g.sum().to_numpy(), g.count().to_numpy()
    rng = np.random.default_rng(seed); N = len(r); nb = int(np.ceil(N / BLOCK)); bv = np.empty(B)
    for b in range(B):
        st = rng.integers(0, max(N - BLOCK + 1, 1), nb); ii = (st[:, None] + np.arange(BLOCK)).ravel()[:N] % N
        bv[b] = r[ii].sum() / nn[ii].sum()
    return float((bv <= 0).mean())


def summarise(X, rng, label):
    yr = X["date"].dt.year
    a = dict(arm=label)
    for lab, m in (("IS", yr <= IS_END), ("OOS", yr > IS_END)):
        pt, ci, n, tot = R.boot(X["date"][m].to_numpy(), X["R"][m].to_numpy(), rng)
        x = X[m]
        a.update({f"{lab}_R": pt, f"{lab}_lo": ci[0], f"{lab}_hi": ci[1], f"{lab}_n": n, f"{lab}_totR": tot,
                  f"{lab}_gross": float(x.gR.mean()),
                  f"{lab}_pf": float(x.R[x.R > 0].sum() / max(-x.R[x.R < 0].sum(), 1e-9))})
    o_ = X[yr > IS_END]
    a.update(OOS_win=100 * float((o_.R > 0).mean()), OOS_tgt=100 * float((o_.oc == TGT).mean()),
             OOS_stop=100 * float((o_.oc == STP).mean()), OOS_be=100 * float((o_.oc == BEX).mean()),
             OOS_time=100 * float((o_.oc == TIME).mean()), OOS_notgt=100 * float(o_.notgt.mean()),
             OOS_stop_med=float(o_.S.median()), trades_per_day=float(len(X) / max(X["date"].nunique(), 1)))
    eq = X.sort_values(["date", "fillbar"]).R.cumsum()
    a["maxDD"] = float((eq - eq.cummax()).min()) if len(eq) else 0.0
    return a


def main(sym="GOLD"):
    global OUT
    OUT = ROOT / "analysis/output/gold-line-system-base" / sym
    OUT.mkdir(parents=True, exist_ok=True)
    lines = []
    def say(s=""):
        print(s, flush=True); lines.append(s)
    W = pd.read_parquet(ROOT / f"analysis/output/gold-rolling-mae-window/widths/F_{sym}.parquet")
    W["date"] = pd.to_datetime(W["date"]); W = W.sort_values("date").reset_index(drop=True)
    DV, tick_raw = LT.sessions(sym)
    W = W[W["date"].isin(DV.keys())].reset_index(drop=True)
    nsess = len(W)
    Dold = {d: (x[1], x[2], x[3], float(x[0][0])) for d, x in DV.items()}
    tick = float(tick_raw)
    costs = (0.10, 0.10, 0.12) if sym == "GOLD" else (tick, tick, tick)
    floor = 5 * tick
    T = R.touches(Dold, W)
    stops = R.rolling_stops(T, nsess, "usd", wins=["3m"]); sstops = R.rolling_stops(T, nsess, "sig", wins=["6m"])
    sess = prep(DV, W)
    say(f"{sym}: {nsess} sessions with widths, {len(sess)} with VWAP history; tick {tick:g}; costs {costs}")

    rng = np.random.default_rng(SEED)
    arms, keep = [], {}
    for kind in ("S1", "S2", "S2pooled", "S2sig6m"):
        for tm in range(4):
            for be in (0, 1):
                X, cnt = run(sess, kind, tm, be, stops, sstops, costs, floor)
                lab = f"{kind}|{TNAMES[tm]}|BE{'on' if be else 'off'}"
                a = summarise(X, rng, lab); a.update(stop=kind, target=TNAMES[tm], be="on" if be else "off", lines="18",
                                                     **{f"n_{k}": v for k, v in cnt.items()})
                arms.append(a); keep[lab] = X
    for kind in ("S1", "S2"):
        X, cnt = run(sess, kind, 1, 0, stops, sstops, costs, floor, lines4=True)
        lab = f"{kind}|vwap+0.5s|BEoff|4lines"
        a = summarise(X, rng, lab); a.update(stop=kind, target="vwap+0.5s", be="off", lines="4", **{f"n_{k}": v for k, v in cnt.items()})
        arms.append(a); keep[lab] = X
    A = pd.DataFrame(arms)
    A.to_csv(OUT / "arms.csv", index=False)
    pd.set_option("display.width", 260)
    say("\nARMS:")
    say(A[["arm", "lines", "IS_R", "OOS_R", "OOS_lo", "OOS_hi", "OOS_n", "OOS_totR", "OOS_gross", "OOS_pf", "OOS_tgt",
           "OOS_stop", "OOS_notgt", "OOS_stop_med", "trades_per_day", "maxDD"]].round(3).to_string(index=False))

    # primaries + placebo
    prims = {"S1": "S1|vwap+0.5s|BEoff", "S2": "S2|vwap+0.5s|BEoff"}
    prng = np.random.default_rng(SEED + 1)
    yrsW = W["date"].dt.year.to_numpy()
    pl = {k: [] for k in prims}
    for p in range(NPERM):
        perm = np.arange(nsess)
        for y in np.unique(yrsW):
            m = yrsW == y
            perm[m] = prng.permutation(perm[m])
        Tp = R.touches(Dold, W, perm)
        spp = R.rolling_stops(Tp, nsess, "usd", wins=["3m"])
        sp_ = prep(DV, W, perm)
        for k, kind in (("S1", "S1"), ("S2", "S2")):
            Xp, _ = run(sp_, kind, 1, 0, spp, None, costs, floor)
            pl[k].append(float(Xp.R[Xp["date"].dt.year > IS_END].mean()))
        if p % 20 == 19: print(f"  placebo {p+1}/{NPERM}", flush=True)
    res = {"seed": SEED, "sym": sym, "primary": {}, "placebo_means": pl}
    ps = {k: pval(keep[lab], SEED + 2) for k, lab in prims.items()}
    order = sorted(ps, key=ps.get)
    bh_pass = {k: False for k in ps}
    for i, k in enumerate(order):                      # BH step-up over 2
        if ps[k] <= 0.10 * (i + 1) / len(order):
            for k2 in order[: i + 1]: bh_pass[k2] = True
    for k, lab in prims.items():
        a = A[A.arm == lab].iloc[0].to_dict()
        a["pl1_mean"] = float(np.mean(pl[k])); a["pl1_p95"] = float(np.percentile(pl[k], 95))
        a["pl1_rank"] = float((np.array(pl[k]) < a["OOS_R"]).mean())
        a["p_one_sided"] = ps[k]; a["bh"] = bh_pass[k]
        if a["OOS_hi"] < 0.05: v = "NULL"
        elif a["OOS_lo"] > 0 and a["IS_R"] > 0 and a["OOS_R"] > a["pl1_p95"] and a["OOS_totR"] > 0 and bh_pass[k]: v = "VALIDATED"
        else: v = "UNDERPOWERED"
        a["verdict"] = v
        res["primary"][k] = a
        say(f"\nPRIMARY {k} ({lab}): IS {a['IS_R']:+.3f} | OOS {a['OOS_R']:+.3f} [{a['OOS_lo']:+.3f},{a['OOS_hi']:+.3f}] "
            f"n {a['OOS_n']} total {a['OOS_totR']:+.1f}R gross {a['OOS_gross']:+.3f} PF {a['OOS_pf']:.2f} | placebo "
            f"{a['pl1_mean']:+.3f} p95 {a['pl1_p95']:+.3f} (real at {100*a['pl1_rank']:.0f}th pct) | p {ps[k]:.3f} BH {bh_pass[k]} -> {v}")
    json.dump(res, open(OUT / "results.json", "w"), indent=1, default=float)

    # by year / family / side for the primaries
    for k, lab in prims.items():
        X = keep[lab].copy(); X["y"] = X["date"].dt.year
        X["fam"] = [LEVELS[int(i)][:-2] for i in X.k]; X["tier"] = [LEVELS[int(i)][-2:] for i in X.k]
        X["side"] = np.where(SHORT_V[X.k.astype(int)], "short", "long")
        say(f"\n{k} by year:\n" + X.groupby("y").R.agg(["count", "mean", "sum"]).round(3).to_string())
        say(f"{k} by family (OOS):\n" + X[X.y > IS_END].groupby("fam").R.agg(["count", "mean", "sum"]).round(3).to_string())
        say(f"{k} by tier (OOS):\n" + X[X.y > IS_END].groupby("tier").R.agg(["count", "mean", "sum"]).round(3).to_string())
        say(f"{k} by side (OOS):\n" + X[X.y > IS_END].groupby("side").R.agg(["count", "mean", "sum"]).round(3).to_string())
        X.groupby(["y", "fam"]).R.agg(["count", "mean", "sum"]).reset_index().to_csv(OUT / f"by_year_family_{k}.csv", index=False)

    # equity (daily cumulative) and examples
    EQ = pd.DataFrame({k: keep[lab].groupby("date")["R"].sum() for k, lab in prims.items()}).fillna(0).cumsum()
    EQ.index.name = "date"; EQ.round(3).to_csv(OUT / "equity.csv")
    erng = np.random.default_rng(SEED + 5)
    smap = {s[1]: s for s in sess}
    exs = []
    for k, lab in prims.items():
        X = keep[lab]
        for y, G in X.groupby(X["date"].dt.year):
            for i in erng.choice(len(G), size=min(2, len(G)), replace=False):
                t = G.iloc[i]
                _, _, O, H, Lo, C, VB, sv, P, sg, o, _ = smap[t["date"]]
                a, b = max(int(t.armbar) - 60, 0), min(int(t.exitbar) + 30, len(O) - 1)
                step = max(1, (b - a) // 240)
                idx = np.arange(a, b + 1, step)
                bars = [[int(j), float(O[j]), float(H[j:j + step].max()), float(Lo[j:j + step].min()),
                         float(C[min(j + step - 1, b)]), float(VB[j]) if np.isfinite(VB[j]) else None] for j in idx]
                kk = int(t.k); sh = bool(SHORT_V[kk])
                exs.append(dict(arm=k, date=str(t["date"].date()), level=LEVELS[kk], short=sh,
                                line=float(P[kk, int(t.armbar)]), entry=float(t.entry),
                                stop=float(t.entry + t.S if sh else t.entry - t.S),
                                tp=None if t.notgt else float(t.tp), exit=float(t.exit),
                                oc=["target", "stop", "break-even", "time"][int(t.oc)], R=float(t.R),
                                armbar=int(t.armbar), fillbar=int(t.fillbar), exitbar=int(t.exitbar), step=int(step),
                                t0=f"{a // 60:02d}:{a % 60:02d}", bars=bars))
    json.dump(exs, open(OUT / "examples.json", "w"))
    (OUT / "report.txt").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main(*(sys.argv[1:2] or ["GOLD"]))
