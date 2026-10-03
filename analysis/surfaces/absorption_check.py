"""Absorption ratio (Kritzman, Li, Page & Rigobon 2011) on the FX cross-section.
Descriptive first look, NOT pre-registered.

Data: local all_pairs_d1 (OANDA daily, 2016 -> 2026-08), FX pairs only.
AR_t = share of the variance of the last 60 days' pair returns explained by the first
k eigenvectors (k = 1 and k = 5 of ~28). Everything at t uses returns through t only.
Dollar factor = mean return of the USD pairs signed so + = dollar up.
Questions:
  Q1 stress: does a rise in AR (15-day mean vs 1-year mean, in sd) precede higher FX vol over the next 20 days?
  Q2 range: does AR tercile change how often tomorrow's range exceeds its own p75 (yz-10 sigma)?
  Q3 direction: when AR is high, does the dollar factor trend more (5-day sign -> next 5-day sign)?
Thresholds fitted on 2016-2020, read on 2021-2026.
"""
import numpy as np, pandas as pd
d = pd.read_parquet('VolRangeForecaster/data/m1/all_pairs_d1.parquet').reset_index()
d['date'] = d.datetime.dt.tz_convert(None).dt.normalize()
fx = d[d.pair.str.fullmatch('[A-Z]{6}') & ~d.pair.str.startswith('XA')]   # FX only; bars are NY-close sessions
C = fx.pivot_table(index='date', columns='pair', values='close').sort_index()
C = C.dropna(axis=1, thresh=int(len(C) * .9)).ffill()
R = np.log(C).diff().dropna()
usd = {p: (1 if p.startswith('USD') else -1) for p in R.columns if 'USD' in p}
dollar = sum(R[p] * s for p, s in usd.items()) / len(usd)
W, SPLIT = 60, '2021-01-01'
ar1, ar5, pc1_usd = {}, {}, {}
for i in range(W, len(R)):
    X = R.iloc[i - W + 1:i + 1]; X = (X - X.mean()) / X.std()
    ev, vec = np.linalg.eigh(np.cov(X.values.T)); ev, vec = ev[::-1], vec[:, ::-1]
    t = R.index[i]; ar1[t] = ev[0] / ev.sum(); ar5[t] = ev[:5].sum() / ev.sum()
    f = X.values @ vec[:, 0]; pc1_usd[t] = abs(np.corrcoef(f, dollar.loc[X.index])[0, 1])
A = pd.DataFrame({'ar1': ar1, 'ar5': ar5, 'pc1_usd': pc1_usd})
A['shift'] = (A.ar5.rolling(15).mean() - A.ar5.rolling(250).mean()) / A.ar5.rolling(250).std()
vol = R.abs().mean(axis=1)                                  # cross-sectional mean |return|
A['fwd_vol20'] = vol[::-1].rolling(20).mean()[::-1].shift(-1) / vol.rolling(250).mean()
A['dollar5'] = dollar.rolling(5).sum(); A['dollar_fwd5'] = dollar[::-1].rolling(5).sum()[::-1].shift(-1)
out = []
def p(s=''): out.append(str(s)); print(s)
p('# Absorption ratio on 28 FX pairs: first look (descriptive, not pre-registered)\n')
p(f'{len(R.columns)} pairs, {A.index.min().date()} -> {A.index.max().date()}, 60-day window')
p(f'AR1 mean {A.ar1.mean():.3f} (1/n would be {1/len(R.columns):.3f}); PC1 vs dollar factor |corr| median {A.pc1_usd.median():.2f}\n')
tr = A.index < SPLIT
for col in ('shift', 'ar5'):
    e = A.loc[tr, col].quantile([1/3, 2/3]).values
    A[col + '_t'] = np.digitize(A[col], e)
    p(f'## Q1 {col} tercile -> next-20-day FX vol (1 = normal)')
    p(A.groupby([np.where(tr, 'fit 2016-20', 'read 2021-26'), col + '_t']).fwd_vol20.mean().unstack().round(3).to_string()); p()
# Q2: per-pair range exceedance
rows = []
for pr in R.columns:
    s = fx[fx.pair == pr].set_index('date').sort_index()
    o, h, l, c = [np.log(s[k]) for k in ('open', 'high', 'low', 'close')]
    k = 0.34 / (1.34 + 11 / 9); rs = (h - o) * (h - c) + (l - o) * (l - c)
    sig = np.sqrt((o - c.shift(1)).rolling(10).var() + k * (c - o).rolling(10).var() + (1 - k) * rs.rolling(10).mean()).shift(1)
    res = (h - l) / sig; q = res[res.index < SPLIT].quantile(.75)
    rows.append(pd.DataFrame({'x': res > q, 'pair': pr}, index=res.index))
X = pd.concat(rows).join(A[['ar5_t']].shift(1), how='inner').dropna()
p('## Q2 yesterday AR5 tercile -> share of pair-days beyond their p75 range (design 25%)')
p(X.groupby([np.where(X.index < SPLIT, 'fit 2016-20', 'read 2021-26'), 'ar5_t']).x.mean().unstack().round(3).to_string()); p()
A['hit'] = np.sign(A.dollar5) == np.sign(A.dollar_fwd5)
p('## Q3 dollar 5-day sign -> next 5 days same sign (50% = no trend), by AR5 tercile')
p(A.dropna(subset=['dollar_fwd5']).groupby([np.where(A.dropna(subset=['dollar_fwd5']).index < SPLIT, 'fit 2016-20', 'read 2021-26'), 'ar5_t']).hit.agg(['mean', 'size']).round(3).to_string())
open('analysis/surfaces/ABSORPTION_CHECK.md', 'w', encoding='utf-8').write('\n'.join(out) + '\n')
A.to_parquet('analysis/surfaces/absorption_series.parquet')
