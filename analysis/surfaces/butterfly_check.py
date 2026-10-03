"""First look (descriptive, NOT pre-registered): does the options market's tail pricing (25-delta butterfly, 30-day)
change what happens at a p75 line touch? Fat tails priced -> more p75->p90 runs?

Data: oi_research_book iv_daily (CME settlement-built, 2020-09 -> 2026-08): iv30, rr25_30, bf25_30, 6 FX majors.
bf_rel = bf25_30 / iv30 (tail premium per unit vol), dated t-1. Terciles fitted 2020-09..2022-12, read 2023-26.
Lines and touches exactly as tag_x_persistence.py (London day, yz-10 sigma, p50/75/90 quantiles fit on the first part).
Also the skew sign check: rr in the direction of the touch (calls dearer on an OH touch) -> more continuation?
"""
import numpy as np, pandas as pd
INST = {'EURUSD': ('eurusd', 'eur_usd', 1), 'GBPUSD': ('gbpusd', 'gbp_usd', 1), 'AUDUSD': ('audusd', 'aud_usd', 1),
        'USDJPY': ('usdjpy', 'usd_jpy', -1), 'USDCAD': ('usdcad', 'usd_cad', -1), 'USDCHF': ('usdchf', 'usd_chf', -1)}
SPLIT = pd.Timestamp('2023-01-01'); out = []
def p(s=''): out.append(str(s)); print(s, flush=True)
def yz(d, n=10):
    o, h, l, c = [np.log(d[k]) for k in ('open', 'high', 'low', 'close')]
    k = 0.34 / (1.34 + (n + 1) / (n - 1)); rs = (h - o) * (h - c) + (l - o) * (l - c)
    return np.sqrt((o - c.shift(1)).rolling(n).var() + k * (c - o).rolling(n).var() + (1 - k) * rs.rolling(n).mean())
rows = []
for inst, (f, ivf, rsgn) in INST.items():
    iv = pd.read_parquet(f'oi_research_book/data/iv_daily_{ivf}.parquet')[['date', 'iv30', 'rr25_30', 'bf25_30']].dropna().sort_values('date'); iv['date'] = iv.date.astype('datetime64[ns]')
    m = pd.read_parquet(f'VolRangeForecaster/data/m1/{f}_m1.parquet')
    lt = m.index.tz_convert('Europe/London'); k_ = lt.dayofweek < 5; m, lt = m[k_], lt[k_]
    m = m.assign(day=lt.normalize().tz_localize(None)); m = m[m.day >= '2020-08-01']
    d = m.groupby('day').agg(open=('open', 'first'), high=('high', 'max'), low=('low', 'min'), close=('close', 'last'))
    d['sig'] = yz(d).shift(1); d['up'] = (d.high / d.open - 1) / d.sig; d['dn'] = (1 - d.low / d.open) / d.sig
    A = d[d.index < SPLIT]; ku, kd = A.up.quantile([.5, .75, .9]).values, A.dn.quantile([.5, .75, .9]).values
    dd = pd.merge_asof(d.reset_index().rename(columns={'day': 'date'})[['date']].astype('datetime64[ns]'), iv, on='date', allow_exact_matches=False).set_index('date')
    d['bf'] = (dd.bf25_30 / dd.iv30).values; d['rr'] = (rsgn * dd.rr25_30 / dd.iv30).values   # rr > 0: calls on the BASE ccy dearer -> upside of the spot pair
    for day, bars in m.groupby('day'):
        r = d.loc[day]
        if not np.isfinite(r.sig) or not np.isfinite(r.bf): continue
        H, L = bars.high.values, bars.low.values
        for side, k in (('OH', ku), ('OL', kd)):
            g = 1 if side == 'OH' else -1
            L50, L75, L90 = (r.open * (1 + g * x * r.sig) for x in k)
            hit = (H >= L75) if g > 0 else (L <= L75)
            if not hit.any(): continue
            ti = int(np.argmax(hit)); hH, hL = H[ti + 1:], L[ti + 1:]
            far = (hH >= L90) if g > 0 else (hL <= L90); near = (hL <= L50) if g > 0 else (hH >= L50)
            iF = int(np.argmax(far)) if far.any() else 10 ** 9; iN = int(np.argmax(near)) if near.any() else 10 ** 9
            o_ = 'stall' if iF == iN == 10 ** 9 else 'continue' if iF < iN else 'fade' if iN < iF else 'both'
            rows.append(dict(inst=inst, day=day, out=o_, bf=r.bf, rr_with=g * r.rr))
T = pd.DataFrame(rows); T = T[T.out != 'both']; T['half'] = np.where(T.day < SPLIT, 'fit 2020-22', 'read 2023-26')
p('# Butterfly (tail pricing) and risk reversal at the p75 line: first look (descriptive, not pre-registered)\n')
p(f'{len(T)} first p75 touches, 6 FX majors, {T.day.min().date()} -> {T.day.max().date()}\n')
for col, lab in (('bf', 'butterfly / iv30 (0 = thin tails priced, 2 = fat)'), ('rr_with', 'risk reversal in the touch direction / iv30 (0 = against, 2 = with)')):
    T[col + '_t'] = T.groupby('inst')[col].transform(lambda x: np.digitize(x, x[T.loc[x.index, 'day'] < SPLIT].quantile([1 / 3, 2 / 3]).values))
    g = T.groupby(['half', col + '_t']).out.value_counts(normalize=True).unstack().round(3); g['n'] = T.groupby(['half', col + '_t']).size()
    p(f'## {lab}'); p(g.to_string()); p()
open('analysis/surfaces/BUTTERFLY_CHECK.md', 'w', encoding='utf-8').write('\n'.join(out) + '\n')
