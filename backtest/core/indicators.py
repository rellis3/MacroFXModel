"""
Technical indicators derived from OHLCV data.

EMA trend filter
----------------
Computes EMA on the 5m close price series. For each trading day, captures
the EMA value at the London open (08:00) as the trend reference.

The daily trend reference is built as a lookup dict:  date → ema_value
so the backtest engine can check on each entry bar whether price is above
or below the prevailing trend without re-computing anything in the hot loop.

Two EMA periods are pre-computed (fast + slow) so the engine can use either
or both (e.g. only trade when price is above both EMAs).
"""

from __future__ import annotations
import numpy as np
import pandas as pd


def compute_ema(series: pd.Series, period: int) -> pd.Series:
    """Standard exponential moving average using pandas ewm (adjust=False)."""
    return series.ewm(span=period, adjust=False).mean()


def build_ema_trend_lookup(
    m5: pd.DataFrame,
    fast_period: int = 50,
    slow_period: int = 200,
) -> pd.DataFrame:
    """
    Compute fast and slow EMAs on 5m close prices, then capture the value
    at the London open (08:00 bar) for each trading day.

    Returns a DataFrame indexed by london_date with columns:
        ema_fast        — EMA value at 08:00 London
        ema_slow        — EMA value at 08:00 London
        trend_fast      — 'up' if close > ema_fast at open, else 'down'
        trend_slow      — 'up' if close > ema_slow at open, else 'down'
        trend_aligned   — True if both EMAs agree on direction

    Uses the 08:00 bar specifically (first bar of London session) so the trend
    signal is fixed for the whole day without any intraday lookahead.
    """
    m5 = m5.sort_index().copy()

    m5['ema_fast'] = compute_ema(m5['close'], fast_period).round(5)
    m5['ema_slow'] = compute_ema(m5['close'], slow_period).round(5)

    # Capture only the 08:00 London bar for each day (trend reference)
    open_bars = m5[m5['london_hour'] == 8].copy()
    open_bars = open_bars.groupby('london_date').first()  # first bar at or after 08:00

    trend = pd.DataFrame(index=open_bars.index)
    trend['ema_fast']      = open_bars['ema_fast']
    trend['ema_slow']      = open_bars['ema_slow']
    trend['open_price']    = open_bars['close']
    trend['trend_fast']    = np.where(open_bars['close'] > open_bars['ema_fast'], 'up', 'down')
    trend['trend_slow']    = np.where(open_bars['close'] > open_bars['ema_slow'], 'up', 'down')
    trend['trend_aligned'] = trend['trend_fast'] == trend['trend_slow']

    return trend


def ema_allows_entry(
    trend_row: pd.Series | None,
    direction: str,
    require_both: bool = False,
) -> bool:
    """
    Return True if the EMA trend permits a trade in the given direction.

    direction     : 'LONG' or 'SHORT'
    require_both  : if True, both fast and slow EMA must agree; if False, only slow EMA checked

    Returns True (allow) when trend data is unavailable (insufficient history)
    so early bars aren't silently skipped.
    """
    if trend_row is None or pd.isna(trend_row.get('ema_slow')):
        return True  # not enough EMA history — don't block

    if require_both:
        if not trend_row['trend_aligned']:
            return False  # EMAs disagree — skip
        trend = trend_row['trend_slow']
    else:
        trend = trend_row['trend_slow']

    if direction == 'LONG'  and trend == 'up':
        return True
    if direction == 'SHORT' and trend == 'down':
        return True
    return False
