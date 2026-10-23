"""COG-VARIABLE-LEAD (forge/COG_VARIABLE_LEAD_PREREG.md): does the lead profile persist, and can a factor predict which lead applies?
    python scripts/rate_diff_nq/cog_variable_lead.py     -> analysis/output/cog_video_0918/VARIABLE_LEAD.md
"""
from pathlib import Path
import numpy as np, pandas as pd
ROOT = Path(__file__).resolve().parents[2]; OUT = ROOT / 'analysis' / 'output' / 'cog_video_0918' / 'VARIABLE_LEAD.md'
rng = np.random.default_rng(23)

def ld(p):
    d = pd.read_parquet(p); d['time'] = pd.to_datetime(d['time'], utc=True); return d.set_index('time').sort_index()
def r15(p):
    g = ld(p)['close'].resample('15min', label='right', closed='right'); l, n = g.last(), g.count(); l[n < 5] = np.nan; return 100 - l
D = ROOT / 'analysis' / 'output' / 'stir_1m_deep'
us, eu = r15(D / 'CME_SR3U6.parquet') * 100, r15(D / 'ICEEU_IH7.parquet') * 100
G = pd.date_range('2024-04-15', '2026-10-16 23:45', freq='15min', tz='UTC')
us, eu = us.reindex(G), eu.reindex(G)
day = pd.Series(G.date, index=G)
dist = lambda s: s.groupby(day.values).agg(lambda x: x.dropna().nunique())
ds, de = dist(us), dist(eu)
good = np.array([ds.get(d, 0) >= 3 and de.get(d, 0) >= 3 for d in day.values]); us, eu = us.where(good), eu.where(good)
cfd = pd.read_parquet(ROOT / 'VolRangeForecaster' / 'data' / 'm1' / 'nq_m1.parquet')['close']; cfd.index = pd.to_datetime(cfd.index, utc=True)
cl = np.log(cfd.resample('15min', label='right', closed='right').last()).reindex(G)
fut = pd.read_parquet(ROOT / 'analysis' / 'output' / 'rate_curve_structure' / 'bars15.parquet')['NQ']; fut.index = pd.to_datetime(fut.index, utc=True); fut = fut.reindex(G)
sp_i = cl.last_valid_index(); off = cl.loc[sp_i] - fut.loc[:sp_i].dropna().iloc[-1]
nq = cl.copy(); aft = G > sp_i; nq[aft] = fut[aft] + off
L = us - eu
VIDEO = (G >= pd.Timestamp('2026-09-16', tz='UTC')) & (G < pd.Timestamp('2026-09-24', tz='UTC'))
SPLIT = pd.Timestamp('2025-11-01', tz='UTC')

# ---- hourly series on a full consecutive hourly index
hours = pd.date_range(G[0].ceil('h'), G[-1].floor('h'), freq='1h', tz='UTC')
at = lambda s: s.reindex(hours)
Lh, Nh, Uh, Eh = at(L), at(nq), at(us), at(eu)
dL = Lh - Lh.shift(1); dN = (Nh - Nh.shift(1)) * 100
usmv = (Uh != Uh.shift(1)) & Uh.notna() & Uh.shift(1).notna()
eumv = (Eh != Eh.shift(1)) & Eh.notna() & Eh.shift(1).notna()
valid_in = pd.Series(~VIDEO, index=G).reindex(hours).fillna(False).values & (hours.weekday < 5)
dL = dL.where(valid_in); dN = dN.where(valid_in)
H = pd.DataFrame(dict(dL=dL, dN=dN, usmv=usmv, eumv=eumv), index=hours)
H['date'] = [t.date() for t in H.index]
# vol states (trailing 20 days RMS of hourly changes, shifted one day so it is known at the target hour)
def trail_rms(s): return np.sqrt((s ** 2).rolling('20D', min_periods=100).mean()).shift(24)
H['nvol'] = trail_rms(H.dN); H['lvol'] = trail_rms(H.dL)
H['expl'] = H.index < SPLIT
cut = {c: H.loc[H.expl, c].quantile([1 / 3, 2 / 3]).values for c in ('nvol', 'lvol')}
tern = lambda c: pd.Series(np.where(H[c].isna(), np.nan, np.where(H[c] <= cut[c][0], 0, np.where(H[c] <= cut[c][1], 1, 2))), index=H.index)
H['nvol_t'], H['lvol_t'] = tern('nvol'), tern('lvol')
hr = H.index.hour
H['sess'] = np.where((hr >= 22) | (hr < 7), 0, np.where(hr < 13, 1, np.where(hr < 21, 2, np.nan)))
LEADS = [1, 2, 3, 4, 6, 8, 12, 24]

