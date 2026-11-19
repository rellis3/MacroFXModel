"""Recent OANDA bars for the ladder-v2 shadow export, read-only.

    railway run python scripts/ladder-v2/fetch_recent.py GOLD EURUSD NQ
        -> analysis/output/ladder-v2-data/<SYM>_d1_recent.parquet  (NY-close daily bars, 2015 -> last complete)
           analysis/output/ladder-v2-data/<SYM>_m5_recent.parquet  (5-minute mid candles, 2026-05-01 -> now)

Daily: `granularity=D`, mid, `dailyAlignment=17`, America/New_York (the live σ bar). Index = the NY trading date the
bar closes on (same key as scripts/ladder-v2/ladder.py ny_bars). 5-minute: mid, index = candle start (UTC).
Complete candles only. Nothing is written anywhere but these local files.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
import urllib.request
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
INST = {"GOLD": "XAU_USD", "NQ": "NAS100_USD", "EURUSD": "EUR_USD", "SPX500": "SPX500_USD", "US30": "US30_USD",
        "US2000": "US2000_USD"}
M5_START = dt.datetime(2026, 5, 1)


def get(inst, gran, start, end, extra=""):
    host = "api-fxtrade.oanda.com" if os.environ.get("OANDA_ENV", "practice").lower() in ("live", "trade") else "api-fxpractice.oanda.com"
    q = f"granularity={gran}&price=M{extra}&from={start:%Y-%m-%dT%H:%M:%SZ}&to={end:%Y-%m-%dT%H:%M:%SZ}"
    req = urllib.request.Request(f"https://{host}/v3/instruments/{inst}/candles?{q}",
                                 headers={"Authorization": f"Bearer {os.environ['OANDA_KEY']}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return [c for c in json.loads(r.read())["candles"] if c.get("complete")]


def frame(cands):
    d = pd.DataFrame([{"t": c["time"], "open": float(c["mid"]["o"]), "high": float(c["mid"]["h"]),
                       "low": float(c["mid"]["l"]), "close": float(c["mid"]["c"])} for c in cands]).drop_duplicates("t")
    d.index = pd.to_datetime(d.pop("t"), utc=True)
    return d.sort_index()


def main(syms):
    out = ROOT / "analysis/output/ladder-v2-data"
    out.mkdir(parents=True, exist_ok=True)
    now = dt.datetime.now(dt.UTC).replace(tzinfo=None, second=0, microsecond=0)
    for s in syms:
        parts, a = [], dt.datetime(2015, 1, 1)
        while a < now:
            b = min(a + dt.timedelta(days=3000), now)
            parts += get(INST[s], "D", a, b, "&dailyAlignment=17&alignmentTimezone=America%2FNew_York")
            a = b
        d = frame(parts)
        d.index = (d.index.tz_convert("America/New_York").tz_localize(None) + pd.Timedelta(hours=7)).normalize()
        d = d[~d.index.duplicated()]
        d.to_parquet(out / f"{s}_d1_recent.parquet")
        msg = f"{s}: {len(d)} NY-close bars {d.index.min().date()} -> {d.index.max().date()}"
        if s in ("GOLD", "EURUSD", "NQ"):
            parts, a = [], M5_START
            while a < now:
                b = min(a + dt.timedelta(days=15), now)
                parts += get(INST[s], "M5", a, b)
                a = b
            m = frame(parts)
            m.to_parquet(out / f"{s}_m5_recent.parquet")
            msg += f"; {len(m)} M5 candles {m.index.min()} -> {m.index.max()}"
        print(msg, flush=True)


if __name__ == "__main__":
    main([a.upper() for a in sys.argv[1:]] or ["GOLD", "EURUSD", "NQ"])
