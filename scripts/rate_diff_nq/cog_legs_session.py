"""COG-LEGS-SESSION (forge/COG_LEGS_SESSION_PREREG.md): each leg's move in the Asian / European morning vs Nasdaq's later session.
    python scripts/rate_diff_nq/cog_legs_session.py     -> analysis/output/cog_video_0918/LEGS_SESSION.md
"""
from pathlib import Path
import numpy as np, pandas as pd
from scipy import stats
ROOT = Path(__file__).resolve().parents[2]; OUT = ROOT / 'analysis' / 'output' / 'cog_video_0918' / 'LEGS_SESSION.md'
rng = np.random.default_rng(7)

def ld(p):
    d = pd.read_parquet(p); d['time'] = pd.to_datetime(d['time'], utc=True); return d.set_index('time').sort_index()
def r15(p):
    g = ld(p)['close'].resample('15min', label='right', closed='right'); l, n = g.last(), g.count(); l[n < 5] = np.nan; return 100 - l
D = ROOT / 'analysis' / 'output' / 'stir_1m_deep'
us, eu = r15(D / 'CME_SR3U6.parquet') * 100, r15(D / 'ICEEU_IH7.parquet') * 100          # bp
G = pd.date_range('2024-04-15', '2026-10-15', freq='15min', tz='UTC')
us, eu = us.reindex(G), eu.reindex(G)
day = pd.Series(G.date, index=G)
dist = lambda s: s.groupby(day.values).agg(lambda x: x.dropna().nunique())
ds, de = dist(us), dist(eu)
good = np.array([ds.get(d, 0) >= 3 and de.get(d, 0) >= 3 for d in day.values]); us, eu = us.where(good), eu.where(good)
cfd = pd.read_parquet(ROOT / 'VolRangeForecaster' / 'data' / 'm1' / 'nq_m1.parquet')['close']; cfd.index = pd.to_datetime(cfd.index, utc=True)
cl = np.log(cfd.resample('15min', label='right', closed='right').last()).reindex(G)
fut = pd.read_parquet(ROOT / 'analysis' / 'output' / 'rate_curve_structure' / 'bars15.parquet')['NQ']; fut.index = pd.to_datetime(fut.index, utc=True); fut = fut.reindex(G)
sp_i = cl.last_valid_index(); off = cl.loc[sp_i] - fut.loc[:sp_i].dropna().iloc[-1]
nq = cl.copy(); aft = G > sp_i; nq[aft] = fut[aft] + off      # fut is a cumulative log series; continues the CFD by its log moves (as build_cog_history.py)

def at(s, d, hhmm, add_days=0):
    ts = pd.Timestamp(f'{d} {hhmm}', tz='UTC') + pd.Timedelta(days=add_days)
    return s.get(ts, np.nan)
days = sorted(set(G.date)); rows = []
for d in days:
    if pd.Timestamp(d).weekday() >= 5: continue
    prev = (pd.Timestamp(d) - pd.Timedelta(days=1 if pd.Timestamp(d).weekday() else 3)).date()
    r = dict(d=d)
    for name, s, mult in (('us', us, 1), ('eu', eu, 1), ('sp', us - eu, 1)):
        r[f'asia_{name}'] = at(s, d, '07:00') - at(s, prev, '22:00')
        r[f'eum_{name}'] = at(s, d, '13:00') - at(s, d, '07:00')
    r['nq_asia'] = (at(nq, d, '07:00') - at(nq, prev, '22:00')) * 100
    r['nq_eum'] = (at(nq, d, '13:00') - at(nq, d, '07:00')) * 100
    r['O0'] = (at(nq, d, '13:00') - at(nq, d, '07:00')) * 100
    r['O1'] = (at(nq, d, '20:00') - at(nq, d, '14:30')) * 100
    r['O2'] = (at(nq, d, '16:00') - at(nq, d, '14:30')) * 100
    rows.append(r)
R = pd.DataFrame(rows).set_index('d'); R.index = pd.to_datetime(R.index)
SPLIT = pd.Timestamp('2025-11-01')

def rho_t(x, y):
    m = x.notna() & y.notna(); x, y = x[m], y[m]
    if len(x) < 30 or x.std() == 0: return np.nan, np.nan, len(x)
    r = stats.spearmanr(x, y).statistic; n = len(x); t = r * np.sqrt((n - 2) / max(1e-9, 1 - r * r)); return r, t, n
