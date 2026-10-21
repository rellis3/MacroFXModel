"""yield-predictive-ladder charts (deliverables 3, 4, 6, plus the positive control) from results_*.json / planted.json."""
import os, json
import numpy as np, pandas as pd
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'analysis', 'output', 'yield-predictive-ladder')
C1, C2, C3, GREY, INK, MUTED = '#2a78d6', '#eb6834', '#1baf7a', '#9a9a94', '#0b0b0b', '#52514e'
plt.rcParams.update({'font.size': 9, 'axes.edgecolor': '#c9c8c2', 'axes.labelcolor': MUTED, 'xtick.color': MUTED, 'ytick.color': MUTED, 'axes.grid': True,
                     'grid.color': '#ecebe7', 'axes.spines.top': False, 'axes.spines.right': False, 'legend.frameon': False})
KEY = {'eurusd': ['DIFF2', 'REAL10', 'US2'], 'nq': ['REAL10', 'BE10', 'US2']}
NAME = {'DIFF2': 'US−DE 2y', 'REAL10': 'US 10y real', 'US2': 'US 2y', 'BE10': 'US 10y breakeven', 'DIFF10': 'US−DE 10y', 'TP10': 'term premium'}
TITLE = {'eurusd': 'EURUSD', 'nq': 'Nasdaq-100'}

for a in ('eurusd', 'nq'):
    R = json.load(open(os.path.join(OUT, f'results_{a}.json')))
    # 3. rolling correlation and beta (deliverable 3)
    fig, ax = plt.subplots(2, 1, figsize=(9, 5.6), sharex=True)
    for v, c in zip(KEY[a], (C1, C2, C3)):
        r = R['phase_ab']['rolling'][v]; t = pd.to_datetime(r['t'])
        ax[0].plot(t, r['corr'], color=c, lw=1.6, label=NAME[v])
        b, se = np.array(r['beta'], float), np.array(r['beta_se'], float)
        ax[1].plot(t, b, color=c, lw=1.6); ax[1].fill_between(t, b - 1.96 * se, b + 1.96 * se, color=c, alpha=0.15, lw=0)
    for x in ax: x.axhline(0, color=MUTED, lw=0.8)
    ax[0].set_ylabel('252-day corr (same day)'); ax[1].set_ylabel('beta: bp of asset per bp of rate')
    ax[0].legend(ncol=3, loc='upper left'); ax[0].set_title(f'{TITLE[a]}: the same-day link and how it drifts (rolling 252 days, 95% band on beta)', loc='left', color=INK)
    fig.tight_layout(); fig.savefig(os.path.join(OUT, f'fig_rolling_{a}.png'), dpi=130); plt.close(fig)
    # 4. lag profiles with uncertainty (deliverable 4)
    L = pd.DataFrame(R['phase_ab']['lag_profile'])
    fig, axs = plt.subplots(1, 3, figsize=(11, 3.4), sharey=True)
    for ax, v in zip(axs, KEY[a]):
        for per, c in (('2005-14', GREY), ('2015-19', C2), ('2020-26', C1)):
            d = L[(L['var'] == v) & (L.period == per)].sort_values('lag')
            ax.plot(d['lag'], d['corr'], color=c, lw=1.5, marker='o', ms=3, label=per); ax.fill_between(d['lag'], d['lo'], d['hi'], color=c, alpha=0.12, lw=0)
        ax.axhline(0, color=MUTED, lw=0.8); ax.axvline(0, color=MUTED, lw=0.6, ls=':')
        ax.set_title(NAME[v], loc='left', color=INK); ax.set_xlabel('lag k (k > 0: rate change k days BEFORE the return)')
    axs[0].set_ylabel('corr(Δrate[d−k], return[d])'); axs[0].legend(loc='lower left')
    fig.suptitle(f'{TITLE[a]}: lag profile, 95% bands' + (' — lag +1 shares the 12:00–15:30 window (noon FX print vs 15:30 yields), so it is not a lead' if a == 'eurusd' else ''), x=0.01, ha='left', color=INK, fontsize=9.5)
    fig.tight_layout(); fig.savefig(os.path.join(OUT, f'fig_lagprofile_{a}.png'), dpi=130); plt.close(fig)
    # 6. out-of-sample comparison: cumulative squared-error advantage over M1 (deliverable 6)
    fig, axs = plt.subplots(1, 3, figsize=(11, 3.4))
    for ax, h in zip(axs, ('1', '5', '20')):
        f = R['forecasts'][h]; t = pd.to_datetime(f['t']); y = np.array([np.nan if v is None else v for v in f['y']])
        m1 = np.array([np.nan if v is None else v for v in f['M1']]); m3 = np.array([np.nan if v is None else v for v in f['M3']])
        k = np.isfinite(y) & np.isfinite(m1) & np.isfinite(m3)
        adv = np.cumsum(np.where(k, (y - m1) ** 2 - (y - m3) ** 2, 0)) * 1e4
        ax.plot(t, adv, color=C1, lw=1.6); ax.axhline(0, color=MUTED, lw=0.8); ax.axvline(pd.Timestamp('2020-01-01'), color=C2, lw=1, ls='--')
        ax.set_title(f'h = {h} day' + ('s' if h != '1' else ''), loc='left', color=INK)
    axs[0].set_ylabel('cumulative SSE(M1) − SSE(M3), ×1e4\n(rising = rates model better)')
    fig.suptitle(f'{TITLE[a]}: does adding rates + macro (M3) beat the price/vol baseline (M1) out of sample? Dashed line = start of the test period', x=0.01, ha='left', color=INK, fontsize=9.5)
    fig.tight_layout(); fig.savefig(os.path.join(OUT, f'fig_oos_{a}.png'), dpi=130); plt.close(fig)

# positive control
P = json.load(open(os.path.join(OUT, 'planted.json')))
fig, ax = plt.subplots(figsize=(6.5, 3.2))
for (a, h), c in zip([('eurusd', 1), ('nq', 1), ('eurusd', 5), ('nq', 5)], (C1, C2, C3, GREY)):
    xs = [0.0, 0.03, 0.05, 0.1]; ys = [P[f'{a}|h{h}|rho{r}']['cw_t'] for r in xs]
    ax.plot(xs, ys, marker='o', color=c, lw=1.6, label=f'{TITLE[a]} {h}d')
ax.axhline(1.645, color=MUTED, ls='--', lw=0.9); ax.text(0.0, 1.75, 'one-sided 5% bar', color=MUTED, fontsize=8)
ax.set_xlabel('planted correlation of a synthetic feature with the future return'); ax.set_ylabel('Clark–West t (M3 vs M1)')
ax.set_title('Positive control: the ladder only finds a planted edge of 0.10 at 1 day', loc='left', color=INK); ax.legend()
fig.tight_layout(); fig.savefig(os.path.join(OUT, 'fig_planted.png'), dpi=130); plt.close(fig)
print('charts written')
