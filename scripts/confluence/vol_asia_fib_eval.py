"""VOL-ASIA-FIB-CONFLUENCE evaluation (forge/VOL_ASIA_FIB_CONFLUENCE_PREREG.md).

    PYTHONPATH=. python scripts/confluence/vol_asia_fib_eval.py --block disc     # discovery (< 2022)
    PYTHONPATH=. python scripts/confluence/vol_asia_fib_eval.py --block hold     # holdout (2022-01 -> 2026-08-20), read once
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

IN, OUT = Path("data/confluence"), Path("analysis/output/vol_asia_fib")
BLOCK = sys.argv[sys.argv.index("--block") + 1] if "--block" in sys.argv else "disc"
SPLIT = "2022-01-01"
TOLS, BS, PRIMARY = (0.03, 0.05, 0.10), (0.15, 0.25, 0.50), (0.05, 0.25)
SPREAD = {"EURUSD": 0.00006, "GBPUSD": 0.00009, "USDJPY": 0.007, "AUDUSD": 0.00007, "USDCAD": 0.00008, "USDCHF": 0.00008,
          "EURJPY": 0.010, "GBPJPY": 0.014, "AUDJPY": 0.010, "EURGBP": 0.00008, "GOLD": 0.25, "NQ": 1.0, "SPX500": 0.5,
          "US30": 2.0, "DE30": 1.0, "UK100": 1.0, "CADJPY": 0.012, "CHFJPY": 0.014, "EURAUD": 0.00014, "EURCHF": 0.00010, "US2000": 0.4}
rng = np.random.default_rng(20261013)


def load():
    Ds, Ps = [], []
    for f in sorted(IN.glob("*.parquet")):
        D = pd.read_parquet(f)
        P = np.load(str(f).replace(".parquet", "_placebo.npy"))
        assert len(P) == len(D), f
        Ds.append(D); Ps.append(P)
    D = pd.concat(Ds, ignore_index=True)
    P = np.concatenate(Ps)
    keep = (D.date < SPLIT) if BLOCK == "disc" else (D.date >= SPLIT)
    return D[keep.to_numpy()].reset_index(drop=True), P[keep.to_numpy()]


def block_ci(d, y, g, B=2000):
    """5-date moving-block bootstrap of mean(y | g) - mean(y | ~g)."""
    df = pd.DataFrame({"d": d, "y1": y * g, "n1": g.astype(float), "y0": y * (~g), "n0": (~g).astype(float)}).groupby("d").sum().sort_index()
    A = df.to_numpy()
    k = len(A)
    st = rng.integers(0, k - 4, (B, k // 5 + 1))
    idx = (st[:, :, None] + np.arange(5)).reshape(B, -1)[:, :k]
    S = A[idx].sum(1)
    diff = S[:, 0] / S[:, 1] - S[:, 2] / S[:, 3]
    return [float(x) for x in np.quantile(diff, [0.025, 0.975])]


def analyse(D, P, tol, b):
    r = D[f"res_{b}"].to_numpy()
    ok = np.isin(r, [1, -1])
    y = (r == 1).astype(float)
    conf = (D.dist.to_numpy() <= tol)
    d = D.date.to_numpy()
    yo, co, do = y[ok], conf[ok], d[ok]
    diff = yo[co].mean() - yo[~co].mean()
    ci = block_ci(do, yo, co)
    pdiff = np.array([yo[P[ok, k] <= tol].mean() - yo[P[ok, k] > tol].mean() for k in range(P.shape[1])])
    # adjusted: logistic on rung, side, hour band, class + confluence
    X = pd.get_dummies(pd.DataFrame({"rung": D.rung, "side": D.side.astype(str), "hb": pd.cut(D.touch_min, [359, 600, 840, 1080, 1320]).astype(str),
                                      "cls": D.cls}), dtype=float)
    X["conf"] = conf.astype(float)
    lr = LogisticRegression(max_iter=1000, C=10.0).fit(X[ok], yo)
    inst = {}
    for s, g in D[ok].assign(y=yo, c=co).groupby("inst"):
        if g.c.sum() >= 30 and (~g.c).sum() >= 30:
            inst[s] = round(float(g.y[g.c].mean() - g.y[~g.c].mean()), 4)
    out = {"tol": tol, "b": b, "rows": int(len(D)), "resolved": int(ok.sum()), "unresolved": int((r == 0).sum()), "ambiguous": int((r == 2).sum()),
           "confluence_rate": round(float(conf.mean()), 4), "placebo_confluence_rate": round(float((P <= tol).mean()), 4),
           "fade_share_confluent": round(float(yo[co].mean()), 4), "fade_share_other": round(float(yo[~co].mean()), 4),
           "n_conf": int(co.sum()), "diff": round(float(diff), 4), "ci95": [round(x, 4) for x in ci],
           "placebo_p05_p95": [round(float(x), 4) for x in np.quantile(pdiff, [0.05, 0.95])], "placebo_mean": round(float(pdiff.mean()), 4),
           "adj_logit_coef_conf": round(float(lr.coef_[0][-1]), 4),
           "instruments_same_sign": f"{sum(np.sign(v) == np.sign(diff) for v in inst.values())}/{len(inst)}", "by_instrument": inst}
    return out


def breakdown(D, tol, b):
    r = D[f"res_{b}"].to_numpy()
    ok = np.isin(r, [1, -1])
    E = D[ok].assign(y=(r[ok] == 1).astype(float), c=D.dist.to_numpy()[ok] <= tol,
                     hb=pd.cut(D.touch_min[ok], [359, 600, 840, 1080, 1320], labels=["06-10", "10-14", "14-18", "18-22"]),
                     far=np.where(np.abs(D.lv[ok]) >= 3, "far (|mult|>=3 or <=-2)", "near"))
    res = {}
    for col in ("rung", "side", "hb", "cls", "far"):
        t = E.groupby([col, "c"], observed=True).y.agg(["mean", "size"]).unstack("c")
        res[col] = {str(k): {"fade_conf": round(float(v[("mean", True)]), 3), "fade_other": round(float(v[("mean", False)]), 3),
                             "n_conf": int(v[("size", True)])} for k, v in t.iterrows()}
    return res


def trade(D, tol, b, direction):
    E = D[D.inst.isin(SPREAD) & np.isin(D[f"res_{b}"], [1, -1, 0])].copy()
    E["cost"] = 2 * E.inst.map(SPREAD) / (b * E.unit)
    E["net"] = direction * E[f"R_{b}"] - E.cost
    c = E.dist <= tol
    g = E[c]
    ci = block_ci(E.date.to_numpy(), E.net.to_numpy(), c.to_numpy())
    dates = g.date.to_numpy()
    u, inv = np.unique(dates, return_inverse=True)
    s, n = np.bincount(inv, g.net.to_numpy()), np.bincount(inv)
    st = rng.integers(0, len(u) - 4, (2000, len(u) // 5 + 1))
    idx = (st[:, :, None] + np.arange(5)).reshape(2000, -1)[:, :len(u)]
    m = s[idx].sum(1) / n[idx].sum(1)
    return {"direction": "fade" if direction > 0 else "continue", "n": int(len(g)), "mean_cost_R": round(float(g.cost.mean()), 4),
            "gross_R": round(float((direction * g[f"R_{b}"]).mean()), 4), "net_R": round(float(g.net.mean()), 4),
            "net_ci95": [round(float(x), 4) for x in np.quantile(m, [0.025, 0.975])],
            "net_other_R": round(float(E[~c].net.mean()), 4), "conf_minus_other_ci95": [round(x, 4) for x in ci]}


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    D, P = load()
    res = {"block": BLOCK, "dates": [D.date.min(), D.date.max()], "n_dates": int(D.date.nunique()), "grid": {}}
    for tol in TOLS:
        for b in BS:
            res["grid"][f"tol{tol}_b{b}"] = analyse(D, P, tol, b)
            g = res["grid"][f"tol{tol}_b{b}"]
            print(f"tol {tol:.2f} b {b:.2f}  conf {g['confluence_rate']:.3f} (placebo {g['placebo_confluence_rate']:.3f})  fade conf {g['fade_share_confluent']:.4f} other {g['fade_share_other']:.4f}"
                  f"  diff {g['diff']:+.4f} {g['ci95']}  placebo p05/p95 {g['placebo_p05_p95']}  inst {g['instruments_same_sign']}", flush=True)
    pr = res["grid"][f"tol{PRIMARY[0]}_b{PRIMARY[1]}"]
    res["breakdown_primary"] = breakdown(D, *PRIMARY)
    res["trade_primary"] = {k: trade(D, *PRIMARY, s) for k, s in (("fade", 1), ("continue", -1))}
    print(json.dumps(res["trade_primary"], indent=1))
    (OUT / f"{BLOCK}.json").write_text(json.dumps(res, indent=1, default=str))
