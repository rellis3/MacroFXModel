"""Re-digitise the Mon-Tue part of C.OG's line from the wide (7:08) frame with its time axis ANCHORED to the crosshair label
"Mon 21 Sep '26 14:15" (UK) = 13:15 UTC at displayed x=1110, instead of the earlier fitted scale (15.3 px/h, which was wrong).
Scans px/h for sensitivity, splices onto the first-frame series (Thu-Mon 02:00), and reports the digitisation overlap (noise floor)."""
import os, numpy as np, pandas as pd
from PIL import Image
OUT = 'analysis/output/cog_video_0918/'
IMG = os.path.join(r"C:\Users\relli\.claude\uploads\f1985080-6197-4bdb-8146-f45cee32477d", "4fa9a7cd-image.jpg"); S = 1.17
im = np.asarray(Image.open(IMG).convert('RGB')).astype(int); r, g, b = im[..., 0], im[..., 1], im[..., 2]
m = (b > 170) & (r < 130) & (g < 170) & (b - r > 80); m[:115] = False; m[800:] = False; m[:, :330] = False; m[:, 1760:] = False
cols = np.where(m.any(0))[0]; y = np.array([np.median(np.where(m[:, x])[0]) for x in cols]) / S; xd = cols / S; v = 8.8 + (y - 165) / (762 - 165) * (7.6 - 8.8)
G = pd.date_range('2026-09-14', '2026-09-25 23:45', freq='15min', tz='UTC')
def px(p):
    d = pd.read_parquet(p); d['time'] = pd.to_datetime(d['time'], utc=True); return d.set_index('time')['close'].resample('15min', label='right', closed='right').last().reindex(G).ffill()
SPR = (100 - px('analysis/output/stir_1m/CME_SR3U6.parquet')) - (100 - px('analysis/output/stir_1m_i2/ICEEU_IX6.parquet'))
ANCH = pd.Timestamp('2026-09-21 13:15', tz='UTC'); DAILY_BREAK = pd.Timestamp('2026-09-21 21:00', tz='UTC')
def series(pxh):
    h = (xd - 1110) / pxh; real = h + ((ANCH + pd.to_timedelta(h, unit='h')) > DAILY_BREAK) * 1.0
    return pd.Series(v, index=pd.DatetimeIndex(ANCH + pd.to_timedelta(real, unit='h'))).sort_index().resample('15min', label='right', closed='right').mean().dropna()
def score(s, a, bb):
    hh = s.loc[a:bb]; x = SPR.reindex(hh.index); j = pd.concat([hh.rename('y'), x.rename('x')], axis=1).dropna()
    return (j.y.corr(j.x), np.corrcoef(j.y.diff().dropna(), j.x.diff().dropna())[0, 1], len(j)) if len(j) > 30 else (np.nan, np.nan, len(j))
print('px/h scan (anchor fixed at Mon 13:15 UTC), SOFR-EUR, lag 0:   Mon 02:00 -> end   |   Tue only')
for pxh in np.arange(16.0, 20.01, 0.5):
    s = series(pxh); a = score(s, '2026-09-21 02:00', '2026-09-22 14:00'); t = score(s, '2026-09-22 00:00', '2026-09-22 14:00')
    print(f'  {pxh:5.1f}: lvl {a[0]:+.2f} chg {a[1]:+.2f} (n={a[2]})  |  lvl {t[0]:+.2f} chg {t[1]:+.2f} (n={t[2]})   ends {s.index[-1]:%a %H:%M}')
PXH = 17.5; wide = series(PXH)
old = pd.read_csv(OUT + 'cog_line_digitised_15m.csv', index_col=0, parse_dates=True)['value']; old.index = old.index.tz_convert('UTC')
ov = pd.concat([old.rename('a'), wide.rename('b')], axis=1).loc['2026-09-21 02:00':'2026-09-21 14:00'].dropna()
print(f'\nDIGITISATION NOISE FLOOR: two independent digitisations of the same line (calibrated frame vs wide frame) over Mon 02:00-14:00 UTC: n={len(ov)}, level corr {ov.a.corr(ov.b):+.2f}, 15-min change corr {np.corrcoef(ov.a.diff().dropna(), ov.b.diff().dropna())[0,1]:+.2f}, mean offset {np.mean(ov.a-ov.b):+.3f} units')
full = pd.concat([old.loc[:'2026-09-21 02:00'], wide.loc['2026-09-21 02:15':]]).sort_index(); full.to_csv(OUT + 'cog_line_digitised_15m_full2.csv', header=['value'])
print(f'new spliced series (px/h {PXH}): {full.index[0]} -> {full.index[-1]}, {len(full)} bars')
