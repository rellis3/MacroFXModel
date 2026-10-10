"""Digitise C.OG's blue 'macro variable' line from the 20:20:10 UK screenshot of his video (17 Sep 00:00 -> Mon 21 Sep
~19:00 UK), lay our constructions on it, and score how close each is. Axis calibration read from the chart labels and
checked against the dashed crosshair lines (Fri 18 Sep 16:00 and 17:15 UK) and the detected gridlines.
Image is 2340x1080; label positions were read at 2000x923 display scale (factor 1.17)."""
import sys; sys.argv = ['x', '--check']; sys.path.insert(0, 'scripts/rate_diff_nq')
import numpy as np, pandas as pd, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from PIL import Image
import composite_tests as ct
IMG = r"C:\Users\relli\.claude\uploads\f1985080-6197-4bdb-8146-f45cee32477d\cc850a6f-image.jpg"
OUT = 'analysis/output/cog_video_0918/'
S = 1.17                                   # full-res px per displayed px
X0 = 278                                   # displayed: Thu 17 Sep 00:00 UK at x=278 (chart's left edge)
PXH = None                                 # px per hour: set below from the V-low anchor (Fri 18 Sep 16:15 UK = 40.25 h)
Y0, V0, PXV = 142, 8.5, 496                # displayed: value 8.5 at y=142; 496 px per 1.0 unit
T0 = pd.Timestamp('2026-09-16 23:00', tz='UTC')                     # Thu 17 00:00 UK (BST)
GAP_START, GAP = 46.0, 49.0                                         # Fri 22:00 UK -> Sun 23:00 UK removed from the axis
im = np.asarray(Image.open(IMG).convert('RGB')).astype(int); r, g, b = im[..., 0], im[..., 1], im[..., 2]
m = (b > 170) & (r < 130) & (g < 170) & (b - r > 80); m[:115] = False; m[800:] = False; m[:, :330] = False; m[:, 1760:] = False
cols = np.where(m.any(0))[0]; yv = np.array([np.median(np.where(m[:, x])[0]) for x in cols])
fri = (cols / S > 700) & (cols / S < 1200)                            # Friday region, wide
xmin = cols[fri][np.argmax(yv[fri])] / S                                # lowest point of the line = max y
PXH = (xmin - X0) / 40.25
right_h = (cols[-1] / S - X0) / PXH
print(f'V-low at displayed x={xmin:.0f} -> {PXH:.2f} px/h; right edge = {right_h:.1f} session hours from Thu 00:00 UK (chart clock 20:20 Mon = 67.3 h)')
pts = []
for x in cols:
    y = np.median(np.where(m[:, x])[0]); xd, yd = x / S, y / S
    h = (xd - X0) / PXH
    if h > GAP_START: h += GAP
    pts.append((T0 + pd.Timedelta(hours=h), V0 - (yd - Y0) / PXV))
his = pd.Series([v for _, v in pts], index=pd.DatetimeIndex([t for t, _ in pts])).sort_index()
his15 = his.resample('15min', label='right', closed='right').mean().dropna()
his15.to_csv(OUT + 'cog_line_digitised_15m.csv', header=['value'])
print(f'digitised {len(his)} columns -> {len(his15)} 15-min bars, {his15.index[0]} .. {his15.index[-1]}, range {his15.min():.2f}..{his15.max():.2f}')
print(f"  Fri low at {his15['2026-09-18'].idxmin()} UTC = {his15['2026-09-18'].min():.2f}  (video: 16:00-16:15 UK = 15:00-15:15 UTC)")
# ours
nq, diff, diff_e, c1, c1e, c5 = ct.load_all(); C, _ = ct.constructions(diff, c1, c5)
legs = {'ESTR U6 rate': ct.rate('ICEEU_ER3U6'), 'SOFR U6 rate': ct.rate('CME_SR3U6'), 'ESTR Z6 rate': ct.rate('ICEEU_ER3Z6'),
        'Euribor Z6 rate': ct.rate('ICEEU_IZ6'), 'US 2y chg': ct.level_from(-ct.stitched_logret([('CBOT_ZTU6', '2026-09-23'), ('CBOT_ZTZ6', ct.HI)]) / 1.9 * 100),
        'DE 2y chg': ct.level_from(-ct.stitched_logret([('EUREX_FGBS_20260908_M', '2026-09-01'), ('EUREX_FGBS_20261208_M', ct.HI)]) / 1.9 * 100),
        'NQ log': nq}
cands = {**C, **legs}
rows = []
for k, s in cands.items():
    o = s.reindex(his15.index).ffill()            # carry quotes over bars with no fresh print (as his flat stretches do)
    ok = o.notna() & his15.notna()
    if ok.sum() < 50: continue
    a, bq = his15[ok], o[ok]
    lvl = np.corrcoef(a, bq)[0, 1]; chg = np.corrcoef(a.diff().dropna(), bq.diff().dropna())[0, 1]
    slope = np.polyfit(bq, a, 1)[0]
    rows.append(dict(series=k, level_corr=lvl, change_corr=chg, his_units_per_bp=slope / 100 if 'NQ' not in k else np.nan, bars=int(ok.sum())))
tab = pd.DataFrame(rows).sort_values('level_corr', ascending=False); print(tab.round(3).to_string(index=False))
tab.to_csv(OUT + 'cog_line_match.csv', index=False)
# overlay: his line + top-3 by level corr, each rescaled by its own linear fit
fig, ax = plt.subplots(figsize=(16, 6)); ax.plot(his15.index, his15.values, color='tab:blue', lw=2, label="C.OG's line (digitised)")
for k in tab.series.head(3):
    o = cands[k].reindex(his15.index).ffill(); ok = o.notna()
    p = np.polyfit(o[ok], his15[ok], 1); ax.plot(o.index[ok], np.polyval(p, o[ok]), lw=1, label=f'{k} (rescaled, level corr {tab.set_index("series").level_corr[k]:+.2f})')
for t in ('2026-09-18 15:00', '2026-09-18 15:45', '2026-09-18 16:15', '2026-09-21 13:15'): ax.axvline(pd.Timestamp(t, tz='UTC'), ls='--', lw=0.6, color='r')
ax.legend(fontsize=8); ax.set_title("C.OG's blue line vs our constructions, 17-21 Sep 2026 (UTC)"); plt.tight_layout(); plt.savefig(OUT + 'cog_line_overlay.png', dpi=100)
