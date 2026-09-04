"""Data fetch for the Nasdaq Macro Lead study.

Two independent feature sets, both aligned to NAS100 H4 bars:

  "fast" — continuously-quoted OANDA instruments (bond CFDs, a USD basket
           built from majors, gold). These update every bar, so they carry
           genuine same-session information a 4h horizon can use.
  "fred" — the classic daily yield series (2Y/10Y/slope/real yield/breakeven)
           from analysis/yield_asset_coupling.py, forward-filled onto H4 bars
           with their real publication lag. Included for comparison: these
           are what the daily-horizon study already found NO forward edge
           in for NDX — seeing them fail again at H4 is itself informative.

Every fetch degrades gracefully: a bad/unavailable instrument logs a warning
and is dropped from the feature set rather than crashing the run. Bond CFD
instrument codes (USB02Y_USD / USB10Y_USD) are the standard OANDA v20 names
but aren't used elsewhere in this repo, so this is the one part of the
pipeline that hasn't been exercised against the live API — the None-safe
handling here is deliberate, not an afterthought.
"""
from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import requests

log = logging.getLogger("nasdaq_macro_lead.data")

OANDA_BASE_LIVE = "https://api-fxtrade.oanda.com"
OANDA_BASE_PRACTICE = "https://api-fxpractice.oanda.com"

TARGET_INSTRUMENT = "NAS100_USD"

# Continuously-quoted proxies for the "fast" feature set.
FAST_INSTRUMENTS = {
    "bond10": "USB10Y_USD",   # 10Y UST CFD (price ~ inverse of the 10Y yield)
    "bond2":  "USB02Y_USD",   # 2Y UST CFD  (price ~ inverse of the 2Y yield)
    "gold":   "XAU_USD",
    # USD basket legs — sign convention applied in engine.py (USD_JPY/USD_CAD/
    # USD_CHF rise with a stronger dollar; the rest fall).
    "eurusd": "EUR_USD",
    "gbpusd": "GBP_USD",
    "audusd": "AUD_USD",
    "nzdusd": "NZD_USD",
    "usdjpy": "USD_JPY",
    "usdcad": "USD_CAD",
    "usdchf": "USD_CHF",
}

# Daily FRED series for the "fred" feature set (mirrors analysis/yield_asset_coupling.py).
FRED_SERIES = {
    "y2":     "DGS2",
    "y10":    "DGS10",
    "real10": "DFII10",
    "be10":   "T10YIE",
}
FRED_PUB_LAG_DAYS = 1   # yields print ~3pm ET; treat same-UTC-day bars as not-yet-knowable


def oanda_key() -> str:
    key = os.environ.get("OANDA_KEY")
    if not key:
        raise SystemExit("OANDA_KEY not set — this only works where Railway injects it")
    return key


def fred_key() -> str:
    key = os.environ.get("FRED_KEY") or os.environ.get("FRED_API_KEY")
    if not key:
        raise SystemExit("FRED_KEY not set — this only works where Railway injects it")
    return key


def fetch_oanda_h4(instrument: str, api_key: str, count: int = 5000,
                   env: str = "live") -> pd.DataFrame | None:
    """Latest `count` H4 candles for `instrument`. One call — 5000 H4 bars is
    ~2.3 years, well within OANDA's per-request cap, so no pagination needed.
    Returns None (not raises) on any failure — callers drop the feature."""
    base = OANDA_BASE_LIVE if env == "live" else OANDA_BASE_PRACTICE
    url = (f"{base}/v3/instruments/{instrument}/candles"
           f"?granularity=H4&price=M&count={min(count, 5000)}")
    try:
        r = requests.get(url, headers={"Authorization": f"Bearer {api_key}"}, timeout=30)
        r.raise_for_status()
        candles = [c for c in r.json().get("candles", []) if c.get("complete") and c.get("mid")]
    except Exception as e:
        log.warning("OANDA %s fetch failed: %r", instrument, e)
        return None
    if not candles:
        log.warning("OANDA %s: no candles returned", instrument)
        return None
    rows = [{
        "time":  pd.Timestamp(c["time"]).tz_convert("UTC"),
        "open":  float(c["mid"]["o"]),
        "high":  float(c["mid"]["h"]),
        "low":   float(c["mid"]["l"]),
        "close": float(c["mid"]["c"]),
    } for c in candles]
    df = pd.DataFrame(rows).drop_duplicates("time").set_index("time").sort_index()
    log.info("OANDA %-12s %5d H4 bars  %s -> %s", instrument, len(df),
             df.index[0], df.index[-1])
    return df


def fetch_fast_bars(api_key: str, count: int = 5000, env: str = "live") -> dict[str, pd.DataFrame]:
    out: dict[str, pd.DataFrame] = {}
    for name, inst in {"target": TARGET_INSTRUMENT, **FAST_INSTRUMENTS}.items():
        df = fetch_oanda_h4(inst, api_key, count=count, env=env)
        if df is not None:
            out[name] = df
        time.sleep(0.2)   # be polite — this is a research job, not latency-sensitive
    return out


def fetch_fred(api_key: str, start: str = "2015-01-01") -> pd.DataFrame:
    """Daily {y2, y10, slope, real10, be10}, oldest first. Same series and
    math as analysis/yield_asset_coupling.py's yields.csv."""
    cols: dict[str, pd.Series] = {}
    for name, sid in FRED_SERIES.items():
        try:
            r = requests.get(
                "https://api.stlouisfed.org/fred/series/observations",
                params=dict(series_id=sid, api_key=api_key, file_type="json",
                            observation_start=start),
                timeout=30,
            )
            r.raise_for_status()
            vals = {}
            for o in r.json().get("observations", []):
                v = o["value"]
                vals[pd.Timestamp(o["date"], tz="UTC")] = np.nan if v in (".", "") else float(v)
            cols[name] = pd.Series(vals, name=name).sort_index()
            log.info("FRED %-8s %5d obs", sid, cols[name].notna().sum())
        except Exception as e:
            log.warning("FRED %s fetch failed: %r", sid, e)
            cols[name] = pd.Series(dtype=float)
    df = pd.DataFrame(cols).sort_index()
    if "y10" in df and "y2" in df:
        df["slope"] = df["y10"] - df["y2"]
    return df
