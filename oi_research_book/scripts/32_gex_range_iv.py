"""
gex-range-iv: is any short-gamma range widening left once implied vol is in the baseline?

Pre-registration: oi_research_book/GEX_RANGE_IV_PREREG.md (commit 31c7a9e7, pushed BEFORE any regression with implied
vol was run). Agenda Q1c in .claude/skills/research-director/agendas/gex-range.md.

  frames   script 27b's with_controls(name, first_date): script 27's scored frame (NY-close, OI(D) -> S(D+2)) + r5, r20, dd60
  IV       Cboe VIX (ES) / VXN (NQ) close on the label date of S(D+1), last close on or before it
  v        ln(IV/100 / (sigma * sqrt(252)))  -- implied over trailing realised
  B0       OLS DR ~ 1 + short + sigma quintiles + r5 + r20 + dd60     (must reproduce 27b to within 0.005)
  B1       B0 + v; b_IV = short coefficient (scored, per instrument; Holm across ES, NQ)
  absorbed d_b = b_B0 - b_IV, paired bootstrap; "IV absorbs most" iff d_b >= 0.5 * b_B0 and paired CI95 of d_b > 0

Usage: python oi_research_book/scripts/32_gex_range_iv.py
"""
import json
import importlib.util
import numpy as np
import pandas as pd
from math import erf, sqrt
from pathlib import Path

HERE = Path(__file__).resolve()
_s = importlib.util.spec_from_file_location("p27b", HERE.with_name("27b_gex_range_es_posthoc.py"))
p = importlib.util.module_from_spec(_s)
_s.loader.exec_module(p)
m = p.m                                                          # script 27, as loaded by 27b

SEED = 20261103
B = 4000
GATE, OPERATIONAL = 0.05, 0.10
BANKED_B0 = {"ES": 0.147, "NQ": 0.165}                           # 27b, return-controlled short coefficient
REPO = HERE.parents[2]
CBOE = REPO / "analysis" / "surfaces" / "cboe"
IVFILE = {"ES": "VIX.csv", "NQ": "VXN.csv"}
OUT = HERE.parents[1] / "data" / "results" / "gex_range_iv.json"


def cboe(name):
    c = pd.read_csv(CBOE / name)
    c["DATE"] = pd.to_datetime(c["DATE"], format="%m/%d/%Y")
    return c.set_index("DATE")["CLOSE"].sort_index()


def asof(series, dates):
    """Last value on or before each date (never after)."""
    s = series.dropna()
    idx = s.index.searchsorted(pd.DatetimeIndex(dates), side="right") - 1
    out = np.where(idx >= 0, s.to_numpy()[np.clip(idx, 0, None)], np.nan)
    return out


def build(name, start):
    d = p.with_controls(name, start)
    S = m.sessions(m.INSTR[name]["px"])
    d1 = S.index[S.index.get_indexer(d["tgt"]) - 1]              # label date of S(D+1)
    d["d1"] = d1
    iv = asof(cboe(IVFILE[name]), d1)
    d["v"] = np.log(iv / 100.0 / (d["sig"].to_numpy() * np.sqrt(252.0)))
    if name == "NQ":
        ivd = pd.read_parquet(HERE.parents[1] / "data" / "iv_daily_nas100_usd.parquet")
        ivs = ivd.assign(date=pd.to_datetime(ivd["date"])).set_index("date")["iv30"].sort_index()
        d["v_iv30"] = np.log(asof(ivs, d1) / (d["sig"].to_numpy() * np.sqrt(252.0)))
    return d


def X_of(d, controls, v_quintiles=None):
    X = pd.get_dummies(m.strata(d["sig"]), prefix="s", drop_first=True).astype(float)
    X.insert(0, "c", 1.0)
    X["short"] = d["is_short"].astype(float).values
    for k in controls:
        X[k] = d[k].values
    if v_quintiles is not None:
        q = pd.get_dummies(pd.qcut(d[v_quintiles], 5, labels=False), prefix="vq", drop_first=True).astype(float)
        X = pd.concat([X, q.set_index(X.index)], axis=1)
    return X.values, list(X.columns).index("short")


def coef(A, y, j):
    return float(np.linalg.lstsq(A, y, rcond=None)[0][j])


def pnorm(t):
    return 2 * (1 - 0.5 * (1 + erf(abs(t) / sqrt(2))))


