#!/usr/bin/env python3
"""Parameter sensitivity, walk-forward and box-size sensitivity (prereg section 3.8). Descriptive: nothing here
can promote a cell. Run after run_study.py --mode score.

    python scripts/value-migration-nq/run_grid.py

Grid: theta in {0.25, 0.5, 1.0} x K in {2, 4, 6} x phi in {0.25, 0.5, 1.0} (27 sets), B = 15, all 24 strategies, net.
Walk-forward: for each test year 2017..2025, each strategy uses the grid point with the highest total net R over the
two previous calendar years, then trades the test year with it. Compared with the fixed registered default.
Box size: B in {5, 15, 30} at the default theta/K/phi, signed outcome of A_POC by horizon and the 24 strategies.
"""
import itertools
import json
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from vmig.features import Params  # noqa: E402
from vmig.backtest import run, NET  # noqa: E402
from vmig.stats import HORIZONS  # noqa: E402
from vmig.study import Sample, STRAT_MODELS, ENTRIES, EXITS  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "analysis" / "output" / "value-migration-nq"
GRID = [Params(B=15, K=K, theta=th, phi=ph) for th, K, ph in itertools.product((0.25, 0.5, 1.0), (2, 4, 6), (0.25, 0.5, 1.0))]
S = None


def _init():
    global S
    S = Sample()


def one(p: Params):
    f = S.features(p)
    mk = S.market(p.B)
    rows = []
    for model in STRAT_MODELS:
        st = mk.state_matrix(f, model)
        for e in ENTRIES:
            for x in EXITS:
                t = pd.DataFrame(run(mk, st, p.K, e, x, NET)[0])
                if not len(t):
                    continue
                g = t.assign(y=t.date.str[:4]).groupby("y")["R"].agg(["sum", "count"])
                for y, r in g.iterrows():
                    rows.append({"key": p.key(), "theta": p.theta, "K": p.K, "phi": p.phi, "B": p.B, "model": model,
                                 "entry": e, "exit": x, "year": int(y), "sumR": float(r["sum"]), "n": int(r["count"])})
    sig = []
    for m in ("A_POC", "A", "B", "C_", "D_"):
        for h in HORIZONS:
            d = f[(f[m] != 0) & f[f"y{h}"].notna()]
            sig.append({"key": p.key(), "B": p.B, "model": m, "h": h, "n": int(len(d)),
                        "S": float((np.sign(d[m]) * d[f"y{h}"]).mean()) if len(d) else None})
    return rows, sig


def walk_forward(df: pd.DataFrame, default_key: str):
    out = []
    years = sorted(df.year.unique())
    for (model, e, x), g in df.groupby(["model", "entry", "exit"]):
        for y in years:
            if y < years[0] + 2:
                continue
            train = g[g.year.isin([y - 2, y - 1])].groupby("key")["sumR"].sum()
            if train.empty:
                continue
            best = train.idxmax()
            test = g[(g.year == y) & (g.key == best)]
            dflt = g[(g.year == y) & (g.key == default_key)]
            out.append({"model": model, "entry": e, "exit": x, "year": int(y), "chosen": best,
                        "wf_sumR": float(test.sumR.sum()), "wf_n": int(test.n.sum()),
                        "default_sumR": float(dflt.sumR.sum()), "default_n": int(dflt.n.sum())})
    return pd.DataFrame(out)


def main():
    with Pool(4, initializer=_init) as pool:
        res = pool.map(one, GRID + [Params(B=5), Params(B=30)])
    rows = pd.DataFrame([r for rr, _ in res for r in rr])
    sig = pd.DataFrame([s for _, ss in res for s in ss])
    grid = rows[rows.B == 15]
    default_key = Params().key()
    wf = walk_forward(grid, default_key)
    # sensitivity: per strategy, net R per trade at every grid point, IS (<=2019) and OOS (>=2020)
    sens = []
    for (key, model, e, x), g in grid.groupby(["key", "model", "entry", "exit"]):
        is_ = g[g.year <= 2019]
        oos = g[g.year >= 2020]
        sens.append({"key": key, "model": model, "entry": e, "exit": x,
                     "is_expR": float(is_.sumR.sum() / max(is_.n.sum(), 1)), "is_n": int(is_.n.sum()),
                     "oos_expR": float(oos.sumR.sum() / max(oos.n.sum(), 1)), "oos_n": int(oos.n.sum())})
    sens = pd.DataFrame(sens)
    summ = []
    for (model, e, x), g in sens.groupby(["model", "entry", "exit"]):
        w = wf[(wf.model == model) & (wf.entry == e) & (wf.exit == x)]
        summ.append({"model": model, "entry": e, "exit": x,
                     "grid_points": int(len(g)), "share_oos_positive": float((g.oos_expR > 0).mean()),
                     "best_oos_expR": float(g.oos_expR.max()), "median_oos_expR": float(g.oos_expR.median()),
                     "is_oos_rank_corr": float(g[["is_expR", "oos_expR"]].corr(method="spearman").iloc[0, 1]) if len(g) > 2 else None,
                     "wf_expR": float(w.wf_sumR.sum() / max(w.wf_n.sum(), 1)), "wf_n": int(w.wf_n.sum()),
                     "default_expR_same_years": float(w.default_sumR.sum() / max(w.default_n.sum(), 1))})
    out = {"grid": [p.dict() for p in GRID], "default": default_key, "summary": summ,
           "walk_forward": wf.to_dict("records"), "sensitivity": sens.to_dict("records"),
           "box_size": {"signed": sig[sig.key.isin([Params(B=5).key(), Params().key(), Params(B=30).key()])].to_dict("records"),
                        "strategies": rows[rows.key.isin([Params(B=5).key(), Params().key(), Params(B=30).key()])]
                        .groupby(["B", "model", "entry", "exit"]).apply(lambda g: pd.Series({"expR": g.sumR.sum() / g.n.sum(), "n": g.n.sum()}))
                        .reset_index().to_dict("records")},
           "grid_signed": sig[sig.B == 15].to_dict("records")}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "grid.json").write_text(json.dumps(out, indent=1, default=float))
    print(pd.DataFrame(summ).round(3).to_string())


if __name__ == "__main__":
    main()
