"""COG-MEETING-PATH (forge/COG_MEETING_PATH_PREREG.md): the 30-day fed funds strip (ZQ) vs Nasdaq's next 1h-24h.
    python scripts/rate_diff_nq/cog_meeting_path.py  -> analysis/output/cog_video_0918/MEETING_PATH.md
"""
from pathlib import Path
import numpy as np, pandas as pd
from scipy import stats
ROOT = Path(__file__).resolve().parents[2]; OUT = ROOT / 'analysis' / 'output' / 'cog_video_0918' / 'MEETING_PATH.md'
D = ROOT / 'analysis' / 'output' / 'stir_1m_meeting'

def ld(p):
    d = pd.read_parquet(p); d['time'] = pd.to_datetime(d['time'], utc=True); return d.set_index('time').sort_index()
def r15(p):
    g = ld(p)['close'].resample('15min', label='right', closed='right'); l, n = g.last(), g.count(); l[n < 5] = np.nan; return (100 - l) * 100   # bp
zq = {m: r15(next(D.glob(f'CBOT_ZQ{m}.parquet'))) for m in ('X6', 'Z6', 'F7', 'H7')}
t0 = max(s.first_valid_index() for s in zq.values()).floor('D') + pd.Timedelta(days=7); t1 = min(s.last_valid_index() for s in zq.values())
G = pd.date_range(t0, t1.ceil('D'), freq='15min', tz='UTC'); zq = {k: v.reindex(G) for k, v in zq.items()}
S = pd.DataFrame({'nov': zq['X6'], 'dec': zq['Z6'] - zq['X6'], 'jan': zq['F7'] - zq['Z6'], 'far': zq['H7'] - zq['X6']}); S = S.dropna()
S = S.reindex(G)
cfd = pd.read_parquet(ROOT / 'VolRangeForecaster' / 'data' / 'm1' / 'nq_m1.parquet')['close']; cfd.index = pd.to_datetime(cfd.index, utc=True)
cl = np.log(cfd.resample('15min', label='right', closed='right').last()).reindex(G)
fut = pd.read_parquet(ROOT / 'analysis' / 'output' / 'rate_curve_structure' / 'bars15.parquet')['NQ']; fut.index = pd.to_datetime(fut.index, utc=True); fut = fut.reindex(G)
sp_i = cl.last_valid_index(); off = cl.loc[sp_i] - fut.loc[:sp_i].dropna().iloc[-1]
nq = cl.copy(); aft = G > sp_i; nq[aft] = fut[aft] + off
SPLIT = pd.Timestamp('2025-11-01', tz='UTC'); dkey = pd.Series(G.date, index=G)
own4, own16 = (nq - nq.shift(4)) * 100, (nq - nq.shift(16)) * 100; ctrl = pd.concat([own4, own16], axis=1)

def cluster_ols(y, f, c, g):
    m = y.notna() & f.notna() & c.notna().all(axis=1)
    if m.sum() < 400: return np.nan, np.nan, np.nan, int(m.sum())
    y, f, c, g = y[m], f[m], c[m], g[m]; z = lambda s: (s - s.mean()) / s.std()
    if f.std() == 0: return np.nan, np.nan, np.nan, int(m.sum())
    X = np.column_stack([np.ones(len(y)), z(f).values, z(c.iloc[:, 0]).values, z(c.iloc[:, 1]).values]); yv = z(y).values
    XtXi = np.linalg.inv(X.T @ X); b = XtXi @ X.T @ yv; e = yv - X @ b; Sm = np.zeros((4, 4))
    for _, idx in pd.Series(np.arange(len(y))).groupby(g.values):
        sc = X[idx.values].T @ e[idx.values]; Sm += np.outer(sc, sc)
    V = XtXi @ Sm @ XtXi; se = np.sqrt(V[1, 1]); t = b[1] / se
    return b[1], t, 2 * stats.t.sf(abs(t), max(1, g.nunique() - 4)), int(m.sum())

