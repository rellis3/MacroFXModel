"""COG-ANALOG (forge/COG_ANALOG_PREREG.md): nearest-neighbour matching of the last 12 h of the line against its own past.
    python scripts/rate_diff_nq/cog_analog.py     -> analysis/output/cog_video_0918/ANALOG.md
"""
from pathlib import Path
import numpy as np, pandas as pd
from scipy.stats import rankdata
ROOT = Path(__file__).resolve().parents[2]; OUT = ROOT / 'analysis' / 'output' / 'cog_video_0918' / 'ANALOG.md'
rng = np.random.default_rng(31)

def ld(p):
    d = pd.read_parquet(p); d['time'] = pd.to_datetime(d['time'], utc=True); return d.set_index('time').sort_index()
def r15(p):
    g = ld(p)['close'].resample('15min', label='right', closed='right'); l, n = g.last(), g.count(); l[n < 5] = np.nan; return 100 - l
D = ROOT / 'analysis' / 'output' / 'stir_1m_deep'
us, eu = r15(D / 'CME_SR3U6.parquet') * 100, r15(D / 'ICEEU_IH7.parquet') * 100
G = pd.date_range('2024-04-15', '2026-10-23 23:45', freq='15min', tz='UTC')
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
Lv = (us - eu).values.astype(float); Nv = nq.values.astype(float)
VIDEO = ((G >= pd.Timestamp('2026-09-16', tz='UTC')) & (G < pd.Timestamp('2026-09-24', tz='UTC')))
N_LAST = int(np.where(np.isfinite(Nv))[0][-1]); L_LAST = int(np.where(np.isfinite(Lv))[0][-1])
W = 48; HB = [2, 4, 8, 16, 32, 48, 96, 192]; HN = ['0.5h', '1h', '2h', '4h', '8h', '12h', '24h', '48h']; K = 20; SPACE = 48
whole = (G.minute == 0) & (G.weekday < 5)
SPLIT = pd.Timestamp('2025-11-01', tz='UTC'); START = pd.Timestamp('2024-09-01', tz='UTC')

def zwin(x, ends):
    out = np.full((len(ends), W), np.nan, dtype=np.float32)
    for r, e in enumerate(ends):
        if e - W + 1 < 0: continue
        w = x[e - W + 1:e + 1].copy(); fin = np.isfinite(w)
        if fin.mean() < 0.9 or fin.sum() < 2: continue
        idx = np.where(fin)[0]; w = np.interp(np.arange(W), idx, w[idx])      # forward-fill-like fill of interior gaps (linear between known points; only <=10% missing)
        # strict forward-fill instead of interpolation (no look at later bars inside the window is needed for the shape, but keep it causal):
        w = x[e - W + 1:e + 1].copy(); last = np.nan
        for j in range(W):
            if np.isfinite(w[j]): last = w[j]
            else: w[j] = last
        if np.isnan(w).any():
            first = w[np.isfinite(w)][0]; w[np.isnan(w)] = first
        sd = w.std()
        if sd < 1e-9: continue
        out[r] = (w - w.mean()) / sd
    return out
ends_all = np.where(whole & ~VIDEO)[0]
def outcomes(ends):
    R = np.full((len(ends), len(HB)), np.nan)
    for j, h in enumerate(HB):
        e2 = ends + h; ok = e2 <= N_LAST
        R[ok, j] = (Nv[e2[ok]] - Nv[ends[ok]]) * 100
    return R
Rall = outcomes(ends_all)

def run(Lseries, variant, decisions_mask=None):
    """-> decision end indices, predictions (nd x 8), realised (nd x 8)"""
    zL = zwin(Lseries, ends_all); zN = ZN
    if variant == 'A': Z = zL
    elif variant == 'C': Z = zN
    else: Z = np.concatenate([zL, zN], axis=1)
    okw = np.isfinite(Z).all(axis=1)
    lib = np.where(okw & np.isfinite(Rall).all(axis=1))[0]
    dec = np.where(okw & (G[ends_all] >= START) & (G[ends_all].hour % 2 == 0))[0]
    if decisions_mask is not None: dec = dec[decisions_mask[dec]]
    Zl = Z[lib]; dim = Z.shape[1]; preds = np.full((len(dec), len(HB)), np.nan)
    ends_l = ends_all[lib]
    for c0 in range(0, len(dec), 400):
        dd = dec[c0:c0 + 400]; S = Z[dd] @ Zl.T
        for r, i in enumerate(dd):
            cut = np.searchsorted(ends_l, ends_all[i] - 192, side='right')       # library windows ending at least 48 h before t
            if cut < 60: continue
            s = S[r, :cut]; top = np.argpartition(-s, min(600, cut - 1))[:min(600, cut)]; top = top[np.argsort(-s[top])]
            picked = []
            for ci in top:
                e = ends_l[ci]
                if all(abs(e - ends_l[p]) >= SPACE for p in picked): picked.append(ci)
                if len(picked) == K: break
            if len(picked) < 5: continue
            preds[c0 + r] = Rall[lib[picked]].mean(0)
    real = Rall[dec]
    return dec, preds, real

