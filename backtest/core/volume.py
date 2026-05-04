"""
Volume-derived indicators.

All functions add columns to the DataFrame in-place-style (return a copy).
All calculations are strictly backward-looking — no lookahead.

Indicators:
    london_vwap   — cumulative VWAP from 08:00 London, reset each day
    rvol          — volume relative to same minute-of-week average over prior N days
    prev_day_poc  — prior day's Point of Control (highest-volume price level)
"""

from __future__ import annotations
import numpy as np
import pandas as pd


# ── London VWAP ──────────────────────────────────────────────────────────────

def add_london_vwap(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add 'london_vwap' column.

    VWAP resets at 08:00 London each day and accumulates through 21:00.
    Bars before 08:00 receive NaN (no VWAP yet).
    The value is forward-filled within the day so you always have the most
    recent VWAP during non-London hours.
    """
    df = df.copy()
    df['_date']    = df['london_date']
    df['_typical'] = (df['high'] + df['low'] + df['close']) / 3
    df['_tp_vol']  = df['_typical'] * df['volume']

    # Only accumulate during London + NY session (08:00–21:00)
    in_session = df['london_hour'].between(8, 20)
    df['_tp_vol_adj'] = np.where(in_session, df['_tp_vol'],  0.0)
    df['_vol_adj']    = np.where(in_session, df['volume'],    0.0)

    df['_cum_tp_vol'] = df.groupby('_date')['_tp_vol_adj'].cumsum()
    df['_cum_vol']    = df.groupby('_date')['_vol_adj'].cumsum()

    with np.errstate(invalid='ignore', divide='ignore'):
        vwap = np.where(df['_cum_vol'] > 0,
                        df['_cum_tp_vol'] / df['_cum_vol'],
                        np.nan)

    df['london_vwap'] = vwap
    # Forward-fill within each day so later non-session bars carry last valid VWAP
    df['london_vwap'] = df.groupby('_date')['london_vwap'].ffill()
    df['london_vwap'] = df['london_vwap'].round(5)

    df = df.drop(columns=['_date', '_typical', '_tp_vol', '_tp_vol_adj',
                           '_vol_adj', '_cum_tp_vol', '_cum_vol'])
    return df


# ── RVOL ─────────────────────────────────────────────────────────────────────

def add_rvol(df: pd.DataFrame, lookback_days: int = 20) -> pd.DataFrame:
    """
    Add 'rvol' column — volume relative to the mean volume at the same
    minute-of-week over the prior lookback_days trading days.

    Method: pivot to (date × minute-of-week), rolling mean with shift(1)
    to avoid lookahead, then map back.

    Values are capped at 10 to suppress outlier spikes.
    Bars with insufficient history get rvol = 1.0 (neutral).
    """
    df = df.copy()
    df['_date'] = df['london_date']
    df['_mow']  = (df['london_dt'].dt.dayofweek * 1440
                   + df['london_hour'] * 60
                   + df['london_minute'])

    # Pivot: rows = date, cols = minute-of-week, values = volume
    pivot = df.pivot_table(index='_date', columns='_mow',
                           values='volume', aggfunc='mean')

    # Rolling lookback over prior days (shift(1) prevents lookahead)
    roll_mean = (pivot.shift(1)
                      .rolling(window=lookback_days, min_periods=5)
                      .mean())

    # Melt back to long format and merge
    roll_long = (roll_mean.stack(future_stack=True)
                           .rename('_vol_avg')
                           .reset_index())
    roll_long.columns = ['_date', '_mow', '_vol_avg']

    df = df.merge(roll_long, on=['_date', '_mow'], how='left')

    with np.errstate(invalid='ignore', divide='ignore'):
        df['rvol'] = (df['volume'] / df['_vol_avg']).clip(0, 10)

    df['rvol'] = df['rvol'].fillna(1.0).round(2)
    df = df.drop(columns=['_date', '_mow', '_vol_avg'])
    return df


# ── Daily Point of Control ────────────────────────────────────────────────────

def add_daily_poc(df: pd.DataFrame, pip_size: float) -> pd.DataFrame:
    """
    Add 'prev_day_poc' column — the prior trading day's Point of Control.

    POC = price level (rounded to 1 pip) with the highest total volume traded
    during that day. Using the PREVIOUS day's POC avoids any lookahead.

    Bars on the first available date get NaN (no prior day).
    """
    df = df.copy()
    df['_date'] = df['london_date']
    df['_bin']  = (df['close'] / pip_size).round() * pip_size

    # Sum volume per day per price bin, find the highest-volume bin per day
    vol_by_bin = (df.groupby(['_date', '_bin'])['volume']
                    .sum()
                    .reset_index()
                    .sort_values('volume', ascending=False))

    poc_by_date = (vol_by_bin
                   .groupby('_date')['_bin']
                   .first()          # first after descending sort = max volume bin
                   .rename('poc'))

    # Shift by one day to use only prior day's POC
    poc_shifted = poc_by_date.shift(1)

    df['prev_day_poc'] = df['_date'].map(poc_shifted).round(5)
    df = df.drop(columns=['_date', '_bin'])
    return df


# ── Convenience wrapper ───────────────────────────────────────────────────────

def add_all_volume_indicators(df: pd.DataFrame, pip_size: float,
                               rvol_lookback: int = 20) -> pd.DataFrame:
    """Apply all three volume indicators in sequence."""
    print('    Computing London VWAP...')
    df = add_london_vwap(df)
    print('    Computing RVOL...')
    df = add_rvol(df, lookback_days=rvol_lookback)
    print('    Computing daily POC...')
    df = add_daily_poc(df, pip_size=pip_size)
    return df
