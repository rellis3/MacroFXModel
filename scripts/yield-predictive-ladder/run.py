"""yield-predictive-ladder: the registered run (forge/YIELD_PREDICTIVE_LADDER_PREREG.md + A1). Phases A-F for EURUSD and NDX.
python scripts/yield-predictive-ladder/run.py [eurusd|nq|both]   (env NPLAC, default 200)"""
import os, sys, json, time
import numpy as np, pandas as pd
from scipy.stats import norm, spearmanr

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'analysis', 'output', 'yield-predictive-ladder')
SEED = 20261021
NPLAC = int(os.environ.get('NPLAC', 200))
HS = (1, 5, 20)
LAMBDAS = 10.0 ** np.arange(-2, 3.01, 1.0)
COST = {'eurusd': 1.0e-4, 'nq': 1.5e-4}
VAL = ('2015-01-01', '2019-12-31'); TEST = ('2020-01-01', '2026-08-21')


def cols(P, pre): return [c for c in P.columns if c.startswith(pre)]


def nw_se_mean(x, lag):
    x = np.asarray(x, float); x = x[np.isfinite(x)]; n = len(x)
    if n < 10: return np.nan
    e = x - x.mean(); g0 = e @ e / n; s = g0
    for k in range(1, lag + 1):
        s += 2 * (1 - k / (lag + 1)) * (e[k:] @ e[:-k] / n)
    return np.sqrt(max(s, 1e-300) / n)


# ───────────────────────────── ridge walk-forward ─────────────────────────────
def winsor_fit(X):
    lo, hi = np.nanpercentile(X, 0.5, axis=0), np.nanpercentile(X, 99.5, axis=0)
    return lo, hi


def ridge_fit(X, y, lam):
    mu, sd = X.mean(0), X.std(0); sd[sd == 0] = 1
    Z = (X - mu) / sd; ym = y.mean()
    b = np.linalg.solve(Z.T @ Z + lam * len(y) * np.eye(Z.shape[1]), Z.T @ (y - ym))
    return mu, sd, ym, b


def ridge_pred(m, X):
    mu, sd, ym, b = m
    return ym + ((X - mu) / sd) @ b


def choose_lambda(X, y, h):
    n = len(y); k = 5; edges = np.linspace(0, n, k + 1).astype(int); best, bl = np.inf, LAMBDAS[0]
    for lam in LAMBDAS:
        sse = 0.0
        for i in range(1, k):                              # forward-chaining blocks: train on everything before the block, purge h
            a, b = edges[i], edges[i + 1]
            tr = np.arange(0, max(0, a - h)); te = np.arange(a, b)
            if len(tr) < 200: continue
            m = ridge_fit(X[tr], y[tr], lam); sse += np.sum((y[te] - ridge_pred(m, X[te])) ** 2)
        if sse < best: best, bl = sse, lam
    return bl


def walk_forward(P, feats, h, interactions=None, keep_coef=False):
    """annual expanding refits from 2015; returns forecast series (index = P.index) and per-year coefficients."""
    y = P[f'y{h}'].to_numpy(); X = P[feats].to_numpy(float) if feats else np.zeros((len(P), 0))
    if interactions:
        X = np.column_stack([X] + [P[r].to_numpy(float)[:, None] * P[interactions].to_numpy(float) for r in ('R1_realup', 'R2_hawk', 'R3_riskoff')])
    dates = P.index; f = np.full(len(P), np.nan); coefs = {}
    ok_all = np.isfinite(X).all(1)
    for yr in range(2015, 2027):
        start = pd.Timestamp(f'{yr}-01-01'); end = pd.Timestamp(f'{yr}-12-31')
        te = np.where((dates >= start) & (dates <= end) & ok_all)[0]
        if not len(te): continue
        tr_end = np.searchsorted(dates.values, start.to_datetime64()) - h          # purge rows whose target overlaps the forecast year
        tr = np.arange(0, max(0, tr_end)); tr = tr[ok_all[tr] & np.isfinite(y[tr])]
        if X.shape[1] == 0:
            f[te] = y[tr].mean(); continue
        lo, hi = winsor_fit(X[tr]); Xc = np.clip(X, lo, hi)
        lam = choose_lambda(Xc[tr], y[tr], h)
        m = ridge_fit(Xc[tr], y[tr], lam); f[te] = ridge_pred(m, Xc[te])
        if keep_coef: coefs[yr] = dict(lam=float(lam), b=list(map(float, m[3])))
    return pd.Series(f, index=dates), coefs