def spearman(x, y):
    m = np.isfinite(x) & np.isfinite(y)
    return float(np.corrcoef(rankdata(x[m]), rankdata(y[m]))[0, 1]) if m.sum() > 50 else np.nan
def day_boot_p(x, y, days, B=2000):
    m = np.isfinite(x) & np.isfinite(y); rx, ry = rankdata(x[m]), rankdata(y[m]); d = np.asarray(days)[m]
    u, inv = np.unique(d, return_inverse=True); n = np.bincount(inv).astype(float)
    sx, sy = np.bincount(inv, rx), np.bincount(inv, ry); sxx, syy, sxy = np.bincount(inv, rx * rx), np.bincount(inv, ry * ry), np.bincount(inv, rx * ry)
    out = np.empty(B)
    for b in range(B):
        k = rng.integers(0, len(u), len(u)); N = n[k].sum(); a, c, e, f, g = sx[k].sum(), sy[k].sum(), sxx[k].sum(), syy[k].sum(), sxy[k].sum()
        out[b] = (N * g - a * c) / np.sqrt(max(N * e - a * a, 1e-9) * max(N * f - c * c, 1e-9))
    return float(np.mean(out <= 0))
ZN = zwin(Nv, ends_all)
md = ['# COG-ANALOG results', '', 'Registered in `forge/COG_ANALOG_PREREG.md` (b0ef5efd) before any analog was computed. K = 20 analogs 12 h apart, 12-hour window, library ends >= 48 h before each decision.', '']
res = {}
for v in ('A', 'B', 'C'):
    dec, pred, real = run(Lv, v)
    dts = G[ends_all[dec]]; expl = dts < SPLIT; days = np.array([t.date() for t in dts])
    res[v] = dict(dec=dec, pred=pred, real=real, expl=expl, days=days)
    print(v, len(dec), 'decisions', int(np.isfinite(pred[:, 0]).sum()), 'with predictions', flush=True)
rows = []
for v in ('A', 'B', 'C'):
    r = res[v]
    for j, hn in enumerate(HN):
        ice = spearman(r['pred'][r['expl'], j], r['real'][r['expl'], j]); icc = spearman(r['pred'][~r['expl'], j], r['real'][~r['expl'], j])
        pe = day_boot_p(r['pred'][r['expl'], j], r['real'][r['expl'], j], r['days'][r['expl']]); pc = day_boot_p(r['pred'][~r['expl'], j], r['real'][~r['expl'], j], r['days'][~r['expl']])
        m = np.isfinite(r['pred'][:, j]) & np.isfinite(r['real'][:, j]); hit = float(np.mean(np.sign(r['pred'][m, j]) == np.sign(r['real'][m, j])))
        base = float(np.mean(r['real'][m, j] > 0))
        rows.append(dict(v=v, h=hn, ic_e=ice, ic_c=icc, p_e=pe, p_c=pc, hit=hit, up=base, n=int(m.sum())))
T = pd.DataFrame(rows)
cand = T[T.v.isin(['A', 'B'])].copy(); ps = cand.p_e.values; order = np.argsort(ps); m_ = len(ps); adj = np.empty(m_); run_ = 1.0
for rank, idx in reversed(list(enumerate(order, 1))): run_ = min(run_, ps[idx] * m_ / rank); adj[idx] = run_
cand['p_bh'] = adj
Cc = T[T.v == 'C'].set_index('h').ic_c
cand['pass'] = (cand.ic_e > 0) & (cand.p_bh < 0.10) & (cand.ic_c > 0) & (cand.p_c < 0.05) & (cand.ic_c > cand.h.map(Cc))
md += ['## Out-of-sample scores', '', '| variant | lead | n | IC Explore | IC Confirm | Explore p | Confirm p | BH p | sign right | share up | pass |', '|---|---|---|---|---|---|---|---|---|---|---|']
for _, r in T.iterrows():
    cr = cand[(cand.v == r.v) & (cand.h == r.h)]
    bh = f'{cr.p_bh.iloc[0]:.3f}' if len(cr) else 'baseline'; pa = ('YES' if cr['pass'].iloc[0] else 'NO') if len(cr) else '-'
    md.append(f'| {r.v} | {r.h} | {r.n} | {r.ic_e:+.3f} | {r.ic_c:+.3f} | {r.p_e:.3f} | {r.p_c:.3f} | {bh} | {r.hit * 100:.1f}% | {r.up * 100:.1f}% | {pa} |')
