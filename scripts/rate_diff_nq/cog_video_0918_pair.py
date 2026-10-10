"""His literal pair for the video week: SOFR Sep26 (SR3U6) - ESTR Sep26 (ER3U6), 1-min MIDPOINT, both live through Dec 2026.
Also the same pair on Z6 and the Euribor version, against OANDA NAS100 1-min. Adds the panel to cog_video_0918/."""
import pandas as pd, numpy as np, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
D = 'analysis/output/stir_1m/'; OUT = 'analysis/output/cog_video_0918/'
def load(f, lo='2026-09-16', hi='2026-09-23'):
    d = pd.read_parquet(f); d['time'] = pd.to_datetime(d['time'], utc=True)
    s = d.set_index('time')['close']; return s[(s.index >= lo) & (s.index < hi)]
q = pd.read_parquet('VolRangeForecaster/data/m1/nq_m1.parquet')['close']          # index 'datetime', UTC; ends 2026-08-20
nq = q[(q.index >= '2026-09-16') & (q.index < '2026-09-23')]; src = 'OANDA NAS100 1m'
if nq.empty:
    nq = load(D + 'CME_NQZ6.parquet'); src = 'CME NQZ6 (OANDA m1 file ends 2026-08-20)'
r = lambda f: 100 - load(D + f)
idx = pd.date_range('2026-09-16', '2026-09-23', freq='15min', tz='UTC', inclusive='left')
r15 = lambda s: s.resample('15min', label='right', closed='right').last().reindex(idx).ffill()
C = {src: r15(nq),
     'SOFR U6 - ESTR U6 (his pair) %': r15(r('CME_SR3U6.parquet')) - r15(r('ICEEU_ER3U6.parquet')),
     'SOFR Z6 - ESTR U6 %': r15(r('CME_SR3Z6.parquet')) - r15(r('ICEEU_ER3U6.parquet')),
     'SOFR U6 - Euribor Z6 %': r15(r('CME_SR3U6.parquet')) - r15(r('ICEEU_IZ6.parquet')),
     'SOFR U6 rate %': r15(r('CME_SR3U6.parquet')), 'ESTR U6 rate %': r15(r('ICEEU_ER3U6.parquet'))}
df = pd.DataFrame(C); df.to_csv(OUT + 'rebuild_pair_15m.csv')
uk = lambda s: pd.Timestamp(s, tz='UTC')
marks = [uk('2026-09-18 15:00'), uk('2026-09-18 15:45'), uk('2026-09-18 16:15'), uk('2026-09-21 13:15')]
fig, ax = plt.subplots(len(C), 1, figsize=(16, 2.3 * len(C)), sharex=True)
for a, (k, s) in zip(ax, C.items()):
    a.plot(s.index, s.values, lw=0.9, color='k' if k == src else 'tab:blue'); a.set_ylabel(k, fontsize=7, rotation=0, ha='right')
    for t in marks: a.axvline(t, ls='--', lw=0.6, color='r')
ax[0].set_title('16-23 Sep 2026: his literal pair SOFR U6 - ESTR U6 (1m midpoints, 15m sample, UTC)')
plt.tight_layout(); plt.savefig(OUT + 'rebuild_pair.png', dpi=90)
w = df.loc[uk('2026-09-18 13:00'):uk('2026-09-18 18:00')]
print('--- Fri 18 Sep lows 13:00-18:00 UTC'); [print(f'{k:32s} min {w[k].idxmin():%H:%M}  max {w[k].idxmax():%H:%M}') for k in C]
print('--- Mon 21 Sep 01:15->13:15 and 13:15->16:00 UTC')
for k in C:
    a0, a1, a2 = df[k].asof(uk('2026-09-21 01:15')), df[k].asof(uk('2026-09-21 13:15')), df[k].asof(uk('2026-09-21 16:00'))
    print(f'{k:32s} pre {a1-a0:+.4f}  after {a2-a1:+.4f}')
print('--- Tue 22 Sep 10:00->14:00 UTC (his midday jump)')
for k in C: print(f'{k:32s} {df[k].asof(uk("2026-09-22 14:00")) - df[k].asof(uk("2026-09-22 10:00")):+.4f}')
