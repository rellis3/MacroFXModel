"""hlproj-p90-morning-follow (forge/HLPROJ_P90_MORNING_FOLLOW_PREREG.md): replicate the futures HL-projection P90
07-10 London continuation on 22 CFDs not in the futures set."""
import json, os
import numpy as np, pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EV = os.path.join(ROOT, "analysis/output/level-context-engine/events")
OUT = os.path.join(ROOT, "analysis/output/hlproj-p90-morning-follow")
os.makedirs(OUT, exist_ok=True)
SEED, B = 20261126, 1000
REP = ["AUDCAD", "AUDCHF", "AUDJPY", "AUDNZD", "CADCHF", "CADJPY", "CHFJPY", "EURAUD", "EURCAD", "EURCHF", "EURGBP",
       "EURJPY", "EURNZD", "GBPAUD", "GBPCAD", "GBPCHF", "GBPJPY", "GBPNZD", "NZDCAD", "NZDJPY", "PALLADIUM", "UK100"]
COLS = ["sym", "date", "kind", "family", "tier", "approach", "minute", "outcome", "R_cont", "u_px", "cost_R", "P"]
rng = np.random.default_rng(SEED)


def load(track, syms):
    d = pd.concat([pd.read_parquet(os.path.join(EV, f"{track}_{s}.parquet"), columns=COLS) for s in syms])
    d = d[(d.date <= "2026-08-21") & (d.family == "HLproj") & (d.tier == 90) & (d.approach == "in")]
    d["cr"] = (d.outcome == "cont").astype(float) - (d.outcome == "rej").astype(float)
    return d


def window(d, a, b):
    return d[(d.minute >= a) & (d.minute < b)]


def boot_one(L, col):
    g = L.groupby("date")[col].agg(["sum", "size"]); s, n = g["sum"].values, g["size"].values
    i = rng.integers(0, len(g), (B, len(g))); bs = s[i].sum(1) / n[i].sum(1)
    return s.sum() / n.sum(), *np.percentile(bs, [5, 95]), (np.sum(bs <= 0) + 1) / (B + 1)


def boot_diff(L, P, col):
    a = L.groupby("date")[col].agg(["sum", "size"]).add_prefix("l_"); b = P.groupby("date")[col].agg(["sum", "size"]).add_prefix("p_")
    g = a.join(b, how="outer").fillna(0)
    ls, ln, ps, pn = (g[c].values for c in ["l_sum", "l_size", "p_sum", "p_size"])
    i = rng.integers(0, len(g), (B, len(g)))
    bs = ls[i].sum(1) / ln[i].sum(1) - ps[i].sum(1) / pn[i].sum(1)
    return ls.sum() / ln.sum() - ps.sum() / pn.sum(), *np.percentile(bs, [5, 95]), (np.sum(bs <= 0) + 1) / (B + 1)


def bh(ps, q=0.10):
    ps = np.asarray(ps); o = np.argsort(ps); m = len(ps)
    ok = ps[o] <= q * np.arange(1, m + 1) / m
    k = np.max(np.where(ok)[0]) + 1 if ok.any() else 0
    r = np.zeros(m, bool); r[o[:k]] = True; return r


def cell(d):
    L, P = d[d.kind == "line"], d[d.kind == "placebo"]
    return dict(n=len(L), pl_n=len(P), cont=(L.outcome == "cont").mean(), rej=(L.outcome == "rej").mean(),
                pl_cont=(P.outcome == "cont").mean(), pl_rej=(P.outcome == "rej").mean(),
                gross=L.R_cont.mean(), pl_gross=P.R_cont.mean())


def main():
    C = load("C", REP)
    W = window(C, 420, 600)
    L, P = W[W.kind == "line"], W[W.kind == "placebo"]
    res = {"seed": SEED, "B": B, "cell": cell(W)}
    tests = {"R1": boot_diff(L, P, "cr"), "R2": boot_one(L, "R_cont"), "R3": boot_diff(L, P, "R_cont")}
    halves = {}
    for k, (col, diff) in {"R1": ("cr", True), "R2": ("R_cont", False), "R3": ("R_cont", True)}.items():
        hv = []
        for yrs in ([2020, 2021, 2022], [2023, 2024, 2025, 2026]):
            l = L[L.date.dt.year.isin(yrs)]; p = P[P.date.dt.year.isin(yrs)]
            hv.append(l[col].mean() - (p[col].mean() if diff else 0))
        halves[k] = hv
    passes = bh([tests[k][3] for k in ("R1", "R2", "R3")])
    for i, k in enumerate(("R1", "R2", "R3")):
        est, lo, hi, p = tests[k]
        agree = all(h > 0 for h in halves[k])
        nullbar = 0.01 if k == "R1" else 0.02
        v = "VALIDATED" if (lo > 0 and passes[i] and agree) else ("NULL" if hi < nullbar else "UNDERPOWERED")
        res[k] = dict(est=est, lo=lo, hi=hi, p=p, bh=bool(passes[i]), halves=halves[k], verdict=v)
    # descriptive
    desc = []
    for lab, a, b in [("07-10", 420, 600), ("10-13", 600, 780), ("07-13", 420, 780), ("13-16", 780, 960), ("16-22", 960, 1320), ("00-07", 0, 420)]:
        desc.append(dict(window=lab, sample="CFD replication 22", **cell(window(C, a, b))))
    F = load("F", sorted(f[2:-8] for f in os.listdir(EV) if f.startswith("F_")))
    for lab, a, b in [("07-10", 420, 600), ("10-13", 600, 780), ("13-16", 780, 960), ("16-22", 960, 1320)]:
        desc.append(dict(window=lab, sample="futures discovery 25", **cell(window(F, a, b))))
    pd.DataFrame(desc).to_csv(os.path.join(OUT, "by_window.csv"), index=False)
    per = L.groupby("sym").agg(n=("R_cont", "size"), cont=("outcome", lambda s: (s == "cont").mean()),
                               rej=("outcome", lambda s: (s == "rej").mean()), gross=("R_cont", "mean"))
    per.to_csv(os.path.join(OUT, "by_instrument.csv"))
    # approx net: 1.5 pips spread for FX crosses (assumption); UK100 1.0 pt, PALLADIUM skip
    pip = np.where(L.sym.str.contains("JPY"), 0.01, 0.0001)
    fx = ~L.sym.isin(["UK100", "PALLADIUM"])
    cost = np.where(fx, 1.5 * pip / L.u_px, np.where(L.sym == "UK100", 1.0 / L.u_px, np.nan))
    res["approx_cost_R_median"] = float(np.nanmedian(cost))
    res["approx_net"] = float(np.nanmean(L.R_cont.values - cost))
    res["desc"] = desc
    with open(os.path.join(OUT, "results.json"), "w") as f:
        json.dump(res, f, indent=1, default=float)
    pd.set_option("display.width", 220)
    print(json.dumps({k: res[k] for k in ("cell", "R1", "R2", "R3", "approx_cost_R_median", "approx_net")}, indent=1, default=float))
    print(pd.DataFrame(desc).round(3).to_string())
    print(per.round(3).to_string())


if __name__ == "__main__":
    main()
