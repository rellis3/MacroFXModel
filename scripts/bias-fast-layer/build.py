"""bias-fast-layer: the hourly London-time price panel from local OANDA H1 (read-only). Prereg: forge/BIAS_FAST_LAYER_PREREG.md 3.1.
    python scripts/bias-fast-layer/build.py
Output: analysis/output/bias-fast-layer/panel.json  { sessions, hours, px: {KEY: [[P07..P21] per session]} }
P_h = close of the H1 bar whose close is h:00 London (bar open = h-1:00 London).
"""
import json, os
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
M = os.path.join(ROOT, 'VolRangeForecaster', 'data', 'm1')
OUT = os.path.join(ROOT, 'analysis', 'output', 'bias-fast-layer')
os.makedirs(OUT, exist_ok=True)
START, END = '2016-01-04', '2026-08-20'
HOURS = list(range(7, 22))
PAIRS = {'GOLD': 'GOLD', 'NQ': 'NQ', 'SPX500': 'SPX500', 'US30': 'US30', 'DE30': 'DE30', 'EURUSD': 'EURUSD', 'GBPUSD': 'GBPUSD',
         'AUDUSD': 'AUDUSD', 'NZDUSD': 'NZDUSD', 'USDJPY': 'USDJPY', 'USDCAD': 'USDCAD', 'USDCHF': 'USDCHF'}
MACRO = {'US02Y': 'US02Y'}

sessions = [d.strftime('%Y-%m-%d') for d in pd.bdate_range(START, END)]
sidx = {d: i for i, d in enumerate(sessions)}


def grid_of(df):
    s = df['close'].copy()
    t = s.index.tz_convert('Europe/London') + pd.Timedelta(hours=1)   # the bar's close in London time
    g = [[None] * len(HOURS) for _ in sessions]
    hits = 0
    for ts, v in zip(t, s.values):
        if ts.minute != 0 or ts.hour not in HOURS:
            continue
        i = sidx.get(ts.strftime('%Y-%m-%d'))
        if i is None:
            continue
        g[i][ts.hour - 7] = float(v)
        hits += 1
    return g, hits


px = {}
pairs = pd.read_parquet(os.path.join(M, 'all_pairs_h1.parquet'))
for k, n in PAIRS.items():
    px[k], hits = grid_of(pairs.xs(n, level=0))
    print(k, hits)
del pairs
macro = pd.read_parquet(os.path.join(M, 'all_macro_h1.parquet'))
for k, n in MACRO.items():
    px[k], hits = grid_of(macro.xs(n, level=0))
    print(k, hits)
with open(os.path.join(OUT, 'panel.json'), 'w') as f:
    json.dump({'sessions': sessions, 'hours': HOURS, 'px': px}, f)
print('sessions', len(sessions), sessions[0], '->', sessions[-1])