def corr(x, y):
    m = np.isfinite(x) & np.isfinite(y)
    if m.sum() < 40 or np.std(x[m]) == 0 or np.std(y[m]) == 0: return np.nan, int(m.sum())
    return float(np.corrcoef(x[m], y[m])[0, 1]), int(m.sum())

md = ['# COG-VARIABLE-LEAD results', '', 'Registered in `forge/COG_VARIABLE_LEAD_PREREG.md` (566bdc90) before any of this was computed. Hourly non-overlapping changes; video week excluded; leads in hours (k = 0 is context only).', '']

# ---------------------------------------------------------------- S1: profile persistence over 14-day blocks
blk = ((H.index - H.index[0]).days // 14).values
Bs = sorted(set(blk)); prof = {}
for b in Bs:
    s = H[blk == b]; r = []
    for k in LEADS:
        c, n = corr(s.dL.shift(k).values, s.dN.values); r.append((c, n))
    if min(n for _, n in r) >= 150 and all(np.isfinite(c) for c, _ in r): prof[b] = np.array([c for c, _ in r])
keys = sorted(prof)
pairs = [(a, a + 1) for a in keys if a + 1 in prof]
def pc(a, b): return np.corrcoef(prof[a], prof[b])[0, 1]
vals = np.array([pc(a, b) for a, b in pairs])
bstart = {b: H.index[0] + pd.Timedelta(days=14 * b) for b in keys}
is_exp = np.array([bstart[a] < SPLIT for a, b in pairs])
same_best = np.mean([np.argmax(np.abs(prof[a])) == np.argmax(np.abs(prof[b])) for a, b in pairs])
pl = []
for _ in range(1000):
    pv = []
    for a, b in pairs:
        far = [x for x in keys if abs(x - a) >= 3]; c = rng.choice(far); pv.append(pc(a, c))
    pl.append(np.mean(pv))
pl = np.array(pl)
s1_exp, s1_conf = vals[is_exp].mean(), vals[~is_exp].mean()
pass1 = (s1_exp > np.percentile(pl, 95)) and (s1_conf > 0)
md += ['## S1: does the lead profile persist?', '',
       f'{len(keys)} usable 14-day blocks, {len(pairs)} adjacent pairs ({int(is_exp.sum())} Explore, {int((~is_exp).sum())} Confirm).',
       f'Mean profile correlation between adjacent blocks: Explore {s1_exp:+.3f}, Confirm {s1_conf:+.3f}, all {vals.mean():+.3f}; placebo (random distant block) mean {pl.mean():+.3f}, 95th percentile {np.percentile(pl, 95):+.3f}.',
       f'Same best lead in adjacent blocks: {same_best * 100:.1f}% (chance 12.5%).', f'**Registered pass: {"YES" if pass1 else "NO"}.**', '']

# ---------------------------------------------------------------- S2/S3: factor-predicted lead
def daystats(df, k):
    x, y = df.dL.shift(k).values, df.dN.values; m = np.isfinite(x) & np.isfinite(y)
    t = pd.DataFrame(dict(d=df.date.values[m], x=x[m], y=y[m]))
    t['xx'], t['yy'], t['xy'] = t.x ** 2, t.y ** 2, t.x * t.y
    return t.groupby('d')[['x', 'y', 'xx', 'yy', 'xy']].sum().join(t.groupby('d').size().rename('n'))
def corr_from(s):
    n = s.n.sum(); sx, sy, sxx, syy, sxy = s.x.sum(), s.y.sum(), s.xx.sum(), s.yy.sum(), s.xy.sum()
    den = np.sqrt(max(n * sxx - sx ** 2, 1e-12) * max(n * syy - sy ** 2, 1e-12)); return (n * sxy - sx * sy) / den if n > 40 else np.nan
def boot_p(s, sign, B=2000):
    arr = s[['x', 'y', 'xx', 'yy', 'xy', 'n']].values; nd = len(arr); out = np.empty(B)
    for i in range(B):
        t = arr[rng.integers(0, nd, nd)].sum(0); n = t[5]
        den = np.sqrt(max(n * t[2] - t[0] ** 2, 1e-12) * max(n * t[3] - t[1] ** 2, 1e-12)); out[i] = (n * t[4] - t[0] * t[1]) / den
    return float(np.mean(out <= 0) if sign > 0 else np.mean(out >= 0))
# leg pattern in the source hour (t-k), by lead
def pattern(k):
    u, e = H.usmv.shift(k), H.eumv.shift(k)
    return pd.Series(np.where(u & e, 2, np.where(u, 0, np.where(e, 1, 3))), index=H.index)
levels = [('session', 'sess', v, lab) for v, lab in ((0, 'Asia 22-07'), (1, 'Europe 07-13'), (2, 'US 13-21'))] + \
         [('Nasdaq vol', 'nvol_t', v, lab) for v, lab in ((0, 'low'), (1, 'mid'), (2, 'high'))] + \
         [('line vol', 'lvol_t', v, lab) for v, lab in ((0, 'low'), (1, 'mid'), (2, 'high'))] + \
         [('leg pattern', 'pat', v, lab) for v, lab in ((0, 'only US moved'), (1, 'only euro moved'), (2, 'both moved'), (3, 'neither moved'))]
E, C = H[H.expl], H[~H.expl]
# fixed baseline
fe = [corr(E.dL.shift(k).values, E.dN.values)[0] for k in LEADS]; kfix = LEADS[int(np.nanargmax(np.abs(fe)))]
fixed_conf, fixed_n = corr(C.dL.shift(kfix).values, C.dN.values)
rows = []
for fac, col, v, lab in levels:
    best = None
    for k in LEADS:
        if col == 'pat':
            pe = pattern(k)[H.expl]; sel = (pe == v).values; Es = E[sel]
        else:
            Es = E[E[col] == v]
        c, n = corr(Es.dL.shift(k).values, Es.dN.values)
        if np.isfinite(c) and (best is None or abs(c) > abs(best[1])): best = (k, c, n)
    if best is None: continue
    k, ce, ne = best
    if col == 'pat': Cs = C[(pattern(k)[~H.expl] == v).values]
    else: Cs = C[C[col] == v]
    cc, nc = corr(Cs.dL.shift(k).values, Cs.dN.values)
    p = boot_p(daystats(Cs, k), np.sign(ce)) if np.isfinite(cc) else np.nan
    rows.append(dict(factor=fac, level=lab, k=k, ce=ce, ne=ne, cc=cc, nc=nc, p=p))
R = pd.DataFrame(rows)
# BH-FDR 10% across the levels
ps = R.p.values; order = np.argsort(ps); m = len(ps); adj = np.empty(m); run = 1.0
for rank, idx in reversed(list(enumerate(order, 1))): run = min(run, ps[idx] * m / rank); adj[idx] = run
R['p_bh'] = adj
R['pass'] = (R.p_bh < 0.10) & (np.sign(R.cc) == np.sign(R.ce)) & (R.cc.abs() > abs(fixed_conf))
md += ['## S2 / S3: does a factor predict which lead applies (out of sample)?', '',
       f'Fixed baseline: best single lead chosen on Explore = {kfix} h; Confirm corr {fixed_conf:+.3f} (n {fixed_n}).', '',
       '| factor | level | lead k* chosen on Explore (h) | Explore corr (n) | Confirm corr (n) | one-sided p | BH-adj p | pass |', '|---|---|---|---|---|---|---|---|']
for _, r in R.iterrows():
    md.append(f"| {r.factor} | {r.level} | {r.k} | {r.ce:+.3f} ({r['ne']}) | {r.cc:+.3f} ({r.nc}) | {r.p:.3f} | {r.p_bh:.3f} | {'YES' if r['pass'] else 'NO'} |")
md += ['', f'**Registered verdict: variable lead is predictable = {"YES" if R["pass"].any() else "NO"}** ({int(R["pass"].sum())} of {len(R)} levels pass).',
       f'Context only: same-hour (k = 0) correlation Explore {corr(E.dL.values, E.dN.values)[0]:+.3f}, Confirm {corr(C.dL.values, C.dN.values)[0]:+.3f}.', '']
OUT.write_text('\n'.join(md) + '\n', encoding='utf-8')
print('\n'.join(md))
