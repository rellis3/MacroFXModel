"""COG-MATCHED-PAIRS tests T1 (same-hour link and stability vs P0) and T2 (lead grid) with the Addendum A leg decomposition, for every candidate.
    python scripts/rate_diff_nq/cog_matched_pairs_t12.py  -> analysis/output/cog_video_0918/matched_pairs_t1.csv, _t2.csv, _decomp.csv
Registered in forge/COG_MATCHED_PAIRS_PREREG.md and forge/COG_MATCHED_PAIRS_ADDENDUM_A.md; nothing here is tuned per candidate."""
import sys, warnings
from pathlib import Path
warnings.filterwarnings('ignore')
HERE = Path(__file__).resolve(); sys.argv = [sys.argv[0]]
src = (HERE.parent / 'cog_turn_events.py').read_text(encoding='utf-8'); pre = src[:src.index('# ---------------------------------------------------------------- run')]
g0 = {'__file__': str(HERE.parent / 'cog_turn_events.py'), '__name__': 'core'}; exec(compile(pre, 'cog_turn_events.py', 'exec'), g0); globals().update(g0)
rng = np.random.default_rng(53)
CANDS = {'P0': ('CME_SR3U6', 'ICEEU_IH7', 'spread'), 'P1': ('CME_SR3H7', 'ICEEU_IH7', 'spread'), 'P2': ('CME_SR3Z6', 'ICEEU_IZ6', 'spread'), 'P3': ('CME_SR3Z6', 'ICEEU_ER3Z6', 'spread'), 'P4': ('CME_SR3H7', 'ICEEU_ER3H7', 'spread'),
         'L-US': ('CME_SR3Z6', None, 'us'), 'L-EU-Euribor': (None, 'ICEEU_IZ6', 'eu'), 'L-EU-ESTR': (None, 'ICEEU_ER3Z6', 'eu')}
def leg_series(f):
    p = DEEP / f'{f}.parquet'
    if not p.exists(): return None
    s = r15(p).reindex(G); d = dist(s); gd = np.array([d.get(dd, 0) >= 3 for dd in dayv]); return (s * 100).where(gd)          # rate in bp, screened
LEG = {f: leg_series(f) for f in {x for v in CANDS.values() for x in v[:2] if x}}
def cand_series(a, b, mode):
    if mode == 'spread':
        if LEG.get(a) is None or LEG.get(b) is None: return None
        return (LEG[a] - LEG[b]).to_numpy(), LEG[a].to_numpy(), LEG[b].to_numpy()                       # raw: ((100-pUS)-(100-pEU)) x 100 = rUS - rEU in bp
    f = a or b
    if LEG.get(f) is None: return None
    x = LEG[f].to_numpy(); return x, x, x
dcode = pd.factorize(pd.Series(dayv))[0]; ysr = pd.Series(Y, index=G)
r1c, r4c = ((ysr - ysr.shift(4)) * 100).to_numpy(), ((ysr - ysr.shift(16)) * 100).to_numpy()
HALFM = {h: (half_of == h) & (~VIDEO) for h in ('IS', 'VAL', 'OOS')}

# ------------------------------------------------------------------ T1: same-hour link (non-overlapping hourly samples) and stability
def hourly_stats(x):
    s = pd.Series(x, index=G); dx = (s - s.shift(4)).to_numpy(); dy = ((ysr - ysr.shift(4)) * 100).to_numpy(); m = np.isfinite(dx) & np.isfinite(dy) & (G.minute.to_numpy() == 0) & (~VIDEO) & (half_of != '')
    d = pd.DataFrame(dict(x=dx[m], y=dy[m], day=dcode[m], half=half_of[m])); gdf = d.groupby('day').agg(n=('x', 'size'), sx=('x', 'sum'), sy=('y', 'sum'), sxx=('x', lambda v: (v ** 2).sum()), syy=('y', lambda v: (v ** 2).sum()), sxy=('x', 'size'))
    gdf['sxy'] = d.assign(p=d.x * d.y).groupby('day').p.sum(); gdf['half'] = d.groupby('day').half.first(); return gdf
def corr_from(g_): n = g_.n.sum(); cov = g_.sxy.sum() / n - (g_.sx.sum() / n) * (g_.sy.sum() / n); vx = g_.sxx.sum() / n - (g_.sx.sum() / n) ** 2; vy = g_.syy.sum() / n - (g_.sy.sum() / n) ** 2; return cov / np.sqrt(vx * vy) if vx > 0 and vy > 0 else np.nan
def stability(g_, win=20):
    g_ = g_.sort_index(); cs = []
    cum = g_[['n', 'sx', 'sy', 'sxx', 'syy', 'sxy']].to_numpy(float)
    for i in range(len(g_)):
        w = cum[max(0, i - win + 1):i + 1].sum(0)
        if w[0] >= 30:
            n = w[0]; cov = w[5] / n - (w[1] / n) * (w[2] / n); vx = w[3] / n - (w[1] / n) ** 2; vy = w[4] / n - (w[2] / n) ** 2
            if vx > 0 and vy > 0: cs.append(cov / np.sqrt(vx * vy))
    cs = np.array(cs); return float((cs < 0).mean()) if len(cs) else np.nan
