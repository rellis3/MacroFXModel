"""COG-TURN-EVENTS (forge/COG_TURN_EVENTS_PREREG.md): SOFR-Euribor turning points vs Nasdaq turns, breakouts and divergence.
    python scripts/rate_diff_nq/cog_turn_events.py [--placebo 200]
Outputs: analysis/output/cog_video_0918/TURN_EVENTS.md, turn_events_all.csv, turn_events_*.png
"""
import argparse, sys
from pathlib import Path
import numpy as np, pandas as pd
from scipy import stats
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
ROOT = Path(__file__).resolve().parents[2]; OUTD = ROOT / 'analysis' / 'output' / 'cog_video_0918'
ap = argparse.ArgumentParser(); ap.add_argument('--placebo', type=int, default=200); ap.add_argument('--own-only', action='store_true', help='Amendment B: controls exclude only bars near their OWN event'); ARGS = ap.parse_args()
import os
PAIR_US = os.environ.get('COG_US', 'CME_SR3U6'); PAIR_EU = os.environ.get('COG_EU', 'ICEEU_IH7'); MODE = os.environ.get('COG_MODE', 'spread'); TAG = os.environ.get('COG_TAG', ''); COG_END = os.environ.get('COG_END', ''); STRICT = os.environ.get('COG_STRICT', '') == '1'      # strict-causal timestamps: minute stamps -> minute ENDS (bar t holds only minutes that had ended by t)
if STRICT and not COG_END: COG_END = '2026-08-20'          # the CFD cache is the only Nasdaq source that can be rebuilt strictly
SUF = ('_ownctrl' if ARGS.own_only else '') + TAG
rng = np.random.default_rng(11)

# ---------------------------------------------------------------- data (research series only: bp, close-labelled, no display transforms)
def ld(p):
    d = pd.read_parquet(p); d['time'] = pd.to_datetime(d['time'], utc=True); return d.set_index('time').sort_index()
def r15(p):
    c_ = ld(p)['close']
    if STRICT: c_.index = c_.index + pd.Timedelta(minutes=1)
    g = c_.resample('15min', label='right', closed='right'); l, n = g.last(), g.count(); l[n < 5] = np.nan; return 100 - l
DEEP = ROOT / 'analysis' / 'output' / 'stir_1m_deep'
G = pd.date_range('2024-04-15', '2026-10-09 23:45', freq='15min', tz='UTC'); N = len(G)
dayv = G.date; ser_day = pd.Series(dayv, index=G)
dist = lambda s: s.groupby(dayv).agg(lambda v: v.dropna().nunique())
if MODE == 'spread':
    us, eu = r15(DEEP / f'{PAIR_US}.parquet').reindex(G), r15(DEEP / f'{PAIR_EU}.parquet').reindex(G)
    ds, de = dist(us), dist(eu); good = np.array([ds.get(d, 0) >= 3 and de.get(d, 0) >= 3 for d in dayv])
    X = (((us - eu) * 100).where(good)).to_numpy()            # raw: ((100 - price_US) - (100 - price_EU)) x 100, in bp; no scale, offset, inversion, smoothing or plot lead
else:                                                           # a single leg alone: its own rate in bp
    leg = r15(DEEP / f'{PAIR_US if MODE == "us" else PAIR_EU}.parquet').reindex(G); us = eu = leg
    dl = dist(leg); good = np.array([dl.get(d, 0) >= 3 for d in dayv]); X = ((leg * 100).where(good)).to_numpy()
if COG_END: X[np.asarray(G > pd.Timestamp(COG_END, tz='UTC') + pd.Timedelta(days=1))] = np.nan      # window cut at the earlier of the legs' last-trade dates
cfd = pd.read_parquet(ROOT / 'VolRangeForecaster' / 'data' / 'm1' / 'nq_m1.parquet')['close']; cfd.index = pd.to_datetime(cfd.index, utc=True)
if STRICT: cfd.index = cfd.index + pd.Timedelta(minutes=1)
cl = np.log(cfd.resample('15min', label='right', closed='right').last()).reindex(G)
fut = pd.read_parquet(ROOT / 'analysis' / 'output' / 'rate_curve_structure' / 'bars15.parquet')['NQ']; fut.index = pd.to_datetime(fut.index, utc=True); fut = fut.reindex(G)
sp_i = cl.last_valid_index(); off = cl.loc[sp_i] - fut.loc[:sp_i].dropna().iloc[-1]
nq = cl.copy(); nq[G > sp_i] = fut[G > sp_i] + off; Y = nq.to_numpy()
hour = G.hour.to_numpy() + (G.minute.to_numpy() > 0) * 0          # confirm bar END hour (UTC)
SPLITS = {'IS': (pd.Timestamp('2024-04-15', tz='UTC'), pd.Timestamp('2025-04-01', tz='UTC')), 'VAL': (pd.Timestamp('2025-04-01', tz='UTC'), pd.Timestamp('2026-01-01', tz='UTC')), 'OOS': (pd.Timestamp('2026-01-01', tz='UTC'), pd.Timestamp('2026-10-10', tz='UTC'))}
half_of = np.full(N, '', dtype=object)
for k, (a, b) in SPLITS.items(): half_of[(G >= a) & (G < b)] = k
VIDEO = (G >= pd.Timestamp('2026-09-16', tz='UTC')) & (G < pd.Timestamp('2026-09-24', tz='UTC'))        # case study only: excluded from pooled statistics

