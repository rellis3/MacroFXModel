"""gold-line-system-jordan (forge/GOLD_LINE_SYSTEM_JORDAN_PREREG.md): the gold-line-system-base S2 system traded on
Jordan's 8 lines only (HL projections up/down, Close+, Close-, at P75/P90). Engine unchanged; other lines switched off.

    python scripts/gold-line-system-jordan/run.py
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
_sp = importlib.util.spec_from_file_location("lsb", ROOT / "scripts/gold-line-system-base/run.py")
S = importlib.util.module_from_spec(_sp); _sp.loader.exec_module(S)
LEVELS, SHORT_V, IS_END, SEED, NPERM = S.LEVELS, S.SHORT_V, S.IS_END, S.SEED, S.NPERM
JORDAN = ("hlH", "hlL", "cup", "cdn")
MASK8 = np.array([l[:-2] in JORDAN and l[-2:] in ("75", "90") for l in LEVELS])
MASK12 = np.array([l[:-2] in JORDAN for l in LEVELS])
OUT = ROOT / "analysis/output/gold-line-system-jordan"


def run_mask(sess, kind, tmode, be, stops, costs, floor, mask):
    si_, so, cm = costs
    out = np.zeros((64, 12)); cnt = np.zeros(4, np.int64); rows = []
    for (si, d, O, H, Lo, C, VB, sv, P, sg, o, p90) in sess:
        st = np.where(mask, S.stop_vec(kind, si, sg, p90, stops, None, floor), np.nan)
        nt = S.sim(O, H, Lo, C, VB, sv, P, SHORT_V, st, sg, o, tmode, be, si_, so, cm, out, cnt)
        for r in out[:nt]:
            rows.append((d, si) + tuple(r))
    X = pd.DataFrame(rows, columns=["date", "si", "k", "entry", "exit", "S", "oc", "R", "gR", "armbar", "fillbar",
                                    "exitbar", "tp", "notgt"])
    return X[X["date"] >= S.START].reset_index(drop=True), dict(zip(["armed", "chased", "cancelled", "filled"], cnt.tolist()))


def load(sym="GOLD"):
    W = pd.read_parquet(ROOT / f"analysis/output/gold-rolling-mae-window/widths/F_{sym}.parquet")
    W["date"] = pd.to_datetime(W["date"]); W = W.sort_values("date").reset_index(drop=True)
    DV, tick_raw = S.LT.sessions(sym)
    W = W[W["date"].isin(DV.keys())].reset_index(drop=True)
    Dold = {d: (x[1], x[2], x[3], float(x[0][0])) for d, x in DV.items()}
    return W, DV, Dold, float(tick_raw)


def top_cut(x, q):
    s = np.sort(x)[::-1]; k = int(np.ceil(q * len(s)))
    return float(s[k:].sum())


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    lines = []
    def say(s=""):
        print(s, flush=True); lines.append(s)
    W, DV, Dold, tick = load()
    nsess = len(W); costs = (0.10, 0.10, 0.12); floor = 5 * tick
    T = S.R.touches(Dold, W)
    stops = S.R.rolling_stops(T, nsess, "usd", wins=["3m"])
    sess = S.prep(DV, W)
    rng = np.random.default_rng(SEED)
    arms, keep = [], {}
    for lab, kind, be, mask in (("J8|S2|BEoff", "S2", 0, MASK8), ("J8|S2|BEon", "S2", 1, MASK8),
                                ("J8|S1|BEoff", "S1", 0, MASK8), ("J12|S2|BEoff", "S2", 0, MASK12),
                                ("All18|S2|BEoff", "S2", 0, np.ones(len(LEVELS), bool))):
        X, cnt = run_mask(sess, kind, 1, be, stops, costs, floor, mask)
        a = S.summarise(X, rng, lab)
        o = X[X["date"].dt.year > IS_END]
        a.update(OOS_tot_wo_top1=top_cut(o.R.to_numpy(), 0.01), OOS_tot_wo_top5=top_cut(o.R.to_numpy(), 0.05),
                 **{f"n_{k}": v for k, v in cnt.items()})
        arms.append(a); keep[lab] = X
    A = pd.DataFrame(arms); A.to_csv(OUT / "arms.csv", index=False)
    pd.set_option("display.width", 250)
    say(A[["arm", "IS_R", "IS_n", "OOS_R", "OOS_lo", "OOS_hi", "OOS_n", "OOS_totR", "OOS_tot_wo_top1", "OOS_tot_wo_top5",
           "OOS_gross", "OOS_pf", "OOS_win", "OOS_tgt", "OOS_stop_med", "maxDD"]].round(3).to_string(index=False))
    assert abs(A.set_index("arm").loc["All18|S2|BEoff", "OOS_R"] - 0.10580) < 1e-4, "control does not reproduce base S2"

    prng = np.random.default_rng(SEED + 1)
    yrs = W["date"].dt.year.to_numpy(); pl = []
    for p in range(NPERM):
        perm = np.arange(nsess)
        for y in np.unique(yrs):
            m = yrs == y; perm[m] = prng.permutation(perm[m])
        spp = S.R.rolling_stops(S.R.touches(Dold, W, perm), nsess, "usd", wins=["3m"])
        Xp, _ = run_mask(S.prep(DV, W, perm), "S2", 1, 0, spp, costs, floor, MASK8)
        pl.append(float(Xp.R[Xp["date"].dt.year > IS_END].mean()))
        if p % 20 == 19: print(f"  placebo {p + 1}/{NPERM}", flush=True)
    a = A[A.arm == "J8|S2|BEoff"].iloc[0].to_dict()
    a.update(pl1_mean=float(np.mean(pl)), pl1_p95=float(np.percentile(pl, 95)), pl1_rank=float((np.array(pl) < a["OOS_R"]).mean()),
             p_one_sided=S.pval(keep["J8|S2|BEoff"], SEED + 2))
    if a["OOS_hi"] < 0.05: v = "NULL"
    elif a["OOS_lo"] > 0 and a["IS_R"] > 0 and a["OOS_R"] > a["pl1_p95"] and a["OOS_totR"] > 0 and a["OOS_tot_wo_top1"] > 0: v = "VALIDATED"
    else: v = "UNDERPOWERED"
    a["verdict"] = v
    say(f"\nPRIMARY J8|S2|BEoff: IS {a['IS_R']:+.3f} (n {a['IS_n']}) | OOS {a['OOS_R']:+.3f} [{a['OOS_lo']:+.3f},{a['OOS_hi']:+.3f}] "
        f"n {a['OOS_n']} total {a['OOS_totR']:+.1f}R, w/o top1% {a['OOS_tot_wo_top1']:+.1f}R | placebo {a['pl1_mean']:+.3f} "
        f"p95 {a['pl1_p95']:+.3f} (real {100 * a['pl1_rank']:.0f}th pct) | p {a['p_one_sided']:.3f} -> {v}")
    json.dump({"seed": SEED, "sym": "GOLD", "lines": [l for l, m in zip(LEVELS, MASK8) if m],
               "primary": {"S2": a}, "placebo_means": pl}, open(OUT / "results.json", "w"), indent=1, default=float)

    X = keep["J8|S2|BEoff"].copy(); X["y"] = X["date"].dt.year; X["lv"] = [LEVELS[int(i)] for i in X.k]
    X["side"] = np.where(SHORT_V[X.k.astype(int)], "short", "long")
    say("\nby year:\n" + X.groupby("y").R.agg(["count", "mean", "sum"]).round(3).to_string())
    for sp, m in (("IS", X.y <= IS_END), ("OOS", X.y > IS_END)):
        say(f"\nby line ({sp}):\n" + X[m].groupby("lv").R.agg(["count", "mean", "sum"]).round(3).to_string())
        say(f"by side ({sp}):\n" + X[m].groupby("side").R.agg(["count", "mean", "sum"]).round(3).to_string())
    EQ = X.groupby("date").R.sum().cumsum().round(3); EQ.to_csv(OUT / "equity.csv")
    (OUT / "report.txt").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
