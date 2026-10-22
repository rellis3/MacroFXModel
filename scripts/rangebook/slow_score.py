"""Slow mean-reversion book scorer — forge/SLOW_MR_BOOK_PREREG.md.
    python scripts/rangebook/slow_score.py > analysis/output/rangebook/SLOW_MR_BOOK_RESULTS.md
"""
import json, math
from statistics import NormalDist
import numpy as np, pandas as pd
from sklearn.covariance import LedoitWolf
from scipy.cluster.hierarchy import linkage, leaves_list
from scipy.spatial.distance import squareform

INST = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdcad', 'usdchf', 'nzdusd', 'eurgbp', 'eurjpy', 'gbpjpy', 'euraud',
        'eurchf', 'audjpy', 'cadjpy', 'chfjpy', 'gold', 'audnzd', 'audcad', 'nzdcad', 'cadchf', 'eurcad', 'eurnzd',
        'gbpaud', 'gbpcad', 'gbpnzd', 'gbpchf', 'audchf', 'nzdjpy']
SPLIT = '2023-01-01'
N = NormalDist()

def sleeve(p, cost_mult=1.0):
    D = json.load(open(f'analysis/output/rangebook/{p}_slow.json'))
    df = pd.DataFrame(D['rows']).sort_values('t')
    s = (-(df['z'] / 2)).clip(-1, 1)
    w = s / df['sig']                                                  # notional per unit of daily risk
    turn = (w - w.shift(1).fillna(0)).abs()
    pnl = w * df['r'] - cost_mult * D['cost'] / 100 / 2 * turn
    return pd.Series(pnl.to_numpy(), index=df['date'].to_numpy(), name=p)

def sharpe(x): x = np.asarray(x); return x.mean() / x.std(ddof=1) * math.sqrt(252) if len(x) > 2 and x.std() > 0 else 0.0

def dsr(x, n_trials):
    """Deflated Sharpe ratio (Bailey & López de Prado), daily frequency."""
    x = np.asarray(x); T = len(x); sr = x.mean() / x.std(ddof=1)
    g3 = ((x - x.mean()) ** 3).mean() / x.std() ** 3; g4 = ((x - x.mean()) ** 4).mean() / x.std() ** 4
    var_sr = (1 - g3 * sr + (g4 - 1) / 4 * sr ** 2) / (T - 1)
    e = 0.5772156649
    sr0 = math.sqrt(var_sr) * ((1 - e) * N.inv_cdf(1 - 1 / n_trials) + e * N.inv_cdf(1 - 1 / (n_trials * math.e)))
    return N.cdf((sr - sr0) / math.sqrt(var_sr)), sr * math.sqrt(252), sr0 * math.sqrt(252)