Ws = {'1h': 4, '4h': 16, '24h': 96}; Hs = {'1h': 4, '4h': 16, '8h': 32, '24h': 96}
def run(Sx, tag):
    rows = []
    for nm in Sx.columns:
        for wn, w in Ws.items():
            f = Sx[nm] - Sx[nm].shift(w)
            for hn, h in Hs.items():
                y = (nq.shift(-h) - nq) * 100
                be, te, pe, ne = cluster_ols(y[G < SPLIT], f[G < SPLIT], ctrl[G < SPLIT], dkey[G < SPLIT])
                bc, tc, pc, nc = cluster_ols(y[G >= SPLIT], f[G >= SPLIT], ctrl[G >= SPLIT], dkey[G >= SPLIT])
                p1 = stats.t.sf(tc * np.sign(be), 200) if np.isfinite(tc) and np.isfinite(be) else 1.0
                sw = stats.pearsonr(*(lambda a, b: (a[a.notna() & b.notna()], b[a.notna() & b.notna()]))(f, (nq - nq.shift(w)) * 100))[0]
                rows.append(dict(series=nm, W=wn, H=hn, beta_e=be, t_e=te, n_e=ne, beta_c=bc, t_c=tc, n_c=nc, p_e=pe, p_c1=p1, same_window=sw))
    T = pd.DataFrame(rows); pv = T['p_e'].fillna(1.0).values; o = np.argsort(pv); m = len(T); ok = pv[o] <= 0.10 * np.arange(1, m + 1) / m; pk = np.zeros(m, bool)
    if ok.any(): pk[o[:np.max(np.where(ok)[0]) + 1]] = True
    T['fdr_explore'] = pk; T['confirmed'] = pk & (np.sign(T.beta_c) == np.sign(T.beta_e)) & (T.p_c1 < 0.05); return T
T = run(S, 'real')
# time-shift placebo: predictor shifted by 30 days of bars
Sp = S.shift(30 * 96); Tp = run(Sp, 'placebo'); nominal = int((Tp.p_e < 0.05).sum()); nominal_real = int((T.p_e < 0.05).sum())

# F2 jump bars
d15 = S.diff(); jump_stat = d15['dec'].abs() + d15['nov'].abs(); thr = jump_stat.rolling(60 * 96, min_periods=20 * 96).quantile(0.98).shift(1)
jb = jump_stat > thr; net = d15['far'].where(jb); hod = pd.Series(G.hour * 4 + G.minute // 15, index=G)
F2 = []
for hn, h in (('1h', 4), ('4h', 16)):
    y = (nq.shift(-h) - nq) * 100
    for half, mk in (('explore', G < SPLIT), ('confirm', G >= SPLIT)):
        ev = jb & mk & net.notna() & y.notna() & (net != 0); s = np.sign(net[ev]); r = y[ev] * s
        base = y[mk & y.notna()].groupby(hod[mk & y.notna()]).mean(); adj = r - base.reindex(hod[ev].values).values * s.values
        dd = pd.Series(adj.values, index=dkey[ev].values).groupby(level=0).mean()
        t = dd.mean() / (dd.std() / np.sqrt(len(dd))) if len(dd) > 3 else np.nan
        F2.append(dict(H=hn, half=half, events=int(ev.sum()), event_days=len(dd), mean_signed_pct=float(adj.mean()) if len(adj) else np.nan, t=t))
F2 = pd.DataFrame(F2)

def fmt(df):
    f = df.copy()
    for c in f.columns:
        if f[c].dtype == float: f[c] = f[c].map(lambda v: '' if pd.isna(v) else (f'{v:.3f}' if c.startswith('p') else f'{v:+.3f}'))
    return f
txt = ['# COG-MEETING-PATH results', '', f'Run once per forge/COG_MEETING_PATH_PREREG.md. Window {G[0]:%Y-%m-%d} to {G[-1]:%Y-%m-%d}; explore to 2025-10-31, confirm from 2025-11-03.', '',
       f'ZQ series: X6, Z6, F7, H7 (bp, 15-minute). Strip series available bars: {int(S.notna().all(axis=1).sum()):,}.', '',
       '## F1 (48 cells; standardised coefficient of Nasdaq next-H return on the predictor change over W; controls: Nasdaq previous 1 h and 4 h; date-clustered)', '',
       fmt(T).to_markdown(index=False), '', f'Cells passing FDR 10% in explore: {int(T.fdr_explore.sum())} of {len(T)}; confirmed: {int(T.confirmed.sum())}. Largest |t| explore {T.t_e.abs().max():.2f}, confirm {T.t_c.abs().max():.2f}.', '',
       f'Time-shift placebo (predictor shifted 30 days): {nominal} of {len(Tp)} cells nominal p<0.05 in explore (2.4 expected by chance); real series: {nominal_real} of {len(T)}.', '',
       f'Same-window link (predictor over W vs Nasdaq over the same W): range {T.same_window.min():+.2f} to {T.same_window.max():+.2f} across cells.', '',
       '## F2 (jump bars: top 2% of |change in S_nov| + |change in S_dec| vs the previous 60 trading days; signed by the net change of S_far; Nasdaq signed return after the bar minus hour-of-day mean)', '', fmt(F2).to_markdown(index=False)]
OUT.write_text('\n'.join(txt), encoding='utf-8'); print('\n'.join(txt))
