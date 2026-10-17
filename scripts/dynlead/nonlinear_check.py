"""COG-DYNAMIC-LEAD nonlinear check (forge/COG_DYNAMIC_LEAD_PREREG.md): boosted trees, five assets, walk-forward by calendar year from 2019.
    python scripts/dynlead/nonlinear_check.py [--draws 30]  -> analysis/output/dynlead/NONLINEAR_CHECK.md
M0 = the asset's own trailing returns and volatility; M1 = M0 + multi-scale spread moves, rolling-relationship states and divergence z for four spreads. Target = the next 5-day log return."""
import argparse
import sys
import warnings
from pathlib import Path
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.ensemble import HistGradientBoostingRegressor
warnings.filterwarnings('ignore')
sys.path.insert(0, str(Path(__file__).resolve().parent))
import engine as E

ap = argparse.ArgumentParser()
ap.add_argument('--draws', type=int, default=30)
A = ap.parse_args()
ad, yd, S = E.load()
LP = np.log(ad)
idx = ad.index
ASSETS = ['EURUSD', 'USDJPY', 'GBPUSD', 'GOLD', 'SPX500']
SPR = ['US-DE 2Y', 'US-DE 10Y', 'US-JP 10Y', 'US slope 10-2']
HP = dict(max_depth=3, max_iter=100, learning_rate=0.05, min_samples_leaf=200, l2_regularization=1.0, early_stopping=False, random_state=0)
H = 5
rng = np.random.default_rng(91)


def spread_features(Sd, a):
    F = {}
    lp = LP[a]
    y5 = lp.shift(-H) - lp
    for j in SPR:
        s = Sd[j]
        for k in (1, 5, 20):
            F[f'x{k}_{j}'] = E.make_x(s, k)
        x5 = E.make_x(s, 5)
        F[f'ic_{j}'] = y5.rolling(250, min_periods=200).corr(x5).shift(H)
        dS = s - s.shift(5)
        rk = lp - lp.shift(5)
        beta = (rk.rolling(250, min_periods=200).cov(dS) / dS.rolling(250, min_periods=200).var()).shift(1)
        e = rk - beta * dS
        F[f'div_{j}'] = e / e.rolling(250, min_periods=200).std().shift(1)
    return pd.DataFrame(F, index=idx)


def asset_features(a):
    lp = LP[a]
    r1 = lp.diff()
    return pd.DataFrame({'r1': r1, 'r5': lp - lp.shift(5), 'r20': lp - lp.shift(20), 'vol20': r1.rolling(20).std()}, index=idx)


def walk(a, M0, M1, y):
    years = range(2019, 2027)
    p0, p1 = pd.Series(np.nan, idx), pd.Series(np.nan, idx)
    for yr in years:
        te = (idx.year == yr) & y.notna().values
        tr = (idx < pd.Timestamp(f'{yr}-01-01') - pd.Timedelta(days=10)) & y.notna().values & M1.notna().all(axis=1).values
        if te.sum() < 50 or tr.sum() < 500:
            continue
        for M, p in ((M0, p0), (M1, p1)):
            cols = [c for c in M.columns]
            ok_te = te & M.notna().all(axis=1).values
            ok_tr = tr & M.notna().all(axis=1).values
            mdl = HistGradientBoostingRegressor(**HP).fit(M.values[ok_tr], y.values[ok_tr])
            p[idx[ok_te]] = mdl.predict(M.values[ok_te])
    return p0, p1


def monthly_ic(p, y, mask):
    d = pd.DataFrame({'p': p, 'y': y})[mask].dropna()
    out = {}
    for k, g in d.groupby([d.index.year, d.index.month]):
        if len(g) >= 10 and g.p.std() > 0:
            out[k] = stats.spearmanr(g.p, g.y).statistic
    return pd.Series(out)


def evaluate(Sd, a):
    y = LP[a].shift(-H) - LP[a]
    M0 = asset_features(a)
    M1 = pd.concat([M0, spread_features(Sd, a)], axis=1)
    p0, p1 = walk(a, M0, M1, y)
    m = np.asarray(idx >= pd.Timestamp('2019-01-01'))
    i0, i1 = monthly_ic(p0, y, m), monthly_ic(p1, y, m)
    ix = i0.index.intersection(i1.index)
    gain = (i1[ix] - i0[ix])
    # economics: sign of the prediction, staggered over H days, net of the class cost
    cost = E.COST_BP.get(a, 2.0) / 2e4
    r_next = LP[a].shift(-1) - LP[a]
    res = {}
    for nm, p in (('M0', p0), ('M1', p1)):
        pos = np.sign(p).fillna(0.0).rolling(H, min_periods=1).mean()
        pnl = (pos * r_next - pos.diff().abs().fillna(0) * cost)[m & r_next.notna().values & p.notna().values]
        res[nm] = float(pnl.mean() / pnl.std() * np.sqrt(252)) if pnl.std() > 0 else np.nan
    return dict(asset=a, IC_M0=float(i0[ix].mean()), IC_M1=float(i1[ix].mean()), IC_gain=float(gain.mean()), months=len(ix), gain_series=gain.values, net_sharpe_M0=res['M0'], net_sharpe_M1=res['M1'])


real = [evaluate(S, a) for a in ASSETS]
boots = []
for r in real:
    g = r['gain_series']
    bm = g[rng.integers(0, len(g), size=(2000, len(g)))].mean(1)
    boots.append((np.percentile(bm, 2.5), np.percentile(bm, 97.5), float((bm <= 0).mean())))
pl = {a: [] for a in ASSETS}
for d in range(A.draws):
    Sh = E.shifted_spreads(S, rng)
    for a in ASSETS:
        pl[a].append(evaluate(Sh, a)['IC_gain'])
rows = []
for r, b in zip(real, boots):
    arr = np.array(pl[r['asset']])
    rows.append(dict(asset=r['asset'], IC_M0=r['IC_M0'], IC_M1=r['IC_M1'], IC_gain=r['IC_gain'], ci_lo=b[0], ci_hi=b[1], p_boot=b[2], placebo_mean=arr.mean(), placebo_p95=np.percentile(arr, 95), beats_placebo=bool(r['IC_gain'] > np.percentile(arr, 95)),
                     net_sharpe_M0=r['net_sharpe_M0'], net_sharpe_M1=r['net_sharpe_M1'], months=r['months']))
R = pd.DataFrame(rows)
R.to_csv(E.PAN / 'nonlinear_check.csv', index=False)
txt = ['# COG-DYNAMIC-LEAD nonlinear check', '', 'Boosted trees, walk-forward by calendar year from 2019 (purge 10 days), target = next 5-day log return. M0 = own trailing returns and volatility; M1 = M0 + spread moves (k 1/5/20), rolling relationship state and divergence z for US-DE 2Y, US-DE 10Y, US-JP 10Y, US slope 10-2. Monthly rank IC; gain with 2 000-draw month bootstrap; placebo = spreads shifted (30 draws). Net Sharpe: sign of the prediction, 5-day staggered hold, class costs.', '', R.to_markdown(index=False, floatfmt='.4f'), '',
       f'Assets where the IC gain beats the placebo 95th percentile: {int(R.beats_placebo.sum())} of {len(R)}. Assets with net Sharpe above 0.5 for M1: {int((R.net_sharpe_M1 > 0.5).sum())}.']
(E.PAN / 'NONLINEAR_CHECK.md').write_text('\n'.join(txt), encoding='utf-8')
print('\n'.join(txt))
