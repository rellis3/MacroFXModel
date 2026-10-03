"""Mechanism check (descriptive, NOT pre-registered): is the rich-IV break edge
explained by the RV-built range forecast being too tight on rich-IV days?

For each instrument in oi_research_book (6 FX + NAS100, 2020-09 -> 2026-08):
  sigma_t   = Yang-Zhang 10-day vol from daily bars through t-1 (the yz_10 idea
              used by forecastSigma.js; daily bars here are the OI book's own,
              not the London-midnight bars, so this is an approximation)
  residual  = ln(H_t/L_t) / sigma_t       (realised range in forecast units)
  features known before day t: IV/RV (iv30_{t-1} / rv20_{t-1}), IV/sigma,
  term slope iv30/iv90, scheduled tier-1 event day.
Tercile edges and the p75 exceedance threshold are fitted on 2020-09..2022-12
only and applied unchanged to 2023-01..2026-08.
"""
import re, json, sys
import numpy as np, pandas as pd

D = 'oi_research_book/data/'
INST = {'EURUSD': '', 'GBPUSD': '_gbp_usd', 'AUDUSD': '_aud_usd', 'USDJPY': '_usd_jpy',
        'USDCAD': '_usd_cad', 'USDCHF': '_usd_chf', 'NAS100': '_nas100_usd'}
IV = {'EURUSD': 'eur_usd', 'GBPUSD': 'gbp_usd', 'AUDUSD': 'aud_usd', 'USDJPY': 'usd_jpy',
      'USDCAD': 'usd_cad', 'USDCHF': 'usd_chf', 'NAS100': 'nas100_usd'}
SPLIT = pd.Timestamp('2023-01-01')

cal = pd.read_csv('calendar_events.csv', usecols=['date', 'ccy', 'event'], encoding='latin-1')
T1 = re.compile(r'nonfarm|non-farm|\bcpi\b|consumer price|fed.*rate|fomc|interest rate decision', re.I)
ev = cal[(cal.ccy == 'USD') & cal.event.str.contains(T1, na=False)]
EVDAYS = set(pd.to_datetime(ev.date))

def yz(df, n=10):
    o, h, l, c = [np.log(df[k]) for k in ('open', 'high', 'low', 'close')]
    co = o - c.shift(1); oc = c - o
    rs = (h - o) * (h - c) + (l - o) * (l - c)
    k = 0.34 / (1.34 + (n + 1) / (n - 1))
    v = co.rolling(n).var() + k * oc.rolling(n).var() + (1 - k) * rs.rolling(n).mean()
    return np.sqrt(v)

rows, out = [], {}
for name, suf in INST.items():
    m = pd.read_parquet(f'{D}daily_master_all{suf}.parquet').sort_values('date')
    iv = pd.read_parquet(f'{D}iv_daily_{IV[name]}.parquet')[['date', 'iv30', 'iv90']]
    m = m.merge(iv, on='date', how='left')
    m = m[(m.high > m.low) & (m.open > 0)].reset_index(drop=True)
    m['sig'] = yz(m).shift(1)                       # known before day t
    m['ivrv'] = (m.iv30 / m.rv20_ann).shift(1)
    m['ivsig'] = (m.iv30 / np.sqrt(252)).shift(1) / m.sig
    m['term'] = (m.iv30 / m.iv90).shift(1)
    m['event'] = m.date.isin(EVDAYS)
    m['res'] = np.log(m.high / m.low) / m.sig
    m = m.dropna(subset=['sig', 'ivrv', 'ivsig', 'term', 'res'])
    m['inst'] = name
    tr = m.date < SPLIT
    q75 = m.loc[tr, 'res'].quantile(0.75)            # the "hl p75 line", train-fitted
    m['exceed75'] = m.res > q75
    for f in ('ivrv', 'ivsig', 'term'):
        e = m.loc[tr, f].quantile([1 / 3, 2 / 3]).values
        m[f + '_t'] = np.digitize(m[f], e)          # 0 cheap, 1 mid, 2 rich
    rows.append(m)

A = pd.concat(rows)
A['half'] = np.where(A.date < SPLIT, 'train 2020-22', 'test 2023-26')

def tab(by):
    g = A.groupby(['half', by]).agg(n=('res', 'size'), median_res=('res', 'median'),
                                    exceed_p75=('exceed75', 'mean'))
    return g.round(3)

lines = []
def p(s=''):
    lines.append(str(s)); print(s)

p('# Residual mechanism check (descriptive, not pre-registered)\n')
p('residual = realised daily ln(H/L) / Yang-Zhang-10 sigma; exceed_p75 = share of days beyond the train-fitted 75th pct (design 25%)\n')
for f, lab in (('ivrv_t', 'IV/RV tercile'), ('ivsig_t', 'IV / sigma-forecast tercile'),
               ('term_t', 'term slope iv30/iv90 tercile'), ('event', 'tier-1 USD event day')):
    p(f'## {lab} (0 = low, 2 = high)\n'); p(tab(f).to_string()); p()

p('## Per instrument, test half 2023-26: exceed_p75 by IV/sigma tercile\n')
t = A[A.date >= SPLIT].groupby(['inst', 'ivsig_t']).exceed75.mean().unstack().round(3)
p(t.to_string()); p()

# Does IV add to sigma? log-range regression, train fit, test R2.
A['lres'] = np.log(np.log(A.high / A.low)); A['lsig'] = np.log(A.sig)
A['liv'] = np.log((A.iv30 / np.sqrt(252)).groupby(A.inst).shift(1))
B = A.dropna(subset=['liv'])
def ols(X, y):
    X = np.column_stack([np.ones(len(X)), X]); b, *_ = np.linalg.lstsq(X, y, rcond=None); return b
def r2(X, y, b):
    X = np.column_stack([np.ones(len(X)), X]); e = y - X @ b; return 1 - e.var() / y.var()
tr, te = B[B.date < SPLIT], B[B.date >= SPLIT]
for cols in (['lsig'], ['lsig', 'liv'], ['lsig', 'liv', 'event']):
    Xtr = tr[cols].astype(float).values; Xte = te[cols].astype(float).values
    b = ols(Xtr, tr.lres.values)
    p(f'log-range ~ {" + ".join(cols)}: coef {np.round(b[1:], 3).tolist()}  test R2 {r2(Xte, te.lres.values, b):.3f}')
open('analysis/exhaustion_residual/RESIDUAL_MECHANISM_CHECK.md', 'w').write('\n'.join(lines) + '\n')
