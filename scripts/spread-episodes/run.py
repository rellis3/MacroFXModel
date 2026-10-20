"""spread-episodes: the registered run (forge/SPREAD_EPISODES_PREREG.md). One run per case; final period read once.
Usage: python scripts/spread-episodes/run.py [case1|case2|both]   (env NPLAC = placebo draws, default 200)"""
import json, os, sys, time, re
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(__file__))
from common import *

NPLAC = int(os.environ.get('NPLAC', 200))
KS = (0.5, 0.75, 1.0, 1.5)
SMODES = ('adaptive', 'fixed+')
CONFS = ('C0', 'C1', 'C2')
TYPES = ('all', 'up', 'down', 'toward_mean', 'away_mean', 'with_trend', 'against_trend', 'prior_aligned', 'prior_diverged')
PERIODS = ('discover', 'validate', 'final')


def ct(y, cl):
    k = np.isfinite(y)
    y = y[k]; cl = cl[k]; n = len(y)
    if n < 5:
        return np.nan, np.nan, n
    m = y.mean(); s = np.bincount(cl, weights=y - m); se = np.sqrt((s * s).sum()) / n
    return float(m), (float(m / se) if se > 0 else np.nan), n


def p2(t):
    from scipy.stats import norm
    return 2 * norm.sf(np.abs(t))


def p1(t):
    from scipy.stats import norm
    return norm.sf(t)


# ---------------- calendar ----------------
def load_calendar():
    c = pd.read_csv(os.path.join(ROOT, 'calendar_events.csv'), encoding='latin-1', low_memory=False)
    c['t'] = pd.to_datetime(c['datetime_raw'], utc=True, errors='coerce')
    major = np.sort(c[(c['impact'] == 'Major') & c['ccy'].isin(['USD', 'EUR'])]['t'].dropna().to_numpy().astype('datetime64[ns]').astype('int64'))
    pat = re.compile(r'Payroll|Non-Farm Employment Change|Inflation Rate Year-over-Year|^CPI|Core CPI|FOMC Statement|Fed Interest Rate Decision|Federal Funds Rate')
    u = c[(c['ccy'] == 'USD') & c['event'].astype(str).str.contains(pat) & (c['t'] >= '2014-01-01')]
    top = set(u['t'].dt.strftime('%Y-%m-%d'))
    f = pd.read_csv(os.path.join(ROOT, 'data/calendar/ff_calendar_2007_2025.csv'), encoding='latin-1', usecols=[0, 1, 2, 3])
    f = f[(f['Currency'] == 'USD') & f['Impact'].astype(str).str.startswith('High') & f['Event'].astype(str).str.contains(pat)]
    ft = pd.to_datetime(f['DateTime'], utc=True, errors='coerce')
    top |= set(ft[ft < '2014-01-01'].dt.strftime('%Y-%m-%d'))
    return dict(major=major, c1_end=pd.Timestamp('2026-07-03', tz='UTC').value, top=top, c2_lo='2007-01-01', c2_hi='2026-07-02')


CAL = load_calendar()


