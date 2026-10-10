"""Which construction from our 1-min contracts reproduces C.OG's blue line (digitised, cog_line_digitised_15m.csv)?
Scores on LEVEL corr and on 15-min CHANGE corr (the one that identifies a series). Last row: the best linear
combination of all 14 legs, in-sample, i.e. the ceiling our data can reach."""
import sys; sys.argv = ['x', '--check']; sys.path.insert(0, 'scripts/rate_diff_nq')
import numpy as np, pandas as pd, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
import composite_tests as ct
OUT = 'analysis/output/cog_video_0918/'
his = pd.read_csv(OUT + 'cog_line_digitised_15m.csv', index_col=0, parse_dates=True)['value']; his.index = his.index.tz_convert('UTC')
Q5 = ['U6', 'Z6', 'H7', 'M7', 'U7']
legs = {}
for q in Q5:
    legs['SOFR ' + q] = ct.rate('CME_SR3' + q); legs['ESTR ' + q] = ct.rate('ICEEU_ER3' + q)
for q in Q5[1:]:
    legs['EURIBOR ' + q] = ct.rate('ICEEU_I' + q)
L = pd.DataFrame(legs).reindex(his.index).ffill()
def score(s, name):
    ok = s.notna() & his.notna()
    if ok.sum() < 50: return None
    a, b = his[ok], s[ok]; da, db = a.diff().dropna(), b.diff().dropna()
    return dict(construction=name, level=np.corrcoef(a, b)[0, 1], change=np.corrcoef(da, db)[0, 1], units_per_bp=np.polyfit(b, a, 1)[0] / 100, mean=b.mean())
rows = []
for i in Q5:
    for j in Q5:
        rows.append(score(L['SOFR ' + i] - L['ESTR ' + j], f'SOFR {i} - ESTR {j}'))
    for j in Q5[1:]:
        rows.append(score(L['SOFR ' + i] - L['EURIBOR ' + j], f'SOFR {i} - EURIBOR {j}'))
for k in range(1, 6):
    rows.append(score(sum(L['SOFR ' + q] - L['ESTR ' + q] for q in Q5[:k]), f'sum first {k} (SOFR-ESTR)'))
    rows.append(score(sum(L['SOFR ' + q] for q in Q5[:k]), f'sum first {k} SOFR'))
    rows.append(score(-sum(L['ESTR ' + q] for q in Q5[:k]), f'-sum first {k} ESTR'))
rows.append(score(-sum(L['EURIBOR ' + q] for q in Q5[1:]), '-sum 4 EURIBOR'))
rows.append(score(L['SOFR Z6'] + L['SOFR U6'], 'SOFR U6 + SOFR Z6 (level ~8.2)'))
rows.append(score(L['SOFR U6'] / L['ESTR U6'], 'SOFR U6 / ESTR U6 ratio'))
# ceiling: OLS of his line on all legs (levels), and on changes
M = L.dropna(); ok = M.index.intersection(his.dropna().index); X = M.loc[ok]; y = his.loc[ok]
Xc = np.c_[np.ones(len(X)), X.to_numpy()]; beta = np.linalg.lstsq(Xc, y.to_numpy(), rcond=None)[0]; fit = pd.Series(Xc @ beta, index=ok)
dX = X.diff().dropna(); dy = y.diff().dropna(); db = np.linalg.lstsq(dX.to_numpy(), dy.to_numpy(), rcond=None)[0]
r2_lvl = 1 - ((y - fit) ** 2).sum() / ((y - y.mean()) ** 2).sum(); r2_chg = 1 - ((dy - dX @ db) ** 2).sum() / ((dy - dy.mean()) ** 2).sum()
rows.append(dict(construction='CEILING: OLS on all 14 legs (in-sample)', level=np.sqrt(max(r2_lvl, 0)), change=np.sqrt(max(r2_chg, 0)), units_per_bp=np.nan, mean=np.nan))
T = pd.DataFrame([r for r in rows if r]).sort_values('change', ascending=False)
pd.set_option('display.width', 200); print(T.round(3).to_string(index=False)); T.to_csv(OUT + 'cog_line_search.csv', index=False)
# sanity on the digitised line itself: how much of its 15-min change variance is one-bar noise (reverses next bar)?
d = his.diff().dropna(); print(f'\nhis line: lag-1 autocorr of 15-min changes {d.autocorr(1):+.2f} (digitising noise shows as strongly negative)')
best = T.iloc[1].construction if T.iloc[0].construction.startswith('CEILING') else T.iloc[0].construction
fig, ax = plt.subplots(2, 1, figsize=(16, 9), sharex=True)
ax[0].plot(his.index, his, color='tab:blue', lw=2, label="C.OG's line (digitised)"); ax[0].plot(fit.index, fit, color='k', lw=1, label=f'OLS on all 14 legs, level R2 {r2_lvl:.2f}'); ax[0].legend(fontsize=8)
for name in T.construction.head(4):
    if name.startswith('CEILING'): continue
    s = eval_series = None
ax[1].plot(his.index, (his - his.mean()) / his.std(), color='tab:blue', lw=2, label='his, z')
for name, s in {'-ESTR Z6': -L['ESTR Z6'], 'SOFR U6 - ESTR U6': L['SOFR U6'] - L['ESTR U6'], '-sum 4 EURIBOR': -L[[c for c in L if c.startswith('EURIBOR')]].sum(1)}.items():
    ax[1].plot(s.index, (s - s.mean()) / s.std(), lw=1, label=name + ', z')
ax[1].legend(fontsize=8); ax[0].set_title("Can any combination of our contracts reproduce C.OG's line? (17-21 Sep 2026, UTC)")
plt.tight_layout(); plt.savefig(OUT + 'cog_line_search.png', dpi=100)
