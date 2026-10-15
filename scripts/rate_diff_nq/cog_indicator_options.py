"""COG-INDICATOR-OPTIONS (forge/COG_INDICATOR_OPTIONS_PREREG.md): range position / z-score / EMA slope of the line vs Nasdaq's next 1h-24h.
    python scripts/rate_diff_nq/cog_indicator_options.py  -> analysis/output/cog_video_0918/INDICATOR_OPTIONS.md
"""
from pathlib import Path
import numpy as np, pandas as pd
from scipy import stats
ROOT = Path(__file__).resolve().parents[2]; OUT = ROOT / 'analysis' / 'output' / 'cog_video_0918' / 'INDICATOR_OPTIONS.md'

def ld(p):
    d = pd.read_parquet(p); d['time'] = pd.to_datetime(d['time'], utc=True); return d.set_index('time').sort_index()
def r15(p):
    g = ld(p)['close'].resample('15min', label='right', closed='right'); l, n = g.last(), g.count(); l[n < 5] = np.nan; return 100 - l
D = ROOT / 'analysis' / 'output' / 'stir_1m_deep'
G = pd.date_range('2024-04-15', '2026-10-15', freq='15min', tz='UTC')
us, eu = r15(D / 'CME_SR3U6.parquet').reindex(G), r15(D / 'ICEEU_IH7.parquet').reindex(G)
day = pd.Series(G.date, index=G)
dist = lambda s: s.groupby(day.values).agg(lambda x: x.dropna().nunique())
ds, de = dist(us), dist(eu)
good = np.array([ds.get(d, 0) >= 3 and de.get(d, 0) >= 3 for d in day.values])
x = ((us - eu) * 100).where(good)
cfd = pd.read_parquet(ROOT / 'VolRangeForecaster' / 'data' / 'm1' / 'nq_m1.parquet')['close']; cfd.index = pd.to_datetime(cfd.index, utc=True)
cl = np.log(cfd.resample('15min', label='right', closed='right').last()).reindex(G)
fut = pd.read_parquet(ROOT / 'analysis' / 'output' / 'rate_curve_structure' / 'bars15.parquet')['NQ']; fut.index = pd.to_datetime(fut.index, utc=True); fut = fut.reindex(G)
sp_i = cl.last_valid_index(); off = cl.loc[sp_i] - fut.loc[:sp_i].dropna().iloc[-1]
nq = cl.copy(); aft = G > sp_i; nq[aft] = fut[aft] + off

feat = {}
for L in (96, 480, 1920):
    mp = int(0.6 * L); r = x.rolling(L, min_periods=mp)
    feat[f'pos_{L}'] = (x - r.min()) / (r.max() - r.min()); feat[f'z_{L}'] = (x - r.mean()) / r.std()
sd = x.diff().rolling(480, min_periods=288).std()
xf = x.ffill(limit=8)                                                                  # EMA needs a continuous series; short gaps carried, long gaps left empty
for f, s in ((8, 32), (32, 128)):
    feat[f'slope_{f}_{s}'] = (xf.ewm(span=f, adjust=False).mean() - xf.ewm(span=s, adjust=False).mean()) / sd
    feat[f'slope_{f}_{s}'] = feat[f'slope_{f}_{s}'].where(x.notna())
H = (4, 16, 32, 96)
own4, own16 = (nq - nq.shift(4)) * 100, (nq - nq.shift(16)) * 100
SPLIT = pd.Timestamp('2025-11-01', tz='UTC'); dkey = pd.Series(G.date, index=G)

def cluster_ols(y, f, controls, groups):
    m = y.notna() & f.notna() & controls.notna().all(axis=1)
    if m.sum() < 500: return np.nan, np.nan, np.nan, int(m.sum())
    y, f, c, g = y[m], f[m], controls[m], groups[m]
    z = lambda s: (s - s.mean()) / s.std()
    X = np.column_stack([np.ones(len(y)), z(f).values, z(c.iloc[:, 0]).values, z(c.iloc[:, 1]).values]); yv = z(y).values
    XtXi = np.linalg.inv(X.T @ X); b = XtXi @ X.T @ yv; e = yv - X @ b
    S = np.zeros((X.shape[1],) * 2)
    for _, idx in pd.Series(np.arange(len(y))).groupby(g.values):
        sc = X[idx.values].T @ e[idx.values]; S += np.outer(sc, sc)
    V = XtXi @ S @ XtXi; se = np.sqrt(V[1, 1]); ncl = g.nunique()
    return b[1], b[1] / se, 2 * stats.t.sf(abs(b[1] / se), max(1, ncl - 4)), int(m.sum())

rows = []; ctrl = pd.concat([own4, own16], axis=1)
for name, f in feat.items():
    for h in H:
        y = (nq.shift(-h) - nq) * 100
        be, te, pe, ne = cluster_ols(y[G < SPLIT], f[G < SPLIT], ctrl[G < SPLIT], dkey[G < SPLIT])
        bc, tc, pc, nc = cluster_ols(y[G >= SPLIT], f[G >= SPLIT], ctrl[G >= SPLIT], dkey[G >= SPLIT])
        p1 = stats.t.sf(tc * np.sign(be), 200) if np.isfinite(tc) and np.isfinite(be) else 1.0
        rows.append(dict(feature=name, H=f'{h * 15 // 60}h', beta_e=be, t_e=te, n_e=ne, beta_c=bc, t_c=tc, n_c=nc, p_e=pe, p_c1=p1))
T = pd.DataFrame(rows); pv = T['p_e'].fillna(1.0).values
o = np.argsort(pv); m = len(T); thr = 0.10 * np.arange(1, m + 1) / m; ok = pv[o] <= thr; passk = np.zeros(m, bool)
if ok.any(): passk[o[:np.max(np.where(ok)[0]) + 1]] = True
T['fdr_explore'] = passk; T['confirmed'] = T['fdr_explore'] & (np.sign(T.beta_c) == np.sign(T.beta_e)) & (T.p_c1 < 0.05)
fm = T.copy()
for c in ('beta_e', 'beta_c'): fm[c] = fm[c].map(lambda v: '' if pd.isna(v) else f'{v:+.3f}')
for c in ('t_e', 't_c'): fm[c] = fm[c].map(lambda v: '' if pd.isna(v) else f'{v:+.2f}')
for c in ('p_e', 'p_c1'): fm[c] = fm[c].map(lambda v: f'{v:.3f}')
txt = ['# COG-INDICATOR-OPTIONS results', '', 'Run once per forge/COG_INDICATOR_OPTIONS_PREREG.md. Standardised coefficient of Nasdaq next-H return on the feature (controls: Nasdaq previous 1 h and 4 h returns), date-clustered. Explore to 2025-10-31, confirm from 2025-11-03.', '',
       fm.to_markdown(index=False), '', f'Cells passing FDR 10% in explore: {int(T.fdr_explore.sum())} of {len(T)}; confirmed: {int(T.confirmed.sum())}.',
       f'Largest |t| explore {T.t_e.abs().max():.2f}, confirm {T.t_c.abs().max():.2f}.']
OUT.write_text('\n'.join(txt), encoding='utf-8'); print('\n'.join(txt))
