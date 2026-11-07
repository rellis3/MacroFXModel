"""jump-next-day-miss -- forge/JUMP_NEXT_DAY_MISS_PREREG.md.

After a BNS jump day on an instrument, does the NEXT London session's realised H->L exceed its point-in-time
forecast p50 by more than the forecast (sigma) already allows?  Size only, never direction.

  y(t+1)   = ln(r_hl / pit_hl_p50) on session t+1 (also: r_hl > pit_hl_p75, r_hl > pit_hl_p90)
  J(t)     = jump_bns on session t (analysis/output/jumps/flags_seasonal.csv, BNS 1%, JUMPS_PREREG Amendment 2)
  J5(t)    = sum of jump_bns over sessions t-4..t (secondary)
  controls = instrument fixed effects, m_prev = ln(r_hl/pit_hl_p50) on t, causal sigma tercile of t+1
             (pit_sig_used vs its previous 250 sessions' 1/3 and 2/3 quantiles), S&P 5d fall, VIX 5d change,
             month-end (both known by 00:00 UTC on t+1, as forecast-miss-scan)

Data root: the main checkout (forecast_history, flags and features are gitignored). Override with DATA_ROOT.
  python -I scripts/jump-next-day-miss/run.py --power   (counts and control-only SDs; no setup outcome)
  python -I scripts/jump-next-day-miss/run.py           (the registered run, once)
"""
import json, math, os, sys
import numpy as np
import pandas as pd

SEED = 20261106
B, BLOCK, N_PLACEBO = 2000, 21, 1000
SPLIT = pd.Timestamp('2023-08-21')
LOCKBOX = pd.Timestamp('2026-08-21')
BAR = math.log(1.05)          # practical pass bar: +5% on realised/forecast
FLOOR = math.log(1.03)        # VALIDATED also needs the point estimate >= +3%
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
DATA = os.environ.get('DATA_ROOT', r'C:\Users\relli\OneDrive\Documents\Programming\Trading\v2 trading model\MacroFXModel')
FH = os.path.join(DATA, 'analysis', 'output', 'forecast_history')
FLAGS = os.path.join(DATA, 'analysis', 'output', 'jumps', 'flags_seasonal.csv')
OUT = os.path.join(REPO, 'analysis', 'output', 'jump-next-day-miss')
MAJORS = {'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD'}
INDICES = {'NQ', 'SPX500', 'DOW', 'US2000', 'DE30', 'UK100'}
CLASSES = ['fx_majors', 'fx_crosses', 'indices', 'gold']


def klass(s):
    return 'gold' if s == 'GOLD' else 'indices' if s in INDICES else 'fx_majors' if s in MAJORS else 'fx_crosses'


class PIT:
    """value known by each session date 00:00 UTC; k observations back (as scripts/forecast-miss-scan/run.py)."""
    def __init__(self, fid):
        df = pd.read_parquet(os.path.join(DATA, 'features', f'{fid}.parquet'))
        df['date'] = pd.to_datetime(df['date'])
        df['asof'] = pd.to_datetime(df['asof'], utc=True).dt.tz_localize(None)
        df = df.sort_values(['date', 'asof']).drop_duplicates('date', keep='first').dropna(subset=['value'])
        df = df.sort_values('asof').reset_index(drop=True)
        self.a = df['asof'].values; self.v = df['value'].values.astype(float)

    def at(self, sessions, k=0):
        j = np.searchsorted(self.a, np.asarray(sessions, dtype='datetime64[ns]'), side='right') - 1 - k
        out = np.where(j >= 0, self.v[np.clip(j, 0, None)], np.nan)
        return out


