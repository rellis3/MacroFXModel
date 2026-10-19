"""COG-THEORIES (forge/COG_THEORIES_PREREG.md): T3 time-of-day link, T4 carried-forward legs, T5 selection base rate.
    python scripts/rate_diff_nq/cog_theories.py     -> analysis/output/cog_video_0918/THEORIES.md
"""
from pathlib import Path
import numpy as np, pandas as pd
ROOT = Path(__file__).resolve().parents[2]; OUT = ROOT / 'analysis' / 'output' / 'cog_video_0918' / 'THEORIES.md'
rng = np.random.default_rng(11)
B = 2000

def ld(p):
    d = pd.read_parquet(p); d['time'] = pd.to_datetime(d['time'], utc=True); return d.set_index('time').sort_index()
def r15(p):
    g = ld(p)['close'].resample('15min', label='right', closed='right'); l, n = g.last(), g.count(); l[n < 5] = np.nan; return 100 - l
D = ROOT / 'analysis' / 'output' / 'stir_1m_deep'
us, eu = r15(D / 'CME_SR3U6.parquet') * 100, r15(D / 'ICEEU_IH7.parquet') * 100          # bp
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
L = us - eu                                                                           # line: US rate - euro rate, bp

VIDEO = (G >= pd.Timestamp('2026-09-16', tz='UTC')) & (G < pd.Timestamp('2026-09-24', tz='UTC'))
SPLIT = pd.Timestamp('2025-11-01', tz='UTC')

# ---- hourly bars (non-overlapping, ending on the hour)
end = G[(G.minute == 0)]
pos = {t: i for i, t in enumerate(G)}
rows = []
for t in end:
    i = pos[t]
    if i < 8: continue
    a, b, c = i - 8, i - 4, i
    rows.append(dict(t=t, start_hour=(t - pd.Timedelta(hours=1)).hour, date=(t - pd.Timedelta(hours=1)).date(),
                     dL=L.iloc[c] - L.iloc[b], dN=(nq.iloc[c] - nq.iloc[b]) * 100,
                     dN_next=np.nan, dL_prev=L.iloc[b] - L.iloc[a],
                     us_mv=us.iloc[c] != us.iloc[b] if pd.notna(us.iloc[c]) and pd.notna(us.iloc[b]) else np.nan,
                     eu_mv=eu.iloc[c] != eu.iloc[b] if pd.notna(eu.iloc[c]) and pd.notna(eu.iloc[b]) else np.nan,
                     us_mv_prev=us.iloc[b] != us.iloc[a] if pd.notna(us.iloc[b]) and pd.notna(us.iloc[a]) else np.nan,
                     eu_mv_prev=eu.iloc[b] != eu.iloc[a] if pd.notna(eu.iloc[b]) and pd.notna(eu.iloc[a]) else np.nan,
                     video=bool(VIDEO[c]), wk=t.weekday()))
H = pd.DataFrame(rows).set_index('t')
H['dN_next'] = H['dN'].shift(-1).where(H.index.to_series().diff(-1).abs() == pd.Timedelta(hours=1))      # next consecutive hour only
H = H[(H.wk < 5) & (~H.video)].dropna(subset=['dL', 'dN'])
H['both'] = (H.us_mv == True) & (H.eu_mv == True) & (H.us_mv_prev == True) & (H.eu_mv_prev == True)
H['expl'] = H.index < SPLIT
E, C = H[H.expl], H[~H.expl]

def corr(df, x='dL', y='dN'):
    m = df[x].notna() & df[y].notna()
    return np.corrcoef(df.loc[m, x], df.loc[m, y])[0, 1] if m.sum() > 30 and df.loc[m, x].std() > 0 else np.nan
def dayboot(df, fn, Bn=B):
    days = df['date'].unique(); g = {d: x for d, x in df.groupby('date')}; out = []
    for _ in range(Bn):
        pick = rng.choice(len(days), len(days)); s = pd.concat([g[days[k]] for k in pick]); v = fn(s)
        if np.isfinite(v): out.append(v)
    return np.array(out)
def ci(a): return f'[{np.percentile(a, 2.5):+.3f}, {np.percentile(a, 97.5):+.3f}]'
def p1(a, sign):                                                                       # one-sided p that the statistic has the explore sign
    return (np.mean(a <= 0) if sign > 0 else np.mean(a >= 0))
md = ['# COG-THEORIES results', '', 'Registered in `forge/COG_THEORIES_PREREG.md` (685451fc) before any of this was computed. Hourly non-overlapping bars, video week excluded from pooled statistics.',
      f'Bars: {len(H):,} (Explore {len(E):,}, Confirm {len(C):,}); both legs moved in this and the previous hour: {H.both.mean() * 100:.1f}% of bars.', '']