def theta_base(a):
    """RMS of 4 h (16-bar) changes over the previous 20 calendar days (>=10 with data), as a per-bar array."""
    s = pd.Series(a, index=G); d16 = s - s.shift(16); ms = (d16 ** 2).groupby(dayv).mean()
    cal = pd.date_range(ms.index.min(), ms.index.max(), freq='D'); ms.index = pd.to_datetime(ms.index); ms = ms.reindex(cal)
    r = np.sqrt(ms.rolling(20, min_periods=10).mean().shift(1)); return r.reindex(pd.to_datetime(dayv)).to_numpy()
def zigzag(x, base, k):
    n = len(x); state = np.full(n, np.nan); ev = []; trend = 0; hi = lo = np.nan; hi_i = lo_i = ext_i = -1; ext = np.nan
    for t in range(n):
        v = x[t]; th = k * base[t]
        if not np.isfinite(v) or not np.isfinite(th) or th <= 0: continue
        if trend == 0:
            if not np.isfinite(hi): hi = lo = v; hi_i = lo_i = t
            if v > hi: hi, hi_i = v, t
            if v < lo: lo, lo_i = v, t
            if v - lo >= th: trend = 1; ev.append((t, lo_i, 1)); ext, ext_i = v, t
            elif hi - v >= th: trend = -1; ev.append((t, hi_i, -1)); ext, ext_i = v, t
        elif trend == 1:
            if v > ext: ext, ext_i = v, t
            elif ext - v >= th: trend = -1; ev.append((t, ext_i, -1)); ext, ext_i = v, t
        else:
            if v < ext: ext, ext_i = v, t
            elif v - ext >= th: trend = 1; ev.append((t, ext_i, 1)); ext, ext_i = v, t
        if trend != 0: state[t] = trend
    return state, ev

BN = theta_base(Y)                                      # Nasdaq 4h RMS (unit u = 0.75 * BN)
ZN, EVN = zigzag(Y, BN, 0.75)
ys = pd.Series(Y, index=G)
ret1h = (ys - ys.shift(4)).to_numpy(); ret4h = (ys - ys.shift(16)).to_numpy(); ret24h = (ys - ys.shift(96)).to_numpy()
rng8 = (ys.rolling(8).max() - ys.rolling(8).min())
rng8_q30 = rng8.rolling('20D', min_periods=500, closed='left').quantile(0.30).to_numpy(); rng8 = rng8.to_numpy()
consol = np.isfinite(rng8) & np.isfinite(rng8_q30) & (rng8 <= rng8_q30)
Qb = pd.qcut(pd.Series(ret1h).rank(method='first'), 5, labels=False).to_numpy()          # Nasdaq trailing-1h quintile (nan where missing)
H_LIST = (1, 2, 4, 8, 16, 32, 96); PH = 8; FDR_Q = 0.10

# ---------------------------------------------------------------- events
def line_events(xarr, k):
    base = theta_base(xarr); z, ev = zigzag(xarr, base, k); return z, ev
def divergence_events(xarr):
    s = pd.Series(xarr, index=G); d4 = (s - s.shift(16)); ad = d4.abs()
    q90 = ad.rolling('20D', min_periods=500, closed='left').quantile(0.90).to_numpy(); ad = ad.to_numpy(); d4 = d4.to_numpy()
    nabs = np.abs(ret4h); nq30 = pd.Series(nabs, index=G).rolling('20D', min_periods=500, closed='left').quantile(0.30).to_numpy()
    out = []; last = -10 ** 9
    for i in range(N):
        if i - last < 16: continue
        if np.isfinite(ad[i]) and np.isfinite(q90[i]) and ad[i] >= q90[i] and np.isfinite(nabs[i]) and np.isfinite(nq30[i]) and nabs[i] <= nq30[i] and d4[i] != 0:
            out.append((i, i, int(np.sign(d4[i])))); last = i
    return out
def families(xarr, k, with_div=True):
    z, ev = line_events(xarr, k); F = {'A0': [], 'A1': [], 'A3': [], 'A2': [], 'A2m': [], 'A4': []}
    for (c, e, d) in ev:
        if not np.isfinite(Y[c]): continue
        F['A0'].append((c, e, d))
        if d == 1 and ZN[c] == -1: F['A1'].append((c, e, d))
        if d == -1 and ZN[c] == 1: F['A3'].append((c, e, d))
        if consol[c]:
            (F['A2'] if d == 1 else F['A2m']).append((c, e, d))
    if with_div: F['A4'] = [e for e in divergence_events(xarr) if np.isfinite(Y[e[0]])]
    return F, z, ev

