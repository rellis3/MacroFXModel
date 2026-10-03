"""First look (descriptive, NOT pre-registered): do OANDA resting orders around a
vol line say whether a touch continues or fades?

Window: order book 2025-09 -> M1 end 2026-08-20 (~240 days), 8 instruments.
Lines: London-midnight open, sigma = Yang-Zhang 10d on London days (t-1),
OH/OL p50/p75/p90 = quantiles of (H-O)/O/sigma fitted on 2016-2024 only.
Touch: first M1 bar reaching OH p75 (or OL p75). Race after the touch bar to
London day end: continue = p90 first, fade = p50 first, else stall.
Book: last 20-min snapshot stamped >= 20 min before the touch (no look-ahead).
Above price a buy order is a buy STOP and a sell order a sell LIMIT; mirror below.
  fuel = stops in the 0.3-sigma band beyond the line
  wall = limits within +-0.1 sigma of the line
  fuel_share = fuel / (fuel + wall)
"""
import glob, numpy as np, pandas as pd
INST = {'EUR_USD': 'eurusd', 'GBP_USD': 'gbpusd', 'USD_JPY': 'usdjpy', 'AUD_USD': 'audusd',
        'USD_CAD': 'usdcad', 'USD_CHF': 'usdchf', 'NZD_USD': 'nzdusd', 'XAU_USD': 'xauusd'}
M1 = 'VolRangeForecaster/data/m1/{}_m1.parquet'
OUT = []
def p(s=''): OUT.append(str(s)); print(s)

def yz(d, n=10):
    o, h, l, c = [np.log(d[k]) for k in ('open', 'high', 'low', 'close')]
    k = 0.34 / (1.34 + (n + 1) / (n - 1))
    rs = (h - o) * (h - c) + (l - o) * (l - c)
    return np.sqrt((o - c.shift(1)).rolling(n).var() + k * (c - o).rolling(n).var() + (1 - k) * rs.rolling(n).mean())

rows = []
for ob, m1n in INST.items():
    files = sorted(glob.glob(f'data/books/order/{ob}/*.parquet'))
    if not files: continue
    book = pd.concat(pd.read_parquet(f) for f in files)
    book['time'] = pd.to_datetime(book.time)
    g = {k: v for k, v in book.groupby('time')}
    snaps = np.array(sorted(g.keys()), dtype='datetime64[ns]')
    m = pd.read_parquet(M1.format(m1n))
    lt = m.index.tz_convert('Europe/London')
    m = m.assign(day=lt.normalize().tz_localize(None))
    m = m[lt.dayofweek < 5]
    d = m.groupby('day').agg(open=('open', 'first'), high=('high', 'max'), low=('low', 'min'), close=('close', 'last'))
    d['sig'] = yz(d).shift(1)
    d['up'] = (d.high / d.open - 1) / d.sig; d['dn'] = (1 - d.low / d.open) / d.sig
    fit = d[d.index < '2025-01-01']
    ku = fit.up.quantile([.5, .75, .9]).values; kd = fit.dn.quantile([.5, .75, .9]).values
    start = pd.Timestamp(snaps[0]).normalize() + pd.Timedelta(days=1)
    for day, bars in m[m.day >= start].groupby('day'):
        if day not in d.index or np.isnan(d.at[day, 'sig']): continue
        o, s = d.at[day, 'open'], d.at[day, 'sig']
        for side, k in (('OH', ku), ('OL', kd)):
            sgn = 1 if side == 'OH' else -1
            L50, L75, L90 = (o * (1 + sgn * x * s) for x in k)
            hit = bars.high >= L75 if side == 'OH' else bars.low <= L75
            if not hit.any(): continue
            ti = int(np.argmax(hit.values)); t = bars.index[ti]
            after = bars.iloc[ti + 1:]
            c = (after.high >= L90) if side == 'OH' else (after.low <= L90)
            f = (after.low <= L50) if side == 'OH' else (after.high >= L50)
            BIG = 10**9
            ic = int(np.argmax(c.values)) if c.any() else BIG; jf = int(np.argmax(f.values)) if f.any() else BIG
            out = 'stall' if ic == jf == BIG else ('continue' if ic < jf else ('fade' if jf < ic else 'both'))
            tq = np.datetime64((t - pd.Timedelta(minutes=20)).tz_convert('UTC').tz_localize(None), 'ns')
            j = np.searchsorted(snaps, tq, 'right') - 1
            if j < 0 or tq - snaps[j] > np.timedelta64(2, 'h'): continue
            snap = g[pd.Timestamp(snaps[j])]
            w = o * s
            if side == 'OH':
                fuel = snap.loc[(snap.price > L75) & (snap.price <= L75 + 0.3 * w), 'long'].sum()
                wall = snap.loc[(snap.price >= L75 - 0.1 * w) & (snap.price <= L75 + 0.1 * w), 'short'].sum()
            else:
                fuel = snap.loc[(snap.price < L75) & (snap.price >= L75 - 0.3 * w), 'short'].sum()
                wall = snap.loc[(snap.price >= L75 - 0.1 * w) & (snap.price <= L75 + 0.1 * w), 'long'].sum()
            rows.append(dict(inst=ob, day=day, side=side, out=out, fuel=fuel, wall=wall,
                             share=fuel / (fuel + wall) if fuel + wall > 0 else np.nan))
R = pd.DataFrame(rows).dropna(subset=['share'])
R = R[R.out != 'both']
p('# Order book at the p75 line: first look (descriptive, not pre-registered)\n')
p(f'{len(R)} touches, {R.inst.nunique()} instruments, {R.day.min().date()} -> {R.day.max().date()}\n')
p('Overall: ' + str(R.out.value_counts(normalize=True).round(3).to_dict()) + '\n')
R['fuel_t'] = R.groupby('inst').share.transform(lambda x: pd.qcut(x.rank(method='first'), 3, labels=['wall-heavy', 'mixed', 'stop-heavy']).astype(str))
t = pd.crosstab(R.fuel_t, R.out, normalize='index').round(3); t['n'] = R.fuel_t.value_counts()
p('By fuel share tercile (within instrument):'); p(t.to_string()); p()
for nm, sub in (('first half', R[R.day < R.day.median()]), ('second half', R[R.day >= R.day.median()])):
    p(f'{nm}: continue rate by tercile ' + str(sub.groupby('fuel_t').out.apply(lambda x: round((x == 'continue').mean(), 3)).to_dict()))
p(); p('Per instrument, continue rate stop-heavy minus wall-heavy:')
p(R.groupby('inst').apply(lambda x: round((x[x.fuel_t == 'stop-heavy'].out == 'continue').mean() - (x[x.fuel_t == 'wall-heavy'].out == 'continue').mean(), 3)).to_string())
open('analysis/exhaustion_residual/ORDERBOOK_LINE_LOOK.md', 'w').write('\n'.join(OUT) + '\n')