# ---------------------------------------------------------------- T3
QUIET, LIQ = [1, 2, 3, 4], [12, 13, 14, 15]
def d3(df): return corr(df[df.start_hour.isin(LIQ)]) - corr(df[df.start_hour.isin(QUIET)])
e3, c3 = d3(E), d3(C)
be, bc = dayboot(E, d3), dayboot(C, d3)
pl = []
for _ in range(B):
    s = H.copy(); s['dN'] = s.groupby('start_hour')['dN'].transform(lambda v: rng.permutation(v.values)); pl.append(d3(s))
pl = np.array(pl); pl = pl[np.isfinite(pl)]
d3_all = d3(H)
pass3 = (e3 > 0) and (np.percentile(be, 2.5) > 0) and (c3 > 0) and (p1(bc, 1) < 0.05)
md += ['## T3: time of day', '',
       f'D3 = corr(liquid 12-15h starts) - corr(quiet 01-04h starts). Explore {e3:+.3f} {ci(be)}; Confirm {c3:+.3f} {ci(bc)} (one-sided p {p1(bc, 1):.3f}); all {d3_all:+.3f}; placebo 95th pct {np.percentile(pl, 95):+.3f}, real all-sample at placebo percentile {np.mean(pl < d3_all) * 100:.0f}.',
       f'**Registered pass: {"YES" if pass3 else "NO"}.**', '', '| UTC hour start | bars | share both legs moved | corr all | corr Explore | corr Confirm |', '|---|---|---|---|---|---|']
for h in range(24):
    s = H[H.start_hour == h]
    if len(s) < 40: continue
    md.append(f'| {h:02d} | {len(s)} | {s.both.mean() * 100:.0f}% | {corr(s):+.3f} | {corr(s[s.expl]):+.3f} | {corr(s[~s.expl]):+.3f} |')
md.append('')

# ---------------------------------------------------------------- T4
def lead(df): return corr(df, 'dL', 'dN_next')
BOTH = H[H.both]
res4 = {}
for name, df in (('ALL', H), ('BOTH', BOTH)):
    e, c = df[df.expl], df[~df.expl]
    be, bc = dayboot(e, lead), dayboot(c, lead)
    re, rc = lead(e), lead(c)
    pe = 2 * min(np.mean(be <= 0), np.mean(be >= 0))
    pc = p1(bc, np.sign(re))
    ok = (pe < 0.025) and (np.sign(rc) == np.sign(re)) and (pc < 0.05)
    res4[name] = (len(e), len(c), re, rc, pe, pc, ok, ci(be), ci(bc))
md += ['## T4: carried-forward legs', '', '| subset | n explore | n confirm | lead corr Explore | Confirm | Explore p (2-sided) | Confirm p (1-sided) | pass |', '|---|---|---|---|---|---|---|---|']
for k, (ne, nc, re, rc, pe, pc, ok, c1, c2) in res4.items():
    md.append(f'| T4{"a" if k == "ALL" else "b"} lead({k}) | {ne} | {nc} | {re:+.3f} {c1} | {rc:+.3f} {c2} | {pe:.3f} | {pc:.3f} | {"YES" if ok else "NO"} |')
def uplift(df): return corr(df[df.both]) - corr(df)
ue, uc, ua = uplift(E), uplift(C), uplift(H)
pu = []
for _ in range(B):
    s = H.copy(); s['both'] = s.groupby('start_hour')['both'].transform(lambda v: rng.permutation(v.values)); pu.append(uplift(s))
pu = np.array(pu); pu = pu[np.isfinite(pu)]
pe_up = uplift(E.assign(both=E.both));
pass4c = (ue > np.percentile(pu, 95)) and (uc > 0)
md += ['', f'T4c link uplift (corr when both legs moved - corr all bars): Explore {ue:+.3f}, Confirm {uc:+.3f}, all {ua:+.3f}; placebo 95th pct {np.percentile(pu, 95):+.3f}. **Registered pass: {"YES" if pass4c else "NO"}.**',
       f'Same-hour link when both moved: Explore {corr(E[E.both]):+.3f} (n {int(E.both.sum())}), Confirm {corr(C[C.both]):+.3f} (n {int(C.both.sum())}); all bars: Explore {corr(E):+.3f}, Confirm {corr(C):+.3f}.', '']

# ---------------------------------------------------------------- T5
def theta_series(x, bars4=16, look=20 * 96):
    ch = x - x.shift(bars4); sq = (ch ** 2)
    r = np.sqrt(sq.rolling('20D', min_periods=500).mean()); return r.shift(1)      # trailing 20 calendar days, enough bars from at least about 10 days with data