# ---------------------------------------------------------------- outcomes
def outcome(i, d, h):
    if i + h >= N or not np.isfinite(Y[i]) or not np.isfinite(Y[i + h]): return None
    seg = Y[i + 1:i + h + 1]
    if np.isfinite(seg).mean() < 0.6: return None
    u = 0.75 * BN[i]
    path = (seg - Y[i]) * d; path = path[np.isfinite(path)]
    if not np.isfinite(u) or u <= 0 or len(path) == 0: return None
    up = np.where(path >= u)[0]; dn = np.where(path <= -u)[0]; fu = up[0] if len(up) else 10 ** 9; fd = dn[0] if len(dn) else 10 ** 9
    race = 1 if fu < fd else (-1 if fd < fu else 0)
    return dict(ret=(Y[i + h] - Y[i]) * d * 100, fav=race == 1, adv=race == -1, neu=race == 0, mfe=path.max() / u, mae=path.min() / u)
def ctrl_pool(blocked):
    ok = np.isfinite(Y) & np.isfinite(ZN) & np.isfinite(Qb) & ~blocked & (half_of != '') & ~VIDEO
    pool = {}
    for i in np.where(ok)[0]: pool.setdefault((int(ZN[i]), int(G[i].hour), int(Qb[i])), []).append(i)
    return {k: np.array(v) for k, v in pool.items()}
def controls_for(c, pool, K=20):
    if not (np.isfinite(ZN[c]) and np.isfinite(Qb[c])): return np.array([], int)
    cand = [pool.get((int(ZN[c]), (int(G[c].hour) + dh) % 24, int(Qb[c])), np.array([], int)) for dh in (-1, 0, 1)]
    cand = np.concatenate(cand); cand = cand[np.abs(cand - c) > 8]
    return rng.choice(cand, size=min(K, len(cand)), replace=False) if len(cand) else cand
def block_mask(events_idx):
    b = np.zeros(N, bool)
    for c in events_idx: b[max(0, c - 8):c + 9] = True
    return b
def effect_table(evs, pool, h, mask_fn=lambda c: True):
    rows = []
    for (c, e, d) in evs:
        if VIDEO[c] or half_of[c] == '' or not mask_fn(c): continue
        o = outcome(c, d, h)
        if o is None: continue
        cs = controls_for(c, pool); co = [outcome(j, d, h) for j in cs]; co = [x for x in co if x is not None]
        if len(co) < 5: continue
        rows.append(dict(i=c, day=str(G[c].date()), half=half_of[c], d=d, **{k: o[k] for k in ('ret', 'fav', 'adv', 'neu', 'mfe', 'mae')},
                         b_ret=np.mean([x['ret'] for x in co]), b_fav=np.mean([x['fav'] for x in co]), b_adv=np.mean([x['adv'] for x in co]), b_neu=np.mean([x['neu'] for x in co]), b_mfe=np.mean([x['mfe'] for x in co]), b_mae=np.mean([x['mae'] for x in co])))
    return pd.DataFrame(rows)
def boot(df, col, bcol, B=2000):
    """day-block bootstrap of mean(event - matched); returns mean, 95% CI, one-sided p (>0), n events, n days."""
    if df is None or len(df) < 5: return (np.nan,) * 3 + (np.nan, len(df) if df is not None else 0, 0)
    e = (df[col].astype(float) - df[bcol].astype(float)).to_numpy(); g = df['day'].to_numpy(); u, inv = np.unique(g, return_inverse=True)
    sums = np.bincount(inv, e); cnts = np.bincount(inv).astype(float); m = e.mean()
    idx = rng.integers(0, len(u), size=(B, len(u))); bm = sums[idx].sum(1) / cnts[idx].sum(1)
    return m, np.percentile(bm, 2.5), np.percentile(bm, 97.5), float((bm <= 0).mean()), len(e), len(u)

# ---------------------------------------------------------------- run
PAT = ['A0', 'A1', 'A3', 'A2', 'A2m', 'A4']
FAM, ZL, EVL = families(X, 0.75)
blocked = np.zeros(N, bool) if ARGS.own_only else block_mask([c for (c, e, d) in FAM['A0']]); POOL = ctrl_pool(blocked)
print({k: len(v) for k, v in FAM.items()}, 'line events k=.75; video-week excluded from pooled stats', flush=True)

# 1) event-study table, primary k, all horizons, by half
rows = []; TAB = {}
for p in PAT:
    for h in H_LIST:
        df = effect_table(FAM[p], POOL, h); TAB[(p, h)] = df
        for hf in ('IS', 'VAL', 'OOS', 'ALL'):
            sub = df if hf == 'ALL' else df[df.half == hf]
            for metric, col, bcol in (('ret%', 'ret', 'b_ret'), ('fav', 'fav', 'b_fav'), ('adv', 'adv', 'b_adv'), ('neu', 'neu', 'b_neu'), ('mfe_u', 'mfe', 'b_mfe'), ('mae_u', 'mae', 'b_mae')):
                m, lo, hi, p1, n, nd = boot(sub, col, bcol, B=1000 if hf == 'ALL' else 2000)
                raw = float(sub[col].astype(float).mean()) if len(sub) else np.nan
                rows.append(dict(pattern=p, H_bars=h, half=hf, metric=metric, n=n, days=nd, event_mean=raw, matched_diff=m, ci_lo=lo, ci_hi=hi, p_one_sided=p1))
