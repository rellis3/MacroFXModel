"""paper-replications (EXPLORATORY; the design is fixed by the papers, not tuned here).

1. Moskowitz, Ooi & Pedersen (2012), "Time Series Momentum", JFE 104(2).
   - Ex-ante vol: EWMA of squared daily returns, centre of mass 60 days, annualised with 261.
   - Pooled regression r[t]/sig[t-1] = a + b_h * r[t-h]/sig[t-h-1], monthly, lags h = 1..24, s.e. clustered by month.
     Paper: b_h > 0 for h = 1..12 and slightly negative after ("partial reversal").
   - TSMOM 12-1: position = sign(past 12-month return) * 40% / sig[t-1], held one month, equal weight across
     instruments. Paper (1985-2009, 58 instruments): gross Sharpe ~1.2 diversified.
2. Pitkajarvi, Suominen & Vaittinen (2020), "Cross-asset signals and time series momentum", JFE 136(1).
   - Past 12-month bond returns predict equity returns POSITIVELY; past 12-month equity returns predict bond
     returns NEGATIVELY. Tested as pooled regressions of next-month vol-scaled returns on vol-scaled past 12-month
     returns of the other asset class, with the asset's own past 12-month return as a control.
3. Huang, Li, Wang & Zhou (2020), "Time series momentum: Is it there?", JFE 135(3) -- the counterpoint ChatGPT
   mentioned. Its test: instrument-by-instrument predictive regressions, and TSMOM against a vol-scaled long-only
   book (much of TSMOM's return is just the average drift).

Data: analysis/output/cot-crowding-programme/prices_daily.csv (Yahoo continuous front-month futures, 2005 ->).
Futures returns are excess returns, as in the papers. Yahoo =F series are NOT back-adjusted, so roll days carry a
price jump; we report results raw and with roll-jump days removed (|daily return| > 6 x trailing EWMA sigma set to 0).
Cut at 2026-07-31 (last full month before the lockbox, sessions after 2026-08-21).
"""
import json
import math
import os

import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'analysis', 'output', 'paper-replications')
END = '2026-07-31'
SEED = 20261026

CLASSES = {
    'fx': ['AUD', 'CAD', 'CHF', 'EUR', 'GBP', 'JPY', 'MXN', 'NZD'],
    'equity': ['ES', 'NQ', 'YM', 'RTY'],
    'bonds': ['TU', 'TY', 'US'],
    'commodities': ['GOLD', 'SILVER', 'COPPER', 'PLAT', 'PALL', 'WTI', 'NATGAS', 'RBOB', 'CORN', 'WHEAT', 'SOYB',
                    'SOYOIL', 'SUGAR', 'COFFEE', 'COTTON', 'COCOA', 'CATTLE', 'HOGS'],
}
SYMS = [s for v in CLASSES.values() for s in v]
CLASS_OF = {s: k for k, v in CLASSES.items() for s in v}


def load(clean_rolls):
    p = pd.read_csv(os.path.join(ROOT, 'analysis/output/cot-crowding-programme/prices_daily.csv'),
                    parse_dates=['date'])
    # the file has 34 duplicated (date, sym) rows, all on US 4 July holidays (2006, 2025): keep the later row
    p = p.drop_duplicates(['date', 'sym'], keep='last')
    px = p.pivot(index='date', columns='sym', values='close')[SYMS]
    px = px[px.index <= END]
    r = np.log(px).diff()
    var = (r ** 2).ewm(com=60, min_periods=60).mean()
    sig_d = np.sqrt(var).shift(1)  # ex-ante: through yesterday
    jumps = (r.abs() > 6 * sig_d)
    if clean_rolls:
        r = r.mask(jumps, 0.0)
    sig_ann = np.sqrt((r ** 2).ewm(com=60, min_periods=60).mean() * 261)
    # monthly
    rm = r.resample('ME').sum(min_count=10)
    sig_m = sig_ann.resample('ME').last()  # vol known at month end t, used for month t+1
    return rm, sig_m, int(jumps.sum().sum())


def ols_cluster(y, X, groups):
    X = np.column_stack([np.ones(len(y)), X])
    XtX_inv = np.linalg.inv(X.T @ X)
    b = XtX_inv @ X.T @ y
    u = y - X @ b
    meat = np.zeros((X.shape[1], X.shape[1]))
    for g in np.unique(groups):
        idx = groups == g
        s = X[idx].T @ u[idx]
        meat += np.outer(s, s)
    G = len(np.unique(groups))
    k = X.shape[1]
    n = len(y)
    adj = G / (G - 1) * (n - 1) / (n - k)
    V = XtX_inv @ meat @ XtX_inv * adj
    se = np.sqrt(np.diag(V))
    return b, se


def mop_lag_regressions(rm, sig_m, syms):
    z = rm / sig_m.shift(1)  # r[t] / sig[t-1]
    rows = []
    for h in range(1, 25):
        ys, xs, gs = [], [], []
        for s in syms:
            df = pd.DataFrame({'y': z[s], 'x': z[s].shift(h)}).dropna()
            ys.append(df.y.values); xs.append(df.x.values); gs.append(df.index.values)
        y, x, g = np.concatenate(ys), np.concatenate(xs), np.concatenate(gs)
        b, se = ols_cluster(y, x, g)
        bs, ses = ols_cluster(y, np.sign(x), g)
        rows.append(dict(h=h, beta=float(b[1]), t=float(b[1] / se[1]), beta_sign=float(bs[1]),
                         t_sign=float(bs[1] / ses[1]), n=int(len(y))))
    return rows