def score(y, f_small, f_big, h, mask):
    k = mask & np.isfinite(y) & np.isfinite(f_small) & np.isfinite(f_big)
    y, a, b = y[k], f_small[k], f_big[k]
    if len(y) < 50: return {}
    e1, e2 = y - a, y - b
    r2 = 1 - np.sum(e2 ** 2) / np.sum(e1 ** 2)
    cw = e1 ** 2 - (e2 ** 2 - (a - b) ** 2); se = nw_se_mean(cw, max(1, h)); t = cw.mean() / se if se > 0 else np.nan
    ic = spearmanr(b, y).correlation; ic_t = ic * np.sqrt(len(y) / h)
    hit = float(np.mean(np.sign(b - np.median(b)) == np.sign(y))) if False else float(np.mean(np.sign(b) == np.sign(y)))
    return dict(n=int(len(y)), r2_gain=float(r2), cw_t=float(t), cw_p=float(norm.sf(t)) if np.isfinite(t) else np.nan, ic=float(ic), ic_t=float(ic_t), ic_lo=float(ic - 1.96 * np.sqrt(h / len(y))),
                ic_hi=float(ic + 1.96 * np.sqrt(h / len(y))), hit=hit)


def model_sets(P, asset, no_tp=False):
    rate = [c for c in cols(P, 'r_') if not (no_tp and 'TP10' in c)]
    rate20 = [c for c in rate if c.endswith('d20')]
    base = cols(P, 'b_'); macro = cols(P, 'm_')
    return rate, rate20, base, macro


def m5_select(P, rate, h):
    """rate features whose univariate training IC (2005-2014) has the same sign in both halves and |t|>=2 (NW)"""
    tr = P[(P.index < '2015-01-01')]; y = tr[f'y{h}'].to_numpy(); keep = []
    halves = (tr.index < '2010-01-01')
    for c in rate:
        x = tr[c].to_numpy(); ok = np.isfinite(x) & np.isfinite(y)
        if ok.sum() < 300: continue
        ic = spearmanr(x[ok], y[ok]).correlation; t = ic * np.sqrt(ok.sum() / h)
        s1 = spearmanr(x[ok & halves], y[ok & halves]).correlation; s2 = spearmanr(x[ok & ~halves], y[ok & ~halves]).correlation
        if abs(t) >= 2 and np.sign(s1) == np.sign(s2) == np.sign(ic): keep.append(c)
    return keep


def ladder(P, asset, h, shift=0, no_tp=False, lag2=False, coef=False):
    Q = P.copy()
    rate, rate20, base, macro = model_sets(Q, asset, no_tp)
    if lag2:
        Q[rate + base + macro] = Q[rate + base + macro].shift(1)
    if shift:
        Q[rate] = np.roll(Q[rate].to_numpy(), shift, axis=0)
    sel = m5_select(Q, rate, h)
    F = {}; C = {}
    F['M0'], _ = walk_forward(Q, [], h)
    F['M1'], _ = walk_forward(Q, base, h)
    F['M2'], C['M2'] = walk_forward(Q, rate, h, keep_coef=coef)
    F['M3'], C['M3'] = walk_forward(Q, base + rate + macro, h, keep_coef=coef)
    F['M4'], _ = walk_forward(Q, base + rate + macro, h, interactions=rate20)
    F['M5'], _ = walk_forward(Q, base + macro + sel, h) if sel else (F['M1'] * np.nan, None)
    return F, dict(rate=rate, base=base, macro=macro, sel=sel), C


def periods_mask(idx, p):
    a, b = (VAL if p == 'validate' else TEST if p == 'test' else ('2015-01-01', '2026-08-21'))
    return np.asarray((idx >= a) & (idx <= b))


# ───────────────────────────── trading rule ─────────────────────────────
def rule(P, f, h, cost):
    s = np.sign(f.to_numpy()); s[~np.isfinite(s)] = 0
    pos = pd.Series(s).rolling(h, min_periods=1).mean().to_numpy()          # h overlapping tranches
    r = P['ret_next'].to_numpy(); pnl = pos * r
    turn = np.abs(np.diff(np.r_[0, pos])); net = pnl - turn * cost
    return pd.Series(np.where(np.isfinite(net), net, 0), index=P.index), pd.Series(np.where(np.isfinite(pnl), pnl, 0), index=P.index), pos, turn


