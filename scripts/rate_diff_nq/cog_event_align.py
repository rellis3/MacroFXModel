"""COG-EVENT-ALIGN (forge/COG_EVENT_ALIGN_PREREG.md): two or more structure events line up at a shifted time, then the line's next event marks price's future shift.
    python scripts/rate_diff_nq/cog_event_align.py     -> analysis/output/cog_video_0918/EVENT_ALIGN.md
"""
from pathlib import Path
import numpy as np, pandas as pd
ROOT = Path(__file__).resolve().parents[2]; OUT = ROOT / 'analysis' / 'output' / 'cog_video_0918' / 'EVENT_ALIGN.md'
rng = np.random.default_rng(53)

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
Lser = (us - eu); Pser = nq * 100
VIDEO = ((G >= pd.Timestamp('2026-09-16', tz='UTC')) & (G < pd.Timestamp('2026-09-24', tz='UTC')))
N_LAST = int(np.where(np.isfinite(Pser.values))[0][-1]); n = len(G)
SPLIT = pd.Timestamp('2025-11-01', tz='UTC')
LEADS = [2, 4, 8, 16, 32, 64, 96, 128, 192]; HS = [2, 4, 8, 16]; HN = ['0.5h', '1h', '2h', '4h']

def theta(s, k):
    ch = s - s.shift(16); return (k * np.sqrt((ch ** 2).rolling('20D', min_periods=500).mean())).shift(1).values

def zigzag(x, th, mask=None):
    """-> list of (extreme index, confirmation index, direction); direction +1 = turn up"""
    ev = []; state = 0; hi = lo = np.nan; hi_i = lo_i = -1
    for i in range(len(x)):
        v = x[i]
        if not np.isfinite(v) or not np.isfinite(th[i]) or (mask is not None and mask[i]): continue
        if np.isnan(hi): hi = lo = v; hi_i = lo_i = i
        if state == 0:
            if v > hi: hi, hi_i = v, i
            if v < lo: lo, lo_i = v, i
            if v - lo >= th[i]: ev.append((lo_i, i, +1)); state, hi, hi_i = 1, v, i
            elif hi - v >= th[i]: ev.append((hi_i, i, -1)); state, lo, lo_i = -1, v, i
        elif state == 1:
            if v > hi: hi, hi_i = v, i
            elif hi - v >= th[i]: ev.append((hi_i, i, -1)); state, lo, lo_i = -1, v, i
        else:
            if v < lo: lo, lo_i = v, i
            elif v - lo >= th[i]: ev.append((lo_i, i, +1)); state, hi, hi_i = 1, v, i
    return ev

Pth = theta(Pser, 0.75); Pv = Pser.values
PEV = zigzag(Pv, Pth, VIDEO.values if hasattr(VIDEO, 'values') else VIDEO)
pe_ext = np.array([e[0] for e in PEV]); pe_conf = np.array([e[1] for e in PEV]); pe_dir = np.array([e[2] for e in PEV])

def calls_for(Lvals, want_detail=False):
    th = theta(pd.Series(Lvals, index=G), 1.0)
    LEV = zigzag(Lvals, th, VIDEO.values if hasattr(VIDEO, 'values') else VIDEO)
    l_ext = np.array([e[0] for e in LEV]); l_conf = np.array([e[1] for e in LEV]); l_dir = np.array([e[2] for e in LEV])
    out = []
    for k in range(len(LEV)):
        c, e, d = l_conf[k], l_ext[k], l_dir[k]
        pm = (pe_conf <= c) & (pe_ext > c - 96)
        pex, pdr = pe_ext[pm], pe_dir[pm]
        if len(pex) == 0: continue
        best = None
        for l in LEADS:
            tol = max(4, int(round(0.1 * l)))
            lm = np.where((l_conf < c) & (l_ext + l >= c - 96 - tol) & (l_ext + l <= c + tol))[0]
            if len(lm) == 0: continue
            for s in (+1, -1):
                cnt = 0
                for j in lm:
                    if np.any((np.abs(pex - (l_ext[j] + l)) <= tol) & (pdr == s * l_dir[j])): cnt += 1
                if cnt >= 2 and (best is None or cnt > best[0]): best = (cnt, l, s, tol)
        if best is None: continue
        cnt, l, s, tol = best; T = e + l
        if T <= c or T + max(HS) > N_LAST: continue
        dr = s * d
        if not (np.isfinite(Pv[T]) and np.isfinite(Pv[[T + h for h in HS]]).all()): continue
        hit = bool(np.any((np.abs(pe_ext - T) <= tol) & (pe_dir == dr)))
        off = int(rng.integers(8, 97)) * (1 if rng.random() < 0.5 else -1)
        hit0 = bool(np.any((np.abs(pe_ext - (T + off)) <= tol) & (pe_dir == dr)))
        row = dict(c=c, T=T, l=l, s=s, cnt=cnt, dir=dr, hit=hit, hit0=hit0)
        for h, hn in zip(HS, HN): row[hn] = dr * (Pv[T + h] - Pv[T])
        out.append(row)
    return pd.DataFrame(out)