ET = pd.DataFrame(rows); ET.to_csv(OUTD / f'turn_events_table{SUF}.csv', index=False)

# 2) lead: turn-to-turn timing
def lead_stats(evl):
    ne = [(c, e, d) for (c, e, d) in EVN]; res = []
    for (c, e, d) in evl:
        if VIDEO[c] or half_of[c] == '': continue
        same = [(c2, e2) for (c2, e2, d2) in ne if d2 == d]
        ext = [e2 - e for (c2, e2) in same if abs(e2 - e) <= 48]
        conf = [c2 - c for (c2, e2) in same if 0 <= c2 - c <= 48]
        res.append(dict(any_ext=len(ext) > 0, lead_ext=min(ext, key=abs) if ext else np.nan, any_conf_8h=len([x for x in conf if x <= 32]) > 0, conf_dt=min(conf) if conf else np.nan, d=d))
    return pd.DataFrame(res)
LEAD = lead_stats(FAM['A0'])
# 3) placebo (shifted line) on the pooled primary cell per pattern + lead stats
PL = {p: [] for p in PAT}; PLEAD = []
n_pl = ARGS.placebo
for r in range(n_pl):
    sh = int(rng.integers(5, 61)) * 96 * (1 if rng.random() < .5 else -1); xs = np.roll(X, sh)
    F2, z2, ev2 = families(xs, 0.75, with_div=True); ok = F2['A0']
    pool2 = POOL                                         # same control pool (controls avoid REAL events; negligible for placebo)
    for p in PAT:
        df = effect_table(F2[p][:400], pool2, PH)
        PL[p].append((df['ret'] - df['b_ret']).mean() if len(df) > 20 else np.nan)
    L2 = lead_stats(F2['A0']); PLEAD.append((L2['any_conf_8h'].mean(), np.nanmedian(L2['lead_ext'])))
    if r % 20 == 0: print('placebo', r, flush=True)

# 4) Nasdaq-only baseline + incremental information
def build_design(H):
    s = np.zeros(N)
    for (c, e, d) in FAM['A0']:
        s[c:min(N, c + 8)] = d
    rv = pd.Series(BN, index=G)
    r96 = ys.rolling(96, min_periods=48); pos96 = ((ys - r96.min()) / (r96.max() - r96.min())).to_numpy()
    fwd = (ys.shift(-H) - ys).to_numpy() * 100
    df = pd.DataFrame(dict(y=fwd, s=s, r1=ret1h * 100, r4=ret4h * 100, r24=ret24h * 100, rv=((rv - rv.mean()) / rv.std()).to_numpy(), pos=pos96, zs=ZN, day=dayv, half=half_of, vid=VIDEO), index=G)
    df = df[(df.half != '') & (~df.vid)].drop(columns='vid'); print('design H', H, 'rows before dropna', len(df), 'nan per col', df.isna().sum().to_dict(), flush=True); df = df.dropna(); return df
def cluster_fit(df, cols):
    Xm = np.column_stack([np.ones(len(df))] + [df[c].values for c in cols]); y = df['y'].values
    XtXi = np.linalg.inv(Xm.T @ Xm); b = XtXi @ Xm.T @ y; e = y - Xm @ b; S = np.zeros((Xm.shape[1],) * 2)
    for _, idx in pd.Series(np.arange(len(y))).groupby(df['day'].values):
        sc = Xm[idx.values].T @ e[idx.values]; S += np.outer(sc, sc)
    V = XtXi @ S @ XtXi; return b, np.sqrt(np.diag(V))
INC = []
base_cols = ['r1', 'r4', 'r24', 'rv', 'pos', 'zs']
for H in (4, 8):
    D = build_design(H)
    for hf in ('IS', 'VAL', 'OOS'):
        sub = D[D.half == hf]; b, se = cluster_fit(sub, base_cols + ['s']); INC.append(dict(H_bars=H, half=hf, coef_s=b[-1], t_s=b[-1] / se[-1], n_bars=len(sub), days=sub.day.nunique()))
    tr, te = D[D.half != 'OOS'], D[D.half == 'OOS']
    def r2(cols):
        b, _ = cluster_fit(tr, cols); Xt = np.column_stack([np.ones(len(te))] + [te[c].values for c in cols]); pred = Xt @ b
        return 1 - ((te['y'] - pred) ** 2).sum() / ((te['y'] - tr['y'].mean()) ** 2).sum()
    INC.append(dict(H_bars=H, half='OOS R2 without s / with s', coef_s=r2(base_cols), t_s=r2(base_cols + ['s']), n_bars=len(te), days=te.day.nunique()))
INC = pd.DataFrame(INC)

