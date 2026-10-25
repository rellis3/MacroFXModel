"""Release-day layers for the SOFR / Euribor legs (descriptive; exploratory, not pre-registered).
C.OG's layered frame (Discord 2026-10-19): Layer 1 what happened, Layer 2 why (which release / shock), Layer 3 how unusual (CONDITIONAL normalisation),
and his CPI example: model the surprise, the immediate front-end response, then what the asset does when the response is strong versus weak.
Events: analysis/output/rate-surprise-events/events.parquet (FOMC / CPI / NFP, 2024-04-15 to 2026-08-21, the repo's own event table; nothing after the lockbox date).
    python scripts/rate_diff_nq/cog_release_table.py -> analysis/output/cog_video_0918/RELEASE_TABLE.csv, RELEASE_TABLE.md
"""
from pathlib import Path
import numpy as np, pandas as pd
ROOT = Path(__file__).resolve().parents[2]; OD = ROOT / 'analysis' / 'output' / 'cog_video_0918'
rng = np.random.default_rng(71)

def ld_leg(f):
    d = pd.read_parquet(ROOT / 'analysis' / 'output' / 'stir_1m_deep' / f); d['time'] = pd.to_datetime(d['time'], utc=True)
    s = d.set_index('time')['close'].sort_index(); return (100 - s) * 100            # rate in bp
sofr, eur = ld_leg('CME_SR3U6.parquet'), ld_leg('ICEEU_IH7.parquet')
nq = pd.read_parquet(ROOT / 'VolRangeForecaster' / 'data' / 'm1' / 'nq_m1.parquet')['close']; nq.index = pd.to_datetime(nq.index, utc=True); nq = np.log(nq) * 100

def at(s, ts, tol=pd.Timedelta(minutes=10)):
    """value of the last 1-minute bar that had ended by ts (a bar stamped x covers x..x+1min)"""
    i = s.index.searchsorted(ts - pd.Timedelta(minutes=1), side='right') - 1
    if i < 0 or ts - s.index[i] > tol: return np.nan
    return float(s.iloc[i])

EV = pd.read_parquet(ROOT / 'analysis' / 'output' / 'rate-surprise-events' / 'events.parquet')
EV = EV[(EV.t >= pd.Timestamp('2024-04-15', tz='UTC')) & (EV.t < pd.Timestamp('2026-08-22', tz='UTC'))].sort_values('t').reset_index(drop=True)
event_days = set(EV.t.dt.date)
OFFS = [5, 30, 120, 240]

def resp(s, t, m):
    a, b = at(s, t), at(s, t + pd.Timedelta(minutes=m)); return b - a if np.isfinite(a) and np.isfinite(b) else np.nan

def cond_sigma(s, t, m, nprev=40):
    """RMS of the same clock window on the previous weekdays that carried no release (the conditional normaliser)"""
    vals = []; d = t.normalize()
    k = 0
    while len(vals) < nprev and k < 120:
        k += 1; dd = d - pd.Timedelta(days=k)
        if dd.weekday() >= 5 or dd.date() in event_days: continue
        tt = dd + (t - d); v = resp(s, tt, m)
        if np.isfinite(v): vals.append(v)
    return (np.sqrt(np.mean(np.square(vals))), len(vals)) if len(vals) >= 15 else (np.nan, len(vals))

def uncond_sigma(s, t, m, lookback=20):
    """RMS of all m-minute changes over the previous 20 calendar days, every hour (what a trailing-volatility rule sees)"""
    w = s[(s.index >= t - pd.Timedelta(days=lookback)) & (s.index < t)]
    if len(w) < 500: return np.nan
    x = w.iloc[::m]; ch = x.diff().dropna()
    return float(np.sqrt((ch ** 2).mean())) if len(ch) > 50 else np.nan

