"""bars — the causal bar substrate every other forge layer stands on.

Three jobs, all boring and all load-bearing:

  * **Resample** M1 → any higher timeframe, dropping the empty bins that a
    24/5 instrument's weekend leaves behind (a naive `.resample()` invents
    NaN candles across the weekend gap; those would become fake FVGs and fake
    order blocks two layers up).
  * **Key** every bar by trading day / week / month, and label its session.
    The day boundary is a *parameter*, not a constant — "the daily open" means
    00:00 UTC to one trader and 22:00 UTC (MT5 broker midnight) to another,
    and which one you pick changes every daily-open, pivot and volume-profile
    level downstream. Making it a knob means the engine can be asked which
    one the data prefers instead of inheriting someone's habit.
  * **Normalize scale.** Gold ran $1,063 → $4,328 across this dataset. Any
    level distance, stop, or target expressed in dollars means something
    different in 2016 than in 2026, so everything downstream is expressed in
    ATR units and this module is where ATR comes from.

ATR itself is imported from `pylego.swing_structure` — one Wilder recursion in
this repo, not two.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from pylego.swing_structure import atr as _wilder_atr

# Session windows in UTC hours, [start, end). Gold/FX convention: the Asian
# session runs from the Sydney/Tokyo open through the London pre-open, London
# owns the morning, and "NY" here means the London/NY overlap through the
# London close, which is where the day's range is most often completed.
SESSIONS = {
    "asia":   (0, 7),
    "london": (7, 12),
    "ny":     (12, 17),
    "late":   (17, 24),
}

TF_RULES = {
    "m1": "1min", "m5": "5min", "m15": "15min", "m30": "30min",
    "h1": "1h", "h4": "4h", "d1": "1D", "w1": "1W",
}


def load_m1(pair: str, root: str | Path = "VolRangeForecaster/data/m1") -> pd.DataFrame:
    """Load a pair's M1 parquet. Returns UTC-indexed OHLCV, oldest-first, with
    duplicate timestamps dropped (broker feeds occasionally repeat a minute)."""
    path = Path(root) / f"{pair}_m1.parquet"
    df = pd.read_parquet(path)
    # Some cached parquets were written with a RangeIndex and the timestamps left
    # in a `time` COLUMN. Everything downstream (resample, the causal cutoffs) needs
    # a DatetimeIndex, and silently proceeding on a RangeIndex produces a confusing
    # failure far from the cause — promote it here instead.
    if not isinstance(df.index, pd.DatetimeIndex) and "time" in df.columns:
        df = df.set_index(pd.to_datetime(df["time"], utc=True)).drop(columns=["time"])
        df.index.name = None
    df = df[~df.index.duplicated(keep="first")].sort_index()
    need = {"open", "high", "low", "close"}
    missing = need - set(df.columns)
    if missing:
        raise ValueError(f"{path}: missing columns {sorted(missing)}")
    if "volume" not in df.columns:
        # Tick volume is a *proxy* for traded volume on a broker feed; a feed
        # without it still works everywhere except volume profile, which says
        # so rather than silently weighting every bar equally.
        df["volume"] = np.nan
    return df


def resample(m1: pd.DataFrame, tf: str) -> pd.DataFrame:
    """M1 → `tf` OHLCV, left-labelled (a bar is stamped with the time it
    OPENED, so `bars.loc[t]` is the bar you could have been trading at t) and
    with empty bins dropped.

    Dropping empties is not cosmetic: an all-NaN weekend bar forward-filled
    into a real candle manufactures a gap between Friday's close and Monday's
    open that looks exactly like a fair value gap to `levels.py`. Every
    weekend would produce one, and it would be untradeable in all of them.
    """
    if tf == "m1":
        return m1
    rule = TF_RULES.get(tf)
    if rule is None:
        raise ValueError(f"unknown timeframe {tf!r} (have {sorted(TF_RULES)})")
    agg = {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}
    out = m1.resample(rule, label="left", closed="left").agg(agg)
    return out.dropna(subset=["open", "high", "low", "close"])


def day_key(index: pd.DatetimeIndex, day_start_hour: int = 0) -> np.ndarray:
    """Trading-day label per bar, as a numpy date64 array.

    `day_start_hour` is the UTC hour the trading day rolls. 0 = calendar UTC
    day (transparent, and the one "midnight open" literally refers to);
    22 = the 17:00 New York close, which is what an MT5 daily candle on a
    GMT+2 server shows and what most volume-profile work on gold assumes.
    The choice propagates into daily open / PDH / PDL / pivots / profile, so
    it is surfaced as a knob rather than buried.
    """
    shifted = index - pd.Timedelta(hours=day_start_hour)
    return shifted.normalize().tz_localize(None).to_numpy()


def week_key(index: pd.DatetimeIndex, day_start_hour: int = 0) -> np.ndarray:
    """Trading-week label (the Monday of each week, on the same rolled clock)."""
    shifted = index - pd.Timedelta(hours=day_start_hour)
    monday = shifted.normalize() - pd.to_timedelta(shifted.dayofweek, unit="D")
    return monday.tz_localize(None).to_numpy()


def month_key(index: pd.DatetimeIndex, day_start_hour: int = 0) -> np.ndarray:
    shifted = (index - pd.Timedelta(hours=day_start_hour)).tz_localize(None)
    return shifted.to_period("M").to_timestamp().to_numpy()


def session_label(index: pd.DatetimeIndex) -> np.ndarray:
    """Per-bar session name from the UTC hour (see SESSIONS)."""
    hours = index.hour.to_numpy()
    out = np.full(len(hours), "late", dtype=object)
    for name, (lo, hi) in SESSIONS.items():
        out[(hours >= lo) & (hours < hi)] = name
    return out


def atr(bars: pd.DataFrame, period: int = 14) -> np.ndarray:
    """Wilder ATR (imported recursion). Value at bar i uses bar i's own range,
    so anything consuming it as a *decision-time* scale must use `atr_prior`
    instead — using ATR that includes the bar you are reacting to leaks the
    size of the move you are about to trade into the size of your stop."""
    return _wilder_atr(bars, period)


def atr_prior(bars: pd.DataFrame, period: int = 14) -> np.ndarray:
    """ATR as known at the OPEN of each bar: `atr` shifted one bar forward.
    This is the one to divide by when normalizing anything used for a decision
    at bar i. The first value repeats the second (no prior bar exists)."""
    a = _wilder_atr(bars, period)
    out = np.empty_like(a)
    out[1:] = a[:-1]
    out[0] = a[0] if len(a) else 0.0
    return out


def percentile_rank(values: np.ndarray, window: int) -> np.ndarray:
    """Trailing percentile rank of each value within the prior `window` values
    (strictly prior — the current value is ranked against history, not against
    a window containing itself). Used to turn raw ATR into a vol regime that
    means the same thing at $1,100 gold and $4,300 gold.

    NaN for the first `window` bars, where there is no history to rank against.
    """
    n = len(values)
    out = np.full(n, np.nan)
    if n <= window:
        return out
    # Rolling rank via pandas is O(n·w) but clear; w is ~5k bars, n ~700k, and
    # this runs once per timeframe per run.
    s = pd.Series(values)
    out[window:] = (
        s.rolling(window).apply(lambda w: (w[:-1] < w[-1]).mean(), raw=True)
        .to_numpy()[window:]
    )
    return out


def frame(m1: pd.DataFrame, tf: str, day_start_hour: int = 0,
          atr_period: int = 14) -> pd.DataFrame:
    """The standard forge working frame for a timeframe: OHLCV plus the causal
    scale/keying columns every downstream layer expects.

    Columns added: `atr` (contemporaneous, for measuring a completed bar),
    `atr0` (prior-bar ATR, for decisions), `day`, `week`, `month`, `session`,
    `hour`, `dow`.
    """
    bars = resample(m1, tf).copy()
    bars["atr"] = atr(bars, atr_period)
    bars["atr0"] = atr_prior(bars, atr_period)
    bars["day"] = day_key(bars.index, day_start_hour)
    bars["week"] = week_key(bars.index, day_start_hour)
    bars["month"] = month_key(bars.index, day_start_hour)
    bars["session"] = session_label(bars.index)
    bars["hour"] = bars.index.hour
    bars["dow"] = bars.index.dayofweek
    return bars
