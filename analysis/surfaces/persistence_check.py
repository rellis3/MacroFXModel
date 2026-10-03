"""Persistence by horizon (variance ratio, Lo & MacKinlay 1988) as a regime for the vol lines.
Descriptive first look, NOT pre-registered.

VR(q) = mean((sum of q consecutive 5-min returns)^2) / (q * mean(5-min return^2)), over the last
20 London days (through yesterday). VR > 1: moves at that horizon have been extending (trend);
VR < 1: they have been reversing. Horizons q = 3 (15m), 12 (1h), 48 (4h).
Question: does yesterday's VR regime change what happens at today's p75 line touch
(continue to p90 / fade to p50 / stall), which the price-at-touch features could not?
Lines: London-midnight open, yz-10 sigma (t-1), OH/OL quantiles fitted 2016-2020.
Terciles fitted 2016-2020, read 2021-2026.
"""
import numpy as np, pandas as pd
INST = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdcad', 'usdchf', 'xauusd', 'nq']
SPLIT, QS = '2021-01-01', (3, 12, 48)
out = []
def p(s=''): out.append(str(s)); print(s)
def yz(d, n=10):
    o, h, l, c = [np.log(d[k]) for k in ('open', 'high', 'low', 'close')]
    k = 0.34 / (1.34 + (n + 1) / (n - 1)); rs = (h - o) * (h - c) + (l - o) * (l - c)
    return np.sqrt((o - c.shift(1)).rolling(n).var() + k * (c - o).rolling(n).var() + (1 - k) * rs.rolling(n).mean())
rows = []
for inst in INST:
    try: m = pd.read_parquet(f'VolRangeForecaster/data/m1/{inst}_m1.parquet')
    except FileNotFoundError: print('skip', inst); continue
    lt = m.index.tz_convert('Europe/London'); m = m[lt.dayofweek < 5]; lt = lt[lt.dayofweek < 5]
    m = m.assign(day=lt.normalize().tz_localize(None))
    c5 = m.close.resample('5min').last().dropna(); r = np.log(c5).diff().dropna()
    rday = r.index.tz_convert('Europe/London').normalize().tz_localize(None)
    stats = {'r2': (r ** 2).groupby(rday).sum(), 'n': r.groupby(rday).size()}
    for q in QS:
        blk = r.groupby([rday, np.arange(len(r)) // q]).sum()
        stats[f'b{q}'] = (blk ** 2).groupby(level=0).sum()
    S = pd.DataFrame(stats)
    for q in QS:
        S[f'vr{q}'] = (S[f'b{q}'].rolling(20).sum() / S.r2.rolling(20).sum()).shift(1)   # through yesterday
    d = m.groupby('day').agg(open=('open', 'first'), high=('high', 'max'), low=('low', 'min'), close=('close', 'last'))
    d['sig'] = yz(d).shift(1); d['up'] = (d.high / d.open - 1) / d.sig; d['dn'] = (1 - d.low / d.open) / d.sig
    fit = d[d.index < SPLIT]; ku = fit.up.quantile([.5, .75, .9]).values; kd = fit.dn.quantile([.5, .75, .9]).values
    for day, bars in m.groupby('day'):
        if day not in S.index or np.isnan(d.at[day, 'sig']) or np.isnan(S.at[day, 'vr12']): continue
        o, s = d.at[day, 'open'], d.at[day, 'sig']
        for side, k in (('OH', ku), ('OL', kd)):
            sg = 1 if side == 'OH' else -1
            L50, L75, L90 = (o * (1 + sg * x * s) for x in k)
            hit = (bars.high >= L75) if sg > 0 else (bars.low <= L75)
            if not hit.any(): continue
            after = bars.iloc[int(np.argmax(hit.values)) + 1:]
            c = (after.high >= L90) if sg > 0 else (after.low <= L90); f = (after.low <= L50) if sg > 0 else (after.high >= L50)
            B = 10 ** 9; ic = int(np.argmax(c.values)) if c.any() else B; jf = int(np.argmax(f.values)) if f.any() else B
            if ic == jf and ic != B: continue
            rows.append(dict(inst=inst, day=day, out='stall' if ic == jf else ('continue' if ic < jf else 'fade'),
                             **{f'vr{q}': S.at[day, f'vr{q}'] for q in QS}))
    print(inst, 'done', flush=True)
T = pd.DataFrame(rows); T['half'] = np.where(T.day < SPLIT, 'fit 2016-20', 'read 2021-26')
p('# Persistence (variance ratio) regime at the p75 line: first look (descriptive, not pre-registered)\n')
p(f'{len(T)} p75 touches, {T.inst.nunique()} instruments, {T.day.min().date()} -> {T.day.max().date()}')
p('Overall: ' + str(T.out.value_counts(normalize=True).round(3).to_dict()) + '\n')
for q in QS:
    T[f'vr{q}_t'] = T.groupby('inst')[f'vr{q}'].transform(lambda x: np.digitize(x, x[T.loc[x.index, 'day'] < SPLIT].quantile([1/3, 2/3]).values))
    g = T.groupby(['half', f'vr{q}_t']).out.value_counts(normalize=True).unstack().round(3)
    g['n'] = T.groupby(['half', f'vr{q}_t']).size()
    p(f'## VR at {q * 5} min, tercile within instrument (0 = reverting, 2 = trending)'); p(g.to_string()); p()
p('Median VR by horizon (all days): ' + str({q * 5: round(T[f'vr{q}'].median(), 3) for q in QS}))
open('analysis/surfaces/PERSISTENCE_CHECK.md', 'w', encoding='utf-8').write('\n'.join(out) + '\n')