# 5) release-bar exclusion for the primary cells
import zoneinfo
NY = zoneinfo.ZoneInfo('America/New_York')
FOMC = {'2024-01-31', '2024-03-20', '2024-05-01', '2024-06-12', '2024-07-31', '2024-09-18', '2024-11-07', '2024-12-18', '2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18', '2025-07-30', '2025-09-17', '2025-10-29', '2025-12-10', '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16'}
def near_release(c):
    t = G[c].tz_convert(NY)
    if t.weekday() >= 5: return False
    for hh, mm, only_fomc in ((8, 30, False), (10, 0, False), (14, 0, True)):
        if only_fomc and t.strftime('%Y-%m-%d') not in FOMC: continue
        rel = t.replace(hour=hh, minute=mm, second=0); dt = (t - rel).total_seconds() / 60
        if 0 <= dt <= 30: return True
    return False
NOREL = {p: effect_table(FAM[p], POOL, PH, mask_fn=lambda c: not near_release(c)) for p in PAT}

# 6) strata (session x vol tercile) at the primary cell
def session(c):
    h = G[c].hour
    return 'Asia' if (h >= 22 or h < 7) else ('Europe' if h < 13 else 'US')
is_mask = (half_of == 'IS') & np.isfinite(BN); cuts = np.nanpercentile(BN[is_mask], [33.3, 66.7])
vol_t = lambda c: 'low' if BN[c] <= cuts[0] else ('mid' if BN[c] <= cuts[1] else 'high')
STR = []
for p in PAT:
    base_df = TAB[(p, PH)]
    if base_df is None or len(base_df) == 0: continue
    base_df = base_df.assign(sess=[session(i) for i in base_df.i], vol=[vol_t(i) for i in base_df.i])
    for s_ in ('Asia', 'Europe', 'US'):
        for v_ in ('low', 'mid', 'high'):
            for hf in ('VAL', 'OOS'):
                sub = base_df[(base_df.sess == s_) & (base_df.vol == v_) & (base_df.half == hf)]
                m, lo, hi, p1, n, nd = boot(sub, 'ret', 'b_ret', B=1000); STR.append(dict(pattern=p, session=s_, vol=v_, half=hf, n=n, days=nd, diff=m, p1=p1))
STR = pd.DataFrame(STR)

# ---------------------------------------------------------------- verdict (registered rule)
def cell(p, hf, metric):
    r = ET[(ET.pattern == p) & (ET.H_bars == PH) & (ET.half == hf) & (ET.metric == metric)]; return r.iloc[0] if len(r) else None
VERD = []
for p in ('A1', 'A2', 'A3', 'A2m', 'A4'):
    ok_ret = ok_race = True; notes = []
    for hf in ('VAL', 'OOS'):
        r = cell(p, hf, 'ret%'); f = cell(p, hf, 'fav'); a = cell(p, hf, 'adv')
        ok_ret &= bool(r is not None and r.matched_diff > 0 and r.p_one_sided < 0.05)
        racediff = (f.matched_diff - a.matched_diff) if (f is not None and a is not None) else np.nan
        ok_race &= bool(np.isfinite(racediff) and racediff > 0 and f.p_one_sided < 0.05)
    allr = cell(p, 'ALL', 'ret%'); pl = np.array([v for v in PL[p] if np.isfinite(v)])
    beats_placebo = bool(allr is not None and len(pl) > 20 and allr.matched_diff > np.percentile(pl, 95))
    s_ok = True
    for hf in ('VAL', 'OOS'):
        r = INC[(INC.H_bars == PH) & (INC.half == hf)]; s_ok &= bool(len(r) and abs(r.iloc[0].t_s) > 2 and np.sign(r.iloc[0].coef_s) == np.sign(INC[(INC.H_bars == PH) & (INC.half == 'VAL')].iloc[0].coef_s) and r.iloc[0].coef_s > 0)
    nr = NOREL[p]; nr_m = float((nr.ret - nr.b_ret).mean()) if len(nr) else np.nan
    VERD.append(dict(pattern=p, ret_ok=ok_ret, race_ok=ok_race, beats_placebo95=beats_placebo, s_t_significant=s_ok, no_release_effect=nr_m, robust=bool(ok_ret and ok_race and beats_placebo and s_ok and np.isfinite(nr_m) and nr_m > 0)))
VERD = pd.DataFrame(VERD)
fdrp = STR[STR.half.isin(['VAL', 'OOS'])].copy()
cond = []
for (p, s_, v_), g in STR.groupby(['pattern', 'session', 'vol']):
    gv, go = g[g.half == 'VAL'], g[g.half == 'OOS']
    if len(gv) and len(go) and gv.iloc[0]['diff'] > 0 and go.iloc[0]['diff'] > 0 and gv.iloc[0].p1 < 0.05 and go.iloc[0].p1 < 0.05 and gv.iloc[0].n >= 15 and go.iloc[0].n >= 15:
        cond.append(dict(pattern=p, session=s_, vol=v_, n_val=int(gv.iloc[0].n), n_oos=int(go.iloc[0].n), diff_val=gv.iloc[0]['diff'], diff_oos=go.iloc[0]['diff'], p_val=gv.iloc[0].p1, p_oos=go.iloc[0].p1))
