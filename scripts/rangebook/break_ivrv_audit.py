"""Post-hoc audit of the BREAK × rich-IV pass (forge/BREAK_IVRV_PREREG.md): publication lag, day clustering,
outlier dependence, one trade per instrument-day. Not pre-registered; reported as an audit.
    python scripts/rangebook/break_ivrv_audit.py
"""
import bisect, json, math
import numpy as np, pandas as pd
CV = {'audusd': 'AUDUSD', 'eurusd': 'EURUSD', 'gbpusd': 'GBPUSD', 'usdcad': 'USDCAD', 'usdchf': 'USDCHF', 'usdjpy': 'USDJPY', 'gold': 'XAUUSD'}
CELLS = [('0.1', 'r5'), ('0.1', 'r10'), ('0.2', 'r5'), ('0.2', 'r10')]
cv = json.load(open('js/data/cmeCvolEod.json'))['series']
ser = {}
for p, k in CV.items():
    rows = cv[k]; d = [r['date'] for r in rows]; u = np.array([r['underlying'] or np.nan for r in rows], float); lr = np.diff(np.log(u))
    m = {}
    for i in range(21, len(d)):
        rv = np.nanstd(lr[i - 20:i], ddof=1) * math.sqrt(252) * 100
        if rv > 0: m[d[i]] = rows[i]['cvol'] / rv
    ser[p] = (sorted(m), m)
def iv(p, date, lag):
    ds, m = ser[p]; i = bisect.bisect_left(ds, date) - lag
    return m.get(ds[i]) if i >= 0 else None
T = []
for p in CV:
    for t in json.load(open(f'analysis/output/rangebook/{p}_asym.json'))['rows']:
        if t['type'] != 'BREAK': continue
        R = [t['s' + s][tg]['R'] for s, tg in CELLS if t.get('s' + s) and t['s' + s].get(tg)]
        if len(R) == 4: T.append({'inst': p, 'date': t['date'], 'min': t['min'], 'Rm': float(np.mean(R)), 'iv1': iv(p, t['date'], 1), 'iv2': iv(p, t['date'], 2)})
D = pd.DataFrame(T); D['day'] = D['inst'] + D['date']
rng = np.random.default_rng(1)
def ci(x):
    g = x.groupby('day')['Rm'].agg(['sum', 'count']); s, c = g['sum'].to_numpy(), g['count'].to_numpy(); bs = []
    for _ in range(2000):
        w = rng.poisson(1.0, len(g)); bs.append((w * s).sum() / (w * c).sum())
    return np.percentile(bs, [2.5, 97.5])
f3 = lambda v: f'{v:+.3f}'
for lag in (1, 2):
    col = f'iv{lag}'; e = np.nanpercentile(D.loc[D['date'] < '2023-01-01', col].dropna(), [100 / 3, 200 / 3]); top = D[D[col] >= e[1]]
    lo, hi = ci(top); print(f'IV lag {lag} day(s): top third {f3(top.Rm.mean())}R n={len(top):,} days={top.day.nunique():,}  day-clustered 95% CI [{f3(lo)}, {f3(hi)}]')
e = np.nanpercentile(D.loc[D['date'] < '2023-01-01', 'iv1'].dropna(), [100 / 3, 200 / 3]); top = D[D['iv1'] >= e[1]].copy()
q = top.Rm.quantile(0.99); print(f'drop the best 1% of trades: {f3(top[top.Rm < q].Rm.mean())}R; median trade {f3(top.Rm.median())}; share of total from best 1%: {top[top.Rm >= q].Rm.sum() / top.Rm.sum():.0%}')
one = top.sort_values('min').groupby('day').head(1); print(f'first break trade per instrument-day only: {f3(one.Rm.mean())}R n={len(one):,}')
late = top[top['min'] >= 60]; print(f'entries from 01:00 London only (IV certainly published): {f3(late.Rm.mean())}R n={len(late):,}')
print('by period: ' + ', '.join(f"{a}-{b}: {f3(top[(top.date >= a) & (top.date < b)].Rm.mean())} (n={((top.date >= a) & (top.date < b)).sum():,})" for a, b in (('2016', '2020'), ('2020', '2023'), ('2023', '2027'))))