def paired(d, rng):
    y = d["dr"].to_numpy()
    A0, j0 = X_of(d, ["r5", "r20", "dd60"])
    A1, j1 = X_of(d, ["r5", "r20", "dd60", "v"])
    b0, b1 = coef(A0, y, j0), coef(A1, y, j1)
    bs0, bs1 = [], []
    for ch in m.s18._boot_stats(len(y), B, rng, chunk=500):
        for ix in ch:
            bs0.append(coef(A0[ix], y[ix], j0)); bs1.append(coef(A1[ix], y[ix], j1))
    bs0, bs1 = np.array(bs0), np.array(bs1)
    se1, sed = float(bs1.std()), float((bs0 - bs1).std())
    pl = []
    for k in range(60, len(y) - 60, 5):
        A2 = A1.copy(); A2[:, j1] = np.roll(A1[:, j1], k)
        pl.append(coef(A2, y, j1))
    pl = np.array(pl)
    db = b0 - b1
    return {
        "b_B0": b0, "b_IV": b1, "se_IV": se1, "ci95_IV": [b1 - 1.96 * se1, b1 + 1.96 * se1], "t_IV": b1 / se1,
        "p_IV": pnorm(b1 / se1),
        "placebo": {"n_shifts": len(pl), "mean": float(pl.mean()), "sd": float(pl.std()),
                    "real_above_share": float((pl < b1).mean())},
        "d_b": db, "d_b_ci95": [db - 1.96 * sed, db + 1.96 * sed], "absorbed_share": db / b0 if b0 else None,
        "v_coef": coef(A1, y, len(A1[0]) - 1),
    }


def main():
    rng = np.random.default_rng(SEED)
    start = m.first_date(None)
    res = {"seed": SEED, "prereg": "oi_research_book/GEX_RANGE_IV_PREREG.md", "prereg_commit": "31c7a9e7",
           "ranAt": pd.Timestamp.now("UTC").isoformat(), "cells": {}}
    data = {}
    for name in ("ES", "NQ"):
        d = build(name, start)
        n0 = len(d)
        d = d[np.isfinite(d[["dr", "r5", "r20", "dd60", "v"]]).all(axis=1)].reset_index(drop=True)
        data[name] = d
        r = paired(d, rng)
        r["n"], r["dropped_no_iv"] = len(d), n0 - len(d)
        r["b0_reproduces_27b"] = abs(r["b_B0"] - BANKED_B0[name]) <= 0.005
        res["cells"][name] = r
    if not all(c["b0_reproduces_27b"] for c in res["cells"].values()):
        res["stopped"] = "B0 does not reproduce the banked 27b coefficients: debug before reading anything"
        OUT.write_text(json.dumps(res, indent=2, default=str)); print(json.dumps(res, indent=2, default=str)); return

    adj = m.holm([res["cells"][k]["p_IV"] for k in ("ES", "NQ")])
    for k, h in zip(("ES", "NQ"), adj):
        c = res["cells"][k]
        c["p_IV_holm"] = float(h)
        gate = {"b_ge_0.05": c["b_IV"] >= GATE, "ci_lower_gt_0": c["ci95_IV"][0] > 0, "holm_p_lt_0.05": h < 0.05,
                "placebo_above_95pct": c["placebo"]["real_above_share"] >= 0.95}
        c["gate"] = gate
        c["verdict"] = ("VALIDATED" if all(gate.values())
                        else "NULL" if c["ci95_IV"][1] < OPERATIONAL else "UNDERPOWERED")
        c["iv_absorbs_most"] = bool(c["d_b"] >= 0.5 * c["b_B0"] and c["d_b_ci95"][0] > 0)

    # ---- descriptive
    for k, d in data.items():
        y = d["dr"].to_numpy(); c = res["cells"][k]; desc = {}
        A, j = X_of(d, ["r5", "r20", "dd60"], v_quintiles="v"); desc["b_v_quintiles"] = coef(A, y, j)
        if k == "NQ":
            dd = d[np.isfinite(d["v_iv30"])].reset_index(drop=True)
            A, j = X_of(dd.assign(v=dd["v_iv30"]), ["r5", "r20", "dd60", "v"]); desc["b_iv30"] = coef(A, dd["dr"].to_numpy(), j)
            desc["n_iv30"] = len(dd)
        half = len(d) // 2
        for lab, sl in (("first_half", slice(0, half)), ("second_half", slice(half, None))):
            dh = d.iloc[sl].reset_index(drop=True); A, j = X_of(dh, ["r5", "r20", "dd60", "v"])
            desc[f"b_IV_{lab}"] = coef(A, dh["dr"].to_numpy(), j)
        sh = d["is_short"].to_numpy()
        desc["mirror"] = {"DR_long": float(y[~sh].mean()), "iv_over_rv_long": float(np.exp(d["v"][~sh]).mean()),
                          "DR_short": float(y[sh].mean()), "iv_over_rv_short": float(np.exp(d["v"][sh]).mean())}
        desc["v_mean_short_vs_long"] = [float(d["v"][sh].mean()), float(d["v"][~sh].mean())]
        c["descriptive"] = desc
    OUT.write_text(json.dumps(res, indent=2, default=str))
    print(json.dumps(res, indent=2, default=str))


if __name__ == "__main__":
    main()