def partial(y, x):
    m = x.notna() & y.notna(); b = np.polyfit(x[m], y[m], 1); out = y.copy(); out[m] = y[m] - np.polyval(b, x[m]); return out

cells = []
for pred, outs in (('eum', ('O1', 'O2')), ('asia', ('O0', 'O1'))):
    for ser in ('us', 'eu', 'sp'):
        for o in outs: cells.append((pred, ser, o))
E, C = R[R.index < SPLIT], R[R.index >= SPLIT]
res = []
for pred, ser, o in cells:
    x = f'{pred}_{ser}'; re, te, ne = rho_t(E[x], E[o]); rc, tc, nc = rho_t(C[x], C[o])
    pe = 2 * stats.t.sf(abs(te), max(1, ne - 2)) if np.isfinite(te) else 1.0
    pc1 = stats.t.sf(tc * np.sign(re), max(1, nc - 2)) if np.isfinite(tc) and np.isfinite(re) else 1.0   # one-sided in explore's direction
    # same-window link and control for Nasdaq's own move over the predictor window
    own = 'nq_eum' if pred == 'eum' else 'nq_asia'
    same = rho_t(R[x], R[own])[0]
    rp = rho_t(partial(R[o], R[own]), R[x])[0] if pred == 'eum' else np.nan
    # placebo: shuffle outcome across days within calendar month
    allm = R[[x, o]].dropna(); gm = allm.index.to_period('M'); real = abs(rho_t(allm[x], allm[o])[0]); cnt = 0; K = 1000
    for _ in range(K):
        sh = allm[o].copy()
        for g in set(gm): idx = np.where(gm == g)[0]; sh.iloc[idx] = allm[o].iloc[rng.permutation(idx)].values
        cnt += abs(rho_t(allm[x], sh)[0]) >= real
    res.append(dict(pred=pred, series=ser, out=o, rho_e=re, t_e=te, n_e=ne, rho_c=rc, t_c=tc, n_c=nc, p_e=pe, p_c1=pc1, same_window=same, rho_partial=rp, placebo_p=(cnt + 1) / (K + 1)))
T = pd.DataFrame(res)
# BH-FDR 10% across the 12 explore p-values
o = np.argsort(T['p_e'].values); m = len(T); thr = 0.10 * (np.arange(1, m + 1)) / m
passk = np.zeros(m, bool); ok = T['p_e'].values[o] <= thr
if ok.any(): passk[o[:np.max(np.where(ok)[0]) + 1]] = True
T['fdr_explore'] = passk; T['confirmed'] = T['fdr_explore'] & (np.sign(T['rho_c']) == np.sign(T['rho_e'])) & (T['p_c1'] < 0.05)
fmt = T.copy()
for c in ('rho_e', 'rho_c', 'same_window', 'rho_partial'): fmt[c] = fmt[c].map(lambda v: '' if pd.isna(v) else f'{v:+.3f}')
for c in ('t_e', 't_c'): fmt[c] = fmt[c].map(lambda v: f'{v:+.2f}')
for c in ('p_e', 'p_c1', 'placebo_p'): fmt[c] = fmt[c].map(lambda v: f'{v:.3f}')
n_days = int(R[['eum_sp', 'O1']].dropna().shape[0])
txt = ['# COG-LEGS-SESSION results', '', 'Run once per forge/COG_LEGS_SESSION_PREREG.md. Explore to 2025-10-31, confirm from 2025-11-03.', '',
       f'Days with the European-morning spread and the US-session Nasdaq return both present: {n_days}. Explore n about {int(T.n_e.max())}, confirm n about {int(T.n_c.max())}; minimum detectable |rho| about 0.18.', '',
       fmt.to_markdown(index=False), '',
       f'Cells passing FDR 10% in explore: {int(T.fdr_explore.sum())} of {len(T)}; confirmed: {int(T.confirmed.sum())}.', '',
       'same_window = rho of the predictor with Nasdaq over the SAME window (the known concurrent link). rho_partial = European-morning rows only: predictor vs outcome after removing the part of the outcome explained by Nasdaq own morning move. placebo_p = share of 1000 within-month shuffles with |rho| at least as large.']
OUT.write_text('\n'.join(txt), encoding='utf-8'); print('\n'.join(txt))
