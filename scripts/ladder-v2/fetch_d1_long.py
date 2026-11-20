"""Long NY-close daily history from OANDA, read-only, for GARCH parameter fits (gold prereg A3).

    railway run python scripts/ladder-v2/fetch_d1_long.py GOLD NQ    -> analysis/output/ladder-v2-data/<SYM>_d1_long.parquet

OANDA `granularity=D`, mid prices, `dailyAlignment=17`, `alignmentTimezone=America/New_York`: the same bar the live
σ uses (`fetchD1Aligned`). Index = the NY trading date the bar closes on (17:00 New York), matching
scripts/ladder-v2/ladder.py ny_bars keys. Complete bars only. Nothing is written anywhere but the local file.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
INST = {"GOLD": "XAU_USD", "NQ": "NAS100_USD", "SPX500": "SPX500_USD", "US30": "US30_USD", "US2000": "US2000_USD", "EURUSD": "EUR_USD"}
INST.update({"DE30": "DE30_EUR", "UK100": "UK100_GBP", "SILVER": "XAG_USD", "COPPER": "XCU_USD", "PLATINUM": "XPT_USD",
             "PALLADIUM": "XPD_USD", "WTI": "WTICO_USD", "BRENT": "BCO_USD", "NATGAS": "NATGAS_USD",
             "SOYBEAN": "SOYBN_USD", "WHEAT": "WHEAT_USD", "CORN": "CORN_USD", "SUGAR": "SUGAR_USD"})


def inst(s):
    """OANDA name; any 6-letter FX pair maps to XXX_YYY (ladder-v2 rollout)."""
    return INST.get(s) or (f"{s[:3]}_{s[3:]}" if len(s) == 6 and s.isalpha() else None)


def get(inst, start, end):
    host = "api-fxtrade.oanda.com" if os.environ.get("OANDA_ENV", "practice").lower() in ("live", "trade") else "api-fxpractice.oanda.com"
    q = (f"granularity=D&price=M&dailyAlignment=17&alignmentTimezone=America%2FNew_York"
         f"&from={start}T00:00:00Z&to={end}T00:00:00Z")
    req = urllib.request.Request(f"https://{host}/v3/instruments/{inst}/candles?{q}",
                                 headers={"Authorization": f"Bearer {os.environ['OANDA_KEY']}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())["candles"]


def main(syms):
    out = ROOT / "analysis/output/ladder-v2-data"
    out.mkdir(parents=True, exist_ok=True)
    for s in syms:
        if inst(s) is None:
            print(f"{s}: no OANDA instrument (futures only), skipped")
            continue
        rows = []
        for a, b in (("2004-01-01", "2012-01-01"), ("2012-01-01", "2019-01-01")):
            for c in get(inst(s), a, b):
                if c.get("complete"):
                    m = c["mid"]
                    rows.append({"t": c["time"], "open": float(m["o"]), "high": float(m["h"]), "low": float(m["l"]),
                                 "close": float(m["c"])})
        d = pd.DataFrame(rows).drop_duplicates("t")
        start = pd.to_datetime(d.pop("t"), utc=True)          # bar open (17:00 NY of the previous day)
        d.index = (start.dt.tz_convert("America/New_York").dt.tz_localize(None) + pd.Timedelta(hours=7)).dt.normalize()
        d = d[~d.index.duplicated()].sort_index()
        d.to_parquet(out / f"{s}_d1_long.parquet")
        print(f"{s} ({inst(s)}): {len(d)} NY-close bars {d.index.min().date()} -> {d.index.max().date()}")


if __name__ == "__main__":
    main([a.upper() for a in sys.argv[1:]] or ["GOLD", "NQ"])