T1 = []; HS = {}
for k, (a, b, mode) in CANDS.items():
    cs = cand_series(a, b, mode)
    if cs is None: T1.append(dict(candidate=k, status='waiting for data')); continue
    HS[k] = hourly_stats(cs[0])
P0 = HS['P0']
for k in HS:
    row = dict(candidate=k)
    for hf in ('IS', 'VAL', 'OOS'):
        g_ = HS[k][HS[k].half == hf]; days = len(g_)
        if days < 20: row.update({f'{hf}_days': days, f'{hf}_corr': np.nan, f'{hf}_R2': np.nan, f'{hf}_stab_neg20d': np.nan, f'{hf}_R2_minus_P0': np.nan, f'{hf}_p_better_than_P0': np.nan, f'{hf}_stab_minus_P0': np.nan}); continue
        c = corr_from(g_); st = stability(g_)
        row.update({f'{hf}_days': days, f'{hf}_corr': c, f'{hf}_R2': c * c, f'{hf}_stab_neg20d': st})
        if k != 'P0':
            ix = g_.index.intersection(P0[P0.half == hf].index); a_, b_ = HS[k].loc[ix], P0.loc[ix]; dif = []; B = 1000
            for _ in range(B):
                pick = rng.integers(0, len(ix), len(ix)); ga, gb = a_.iloc[pick], b_.iloc[pick]; dif.append(corr_from(ga) ** 2 - corr_from(gb) ** 2)
            dif = np.array(dif); real = corr_from(a_) ** 2 - corr_from(b_) ** 2
            row.update({f'{hf}_R2_minus_P0': real, f'{hf}_R2_diff_ci_lo': np.percentile(dif, 2.5), f'{hf}_R2_diff_ci_hi': np.percentile(dif, 97.5), f'{hf}_p_better_than_P0': float((dif <= 0).mean()), f'{hf}_stab_minus_P0': stability(a_) - stability(b_)})
    T1.append(row)
T1 = pd.DataFrame(T1); T1.to_csv(OUTD / 'matched_pairs_t1.csv', index=False)

# ------------------------------------------------------------------ T2: lead grid with day-clustered t, FDR, confirm; plus leg decomposition
WS, HS_ = {'15m': 1, '1h': 4, '4h': 16}, {'15m': 1, '30m': 2, '1h': 4, '2h': 8, '4h': 16, '8h': 32, '24h': 96, '48h': 192}
def cluster_slope(y, f, D, half, extra=None):
    m = np.isfinite(y) & np.isfinite(f) & HALFM[half]
    if extra is not None: m &= np.isfinite(extra).all(axis=1)
    if m.sum() < 600: return None
    yv, fv = y[m], f[m]; cols = [np.ones(m.sum()), (fv - fv.mean()) / fv.std()];
    if extra is not None: cols += [(extra[m][:, j] - extra[m][:, j].mean()) / extra[m][:, j].std() for j in range(extra.shape[1])]
    Xm = np.column_stack(cols); yy = (yv - yv.mean()) / yv.std(); XtXi = np.linalg.pinv(Xm.T @ Xm); b = XtXi @ Xm.T @ yy; e = yy - Xm @ b; dc = D[m]
    starts = np.r_[0, np.flatnonzero(np.diff(dc)) + 1]; sc = np.add.reduceat(Xm * e[:, None], starts, axis=0); V = XtXi @ (sc.T @ sc) @ XtXi
    return b[1], b[1] / np.sqrt(V[1, 1]), int(m.sum()), len(starts)
T2 = []
for k, (a, b, mode) in CANDS.items():
    cs = cand_series(a, b, mode)
    if cs is None: continue
    s = pd.Series(cs[0], index=G)
    for wn, w in WS.items():
        f = (s - s.shift(w)).to_numpy()
        for hn, h in HS_.items():
            y = (ysr.shift(-h) - ysr).to_numpy() * 100; rec = dict(candidate=k, W=wn, H=hn)
            for hf in ('IS', 'VAL', 'OOS'):
                r = cluster_slope(y, f, dcode, hf, extra=np.column_stack([r1c, r4c]))
                rec.update({f'beta_{hf}': r[0] if r else np.nan, f't_{hf}': r[1] if r else np.nan, f'n_{hf}': r[2] if r else 0})
            T2.append(rec)
