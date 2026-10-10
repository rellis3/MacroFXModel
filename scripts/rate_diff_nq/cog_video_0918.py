"""Rebuild 16-23 Sep 2026 (the days in C.OG's 'Macro Variable Context Relevance' video) from our IBKR 1-min data.
Goal: find which of our rate constructions looks like his blue line, and check his two marked moments:
  (a) Fri 18 Sep: macro low 16:00 UK, confirmed 16:45, Nasdaq low 17:15 UK  (UTC 15:00 / 15:45 / 16:15)
  (b) Mon 21 Sep: macro rises from ~03:15 UK while Nasdaq flat 02:15-14:15, Nasdaq breaks up at 14:15 UK (13:15 UTC)
"""
import pandas as pd, numpy as np, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
D = 'analysis/output/stir_1m/'; OUT = 'analysis/output/cog_video_0918/'
def load(f):
    d = pd.read_parquet(D + f); d['time'] = pd.to_datetime(d['time'], utc=True)
    s = d.set_index('time')['close']; return s[(s.index >= '2026-09-16') & (s.index < '2026-09-23')]
nq = load('CME_NQZ6.parquet')
rate = lambda s: 100 - s
sr_z, sr_h = rate(load('CME_SR3Z6.parquet')), rate(load('CME_SR3H7.parquet'))
ez = rate(load('ICEEU_IZ6.parquet'))
zt = load('CBOT_ZTZ6.parquet'); fg = load('EUREX_FGBS_20261208_M.parquet')
yld = lambda p: -np.log(p / p.iloc[0]) / 1.9 * 100        # % change in yield-equivalent from start
idx = pd.date_range('2026-09-16', '2026-09-23', freq='15min', tz='UTC', inclusive='left')
r15 = lambda s: s.resample('15min', label='right', closed='right').last().reindex(idx).ffill()
C = {
 'NQZ6': r15(nq),
 'SOFR Dec26 rate %': r15(sr_z), 'SOFR Mar27 rate %': r15(sr_h), 'Euribor Dec26 rate %': r15(ez),
 'US-EU 3m diff (SR3Z6-IZ6) %': r15(sr_z) - r15(ez),
 'US 2y yld chg (ZTZ6) %': r15(yld(zt)), 'DE 2y yld chg (FGBS) %': r15(yld(fg)),
 'US-DE 2y spread chg %': r15(yld(zt)) - r15(yld(fg)),
}
df = pd.DataFrame(C); df.to_csv(OUT + 'rebuild_15m.csv')
uk = lambda s: pd.Timestamp(s, tz='UTC')
marks = [('Fri macro low 16:00 UK', uk('2026-09-18 15:00')), ('confirm 16:45', uk('2026-09-18 15:45')),
         ('NQ low 17:15 UK', uk('2026-09-18 16:15')), ('Mon NQ breakout 14:15 UK', uk('2026-09-21 13:15'))]
fig, ax = plt.subplots(len(C), 1, figsize=(16, 2.1 * len(C)), sharex=True)
for a, (k, s) in zip(ax, C.items()):
    a.plot(s.index, s.values, lw=0.9, color='tab:blue' if k != 'NQZ6' else 'k'); a.set_ylabel(k, fontsize=7, rotation=0, ha='right')
    for lbl, t in marks: a.axvline(t, ls='--', lw=0.6, color='r')
ax[0].set_title('16-23 Sep 2026, 15m closes (UTC). Red: the moments C.OG marks')
plt.tight_layout(); plt.savefig(OUT + 'rebuild.png', dpi=90)
# the two moments, numerically
def at(k, t): return df[k].asof(t)
print('--- Fri 18 Sep: lowest 15m close 13:00-17:00 UTC per series')
w = df.loc[uk('2026-09-18 13:00'):uk('2026-09-18 18:00')]
for k in C: print(f'{k:30s} min at {w[k].idxmin():%H:%M} UTC  max at {w[k].idxmax():%H:%M} UTC')
print('--- Mon 21 Sep: change 01:15 -> 13:15 UTC (NQ flat window) and 13:15 -> 16:00')
for k in C:
    a0, a1, a2 = at(k, uk('2026-09-21 01:15')), at(k, uk('2026-09-21 13:15')), at(k, uk('2026-09-21 16:00'))
    print(f'{k:30s} pre: {a1-a0:+.4f}   after: {a2-a1:+.4f}')