def day_boot(vals, days, B=2000):
    u, inv = np.unique(days, return_inverse=True); sm = np.bincount(inv, vals); c = np.bincount(inv).astype(float); o = np.empty(B)
    for b in range(B):
        k = rng.integers(0, len(u), len(u)); o[b] = sm[k].sum() / c[k].sum()
    return float(np.mean(o <= 0))

R = calls_for(Lser.values)
R['date'] = [G[int(c)].date() for c in R.c]; R['expl'] = [G[int(c)] < SPLIT for c in R.c]
md = ['# COG-EVENT-ALIGN results', '', 'Registered in `forge/COG_EVENT_ALIGN_PREREG.md` (caaefd7c) before any computation.', '']
nweeks = (G[N_LAST] - G[0]).days / 7
md += [f'Price events: {len(PEV)}. Calls (2 or more aligned events at one shift, projected time still in the future): {len(R)}, about {len(R) / nweeks:.1f} per week ({int(R.expl.sum())} Explore, {int((~R.expl).sum())} Confirm).',
       'Chosen lead (bars): ' + ', '.join(f'{l}: {int((R.l == l).sum())}' for l in LEADS) + '.',
       'Number of matches: ' + ', '.join(f'{k}: {int((R.cnt == k).sum())}' for k in (2, 3)) + f', 4 or more: {int((R.cnt >= 4).sum())}.',
       f'Event hit rate (a price turn in the called direction within tolerance of the projected time): {R.hit.mean() * 100:.1f}%; with the projected time moved by a random 8 to 96 bars: {R.hit0.mean() * 100:.1f}%.', '']
rows = []
for hn in HN:
    e, c = R[R.expl], R[~R.expl]
    pe = day_boot(e[hn].values, e.date.values) if len(e) > 30 else np.nan; pc = day_boot(c[hn].values, c.date.values) if len(c) > 30 else np.nan
    rows.append(dict(h=hn, n=len(R), ne=len(e), nc=len(c), me=e[hn].mean(), mc=c[hn].mean(), pe=pe, pc=pc, right=float((R[hn] > 0).mean())))
T_ = pd.DataFrame(rows)
ps = T_.pe.fillna(1).values; order = np.argsort(ps); m_ = len(ps); adj = np.empty(m_); run_ = 1.0
for rank, idx in reversed(list(enumerate(order, 1))): run_ = min(run_, ps[idx] * m_ / rank); adj[idx] = run_
T_['bh'] = adj; T_['pass'] = (T_.me > 0) & (T_.bh < 0.10) & (T_.mc > 0) & (T_.pc < 0.05) & (R.hit.mean() > R.hit0.mean())
md += ['| horizon | calls | Explore mean signed move % (n) | Confirm mean signed move % (n) | Explore p | Confirm p | BH p | share of calls right | pass |', '|---|---|---|---|---|---|---|---|---|']
for _, r in T_.iterrows():
    md.append(f"| {r.h} | {r.n} | {r.me:+.4f} ({r['ne']}) | {r.mc:+.4f} ({r['nc']}) | {r.pe:.3f} | {r.pc:.3f} | {r.bh:.3f} | {r.right * 100:.1f}% | {'YES' if r['pass'] else 'NO'} |")
md += ['', 'Mean signed move % by number of aligned events (does more alignment mean more follow-through?):', '', '| matches | calls | ' + ' | '.join(HN) + ' |', '|---|---|' + '---|' * len(HN)]
for lab, sel in (('2', R.cnt == 2), ('3', R.cnt == 3), ('4+', R.cnt >= 4)):
    q = R[sel]
    if len(q): md.append(f'| {lab} | {len(q)} | ' + ' | '.join(f'{q[hn].mean():+.4f}' for hn in HN) + ' |')
real_max = T_.mc.max(); real_max_e = T_.me.max(); pm_c, pm_e = [], []
for k in range(30):
    Lr = np.roll(Lser.values, int(rng.integers(5, 61)) * 96); d = calls_for(Lr)
    if len(d) < 30: continue
    ex = np.array([G[int(c)] < SPLIT for c in d.c])
    pm_c.append(max(d[~ex][hn].mean() for hn in HN)); pm_e.append(max(d[ex][hn].mean() for hn in HN))
    if k % 10 == 9: print('placebo', k + 1, flush=True)
pm_c, pm_e = np.array(pm_c), np.array(pm_e); cond = real_max > np.nanpercentile(pm_c, 95)
md += ['', f'Placebo (line rotated by random days, {len(pm_c)} draws, maximum over horizons): Confirm real {real_max:+.4f} vs placebo median {np.nanmedian(pm_c):+.4f}, 95th {np.nanpercentile(pm_c, 95):+.4f}; Explore real {real_max_e:+.4f} vs placebo median {np.nanmedian(pm_e):+.4f}, 95th {np.nanpercentile(pm_e, 95):+.4f}.',
       f'**Registered verdict: aligned structure events predict a future shift = {"YES" if (T_["pass"].any() and cond) else "NO"}** ({int(T_["pass"].sum())} of {len(T_)} horizons pass; placebo condition {"met" if cond else "not met"}).', '']
OUT.write_text('\n'.join(md) + '\n', encoding='utf-8')
print('\n'.join(md))
