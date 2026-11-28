"""residual-g10-layers: fetch OANDA daily mid closes at 17:00 New York for the 9 G10 USD pairs.

Run this where OANDA is reachable (the laptop or Railway; the research sandbox gets 403):

    python scripts/residual-g10-layers/fetch_oanda_daily.py
    python scripts/residual-g10-layers/g10.py oanda

Read-only: it reads candles and writes one CSV; it never places orders or writes to R2.
Credentials: OANDA_KEY in the environment (or RegimeV2/.env, the same lookup as
scripts/residual-fx8-forward/record.py); practice host by default, OANDA_ENV=live for the live host.

Candles: granularity=D, price=M, alignmentTimezone=America/New_York, dailyAlignment=17 (the forward record's
convention, checked identical to analysis/output/residual-pca-family/panel_daily.csv on 2025-06 -> 2026-08).
Each candle is labelled by the New York date it CLOSES on. Nothing after 2026-08-20 is kept (lockbox).
Output: analysis/output/residual-g10-layers/oanda/daily_1700ny.csv
"""
import json
import os
import time
import urllib.request

import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "analysis/output/residual-g10-layers/oanda")
PAIRS = ["EUR_USD", "GBP_USD", "AUD_USD", "NZD_USD", "USD_JPY", "USD_CAD", "USD_CHF", "USD_NOK", "USD_SEK"]
FROM, END = "2016-01-01", pd.Timestamp("2026-08-20")


def env():
    k = os.environ.get("OANDA_KEY")
    f = os.path.join(ROOT, "RegimeV2", ".env")
    if not k and os.path.exists(f):
        for line in open(f, encoding="utf-8").read().splitlines():
            if "=" in line and not line.startswith("#"):
                a, b = line.split("=", 1)
                if a.strip() == "OANDA_KEY":
                    k = b.strip().strip("\"'")
    host = "https://api-fxtrade.oanda.com" if os.environ.get("OANDA_ENV") == "live" else "https://api-fxpractice.oanda.com"
    return k, host


def get(url, key):
    for i in range(4):
        try:
            req = urllib.request.Request(url, headers={"Authorization": "Bearer " + key})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception:
            if i == 3:
                raise
            time.sleep(2 * (i + 1))


def candles(ins, key, host):
    tail = "&alignmentTimezone=America/New_York&dailyAlignment=17"
    url = f"{host}/v3/instruments/{ins}/candles?price=M&granularity=D&from={FROM}T00:00:00Z{tail}"
    cs = []
    while True:
        j = get(url, key)["candles"]
        cs += [x for x in j if x["complete"]]
        if len(j) < 500:
            break
        nxt = pd.Timestamp(j[-1]["time"]) + pd.Timedelta(hours=1)
        url = url.split("&from=")[0] + f"&from={nxt.strftime('%Y-%m-%dT%H:%M:%SZ')}{tail}"
    s = {(pd.Timestamp(x["time"]).tz_convert("America/New_York") + pd.Timedelta(hours=7)).normalize().tz_localize(None):
         float(x["mid"]["c"]) for x in cs}
    return pd.Series(s)


def main():
    key, host = env()
    if not key:
        raise SystemExit("no OANDA_KEY (environment or RegimeV2/.env)")
    os.makedirs(OUT, exist_ok=True)
    px = pd.DataFrame({ins.replace("_", ""): candles(ins, key, host) for ins in PAIRS}).sort_index()
    px = px[~px.index.duplicated()]
    px = px[(px.index.dayofweek < 5) & (px.index <= END)]
    px.index.name = "date"
    px.to_csv(os.path.join(OUT, "daily_1700ny.csv"), float_format="%.6f")
    print(px.shape, px.index[0].date(), "->", px.index[-1].date())
    print(px.notna().sum().to_dict())


if __name__ == "__main__":
    main()