def stats_ret(x, pos=None, turn=None):
    x = np.asarray(x); sd = x.std()
    sh = x.mean() / sd * np.sqrt(252) if sd > 0 else np.nan
    dn = x[x < 0].std(); so = x.mean() / dn * np.sqrt(252) if dn > 0 else np.nan
    eq = np.cumsum(x); dd = float(np.max(np.maximum.accumulate(eq) - eq)) if len(eq) else np.nan
    o = dict(ann_ret=float(x.mean() * 252), sharpe=float(sh), sortino=float(so), max_dd=dd)
    if pos is not None: o.update(exposure=float(np.mean(np.abs(pos))), turnover_ann=float(np.sum(turn) / len(x) * 252))
    return o


def block_boot_diff(a, b, rng, B=2000, block=21):
    a, b = np.asarray(a), np.asarray(b); n = len(a); nb = int(np.ceil(n / block)); out = []
    sh = lambda x: x.mean() / x.std() * np.sqrt(252) if x.std() > 0 else 0.0
    for _ in range(B):
        st = rng.integers(0, n - block, nb); ix = (st[:, None] + np.arange(block)).ravel()[:n]
        out.append(sh(a[ix]) - sh(b[ix]))
    return float(np.percentile(out, 2.5)), float(np.percentile(out, 97.5))


# ───────────────────────────── Phase A / B / C (descriptive) ─────────────────────────────
def phase_ab(P, asset):
    xs = [c for c in P.columns if c.startswith('x_') and c.endswith('_d1_sameday')]
    r1 = P['logp'].diff()           # same-day return d-1 -> d (exact date)
    subs = [('2005-09', '2005-01-01', '2009-12-31'), ('2010-14', '2010-01-01', '2014-12-31'), ('2015-19', '2015-01-01', '2019-12-31'), ('2020-26', '2020-01-01', '2026-08-21')]
    A = []
    for c in xs:
        k = c[2:-11]
        dx1 = P[c]
        for h in HS:
            dxh = dx1.rolling(h).sum(); rh = r1.rolling(h).sum()
            for lab, a, b in subs:
                m = (P.index >= a) & (P.index <= b) & dxh.notna() & rh.notna()
                if m.sum() < 100: continue
                pr = float(np.corrcoef(dxh[m], rh[m])[0, 1]); sr = spearmanr(dxh[m], rh[m]).correlation
                se = np.sqrt(h / m.sum())
                A.append(dict(var=k, h=h, period=lab, pearson=pr, spearman=float(sr), lo=pr - 1.96 * se, hi=pr + 1.96 * se, n=int(m.sum())))
    # levels vs changes
    LV = []
    for c in xs:
        k = c[2:-11]; lv = P[f'x_{k}_level']; m = lv.notna()
        LV.append(dict(var=k, level_corr=float(np.corrcoef(lv[m], P['logp'][m])[0, 1]), change_corr=float(np.corrcoef(P[c][m & P[c].notna() & r1.notna()], r1[m & P[c].notna() & r1.notna()])[0, 1])))
    # rolling 252 corr + beta (1-day changes)
    ROLL = {}
    for c in xs:
        k = c[2:-11]; d = pd.concat([P[c], r1], axis=1, keys=['x', 'r']).dropna()
        rc = d['x'].rolling(252, min_periods=200).corr(d['r'])
        cov = d['x'].rolling(252, min_periods=200).cov(d['r']); var = d['x'].rolling(252, min_periods=200).var()
        beta = cov / var; resid_var = d['r'].rolling(252, min_periods=200).var() * (1 - rc ** 2); se = np.sqrt(resid_var / (var * 251))
        w = rc.resample('ME').last().dropna()
        ROLL[k] = dict(t=[str(i.date()) for i in w.index], corr=[float(v) for v in w], beta=[float(v) for v in (beta.resample('ME').last().reindex(w.index) * 1e4)],
                       beta_se=[float(v) for v in (se.resample('ME').last().reindex(w.index) * 1e4)])
    # lag profile k=-10..10 (k>0: rate change k days before the return)
    LAGP = []
    for c in xs:
        k_ = c[2:-11]
        for per, a, b in [('2005-14', '2005-01-01', '2014-12-31'), ('2015-19', '2015-01-01', '2019-12-31'), ('2020-26', '2020-01-01', '2026-08-21'), ('all', '2005-01-01', '2026-08-21')]:
            for L in range(-10, 11):
                x = P[c].shift(L); m = (P.index >= a) & (P.index <= b) & x.notna() & r1.notna()
                if m.sum() < 100: continue
                rr = float(np.corrcoef(x[m], r1[m])[0, 1]); se = 1 / np.sqrt(m.sum())
                LAGP.append(dict(var=k_, period=per, lag=L, corr=rr, lo=rr - 1.96 * se, hi=rr + 1.96 * se, n=int(m.sum())))
    # Granger (VAR 5 lags) both directions
    from statsmodels.tsa.stattools import grangercausalitytests
    GR = []
    for c in xs:
        k_ = c[2:-11]
        for per, a, b in [('2005-14', '2005-01-01', '2014-12-31'), ('2015-19', '2015-01-01', '2019-12-31'), ('2020-26', '2020-01-01', '2026-08-21')]:
            d = pd.concat([r1, P[c]], axis=1, keys=['r', 'x']).loc[a:b].dropna()
            if len(d) < 200: continue
            try:
                p_fwd = grangercausalitytests(d[['r', 'x']].to_numpy(), 5, verbose=False)[5][0]['ssr_ftest'][1]
                p_rev = grangercausalitytests(d[['x', 'r']].to_numpy(), 5, verbose=False)[5][0]['ssr_ftest'][1]
            except Exception:
                p_fwd = p_rev = np.nan
            GR.append(dict(var=k_, period=per, p_rates_to_asset=float(p_fwd), p_asset_to_rates=float(p_rev)))
    # event split (same-day corr on release vs non-release days, 2007-07+)
    EV = []
    for c in xs:
        k_ = c[2:-11]
        for lab, cond in (('release', P['release'] == 1), ('no_release', P['release'] == 0)):
            m = cond & P[c].notna() & r1.notna()
            if m.sum() > 100: EV.append(dict(var=k_, days=lab, corr=float(np.corrcoef(P[c][m], r1[m])[0, 1]), n=int(m.sum())))
    return dict(sameday=A, levels_vs_changes=LV, rolling=ROLL, lag_profile=LAGP, granger=GR, events=EV)


