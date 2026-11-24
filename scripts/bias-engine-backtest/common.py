"""bias-engine-backtest: shared paths, dates and loaders (forge/BIAS_ENGINE_BACKTEST_PREREG.md, seed 20261116).

Reads only local files from the main checkout's gitignored data (features/, Oanda Parquet Files/, data/m1_bidask/,
analysis/output/*/macro csvs); writes only into this worktree's analysis/output/bias-engine-backtest/. Never R2.
Nothing priced after 2026-08-21 21:00 UTC is read (asserted)."""
from __future__ import annotations

import os
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

for k in list(os.environ):
    if k.startswith('R2_'):
        del os.environ[k]

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]                     # the worktree
MAIN = Path(os.environ.get('BEB_DATA_ROOT', ROOT.parent / 'MacroFXModel'))   # read-only data root
OUT = ROOT / 'analysis' / 'output' / 'bias-engine-backtest'
INP = OUT / 'inputs'
SEED = 20261116
LON, NY = ZoneInfo('Europe/London'), ZoneInfo('America/New_York')
START = pd.Timestamp('2010-01-04')
LOCKBOX = pd.Timestamp('2026-08-21')
M1_CUTOFF_UTC = pd.Timestamp('2026-08-21 21:00:00')
HOLDOUT_START = pd.Timestamp('2024-08-22')

# the 7 USD majors the engine's basket is built from, and the other markets it prices (engine names)
MAJORS = ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDJPY', 'USDCAD', 'USDCHF']
# engine name -> (Oanda Parquet M1 file stem, features px_d1 key or None, bid/ask m1 key or None)
PRICE_SRC = {
    'EURUSD': ('eurusd', 'eurusd', 'eurusd'), 'GBPUSD': ('gbpusd', 'gbpusd', 'gbpusd'), 'AUDUSD': ('audusd', 'audusd', 'audusd'),
    'NZDUSD': ('nzdusd', 'nzdusd', 'nzdusd'), 'USDJPY': ('usdjpy', 'usdjpy', 'usdjpy'), 'USDCAD': ('usdcad', 'usdcad', 'usdcad'),
    'USDCHF': ('usdchf', 'usdchf', 'usdchf'), 'GOLD': ('xauusd', 'xauusd', 'gold'), 'NQ': ('nas100_usd', 'nas100', 'nq'),
    'SPX500': ('spx500', 'spx500', 'spx'), 'US30': ('us30', None, 'dow'), 'US2000': ('us2000', None, 'us2000'),
    'DE30': ('de30', None, 'dax'), 'UK100': ('uk100', None, 'uk100'),
}
CCY_PRIORITY = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY']
ALL_PAIRS = [CCY_PRIORITY[i] + CCY_PRIORITY[j] for i in range(8) for j in range(i + 1, 8)]
ASSETS_SCORED = ['GOLD', 'NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100']
GROUP = {**{p: 'fx' for p in ALL_PAIRS}, 'GOLD': 'gold', **{a: 'idx' for a in ['NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100']}}


def issue_dates():
    d = pd.bdate_range(START, LOCKBOX)
    return d


def issue_ms(d: pd.Timestamp) -> int:
    # issue time, London wall clock; BEB_ISSUE_HHMM (e.g. 0000) is the bias-day-trade replay; default 07:00 (banked)
    hh, mm = divmod(int(os.environ.get('BEB_ISSUE_HHMM', '0700')), 100)
    t = pd.Timestamp(d.year, d.month, d.day, hh, mm, tz=LON)
    return int(t.tz_convert('UTC').value // 10**6)


def read_m1_mid(stem: str) -> pd.DataFrame:
    """Oanda mid M1 (2016-01 ->), UTC naive, cut at the lockbox."""
    p = MAIN / 'Oanda Parquet Files' / f'{stem}_m1.parquet'
    import pyarrow.parquet as pq
    df = pq.read_table(p, columns=['close', 'datetime']).to_pandas(ignore_metadata=True).rename(columns={'datetime': 'time'})
    t = pd.to_datetime(df['time'])
    if getattr(t.dt, 'tz', None) is not None:
        t = t.dt.tz_convert('UTC').dt.tz_localize(None)
    df = df.assign(time=t)
    df = df[df['time'] < M1_CUTOFF_UTC].dropna().sort_values('time').drop_duplicates('time')
    assert df['time'].max() < M1_CUTOFF_UTC, 'LOCKBOX BREACH'
    assert df['time'].min().year >= 2000
    return df.reset_index(drop=True)


def read_m1_bidask(key: str, cols=('time', 'open', 'close', 'bid_o', 'ask_o', 'bid_c', 'ask_c')) -> pd.DataFrame:
    p = MAIN / 'data' / 'm1_bidask' / f'{key}_m1.parquet'
    import pyarrow.parquet as pq
    df = pq.read_table(p, columns=list(cols)).to_pandas(ignore_metadata=True)
    t = pd.to_datetime(df['time'])
    if getattr(t.dt, 'tz', None) is not None:
        t = t.dt.tz_convert('UTC').dt.tz_localize(None)
    df = df.assign(time=t)
    df = df[df['time'] < M1_CUTOFF_UTC].dropna().sort_values('time').drop_duplicates('time')
    assert df['time'].max() < M1_CUTOFF_UTC, 'LOCKBOX BREACH (bid/ask)'
    assert df['time'].min().year >= 2000, '1970 timestamps (BAM trap)'
    return df.reset_index(drop=True)


def px_d1(key: str) -> pd.Series:
    """features/px_d1_<key>: OANDA daily closes at 17:00 New York, indexed by the NY trade date."""
    d = pd.read_parquet(MAIN / 'features' / f'px_d1_{key}.parquet')
    s = pd.Series(d['value'].astype(float).to_numpy(), index=pd.to_datetime(d['date']).dt.normalize())
    s = s[~s.index.duplicated(keep='last')].sort_index()
    s = s[(s.index.dayofweek < 5) & (s.index <= LOCKBOX)]
    return s[s > 0]


def ny_close_from_m1(df: pd.DataFrame, nmin: int = 60) -> pd.Series:
    """NY-close daily closes (17:00 New York boundary) from M1, indexed by NY trade date."""
    t = pd.DatetimeIndex(df['time']).tz_localize('UTC').tz_convert(NY)
    lab = (t + pd.Timedelta(hours=7)).tz_localize(None).normalize()
    g = df.groupby(lab.to_numpy())
    c, n = g['close'].last(), g.size()
    c = c[(n >= nmin).to_numpy()]
    c.index = pd.DatetimeIndex(c.index)
    return c[(c.index.dayofweek < 5) & (c.index <= LOCKBOX)]


def log(*a):
    import time
    print(time.strftime('%H:%M:%S'), *a, flush=True)
