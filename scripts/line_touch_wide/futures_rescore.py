"""Futures-cost re-score of the frozen line-touch holdout trades (forge/FUTURES_COST_RESCORE_PREREG.md). No model fit.

    python scripts/line_touch_wide/futures_rescore.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "analysis/output/line_touch_wide_scan"
SPLIT, HALF, W = pd.Timestamp("2022-06-24"), pd.Timestamp("2024-06-01"), 0.1
C = json.loads((OUT / "results_holdout.json").read_text())["c"]
TABLE = {"eurusd": 0.00006, "gbpusd": 0.00009, "usdjpy": 0.007, "audusd": 0.00007, "usdchf": 0.00008, "gold": 0.25,
         "nq": 1.0, "spx": 0.5, "de30": 1.0, "uk100": 1.0, "dow": 2.0, "us2000": 0.4}
COMM = 4.0
INDEX = ["nq", "spx", "dow", "us2000", "de30", "uk100"]
rng = np.random.default_rng(20261011)


def fut_cost(pair, P):
    """Round-trip cost in CFD price units: max(measured spread, 1 tick) + 1 tick slippage + $4 commission."""
    direct = {"eurusd": (0.00005, 125000 * P), "gbpusd": (0.0001, 62500 * P), "audusd": (0.00005, 100000 * P)}
    pts = {"gold": (0.10, 100, 0.28), "nq": (0.25, 20, 0.74), "spx": (0.25, 50, 0.29), "dow": (1.0, 5, 0),
           "us2000": (0.10, 50, 0), "de30": (0.5, 25 * 1.10, 0), "uk100": (0.5, 10 * 1.27, 0)}
    if pair in direct:
        tick, notional = direct[pair]
        return 2 * tick + COMM / notional * P
    if pair == "usdjpy":                       # 6J quoted USD per JPY: tick 5e-7 -> relative 5e-7*P
        rel = 5e-7 * P
        return 2 * rel * P + COMM / (12.5e6 / P) * P
    if pair == "usdchf":                       # 6S quoted USD per CHF: tick 5e-5 -> relative 5e-5*P
        rel = 5e-5 * P
        return 2 * rel * P + COMM / (125000 / P) * P
    tick, pv, meas = pts[pair]
    return max(meas, tick) + tick + COMM / pv


df = pd.read_parquet(OUT / "features.parquet")
df["dt"] = pd.to_datetime(df.t, unit="s")
df = df.dropna(subset=["R_cont", "R_fade", "ret60"])
df = df[(df.rng1 <= 0.5) & (df.hour < 20)].reset_index(drop=True)
P = np.load(OUT / "preds_holdout.npz")
assert len(P["R_cont"]) == len(df)
hold = (df.dt >= SPLIT).to_numpy() & ~np.isnan(P["R_cont"])
pc, pf = P["R_cont"][hold], P["R_fade"][hold]
sub = df.loc[hold, ["pair", "date", "t", "dt", "level", "scale", "R_cont", "R_fade"]].copy()
sub["score"], sub["side"] = np.maximum(pc, pf), np.where(pc >= pf, 1, -1)
tr = sub[sub.score >= C].sort_values("t").drop_duplicates(["pair", "date"], keep="first").copy()
tr["r"] = np.where(tr.side > 0, tr.R_cont, tr.R_fade)
check = {"n": len(tr), "gross": float(tr.r.mean())}
assert len(tr) == 584 and abs(check["gross"] - 0.192205) < 1e-4, check     # exact reconstruction of the frozen holdout

tr = tr[tr.pair.isin(list(TABLE))].copy()
tr["R_px"] = W * tr.scale
tr["cost_table2"] = 2 * tr.pair.map(TABLE) / tr.R_px
tr["cost_fut"] = [fut_cost(p, L) for p, L in zip(tr.pair, tr.level)] / tr.R_px


def block_boot(r, dates, B=2000, blk=5):
    u, inv = np.unique(dates, return_inverse=True)
    s, n = np.bincount(inv, weights=r, minlength=len(u)), np.bincount(inv, minlength=len(u))
    nb = int(np.ceil(len(u) / blk))
    starts = rng.integers(0, len(u) - blk + 1, (B, nb))
    idx = (starts[:, :, None] + np.arange(blk)).reshape(B, -1)[:, :len(u)]
    return np.percentile(s[idx].sum(1) / n[idx].sum(1), [2.5, 97.5]).tolist()


def score(t, col, mult=1.0):
    net = t.r - mult * t[col]
    h1 = t.dt < HALF
    byi = net.groupby(t.pair).mean()
    lo, hi = block_boot(net.to_numpy(), t.date.to_numpy())
    res = {"n": len(t), "gross": round(float(t.r.mean()), 4), "mean_cost_R": round(float(mult * t[col].mean()), 4),
           "net": round(float(net.mean()), 4), "ci95": [round(lo, 4), round(hi, 4)],
           "half1": round(float(net[h1].mean()), 4), "half2": round(float(net[~h1].mean()), 4),
           "inst_pos": int((byi > 0).sum()), "inst_traded": int(len(byi))}
    res["pass"] = bool(res["net"] > 0 and lo > 0 and res["half1"] > 0 and res["half2"] > 0 and res["inst_pos"] >= 0.6 * res["inst_traded"])
    return res


rep = {"reconstruction": check, "commission_usd_rt": COMM}
for name, t in (("all12", tr), ("index6", tr[tr.pair.isin(INDEX)])):
    rep[name] = {"table2x": score(t, "cost_table2"), "futures": score(t, "cost_fut"), "futures_x1.5": score(t, "cost_fut", 1.5)}
    rep[name]["PASS"] = rep[name]["futures"]["pass"] and rep[name]["futures_x1.5"]["pass"]
per = tr.groupby("pair").agg(n=("r", "size"), gross=("r", "mean"), R_px=("R_px", "median"),
                             cost_table2_R=("cost_table2", "mean"), cost_fut_R=("cost_fut", "mean"))
per["net_fut"] = per.gross - per.cost_fut_R
per["breakeven_cost_px"] = per.gross * per.R_px
rep["per_instrument"] = per.round(4).reset_index().to_dict("records")
(OUT / "futures_rescore.json").write_text(json.dumps(rep, indent=1))
print(json.dumps({k: v for k, v in rep.items() if k != "per_instrument"}, indent=1))
print(per.round(4).to_string())