md.append('')
# placebo for variant A
realmax = np.nanmax([T[(T.v == 'A') & (T.h == hn)].ic_c.iloc[0] for hn in HN]); realmax_e = np.nanmax([T[(T.v == 'A') & (T.h == hn)].ic_e.iloc[0] for hn in HN])
pmax_e, pmax_c = [], []
for k in range(60):
    shift = int(rng.integers(5, 61)) * 96; Lr = np.roll(Lv, shift)
    dec, pred, real = run(Lr, 'A'); dts = G[ends_all[dec]]; ex = dts < SPLIT
    pmax_e.append(np.nanmax([spearman(pred[ex, j], real[ex, j]) for j in range(len(HB))])); pmax_c.append(np.nanmax([spearman(pred[~ex, j], real[~ex, j]) for j in range(len(HB))]))
    if k % 10 == 9: print('placebo', k + 1, flush=True)
pmax_e, pmax_c = np.array(pmax_e), np.array(pmax_c)
cond = realmax > np.percentile(pmax_c, 95) and realmax_e > np.percentile(pmax_e, 95)
md += ['## Placebo (line rotated by a random whole number of days, 60 draws; maximum IC over the 8 leads)', '',
       f'Explore: real {realmax_e:+.3f}, placebo median {np.median(pmax_e):+.3f}, 95th {np.percentile(pmax_e, 95):+.3f}. Confirm: real {realmax:+.3f}, placebo median {np.median(pmax_c):+.3f}, 95th {np.percentile(pmax_c, 95):+.3f}.',
       f'**Registered verdict: analog read of the line leads Nasdaq = {"YES" if (cand["pass"].any() and cond) else "NO"}** ({int(cand["pass"].sum())} of {len(cand)} cells pass; placebo condition {"met" if cond else "not met"}).', '']
# demonstration at the latest line bar
i_q = L_LAST - (L_LAST % 4)                                                         # last whole hour at or before the last line bar
while not (whole[i_q]): i_q -= 1
zq = zwin(Lv, np.array([i_q]))[0]
zL = zwin(Lv, ends_all); okw = np.isfinite(zL).all(axis=1) & np.isfinite(Rall).all(axis=1) & (ends_all < i_q - 192)
lib = np.where(okw)[0]; s = zL[lib] @ zq; top = np.argsort(-s); picked = []
for ci in top:
    e = ends_all[lib[ci]]
    if all(abs(e - ends_all[lib[p]]) >= SPACE for p in picked): picked.append(ci)
    if len(picked) == K: break
Rp = Rall[lib[picked]]
md += ['## Demonstration: the latest line window', '', f'Query window ends {G[i_q]:%Y-%m-%d %H:%M} UTC (last line data on disk; Nasdaq outcomes are only known for library windows up to {G[N_LAST]:%Y-%m-%d}). {len(picked)} analogs; mean similarity (correlation) {np.mean(s[picked]) / W:+.2f}.', '',
       '| lead | median analog move % | quartiles % | share of analogs up | scored IC out of sample (variant A) |', '|---|---|---|---|---|']
for j, hn in enumerate(HN):
    q = np.percentile(Rp[:, j], [25, 75]); ica = T[(T.v == 'A') & (T.h == hn)].ic_c.iloc[0]
    md.append(f'| {hn} | {np.median(Rp[:, j]):+.2f} | {q[0]:+.2f} to {q[1]:+.2f} | {np.mean(Rp[:, j] > 0) * 100:.0f}% | {ica:+.3f} |')
md += ['', 'Read the last column first: it is how much a read at that lead has been worth on data it had not seen.', '']
OUT.write_text('\n'.join(md) + '\n', encoding='utf-8')
print('\n'.join(md))
