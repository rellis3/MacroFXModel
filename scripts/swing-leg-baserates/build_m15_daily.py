#!/usr/bin/env python3
"""Primary source for swing-leg-baserates: the repo's own OANDA M15 closes (analysis/output/rates_residual/m15/),
2018-01 -> 2026-10-07, cut into New York-close daily bars (17:00 America/New_York, as live OANDA D; data-rules
item 2). Close-only: the M15 files carry no high/low, so open/high/low are written as the close (the study uses
closes only). Writes analysis/output/swing-leg-baserates/daily_m15/<KEY>.csv.
Yahoo daily (fetch_daily.py) is the robustness source: its FX/gold closes are sampled at a different hour
(return correlation with these bars ~0.6, levels within 0.02% median; see data_check.json)."""
import os, pandas as pd
DIR = "analysis/output/swing-leg-baserates/daily_m15"
MAP = {"EURUSD": "EUR_USD", "GBPUSD": "GBP_USD", "USDJPY": "USD_JPY", "AUDUSD": "AUD_USD", "USDCAD": "USD_CAD",
       "USDCHF": "USD_CHF", "XAUUSD": "XAU_USD", "XAGUSD": "XAG_USD", "NAS100": "NAS100_USD", "SPX500": "SPX500_USD", "DE30": "DE30_EUR"}
os.makedirs(DIR, exist_ok=True)
for k, f in MAP.items():
    m = pd.read_parquet(f"analysis/output/rates_residual/m15/{f}.parquet")["close"]
    t = m.index.tz_localize("UTC").tz_convert("America/New_York")
    # a bar stamped 17:00 NY opens the next session; +7h moves 17:00 to midnight, so .date() is the session date
    sess = (t + pd.Timedelta(hours=7)).date
    d = m.groupby(sess).last()
    d.index = pd.to_datetime(d.index)
    d = d[d.index.dayofweek < 5]
    pd.DataFrame({"date": d.index.strftime("%Y-%m-%d"), "open": d.values, "high": d.values, "low": d.values, "close": d.values}).to_csv(f"{DIR}/{k}.csv", index=False)
    print(k, len(d), d.index[0].date(), d.index[-1].date())
