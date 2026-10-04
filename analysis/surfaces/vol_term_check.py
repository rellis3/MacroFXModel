"""First look (descriptive, NOT pre-registered): does the shape of the S&P implied-vol curve tell you whether the
NQ/SPX range lines run too tight, beyond the vol LEVEL alone?

Data: CBOE daily closes (analysis/surfaces/cboe/, VIX9D/VIX/VIX3M/VXN), local OANDA daily bars for NQ and SPX500
(2016 -> 2026-08). All vol inputs dated strictly before the bar's date.
  level   = (VXN for NQ, VIX for SPX) / sqrt(252) / sigma   (the line tag's index equivalent)
  front   = VIX9D / VIX   (> 1: the next 9 days priced dearer than the next 30 -> near-term event/stress)
  back    = VIX / VIX3M   (> 1: backwardation, the classic stress signal)
Outcome: share of days whose high-low range passes its own p75 (yz-10 sigma, quantile fit 2016-2020; design 25%).
Terciles fit 2016-2020, read 2021-2026. Also: within each level tercile, does the curve shape still separate days?
"""
import numpy as np, pandas as pd
SPLIT = pd.Timestamp('2021-01-01'); out = []
def p(s=''): out.append(str(s)); print(s, flush=True)
def cboe(n):
    d = pd.read_csv(f'analysis/surfaces/cboe/{n}.csv'); d.columns = [c.strip().upper() for c in d.columns]
    return pd.Series(d.CLOSE.values, index=pd.to_datetime(d.DATE, format='%m/%d/%Y')).sort_index()
V = pd.DataFrame({n: cboe(n) for n in ('VIX9D', 'VIX', 'VIX3M', 'VXN')})
V['front'] = V.VIX9D / V.VIX; V['back'] = V.VIX / V.VIX3M
V.index = V.index.astype('datetime64[ns]'); V.index.name = 'date'
def yz(d, n=10):
    o, h, l, c = [np.log(d[k]) for k in ('open', 'high', 'low', 'close')]
    k = 0.34 / (1.34 + (n + 1) / (n - 1)); rs = (h - o) * (h - c) + (l - o) * (l - c)
    return np.sqrt((o - c.shift(1)).rolling(n).var() + k * (c - o).rolling(n).var() + (1 - k) * rs.rolling(n).mean())
raw = pd.read_parquet('VolRangeForecaster/data/m1/all_pairs_d1.parquet').reset_index()
rows = []
for inst, volcol in (('NQ', 'VXN'), ('SPX500', 'VIX')):
    s = raw[raw.pair == inst].copy(); s['date'] = s.datetime.dt.tz_convert(None).dt.normalize()
    s = s.groupby('date').agg(open=('open', 'first'), high=('high', 'max'), low=('low', 'min'), close=('close', 'last')).sort_index()
    s = s[s.index.dayofweek < 5]
    s['sig'] = yz(s).shift(1); s['res'] = np.log(s.high / s.low) / s.sig
    vv = pd.merge_asof(pd.DataFrame({'date': s.index.astype('datetime64[ns]')}), V.reset_index(), on='date', allow_exact_matches=False).set_index('date')
    s['level'] = (vv[volcol] / 100 / np.sqrt(252)).values / s.sig.values
    s['front'] = vv.front.values; s['back'] = vv.back.values
    s = s.dropna(subset=['res', 'level', 'front', 'back']); fit = s[s.index < SPLIT]
    s['x75'] = s.res > fit.res.quantile(0.75)
    for c in ('level', 'front', 'back'):
        e = fit[c].quantile([1 / 3, 2 / 3]).values; s[c + '_t'] = np.digitize(s[c], e)
    s['inst'] = inst; rows.append(s)
S = pd.concat(rows); S['half'] = np.where(S.index < SPLIT, 'fit 2016-20', 'read 2021-26')
p('# S&P vol curve shape vs the NQ/SPX range lines: first look (descriptive, not pre-registered)\n')
p(f'{len(S)} index-days (NQ + SPX500), {S.index.min().date()} -> {S.index.max().date()}\n')
for c, lab in (('level', 'vol level / sigma (the tag)'), ('front', 'VIX9D / VIX (front inversion)'), ('back', 'VIX / VIX3M (backwardation)')):
    t = S.groupby(['half', c + '_t']).x75.agg(['mean', 'size']).round(3).unstack(0)
    p(f'## share of days past p75 by {lab} tercile (design 25%)'); p(t.to_string()); p()
p('## within each level tercile: does the front ratio still separate? (read 2021-26)')
R = S[S.half == 'read 2021-26']
p(R.groupby(['level_t', 'front_t']).x75.agg(['mean', 'size']).round(3).unstack(1).to_string()); p()
p('## within each level tercile: backwardation (read 2021-26)')
p(R.groupby(['level_t', 'back_t']).x75.agg(['mean', 'size']).round(3).unstack(1).to_string()); p()
p(f'current (last row): ' + ', '.join(f"{c}={V[c].dropna().iloc[-1]:.3f}" for c in ('front', 'back')) + f' as of {V.index[-1].date()}')
open('analysis/surfaces/VOL_TERM_CHECK.md', 'w', encoding='utf-8').write('\n'.join(out) + '\n')