def load():
    flags = pd.read_csv(FLAGS, usecols=['inst', 'date', 'jump_bns', 'z_bns'])
    cols = ['inst', 'date', 'oos', 'r_hl', 'pit_hl_p50', 'pit_hl_p75', 'pit_hl_p90', 'pit_sig_used', 'last_min']
    parts = []
    for f in sorted(os.listdir(FH)):
        if not f.endswith('.csv'):
            continue
        d = pd.read_csv(os.path.join(FH, f), usecols=cols).sort_values('date').reset_index(drop=True)
        d = d.merge(flags, on=['inst', 'date'], how='left')
        d['date'] = pd.to_datetime(d['date'])
        d['complete'] = d.last_min >= 20 * 60
        d['e'] = np.log(d.r_hl / d.pit_hl_p50)
        # the flag only counts on a complete session; incomplete sessions give J = NaN (row dropped below)
        jb = d.jump_bns.where(d.complete)
        d['J'] = jb
        d['J5'] = jb.rolling(5, min_periods=5).sum()
        s = d.pit_sig_used
        q1 = s.shift(1).rolling(250, min_periods=120).quantile(1 / 3)
        q2 = s.shift(1).rolling(250, min_periods=120).quantile(2 / 3)
        terc = np.where(s.isna() | q1.isna(), np.nan, np.where(s <= q1, 0, np.where(s >= q2, 2, 1)))
        nx = pd.DataFrame({
            'date1': d.date.shift(-1), 'e1': d.e.shift(-1), 'r_hl1': d.r_hl.shift(-1),
            'p75_1': d.pit_hl_p75.shift(-1), 'p90_1': d.pit_hl_p90.shift(-1), 'oos1': d.oos.shift(-1),
            'complete1': d.complete.shift(-1), 'sterc1': pd.Series(terc).shift(-1)})
        d = pd.concat([d, nx], axis=1)
        parts.append(d)
    X = pd.concat(parts, ignore_index=True)
    X['gapdays'] = (X.date1 - X.date).dt.days
    keep = (X.complete & (X.complete1 == True) & (X.oos1 == 1) & (X.date1 <= LOCKBOX) & (X.gapdays <= 4)
            & np.isfinite(X.e) & np.isfinite(X.e1) & X.J.notna() & X.sterc1.notna())
    X = X[keep].copy()
    assert (X.date1 > X.date).all()
    X['klass'] = X.inst.map(klass)
    X['exc75'] = (X.r_hl1 > X.p75_1).astype(float)
    X['exc90'] = (X.r_hl1 > X.p90_1).astype(float)
    X = X.rename(columns={'e': 'm_prev'})
    # stress controls on the target session's date (known by 00:00 UTC that day)
    S = pd.DatetimeIndex(sorted(X.date1.unique()))
    spx, vix = PIT('px_d1_spx500'), PIT('vix')
    spx5 = -(np.log(spx.at(S)) - np.log(spx.at(S, 5))) * 100
    vix5 = vix.at(S) - vix.at(S, 5)
    months = pd.Series(S.to_period('M'), index=S)
    pos = months.groupby(months).cumcount().values; nin = months.map(months.value_counts()).values
    me = ((pos <= 1) | (pos >= nin - 2)).astype(float)
    st = pd.DataFrame({'spx5': spx5, 'vix5': vix5, 'month_end': me}, index=S)
    X = X.join(st, on='date1')
    X['quarter'] = X.date.dt.to_period('Q').astype(str)
    return X.reset_index(drop=True)


def design(D, pred, stress=True, prev=True):
    """Columns: predictor first, then controls; instrument fixed effects (no global intercept)."""
    cols = [D[pred].to_numpy(float)]
    names = [pred]
    if prev:
        cols.append(D.m_prev.to_numpy(float)); names.append('m_prev')
    for k in (1, 2):
        cols.append((D.sterc1 == k).to_numpy(float)); names.append(f'sterc{k}')
    if stress:
        for c in ('spx5', 'vix5', 'month_end'):
            cols.append(D[c].fillna(D[c].mean()).to_numpy(float)); names.append(c)
    for i in sorted(D.inst.unique()):
        cols.append((D.inst == i).to_numpy(float)); names.append(f'fe_{i}')
    Xm = np.column_stack(cols)
    # drop all-constant non-FE columns (e.g. month_end has no variance? never; guard anyway)
    return Xm, names


