"""vol-line-touch-layers, step 2: everything decided on discovery (2016-10-24 -> 2022-12-30), frozen before scoring.

A  map: tercile cut points, eligible cells, per-date one-sided tests, BH q=0.10, candidates (mean >= +0.03R).
B  models: per side x shape, base and layered; walk-forward 2019-22 threshold (80th pct); final fit on all discovery;
   predictions on the confirm window's INPUTS ONLY (outcome columns are not read). Headline combo = highest layered
   walk-forward taken mean.
Writes analysis/output/vol-line-touch-layers/frozen/{params.json, confirm_take.parquet} and discovery/discovery.json.
    python -X utf8 scripts/vol-line-touch-layers/fit.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import ttest_1samp

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (BLOCKS, COMBOS, DISC_END, FEATS, FROZEN, MAP_INPUTS, OUT, SEED, Boot, fit_predict, load, summ,  # noqa: E402
                    walk_forward)

MIN_CELL, Q, CAND_BAR = 300, 0.10, 0.03


def bh(p, q):
    p = np.asarray(p)
    n = len(p)
    o = np.argsort(p)
    thr = q * np.arange(1, n + 1) / n
    ok = p[o] <= thr
    k = np.max(np.flatnonzero(ok)) + 1 if ok.any() else 0
    res = np.zeros(n, bool)
    res[o[:k]] = True
    return res


def states(E, inp, cuts):
    v = E[inp]
    if inp in ("burst", "common"):
        return v.map({0.0: "0", 1.0: "1"})
    lo, hi = cuts[inp]
    return pd.Series(np.where(v.isna(), None, np.where(v < lo, "T1", np.where(v < hi, "T2", "T3"))), index=E.index)


def map_cells(E, cuts, r_of):
    rows = []
    for inp in MAP_INPUTS:
        st = states(E, inp, cuts)
        for (s, b, rung), g in E.assign(st=st).dropna(subset=["st"]).groupby(["st", "block", "rung"]):
            for side, shape in COMBOS:
                r = r_of(g, side, shape)
                if len(g) < MIN_CELL:
                    continue
                pdm = pd.Series(r, index=g.index).groupby(g.date).mean()
                t = ttest_1samp(pdm.to_numpy(), 0.0, alternative="greater")
                rows.append({"input": inp, "state": s, "block": b, "rung": int(rung), "side": side, "shape": shape,
                             "n": len(g), "dates": len(pdm), "mean": float(np.mean(r)), "p": float(t.pvalue)})
    return pd.DataFrame(rows)


def main():
    FROZEN.mkdir(parents=True, exist_ok=True)
    (OUT / "discovery").mkdir(parents=True, exist_ok=True)
    E = load("disc")
    assert E.date.max() <= DISC_END
    out = {"seed": SEED, "n_touches": len(E), "n_dates": int(E.date.nunique())}

    # A: map
    cuts = {k: [float(x) for x in E[k].quantile([1 / 3, 2 / 3])] for k in MAP_INPUTS if k not in ("burst", "common")}
    C = map_cells(E, cuts, lambda g, s, h: g[f"r_{s}_{h}"].to_numpy())
    C["bh"] = bh(C.p.to_numpy(), Q)
    C["cand"] = C.bh & (C["mean"] >= CAND_BAR)
    C.sort_values("p").to_csv(OUT / "discovery/map_cells.csv", index=False)
    cands = C[C.cand].to_dict("records")
    out["map"] = {"cells": len(C), "bh_pass": int(C.bh.sum()), "candidates": len(cands),
                  "positive_cells": int((C["mean"] > 0).sum()), "best": C.sort_values("p").head(10).to_dict("records")}
    print("map:", out["map"]["cells"], "cells,", out["map"]["bh_pass"], "BH,", len(cands), "candidates", flush=True)

    # B: models
    Fc = load("conf", outcomes=False)
    assert not any(c.startswith("r_") or c.startswith("mfe") or c.startswith("mae") for c in Fc.columns)
    take = Fc[["inst", "date", "dir", "rung", "minute"]].copy()
    thr, wf = {}, {}
    boot = Boot(E.date.to_numpy())
    for side, shape in COMBOS:
        y = E[f"r_{side}_{shape}"].to_numpy()
        for fs, feats in FEATS.items():
            key = f"{fs}_{side}_{shape}"
            oof = walk_forward(E, y, feats)
            ok = np.isfinite(oof)
            t = float(np.quantile(oof[ok], 0.8))
            thr[key] = t
            tk = ok & (oof >= t)
            Ew = E[ok]
            wf[key] = {"threshold": t,
                       "all": summ(*boot.mean(Ew.date.to_numpy(), y[ok]), n=ok.sum(), ndates=Ew.date.nunique()),
                       "taken": summ(*boot.mean(E.date.to_numpy()[tk], y[tk]), n=tk.sum(), ndates=E.date[tk].nunique())}
            _, pc = fit_predict(E, y, Fc, feats)
            take[f"pred_{key}"] = pc
            take[f"take_{key}"] = pc >= t
            print(key, "wf taken", wf[key]["taken"]["est"], "all", wf[key]["all"]["est"], "conf take share",
                  round(float((pc >= t).mean()), 3), flush=True)
    head = max(COMBOS, key=lambda c: wf[f"layered_{c[0]}_{c[1]}"]["taken"]["est"])
    out["walk_forward"] = wf
    out["headline"] = {"side": head[0], "shape": head[1]}
    params = {"seed": SEED, "cuts": cuts, "candidates": cands, "thresholds": thr, "headline": out["headline"],
              "feats": FEATS, "blocks": BLOCKS, "min_cell": MIN_CELL, "q": Q, "cand_bar": CAND_BAR,
              "n_confirm_rows": len(take)}
    (FROZEN / "params.json").write_text(json.dumps(params, indent=1, default=float), encoding="utf-8")
    take.to_parquet(FROZEN / "confirm_take.parquet", index=False)
    (OUT / "discovery/discovery.json").write_text(json.dumps(out, indent=1, default=float), encoding="utf-8")
    print("headline", head)


if __name__ == "__main__":
    main()
