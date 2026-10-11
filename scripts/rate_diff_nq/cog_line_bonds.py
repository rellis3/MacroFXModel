"""Is C.OG's blue line a bond-futures PRICE (plus offset / scale), or a spread of two bond prices? Candidates from
analysis/output/stir_1m_bonds/ (Bund GBL, Bobl GBM, Buxl GBX, ZN, ZF, ZB, UB, Dec26) plus Schatz and ZT from stir_1m.
Scored on the extended digitised line: free affine fit, b=1 (natural: price minus a constant), b=-1, change corr,
and the Tuesday 22 Sep 08:30-10:00 UTC window (curve fell 5-8 bp; his line -0.04)."""
import glob, os, itertools
import numpy as np, pandas as pd
his = pd.read_csv('analysis/output/cog_video_0918/cog_line_digitised_15m_full.csv', index_col=0, parse_dates=True)['value']; his.index = his.index.tz_convert('UTC')
def px(path):
    d = pd.read_parquet(path); d['time'] = pd.to_datetime(d['time'], utc=True); s = d.set_index('time')['close']
    g = s.resample('15min', label='right', closed='right'); l = g.last(); l[g.count() < 10] = np.nan; return l.reindex(his.index).ffill()
P = {os.path.basename(f)[:-8]: px(f) for f in sorted(glob.glob('analysis/output/stir_1m_bonds/*.parquet'))}
P['EUREX_FGBS_Dec26'] = px('analysis/output/stir_1m/EUREX_FGBS_20261208_M.parquet'); P['CBOT_ZTZ6'] = px('analysis/output/stir_1m/CBOT_ZTZ6.parquet')
print('levels 17-22 Sep:'); [print(f'  {k:24s} {v.min():9.3f} - {v.max():9.3f}') for k, v in P.items()]
cands = dict(P)
for a, b in itertools.combinations(P, 2): cands[f'{a} - {b}'] = P[a] - P[b]
rows = []
for k, x in cands.items():
    j = pd.concat([his.rename('y'), x.rename('x')], axis=1).dropna()
    if len(j) < 100 or j.x.std() == 0: continue
    b, a = np.polyfit(j.x, j.y, 1); rm = np.sqrt(((j.y - (a + b * j.x)) ** 2).mean())
    k1 = (j.y - j.x).mean(); rm1 = np.sqrt(((j.y - (j.x + k1)) ** 2).mean()); km = (j.y + j.x).mean(); rmm = np.sqrt(((j.y - (km - j.x)) ** 2).mean())
    cc = np.corrcoef(j.y.diff().dropna(), j.x.diff().dropna())[0, 1]
    tue = j.loc['2026-09-22 08:30':'2026-09-22 10:00']; tmove = (tue.x.iloc[-1] - tue.x.iloc[0]) if len(tue) > 2 else np.nan
    rows.append(dict(candidate=k, level_corr=np.corrcoef(j.y, j.x)[0, 1], change_corr=cc, free_b=b, free_a=a, rmse_free=rm, offset_b1=k1, rmse_b1=rm1, offset_bm1=km, rmse_bm1=rmm, tue_move_x=tmove, n=len(j)))
R = pd.DataFrame(rows).sort_values('change_corr', ascending=False); R.to_csv('analysis/output/cog_video_0918/cog_line_bonds.csv', index=False)
pd.set_option('display.width', 250); print(R.head(15).round(3).to_string(index=False))
print("\nhis line Tue 08:30->10:00 UTC: %+.2f ; Tue 11:00->13:15: %+.2f" % (his.loc['2026-09-22 10:00'] - his.loc['2026-09-22 08:30'], his.loc['2026-09-22 13:15'] - his.loc['2026-09-22 11:00']))
