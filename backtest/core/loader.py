"""
Loads 1m / 5m / 30m bid OHLCV CSVs.

CSV format:
    timestamp  — Unix milliseconds UTC
    open/high/low/close — bid prices
    volume     — notional volume (broker internal, consistent for relative calcs)

All returned DataFrames:
    - Index     : UTC DatetimeIndex
    - Columns   : open, high, low, close, volume (floats)
    - Extra     : london_dt  (tz-aware, Europe/London)
                  london_date (date object, London calendar date)
                  london_hour (int)
                  london_minute (int)
                  is_weekend  (bool — True for Saturday/Sunday London time)
"""

import pandas as pd
from zoneinfo import ZoneInfo

LONDON = ZoneInfo('Europe/London')


def load_ohlcv(filepath: str, pair: str = 'EURUSD') -> pd.DataFrame:
    df = pd.read_csv(
        filepath,
        dtype={'timestamp': 'int64', 'open': 'float64', 'high': 'float64',
               'low': 'float64', 'close': 'float64', 'volume': 'float64'},
    )

    # Parse millisecond UTC timestamps → tz-aware UTC index
    df['utc_dt'] = pd.to_datetime(df['timestamp'], unit='ms', utc=True)
    df = df.set_index('utc_dt').drop(columns=['timestamp'])
    df = df.sort_index()

    # London time columns — zoneinfo handles BST/GMT automatically
    df['london_dt']     = df.index.tz_convert(LONDON)
    df['london_date']   = df['london_dt'].dt.date
    df['london_hour']   = df['london_dt'].dt.hour
    df['london_minute'] = df['london_dt'].dt.minute
    df['london_dow']    = df['london_dt'].dt.dayofweek  # 0=Mon, 6=Sun

    # Drop weekend bars (FX market closed Sat/Sun in London time)
    df['is_weekend'] = df['london_dow'] >= 5
    df = df[~df['is_weekend']].copy()
    df = df.drop(columns=['is_weekend'])

    return df


def load_pair(pair_cfg: dict) -> dict:
    """Load all three timeframes for a pair. Returns {'m1': df, 'm5': df, 'm30': df}."""
    print(f"  Loading m1  ({pair_cfg['m1_file'].name})...")
    m1  = load_ohlcv(pair_cfg['m1_file'])
    print(f"  Loading m5  ({pair_cfg['m5_file'].name})...")
    m5  = load_ohlcv(pair_cfg['m5_file'])
    print(f"  Loading m30 ({pair_cfg['m30_file'].name})...")
    m30 = load_ohlcv(pair_cfg['m30_file'])
    print(f"  Loaded: m1={len(m1):,}  m5={len(m5):,}  m30={len(m30):,} bars")
    return {'m1': m1, 'm5': m5, 'm30': m30}