def date_index(D):
    dates = np.sort(D.date1.unique())
    di = pd.Series(np.arange(len(dates)), index=dates)[D.date1].to_numpy()
    return dates, di


def per_date_moments(Xm, y, di, nd):
    p = Xm.shape[1]
    XtX = np.zeros((nd, p, p)); Xty = np.zeros((nd, p))
    np.add.at(XtX, di, Xm[:, :, None] * Xm[:, None, :])
    np.add.at(Xty, di, Xm * y[:, None])
    return XtX, Xty


def mbb_weights(nd, rng, B):
    """Moving-block bootstrap over the date sequence: how many times each date is drawn (B x nd)."""
    W = np.zeros((B, nd))
    nb = math.ceil(nd / BLOCK)
    for b in range(B):
        st = rng.integers(0, nd - BLOCK + 1, nb)
        idx = (st[:, None] + np.arange(BLOCK)[None, :]).ravel()[:nd]
        W[b] = np.bincount(idx, minlength=nd)
    return W


def beta_boot(XtX, Xty, W):
    A = np.einsum('bd,dij->bij', W, XtX); c = np.einsum('bd,di->bi', W, Xty)
    A += np.eye(A.shape[1])[None] * 1e-9
    return np.linalg.solve(A, c[..., None])[..., 0]


def ols(Xm, y):
    return np.linalg.lstsq(Xm, y, rcond=None)[0]


def pct(x):
    return 100 * (math.exp(x) - 1)


def power(X):
    """Counts and control-only SDs (no split of any outcome by the jump flag)."""
    rows = []
    for c in CLASSES:
        D = X[X.klass == c]
        n1 = int(D.J.sum()); n0 = int(len(D) - n1)
        Xc, _ = design(D, 'm_prev', stress=True, prev=False)          # controls only, no jump flag
        r = D.e1.to_numpy() - Xc @ ols(Xc, D.e1.to_numpy())
        sd = float(r.std())
        # date-level ICC of the residual (one-way ANOVA estimator)
        g = pd.Series(r).groupby(D.date1.to_numpy())
        k = g.size(); mean_k = k.mean()
        msb = (k * (g.mean() - r.mean()) ** 2).sum() / max(len(k) - 1, 1)
        msw = ((r - g.transform('mean').to_numpy()) ** 2).sum() / max(len(r) - len(k), 1)
        k0 = (len(r) - (k ** 2).sum() / len(r)) / max(len(k) - 1, 1)
        icc = float(max((msb - msw) / (msb + (k0 - 1) * msw), 0)) if len(k) > 1 and k0 > 1 else 0.0
        jd = D[D.J == 1].groupby('date1').size()
        m_j = float(jd.mean()) if len(jd) else 0.0
        ac1 = float(pd.Series(r).groupby(D.inst.to_numpy()).apply(lambda s: s.autocorr(1)).mean())
        deff = (1 + max(m_j - 1, 0) * icc) * (1 + 2 * max(ac1, 0))   # co-jump clustering x residual serial corr
        z = 2.4977 + 0.8416                    # two-sided alpha 0.05/4 (Holm worst case), 80% power
        se = sd * math.sqrt(deff * (1 / max(n1, 1) + 1 / max(n0, 1)))
        mde = z * se
        rows.append(dict(cls=c, n_inst=int(D.inst.nunique()), n_rows=int(len(D)), n_jump=n1, n_other=n0,
                         jump_rate=n1 / len(D), resid_sd=sd, icc=icc, cojump_mean=m_j, ac1=ac1, deff=deff,
                         mde_log=mde, mde_pct=pct(mde), powered=bool(mde <= BAR),
                         first=str(D.date1.min().date()), last=str(D.date1.max().date())))
    return rows