COND = pd.DataFrame(cond)
n_strata_tested = STR.groupby(['pattern', 'session', 'vol']).ngroups
# BH-FDR 10% over strata using the max of val/oos p as the stratum's evidence
if len(COND):
    pv = COND[['p_val', 'p_oos']].max(axis=1).values; srt = np.argsort(pv); thr = FDR_Q * np.arange(1, n_strata_tested + 1)[:len(pv)] / n_strata_tested
    keep = np.zeros(len(pv), bool); okk = pv[srt] <= thr
    if okk.any(): keep[srt[:np.max(np.where(okk)[0]) + 1]] = True
    COND = COND[keep]
verdict = 'robust predictive relationship' if VERD.robust.any() else ('conditional relationship' if len(COND) else 'insufficient evidence')

# exploratory grid over k, all patterns, at PH, pooled all halves vs matched
EXP = []
for k in (0.5, 0.75, 1.0, 1.5, 2.5):
    Fk, _, _ = families(X, k, with_div=False)
    pool_k = ctrl_pool(np.zeros(N, bool) if ARGS.own_only else block_mask([c for (c, e, d) in Fk['A0']]))
    for p in ('A0', 'A1', 'A3', 'A2', 'A2m'):
        df = effect_table(Fk[p], pool_k, PH); m, lo, hi, p1, n, nd = boot(df, 'ret', 'b_ret', B=800); EXP.append(dict(k=k, pattern=p, n=n, days=nd, diff_ret=m, ci_lo=lo, ci_hi=hi, p1=p1))
EXP = pd.DataFrame(EXP)

# ---------------------------------------------------------------- figures
def fig_video():
    a, b = pd.Timestamp('2026-09-16', tz='UTC'), pd.Timestamp('2026-09-24', tz='UTC'); w = np.where((G >= a) & (G < b))[0]
    fig, ax = plt.subplots(2, 1, figsize=(15, 8), sharex=True)
    ax[0].plot(G[w], X[w], color='#3b6fd4', lw=1.4); ax[0].set_ylabel('SOFR Sep26 - Euribor Mar27 (bp, raw)')
    ax[1].plot(G[w], np.exp(Y[w]) if False else Y[w], color='#222', lw=1.2); ax[1].set_ylabel('Nasdaq (log, cum.)')
    ws = set(w.tolist())
    for (c, e, d) in FAM['A0']:
        if c in ws or e in ws:
            o = outcome(c, d, 8); col = '#888' if o is None else ('#1a8a5a' if o['fav'] else ('#c0392b' if o['adv'] else '#e0a800'))
            ax[0].plot(G[e], X[e], marker='^' if d == 1 else 'v', color=col, ms=9); ax[0].plot(G[c], X[c], marker='o', color=col, ms=5, mfc='none'); ax[0].plot([G[e], G[c]], [X[e], X[c]], color=col, lw=.6, ls=':')
            if np.isfinite(Y[c]): ax[1].plot(G[c], Y[c], marker='o', color=col, ms=5, mfc='none')
    for (c, e, d) in EVN:
        if c in ws or e in ws: ax[1].plot(G[e], Y[e], marker='^' if d == 1 else 'v', color='#6b5bb3', ms=7, alpha=.8)
    ax[0].set_title('Line turning points (triangle = when the high/low happened, circle = when it could first be known; green/red/amber = Nasdaq favourable/adverse/neither within 2 h by the +-u race). Purple triangles = Nasdaq turns.')
    ax[1].set_xlabel('UTC'); plt.tight_layout(); plt.savefig(OUTD / f'turn_events_video_week{SUF}.png', dpi=110); plt.close()
def fig_paths():
    fig, axs = plt.subplots(1, 3, figsize=(16, 4.6), sharey=False)
    for ax_, (title, evs) in zip(axs, (('All confirmed line turns (A0)', FAM['A0']), ('Up-turn while Nasdaq down (A1)', FAM['A1']), ('Up-turn while Nasdaq consolidating (A2)', FAM['A2']))):
        P, B = [], []
        for (c, e, d) in evs:
            if VIDEO[c] or half_of[c] == '' or c < 40 or c + 97 >= N or not np.isfinite(Y[c]): continue
            seg = (Y[c - 32:c + 97] - Y[c]) * d * 100
            if np.isfinite(seg).mean() < .7: continue
            cs = controls_for(c, POOL, K=8); bs = [(Y[j - 32:j + 97] - Y[j]) * d * 100 for j in cs if j > 40 and j + 97 < N]
            if bs: P.append(seg); B.append(np.nanmean(bs, 0))
        P, B = np.array(P), np.array(B); x = np.arange(-32, 97) * 15 / 60
        if len(P) < 5: continue
        mp, mb = np.nanmean(P, 0), np.nanmean(B, 0); se = np.nanstd(P - B, 0) / np.sqrt(len(P))
        ax_.plot(x, mp, color='#3b6fd4', label=f'after line turn (n={len(P)})'); ax_.plot(x, mb, color='#999', label='matched random bars'); ax_.fill_between(x, mp - mb - 1.96 * se + mb, mp - mb + 1.96 * se + mb, color='#3b6fd4', alpha=.15)
        ax_.axvline(0, color='k', lw=.6); ax_.set_title(title); ax_.set_xlabel('hours from confirmation'); ax_.legend(fontsize=8)
    axs[0].set_ylabel('Nasdaq cumulative return (%), signed by hypothesised direction'); plt.tight_layout(); plt.savefig(OUTD / f'turn_events_paths{SUF}.png', dpi=110); plt.close()