rows = []
for _, e in EV.iterrows():
    t = e.t; r = dict(t=t, family=e.family, ds=e.ds, ds_raw=e.ds_raw, actual=e.actual, consensus=e.consensus)
    for m in OFFS:
        r[f'sofr_{m}'] = resp(sofr, t, m); r[f'eur_{m}'] = resp(eur, t, m); r[f'spr_{m}'] = r[f'sofr_{m}'] - r[f'eur_{m}']; r[f'nq_{m}'] = resp(nq, t, m)
    # NQ after the first reaction: from +5 min to +120 min and to +240 min
    a5 = at(nq, t + pd.Timedelta(minutes=5)); r['nq_after_5_120'] = at(nq, t + pd.Timedelta(minutes=120)) - a5; r['nq_after_5_240'] = at(nq, t + pd.Timedelta(minutes=240)) - a5
    cs, ncs = cond_sigma(sofr, t, 30); us_ = uncond_sigma(sofr, t, 30)
    r['sofr30_sigma_cond'] = cs; r['sofr30_sigma_uncond'] = us_; r['n_baseline'] = ncs
    r['sofr30_z_cond'] = r['sofr_30'] / cs if cs and cs > 0 else np.nan; r['sofr30_z_uncond'] = r['sofr_30'] / us_ if us_ and us_ > 0 else np.nan
    cs2, _ = cond_sigma(eur, t, 30); r['eur30_z_cond'] = r['eur_30'] / cs2 if cs2 and cs2 > 0 else np.nan
    rows.append(r)
T = pd.DataFrame(rows); T.to_csv(OD / 'RELEASE_TABLE.csv', index=False)

def boot(x, B=2000):
    x = np.asarray(x, float); x = x[np.isfinite(x)]
    if len(x) < 6: return None
    o = np.array([rng.choice(x, len(x)).mean() for _ in range(B)]); return x.mean(), np.percentile(o, 2.5), np.percentile(o, 97.5), len(x)
def fmt(b, d=2): return f'{b[0]:+.{d}f} ({b[1]:+.{d}f} to {b[2]:+.{d}f}), n {b[3]}' if b else 'too few'
def corr(x, y):
    m = np.isfinite(x) & np.isfinite(y)
    if m.sum() < 8: return None
    x, y = np.asarray(x)[m], np.asarray(y)[m]; r = np.corrcoef(x, y)[0, 1]
    o = []
    for _ in range(2000):
        k = rng.integers(0, len(x), len(x)); xs, ys = x[k], y[k]
        if xs.std() > 0 and ys.std() > 0: o.append(np.corrcoef(xs, ys)[0, 1])
    return r, np.percentile(o, 2.5), np.percentile(o, 97.5), int(m.sum())

md = ['# Release-day layers for the SOFR and Euribor legs (descriptive, exploratory)', '',
      'Not pre-registered: a first look built from C.OG\'s Discord layers (19 Oct 2026). Legs: SOFR Sep26 (SR3U6) and Euribor Mar27 (IH7), 1-minute midpoints, rate changes in bp. Nasdaq: CFD, log % change. Events: the repo\'s own table (FOMC, CPI, NFP), 2024-04-15 to 2026-08-21. A leg\'s response is measured from the last minute that had ended at the release to the minute that had ended at +5, +30, +120, +240 minutes.', '',
      f'Events: {len(T)} ({", ".join(f"{k} {v}" for k, v in T.family.value_counts().items())}). Data surprise `ds` is the repo\'s standardised actual-minus-consensus (positive = above consensus); FOMC decisions almost never differ from consensus, so FOMC has no direction here.', '']
# Layer 1 + 3
md += ['## Layer 1 and 3: what happened, and how unusual (conditional versus unconditional normalising)', '',
       'z (cond) divides the 30-minute SOFR-leg move by the typical move for the SAME clock window on the previous 40 weekdays with no release. z (uncond) divides by a trailing 20-day volatility taken over all hours, as our turn detection did.', '',
       '| release | n | median abs SOFR-leg move 30m (bp) | median abs Euribor-leg 30m (bp) | median abs spread 30m (bp) | median abs Nasdaq 30m (%) | median abs z (cond) | median abs z (uncond) |', '|---|---|---|---|---|---|---|---|']
