"""null-audit yield-ladder-eurusd: diagnostics OF the study's own pipeline (imports scripts/yield-predictive-ladder/run.py).
Questions: (1) is the reported OOS IC of M2-M5 a rate view, or the baseline / intercept? (2) how much of the forecast
variance is year-to-year intercept steps under heavy ridge shrinkage? (3) do M1 and M3 train on the same rows?
(4) honest (block-bootstrap) interval for the reported test ICs. Writes analysis/output/null-audit/yield-ladder-eurusd/diag.json"""
import os, sys, json
import numpy as np, pandas as pd
from scipy.stats import spearmanr

HERE = os.path.dirname(__file__)
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'yield-predictive-ladder'))
import run as L

OUT = os.path.join(ROOT, 'analysis', 'output', 'null-audit', 'yield-ladder-eurusd'); os.makedirs(OUT, exist_ok=True)
P = pd.read_parquet(os.path.join(L.OUT, 'panel_eurusd.parquet'))
rng = np.random.default_rng(20261024)


def ic(f, y, m):
    k = m & np.isfinite(f) & np.isfinite(y)
    return float(spearmanr(f[k], y[k]).correlation), int(k.sum())


def within_year_ic(f, y, m, idx):
    """Spearman IC after removing each calendar year's mean forecast (kills the annual intercept steps)."""
    k = m & np.isfinite(f) & np.isfinite(y)
    s = pd.Series(f[k], index=idx[k]); fr = s - s.groupby(s.index.year).transform('mean')
    return float(spearmanr(fr.to_numpy(), y[k]).correlation)


def between_share(f, m, idx):
    k = m & np.isfinite(f); s = pd.Series(f[k], index=idx[k])
    tot = s.var(); bw = s.groupby(s.index.year).transform('mean').var()
    return float(bw / tot) if tot > 0 else np.nan


def block_ci(f, y, m, block, B=2000):
    k = m & np.isfinite(f) & np.isfinite(y); a, b = f[k], y[k]; n = len(a); nb = int(np.ceil(n / block)); out = []
    for _ in range(B):
        st = rng.integers(0, n - block, nb); ix = (st[:, None] + np.arange(block)).ravel()[:n]
        out.append(spearmanr(a[ix], b[ix]).correlation)
    return [float(np.percentile(out, 2.5)), float(np.percentile(out, 97.5))]


def year_block_ci(f, y, m, idx, B=2000):
    """resample whole calendar years (the unit at which the intercept changes)"""
    k = m & np.isfinite(f) & np.isfinite(y); yrs = idx[k].year.to_numpy(); a, b = f[k], y[k]; U = np.unique(yrs); out = []
    for _ in range(B):
        pick = rng.choice(U, len(U)); ix = np.concatenate([np.where(yrs == u)[0] for u in pick])
        out.append(spearmanr(a[ix], b[ix]).correlation)
    return [float(np.percentile(out, 2.5)), float(np.percentile(out, 97.5))]


R = {}
idx = P.index
for h in L.HS:
    F, sets, C = L.ladder(P, 'eurusd', h, coef=True)
    y = P[f'y{h}'].to_numpy()
    row = {}
    for per in ('validate', 'test'):
        m = L.periods_mask(idx, per)
        d = {}
        for mdl in ('M0', 'M1', 'M2', 'M3', 'M4', 'M5'):
            f = F[mdl].to_numpy()
            if not np.isfinite(f[m]).any(): continue
            v, n = ic(f, y, m)
            d[mdl] = dict(ic=v, n=n, within_year_ic=within_year_ic(f, y, m, idx), between_year_var_share=between_share(f, m, idx),
                          f_sd=float(np.nanstd(f[m])), ci_naive=[v - 1.96 * np.sqrt(h / n), v + 1.96 * np.sqrt(h / n)])
            if per == 'test' and mdl in ('M0', 'M1', 'M2', 'M3', 'M4'):
                d[mdl]['ci_block63'] = block_ci(f, y, m, 63); d[mdl]['ci_year_block'] = year_block_ci(f, y, m, idx)
        # incremental piece: M3 - M1 (what the rates added)
        inc = F['M3'].to_numpy() - F['M1'].to_numpy()
        d['M3_minus_M1'] = dict(ic=ic(inc, y, m)[0], within_year_ic=within_year_ic(inc, y, m, idx), between_year_var_share=between_share(inc, m, idx),
                                sd=float(np.nanstd(inc[m])))
        # correlation between M3 and M1 / M0 forecasts
        k = m & np.isfinite(F['M3'].to_numpy()) & np.isfinite(F['M1'].to_numpy())
        d['corr_M3_M1'] = float(np.corrcoef(F['M3'].to_numpy()[k], F['M1'].to_numpy()[k])[0, 1])
        d['corr_M3_M0'] = float(np.corrcoef(F['M3'].to_numpy()[k], F['M0'].to_numpy()[k])[0, 1])
        row[per] = d
    # training-row mismatch M1 vs M3 and intercept gap per refit year
    Xb = P[sets['base']].to_numpy(float); Xr = P[sets['base'] + sets['rate'] + sets['macro']].to_numpy(float)
    okb, okr = np.isfinite(Xb).all(1), np.isfinite(Xr).all(1); gap = {}
    for yr in range(2015, 2027):
        te_end = np.searchsorted(idx.values, pd.Timestamp(f'{yr}-01-01').to_datetime64()) - h
        tr = np.arange(0, te_end); tb = tr[okb[tr] & np.isfinite(y[tr])]; t3 = tr[okr[tr] & np.isfinite(y[tr])]
        gap[yr] = dict(n_M1=len(tb), n_M3=len(t3), ym_M1=float(y[tb].mean()), ym_M3=float(y[t3].mean()))
    row['train_rows_and_intercepts'] = gap
    row['lambda_M3'] = {str(k): v['lam'] for k, v in C['M3'].items()}
    # implied shrinkage: ridge here penalises lam*n*|b|^2 on standardised Z, so the shrink factor on an orthogonal
    # direction is 1/(1+lam). Report it next to the chosen lambda.
    row['shrink_factor_by_lambda'] = {str(l): 1 / (1 + l) for l in L.LAMBDAS}
    R[str(h)] = row
    print(h, json.dumps({p: {k: (round(v['ic'], 3), round(v['within_year_ic'], 3), round(v.get('between_year_var_share', np.nan), 2)) for k, v in row[p].items() if isinstance(v, dict)} for p in ('validate', 'test')}), flush=True)
json.dump(R, open(os.path.join(OUT, 'diag.json'), 'w'), indent=1, default=float)
