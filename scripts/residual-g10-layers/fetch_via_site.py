"""residual-g10-layers: build the 17:00 New York daily closes for the 9 G10 USD pairs through the live site.

The research sandbox has no working OANDA key, and the owner runs nothing locally. The deployed server
(Railway, which holds OANDA_KEY) serves OANDA candles read-only at GET /api/ohlc-range. Its daily candles are
aligned to London midnight, so this script asks for hourly mid candles (H1) and takes, for each New York
date, the close of the hour that starts at 16:00 America/New_York: that close is the last price at 17:00 NY,
the same value as OANDA's D candle with dailyAlignment=17 (the forward record's convention).

    python scripts/residual-g10-layers/fetch_via_site.py
    python scripts/residual-g10-layers/g10.py oanda      # asserts FX8 reproduces 0.432 / 0.378 first

Read-only (GET only). Nothing after 2026-08-20 is kept (lockbox).
Output: analysis/output/residual-g10-layers/oanda/daily_1700ny.csv (same file fetch_oanda_daily.py writes)
"""
import json
import os
import time
import urllib.request

import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "analysis/output/residual-g10-layers/oanda")
BASE = "https://macrofxmodel-production.up.railway.app"
PAIRS = ["EUR_USD", "GBP_USD", "AUD_USD", "NZD_USD", "USD_JPY", "USD_CAD", "USD_CHF", "USD_NOK", "USD_SEK"]
END = pd.Timestamp("2026-08-20")


def get(url):
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "macrofx-research"}), timeout=300) as r:
                return json.load(r)
        except Exception:
            if i == 3:
                raise
            time.sleep(5 * (i + 1))


def closes_1700ny(pair):
    rows = []
    for y in range(2015, 2027):
        frm, to = f"{y}-12-28" if y == 2015 else f"{y}-01-01", "2026-08-21" if y == 2026 else f"{y}-12-31"
        if y == 2015:
            frm, to = "2015-12-28", "2015-12-31"
        d = get(f"{BASE}/api/ohlc-range?symbol={pair}&granularity=H1&from={frm}&to={to}")
        rows += [(int(v["t"]), float(v["close"])) for v in d.get("values", [])]
    s = pd.Series(dict(rows)).sort_index()
    start_ny = pd.to_datetime(s.index, unit="s", utc=True).tz_convert("America/New_York")
    keep = start_ny.hour == 16                                  # the 16:00-17:00 NY hour; its close is the 17:00 price
    day = start_ny[keep].normalize().tz_localize(None)
    out = pd.Series(s.values[keep], index=day)
    out = out[~out.index.duplicated(keep="last")]
    print(pair, len(s), "hourly ->", len(out), "closes", out.index.min().date(), "->", out.index.max().date())
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    px = pd.DataFrame({p.replace("_", ""): closes_1700ny(p) for p in PAIRS}).sort_index()
    px = px[(px.index.dayofweek < 5) & (px.index <= END) & (px.index >= "2016-01-01")]
    px.index.name = "date"
    px.to_csv(os.path.join(OUT, "daily_1700ny.csv"), float_format="%.6f")
    print(px.shape, px.notna().sum().to_dict())


if __name__ == "__main__":
    main()
