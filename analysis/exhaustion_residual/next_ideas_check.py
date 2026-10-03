"""Two quick descriptive checks (not pre-registered) behind the next-ideas list.

A. Persistence + adaptive lines. Does a line that was breached too often lately
   keep being breached (forecast error is sticky)? And does an adaptive-
   conformal update of the line width (Gibbs & Candes 2021) fix calibration?
B. Asymmetry from the option skew. Does the 25-delta risk reversal (calls minus
   puts, known at t-1) tell you WHICH side's line breaks: OH vs OL?
"""
import io, runpy, contextlib
import numpy as np, pandas as pd
with contextlib.redirect_stdout(io.StringIO()):
    A = runpy.run_path('analysis/exhaustion_residual/residual_mechanism_check.py')['A']
SPLIT = pd.Timestamp('2023-01-01')
out = []
def p(s=''): out.append(str(s)); print(s)

p('# Next-ideas checks (descriptive, not pre-registered)\n')
p('## A. Is the forecast error sticky, and do adaptive lines fix it?\n')
rows = []
for inst, m in A.groupby('inst'):
    m = m.sort_values('date').copy()
    tr = m.date < SPLIT
    q = m.loc[tr, 'res'].quantile(0.75)
    m['x'] = (m.res > q).astype(float)
    m['recent'] = m.x.shift(1).rolling(20).mean()          # last 20 days' breach rate
    # adaptive conformal: log multiplier moves up after a breach, down otherwise
    g, alpha, lm, xs = 0.05, 0.25, np.log(q), []
    for r in m.res.values:
        xs.append(float(r > np.exp(lm))); lm += g * (xs[-1] - alpha)
    m['x_aci'] = xs
    rows.append(m)
B = pd.concat(rows); T = B[B.date >= SPLIT].dropna(subset=['recent'])
T['recent_t'] = pd.cut(T.recent, [-0.01, 0.15, 0.35, 1.0], labels=['<15%', '15-35%', '>35%'])
p('2023-26, p75 line (design 25%): next-day breach rate by the last 20 days\' breach rate')
p(T.groupby('recent_t', observed=True).x.agg(['mean', 'size']).round(3).to_string()); p()
p('Calibration by IV/sigma tercile, fixed vs adaptive line (2023-26, design 25%):')
p(T.groupby('ivsig_t')[['x', 'x_aci']].mean().rename(columns={'x': 'fixed', 'x_aci': 'adaptive'}).round(3).to_string())
dev = lambda c: (T.groupby('ivsig_t')[c].mean() - 0.25).abs().mean()
p(f'mean |miss| across terciles: fixed {dev("x"):.3f}, adaptive {dev("x_aci"):.3f}'); p()

p('## B. Does option skew say which side breaks?\n')
rr = []
import glob
IV = {'EURUSD': 'eur_usd', 'GBPUSD': 'gbp_usd', 'AUDUSD': 'aud_usd', 'USDJPY': 'usd_jpy', 'USDCAD': 'usd_cad', 'USDCHF': 'usd_chf', 'NAS100': 'nas100_usd'}
INV = {'USDJPY', 'USDCAD', 'USDCHF'}     # CME futures are quoted inverse to the spot pair
for inst, m in A.groupby('inst'):
    iv = pd.read_parquet(f'oi_research_book/data/iv_daily_{IV[inst]}.parquet')[['date', 'rr25_30']]
    m = m.merge(iv, on='date', how='left').sort_values('date')
    sgn = -1 if inst in INV else 1
    m['rr'] = (sgn * m.rr25_30 / m.iv30).shift(1)           # skew per unit vol, spot-pair sign
    m['up'] = np.log(m.high / m.open) / m.sig
    m['dn'] = np.log(m.open / m.low) / m.sig
    tr = m.date < SPLIT
    qu, qd = m.loc[tr, 'up'].quantile(0.75), m.loc[tr, 'dn'].quantile(0.75)
    e = m.loc[tr, 'rr'].quantile([1/3, 2/3]).values
    m['rr_t'] = np.digitize(m.rr, e)
    m['oh'] = m.up > qu; m['ol'] = m.dn > qd
    rr.append(m.dropna(subset=['rr']))
R = pd.concat(rr)
for name, d in (('2020-22', R[R.date < SPLIT]), ('2023-26', R[R.date >= SPLIT])):
    p(f'{name}: share of days beyond the OH p75 / OL p75 line by skew tercile (0 = puts richest, 2 = calls richest)')
    p(d.groupby('rr_t')[['oh', 'ol']].mean().round(3).to_string()); p()
open('analysis/exhaustion_residual/NEXT_IDEAS_CHECK.md', 'w').write('\n'.join(out) + '\n')