def ann(x):
    x = x.dropna()
    m, s = x.mean() * 12, x.std(ddof=1) * math.sqrt(12)
    return dict(mean=float(m), vol=float(s), sharpe=float(m / s) if s > 0 else None,
                t=float(m / s * math.sqrt(len(x) / 12)) if s > 0 else None, months=int(len(x)))


def tsmom(rm, sig_m, syms, lookback=12, signal=None):
    past = rm.rolling(lookback, min_periods=lookback).sum()
    sgn = np.sign(past if signal is None else signal)
    w = 0.40 / sig_m
    pos = (sgn * w).shift(1)[syms]
    ret = pos * rm[syms]
    lo = (w.shift(1) * rm)[syms]  # vol-scaled long-only: the Huang et al. benchmark
    return ret, lo


def per_instrument(rm, sig_m, syms):
    """Huang et al. style: instrument-by-instrument regression of r[t]/sig[t-1] on sign of past 12m return,
    Newey-West-free here because the dependent variable is one non-overlapping month (OLS s.e.)."""
    z = rm / sig_m.shift(1)
    past = np.sign(rm.rolling(12, min_periods=12).sum()).shift(1)
    out = []
    for s in syms:
        df = pd.DataFrame({'y': z[s], 'x': past[s]}).dropna()
        b, se = ols_cluster(df.y.values, df.x.values, np.arange(len(df)))
        out.append(dict(sym=s, cls=CLASS_OF[s], beta=float(b[1]), t=float(b[1] / se[1]), n=int(len(df))))
    return out


def cross_asset(rm, sig_m):
    z = rm / sig_m.shift(1)
    p12 = (rm.rolling(12, min_periods=12).sum() / sig_m).shift(1)  # vol-scaled past 12m, known at t-1
    res = {}
    for target, other in [('equity', 'bonds'), ('bonds', 'equity')]:
        ys, xo, xc, gs = [], [], [], []
        other_sig = p12[CLASSES[other]].mean(axis=1)  # average vol-scaled past 12m of the other class
        for s in CLASSES[target]:
            df = pd.DataFrame({'y': z[s], 'own': p12[s], 'cross': other_sig}).dropna()
            ys.append(df.y.values); xo.append(df.own.values); xc.append(df.cross.values); gs.append(df.index.values)
        y, own, cross, g = map(np.concatenate, (ys, xo, xc, gs))
        b1, se1 = ols_cluster(y, cross, g)
        b2, se2 = ols_cluster(y, np.column_stack([cross, own]), g)
        res[f'{target}_on_past_{other}'] = dict(
            cross_only=dict(beta=float(b1[1]), t=float(b1[1] / se1[1])),
            with_own=dict(beta_cross=float(b2[1]), t_cross=float(b2[1] / se2[1]),
                          beta_own=float(b2[2]), t_own=float(b2[2] / se2[2])),
            n=int(len(y)))
    # the strategy version: equity position from the sign of past bond returns
    sgn_bond = np.sign(rm[CLASSES['bonds']].rolling(12, min_periods=12).sum().mean(axis=1))
    w = 0.40 / sig_m[CLASSES['equity']]
    eq_x = (w.mul(sgn_bond, axis=0)).shift(1) * rm[CLASSES['equity']]
    eq_own, eq_lo = tsmom(rm, sig_m, CLASSES['equity'])
    res['equity_strategies'] = dict(cross_bond_signal=ann(eq_x.mean(axis=1)), own_tsmom=ann(eq_own.mean(axis=1)),
                                    long_only_vol_scaled=ann(eq_lo.mean(axis=1)))
    return res


def run(clean):
    rm, sig_m, njump = load(clean)
    out = dict(roll_jumps_removed=njump if clean else 0)
    out['mop_lags_all'] = mop_lag_regressions(rm, sig_m, SYMS)
    out['mop_lags_by_class'] = {k: mop_lag_regressions(rm, sig_m, v)[:12] for k, v in CLASSES.items()}
    ret, lo = tsmom(rm, sig_m, SYMS)
    port, port_lo = ret.mean(axis=1), lo.mean(axis=1)
    periods = [('2006-2012', '2006-01-01', '2012-12-31'), ('2013-2019', '2013-01-01', '2019-12-31'),
               ('2020-2026', '2020-01-01', END)]
    out['tsmom_portfolio'] = dict(
        full=ann(port), long_only_full=ann(port_lo),
        tsmom_minus_long_only=ann(port - port_lo),
        by_period={nm: ann(port[a:b]) for nm, a, b in periods},
        long_only_by_period={nm: ann(port_lo[a:b]) for nm, a, b in periods},
        by_class={k: ann(ret[v].mean(axis=1)) for k, v in CLASSES.items()},
        long_only_by_class={k: ann(lo[v].mean(axis=1)) for k, v in CLASSES.items()},
        corr_with_long_only=float(pd.concat([port, port_lo], axis=1).dropna().corr().iloc[0, 1]))
    out['per_instrument'] = per_instrument(rm, sig_m, SYMS)
    out['cross_asset'] = cross_asset(rm, sig_m)
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    res = dict(study='paper-replications', status='EXPLORATORY (design fixed by the papers)', seed=SEED,
               end=END, data='analysis/output/cot-crowding-programme/prices_daily.csv',
               raw=run(False), roll_cleaned=run(True))
    json.dump(res, open(os.path.join(OUT, 'results.json'), 'w'), indent=1)
    print('written', os.path.join(OUT, 'results.json'))


if __name__ == '__main__':
    main()
