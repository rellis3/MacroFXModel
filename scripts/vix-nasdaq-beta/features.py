"""vix-nasdaq-beta step 1 (no outcomes): C.OG's clarified ratio (2026-10-23 12:29, education/cog-snippets.md 3b).
R = signed % change of VIX / % change of Nasdaq -> over a 20-session window, the slope of dln VIX on dln NDX (beta, normally negative);
dR/dt -> the 5-session change of that beta. Extremes = top / bottom decile of each within its last 252 sessions (causal).
Reuses the vvix-nasdaq-ratio panel (same dates, controls and the validated unsigned ratio R_b). Writes analysis/output/vix-nasdaq-beta/."""
import os
import numpy as np, pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'analysis', 'output', 'vix-nasdaq-beta'); os.makedirs(OUT, exist_ok=True)
P = pd.read_parquet(os.path.join(ROOT, 'analysis', 'output', 'vvix-nasdaq-ratio', 'panel.parquet'))
r = np.log(P[['VIX', 'NDX']]).diff()
cov = r['VIX'].rolling(20).cov(r['NDX']); var = r['NDX'].rolling(20).var()
P['B_level'] = cov / var                                   # % VIX per % Nasdaq, signed (C.OG's R over a window)
P['B_change'] = P['B_level'] - P['B_level'].shift(5)       # dR/dt over 5 sessions
for k in ('B_level', 'B_change'):
    pc = P[k].rolling(252, min_periods=200).rank(pct=True)
    P[f'{k}_pct'] = pc; P[f'{k}_hi'] = (pc >= 0.9).astype(float).where(pc.notna()); P[f'{k}_lo'] = (pc <= 0.1).astype(float).where(pc.notna())
P.to_parquet(os.path.join(OUT, 'panel.parquet'))
d = P['B_level'].dropna()
L = ['# vix-nasdaq-beta: features (no outcomes)', '',
     f"- Signed beta of VIX % moves on Nasdaq % moves (20 sessions): median {d.median():.2f}, p10 {d.quantile(.1):.2f}, p90 {d.quantile(.9):.2f}; share of days with beta > 0 (VIX rising with Nasdaq): {(d > 0).mean():.1%}.",
     f"- Correlation of the beta percentile with the validated unsigned ratio R_b percentile: {P['B_level_pct'].corr(P['R_b_pct']):+.2f}; with the VIX percentile: {P['B_level_pct'].corr(P['c_vix_pct']):+.2f}.",
     f"- 5-session change (dR/dt): median {P['B_change'].median():.2f}, p10 {P['B_change'].quantile(.1):.2f}, p90 {P['B_change'].quantile(.9):.2f}; correlation of its percentile with the level percentile {P['B_change_pct'].corr(P['B_level_pct']):+.2f}.",
     f"- Days in each tail: level hi {int(P['B_level_hi'].sum())}, lo {int(P['B_level_lo'].sum())}; change hi {int(P['B_change_hi'].sum())}, lo {int(P['B_change_lo'].sum())}."]
open(os.path.join(OUT, 'FEATURES.md'), 'w', encoding='utf-8').write('\n'.join(L)); print('\n'.join(L))
