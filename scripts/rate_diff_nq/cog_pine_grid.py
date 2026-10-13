"""Run C.OG's pasted Pine pipeline (EUR=ICEEUR:I2!, USD=CME:SR3U2026) over its own option space, fitting scale/offset by least squares:
data timeframe x price source x EMA smoothing. Score vs his digitised line on level corr, 15-min change corr, flat share."""
import itertools, numpy as np, pandas as pd
from datetime import date, timedelta
OUT = 'analysis/output/cog_video_0918/'
def ltd(y, m):
    x = date(y, m, 1); w = [x + timedelta(i) for i in range(31) if (x + timedelta(i)).month == m and (x + timedelta(i)).weekday() == 2][2]; n = 0
    while n < 2:
        w -= timedelta(1); n += (w.weekday() < 5)
    return w
def ld(p):
    d = pd.read_parquet(p); d['time'] = pd.to_datetime(d['time'], utc=True); return d.set_index('time').sort_index()
code = {'K': 5, 'M': 6, 'N': 7, 'Q': 8, 'U': 9, 'V': 10, 'X': 11}; months = list(range(3, 13)); exp = {m: ltd(2026, m) for m in months}; pcs = []
for i in range(2, len(months)):
    me = months[i]
    k = [c for c, m in code.items() if m == me]
    if not k: continue
    d = ld(f'analysis/output/stir_1m_i2/ICEEU_I{k[0]}6.parquet'); lo = pd.Timestamp(exp[months[i-2]] + timedelta(days=1), tz='UTC'); hi = pd.Timestamp(exp[months[i-1]] + timedelta(days=1), tz='UTC')
    pcs.append(d[(d.index >= lo) & (d.index < hi)])
I2 = pd.concat(pcs); I2 = I2[~I2.index.duplicated()]; SOFR = ld('analysis/output/stir_1m/CME_SR3U6.parquet')
his = pd.read_csv(OUT + 'cog_line_digitised_15m_full.csv', index_col=0, parse_dates=True)['value']; his.index = his.index.tz_convert('UTC')
def bars(df, tf):
    g = df.resample(tf, label='right', closed='right'); o = pd.DataFrame({'open': g.open.first(), 'high': g.high.max(), 'low': g.low.min(), 'close': g.close.last()}).dropna()
    o['hl2'] = (o.high + o.low) / 2; o['ohlc4'] = o[['open', 'high', 'low', 'close']].mean(1); return o
chart = pd.date_range('2026-04-13', '2026-10-09', freq='15min', tz='UTC')
def leg(df, tf, src): return bars(df, tf)[src].reindex(chart).ffill() if tf != '15min' else bars(df, '15min')[src].reindex(chart).ffill()
rows = []
for tf, src, sm in itertools.product(('15min', '30min', '1h', '4h', '1D'), ('close', 'open', 'high', 'low', 'hl2', 'ohlc4'), (1, 2, 3, 5, 8, 13, 21)):
    eur, usd = 100 - leg(I2, tf, src), 100 - leg(SOFR, tf, src); s = (eur - usd)
    if sm > 1: s = s.ewm(alpha=2 / (sm + 1), adjust=False).mean()
    x = s.reindex(his.index).ffill(); j = pd.concat([his.rename('y'), x.rename('x')], axis=1).dropna()
    if len(j) < 150 or j.x.std() == 0: continue
    dy, dx = j.y.diff().dropna(), j.x.diff().dropna(); b, a = np.polyfit(j.x, j.y, 1)
    rows.append(dict(tf=tf, src=src, ema=sm, level=j.y.corr(j.x), change=np.corrcoef(dy, dx)[0, 1], flat=(dx.abs() < 1e-9).mean(), scale_per_pct=b, offset=a))
R = pd.DataFrame(rows); R['abs_change'] = R.change.abs(); R['abs_level'] = R.level.abs()
R.to_csv(OUT + 'cog_pine_grid.csv', index=False)
pd.set_option('display.width', 200); print(f'{len(R)} configurations (his own option space). his flat share = 0.31')
print('\ndefault (D, close, ema 1):'); print(R[(R.tf == '1D') & (R.src == 'close') & (R.ema == 1)].round(3).to_string(index=False))
print('\ntop 8 by |bar-to-bar corr|:'); print(R.sort_values('abs_change', ascending=False).head(8).drop(columns=['abs_change', 'abs_level']).round(3).to_string(index=False))
print('\ntop 5 by |level corr|:'); print(R.sort_values('abs_level', ascending=False).head(5).drop(columns=['abs_change', 'abs_level']).round(3).to_string(index=False))
print('\nconfigs with change corr magnitude >= 0.5:', int((R.abs_change >= 0.5).sum()), '; >= 0.4:', int((R.abs_change >= 0.4).sum()))
