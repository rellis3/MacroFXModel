"""Ours vs his, same layout as ours_vs_his.png, but with C.OG's exact legs (CME SR3U6 + ICE Euribor I2! = IX6 Nov26) from the 1-min futures data."""
import numpy as np, pandas as pd, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
OUT = 'analysis/output/cog_video_0918/'
his = pd.read_csv(OUT + 'cog_line_digitised_15m_full2.csv', index_col=0, parse_dates=True)['value']; his.index = his.index.tz_convert('UTC')
G = pd.date_range('2026-09-14', '2026-09-25 23:45', freq='15min', tz='UTC')
def px(p):
    d = pd.read_parquet(p); d['time'] = pd.to_datetime(d['time'], utc=True); return d.set_index('time')['close'].resample('15min', label='right', closed='right').last().reindex(G).ffill()
IXm, IVm, SRm = px('analysis/output/stir_1m_i2/ICEEU_IX6.parquet'), px('analysis/output/stir_1m_i2/ICEEU_IV6.parquet'), px('analysis/output/stir_1m/CME_SR3U6.parquet')
IXt, SRt = px('analysis/output/stir_1m_trades/ICEEU_IX6.parquet'), px('analysis/output/stir_1m_trades/CME_SR3U6.parquet')
sp = lambda e, u: (100 - e) - (100 - u)
P = [("A. His exact legs, midpoint: Euribor I2! (IX6) vs SOFR U6, INVERTED (his invert option): SOFR - EUR, %", -sp(IXm, SRm)),
     ("B. Same legs, TRADES (what TradingView plots), inverted", -sp(IXt, SRt)),
     ("C. Inverted midpoint spread through his EMA option, length 13", (-sp(IXm, SRm)).ewm(alpha=2/14, adjust=False).mean()),
     ("D. Euribor I2! leg alone, inverted (-rate, %)", -(100 - IXm)),
     ("E. SOFR U6 leg alone (rate, %)", 100 - SRm)]
fig, ax = plt.subplots(len(P), 1, figsize=(16, 3.1 * len(P)), sharex=True)
for a, (t, s) in zip(ax, P):
    x = s.reindex(his.index).ffill(); j = pd.concat([his.rename('y'), x.rename('x')], axis=1).dropna()
    lv, ch = j.y.corr(j.x), np.corrcoef(j.y.diff().dropna(), j.x.diff().dropna())[0, 1]
    a.plot(his.index, his, color='tab:blue', lw=2.2, label="C.OG's line (left axis)"); a.set_ylabel('his', color='tab:blue')
    b = a.twinx(); b.plot(s.loc[his.index[0]:his.index[-1]].index, s.loc[his.index[0]:his.index[-1]], color='tab:red', lw=1.2); b.set_ylabel('ours', color='tab:red')
    a.set_title(f"{t}   | shape match {lv:+.2f}, bar-by-bar {ch:+.2f}", fontsize=10, loc='left')
    for x_ in ('2026-09-18 15:15', '2026-09-22 08:30'): a.axvline(pd.Timestamp(x_, tz='UTC'), ls='--', lw=0.7, color='grey')
ax[0].legend(loc='upper left', fontsize=8)
plt.suptitle("Ours vs his, 17-22 Sep 2026 (UTC), exact legs. Each panel: his line (blue, own axis) vs one series of ours (red, own axis). Dashed: Fri 15:15, Tue 08:30", y=1.0)
plt.tight_layout(); plt.savefig(OUT + 'ours_vs_his_exact_legs.png', dpi=95)
