"""Build ICE Euribor continuous I2! (2nd unexpired contract, rolled at expiry, UNADJUSTED like TradingView) from the 1-min serial
contracts in analysis/output/stir_1m_i2/, form C.OG's default spread (EUR rate - USD rate, SOFR = CME SR3U6), and test it against his digitised
line, including the Pine script's data-timeframe behaviour (request.security, lookahead_off: value updates when the HTF bar closes, held between)."""
import glob, os
from datetime import date, timedelta
import numpy as np, pandas as pd, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
OUT = 'analysis/output/cog_video_0918/'
def ltd(y, m):
    x = date(y, m, 1); w = [x + timedelta(i) for i in range(31) if (x + timedelta(i)).month == m and (x + timedelta(i)).weekday() == 2][2]; n = 0
    while n < 2:
        w -= timedelta(1); n += (w.weekday() < 5)
    return w
code = {'K': 5, 'M': 6, 'N': 7, 'Q': 8, 'U': 9, 'V': 10, 'X': 11}
def ld(path):
    d = pd.read_parquet(path); d['time'] = pd.to_datetime(d['time'], utc=True); return d.set_index('time')['close'].sort_index()
C = {m: ld(f'analysis/output/stir_1m_i2/ICEEU_I{k}6.parquet') for k, m in code.items()}
months = [3, 4] + list(range(5, 13)); exp = {m: ltd(2026, m) for m in months}
pieces, rolls = [], []
for i in range(2, len(months)):
    prev2, prev1, me = months[i - 2], months[i - 1], months[i]
    if me not in C: continue
    lo = pd.Timestamp(exp[prev2] + timedelta(days=1), tz='UTC'); hi = pd.Timestamp(exp[prev1] + timedelta(days=1), tz='UTC')
    s = C[me][(C[me].index >= lo) & (C[me].index < hi)]; pieces.append(s.rename('i2')); rolls.append((str(lo.date()), me))
I2 = pd.concat(pieces).sort_index(); I2 = I2[~I2.index.duplicated()]
print('I2! splice (contract month by start date):', rolls)
# roll jumps (unadjusted): last minute of old piece vs first minute of new, in bp of rate
for a, b in zip(pieces[:-1], pieces[1:]):
    print(f'  roll {b.index[0].date()}: I2 price {a.iloc[-1]:.4f} -> {b.iloc[0]:.4f}  = {100*(a.iloc[-1]-b.iloc[0]):+.1f} bp of rate (spurious jump on a continuous chart)')
S = ld('analysis/output/stir_1m/CME_SR3U6.parquet')
j = pd.concat([I2, S.rename('sofr')], axis=1).dropna(); spread = (100 - j.i2) - (100 - j.sofr)          # EUR rate - USD rate, % (his default sign)
spread.to_frame('spread_eur_minus_usd').to_parquet(OUT + 'i2_sofr_u6_spread_1m.parquet')
print(f'spread 1m: {len(spread):,} bars {spread.index[0]} -> {spread.index[-1]}; range {spread.min():.3f} .. {spread.max():.3f} %')
his = pd.read_csv(OUT + 'cog_line_digitised_15m_full.csv', index_col=0, parse_dates=True)['value']; his.index = his.index.tz_convert('UTC')
def sample(s, tf):
    """Pine request.security(tf) on a 15m chart, lookahead_off, historical bars: value = last HTF-bar close at/before the chart bar's close."""
    if tf == '1min': return s.resample('15min', label='right', closed='right').last()
    htf = s.resample(tf, label='right', closed='right').last().dropna()
    return htf.reindex(pd.date_range(s.index[0].ceil('15min'), s.index[-1], freq='15min')).ffill()
print('\nHis exact pair vs his line, by data timeframe (his script default = D):')
print(f"{'tf':6s} {'level':>6s} {'chg':>6s} {'chg+1bar':>8s} {'flat%':>6s}  (his flat% = 31)")
rows = []
for tf in ('1min', '5min', '15min', '30min', '1h', '2h', '4h', '1D'):
    x = (sample(spread, tf) if tf != '15min' else sample(spread, '1min')).reindex(his.index).ffill(); jj = pd.concat([his.rename('y'), x.rename('x')], axis=1).dropna()
    dy, dx = jj.y.diff().dropna(), jj.x.diff().dropna(); cc = np.corrcoef(dy, dx)[0, 1]; cc1 = max(np.corrcoef(dy.iloc[1:], dx.iloc[:-1])[0, 1], np.corrcoef(dy.iloc[:-1], dx.iloc[1:])[0, 1])
    rows.append((tf, jj.y.corr(jj.x), cc, cc1, (dx == 0).mean())); print(f'{tf:6s} {rows[-1][1]:+6.2f} {cc:+6.2f} {cc1:+8.2f} {rows[-1][4]:6.0%}')
# chart: his line vs ours (1-min->15m, affine-fitted) over the video week + full-history spread with roll markers
x15 = sample(spread, '1min'); xx = x15.reindex(his.index).ffill(); jj = pd.concat([his.rename('y'), xx.rename('x')], axis=1).dropna(); b, a = np.polyfit(jj.x, jj.y, 1)
fig, ax = plt.subplots(2, 1, figsize=(16, 9))
ax[0].plot(his.index, his, color='tab:blue', lw=2.2, label="C.OG's line"); ax[0].plot(xx.index, a + b * xx, color='tab:red', lw=1.1, label=f'SR3U6 vs I2! (EUR-USD), fitted {b:+.1f}·s{a:+.1f}')
ax[0].legend(fontsize=8); ax[0].set_title(f'Video week: his exact default pair (SOFR Sep26 vs Euribor I2! = Nov26) vs his line; level corr {jj.y.corr(jj.x):+.2f}')
ax[1].plot(x15.index, x15, lw=0.8, color='tab:red'); [ax[1].axvline(pd.Timestamp(r[0], tz='UTC'), ls='--', lw=0.6, color='grey') for r in rolls]
ax[1].set_title('Full 1-min history of the pair (EUR rate - USD rate, %), grey = I2! rolls (unadjusted splice)'); plt.tight_layout(); plt.savefig(OUT + 'i2_sofr_pair.png', dpi=95)