def holm(ps, alpha=0.05):
    order = sorted(range(len(ps)), key=lambda i: ps[i]); m = len(ps); adj = [1.0] * m; run = 0.0
    for r, i in enumerate(order):
        run = max(run, min(1.0, (m - r) * ps[i])); adj[i] = run
    return adj


def placebo_betas(D, pred, rng, n):
    """Shuffle J within instrument x calendar quarter (of session t); J5 is rebuilt from the shuffled J
    over the same instrument's consecutive kept rows. FWL: residualise on the controls once."""
    D = D[D[pred].notna()].reset_index(drop=True)
    Xm, names = design(D, pred)
    Z = Xm[:, 1:]; y = D.e1.to_numpy()
    Q, _ = np.linalg.qr(Z)
    ey = y - Q @ (Q.T @ y)
    groups = D.groupby(['inst', 'quarter']).indices
    J = D.J.to_numpy(float)
    out = np.empty(n)
    for k in range(n):
        Js = J.copy()
        for idx in groups.values():
            Js[idx] = J[rng.permutation(idx)]
        if pred == 'J5':
            v = pd.Series(Js).groupby(D.inst.to_numpy()).transform(lambda s: s.rolling(5, min_periods=1).sum()).to_numpy()
        else:
            v = Js
        vt = v - Q @ (Q.T @ v)
        out[k] = (vt @ ey) / (vt @ vt)
    return out


def fit_cell(D, pred, target, rng, stress=True, prev=True, boot=True):
    D = D[D[pred].notna()].reset_index(drop=True)
    Xm, names = design(D, pred, stress=stress, prev=prev)
    y = D[target].to_numpy(float)
    b = ols(Xm, y)[0]
    res = dict(beta=float(b))
    if boot:
        dates, di = date_index(D)
        XtX, Xty = per_date_moments(Xm, y, di, len(dates))
        W = mbb_weights(len(dates), rng, B)
        bb = beta_boot(XtX, Xty, W)[:, 0]
        lo, hi = np.nanpercentile(bb, [2.5, 97.5])
        p = float(min(1.0, 2 * min((bb <= 0).mean(), (bb >= 0).mean())))
        res.update(lo=float(lo), hi=float(hi), p_boot=max(p, 1 / B), se=float(np.nanstd(bb)))
    return res


