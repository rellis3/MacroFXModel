"""vix-calculus data: 5-minute VIX (and VVIX, VXN) index bars from IB Gateway, RTH, 2016-01 -> 2026-08-21, monthly chunks.
Read-only (readonly=True); no orders. Output: analysis/output/vix-calculus/data/<SYM>_5m.parquet (UTC timestamps, close)."""
import asyncio; asyncio.set_event_loop(asyncio.new_event_loop())
import os, sys, time
import pandas as pd
from ib_insync import IB, Index
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'analysis', 'output', 'vix-calculus', 'data'); os.makedirs(OUT, exist_ok=True)
syms = sys.argv[1:] or ['VIX']
ib = IB(); ib.connect('127.0.0.1', int(os.environ.get('IB_PORT', 4002)), clientId=38, timeout=20, readonly=True)
for sym in syms:
    c = Index(sym, 'CBOE'); ib.qualifyContracts(c)
    path = os.path.join(OUT, f'{sym}_5m.parquet'); have = pd.read_parquet(path) if os.path.exists(path) else None
    ends = pd.date_range('2016-02-01', '2026-09-01', freq='MS')
    rows = [] if have is None else [have]
    done = set() if have is None else set(have.index.to_period('M').astype(str))
    for e in ends:
        m = (e - pd.Timedelta(days=1)).to_period('M').strftime('%Y-%m')
        if m in done: continue
        for attempt in range(3):
            b = ib.reqHistoricalData(c, endDateTime=e.strftime('%Y%m%d-05:00:00'), durationStr='1 M', barSizeSetting='5 mins', whatToShow='TRADES', useRTH=True, formatDate=2, timeout=90)
            if b: break
            time.sleep(15)
        if b:
            d = pd.DataFrame({'close': [x.close for x in b], 'high': [x.high for x in b], 'low': [x.low for x in b]}, index=pd.DatetimeIndex([x.date for x in b]).tz_convert('UTC'))
            d = d[d.index.to_period('M').astype(str) == m] if False else d
            rows.append(d)
        print(sym, m, len(b) if b else 0, flush=True)
        if len(rows) % 12 == 0:
            pd.concat(rows).sort_index().pipe(lambda x: x[~x.index.duplicated()]).to_parquet(path)
        time.sleep(11)
    pd.concat(rows).sort_index().pipe(lambda x: x[~x.index.duplicated()]).to_parquet(path)
ib.disconnect(); print('done')