def fig_forest():
    fig, ax = plt.subplots(figsize=(9, 5)); y = 0; labs = []
    for p in ('A0', 'A1', 'A3', 'A2', 'A2m', 'A4'):
        for hf, col in (('IS', '#999'), ('VAL', '#3b6fd4'), ('OOS', '#1a8a5a')):
            r = cell(p, hf, 'ret%')
            if r is None or not np.isfinite(r.matched_diff): y += 1; continue
            ax.errorbar(r.matched_diff, y, xerr=[[r.matched_diff - r.ci_lo], [r.ci_hi - r.matched_diff]], fmt='o', color=col, ms=4); labs.append((y, f'{p} {hf} (n={int(r.n)})')); y += 1
        y += 1
    ax.axvline(0, color='k', lw=.7); ax.set_yticks([a for a, _ in labs]); ax.set_yticklabels([b for _, b in labs], fontsize=7); ax.invert_yaxis(); ax.set_xlabel('Nasdaq signed return 2 h after confirmation, minus matched baseline (%), 95% day-block CI'); plt.tight_layout(); plt.savefig(OUTD / f'turn_events_forest{SUF}.png', dpi=110); plt.close()
fig_video(); fig_paths(); fig_forest()

# ---------------------------------------------------------------- examples
def examples(p, h=8, n=3):
    rows = []
    for (c, e, d) in FAM[p]:
        if VIDEO[c] or half_of[c] == '': continue
        o = outcome(c, d, h)
        if o is None: continue
        rows.append(dict(confirm=str(G[c])[:16], extreme=str(G[e])[:16], d=d, ret=o['ret'], mfe_u=o['mfe'], mae_u=o['mae'], res='favourable' if o['fav'] else ('adverse' if o['adv'] else 'neither'), nasdaq_state=int(ZN[c]) if np.isfinite(ZN[c]) else 0))
    df = pd.DataFrame(rows)
    if df.empty: return df
    return pd.concat([df[df.res == 'favourable'].nlargest(n, 'mfe_u'), df[df.res == 'adverse'].nsmallest(n, 'mae_u'), df[df.res == 'neither'].head(n)])
VIDEO_EV = []
for (c, e, d) in FAM['A0']:
    if VIDEO[c]:
        o = outcome(c, d, 8); VIDEO_EV.append(dict(confirm=str(G[c])[:16], extreme=str(G[e])[:16], d=d, ret_2h=None if o is None else round(o['ret'], 3), result='n/a' if o is None else ('favourable' if o['fav'] else ('adverse' if o['adv'] else 'neither')), nasdaq_state=int(ZN[c]) if np.isfinite(ZN[c]) else 0, nasdaq_consolidating=bool(consol[c])))
VIDEO_EV = pd.DataFrame(VIDEO_EV)

# ---------------------------------------------------------------- write-up
f3 = lambda v: '' if pd.isna(v) else f'{v:+.3f}'
def md(df, cols=None, fmt=None):
    if df is None or len(df) == 0: return '_none_'
    d = df.copy()
    for c in d.columns:
        if d[c].dtype == float: d[c] = d[c].map(lambda v: '' if pd.isna(v) else (f'{v:.3f}' if c.startswith('p') else f'{v:+.3f}'))
    return d.to_markdown(index=False)
primary = ET[(ET.H_bars == PH) & (ET.metric.isin(['ret%', 'fav', 'adv', 'neu', 'mfe_u', 'mae_u'])) & (ET.half.isin(['IS', 'VAL', 'OOS']))]
horizons = ET[(ET.pattern.isin(['A0', 'A1', 'A2'])) & (ET.metric == 'ret%') & (ET.half == 'ALL')]
lead_sum = []
for d_, nm in ((1, 'line up-turns'), (-1, 'line down-turns'), (0, 'all')):
    L = LEAD if d_ == 0 else LEAD[LEAD.d == d_]
    lead_sum.append(dict(group=nm, n=len(L), share_nasdaq_turn_same_dir_within_12h=L.any_ext.mean(), median_extreme_lead_min=np.nanmedian(L.lead_ext) * 15, share_nasdaq_confirms_within_8h_after=L.any_conf_8h.mean(), median_confirm_gap_min=np.nanmedian(L.conf_dt) * 15))
