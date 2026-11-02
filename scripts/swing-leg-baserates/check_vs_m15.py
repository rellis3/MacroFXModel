#!/usr/bin/env python3
"""Data check: Yahoo daily closes vs the repo's own OANDA M15 closes (analysis/output/rates_residual/m15/), on the
overlap. Daily from M15 = last M15 close of each UTC date. Reports return correlation, share of days whose daily
returns differ by more than 0.5 sigma, and the largest level gap. Writes data_check.json."""
import json, numpy as np, pandas as pd
DIR = "analysis/output/swing-leg-baserates"
MAP = {"EURUSD": "EUR_USD", "GBPUSD": "GBP_USD", "USDJPY": "USD_JPY", "AUDUSD": "AUD_USD", "USDCAD": "USD_CAD",
       "USDCHF": "USD_CHF", "XAUUSD": "XAU_USD", "XAGUSD": "XAG_USD", "NAS100": "NAS100_USD", "SPX500": "SPX500_USD", "DE30": "DE30_EUR"}
out = {}
for k, f in MAP.items():
    y = pd.read_csv(f"{DIR}/daily/{k}.csv", parse_dates=["date"]).set_index("date")["close"]
    m = pd.read_parquet(f"analysis/output/rates_residual/m15/{f}.parquet")["close"]
    md = m.groupby(m.index.normalize()).last()
    j = pd.concat([y.rename("y"), md.rename("m")], axis=1, join="inner").dropna()
    j = j[j.index.dayofweek < 5]
    ry, rm = np.log(j["y"]).diff(), np.log(j["m"]).diff()
    sig = rm.rolling(60, min_periods=20).std()
    out[k] = {"days": int(len(j)), "from": str(j.index[0].date()), "to": str(j.index[-1].date()),
              "ret_corr": round(float(ry.corr(rm)), 3),
              "share_ret_diff_gt_half_sigma": round(float(((ry - rm).abs() > 0.5 * sig).mean()), 3),
              "median_level_gap_pct": round(float((j["y"] / j["m"] - 1).abs().median() * 100), 3),
              "max_level_gap_pct": round(float((j["y"] / j["m"] - 1).abs().max() * 100), 2)}
    print(k, out[k])
json.dump(out, open(f"{DIR}/data_check.json", "w"), indent=1)
