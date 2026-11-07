"""Mechanics check for jump-next-day-miss: rebuild EURUSD's pairs independently (merge on next date, not shift),
recompute the raw jump-minus-other difference and a plain OLS beta, compare with run.py's loader, and confirm no
row's controls/predictor use a date on or after the target session.
  python -I scripts/jump-next-day-miss/check.py
"""
import os, sys
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run  # noqa: E402

d = pd.read_csv(os.path.join(run.FH, 'EURUSD.csv'), usecols=['date', 'oos', 'r_hl', 'pit_hl_p50', 'last_min'])
f = pd.read_csv(run.FLAGS, usecols=['inst', 'date', 'jump_bns'])
f = f[f.inst == 'EURUSD']
d = d.merge(f[['date', 'jump_bns']], on='date', how='left').sort_values('date').reset_index(drop=True)
d['date'] = pd.to_datetime(d.date)
d['e'] = np.log(d.r_hl / d.pit_hl_p50)
d['ok'] = d.last_min >= 1200
d['k'] = np.arange(len(d))
a = d.rename(columns=lambda c: c + '_t')
b = d.rename(columns=lambda c: c + '_n'); b['k_t'] = b.k_n - 1
p = a.merge(b, on='k_t')
p = p[p.ok_t & p.ok_n & (p.oos_n == 1) & (p.date_n <= run.LOCKBOX) & ((p.date_n - p.date_t).dt.days <= 4)]
p = p[np.isfinite(p.e_t) & np.isfinite(p.e_n) & p.jump_bns_t.notna()]
raw = p[p.jump_bns_t == 1].e_n.mean() - p[p.jump_bns_t == 0].e_n.mean()

X = run.load()
E = X[X.inst == 'EURUSD']
raw_run = E[E.J == 1].e1.mean() - E[E.J == 0].e1.mean()
print('EURUSD pairs independent', len(p), 'run.py', len(E), '(run.py also needs a causal sigma tercile)')
common = p.merge(E[['date1']].assign(date_n=E.date1), on='date_n')
print('independent raw diff (all pairs)', round(raw, 5), '| run.py raw diff', round(raw_run, 5))
pc = p[p.date_n.isin(E.date1)]
print('independent raw diff on run.py rows', round(pc[pc.jump_bns_t == 1].e_n.mean() - pc[pc.jump_bns_t == 0].e_n.mean(), 5))
Xm = np.column_stack([pc.jump_bns_t, pc.e_t, np.ones(len(pc))])
print('independent beta J | m_prev', round(np.linalg.lstsq(Xm, pc.e_n.to_numpy(), rcond=None)[0][0], 5))
Xr = np.column_stack([E.J, E.m_prev, np.ones(len(E))])
print('run.py-rows beta J | m_prev', round(np.linalg.lstsq(Xr, E.e1.to_numpy(), rcond=None)[0][0], 5))
print('lookahead: predictor date < target date for all rows:', bool((X.date < X.date1).all()),
      '| max target date', X.date1.max().date(), '| min target date', X.date1.min().date())
print('rows per class', X.klass.value_counts().to_dict(), '| stress NaN share', X[['spx5', 'vix5']].isna().mean().round(4).to_dict())
