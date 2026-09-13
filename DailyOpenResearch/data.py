"""
Data layer for the Daily-Open research suite.

Loads the M1 parquet files in VolRangeForecaster/data/m1/ (UTC timestamps,
OHLC + tick volume) and buckets every bar into an *anchored day*.

The anchor is the whole point of this suite: retail "daily open" traders use
their broker's daily candle, which for the feed in this repo opens at
17:00 New York (the data has a daily break 17:00-18:00 NY on gold and NQ).
That is 23:00 UK for all but the two or three weeks a year when US and UK
daylight-saving switches disagree.  Every study takes the anchor as a
parameter so "which open actually matters?" is itself a testable question.
"""
from __future__ import annotations

import os
import numpy as np
import pandas as pd
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
M1_DIR = os.path.join(HERE, "..", "VolRangeForecaster", "data", "m1")

# Instrument metadata: point size used for "pips"/"points" reporting, and a
# realistic round-trip cost (spread + slippage) in price units for the
# strategy simulations.  These are deliberately conservative retail numbers.
INSTRUMENTS = {
    "gold":   {"label": "Gold (XAUUSD)",  "point": 0.01,  "cost": 0.30,    "digits": 2},
    "nq":     {"label": "Nasdaq (NAS100)", "point": 0.1,   "cost": 1.50,    "digits": 1},
    "eurusd": {"label": "EURUSD",          "point": 0.0001, "cost": 0.00015, "digits": 5},
}

# Anchor definitions. Each is (timezone, hour).  The day containing a bar is
# the most recent anchor instant at or before the bar's timestamp.
ANCHORS = {
    "broker":   ("America/New_York", 17),   # broker daily candle (23:00 UK most of the year)
    "london23": ("Europe/London",    23),   # literal 11pm UK, all year
    "utc22":    ("UTC",              22),   # fixed 22:00 UTC (TradingView-style for some feeds)
    "london00": ("Europe/London",     0),   # London midnight (this repo's other engines)
    "tokyo":    ("UTC",               0),   # 09:00 Tokyo
    "london08": ("Europe/London",     8),   # London cash open
    "ny0930":   ("America/New_York",  9),   # NY cash open hour (9:00; see day_minute for :30 offset)
}


def load_m1(pair: str) -> pd.DataFrame:
    path = os.path.join(M1_DIR, f"{pair}_m1.parquet")
    df = pd.read_parquet(path)
    df = df[["open", "high", "low", "close", "volume"]].astype("float64")
    df = df[~df.index.duplicated(keep="first")].sort_index()
    # drop bars with impossible OHLC
    ok = (df.high >= df.low) & (df.high >= df.open) & (df.high >= df.close) & (df.low <= df.open) & (df.low <= df.close)
    return df[ok]


def anchor_day_ids(index: pd.DatetimeIndex, anchor: str) -> tuple[np.ndarray, np.ndarray]:
    """Return (day_key as int YYYYMMDD of the *anchor date*, minutes since that anchor).

    The anchor date is the calendar date (in the anchor's timezone) on which
    the anchor instant fell.  For the broker anchor, the day that opens
    17:00 NY Sunday is keyed to Sunday's date.
    """
    tz, hour = ANCHORS[anchor]
    minute_off = 30 if anchor == "ny0930" else 0
    local = index.tz_convert(ZoneInfo(tz))
    # minutes since local midnight
    mins = local.hour * 60 + local.minute
    anchor_min = hour * 60 + minute_off
    before = mins < anchor_min
    dates = local.normalize()
    anchor_date = dates - pd.to_timedelta(before.astype(int), unit="D")
    key = (anchor_date.year * 10000 + anchor_date.month * 100 + anchor_date.day).to_numpy()
    # minutes since anchor: compute anchor instant per bar then diff
    anchor_instant = anchor_date + pd.Timedelta(minutes=anchor_min)
    # tz-aware subtraction handles DST correctly (anchor_instant is in local tz)
    ms = ((local - anchor_instant) / pd.Timedelta(minutes=1)).to_numpy().astype(np.int32)
    return key, ms


class Days:
    """Anchored-day view over a packed M1 frame with fast per-day slicing."""

    def __init__(self, df: pd.DataFrame, anchor: str, min_bars: int = 600):
        self.df = df
        self.anchor = anchor
        self.t = df.index
        self.o = df.open.to_numpy(); self.h = df.high.to_numpy(); self.l = df.low.to_numpy()
        self.c = df.close.to_numpy(); self.v = df.volume.to_numpy()
        key, ms = anchor_day_ids(df.index, anchor)
        self.key = key; self.ms = ms
        # London-local clock for every bar (fractional hours), used by the
        # session studies (Asia -> London -> NY are wall-clock concepts)
        loc = df.index.tz_convert(ZoneInfo("Europe/London"))
        self.lh = (loc.hour + loc.minute / 60.0).to_numpy()
        # contiguous runs of the same key (data is sorted)
        change = np.flatnonzero(np.diff(key) != 0) + 1
        starts = np.concatenate([[0], change]); ends = np.concatenate([change, [len(key)]])
        keep = (ends - starts) >= min_bars
        self.starts = starts[keep]; self.ends = ends[keep]; self.keys = key[starts[keep]]
        self.n = len(self.starts)
        # day-level OHLC
        self.d_open = self.o[self.starts]
        self.d_close = self.c[self.ends - 1]
        self.d_high = np.array([self.h[s:e].max() for s, e in zip(self.starts, self.ends)])
        self.d_low = np.array([self.l[s:e].min() for s, e in zip(self.starts, self.ends)])
        self.d_range = self.d_high - self.d_low
        # trailing ADR (median of previous 20 day ranges, strictly prior)
        r = pd.Series(self.d_range)
        self.adr20 = r.shift(1).rolling(20, min_periods=10).median().to_numpy()
        self.adr100 = r.shift(1).rolling(100, min_periods=40).median().to_numpy()
        self.vol_ratio = self.adr20 / self.adr100
        # local weekday of the anchor date and date string
        self.dates = pd.to_datetime(self.keys.astype(str), format="%Y%m%d")
        self.dow = self.dates.dayofweek.to_numpy()  # 0=Mon
        self.year = self.dates.year.to_numpy()
        # weekday label uses the *trading* day: a broker day opening Sunday 17:00 NY is "Monday"
        if anchor in ("broker", "london23", "utc22"):
            self.trade_dow = (self.dow + 1) % 7
        else:
            self.trade_dow = self.dow

    def day(self, i: int):
        s, e = self.starts[i], self.ends[i]
        return slice(s, e)

    def arrays(self, i: int):
        """Per-day arrays. Minutes are relative to the day's FIRST BAR (what a
        trader watching the first candle of the day actually sees), not to the
        nominal anchor instant - on gold/NQ the first bar prints an hour after
        the 17:00 NY boundary because of the CME break."""
        sl = self.day(i)
        ms = self.ms[sl]
        return self.o[sl], self.h[sl], self.l[sl], self.c[sl], self.v[sl], ms - ms[0]

    def london_hours(self, i: int):
        return self.lh[self.day(i)]

    def valid(self, i: int) -> bool:
        return np.isfinite(self.adr20[i]) and self.adr20[i] > 0

    def is_weekend_day(self, i: int) -> bool:
        return self.trade_dow[i] >= 5


def vol_regime(days: Days, i: int) -> str:
    r = days.vol_ratio[i]
    if not np.isfinite(r):
        return "unknown"
    return "quiet" if r < 0.85 else ("heavy" if r > 1.25 else "normal")


DOW_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