T2 = pd.DataFrame(T2)
out = []
for k, g_ in T2.groupby('candidate'):
    g_ = g_.copy(); g_['p_IS'] = 2 * stats.norm.sf(g_.t_IS.abs()); pv = g_.p_IS.fillna(1).values; o = np.argsort(pv); m_ = len(g_); ok = pv[o] <= 0.10 * np.arange(1, m_ + 1) / m_; kp = np.zeros(m_, bool)
    if ok.any(): kp[o[:np.max(np.where(ok)[0]) + 1]] = True
    g_['fdr_IS'] = kp; sg = np.sign(g_.beta_IS)
    g_['p_VAL_oneside'] = stats.norm.sf(sg * g_.t_VAL); g_['p_OOS_oneside'] = stats.norm.sf(sg * g_.t_OOS)
    g_['confirmed'] = g_.fdr_IS & (np.sign(g_.beta_VAL) == sg) & (np.sign(g_.beta_OOS) == sg) & (g_.p_VAL_oneside < .05) & (g_.p_OOS_oneside < .05)
    out.append(g_)
T2 = pd.concat(out); T2.to_csv(OUTD / 'matched_pairs_t2.csv', index=False)
# decomposition: every FDR-passing cell, plus the three largest in-sample |t| per candidate (Addendum A section 2)
DEC = []
for k, g_ in T2.groupby('candidate'):
    a, b, mode = CANDS[k]; cs = cand_series(a, b, mode); pick = g_[g_.fdr_IS | g_.index.isin(g_.reindex(g_.t_IS.abs().sort_values(ascending=False).index).head(3).index)]
    pick = pd.concat([g_[g_.fdr_IS], g_.reindex(g_.t_IS.abs().sort_values(ascending=False).index).head(3)]).drop_duplicates(['W', 'H'])
    for _, r in pick.iterrows():
        w, h = WS[r.W], HS_[r.H]; y = (ysr.shift(-h) - ysr).to_numpy() * 100
        if mode != 'spread':
            DEC.append(dict(candidate=k, W=r.W, H=r.H, t_IS_spread_or_leg=r.t_IS, attribution='single leg candidate (no decomposition needed)')); continue
        dU = (pd.Series(cs[1], index=G) - pd.Series(cs[1], index=G).shift(w)).to_numpy(); dE = (pd.Series(cs[2], index=G) - pd.Series(cs[2], index=G).shift(w)).to_numpy(); rec = dict(candidate=k, W=r.W, H=r.H, t_IS_spread=r.t_IS, in_FDR=bool(r.fdr_IS))
        for hf in ('IS', 'VAL', 'OOS'):
            m = np.isfinite(y) & np.isfinite(dU) & np.isfinite(dE) & np.isfinite(r1c) & np.isfinite(r4c) & HALFM[hf]
            if m.sum() < 600: rec.update({f'bUS_{hf}': np.nan}); continue
            z = lambda v: (v[m] - v[m].mean()) / v[m].std(); Xm = np.column_stack([np.ones(m.sum()), z(dU), z(dE), z(r1c), z(r4c)]); yy = z(y); XtXi = np.linalg.pinv(Xm.T @ Xm); bb = XtXi @ Xm.T @ yy; e = yy - Xm @ bb; dc = dcode[m]
            st = np.r_[0, np.flatnonzero(np.diff(dc)) + 1]; sc = np.add.reduceat(Xm * e[:, None], st, axis=0); V = XtXi @ (sc.T @ sc) @ XtXi
            wald = (bb[1] + bb[2]) ** 2 / (V[1, 1] + V[2, 2] + 2 * V[1, 2]); rec.update({f'bUS_{hf}': bb[1], f'tUS_{hf}': bb[1] / np.sqrt(V[1, 1]), f'bEU_{hf}': bb[2], f'tEU_{hf}': bb[2] / np.sqrt(V[2, 2]), f'wald_p_{hf}': float(stats.chi2.sf(wald, 1))})
        tu, te, wp = rec.get('tUS_IS', np.nan), rec.get('tEU_IS', np.nan), rec.get('wald_p_IS', np.nan)
        if not np.isfinite(tu): att = 'insufficient in-sample data'
        elif rec['bUS_IS'] * rec['bEU_IS'] < 0 and abs(tu) >= 1 and abs(te) >= 1 and wp >= 0.05: att = 'spread effect'
        elif abs(te) < 1 and abs(tu) >= 2: att = 'US-leg effect'
        elif abs(tu) < 1 and abs(te) >= 2: att = 'euro-leg effect'
        elif rec['bUS_IS'] * rec['bEU_IS'] > 0 and abs(tu) >= 1 and abs(te) >= 1: att = 'common level (both legs same sign)'
        else: att = 'unattributed'
        rec['attribution'] = att; DEC.append(rec)
DEC = pd.DataFrame(DEC); DEC.to_csv(OUTD / 'matched_pairs_decomp.csv', index=False)
print(T1.round(3).to_string()); print(T2.groupby('candidate').agg(cells=('t_IS', 'size'), fdr=('fdr_IS', 'sum'), confirmed=('confirmed', 'sum'), max_abs_t_IS=('t_IS', lambda v: v.abs().max())).to_string()); print(DEC.round(2).to_string())