# =====================================================================================================
# Flat builders: everything a run needs, for the real spread or a shifted one
# =====================================================================================================
def case1_flat(shift=0, cache={}):
    if 'z' not in cache:
        z = np.load(os.path.join(OUT, 'case1_bars.npz'), allow_pickle=True)
        days = pd.DatetimeIndex(z['days']); X, P, q = z['X'], z['P'], z['q']
        good = (days.dayofweek < 5) & q & np.isfinite(P).any(axis=1)
        cache['z'] = (days, X, P, good)
    days, X, P, good = cache['z']
    Xm = X.copy()
    gi = np.where(good)[0]
    if shift:
        Xm[gi] = X[gi][np.roll(np.arange(len(gi)), -shift)]
    valid = np.isfinite(Xm) & np.isfinite(P) & good[:, None]
    di, sl = np.where(valid)
    x, p = Xm[valid], P[valid]
    n = len(x)
    T = (days[di] + pd.to_timedelta((sl + 1) * 15, 'min'))
    dstr = days[di].strftime('%Y-%m-%d').to_numpy()
    F = dict(case='case1', x=x, p=p, n=n, day=di, hour=(sl * 15) // 60, T=T.asi8 if hasattr(T, 'asi8') else T.view('int64'),
             per=period_of(dstr, P1), H={'1h': 4, '4h': 16, '8h': 32, '24h': 96}, hmax=96, off=0, Lp=92, Lx=460, prim_h='4h', ref_h=16)
    F['dates'] = dstr
    wk = ((days[di] - pd.Timestamp('2024-01-01')).days // 7).to_numpy()
    F['cl'] = {h: (di if v <= 32 else wk) for h, v in F['H'].items()}
    F['cl_week'] = wk
    F['B'] = day_rms_scale(Xm, 16, valid)
    F['sig'] = {v: day_rms_scale(P, v, valid) for v in set(list(F['H'].values()) + [16])}
    # within-day consecutive changes
    same = np.r_[False, di[1:] == di[:-1]]
    dx = np.where(same, np.r_[np.nan, np.diff(x)], np.nan); dp = np.where(same, np.r_[np.nan, np.diff(p)], np.nan)
    F['dx'], F['dp'] = dx, dp
    F['slot'] = sl
    g = pd.DataFrame({'d': di, 'xy': dx * dp, 'xx': dx * dx, 'yy': dp * dp}).dropna().groupby('d').sum()
    g = g.reindex(np.arange(len(days)))
    def rc(w):
        r = g.rolling(w, min_periods=max(3, w // 2)).sum()
        return (r['xy'] / np.sqrt(r['xx'] * r['yy'])).shift(1)
    sc, cp = rc(20), rc(5)
    F['scorr'] = sc.reindex(di).to_numpy(); F['coup'] = cp.reindex(di).to_numpy()
    F['strong_thr'] = sc.abs().expanding(min_periods=10).median().shift(1).reindex(di).to_numpy()
    cpa = cp * np.sign(sc)
    F['coup_tile'] = np.ceil(cpa.rolling(120, min_periods=40).rank(pct=True) * 3).reindex(di).to_numpy()
    dm = pd.Series(x).groupby(di).mean().reindex(np.arange(len(days)))
    F['tmean'] = dm.rolling(20, min_periods=10).mean().shift(1).reindex(di).to_numpy()
    s16 = pd.Series(F['sig'][16]).groupby(di).first().reindex(np.arange(len(days)))
    F['vol_tile'] = np.ceil(s16.rolling(120, min_periods=40).rank(pct=True) * 3).reindex(di).to_numpy()
    # release tag: Major USD/EUR event in (T - 1h, T + 4h]
    Ti = F['T']; mj = CAL['major']
    a = np.searchsorted(mj, Ti - 3600 * 10**9, side='right'); b = np.searchsorted(mj, Ti + 4 * 3600 * 10**9, side='right')
    rel = (b > a).astype(float); rel[(Ti >= CAL['c1_end']) | (Ti < pd.Timestamp('2014-01-01', tz='UTC').value)] = np.nan
    F['rel'] = rel
    F['tod'] = np.select([(F['hour'] >= 22) | (F['hour'] < 7), F['hour'] < 12, F['hour'] < 16], ['asia', 'london', 'ny_overlap'], 'ny_late')
    F['Bp'] = day_rms_scale(P, 16, valid)
    F['match_key'] = F['hour']
    # E1 per-session centred correlation
    e = pd.DataFrame({'d': di, 'dx': dx, 'dp': dp}).dropna()
    F['E1'] = e.groupby('d').apply(lambda g: pd.Series({'n': len(g), 'r': g['dx'].corr(g['dp']) if len(g) >= 30 and g['dx'].std() > 0 else np.nan}), include_groups=False)
    F['E1_per'] = period_of(days[F['E1'].index].strftime('%Y-%m-%d'), P1)
    return F


def case2_flat(shift=0, series='AVG', cache={}):
    if 'df' not in cache:
        cache['df'] = pd.read_parquet(os.path.join(OUT, 'case2_daily.parquet'))
    df = cache['df']
    x = df[series].to_numpy().copy()
    if shift:
        x = np.roll(x, -shift)
    p = df['P'].to_numpy(); n = len(x); idx = df.index
    dstr = idx.strftime('%Y-%m-%d').to_numpy()
    F = dict(case='case2', series=series, x=x, p=p, n=n, per=period_of(dstr, P2), H={'1d': 1, '3d': 3, '5d': 5, '10d': 10, '20d': 20}, hmax=20, off=1, Lp=20, Lx=60,
             prim_h='5d', ref_h=5, dates=dstr)
    mon = (idx.year * 12 + idx.month - 1999 * 12).to_numpy()
    F['day'] = np.arange(n); F['cl'] = {h: mon for h in F['H']}; F['cl_week'] = mon
    F['B'] = row_rms_scale(x, 5)
    F['sig'] = {v: row_rms_scale(p, v) for v in set(list(F['H'].values()) + [5])}
    dx = np.r_[np.nan, np.diff(x)]; dp = np.r_[np.nan, np.diff(p)]; F['dx'], F['dp'] = dx, dp
    sx, sp = pd.Series(dx), pd.Series(dp)
    sc = sx.rolling(250, min_periods=120).corr(sp).shift(1); cp = sx.rolling(60, min_periods=30).corr(sp).shift(1)
    F['scorr'] = sc.to_numpy(); F['coup'] = cp.to_numpy()
    F['strong_thr'] = sc.abs().expanding(min_periods=60).median().shift(1).to_numpy()
    F['coup_tile'] = np.ceil((cp * np.sign(sc)).rolling(120, min_periods=40).rank(pct=True) * 3).to_numpy()
    F['tmean'] = pd.Series(x).rolling(60, min_periods=30).mean().shift(1).to_numpy()
    F['vol_tile'] = np.ceil(pd.Series(F['sig'][5]).rolling(120, min_periods=40).rank(pct=True) * 3).to_numpy()
    top = np.array([d in CAL['top'] for d in dstr], float)
    nxt = pd.Series(top[::-1]).rolling(5, min_periods=1).max().to_numpy()[::-1]       # any top day in rows [i, i+4]
    rel = np.r_[nxt[1:], np.nan]                                                      # rows (c, c+5]
    unk = (dstr < CAL['c2_lo']) | (np.r_[dstr[5:], np.array([dstr[-1]] * 5)] > CAL['c2_hi'])
    rel[unk] = np.nan; F['rel'] = rel
    F['tod'] = np.full(n, 'daily', dtype=object)
    F['Bp'] = row_rms_scale(p, 5)
    F['match_key'] = idx.dayofweek.to_numpy()
    e = pd.DataFrame({'m': mon, 'dx': dx, 'dp': dp}).dropna()
    F['E1'] = e.groupby('m').apply(lambda g: pd.Series({'n': len(g), 'r': g['dx'].corr(g['dp']) if len(g) >= 15 and g['dx'].std() > 0 else np.nan}), include_groups=False)
    first_row = pd.Series(np.arange(n)).groupby(mon).first()
    F['E1_per'] = period_of(idx[first_row.reindex(F['E1'].index).to_numpy()].strftime('%Y-%m-%d'), P2)
    return F


# =====================================================================================================
# Events and cells
# =====================================================================================================
def events(F, k, smode):
    x, p, n, off = F['x'], F['p'], F['n'], F['off']
    tu, co, di = zigzag(x, k * F['B'])
    if len(co) == 0:
        return None
    s = np.sign(F['scorr'][co]) if smode == 'adaptive' else np.ones(len(co))
    s[~np.isfinite(s)] = 0
    e = s * di
    Y = {}
    for h, v in F['H'].items():
        a, b = co + off, co + off + v
        ok = b < n
        r = np.full(len(co), np.nan)
        r[ok] = (p[b[ok]] - p[a[ok]]) / F['sig'][v][co[ok]]
        r = e * r
        r[e == 0] = np.nan
        Y[h] = r
    C1 = e * (p[co] - p[tu]) > 0
    C2 = np.abs(F['scorr'][co]) >= F['strong_thr'][co]
    tm = F['tmean'][co]
    toward = di == np.sign(tm - x[tu])
    lb = tu - F['Lx']; xt = np.where(lb >= 0, x[np.clip(lb, 0, None)], np.nan)
    with_tr = di == np.sign(x[tu] - xt)
    has_tr = np.isfinite(xt) & (x[tu] != xt)
    prev_tu = np.r_[-1, tu[:-1]]
    pm = np.where(prev_tu >= 0, np.sign(p[tu] - p[np.clip(prev_tu, 0, None)]), np.nan)
    aligned = (pm * s) == (-di)
    has_prev = prev_tu >= 0
    TY = {'all': np.ones(len(co), bool), 'up': di > 0, 'down': di < 0, 'toward_mean': np.isfinite(tm) & toward, 'away_mean': np.isfinite(tm) & ~toward,
          'with_trend': has_tr & with_tr, 'against_trend': has_tr & ~with_tr, 'prior_aligned': has_prev & aligned, 'prior_diverged': has_prev & ~aligned & np.isfinite(pm)}
    CF = {'C0': np.ones(len(co), bool), 'C1': C1, 'C2': C2}
    return dict(tu=tu, co=co, di=di, s=s, e=e, Y=Y, TY=TY, CF=CF, per=F['per'][co])


def cell_stats(F, EV_by, full=True):
    """EV_by: {(k, smode): events}. Returns list of dict rows (one per cell x period)."""
    rows = []
    for (k, sm), ev in EV_by.items():
        if ev is None:
            continue
        for cf in CONFS:
            for ty in TYPES:
                m0 = ev['CF'][cf] & ev['TY'][ty]
                for h in F['H']:
                    y = ev['Y'][h]; cl = F['cl'][h][ev['co']]
                    for per in PERIODS:
                        m = m0 & (ev['per'] == per)
                        mu, t, nn = ct(y[m], cl[m])
                        r = dict(k=k, sign=sm, conf=cf, type=ty, h=h, period=per, mean=mu, t=t, n=nn)
                        if full:
                            yy = y[m]; yy = yy[np.isfinite(yy)]
                            r.update(p_follow=float((yy >= 0.5).mean()) if len(yy) else np.nan, p_revert=float((yy <= -0.5).mean()) if len(yy) else np.nan,
                                     p_nothing=float(((yy > -0.5) & (yy < 0.5)).mean()) if len(yy) else np.nan)
                        rows.append(r)
    return rows


def all_events(F):
    return {(k, sm): events(F, k, sm) for k in KS for sm in SMODES}


# =====================================================================================================
# Controls
# =====================================================================================================
def control_a(F, EV_by, rng, ncon=10):
    """Per event: mean y over ncon matched random bars (same period, hour/weekday, vol tercile), only the event's own
    +-hmax neighbourhood excluded; direction = s_b * sign(x[b] - x[b - m])."""
    n = F['n']; x, p = F['x'], F['p']
    key = pd.Series(list(zip(F['per'], F['match_key'], F['vol_tile']))).astype(str).to_numpy()
    pools = pd.Series(np.arange(n)).groupby(key).apply(lambda s: s.to_numpy()).to_dict()
    out = {}
    for (k, sm), ev in EV_by.items():
        if ev is None:
            continue
        co, tu = ev['co'], ev['tu']
        m = max(1, int(np.median(co - tu)))
        C = {h: np.full(len(co), np.nan) for h in F['H']}
        for j, c in enumerate(co):
            pool = pools.get(key[c])
            if pool is None or len(pool) < 30:
                continue
            cand = rng.choice(pool, size=min(len(pool), ncon * 3), replace=False)
            cand = cand[(np.abs(cand - c) > F['hmax']) & (cand - m >= 0)][:ncon]
            if len(cand) == 0:
                continue
            sb = np.sign(F['scorr'][cand]) if sm == 'adaptive' else np.ones(len(cand))
            eb = sb * np.sign(x[cand] - x[cand - m])
            for h, v in F['H'].items():
                a, b = cand + F['off'], cand + F['off'] + v
                ok = (b < n) & (eb != 0) & np.isfinite(eb)
                if ok.any():
                    C[h][j] = np.nanmean(eb[ok] * (p[b[ok]] - p[a[ok]]) / F['sig'][v][cand[ok]])
        out[(k, sm)] = C
    return out


def price_only_events(F, k):
    tu, co, di = zigzag(F['p'], k * F['Bp'])
    Y = {}
    for h, v in F['H'].items():
        a, b = co + F['off'], co + F['off'] + v; ok = b < F['n']; r = np.full(len(co), np.nan)
        r[ok] = di[ok] * (F['p'][b[ok]] - F['p'][a[ok]]) / F['sig'][v][co[ok]]; Y[h] = r
    state = np.full(F['n'], np.nan); state[co] = di; state = pd.Series(state).ffill().to_numpy()
    return dict(tu=tu, co=co, di=di, Y=Y, per=F['per'][co], state=state)


def race(F, idx, e, hmax, ref):
    """First passage of e*(p[t]-p[c])/sig_ref to +1 (follow) or -1 (revert) within hmax bars after entry."""
    p, n, off = F['p'], F['n'], F['off']; sg = F['sig'][ref]
    res = np.full(len(idx), np.nan); tim = np.full(len(idx), np.nan)
    for j, (c, ee) in enumerate(zip(idx, e)):
        if not (np.isfinite(ee) and ee != 0 and np.isfinite(sg[c]) and sg[c] > 0):
            continue
        a = c + off; b = min(n - 1, a + hmax)
        if b <= a:
            continue
        path = ee * (p[a + 1:b + 1] - p[a]) / sg[c]
        up = np.where(path >= 1)[0]; dn = np.where(path <= -1)[0]
        iu = up[0] if len(up) else 10**9; id_ = dn[0] if len(dn) else 10**9
        if iu < id_:
            res[j], tim[j] = 1, iu + 1
        elif id_ < iu:
            res[j], tim[j] = -1, id_ + 1
        else:
            res[j] = 0
    return res, tim


def profile(F, idx, e, ref):
    """Mean e*(p[c+off+h]-p[c+off]) / (sig_ref*sqrt(h/ref)) for h=1..hmax."""
    p, n, off = F['p'], F['n'], F['off']; sg = F['sig'][ref][idx]
    out = []
    for h in range(1, F['hmax'] + 1):
        a, b = idx + off, idx + off + h; ok = (b < n) & np.isfinite(e) & (e != 0) & np.isfinite(sg)
        v = e[ok] * (p[b[ok]] - p[a[ok]]) / (sg[ok] * np.sqrt(h / ref))
        out.append(float(np.mean(v)) if len(v) else np.nan)
    return out


def e1_stats(F):
    E = F['E1'].dropna(); out = {}
    for per in PERIODS:
        g = E[F['E1_per'][np.isin(F['E1'].index, E.index)] == per] if len(E) else E
        if len(g) < 10:
            out[per] = dict(OD=np.nan, AC1=np.nan, n=len(g), mean_r=np.nan); continue
        z = np.arctanh(np.clip(g['r'].to_numpy(), -0.999, 0.999)); nn = g['n'].to_numpy()
        od = float(np.var(z, ddof=1) / np.mean(1.0 / (nn - 3)))
        ac = float(np.corrcoef(z[:-1], z[1:])[0, 1])
        out[per] = dict(OD=od, AC1=ac, n=int(len(g)), mean_r=float(np.mean(g['r'])))
    return out


def e1_constbeta(F, rng, ndraw):
    """Amendment A1 null: constant link within each period. Synthetic price change = beta*dx + residual, residuals rolled
    by whole sessions (Case 1) or >= 60 rows (Case 2) inside the period. Keeps the spread's own volatility clustering
    and the residual's, breaks any time variation in the link. Returns real vs null OD and AC1 per period."""
    out = {}
    for per in PERIODS:
        if F['case'] == 'case1':
            m = (F['per'] == per)
            d = F['day'][m]; s_ = F['slot'][m]; dx = F['dx'][m]; dp = F['dp'][m]
            ud = np.unique(d); di = np.searchsorted(ud, d)
            DX = np.full((len(ud), SLOTS), np.nan); DP = DX.copy(); DX[di, s_] = dx; DP[di, s_] = dp
            minn, roll_min = 30, 20
        else:
            m = (F['per'] == per); mon = F['cl_week'][m]; ud = np.unique(mon)
            DX = F['dx'][m][None, :]; DP = F['dp'][m][None, :]; minn, roll_min = 15, 60
        ok = np.isfinite(DX) & np.isfinite(DP)
        beta = np.nansum(np.where(ok, DX * DP, 0)) / np.nansum(np.where(ok, DX * DX, 0))
        EPS = DP - beta * DX
        def stats(DXa, DPa):
            if F['case'] == 'case1':
                k = np.isfinite(DXa) & np.isfinite(DPa); nn = k.sum(1)
                a = np.where(k, DXa, np.nan); b = np.where(k, DPa, np.nan)
                a = a - np.nanmean(a, 1, keepdims=True); b = b - np.nanmean(b, 1, keepdims=True)
                with np.errstate(all='ignore'):
                    r = np.nansum(a * b, 1) / np.sqrt(np.nansum(a * a, 1) * np.nansum(b * b, 1))
            else:
                g = pd.DataFrame({'m': mon, 'a': DXa[0], 'b': DPa[0]}).dropna()
                gg = g.groupby('m'); nn = gg.size().to_numpy()
                r = gg.apply(lambda q: q['a'].corr(q['b']) if q['a'].std() > 0 else np.nan, include_groups=False).to_numpy()
            keep = (nn >= minn) & np.isfinite(r)
            z = np.arctanh(np.clip(r[keep], -0.999, 0.999)); n_ = nn[keep]
            if len(z) < 10: return np.nan, np.nan
            return float(np.var(z, ddof=1) / np.mean(1.0 / (n_ - 3))), float(np.corrcoef(z[:-1], z[1:])[0, 1])
        od_r, ac_r = stats(DX, DP)
        nul = []
        L_ = EPS.shape[0] if F['case'] == 'case1' else EPS.shape[1]
        for _ in range(ndraw):
            sh = int(rng.integers(roll_min, max(roll_min + 1, L_ - roll_min)))
            E2 = np.roll(EPS, -sh, axis=0 if F['case'] == 'case1' else 1)
            nul.append(stats(DX, beta * DX + E2))
        nul = np.array(nul)
        out[per] = dict(beta=float(beta), OD=dict(real=od_r, null_mean=float(np.nanmean(nul[:, 0])), null_p95=float(np.nanpercentile(nul[:, 0], 95)), pct=float((nul[:, 0] < od_r).mean())),
                        AC1=dict(real=ac_r, null_mean=float(np.nanmean(nul[:, 1])), null_p95=float(np.nanpercentile(nul[:, 1], 95)), pct=float((nul[:, 1] < ac_r).mean())))
    return out


def e2_stats(ev, h):
    out = {}
    if ev is None:
        return {per: dict(AC1=np.nan, dP=np.nan, n=0) for per in PERIODS}
    for per in PERIODS:
        m = (ev['per'] == per) & np.isfinite(ev['Y'][h])
        y = ev['Y'][h][m]
        if len(y) < 20:
            out[per] = dict(AC1=np.nan, dP=np.nan, n=len(y)); continue
        f = y >= 0.5
        ac = float(np.corrcoef(y[:-1], y[1:])[0, 1])
        a, b = f[1:][f[:-1]], f[1:][~f[:-1]]
        out[per] = dict(AC1=ac, dP=float(a.mean() - b.mean()) if len(a) and len(b) else np.nan, n=int(len(y)))
    return out


# =====================================================================================================
def run_case(case):
    t0 = time.time(); rng = np.random.default_rng(SEED + (1 if case == 'case1' else 2))
    series_list = ['X'] if case == 'case1' else ['AVG', 'DGS2', 'DGS10', 'SLOPE']
    build = (lambda sh, se: case1_flat(sh)) if case == 'case1' else (lambda sh, se: case2_flat(sh, se))
    R = dict(case=case, seed=SEED, nplacebo=NPLAC)
    real = {se: build(0, se) for se in series_list}
    prim_se = series_list[0]; Fp = real[prim_se]; ph = Fp['prim_h']
    # ---------- real cells ----------
    EV = {se: all_events(real[se]) for se in series_list}
    rows = []
    for se in series_list:
        for r in cell_stats(real[se], EV[se]):
            r['series'] = se; rows.append(r)
    cells = pd.DataFrame(rows)
    keycols = ['series', 'k', 'sign', 'conf', 'type', 'h']
    # ---------- control (a) ----------
    CA = {se: control_a(real[se], EV[se], rng) for se in series_list}
    ca_rows = []
    for se in series_list:
        F = real[se]
        for (k, sm), ev in EV[se].items():
            if ev is None: continue
            for cf in CONFS:
                for ty in TYPES:
                    m0 = ev['CF'][cf] & ev['TY'][ty]
                    for h in F['H']:
                        y = ev['Y'][h]; c = CA[se][(k, sm)][h]; cl = F['cl'][h][ev['co']]
                        for per in PERIODS:
                            m = m0 & (ev['per'] == per) & np.isfinite(c)
                            cm = float(np.nanmean(c[m])) if m.any() else np.nan
                            dm, dt, dn = ct(y[m] - c[m], cl[m])
                            ca_rows.append(dict(series=se, k=k, sign=sm, conf=cf, type=ty, h=h, period=per, ctrl_mean=cm, diff=dm, diff_t=dt))
    cells = cells.merge(pd.DataFrame(ca_rows), on=keycols + ['period'], how='left')
    print(case, 'real + control (a) done', round(time.time() - t0), 's', flush=True)
    # ---------- placebo (b) ----------
    n_shift_unit = len(np.unique(Fp['day'])) if case == 'case1' else Fp['n']
    mins = 20 if case == 'case1' else 60
    shifts = rng.integers(mins, n_shift_unit - mins, size=NPLAC)
    cells_key = cells[keycols + ['period']].astype(str).agg('|'.join, axis=1).to_numpy()
    kpos = {kk: i for i, kk in enumerate(cells_key)}
    PL = np.full((NPLAC, len(cells)), np.nan); PLT = np.full((NPLAC, len(cells)), np.nan)
    E1P = []; E2P = []; PROF_P = {per: [] for per in PERIODS}; sel_counts = []
    for d, sh in enumerate(shifts):
        rowsP = []
        for se in series_list:
            F = build(int(sh), se); evs = all_events(F)
            if se == prim_se:
                E1P.append(e1_stats(F)); E2P.append(e2_stats(evs[(0.75, 'adaptive')], ph))
                ev = evs[(0.75, 'adaptive')]
                if ev is not None:
                    for per in PERIODS:
                        m = ev['per'] == per
                        PROF_P[per].append(profile(F, ev['co'][m], ev['e'][m], F['ref_h']))
            for r in cell_stats(F, evs, full=False):
                r['series'] = se; rowsP.append(r)
        for r in rowsP:
            i = kpos.get('|'.join(str(r[c]) for c in keycols + ['period']))
            if i is not None:
                PL[d, i] = r['mean']; PLT[d, i] = r['t']
        # selection-aware count (sign + p version, same rule applied to real below)
        sel_counts.append(selection_count(cells, PL[d], PLT[d]))
        if d % 20 == 0:
            print(case, 'placebo', d, round(time.time() - t0), 's', flush=True)
    real_m = cells['mean'].to_numpy()
    cells['plc_p05'] = np.nanpercentile(PL, 5, axis=0); cells['plc_p95'] = np.nanpercentile(PL, 95, axis=0)
    cells['plc_mean'] = np.nanmean(PL, axis=0)
    cells['plc_pct'] = (PL < real_m[None, :]).mean(axis=0)
    # ---------- gates ----------
    cells['p2'] = p2(cells['t'].to_numpy())
    disc = cells[cells.period == 'discover'].copy(); disc['bh'] = bh(disc['p2'].to_numpy(), 0.10)
    val = cells[cells.period == 'validate'].set_index(keycols); fin = cells[cells.period == 'final'].set_index(keycols)
    surv = []
    for _, r in disc[disc.bh].iterrows():
        kk = tuple(r[c] for c in keycols)
        v = val.loc[kk]; sgn = np.sign(r['mean'])
        beyond = (v['mean'] > v['plc_p95']) if sgn > 0 else (v['mean'] < v['plc_p05'])
        vpass = bool(np.sign(v['mean']) == sgn and p1(sgn * v['t']) < 0.05 and beyond)
        surv.append(dict(zip(keycols, kk), disc_mean=r['mean'], disc_t=r['t'], val_mean=v['mean'], val_t=v['t'], val_pass=vpass))
    surv = pd.DataFrame(surv)
    real_sel = selection_count(cells, None, None)
    R['n_cells'] = int(len(disc)); R['disc_bh'] = int(disc['bh'].sum())
    R['selection'] = dict(real_sign_p=real_sel, placebo_mean=float(np.mean(sel_counts)), placebo_p95=float(np.percentile(sel_counts, 95)), placebo_counts=[int(c) for c in sel_counts])
    finals = []
    prim = dict(series=prim_se, k=0.75, sign='adaptive', conf='C0', type='all', h=ph)
    cand = [prim] + ([dict(zip(keycols, (r[c] for c in keycols))) for _, r in surv[surv.val_pass].iterrows()] if len(surv) else [])
    for cd in cand:
        kk = tuple(cd[c] for c in keycols)
        f = fin.loc[kk]; v = val.loc[kk]; dd = cells.set_index(keycols + ['period']).loc[kk + ('discover',)]
        sgn = 1.0 if cd is prim else float(np.sign(dd['mean']))
        f_ok = bool(np.sign(f['mean']) == sgn and p1(sgn * f['t']) < 0.05 and abs(f['mean']) >= 0.10)
        a_ok = bool(np.isfinite(f['diff_t']) and sgn * f['diff_t'] > 1.96)
        b_ok = bool((f['mean'] > f['plc_p95']) if sgn > 0 else (f['mean'] < f['plc_p05']))
        finals.append(dict(cd, is_primary=cd is prim, sign_expected=sgn, **{f'{per}_{m}': float(cells.set_index(keycols + ['period']).loc[kk + (per,)][m]) for per in PERIODS for m in ('mean', 't', 'n', 'p_follow', 'p_revert', 'ctrl_mean', 'diff', 'diff_t', 'plc_p05', 'plc_p95')},
                           final_pass=f_ok, ctrl_a_pass=a_ok, placebo_pass=b_ok))
    R['finals'] = finals
    R['survivors'] = surv.to_dict('records') if len(surv) else []
    # ---------- E tests ----------
    E1R = e1_stats(Fp); E2R = e2_stats(EV[prim_se][(0.75, 'adaptive')], ph)
    def pct(real_v, plc, key):
        a = np.array([q[key] for q in plc if np.isfinite(q[key])]); return dict(real=real_v, plc_mean=float(a.mean()) if len(a) else np.nan, plc_p95=float(np.percentile(a, 95)) if len(a) else np.nan, pct=float((a < real_v).mean()) if len(a) else np.nan)
    R['E1'] = {per: {m: pct(E1R[per][m], [q[per] for q in E1P], m) for m in ('OD', 'AC1')} | {'n': E1R[per]['n'], 'mean_r': E1R[per]['mean_r']} for per in PERIODS}
    R['E1_constbeta'] = e1_constbeta(Fp, rng, NPLAC)
    R['E2'] = {per: {m: pct(E2R[per][m], [q[per] for q in E2P], m) for m in ('AC1', 'dP')} | {'n': E2R[per]['n']} for per in PERIODS}
    # ---------- price-only (c1) and (c2) ----------
    c1rows = []; PO = {}
    for k in KS:
        po = price_only_events(Fp, k); PO[k] = po
        for h in Fp['H']:
            for per in PERIODS:
                m = po['per'] == per; mu, t, nn = ct(po['Y'][h][m], Fp['cl'][h][po['co']][m]); yy = po['Y'][h][m]; yy = yy[np.isfinite(yy)]
                c1rows.append(dict(k=k, h=h, period=per, mean=mu, t=t, n=nn, p_follow=float((yy >= 0.5).mean()) if len(yy) else np.nan))
    R['price_only_c1'] = c1rows
    R['price_only_c2'] = c2_model(Fp, EV[prim_se][(0.75, 'adaptive')], PO[0.75], rng)
    # ---------- tables, conditions, timing, profiles ----------
    ev = EV[prim_se][(0.75, 'adaptive')]
    R['type_table'] = cells[(cells.series == prim_se) & (cells.k == 0.75) & (cells.sign == 'adaptive') & (cells.conf == 'C0')][['type', 'h', 'period', 'mean', 't', 'n', 'p_follow', 'p_revert', 'p_nothing', 'ctrl_mean', 'diff', 'diff_t', 'plc_p05', 'plc_p95']].to_dict('records')
    R['conf_table'] = cells[(cells.series == prim_se) & (cells.k == 0.75) & (cells.sign == 'adaptive') & (cells.type == 'all')][['conf', 'h', 'period', 'mean', 't', 'n', 'p_follow', 'p_revert']].to_dict('records')
    R['k_table'] = cells[(cells.series == prim_se) & (cells.sign == 'adaptive') & (cells.conf == 'C0') & (cells.type == 'all')][['k', 'h', 'period', 'mean', 't', 'n', 'p_follow', 'p_revert', 'plc_p05', 'plc_p95']].to_dict('records')
    if case == 'case2':
        R['series_table'] = cells[(cells.k == 0.75) & (cells.sign == 'adaptive') & (cells.conf == 'C0') & (cells.type == 'all')][['series', 'h', 'period', 'mean', 't', 'n', 'p_follow', 'p_revert']].to_dict('records')
    R['conditions'] = conditions(Fp, ev)
    R['by_year'] = by_period(Fp, ev, ph)
    ca = CA[prim_se][(0.75, 'adaptive')]
    rr, tt = race(Fp, ev['co'], ev['e'].astype(float), Fp['hmax'], Fp['ref_h'])
    po = PO[0.75]; rp, tp = race(Fp, po['co'], po['di'].astype(float), Fp['hmax'], Fp['ref_h'])
    R['race'] = {per: dict(spread=_race_sum(rr[ev['per'] == per], tt[ev['per'] == per]), price_only=_race_sum(rp[po['per'] == per], tp[po['per'] == per])) for per in PERIODS}
    R['profile'] = {per: dict(real=profile(Fp, ev['co'][ev['per'] == per], ev['e'][ev['per'] == per].astype(float), Fp['ref_h']),
                              placebo_mean=list(np.nanmean(np.array(PROF_P[per]), axis=0)), placebo_p05=list(np.nanpercentile(np.array(PROF_P[per]), 5, axis=0)),
                              placebo_p95=list(np.nanpercentile(np.array(PROF_P[per]), 95, axis=0)),
                              price_only=profile(Fp, po['co'][po['per'] == per], po['di'][po['per'] == per].astype(float), Fp['ref_h'])) for per in PERIODS}
    R['control_a_primary'] = {per: dict(ctrl_mean=float(np.nanmean(ca[ph][(ev['per'] == per)])), n=int(np.isfinite(ca[ph][ev['per'] == per]).sum())) for per in PERIODS}
    if case == 'case1':
        # entry one bar later (sensitivity)
        y1 = np.full(len(ev['co']), np.nan); v = Fp['H'][ph]; a, b = ev['co'] + 1, ev['co'] + 1 + v; ok = b < Fp['n']
        y1[ok] = ev['e'][ok] * (Fp['p'][b[ok]] - Fp['p'][a[ok]]) / Fp['sig'][v][ev['co'][ok]]
        R['entry_plus1'] = {per: dict(zip(('mean', 't', 'n'), ct(y1[ev['per'] == per], Fp['cl'][ph][ev['co']][ev['per'] == per]))) for per in PERIODS}
    # same-bar positive control
    R['same_bar'] = {per: float(pd.Series(Fp['dx'][Fp['per'] == per]).corr(pd.Series(Fp['dp'][Fp['per'] == per]))) for per in PERIODS}
    # ---------- export events + series for the page ----------
    export_chart(case, Fp, ev, EV[prim_se][(0.75, 'adaptive')])
    cells.to_csv(os.path.join(OUT, f'cells_{case}.csv'), index=False)
    R['runtime_s'] = round(time.time() - t0)
    return R


def selection_count(cells, plm, plt):
    """Cells passing Discover-BH (two-sided q 0.10) and Validate (same sign, one-sided p < 0.05)."""
    m = cells['mean'].to_numpy() if plm is None else plm
    t = cells['t'].to_numpy() if plt is None else plt
    per = cells['period'].to_numpy()
    di = np.where(per == 'discover')[0]; vi = np.where(per == 'validate')[0]
    # rows are ordered cell-major with periods discover, validate, final in sequence
    p = p2(t[di]); ok = bh(p, 0.10)
    sg = np.sign(m[di]); vt = t[vi]
    vp = (np.sign(m[vi]) == sg) & (p1(sg * vt) < 0.05)
    return int((ok & vp).sum())


def c2_model(F, ev, po, rng):
    out = {}
    co, tu = ev['co'], ev['tu']; p = F['p']
    for h, v in F['H'].items():
        sg = F['sig'][v][co]
        a, b = co + F['off'], co + F['off'] + v; ok = b < F['n']
        T = np.full(len(co), np.nan); T[ok] = (p[b[ok]] - p[a[ok]]) / sg[ok]
        lb = np.clip(co - F['Lp'], 0, None)
        X0 = np.c_[np.ones(len(co)), (p[co] - p[tu]) / sg, (p[co] - p[lb]) / sg, np.nan_to_num(po['state'][co])]
        X1 = np.c_[X0, ev['e']]
        good = np.isfinite(T) & np.isfinite(X0).all(axis=1)
        tr = good & (ev['per'] == 'discover')
        if tr.sum() < 50:
            continue
        b0 = np.linalg.lstsq(X0[tr], T[tr], rcond=None)[0]; b1 = np.linalg.lstsq(X1[tr], T[tr], rcond=None)[0]
        res = dict(coef_price=list(map(float, b0)), coef_with_spread=list(map(float, b1)))
        for per in ('validate', 'final'):
            m = good & (ev['per'] == per)
            if m.sum() < 30:
                continue
            q0, q1, tt = X0[m] @ b0, X1[m] @ b1, T[m]; cl = F['cl'][h][co][m]
            ic0, ic1 = np.corrcoef(q0, tt)[0, 1], np.corrcoef(q1, tt)[0, 1]
            uc = np.unique(cl); grp = {c: np.where(cl == c)[0] for c in uc}; bs = []
            for _ in range(2000):
                pick = np.concatenate([grp[c] for c in rng.choice(uc, len(uc))])
                if np.std(q0[pick]) == 0: continue
                bs.append(np.corrcoef(q1[pick], tt[pick])[0, 1] - np.corrcoef(q0[pick], tt[pick])[0, 1])
            res[per] = dict(ic_price=float(ic0), ic_with_spread=float(ic1), d_ic=float(ic1 - ic0), d_ic_lo=float(np.percentile(bs, 2.5)), d_ic_hi=float(np.percentile(bs, 97.5)), n=int(m.sum()))
        out[h] = res
    return out


def conditions(F, ev):
    ph = F['prim_h']; y = ev['Y'][ph]; co = ev['co']; cl = F['cl'][ph][co]
    lb = np.clip(co - F['Lp'], 0, None); ptr = np.sign(F['p'][co] - F['p'][lb])
    levels = {}
    if F['case'] == 'case1':
        for v in ('asia', 'london', 'ny_overlap', 'ny_late'): levels[f'tod={v}'] = F['tod'][co] == v
    for v in (1, 2, 3): levels[f'vol_tercile={v}'] = F['vol_tile'][co] == v
    levels['price_trend=with'] = (ev['e'] == ptr) & (ptr != 0); levels['price_trend=against'] = (ev['e'] == -ptr) & (ptr != 0)
    rel = F['rel'][co]; levels['release=near'] = rel == 1; levels['release=quiet'] = rel == 0
    for v in (1, 2, 3): levels[f'coupling_tercile={v}'] = F['coup_tile'][co] == v
    rows = []
    for name, lm in levels.items():
        for h in F['H']:
            yy = ev['Y'][h]; c = F['cl'][h][co]
            for per in PERIODS:
                m = lm & (ev['per'] == per); mu, t, n = ct(yy[m], c[m])
                rows.append(dict(cond=name, h=h, period=per, mean=mu, t=t, n=n))
    df = pd.DataFrame(rows); df['p2'] = p2(df['t'].to_numpy())
    d = df[df.period == 'discover'].copy(); d['bh'] = bh(d['p2'].to_numpy(), 0.10)
    vv = df[df.period == 'validate'].set_index(['cond', 'h'])
    d['val_pass'] = [bool(r.bh and np.sign(vv.loc[(r.cond, r.h)]['mean']) == np.sign(r['mean']) and p1(np.sign(r['mean']) * vv.loc[(r.cond, r.h)]['t']) < 0.05) for _, r in d.iterrows()]
    df = df.merge(d[['cond', 'h', 'bh', 'val_pass']], on=['cond', 'h'], how='left')
    # Q2: top coupling tercile and C2 vs all, Validate
    q2 = {}
    for per in PERIODS:
        allm = ev['per'] == per; mu_all = np.nanmean(y[allm])
        for nm, mm in (('coupling_top', F['coup_tile'][co] == 3), ('C2', ev['CF']['C2'])):
            m = allm & mm; mu, t, n = ct(y[m] - mu_all, cl[m]); q2[f'{per}|{nm}'] = dict(diff=mu, t=t, n=n, mean_all=float(mu_all))
    return dict(rows=df.to_dict('records'), q2=q2)


def by_period(F, ev, h):
    y = ev['Y'][h]; d = pd.to_datetime(pd.Series(F['dates'][ev['co']])); cl = F['cl'][h][ev['co']]; out = []
    for lab, key in (('year', d.dt.year.astype(str)), ('half', d.dt.year.astype(str) + 'H' + ((d.dt.month > 6) + 1).astype(str))):
        for kk in sorted(key.unique()):
            m = (key == kk).to_numpy(); mu, t, n = ct(y[m], cl[m]); yy = y[m]; yy = yy[np.isfinite(yy)]
            out.append(dict(kind=lab, key=kk, mean=mu, t=t, n=n, p_follow=float((yy >= 0.5).mean()) if len(yy) else np.nan))
    return out


def _race_sum(r, t):
    r = r[np.isfinite(r)] if len(r) else r
    return dict(n=int(len(r)), p_follow_first=float((r == 1).mean()) if len(r) else np.nan, p_revert_first=float((r == -1).mean()) if len(r) else np.nan,
                median_bars=float(np.nanmedian(t[np.isfinite(t)])) if np.isfinite(t).any() else np.nan)


def export_chart(case, F, ev, _):
    T = F['T'] // 10**9 if case == 'case1' else pd.to_datetime(pd.Series(F['dates'])).astype('int64').to_numpy() // 10**9
    ser = dict(t=[int(v) for v in T], x=[round(float(v), 3) for v in F['x']], p=[round(float(np.exp(v)), 5 if case == 'case2' else 1) for v in F['p']])
    evs = []
    for j in range(len(ev['co'])):
        c, tu = int(ev['co'][j]), int(ev['tu'][j])
        evs.append(dict(turn=int(T[tu]), conf=int(T[c]), dir=int(ev['di'][j]), e=int(ev['e'][j]), per=str(ev['per'][j]),
                        y={h: (None if not np.isfinite(ev['Y'][h][j]) else round(float(ev['Y'][h][j]), 3)) for h in F['H']},
                        tags=[t for t in TYPES[1:] if ev['TY'][t][j]] + [c_ for c_ in ('C1', 'C2') if ev['CF'][c_][j]]))
    json.dump(dict(series=ser, events=evs), open(os.path.join(OUT, f'chart_{case}.json'), 'w'))


def clean(o):
    if isinstance(o, dict): return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)): return [clean(v) for v in o]
    if isinstance(o, (np.floating, float)): return None if not np.isfinite(o) else float(o)
    if isinstance(o, (np.integer,)): return int(o)
    if isinstance(o, np.bool_): return bool(o)
    return o


if __name__ == '__main__':
    which = sys.argv[1] if len(sys.argv) > 1 else 'both'
    for case in (['case1', 'case2'] if which == 'both' else [which]):
        R = run_case(case)
        json.dump(clean(R), open(os.path.join(OUT, f'results_{case}.json'), 'w'), indent=1)
        print(case, 'done', R['runtime_s'], 's', flush=True)
