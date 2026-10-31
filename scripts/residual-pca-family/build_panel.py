"""residual-pca-family, stage 1: the daily price panel (prices only, no outcomes).

All closes are the last price at or before 17:00 America/New_York, per New York trading day
(17:00 ET the day before -> 17:00 ET, labelled by the date it closes), the same convention as
education/residual_pca_currency_test (the micro bank q1 test) and scripts/dynlead/build_panels.py.

  FX majors, GOLD, 6 index CFDs : analysis/output/dynlead/assets_daily.parquet (OANDA M1, to 2026-08-20)
  XAGUSD                        : analysis/output/rates_residual/m15/XAG_USD.parquet (OANDA M15, UTC, 2018-01 ->)
                                  last 15-minute bar starting <= 16:45 ET (it closes at 17:00)
Lockbox: nothing after 2026-08-20 (the H-A holdout starts after 2026-08-21).
Output: analysis/output/residual-pca-family/panel_daily.csv, panel_audit.json
"""
import json
import os

import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "analysis", "output", "residual-pca-family")
END = pd.Timestamp("2026-08-20")


def ny_close_from_m15(path):
    s = pd.read_parquet(path)["close"].dropna()
    idx = s.index
    idx = idx.tz_localize("UTC") if idx.tz is None else idx.tz_convert("UTC")
    ny = idx.tz_convert("America/New_York")
    day = (ny + pd.Timedelta(hours=7)).normalize().tz_localize(None)
    s = pd.Series(s.values, index=day)
    g = s.groupby(level=0).last()
    cnt = s.groupby(level=0).count()
    return g[(cnt >= 4) & (g.index.dayofweek < 5)]


def main():
    a = pd.read_parquet(os.path.join(ROOT, "analysis/output/dynlead/assets_daily.parquet"))
    a.index = pd.to_datetime(a.index).tz_localize(None) if getattr(a.index, "tz", None) else pd.to_datetime(a.index)
    keep = ["EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDJPY", "USDCAD", "USDCHF", "GOLD",
            "NAS100", "SPX500", "US30", "US2000", "DE30", "UK100"]
    p = a[keep].copy()
    xag = ny_close_from_m15(os.path.join(ROOT, "analysis/output/rates_residual/m15/XAG_USD.parquet"))
    xau15 = ny_close_from_m15(os.path.join(ROOT, "analysis/output/rates_residual/m15/XAU_USD.parquet"))
    p["XAGUSD"] = xag
    p = p[(p.index <= END) & (p.index.dayofweek < 5)]
    # consistency check of the M15 clock against the M1 panel, on gold (prices only)
    j = pd.concat([p["GOLD"], xau15], axis=1, keys=["m1", "m15"]).dropna()
    rel = (j.m15 / j.m1 - 1).abs()
    audit = {
        "rows": int(len(p)), "first": str(p.index.min().date()), "last": str(p.index.max().date()),
        "non_null": {c: int(p[c].notna().sum()) for c in p.columns},
        "first_valid": {c: str(p[c].first_valid_index().date()) for c in p.columns},
        "gold_m15_vs_m1_close": {"days": int(len(j)), "median_abs_rel_diff": float(rel.median()),
                                 "p99_abs_rel_diff": float(rel.quantile(0.99)),
                                 "daily_return_corr": float(np.log(j).diff().corr().iloc[0, 1])},
    }
    p.index.name = "date"
    p.to_csv(os.path.join(OUT, "panel_daily.csv"), float_format="%.6f")
    json.dump(audit, open(os.path.join(OUT, "panel_audit.json"), "w"), indent=1)
    print(json.dumps(audit, indent=1))


if __name__ == "__main__":
    main()
