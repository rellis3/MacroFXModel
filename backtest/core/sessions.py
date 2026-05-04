"""
Session labelling and Asia range extraction.

Uses 5m bars for range construction — mirrors the dashboard which uses 5m bars
for Asia/Monday range calculations.

Asia session  : 00:00–06:00 London time
London session: 08:00–13:00
NY Overlap    : 13:00–17:00
"""

import pandas as pd
import numpy as np
from config import SESSIONS


def label_sessions(df: pd.DataFrame) -> pd.DataFrame:
    """Add a 'session' column to any OHLCV DataFrame based on London hour."""
    def _session(hour: int) -> str:
        for name, (start, end) in SESSIONS.items():
            if start <= hour < end:
                return name
        return 'closed'

    df = df.copy()
    df['session'] = df['london_hour'].map(_session)
    return df


def get_asia_ranges(m5: pd.DataFrame, pip_size: float,
                    min_pips: float = 5, max_pips: float = 50) -> pd.DataFrame:
    """
    Compute the Asia session high/low for each London calendar date using 5m bars.

    Returns a DataFrame indexed by london_date with columns:
        range_high, range_low, range_size, range_pips, range_mid, valid

    'valid' = True when range_pips is within [min_pips, max_pips].
    Only valid days should be used for entry signals.
    """
    asia_bars = m5[m5['london_hour'] < 6].copy()

    grouped = asia_bars.groupby('london_date').agg(
        range_high=('high', 'max'),
        range_low=('low',  'min'),
        bar_count=('close', 'count'),
    ).reset_index()

    grouped['range_size'] = grouped['range_high'] - grouped['range_low']
    grouped['range_pips'] = (grouped['range_size'] / pip_size).round(1)
    grouped['range_mid']  = (grouped['range_high'] + grouped['range_low']) / 2

    grouped['valid'] = (
        (grouped['bar_count'] >= 6) &           # at least 30 min of bars
        (grouped['range_pips'] >= min_pips) &
        (grouped['range_pips'] <= max_pips)
    )

    grouped = grouped.set_index('london_date')
    return grouped


def get_monday_ranges(m30: pd.DataFrame, pip_size: float) -> pd.DataFrame:
    """
    Compute the Monday full-day high/low from 30m bars (london_dow == 0).
    Returns a DataFrame indexed by the Monday date.
    """
    monday_bars = m30[m30['london_dow'] == 0].copy()

    grouped = monday_bars.groupby('london_date').agg(
        range_high=('high', 'max'),
        range_low=('low',  'min'),
        bar_count=('close', 'count'),
    ).reset_index()

    grouped['range_size'] = grouped['range_high'] - grouped['range_low']
    grouped['range_pips'] = (grouped['range_size'] / pip_size).round(1)
    grouped['range_mid']  = (grouped['range_high'] + grouped['range_low']) / 2
    grouped['valid']      = grouped['bar_count'] >= 4

    grouped = grouped.set_index('london_date')
    return grouped


def get_prev_monday_range(monday_ranges: pd.DataFrame, current_date) -> pd.Series | None:
    """Return the most recent valid Monday range before current_date."""
    past = monday_ranges[
        (monday_ranges.index < current_date) & monday_ranges['valid']
    ]
    if past.empty:
        return None
    return past.iloc[-1]