THL = theta_series(L); THN = theta_series(nq)
turns = []                                                                             # (confirm index, direction)
ok = L.values; th = THL.values
state, ext, ext_i = 0, np.nan, -1
for i in range(len(L)):
    x = ok[i]
    if not np.isfinite(x) or not np.isfinite(th[i]) or VIDEO[i]: continue
    if state == 0:
        if np.isnan(ext): ext, ext_i = x, i
        if x - ext >= th[i]: state, ext, ext_i = 1, x, i
        elif ext - x >= th[i]: state, ext, ext_i = -1, x, i
        else: ext = ext if abs(x - ext) < th[i] else x
        continue
    if state == 1:
        if x > ext: ext, ext_i = x, i
        elif ext - x >= th[i]: turns.append((i, -1)); state, ext, ext_i = -1, x, i
    else:
        if x < ext: ext, ext_i = x, i
        elif x - ext >= th[i]: turns.append((i, +1)); state, ext, ext_i = 1, x, i
nqv = nq.values; un = 0.75 * THN.values
def followed(i, d):
    u = un[i]
    if not np.isfinite(u) or not np.isfinite(nqv[i]): return np.nan
    for j in range(i + 1, min(i + 9, len(nqv))):
        if not np.isfinite(nqv[j]): continue
        r = (nqv[j] - nqv[i]) * 100 * d                                                # percent, signed by direction
        if r >= u: return 1
        if r <= -u: return 0
    return 0
T = pd.DataFrame([dict(i=i, d=d, t=G[i], wk=G[i].to_period('W-SUN'), f=followed(i, d)) for i, d in turns]).dropna(subset=['f'])
T = T[(T.t.dt.weekday < 5)]
wk = T.groupby('wk').agg(n=('f', 'size'), f=('f', 'sum'))
share_real = float((wk.f >= 2).mean())
pls, pvid = [], []
vid_wk = pd.Timestamp('2026-09-21').to_period('W-SUN')
# turns in the video week (computed separately: they were excluded above)
vt = []
state, ext = 0, np.nan
for i in range(len(L)):
    x = ok[i]
    if not VIDEO[i] or not np.isfinite(x) or not np.isfinite(th[i]): continue
    if state == 0:
        if np.isnan(ext): ext = x
        if x - ext >= th[i]: state, ext = 1, x
        elif ext - x >= th[i]: state, ext = -1, x
        continue
    if state == 1:
        if x > ext: ext = x
        elif ext - x >= th[i]: vt.append((i, -1)); state, ext = -1, x
    else:
        if x < ext: ext = x
        elif x - ext >= th[i]: vt.append((i, +1)); state, ext = 1, x
vf = [followed(i, d) for i, d in vt]; vf = [v for v in vf if v == v]
for _ in range(B):
    flip = rng.choice([-1, 1], len(T)); f = np.array([followed(i, d * s) for i, d, s in zip(T.i, T.d, flip)])
    w = pd.DataFrame(dict(wk=T.wk.values, f=f)).groupby('wk')['f'].sum()
    pls.append(float((w >= 2).mean()))
pls = np.array(pls)
inside = np.percentile(pls, 2.5) <= share_real <= np.percentile(pls, 97.5)
n_v, f_v = len(vf), int(sum(vf))
# placebo for a week with the video week's number of turns
pv = []
for _ in range(B):
    flip = rng.choice([-1, 1], len(vt)); pv.append(sum(followed(i, d * s) for (i, d), s in zip(vt, flip)))
pv = np.array(pv)
vid_ok = np.percentile(pv, 2.5) <= f_v <= np.percentile(pv, 97.5)
md += ['## T5: selection base rate', '', f'Causal zig-zag turns on the line (theta = 1.0 x trailing RMS of 4-hour changes): {len(T)} confirmed turns with an outcome over {len(wk)} weeks (video week excluded). Followed = Nasdaq first touches +u in the turn direction within 8 bars.',
       f'Turns per week: median {wk.n.median():.0f}, mean {wk.n.mean():.1f}. Followed per week: mean {wk.f.mean():.2f}. Overall followed share {T.f.mean() * 100:.1f}%.',
       f'Weeks with at least 2 followed turns: real {share_real * 100:.1f}%; random-direction placebo {np.mean(pls) * 100:.1f}% (central 95% {np.percentile(pls, 2.5) * 100:.1f}% to {np.percentile(pls, 97.5) * 100:.1f}%).',
       f'Video week (16-23 Sep): {n_v} turns, {f_v} followed; placebo for that many turns: mean {pv.mean():.2f}, central 95% {np.percentile(pv, 2.5):.0f} to {np.percentile(pv, 97.5):.0f}.',
       f'**Registered rule: selection explains the examples = {"YES" if (inside and vid_ok) else "NO"}** (real share inside the placebo range: {inside}; video week inside: {vid_ok}).', '']
OUT.write_text('\n'.join(md) + '\n', encoding='utf-8')
print('\n'.join(md))
