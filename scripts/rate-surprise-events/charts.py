"""rate-surprise-events charts from results_full.json / h4_month_block.csv."""
import os, json
import numpy as np, pandas as pd
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'analysis', 'output', 'rate-surprise-events')
C1, C2, C3, GREY, INK, MUTED = '#2a78d6', '#eb6834', '#1baf7a', '#9a9a94', '#0b0b0b', '#52514e'
plt.rcParams.update({'font.size': 9, 'axes.edgecolor': '#c9c8c2', 'axes.labelcolor': MUTED, 'xtick.color': MUTED, 'ytick.color': MUTED, 'axes.grid': True,
                     'grid.color': '#ecebe7', 'axes.spines.top': False, 'axes.spines.right': False, 'legend.frameon': False})
R = json.load(open(os.path.join(OUT, 'results_full.json')))
TITLE = {'eurusd': 'EURUSD', 'nq': 'NAS100'}

# 1. event-study response profiles by rate-surprise group
off = np.array(R['profiles']['offsets_15min']) * 15 / 60
fig, axs = plt.subplots(1, 2, figsize=(11, 3.8), sharey=False)
for ax, a in zip(axs, ('eurusd', 'nq')):
    for (g, c) in zip(('hawkish (rs2 >= +1)', 'neutral', 'dovish (rs2 <= -1)'), (C2, GREY, C1)):
        p = R['profiles'][a][g]; m, lo, hi = (np.array(p[k], float) for k in ('mean', 'lo', 'hi'))
        ax.plot(off, m, color=c, lw=1.8, label=f'{g}, n={p["n"]}'); ax.fill_between(off, lo, hi, color=c, alpha=0.12, lw=0)
    ax.axvline(0, color=MUTED, lw=0.8, ls=':'); ax.axhline(0, color=MUTED, lw=0.8)
    ax.axvspan(0, 0.25, color='#f3f2ee', zorder=0)
    ax.set_title(f'{TITLE[a]}: cumulative move from the release (in 15-min σ)', loc='left', color=INK); ax.set_xlabel('hours from the release')
axs[0].set_ylabel('log move ÷ trailing 15-min σ'); axs[0].legend(loc='lower left', fontsize=8)
fig.suptitle('Event-study response profiles, FOMC + CPI + payrolls 2010-2026 (shaded: first 15 min, inside the signal window)', x=0.01, ha='left', color=INK, fontsize=9.5)
fig.tight_layout(); fig.savefig(os.path.join(OUT, 'fig_profiles.png'), dpi=130); plt.close(fig)

# 2. primary statistic per cell, pooled CI and by period
C = pd.DataFrame(R['cells'])
fig, ax = plt.subplots(figsize=(11, 3.8))
lab = [f"{TITLE[r.asset]}\n{r.signal} {r.h}" for r in C.itertuples()]; x = np.arange(len(C))
ax.errorbar(x, C['corr'], yerr=[C['corr'] - C['lo'], C['hi'] - C['corr']], fmt='o', color=INK, ms=5, capsize=2, label='pooled 2010-26 (95%)')
for p, c, dx in (('discover', GREY, -0.22), ('validate', C2, 0.0), ('test', C1, 0.22)):
    ax.scatter(x + dx, C[f'{p}_corr'], color=c, s=14, zorder=3, label=p)
ax.axhspan(-0.10, 0.10, color='#f3f2ee', zorder=0); ax.axhline(0, color=MUTED, lw=0.8)
ax.set_xticks(x); ax.set_xticklabels(lab, fontsize=7.5); ax.set_ylabel('corr(signal, residual return)')
ax.set_title('Surprise vs the move AFTER the signal, beyond the asset reaction (shaded: +-0.10 bar; + continuation, - reversal)', loc='left', color=INK)
ax.legend(ncol=4, loc='upper left', fontsize=8)
fig.tight_layout(); fig.savefig(os.path.join(OUT, 'fig_cells.png'), dpi=130); plt.close(fig)

# 3. cost-adjusted rule results (2018-26), net mean per event in sigma with intervals
T = pd.DataFrame(R['trades']); T = T[T.period == '2018-26'].reset_index(drop=True)
H4 = pd.read_csv(os.path.join(OUT, 'h4_month_block.csv'))
for i, r in T.iterrows():
    if r['h'] == 'h4':
        b = H4[(H4.asset == r['asset']) & (H4.signal == r['signal']) & (H4.period == '2018-26')].iloc[0]; T.loc[i, ['net_lo', 'net_hi']] = [b['lo'], b['hi']]
fig, ax = plt.subplots(figsize=(11, 3.6)); x = np.arange(len(T))
ax.errorbar(x, T['net_mean'], yerr=[T['net_mean'] - T['net_lo'], T['net_hi'] - T['net_mean']], fmt='o', color=C1, capsize=2, label='surprise rule, net of real spread + slippage')
ax.scatter(x, T['b1_net_mean'], marker='x', color=C2, s=24, zorder=3, label="baseline rule: continue the asset's own reaction")
ax.axhline(0, color=MUTED, lw=0.8); ax.set_xticks(x); ax.set_xticklabels([f"{TITLE[r.asset]}\n{r.signal} {r.h}\n{r.direction[:5]}." for r in T.itertuples()], fontsize=7)
ax.set_ylabel('net return per event (σ of the horizon)'); ax.set_title('Cost-adjusted out-of-sample results, 2018-2026 (direction fixed on 2010-17; 95% event bootstrap, month blocks for h4)', loc='left', color=INK)
ax.legend(loc='upper left', fontsize=8); fig.tight_layout(); fig.savefig(os.path.join(OUT, 'fig_trades.png'), dpi=130); plt.close(fig)
print('charts written')