for fam in ('CPI', 'NFP', 'FOMC'):
    q = T[T.family == fam]
    md.append(f'| {fam} | {len(q)} | {q.sofr_30.abs().median():.2f} | {q.eur_30.abs().median():.2f} | {q.spr_30.abs().median():.2f} | {q.nq_30.abs().median():.2f} | {q.sofr30_z_cond.abs().median():.2f} | {q.sofr30_z_uncond.abs().median():.2f} |')
md += ['', f'Share of releases where the SOFR leg did not move at all in the 30 minutes (midpoint unchanged): {np.mean(T.sofr_30 == 0) * 100:.0f}%; Euribor leg: {np.mean(T.eur_30 == 0) * 100:.0f}%.', '']
# Layer 2: why -- the surprise
md += ['## Layer 2: surprise to response (CPI and NFP; positive surprise = hotter / stronger than consensus)', '', '| pair | correlation (95% range), n |', '|---|---|']
D = T[T.family.isin(['CPI', 'NFP'])]
for fam, q in (('CPI', D[D.family == 'CPI']), ('NFP', D[D.family == 'NFP']), ('CPI + NFP', D)):
    for lab, col in (('SOFR leg 30m', 'sofr_30'), ('Euribor leg 30m', 'eur_30'), ('spread 30m', 'spr_30'), ('Nasdaq 30m', 'nq_30'), ('Nasdaq 5 to 240m', 'nq_after_5_240')):
        c = corr(q.ds.values, q[col].values); md.append(f'| {fam}: surprise vs {lab} | ' + (f'{c[0]:+.2f} ({c[1]:+.2f} to {c[2]:+.2f}), n {c[3]}' if c else 'too few') + ' |')
# C.OG's conditional: strong vs weak front-end response, then Nasdaq afterwards
md += ['', '## His CPI test: after the same kind of surprise, what does Nasdaq do when the front end reacts strongly versus weakly?', '',
       'Surprise groups: hot (ds > 0) and cool (ds < 0), CPI and NFP together. "Strong" = the SOFR leg moved, in the direction the surprise implies (hot -> rates up), by more than 1 conditional sigma; "weak" = everything else. Nasdaq = the move from +5 minutes (after the first reaction) to +120 and +240 minutes, raw % (not signed).', '',
       '| surprise | SOFR-leg response | events | Nasdaq +5 to +120m, % (95% range) | Nasdaq +5 to +240m, % (95% range) |', '|---|---|---|---|---|']
for lab, sel in (('hot', D.ds > 0), ('cool', D.ds < 0)):
    q = D[sel].copy(); sgn = 1 if lab == 'hot' else -1
    strong = (q.sofr30_z_cond * sgn) > 1
    for gl, g in (('strong, in the implied direction', q[strong]), ('weak or against', q[~strong])):
        md.append(f'| {lab} | {gl} | {len(g)} | {fmt(boot(g.nq_after_5_120))} | {fmt(boot(g.nq_after_5_240))} |')
# FOMC
F = T[T.family == 'FOMC']
md += ['', '## FOMC (no surprise direction): Nasdaq after the front-end move', '', '| SOFR leg 30m move | events | Nasdaq +5 to +120m, % | Nasdaq +5 to +240m, % |', '|---|---|---|---|']
for lab, g in (('up (rates higher)', F[F.sofr_30 > 0]), ('down', F[F.sofr_30 < 0]), ('unchanged', F[F.sofr_30 == 0])):
    md.append(f'| {lab} | {len(g)} | {fmt(boot(g.nq_after_5_120))} | {fmt(boot(g.nq_after_5_240))} |')
md += ['', 'Sample note: about 70 events in total, so every cell above is a few events to a few dozen. Ranges are event-bootstrap ranges and are wide on purpose: read the sign and the width, not the average. The per-event rows are in `RELEASE_TABLE.csv`.', '']
(OD / 'RELEASE_TABLE.md').write_text('\n'.join(md) + '\n', encoding='utf-8')
print('\n'.join(md))
