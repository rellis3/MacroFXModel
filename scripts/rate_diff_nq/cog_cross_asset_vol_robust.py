"""COG-CROSS-ASSET Addendum B (forge/COG_CROSS_ASSET_ADDENDUM_B.md): is the 2 h volatility IC gain just scheduled-news timing?
One candidate per process, selected by the same COG_* environment variables as the main run.
    COG_ASSET=eurusd COG_US=CME_SR3Z6 COG_EU=ICEEU_ER3Z6 COG_MODE=spread COG_TAG=_A_eurusd_P3 python scripts/rate_diff_nq/cog_cross_asset_vol_robust.py
Writes analysis/output/cog_video_0918/cross_asset_vol_robust<TAG>.csv"""
import sys, warnings
from pathlib import Path
warnings.filterwarnings('ignore')
HERE = Path(__file__).resolve()
sys.argv = [sys.argv[0]]
shape_src = (HERE.parent / 'cog_shape_agnostic.py').read_text(encoding='utf-8')
shape_src = shape_src[:shape_src.index('# ------------------------------------------------------------------ real run')]
g0 = {'__file__': str(HERE.parent / 'cog_shape_agnostic.py'), '__name__': 'shape_core'}
exec(compile(shape_src, 'cog_shape_agnostic.py', 'exec'), g0)
globals().update(g0)
import zoneinfo
NY = zoneinfo.ZoneInfo('America/New_York')
FOMC = {'2024-01-31', '2024-03-20', '2024-05-01', '2024-06-12', '2024-07-31', '2024-09-18', '2024-11-07', '2024-12-18', '2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18',
        '2025-07-30', '2025-09-17', '2025-10-29', '2025-12-10', '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16'}

# ---- fixed scheduled-release calendar (UTC timestamps)
rel_all, rel_0830, rel_1000, rel_fomc = [], [], [], []
for d in pd.date_range('2024-04-10', '2026-08-25', freq='D'):
    if d.weekday() >= 5:
        continue
    for hh, mm, bucket in ((8, 30, rel_0830), (10, 0, rel_1000)):
        t = pd.Timestamp(year=d.year, month=d.month, day=d.day, hour=hh, minute=mm, tz=NY).tz_convert('UTC')
        bucket.append(t)
        rel_all.append(t)
    if d.strftime('%Y-%m-%d') in FOMC:
        t = pd.Timestamp(year=d.year, month=d.month, day=d.day, hour=14, minute=0, tz=NY).tz_convert('UTC')
        rel_fomc.append(t)
        rel_all.append(t)
rel_all = np.array(sorted(x.value for x in rel_all)) // 10 ** 9
gs = np.array([t.value // 10 ** 9 for t in G])


def since_until(arr, cap=600):
    arr = np.array(sorted(x.value // 10 ** 9 for x in arr)) if len(arr) and not isinstance(arr[0], (int, np.integer)) else arr
    i = np.searchsorted(arr, gs, side='right')
    last = np.where(i > 0, arr[np.maximum(i - 1, 0)], -10 ** 12)
    nxt = np.where(i < len(arr), arr[np.minimum(i, len(arr) - 1)], 10 ** 12)
    return np.minimum((gs - last) / 60.0, cap), np.minimum((nxt - gs) / 60.0, cap)


s_any, u_any = since_until(rel_all)
s_83, _ = since_until(rel_0830)
s_10, _ = since_until(rel_1000)
s_fo, _ = since_until(rel_fomc, cap=1440)
dow = pd.get_dummies(pd.Series(G.dayofweek, index=G), prefix='dow', dtype=float).iloc[:, 1:].to_numpy(float)
fomc_day = np.array([float(t.tz_convert(NY).strftime('%Y-%m-%d') in FOMC) for t in G])
open_ny = np.array([min(max((t.tz_convert(NY).hour * 60 + t.tz_convert(NY).minute) - (9 * 60 + 30), -600), 600) for t in G], dtype=float)
REL = np.column_stack([s_any, u_any, s_83, s_10, s_fo, (s_any <= 60).astype(float), fomc_day, open_ny, dow])
dist_any = np.minimum(s_any, u_any)
quiet = (s_any > 120) & (u_any > 120)                    # no scheduled release within 2 h before or after the bar

M0 = np.column_stack([NFD.to_numpy(float), HOUR.to_numpy(float)])
DV = divergence(LF)
M1df = pd.concat([NFD, HOUR, LF, DV], axis=1)
M1 = M1df.to_numpy(float)
y = TARG['vol_8']
p0, _ = walk(M0, y)
p1, _ = walk(M1, y)
p0n, _ = walk(np.column_stack([M0, REL]), y)
p1n, _ = walk(np.column_stack([M1, REL]), y)
rows = []
for variant, a, b, mask_extra in (('V1 replicate (registered models)', p1, p0, None), ('V2 news-calendar baseline', p1n, p0n, None), ('V3 quiet of scheduled news (V1 predictions)', p1, p0, quiet)):
    for hf in ('VAL', 'OOS', 'VAL+OOS'):
        m = HALF[hf] & np.isfinite(a) & np.isfinite(b)
        if mask_extra is not None:
            m = m & mask_extra
        gm, lo, hi, ic1, ic0, nd = gain(a, b, y, m, B=2000)
        rows.append(dict(candidate=TAG, variant=variant, half=hf, days=nd, IC_base=ic0, IC_with_line=ic1, IC_gain=gm, ci_lo=lo, ci_hi=hi, bars_scored=int(m.sum())))
out = pd.DataFrame(rows)
out.to_csv(OUTD / f'cross_asset_vol_robust{TAG}.csv', index=False)
print(out.round(4).to_string())
