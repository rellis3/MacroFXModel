"""null-audit yield-ladder-eurusd: row accounting at every stage of the study's EURUSD pipeline (reads its panel + raw CSVs)."""
import os
import numpy as np, pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
O = os.path.join(ROOT, 'analysis', 'output', 'yield-predictive-ladder')
d = pd.read_csv(os.path.join(O, 'raw', 'DEXUSEU.csv')); d.columns = ['date', 'v']; d['date'] = pd.to_datetime(d['date'])
w = d[(d['date'] >= '2004-01-01') & (d['date'] <= '2026-08-21')]
print('DEXUSEU rows in 2004-01-01..2026-08-21 file window:', len(w), ' of which blank/"." (holidays):', int(pd.to_numeric(w['v'], errors='coerce').isna().sum()))
P = pd.read_parquet(os.path.join(O, 'panel_eurusd.parquet'))
print('panel rows 2005-01-03..2026-08-21:', len(P), P.index[0].date(), P.index[-1].date())
feats = [c for c in P.columns if c.startswith(('r_', 'b_', 'm_'))]
ok = P[feats].notna().all(1)
print('rows with every M3 input:', int(ok.sum()), ' dropped:', int((~ok).sum()), ' dropped dates', P.index[~ok].min().date(), '..', P.index[~ok].max().date())
print('M1-only inputs complete:', int(P[[c for c in feats if c.startswith('b_')]].notna().all(1).sum()))
for h in (1, 5, 20):
    y = P[f'y{h}']
    for lab, a, b in (('train<2015', '2005-01-01', '2014-12-31'), ('validate', '2015-01-01', '2019-12-31'), ('test', '2020-01-01', '2026-08-21')):
        m = (P.index >= a) & (P.index <= b)
        print(f'h{h} {lab}: rows {int(m.sum())}, with target {int((m & y.notna()).sum())}, with target+all inputs {int((m & y.notna() & ok).sum())}')
print('release flag: 1 =', int((P['release'] == 1).sum()), ' 0 =', int((P['release'] == 0).sum()), ' NaN (outside calendar coverage) =', int(P['release'].isna().sum()))
