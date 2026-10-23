"""vvix-nasdaq-ratio charts: the ratio over time (C.OG's 'create a time series of that ratio') and what happens after extremes."""
import os, json
import numpy as np, pandas as pd
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'analysis', 'output', 'vvix-nasdaq-ratio')
C1, C2, C3, GREY, INK, MUTED = '#2a78d6', '#eb6834', '#1baf7a', '#9a9a94', '#0b0b0b', '#52514e'
plt.rcParams.update({'font.size': 9, 'axes.edgecolor': '#c9c8c2', 'axes.labelcolor': MUTED, 'xtick.color': MUTED, 'ytick.color': MUTED, 'axes.grid': True,
                     'grid.color': '#ecebe7', 'axes.spines.top': False, 'axes.spines.right': False, 'legend.frameon': False})
P = pd.read_parquet(os.path.join(OUT, 'panel.parquet')); R = json.load(open(os.path.join(OUT, 'results.json')))

fig, ax = plt.subplots(2, 1, figsize=(11, 5.4), sharex=True, gridspec_kw={'height_ratios': [2, 1]})
ax[0].plot(P.index, P['R_a'], color=C1, lw=1.1, label='R_a: % move of VVIX per % move of Nasdaq (20-session realised)')
hi = P['R_a_hi'] == 1; ax[0].scatter(P.index[hi], P['R_a'][hi], s=4, color=C2, zorder=3, label='top decile of its last 252 sessions (extreme)')
ax[0].set_ylabel('ratio'); ax[0].legend(loc='upper left', fontsize=8)
ax[0].set_title('C.OG\'s ratio over time: how much VVIX moves for every % Nasdaq moves', loc='left', color=INK)
ax[1].plot(P.index, P['VIX'], color=GREY, lw=1); ax[1].set_ylabel('VIX')
fig.tight_layout(); fig.savefig(os.path.join(OUT, 'fig_ratio_timeseries.png'), dpi=130); plt.close(fig)

fig, axs = plt.subplots(1, 2, figsize=(11, 3.6))
x = np.arange(-20, 21)
for ax, nm, ttl in ((axs[0], 'VIX', 'VIX (%) around entries into the top decile'), (axs[1], 'NDX', 'Nasdaq-100 (%) around the same entries')):
    for key, c, lab in (('R_a|hi', C1, 'R_a VVIX/Nasdaq'), ('R_b|hi', C2, 'R_b VIX/Nasdaq'), ('R_c|hi', GREY, 'R_c VVIX/VXN (implied)')):
        p = R['events'][key]['paths'][nm]; m, se = np.array(p['mean'], float), np.array(p['se'], float)
        ax.plot(x, m, color=c, lw=1.8, label=f"{lab} (n={R['events'][key]['n_events']})"); ax.fill_between(x, m - 1.96 * se, m + 1.96 * se, color=c, alpha=0.1, lw=0)
    ax.axvline(0, color=MUTED, lw=0.8, ls=':'); ax.axhline(0, color=MUTED, lw=0.8); ax.set_title(ttl, loc='left', color=INK); ax.set_xlabel('sessions from entry')
axs[0].legend(fontsize=8, loc='lower left'); fig.tight_layout(); fig.savefig(os.path.join(OUT, 'fig_event_paths.png'), dpi=130); plt.close(fig)

C = pd.DataFrame(R['cells']); fig, ax = plt.subplots(figsize=(11, 3.4)); xx = np.arange(len(C))
col = [C3 if g else (C1 if v == 'null' else GREY) for g, v in zip(C['gate'], C['verdict_cell'])]
ax.errorbar(xx, C['beta_sd'], yerr=[C['beta_sd'] - C['ci_lo'], C['ci_hi'] - C['beta_sd']], fmt='none', ecolor='#c9c8c2', zorder=1)
ax.scatter(xx, C['beta_sd'], c=col, s=26, zorder=2); ax.axhline(0, color=MUTED, lw=0.8); ax.axhspan(-0.2, 0.2, color='#f3f2ee', zorder=0)
ax.set_xticks(xx); ax.set_xticklabels([f"{r.construction} {r.tail}\n{r.outcome}" for r in C.itertuples()], fontsize=6.5)
ax.set_ylabel('effect (outcome SD)'); ax.set_title('All 24 registered cells (green = passed the full gate; shaded = the 0.2 SD economic bar)', loc='left', color=INK)
fig.tight_layout(); fig.savefig(os.path.join(OUT, 'fig_cells.png'), dpi=130); plt.close(fig)
print('charts written')
