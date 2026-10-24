"""null-audit yield-ladder-eurusd: compare the study's cached FRED CSVs (raw/) with a fresh download (dir given as argv[1]),
window 2004-01-01 .. 2026-08-21. Read-only."""
import os, sys
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
RAW = os.path.join(ROOT, 'analysis', 'output', 'yield-predictive-ladder', 'raw')


def rd(p):
    d = pd.read_csv(p); d.columns = ['date', 'v']
    return pd.Series(pd.to_numeric(d['v'], errors='coerce').to_numpy(), index=pd.to_datetime(d['date'])).dropna().loc['2004-01-01':'2026-08-21']


for f in sorted(os.listdir(sys.argv[1])):
    a, b = rd(os.path.join(RAW, f)), rd(os.path.join(sys.argv[1], f))
    j = pd.concat([a, b], axis=1, keys=['cached', 'fresh'])
    both = j.dropna()
    print(f, 'cached', len(a), 'fresh', len(b), 'cached-only', int(j['fresh'].isna().sum()), 'fresh-only', int(j['cached'].isna().sum()),
          'values differ', int((both['cached'] - both['fresh']).abs().gt(1e-9).sum()))
