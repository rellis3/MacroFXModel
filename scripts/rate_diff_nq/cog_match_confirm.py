"""COG-MATCH-CONFIRM (forge/COG_MATCH_CONFIRM_PREREG.md): the owner's match / confirm / entry procedure, mechanised, on all history.
    python scripts/rate_diff_nq/cog_match_confirm.py     -> analysis/output/cog_video_0918/MATCH_CONFIRM.md
"""
from pathlib import Path
import numpy as np, pandas as pd
from numpy.lib.stride_tricks import sliding_window_view as swv
ROOT = Path(__file__).resolve().parents[2]; OUT = ROOT / 'analysis' / 'output' / 'cog_video_0918' / 'MATCH_CONFIRM.md'
rng = np.random.default_rng(41)

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
Lraw = (us - eu); Pv = nq.values.astype(float)
VIDEO = ((G >= pd.Timestamp('2026-09-16', tz='UTC')) & (G < pd.Timestamp('2026-09-24', tz='UTC')))
N_LAST = int(np.where(np.isfinite(Pv))[0][-1]); n = len(G)
W, CW = 48, 16; LAGS = np.arange(2, 193); HS = [2, 4, 8, 16, 32]; HN = ['0.5h', '1h', '2h', '4h', '8h']
SPLIT = pd.Timestamp('2025-11-01', tz='UTC')
dec_idx = np.where((G.minute == 0) & (G.weekday < 5) & ~VIDEO & (np.arange(n) >= 300) & (np.arange(n) + 32 <= N_LAST))[0]

def make_x(Lser):
    return Lser.ffill().ewm(span=6, adjust=False).mean().values

def wcorr(a, B):
    """correlation of vector a (len m) with each row of B (k x m)"""
    am = a - a.mean(); Bm = B - B.mean(1, keepdims=True)
    den = np.sqrt((am ** 2).sum() * (Bm ** 2).sum(1)); return (Bm @ am) / np.where(den == 0, np.nan, den)

def run(X, with_changes=False):
    Xw = swv(X, W)                                  # Xw[j] = X[j .. j+W-1]
    Xc = swv(X, CW)
    rows = []; prev_l = None; changes = 0; ncall = 0
    for t in dec_idx:
        p = Pv[t - W + 1:t + 1]
        if not np.isfinite(p).all() or np.std(p) == 0: continue
        starts = t - W + 1 - LAGS
        if starts.min() < 0: continue
        B = Xw[starts]; r = wcorr(p, B)
        if not np.isfinite(r).any(): continue
        k = int(np.nanargmax(np.abs(r))); l = int(LAGS[k]); rr = r[k]
        if with_changes:
            if prev_l is not None and prev_l != l: changes += 1
            ncall += 1; prev_l = l
        pc = Pv[t - CW + 1:t + 1]; b = Xc[t - CW + 1 - l]
        rc = np.corrcoef(pc, b)[0, 1] if np.std(pc) > 0 and np.std(b) > 0 else np.nan
        if not (abs(rr) >= 0.8 and np.isfinite(rc) and np.sign(rc) == np.sign(rr) and abs(rc) >= 0.5): continue
        for h, hn in zip(HS, HN):
            if h > l: continue
            pr = np.sign(rr) * (X[t + h - l] - X[t - l])
            if pr == 0 or not np.isfinite(pr): continue
            rows.append((t, hn, l, np.sign(pr), (Pv[t + h] - Pv[t]) * 100))
    df = pd.DataFrame(rows, columns=['t', 'h', 'l', 'dir', 'ret'])
    return (df, changes, ncall) if with_changes else df

def day_boot(vals, days, B=2000):
    u, inv = np.unique(days, return_inverse=True); s = np.bincount(inv, vals); c = np.bincount(inv).astype(float); out = np.empty(B)
    for b in range(B):
        k = rng.integers(0, len(u), len(u)); out[b] = s[k].sum() / c[k].sum()
    return float(np.mean(out <= 0))

