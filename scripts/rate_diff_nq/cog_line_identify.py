"""Identify C.OG's displayed 7.5-8.5 series from first principles. Candidates = affine maps a + b*x of constructions
from the 15-min bar cache (analysis/output/rate_curve_structure/bars15.parquet: SOFR/ESTR/Euribor rates in %, 2y yield
levels, NQ). Scored on the extended digitised series (17 Sep -> 22 Sep 13:15 UTC) by RMSE in his units, bar-to-bar
change correlation (the identifier), and whether the fitted constants are 'natural'. Output: cog_line_identify.csv/.md"""
import numpy as np, pandas as pd, itertools
B = pd.read_parquet('analysis/output/rate_curve_structure/bars15.parquet')
his = pd.read_csv('analysis/output/cog_video_0918/cog_line_digitised_15m_full.csv', index_col=0, parse_dates=True)['value']; his.index = his.index.tz_convert('UTC')
X = B.reindex(his.index).ffill(); Q = ['U6','Z6','H7','M7','U7']
S = {q: X[f'S_{q}'] for q in Q}; E = {q: X[f'E_{q}'] for q in Q}; I = {q: X[f'I_{q}'] for q in Q[1:]}
cands = {}
for q in Q: cands[f'SOFR {q} rate'] = S[q]; cands[f'ESTR {q} rate'] = E[q]
for q in Q[1:]: cands[f'EURIBOR {q} rate'] = I[q]
for a, b in itertools.product(Q, Q): cands[f'SOFR {a} - ESTR {b}'] = S[a] - E[b]
for a in Q:
    for b in Q[1:]: cands[f'SOFR {a} - EURIBOR {b}'] = S[a] - I[b]
cands['mean SOFR 5'] = sum(S.values())/5; cands['mean ESTR 5'] = sum(E.values())/5; cands['mean EURIBOR 4'] = sum(I.values())/4
cands['mean ESTR back 3 (H7 M7 U7)'] = (E['H7']+E['M7']+E['U7'])/3; cands['mean SOFR back 3'] = (S['H7']+S['M7']+S['U7'])/3
cands['strip mean (SOFR-ESTR) 5'] = sum(S[q]-E[q] for q in Q)/5; cands['strip sum (SOFR-ESTR) 5'] = sum(S[q]-E[q] for q in Q)
cands['ESTR slope U7-U6'] = E['U7']-E['U6']; cands['SOFR slope U7-U6'] = S['U7']-S['U6']
cands['US2Y chg'] = X['US2Y']; cands['DE2Y chg'] = X['DE2Y']; cands['US2Y-DE2Y chg'] = X['US2Y']-X['DE2Y']
cands['NQ log'] = X['NQ']; cands['ratio SOFR U6/ESTR U6'] = S['U6']/E['U6']; cands['ratio SOFR Z6/ESTR Z6'] = S['Z6']/E['Z6']
rows = []
for k, x in cands.items():
    j = pd.concat([his.rename('y'), x.rename('x')], axis=1).dropna()
    if len(j) < 100: continue
    b, a = np.polyfit(j.x, j.y, 1); fit = a + b*j.x; rmse = np.sqrt(((j.y-fit)**2).mean())
    dy, dx = j.y.diff().dropna(), j.x.diff().dropna(); cc = np.corrcoef(dy, dx)[0,1]
    # timing tolerance: best change corr allowing his line to lag/lead ours by one bar
    cc_lag = max(np.corrcoef(dy.iloc[1:], dx.iloc[:-1])[0,1], np.corrcoef(dy.iloc[:-1], dx.iloc[1:])[0,1], cc)
    # 1-hour smoothed candidate (4-bar mean) -> does smoothing close the gap?
    xs = j.x.rolling(4, min_periods=1).mean(); cs = np.corrcoef(dy, xs.diff().dropna())[0,1]
    tue = j.loc['2026-09-22 11:00':'2026-09-22 13:15']; tue_fit = (b*(tue.x.iloc[-1]-tue.x.iloc[0])) if len(tue) > 2 else np.nan
    rows.append(dict(candidate=k, level_corr=np.corrcoef(j.y, j.x)[0,1], rmse_units=rmse, change_corr=cc, change_corr_pm1bar=cc_lag, change_corr_1h_smoothed=cs,
                     slope_b=b, intercept_a=a, units_per_bp=(b/100 if 'NQ' not in k and 'ratio' not in k else np.nan), tue_jump_fitted=tue_fit, tue_jump_actual=his.loc['2026-09-22 13:15']-his.loc['2026-09-22 11:00'], n=len(j)))
R = pd.DataFrame(rows).sort_values('change_corr', ascending=False)
R.to_csv('analysis/output/cog_video_0918/cog_line_identify.csv', index=False)
pd.set_option('display.width', 250); print(R.head(20).round(3).to_string(index=False))
print('\n--- Tuesday 11:00->13:15 UTC moves in the underlying (bp or %):')
for k in ('ESTR U6 rate','ESTR Z6 rate','ESTR U7 rate','SOFR U6 rate','SOFR Z6 rate','SOFR H7 rate','SOFR U7 rate','EURIBOR Z6 rate','US2Y chg','DE2Y chg','NQ log'):
    x = cands[k]; print(f"  {k:16s} {100*(x.loc['2026-09-22 13:15']-x.loc['2026-09-22 11:00']):+.1f}")
