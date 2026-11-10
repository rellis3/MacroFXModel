#!/usr/bin/env python3
"""Data quality and proxy validity -> analysis/output/value-migration-nq/data_quality.json

1. The free NQ 1-minute set: coverage, OHLC sanity, tick grid, DST, session drops, in-session jumps, volume by year.
2. How much of TRUE NQ delta an OHLCV proxy can recover, on the one NQ day in the repo with per-minute buy/sell
   volume (analysis/output/footprint/NQ_12-26_2026-10-30_nt8_tickrule.json: NT8 ticks, tick rule; the
   footprint-absorption study found tick rule vs exchange aggressor flag r = +0.91 per bar on NQ).
   The absorption-relevant part of delta is the part price does NOT explain: the residual of delta on the bar's
   return. We report how much of that residual each proxy recovers.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm

sys.path.insert(0, str(Path(__file__).parent))
from vmig.data import load_raw_m1, to_rth, RTH_MINUTES  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "analysis" / "output" / "value-migration-nq"


def dataset_checks():
    import glob
    raw = pd.concat([pd.read_parquet(f) for f in sorted(glob.glob(str(Path(__file__).resolve().parents[2] / "data/value-migration-nq/NQ_1min_*.parquet")))])
    dups = int(raw["timestamp"].duplicated().sum())
    d = load_raw_m1()
    ts = pd.to_datetime(d["timestamp"]).dt.tz_localize("UTC").dt.tz_convert("America/New_York")
    gap = d["timestamp"].diff().dt.total_seconds() / 60
    rep = {}
    r = to_rth(d, end="2025-07-24", report=rep)
    j = (r["open"] / r.groupby("day")["close"].shift() - 1).abs()
    big = r.loc[j > 0.004, ["date", "m"]].assign(jump=j[j > 0.004]).to_dict("records")
    vol = r.groupby(r.date.str[:4]).apply(lambda g: g.volume.sum() / g.day.nunique()).round(0).to_dict()
    filled = int((r.volume == 0).sum())
    return {
        "rows": int(len(d)), "first_utc": str(d.timestamp.min()), "last_utc": str(d.timestamp.max()),
        "ohlc_violations": int(((d.high < d[["open", "close"]].max(axis=1)) | (d.low > d[["open", "close"]].min(axis=1))).sum()),
        "on_tick_grid": bool(np.allclose((d[["open", "high", "low", "close"]] * 4) % 1, 0)),
        "duplicate_timestamps_dropped": dups,
        "globex_open_ny": ts[gap >= 30].dt.strftime("%H:%M").value_counts().head(3).to_dict(),
        "rth_sessions_seen": rep["sessions_seen"], "rth_sessions_kept": int(r.day.nunique()),
        "dropped_short_sessions": rep["sessions_dropped_short"],
        "zero_volume_minutes_filled": filled, "rth_minutes": int(len(r)),
        "in_session_jumps_gt_0p4pct": big,
        "rth_volume_per_session_by_year": vol,
        "contract": "unadjusted front-month continuous; rolls show as gaps at the Globex open, which RTH-only features never span",
        "bar_stamp": "bar start (the 09:30 NY bar carries the opening-auction volume)",
    }


def proxy_validity():
    p = REPO / "analysis/output/footprint/NQ_12-26_2026-10-30_nt8_tickrule.json"
    D = json.loads(p.read_text())
    m = pd.DataFrame(D["minutes"])
    m["vol"] = m.buy + m.sell
    m["open"] = m.close.shift()
    m = m.dropna().reset_index(drop=True)
    dp = m.close - m.open
    sig = dp.rolling(60, min_periods=20).std().shift()
    m["bvc"] = m.vol * (2 * norm.cdf(dp / sig) - 1)
    rng = (m.high - m.low).replace(0, np.nan)
    m["clv"] = (m.vol * ((m.close - m.low) - (m.high - m.close)) / rng).fillna(0)
    m["tickrule_bar"] = m.vol * np.sign(dp)
    m = m.dropna().reset_index(drop=True)
    out = {"day": D["day"], "instrument": D["instrument"], "minutes": int(len(m)), "true_delta": D["rule"]}
    for B in (1, 5, 15):
        g = m.groupby(np.arange(len(m)) // B).agg(delta=("delta", "sum"), bvc=("bvc", "sum"), clv=("clv", "sum"),
                                                  tick=("tickrule_bar", "sum"), c=("close", "last"), o=("open", "first"),
                                                  v=("vol", "sum"))
        ret = g.c - g.o
        X = np.column_stack([np.ones(len(g)), ret])
        res_true = g.delta - X @ np.linalg.lstsq(X, g.delta, rcond=None)[0]
        row = {"n_bars": int(len(g)), "corr_true_delta_vs_bar_return": float(np.corrcoef(g.delta, ret)[0, 1])}
        for k in ("bvc", "clv", "tick"):
            res_k = g[k] - X @ np.linalg.lstsq(X, g[k], rcond=None)[0]
            row[f"corr_{k}_vs_true"] = float(np.corrcoef(g[k], g.delta)[0, 1])
            row[f"corr_{k}_residual_vs_true_residual"] = float(np.corrcoef(res_k, res_true)[0, 1])
        out[f"{B}min"] = row
    out["reading"] = ("True delta is mostly price: r(delta, bar return) is the share an OHLCV proxy can carry. "
                      "The residual correlations measure how much of the part price does not explain (the absorption "
                      "signal) each proxy recovers. One day; descriptive only.")
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    q = {"dataset": dataset_checks(), "proxy_validity": proxy_validity()}
    (OUT / "data_quality.json").write_text(json.dumps(q, indent=1, default=str))
    print(json.dumps(q["proxy_validity"], indent=1))
    print({k: v for k, v in q["dataset"].items() if k not in ("dropped_short_sessions",)})


if __name__ == "__main__":
    main()