X0 = make_x(Lraw)
df, changes, ncall = run(X0, with_changes=True)
df = df[np.isfinite(df.ret)].reset_index(drop=True)      # calls whose outcome bar has no Nasdaq price cannot be scored
df['date'] = [G[t].date() for t in df.t]; df['expl'] = [G[t] < SPLIT for t in df.t]; df['sig'] = df['dir'] * df.ret
md = ['# COG-MATCH-CONFIRM results', '', 'Registered in `forge/COG_MATCH_CONFIRM_PREREG.md` (51a89470) before the history run. The rule was applied once to the owner\'s 23 Oct 12:00 UTC example earlier (exploratory); this is the test on all history.', '']
nweeks = ((G[dec_idx[-1]] - G[dec_idx[0]]).days) / 7
calls_h = df.groupby('t').size()
md += [f'Decisions: {len(dec_idx):,}. Decisions that produced at least one call (strong match + confirm): {len(calls_h):,} ({len(calls_h) / len(dec_idx) * 100:.0f}%), about {len(calls_h) / nweeks:.1f} per week. The fitted lead changed between consecutive decisions {changes / max(ncall - 1, 1) * 100:.0f}% of the time; median fitted lead {df.l.median():.0f} bars ({df.l.median() / 4:.1f} h).', '']
rows = []
for hn in HN:
    q = df[df.h == hn]; e, c = q[q.expl], q[~q.expl]
    pe = day_boot(e.sig.values, e.date.values) if len(e) > 30 else np.nan; pc = day_boot(c.sig.values, c.date.values) if len(c) > 30 else np.nan
    up, dn = (q.ret > 0).mean(), (q.ret < 0).mean(); right = (q['dir'] == np.sign(q.ret)).mean()
    rows.append(dict(h=hn, n=len(q), ne=len(e), nc=len(c), me=e.sig.mean(), mc=c.sig.mean(), pe=pe, pc=pc, right=right, base=max(up, dn)))
T = pd.DataFrame(rows)
ps = T.pe.fillna(1).values; order = np.argsort(ps); m_ = len(ps); adj = np.empty(m_); run_ = 1.0
for rank, idx in reversed(list(enumerate(order, 1))): run_ = min(run_, ps[idx] * m_ / rank); adj[idx] = run_
T['bh'] = adj; T['pass'] = (T.me > 0) & (T.bh < 0.10) & (T.mc > 0) & (T.pc < 0.05) & (T.right > T.base)
md += ['| horizon | calls | Explore mean signed move % (n) | Confirm mean signed move % (n) | Explore p | Confirm p | BH p | sign right | better of always-up/down | pass |', '|---|---|---|---|---|---|---|---|---|---|']
for _, r in T.iterrows():
    md.append(f"| {r.h} | {r.n} | {r.me:+.4f} ({r['ne']}) | {r.mc:+.4f} ({r.nc}) | {r.pe:.3f} | {r.pc:.3f} | {r.bh:.3f} | {r.right * 100:.1f}% | {r.base * 100:.1f}% | {'YES' if r['pass'] else 'NO'} |")
real_max = T.mc.max(); real_max_e = T.me.max()
pm_c, pm_e = [], []
for k in range(30):
    Xr = make_x(pd.Series(np.roll(Lraw.values, int(rng.integers(5, 61)) * 96), index=Lraw.index)); d = run(Xr)
    d['expl'] = [G[t] < SPLIT for t in d.t]; d['sig'] = d['dir'] * d.ret
    pm_c.append(d[~d.expl].groupby('h').sig.mean().max()); pm_e.append(d[d.expl].groupby('h').sig.mean().max())
    if k % 10 == 9: print('placebo', k + 1, flush=True)
pm_c, pm_e = np.array(pm_c), np.array(pm_e)
cond = real_max > np.nanpercentile(pm_c, 95)
md += ['', f'Placebo (line rotated by random days, 30 draws, maximum over horizons): Confirm real {real_max:+.4f} vs placebo median {np.nanmedian(pm_c):+.4f}, 95th {np.nanpercentile(pm_c, 95):+.4f}; Explore real {real_max_e:+.4f} vs placebo median {np.nanmedian(pm_e):+.4f}, 95th {np.nanpercentile(pm_e, 95):+.4f}.',
       f'**Registered verdict: the match-and-confirm process has an edge = {"YES" if (T["pass"].any() and cond) else "NO"}** ({int(T["pass"].sum())} of {len(T)} horizons pass; placebo condition {"met" if cond else "not met"}).', '']
OUT.write_text('\n'.join(md) + '\n', encoding='utf-8')
print('\n'.join(md))