def phase_c(P, asset, F):
    """same-day link by regime (descriptive) + forward IC of M3 by regime on 2015-26"""
    r1 = P['logp'].diff(); out = []
    for reg in ('R1_realup', 'R2_hawk', 'R3_riskoff', 'R4_highvol', 'release'):
        for st in (0.0, 1.0):
            m = P[reg] == st
            for c in [x for x in P.columns if x.startswith('x_') and x.endswith('_d1_sameday')]:
                mm = m & P[c].notna() & r1.notna()
                if mm.sum() > 150:
                    out.append(dict(kind='sameday', regime=reg, state=st, var=c[2:-11], corr=float(np.corrcoef(P[c][mm], r1[mm])[0, 1]), n=int(mm.sum())))
            for h in HS:
                f = F[h]['M3'].to_numpy(); y = P[f'y{h}'].to_numpy(); mm = np.asarray(m) & periods_mask(P.index, 'oos') & np.isfinite(f) & np.isfinite(y)
                if mm.sum() > 100:
                    ic = spearmanr(f[mm], y[mm]).correlation
                    out.append(dict(kind='forward_M3', regime=reg, state=st, h=h, ic=float(ic), ic_se=float(np.sqrt(h / mm.sum())), n=int(mm.sum())))
    return out


# ───────────────────────────── main ─────────────────────────────
def run(asset):
    t0 = time.time(); rng = np.random.default_rng(SEED + (1 if asset == 'eurusd' else 2))
    P = pd.read_parquet(os.path.join(OUT, f'panel_{asset}.parquet'))
    R = dict(asset=asset, seed=SEED, nplacebo=NPLAC)
    R['phase_ab'] = phase_ab(P, asset); print(asset, 'phase A/B', round(time.time() - t0), flush=True)
    F, SETS, COEF = {}, {}, {}
    for h in HS:
        F[h], SETS[h], COEF[h] = ladder(P, asset, h, coef=True)
    R['m5_selected'] = {h: SETS[h]['sel'] for h in HS}
    # scored cells
    cells = []
    for h in HS:
        y = P[f'y{h}'].to_numpy()
        for mdl in ('M2', 'M3', 'M4', 'M5'):
            row = dict(h=h, model=mdl)
            for per in ('validate', 'test', 'oos'):
                s = score(y, F[h]['M1'].to_numpy(), F[h][mdl].to_numpy(), h, periods_mask(P.index, per))
                row.update({f'{per}_{k}': v for k, v in s.items()})
            s0 = score(y, F[h]['M0'].to_numpy(), F[h][mdl].to_numpy(), h, periods_mask(P.index, 'test'))
            row['test_r2_vs_M0'] = s0.get('r2_gain')
            cells.append(row)
        for base_m in ('M1',):
            s = score(y, F[h]['M0'].to_numpy(), F[h][base_m].to_numpy(), h, periods_mask(P.index, 'test'))
            R.setdefault('baseline_vs_mean', {})[h] = s
    print(asset, 'ladder', round(time.time() - t0), flush=True)
    # placebo: shifted rate block, 200 draws, test R2 gain per (h, model)
    n = len(P); PL = {(c['h'], c['model']): [] for c in cells}
    for d in range(NPLAC):
        sh = int(rng.integers(250, n - 250))
        for h in HS:
            Fp, _, _ = ladder(P, asset, h, shift=sh)
            y = P[f'y{h}'].to_numpy()
            for mdl in ('M2', 'M3', 'M4', 'M5'):
                s = score(y, Fp['M1'].to_numpy(), Fp[mdl].to_numpy(), h, periods_mask(P.index, 'test'))
                PL[(h, mdl)].append(s.get('r2_gain', np.nan))
        if d % 20 == 0: print(asset, 'placebo', d, round(time.time() - t0), flush=True)
    for c in cells:
        a = np.array(PL[(c['h'], c['model'])], float); a = a[np.isfinite(a)]
        c['plc_r2_p95'] = float(np.percentile(a, 95)) if len(a) else np.nan; c['plc_r2_mean'] = float(a.mean()) if len(a) else np.nan
    # gate
    from statsmodels.stats.multitest import multipletests
    tp = np.array([c.get('test_cw_p', np.nan) for c in cells], float)
    ok = np.isfinite(tp); holm = np.zeros(len(cells), bool)
    if ok.any(): holm[ok] = multipletests(tp[ok], 0.05, 'holm')[0]
    for c, hp in zip(cells, holm):
        pv = all([c.get('validate_r2_gain', -1) > 0, c.get('validate_cw_p', 1) < 0.05, c.get('validate_ic', -1) > 0])
        pt = all([c.get('test_r2_gain', -1) > 0, c.get('test_cw_p', 1) < 0.05, c.get('test_ic', -1) > 0, c.get('test_r2_gain', -1) > c.get('plc_r2_p95', 9)])
        c.update(holm_test=bool(hp), predictive_pass=bool(pv and pt and hp))
    # Phase E: rules for every model (descriptive) + the tradable gate for predictive passes
    E = []
    for h in HS:
        base_net, base_g, bp, bt = rule(P, F[h]['M1'], h, COST[asset])
        for mdl in ('M0', 'M1', 'M2', 'M3', 'M4', 'M5'):
            net, gross, pos, turn = rule(P, F[h][mdl], h, COST[asset])
            for per in ('validate', 'test'):
                m = periods_mask(P.index, per)
                row = dict(h=h, model=mdl, period=per, net=stats_ret(net[m], pos[m], turn[m]), gross=stats_ret(gross[m]))
                if mdl not in ('M0', 'M1'):
                    row['vs_M1_sharpe_ci'] = block_boot_diff(net[m].to_numpy(), base_net[m].to_numpy(), rng)
                E.append(row)
    bh = P['ret_next'].fillna(0)
    R['buy_hold'] = {per: stats_ret(bh[periods_mask(P.index, per)]) for per in ('validate', 'test')}
    for c in cells:
        if c['predictive_pass']:
            e = next(x for x in E if x['h'] == c['h'] and x['model'] == c['model'] and x['period'] == 'test')
            b = next(x for x in E if x['h'] == c['h'] and x['model'] == 'M1' and x['period'] == 'test')
            c['tradable_pass'] = bool(e['net']['sharpe'] > 0 and e['net']['sharpe'] > b['net']['sharpe'] and e['vs_M1_sharpe_ci'][0] > 0)
        else:
            c['tradable_pass'] = False
    R['cells'] = cells; R['rules'] = E
    # coefficient stability (M3 rate coefficients across annual refits)
    stab = {}
    for h in HS:
        names = SETS[h]['base'] + SETS[h]['rate'] + SETS[h]['macro']; yrs = sorted(COEF[h]['M3'])
        Bm = np.array([COEF[h]['M3'][y]['b'] for y in yrs])
        for j, nm in enumerate(names):
            if nm.startswith('r_'):
                col = Bm[:, j]; stab.setdefault(h, {})[nm] = dict(by_year={str(y): float(v) for y, v in zip(yrs, col)}, same_sign_share=float(max((col > 0).mean(), (col < 0).mean())), lam=[COEF[h]['M3'][y]['lam'] for y in yrs])
    R['coef_stability'] = stab
    # Phase C
    R['phase_c'] = phase_c(P, asset, F)
    # Phase F robustness (test + oos R2 gain and CW t for M3/M5)
    rob = []
    for lab, kw in (('no_term_premium', dict(no_tp=True)), ('features_d-2', dict(lag2=True))):
        for h in HS:
            Fr, _, _ = ladder(P, asset, h, **kw); y = P[f'y{h}'].to_numpy()
            for mdl in ('M2', 'M3', 'M4', 'M5'):
                for per in ('test', 'oos'):
                    s = score(y, Fr['M1'].to_numpy(), Fr[mdl].to_numpy(), h, periods_mask(P.index, per))
                    rob.append(dict(variant=lab, h=h, model=mdl, period=per, r2_gain=s.get('r2_gain'), cw_t=s.get('cw_t'), ic=s.get('ic')))
    for h in HS:
        y = P[f'y{h}'].to_numpy()
        for lab, m_extra in (('no_release_days', (P['release'] != 1).to_numpy()), ('release_days_only', (P['release'] == 1).to_numpy())):
            for mdl in ('M3', 'M5'):
                s = score(y, F[h]['M1'].to_numpy(), F[h][mdl].to_numpy(), h, periods_mask(P.index, 'oos') & m_extra)
                rob.append(dict(variant=lab, h=h, model=mdl, period='oos', r2_gain=s.get('r2_gain'), cw_t=s.get('cw_t'), ic=s.get('ic')))
        big = np.abs(y) > np.nanpercentile(np.abs(y), 99)
        for mdl in ('M3', 'M5'):
            s = score(y, F[h]['M1'].to_numpy(), F[h][mdl].to_numpy(), h, periods_mask(P.index, 'oos') & ~big)
            rob.append(dict(variant='drop_top1pct_moves', h=h, model=mdl, period='oos', r2_gain=s.get('r2_gain'), cw_t=s.get('cw_t'), ic=s.get('ic')))
        for yr in range(2015, 2027):
            mk = np.asarray(P.index.year == yr)
            s = score(y, F[h]['M1'].to_numpy(), F[h]['M3'].to_numpy(), h, mk)
            rob.append(dict(variant=f'year_{yr}', h=h, model='M3', period=str(yr), r2_gain=s.get('r2_gain'), cw_t=s.get('cw_t'), ic=s.get('ic')))
    R['robustness'] = rob
    # forecasts for charts
    R['forecasts'] = {str(h): dict(t=[str(d.date()) for d in P.index[periods_mask(P.index, 'oos')]], **{m: [None if not np.isfinite(v) else round(float(v), 6) for v in F[h][m][periods_mask(P.index, 'oos')]] for m in ('M1', 'M3')},
                                   y=[None if not np.isfinite(v) else round(float(v), 6) for v in P[f'y{h}'][periods_mask(P.index, 'oos')]]) for h in HS}
    R['runtime_s'] = round(time.time() - t0)
    return R


def clean(o):
    if isinstance(o, dict): return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)): return [clean(v) for v in o]
    if isinstance(o, (float, np.floating)): return None if not np.isfinite(o) else float(o)
    if isinstance(o, np.integer): return int(o)
    if isinstance(o, np.bool_): return bool(o)
    return o


if __name__ == '__main__':
    which = sys.argv[1] if len(sys.argv) > 1 else 'both'
    for a in (['eurusd', 'nq'] if which == 'both' else [which]):
        R = run(a)
        json.dump(clean(R), open(os.path.join(OUT, f'results_{a}.json'), 'w'))
        print(a, 'done', R['runtime_s'], flush=True)