def hrp_weights(cov):
    corr = cov / np.sqrt(np.outer(np.diag(cov), np.diag(cov)))
    dist = np.sqrt(np.clip((1 - corr) / 2, 0, 1)); np.fill_diagonal(dist, 0)
    order = list(leaves_list(linkage(squareform(dist, checks=False), 'single')))
    w = pd.Series(1.0, index=order); clusters = [order]
    def cvar(ix): sub = cov[np.ix_(ix, ix)]; iv = 1 / np.diag(sub); iv /= iv.sum(); return iv @ sub @ iv
    while clusters:
        clusters = [c[j:k] for c in clusters for j, k in ((0, len(c) // 2), (len(c) // 2, len(c))) if len(c) > 1]
        for i in range(0, len(clusters), 2):
            a, b = clusters[i], clusters[i + 1]; va, vb = cvar(a), cvar(b); alpha = 1 - va / (va + vb)
            w[a] *= alpha; w[b] *= 1 - alpha
    return w.sort_index().to_numpy()

def book(cost_mult=1.0):
    P = pd.concat([sleeve(p, cost_mult) for p in INST], axis=1)
    return P, P.mean(axis=1, skipna=True)

P, B = book()
_, B2 = book(2.0)
halves = {'2016–2022': B[B.index < SPLIT], '2023–2026-08': B[B.index >= SPLIT]}
d4, sr_ann, sr0_4 = dsr(B.to_numpy(), 4); d20, _, sr0_20 = dsr(B.to_numpy(), 20)
per = {p: sharpe(P[p].dropna()) for p in INST}; pos = sum(v > 0 for v in per.values())

# HRP (secondary): monthly rebalance, Ledoit-Wolf covariance of the previous 250 days
dates = P.index.to_numpy(); hrp = pd.Series(np.nan, index=P.index); w = None; month = None
for i, d in enumerate(dates):
    if i >= 250 and d[:7] != month:
        win = P.iloc[i - 250:i].fillna(0).to_numpy()
        w = hrp_weights(LedoitWolf().fit(win).covariance_); month = d[:7]
    if w is not None:
        row = P.iloc[i].to_numpy(); ok = ~np.isnan(row)
        hrp.iloc[i] = (w[ok] * row[ok]).sum() / w[ok].sum()
hrp = hrp.dropna()

print('# Slow mean-reversion book — results\n')
print('Rule: forge/SLOW_MR_BOOK_PREREG.md. Continuous fade of the 20-day stretch (s = −clip(z/2, ±1)), decided at '
      '07:00 London, held to the next 07:00, sized to equal daily risk, 28 instruments, net of spread on every position change.\n')
print('## 1. The book (equal risk, primary)\n')
print('| period | days | annualised Sharpe | mean per day (risk units) | worst drawdown (risk units) |'); print('|---|---|---|---|---|')
for lab, x in [('full', B)] + list(halves.items()):
    cum = x.cumsum(); dd = (cum - cum.cummax()).min()
    print(f'| {lab} | {len(x)} | {sharpe(x):+.2f} | {x.mean():+.5f} | {dd:.3f} |')
print('\nBy year (Sharpe): ' + ', '.join(f"{y} {sharpe(B[B.index.str.startswith(y)]):+.2f}" for y in sorted({d[:4] for d in B.index})))
print(f'\nDeflated Sharpe ratio: **{d4:.3f}** at N = 4 trials (benchmark Sharpe {sr0_4:.2f}); {d20:.3f} at N = 20 '
      f'(benchmark {sr0_20:.2f}). Sleeves with a positive Sharpe: {pos}/28.\n')
print('## 2. Secondary\n')
print(f'- **2× cost:** Sharpe {sharpe(B2):+.2f} (2016–22 {sharpe(B2[B2.index < SPLIT]):+.2f}, 2023–26 {sharpe(B2[B2.index >= SPLIT]):+.2f})')
print(f'- **HRP + Ledoit-Wolf** (from {hrp.index[0]}): Sharpe {sharpe(hrp):+.2f} vs equal-risk over the same days {sharpe(B[B.index >= hrp.index[0]]):+.2f}')
avg_corr = P.corr().to_numpy()[np.triu_indices(len(INST), 1)].mean()
print(f'- Average correlation between sleeves: {avg_corr:.2f} (breadth: 28 sleeves ≈ {28 / (1 + 27 * max(avg_corr, 0)):.1f} independent bets)\n')
print('## 3. Each instrument\'s sleeve (full-period Sharpe)\n')
print(', '.join(f'{p.upper()} {v:+.2f}' for p, v in sorted(per.items(), key=lambda kv: -kv[1])))
ok = all(sharpe(x) > 0 for x in halves.values()) and d4 >= 0.95 and pos >= 17
print(f"\n## Verdict (pre-registered): **{'PASS' if ok else 'FAIL'}**")
print(f"- Sharpe > 0 in both halves: {'yes' if all(sharpe(x) > 0 for x in halves.values()) else 'no'}; "
      f"deflated Sharpe ≥ 0.95 (N=4): {'yes' if d4 >= 0.95 else 'no'} ({d4:.3f}); ≥ 17/28 sleeves positive: {'yes' if pos >= 17 else 'no'} ({pos})")
