"""noise-area-momentum data: SPY 1-minute TRADES bars, regular hours, from IB Gateway (read-only, no orders).

Why: the paper (Zarattini, Aziz, Barbon 2024) trades SPY from 2007; our first run used ES/NQ futures from 2016.
This pulls the paper's own instrument and period so the replication can be run as written.

Weekly requests ('1 W', 1 min, useRTH), resumable: each finished week is a parquet under
analysis/output/noise-area-momentum/data/spy_1m/ (gitignored: vendor data, public repo). Pacing ~11 s/request
(IB limit 60 per 10 min) -> ~1,000 weeks ~ 3 h. Timestamps stored as UTC, bar START (IB stamps the bar start).

Usage: python scripts/noise-area-momentum/fetch_spy_ib.py [--start 2007-01-01] [--end 2026-11-14] [--symbol SPY]
"""
import asyncio; asyncio.set_event_loop(asyncio.new_event_loop())
import argparse, os, time
import pandas as pd
from ib_insync import IB, Stock

ap = argparse.ArgumentParser()
ap.add_argument('--start', default='2007-01-01')
ap.add_argument('--end', default=pd.Timestamp.now(tz='America/New_York').strftime('%Y-%m-%d'))
ap.add_argument('--symbol', default='SPY')
ap.add_argument('--probe', action='store_true', help='pull one recent week and one 2007 week, print, exit')
a = ap.parse_args()

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'analysis', 'output', 'noise-area-momentum', 'data', f'{a.symbol.lower()}_1m')
os.makedirs(OUT, exist_ok=True)

ib = IB()
ib.connect('127.0.0.1', int(os.environ.get('IB_PORT', 4002)), clientId=41, timeout=20, readonly=True)
c = Stock(a.symbol, 'SMART', 'USD', primaryExchange='ARCA')
ib.qualifyContracts(c)


def pull(end_ny):
    """One week of 1-min RTH bars ending at end_ny (a Saturday 00:00 New York)."""
    for attempt in range(3):
        b = ib.reqHistoricalData(c, endDateTime=end_ny.strftime('%Y%m%d %H:%M:%S') + ' US/Eastern',
                                 durationStr='1 W', barSizeSetting='1 min', whatToShow='TRADES',
                                 useRTH=True, formatDate=2, timeout=120)
        if b:
            return pd.DataFrame({'open': [x.open for x in b], 'high': [x.high for x in b], 'low': [x.low for x in b],
                                 'close': [x.close for x in b], 'volume': [float(x.volume) for x in b],
                                 'vwap': [x.average for x in b], 'n': [x.barCount for x in b]},
                                index=pd.DatetimeIndex([x.date for x in b]).tz_convert('UTC').rename('t'))
        time.sleep(20)
    return None


if a.probe:
    for d in ['2007-01-12', (pd.Timestamp.now() - pd.Timedelta(days=7)).strftime('%Y-%m-%d')]:
        sat = pd.Timestamp(d) + pd.offsets.Week(weekday=5)
        df = pull(sat)
        print(d, 'none' if df is None else f'{len(df)} bars {df.index[0]} .. {df.index[-1]}')
        if df is not None: print(df.head(3)); print(df.tail(2))
        time.sleep(11)
    ib.disconnect(); raise SystemExit

weeks = pd.date_range(pd.Timestamp(a.start) + pd.offsets.Week(weekday=5), pd.Timestamp(a.end) + pd.offsets.Week(weekday=5),
                      freq='W-SAT')
empty = []
for i, sat in enumerate(weeks):
    f = os.path.join(OUT, f'{sat:%Y%m%d}.parquet')
    if os.path.exists(f) or os.path.exists(f + '.empty'):
        continue
    t0 = time.time()
    df = pull(sat)
    if df is None or df.empty:
        open(f + '.empty', 'w').close(); empty.append(sat.date())
    else:
        df.to_parquet(f)
    print(f'{i+1}/{len(weeks)} {sat:%Y-%m-%d} {0 if df is None else len(df)} bars', flush=True)
    time.sleep(max(0.0, 11 - (time.time() - t0)))
ib.disconnect()
print('done; empty weeks:', empty)