LS = pd.DataFrame(lead_sum); pl_a = np.array([a for a, b in PLEAD]); pl_b = np.array([b for a, b in PLEAD if np.isfinite(b)]) * 15
txt = [f'# COG-TURN-EVENTS results', '', f'Run once per forge/COG_TURN_EVENTS_PREREG.md. Research series: raw bp, close-labelled, no display transforms. Window 2024-04-15 to 2026-10-09. Video week (16-23 Sep 2026) excluded from pooled statistics.', '',
       f'## Verdict (registered rule): **{verdict}**', '',
       f'Line turns detected at k = 0.75: {len(FAM["A0"])} (up {sum(1 for e in FAM["A0"] if e[2] == 1)}, down {sum(1 for e in FAM["A0"] if e[2] == -1)}); events by family: ' + ', '.join(f'{k} {len(v)}' for k, v in FAM.items()) + f'. Nasdaq turns: {len(EVN)}.', '',
       '### Robust-relationship gates per pattern (primary cell: k 0.75, 2 h)', md(VERD), '',
       f'### Conditional relationship (session x volatility strata, FDR 10% over {n_strata_tested} strata, validation AND OOS, n>=15 each)', md(COND), '',
       '### Event study at 2 h by sample half (matched_diff = event minus matched random bars; fav/adv/neu = share of events whose +-u race went favourable/adverse/neither; mfe_u/mae_u in units of u)', md(primary[['pattern', 'half', 'metric', 'n', 'days', 'event_mean', 'matched_diff', 'ci_lo', 'ci_hi', 'p_one_sided']]), '',
       '### Signed return by horizon (all halves, matched difference, 95% day-block CI)', md(horizons[['pattern', 'H_bars', 'n', 'event_mean', 'matched_diff', 'ci_lo', 'ci_hi', 'p_one_sided']]), '',
       '### Turn-to-turn timing (line turn vs Nasdaq turn, same direction)', md(LS), '',
       f'Time-shift placebo ({len(PLEAD)} draws): share of shifted-line turns followed by a same-direction Nasdaq confirm within 8 h: mean {pl_a.mean():.3f} (5-95%: {np.percentile(pl_a, 5):.3f} to {np.percentile(pl_a, 95):.3f}); median extreme-time offset {np.median(pl_b):+.0f} min (5-95%: {np.percentile(pl_b, 5):+.0f} to {np.percentile(pl_b, 95):+.0f}).', '',
       '### Placebo distribution of the pooled 2 h matched effect (shifted line)', md(pd.DataFrame([dict(pattern=p, placebo_mean=np.nanmean(PL[p]), placebo_p5=np.nanpercentile(PL[p], 5), placebo_p95=np.nanpercentile(PL[p], 95), real=float(cell(p, 'ALL', 'ret%').matched_diff)) for p in PAT if np.isfinite(PL[p]).sum() > 20])), '',
       '### Nasdaq-only baseline and incremental information (A0 line-signal s_t, 8 bars after a confirmed turn; controls = Nasdaq 1h/4h/24h returns, realised vol z, 96-bar range position, own zig-zag state; date-clustered)', md(INC), '',
       'The last rows per H show out-of-sample R-squared without (coef_s column) and with (t_s column) the line signal, fit on in-sample+validation, evaluated on OOS.', '',
       '### Release-bar exclusion at the primary cell (matched effect, % signed 2 h return, events whose confirm bar is within 30 min after a US release / FOMC removed)', md(pd.DataFrame([dict(pattern=p, n=len(NOREL[p]), effect=float((NOREL[p].ret - NOREL[p].b_ret).mean()) if len(NOREL[p]) else np.nan) for p in PAT])), '',
       '### Exploratory grid (all five k, 2 h, pooled; NOT part of the verdict)', md(EXP), '',
       '### Examples (2 h race result; best and worst by excursion, plus ones where nothing happened)']
for p in ('A0', 'A1', 'A2'): txt += [f'**{p}**', md(examples(p)), '']
txt += ['### The video week (16-23 Sep 2026) - every confirmed line turn, descriptive only', md(VIDEO_EV), '',
        '### Figures', '`turn_events_video_week.png`, `turn_events_paths.png`, `turn_events_forest.png`, table `turn_events_table.csv`.', '',
        '### Limits (stated, not hidden)', '- Only the pinned pair has deep history, so contract-month robustness is NOT tested; other pairs hold two weeks.',
        '- No period is untouched: earlier studies in this repository saw these dates for the combined line. The honest untouched test is the forward record from 2026-10-15.',
        '- MFE/MAE use 15-minute closes (no intra-bar high/low in the Nasdaq series).', '- Strata are session x volatility tercile by the line-turn confirm time.', '- Release exclusion uses a fixed 08:30/10:00 ET (all weekdays) and 14:00 ET (FOMC days) rule, not an event vendor calendar.']
(OUTD / f'TURN_EVENTS{SUF}.md').write_text('\n'.join(txt), encoding='utf-8')
pd.concat([pd.DataFrame(dict(pattern=p, confirm=[str(G[c]) for c, e, d in FAM[p]], extreme=[str(G[e]) for c, e, d in FAM[p]], d=[d for c, e, d in FAM[p]])) for p in PAT]).to_csv(OUTD / f'turn_events_all{SUF}.csv', index=False)
VERD.to_csv(OUTD / f'turn_events_gates{SUF}.csv', index=False); INC.to_csv(OUTD / f'turn_events_incremental{SUF}.csv', index=False); pd.DataFrame({k: pd.Series(v) for k, v in PL.items()}).to_csv(OUTD / f'turn_events_placebo{SUF}.csv', index=False); print('VERDICT:', verdict); print(VERD.to_string()); print(COND.to_string() if len(COND) else 'no conditional cells')