def main():
    rng = np.random.default_rng(SEED)
    X = load()
    os.makedirs(OUT, exist_ok=True)
    pw = power(X)
    if '--power' in sys.argv:
        print(json.dumps(pw, indent=2)); return
    res = dict(id='jump-next-day-miss', seed=SEED, B=B, block=BLOCK, n_placebo=N_PLACEBO, bar_pct=pct(BAR),
               floor_pct=pct(FLOOR), sample=[str(X.date1.min().date()), str(X.date1.max().date())],
               n_rows=int(len(X)), power=pw, classes={})
    for c in CLASSES:
        D = X[X.klass == c].reset_index(drop=True)
        r = {}
        # raw and same-vol (sigma-tercile matched) differences, descriptive
        j, o = D[D.J == 1], D[D.J == 0]
        r['raw_diff_log'] = float(j.e1.mean() - o.e1.mean())
        r['mean_e1_jump'] = float(j.e1.mean()); r['mean_e1_other'] = float(o.e1.mean())
        r['exc75_jump'] = float(j.exc75.mean()); r['exc75_other'] = float(o.exc75.mean())
        r['exc90_jump'] = float(j.exc90.mean()); r['exc90_other'] = float(o.exc90.mean())
        r['prev_miss_jump'] = float(j.m_prev.mean()); r['prev_miss_other'] = float(o.m_prev.mean())
        tm = []
        for t in (0, 1, 2):
            a, bq = j[j.sterc1 == t], o[o.sterc1 == t]
            if len(a) > 5 and len(bq) > 5:
                tm.append((len(a), a.e1.mean() - bq.e1.mean()))
        r['sigma_matched_diff_log'] = float(sum(n * v for n, v in tm) / sum(n for n, _ in tm)) if tm else None
        # models: (A) primary: all controls; (B) sigma tercile only; (C) sigma + previous miss (no stress)
        r['primary'] = fit_cell(D, 'J', 'e1', rng)
        r['sigma_only'] = fit_cell(D, 'J', 'e1', rng, stress=False, prev=False)
        r['sigma_prevmiss'] = fit_cell(D, 'J', 'e1', rng, stress=False, prev=True)
        r['exc75'] = fit_cell(D, 'J', 'exc75', rng)
        r['exc90'] = fit_cell(D, 'J', 'exc90', rng)
        r['J5'] = fit_cell(D, 'J5', 'e1', rng)
        for h, m in (('half1', D.date1 < SPLIT), ('half2', D.date1 >= SPLIT)):
            r[h] = fit_cell(D[m].reset_index(drop=True), 'J', 'e1', rng)
        pl = placebo_betas(D, 'J', rng, N_PLACEBO)
        r['placebo_pctile'] = float((pl < r['primary']['beta']).mean() * 100)
        r['placebo_95'] = [float(np.percentile(pl, 2.5)), float(np.percentile(pl, 97.5))]
        pl5 = placebo_betas(D, 'J5', rng, N_PLACEBO)
        r['J5']['placebo_pctile'] = float((pl5 < r['J5']['beta']).mean() * 100)
        res['classes'][c] = r
        print(c, 'done', flush=True)
    padj = holm([res['classes'][c]['primary']['p_boot'] for c in CLASSES])
    pwd = {p['cls']: p for p in pw}
    for c, pa in zip(CLASSES, padj):
        r = res['classes'][c]; pr = r['primary']; r['p_holm'] = pa
        both = (r['half1']['beta'] > 0) and (r['half2']['beta'] > 0)
        sig = pa < 0.05
        if sig and pr['beta'] > 0 and pr['beta'] >= FLOOR and r['placebo_pctile'] > 97.5 and both:
            v = 'VALIDATED'
        elif sig and (pr['beta'] < 0 or pr['beta'] < FLOOR):
            v = 'CONTEXT'
        elif pwd[c]['powered'] and pr['hi'] < BAR:
            v = 'NULL'
        else:
            v = 'UNDERPOWERED'
        r['verdict'] = v; r['both_halves_positive'] = bool(both)
    vs = [res['classes'][c]['verdict'] for c in CLASSES]
    if 'VALIDATED' in vs: ov = 'VALIDATED'
    elif 'CONTEXT' in vs: ov = 'CONTEXT'
    elif vs.count('NULL') >= 2 and all(v in ('NULL', 'UNDERPOWERED') for v in vs): ov = 'NULL'
    else: ov = 'UNDERPOWERED'
    res['verdict'] = ov
    with open(os.path.join(OUT, 'results.json'), 'w', newline='') as f:
        json.dump(res, f, indent=2, default=float)
    for c in CLASSES:
        r = res['classes'][c]; p = r['primary']
        print(f"{c:10} {r['verdict']:12} beta {pct(p['beta']):+.1f}% [{pct(p['lo']):+.1f}, {pct(p['hi']):+.1f}] "
              f"p {p['p_boot']:.4f} holm {r['p_holm']:.4f} placebo {r['placebo_pctile']:.1f} | raw {pct(r['raw_diff_log']):+.1f}% "
              f"sig-only {pct(r['sigma_only']['beta']):+.1f}% sig+prev {pct(r['sigma_prevmiss']['beta']):+.1f}% | "
              f"exc75 {100*r['exc75']['beta']:+.1f}pp exc90 {100*r['exc90']['beta']:+.1f}pp | J5 {pct(r['J5']['beta']):+.1f}% "
              f"| halves {pct(r['half1']['beta']):+.1f} / {pct(r['half2']['beta']):+.1f}")
    print('OVERALL', ov)


if __name__ == '__main__':
    main()
