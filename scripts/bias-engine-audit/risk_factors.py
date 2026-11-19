"""bias-engine-audit, item 4: are the four risk drivers independent?

Exploratory, not pre-registered; descriptive only (no outcome is joined, nothing is fitted). Rebuilds the four readings
of js/biasEngine.js riskScore() from history and maps them to d exactly as the engine does (TH.vixPct, TH.vixTerm,
TH.hyChg20bp, TH.spxRet20Pct), then reports correlations, PCA and agreement.

Data (all dated before the 2026-08-21 lockbox; nothing on/after it is used):
  VIX, VIX3M   analysis/surfaces/cboe/VIX.csv, VIX3M.csv (CBOE raw, MM/DD/YYYY, CLOSE)
  HY OAS       FRED BAMLH0A0HYM2: analysis/output/rangebook/macro/BAMLH0A0HYM2.csv (2023-10-03 ->) merged with a keyless
               fredgraph pull (FRED only serves ~3 years: ICE licence). So the 4-input sample is 2023-10 -> 2026-08.
  BAA10Y       FRED keyless (1986 ->), used ONLY as a labelled long-history credit stand-in (sensitivity, not the engine).
  S&P 500      analysis/output/edges-by-regime/data/GSPC.csv (Yahoo ^GSPC cash close). The engine uses OANDA SPX500_USD
               daily bars; a 20-day return on the cash close is the same reading to within the CFD's carry.
Alignment: every reading is the close of day t (the engine uses closes dated before the issue date, i.e. the previous
day's close for all four; HY is the same day as VIX in the engine's `before(issueDate)` filter).

    python3 -I scripts/bias-engine-audit/risk_factors.py
writes analysis/output/bias-engine-audit/risk_factors.json
"""
import json
import sys
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'analysis' / 'output' / 'bias-engine-audit'
DATA = OUT / 'data'
DATA.mkdir(parents=True, exist_ok=True)
LOCKBOX = pd.Timestamp('2026-08-21')   # nothing on/after this date
SEED = 20261118
rng = np.random.default_rng(SEED)


def fred(sid):
    p = DATA / f'{sid}.csv'
    if not p.exists():
        with urllib.request.urlopen(f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}', timeout=60) as r:
            p.write_bytes(r.read())
    d = pd.read_csv(p)
    d.columns = ['date', 'value']
    d['date'] = pd.to_datetime(d['date'])
    d['value'] = pd.to_numeric(d['value'], errors='coerce')
    return d.dropna().set_index('date')['value']


def cboe(sym):
    d = pd.read_csv(ROOT / 'analysis' / 'surfaces' / 'cboe' / f'{sym}.csv')
    d['date'] = pd.to_datetime(d['DATE'], format='%m/%d/%Y')
    return d.set_index('date')['CLOSE'].astype(float)


vix, v3 = cboe('VIX'), cboe('VIX3M')
hy_local = pd.read_csv(ROOT / 'analysis/output/rangebook/macro/BAMLH0A0HYM2.csv')
hy_local.columns = ['date', 'value']
hy_local['date'] = pd.to_datetime(hy_local['date'])
hy = pd.concat([hy_local.set_index('date')['value'].astype(float), fred('BAMLH0A0HYM2')])
hy = hy[~hy.index.duplicated(keep='last')].sort_index()
baa = fred('BAA10Y')
spx = pd.read_csv(ROOT / 'analysis/output/edges-by-regime/data/GSPC.csv', parse_dates=['date']).set_index('date')['close'].astype(float)

cut = lambda s: s[s.index < LOCKBOX].dropna()
vix, v3, hy, baa, spx = map(cut, (vix, v3, hy, baa, spx))

# ── the engine's readings ─────────────────────────────────────────────────────────────────────────────────────────
pct1y = vix.rolling(252, min_periods=252).apply(lambda w: 100 * (w <= w[-1]).sum() / len(w), raw=True)
ratio = (vix / v3).dropna()
hy20 = ((hy - hy.shift(20)) * 100).round()            # engine: Math.round((last - 21st last) * 100)
baa20 = ((baa - baa.shift(20)) * 100).round()
ret20 = (spx / spx.shift(20) - 1) * 100


def band(x, t1, t2):
    a = np.abs(x)
    return np.where(np.isnan(x), np.nan, np.where(a >= t2, 2 * np.sign(x), np.where(a >= t1, np.sign(x), 0)))


def d_vix(p):
    return np.where(np.isnan(p), np.nan, np.where(p < 20, 2, np.where(p < 40, 1, np.where(p > 80, -2, np.where(p > 60, -1, 0)))))


def d_term(r):
    return np.where(np.isnan(r), np.nan, np.where(r >= 1.0, -2, np.where(r >= 0.95, -1, np.where(r <= 0.85, 1, 0))))


def frame(credit, credit_lvl):
    f = pd.concat({'vix': vix, 'pct1y': pct1y, 'ratio': ratio, 'credit20': credit, 'credit': credit_lvl, 'ret20': ret20}, axis=1, join='inner').dropna()
    f['d_vix'] = d_vix(f['pct1y'].values)
    f['d_term'] = d_term(f['ratio'].values)
    f['d_credit'] = -band(f['credit20'].values, 20, 50) + 0
    f['d_spx'] = band(f['ret20'].values, 1, 3)
    f['R'] = f[['d_vix', 'd_term', 'd_credit', 'd_spx']].mean(axis=1)
    return f


def pca(X):
    Z = (X - X.mean()) / X.std(ddof=1)
    C = np.corrcoef(Z.values, rowvar=False)
    lam, vec = np.linalg.eigh(C)
    o = np.argsort(lam)[::-1]
    lam, vec = lam[o], vec[:, o]
    if vec[:, 0].sum() < 0:
        vec[:, 0] *= -1
    return {'eigenvalues': [round(float(x), 3) for x in lam], 'pc1_share': round(float(lam[0] / lam.sum()), 3),
            'pc1_loadings': dict(zip(X.columns, [round(float(x), 3) for x in vec[:, 0]])),
            'effective_n_participation': round(float(lam.sum() ** 2 / (lam ** 2).sum()), 2),
            'n_eigen_gt_1': int((lam > 1).sum())}, Z.values @ vec[:, 0]


def block_boot_pc1(X, B=1000, block=21):
    n, out = len(X), []
    Xv = X.values
    for _ in range(B):
        starts = rng.integers(0, n - block, size=n // block + 1)
        idx = np.concatenate([np.arange(s, s + block) for s in starts])[:n]
        S = Xv[idx]
        C = np.corrcoef((S - S.mean(0)) / S.std(0, ddof=1), rowvar=False)
        lam = np.sort(np.linalg.eigvalsh(C))[::-1]
        out.append((lam[0] / lam.sum(), lam.sum() ** 2 / (lam ** 2).sum()))
    a = np.array(out)
    return {'pc1_share_ci95': [round(float(x), 3) for x in np.percentile(a[:, 0], [2.5, 97.5])],
            'effective_n_ci95': [round(float(x), 2) for x in np.percentile(a[:, 1], [2.5, 97.5])], 'B': B, 'block': block}


def corr(df, method='pearson'):
    return {a: {b: round(float(v), 3) for b, v in row.items()} for a, row in df.corr(method=method).items()}


def agreement(f):
    D = f[['d_vix', 'd_term', 'd_credit', 'd_spx']]
    nz = (D != 0).sum(axis=1)
    pos, neg = (D > 0).sum(axis=1), (D < 0).sum(axis=1)
    unanimous = ((pos == 0) | (neg == 0)) & (nz > 0)
    out = {'n_days': int(len(f)),
           'share_all_four_nonzero_same_sign': round(float(((pos == 4) | (neg == 4)).mean()), 3),
           'share_no_conflict_given_any_nonzero': round(float(unanimous[nz > 0].mean()), 3),
           'share_conflict': round(float(((pos > 0) & (neg > 0)).mean()), 3),
           'share_all_zero': round(float((nz == 0).mean()), 3),
           'R_distribution': {str(k): round(float(v), 3) for k, v in f['R'].round(2).value_counts(normalize=True).sort_index().items()},
           'share_abs_R_ge_1': round(float((f['R'].abs() >= 1).mean()), 3),
           'd_marginals': {k: {str(int(a)): round(float(b), 3) for a, b in f[k].value_counts(normalize=True).sort_index().items()} for k in D.columns}}
    # pairwise sign agreement among non-zero pairs
    pw = {}
    cols = list(D.columns)
    for i in range(4):
        for j in range(i + 1, 4):
            m = (D[cols[i]] != 0) & (D[cols[j]] != 0)
            pw[f'{cols[i]}~{cols[j]}'] = {'both_nonzero_share': round(float(m.mean()), 3),
                                          'same_sign_when_both_nonzero': round(float((np.sign(D[cols[i]][m]) == np.sign(D[cols[j]][m])).mean()), 3) if m.any() else None}
    out['pairwise'] = pw
    return out


def analyse(f, label, credit_name):
    # risk-on orientation so positive correlation = the drivers agree
    lv = pd.DataFrame({'-vix_pct1y': -f['pct1y'], '-vix_vix3m': -f['ratio'], f'-{credit_name}_chg20': -f['credit20'], 'spx_ret20': f['ret20']})
    lv_raw = pd.DataFrame({'vix_level': f['vix'], 'vix_pct1y': f['pct1y'], 'vix_vix3m': f['ratio'], f'{credit_name}_chg20bp': f['credit20'], 'spx_ret20': f['ret20']})
    dd = pd.DataFrame({'d_vix': f['d_vix'], 'd_term': f['d_term'], 'd_credit': f['d_credit'], 'd_spx': f['d_spx']})
    # daily and non-overlapping weekly changes of the underlying series (risk-on orientation)
    base = pd.DataFrame({'-dVIX': -f['vix'], '-dVIX/VIX3M': -f['ratio'], f'-d{credit_name}': -f['credit'], 'spx_logret': np.log(spx.reindex(f.index))})
    dch = base.diff().dropna()
    wk = base.iloc[::5].diff().dropna()
    p_lv, pc1_lv = pca(lv)
    p_dd, _ = pca(dd)
    p_dch, _ = pca(dch)
    p_wk, _ = pca(wk)
    res = {'label': label, 'start': str(f.index[0].date()), 'end': str(f.index[-1].date()), 'n': int(len(f)),
           'corr_readings_pearson': corr(lv_raw), 'corr_readings_spearman': corr(lv_raw, 'spearman'),
           'corr_daily_changes': corr(dch), 'corr_weekly_changes': corr(wk), 'corr_d_values_spearman': corr(dd, 'spearman'),
           'pca_readings_riskon': {**p_lv, **block_boot_pc1(lv)}, 'pca_d_values': {**p_dd, **block_boot_pc1(dd)},
           'pca_daily_changes': p_dch, 'pca_weekly_changes': p_wk,
           'corr_R_with_pc1_of_readings': round(float(np.corrcoef(f['R'], pc1_lv)[0, 1]), 3),
           'agreement': agreement(f),
           'R_autocorr': {f'lag{k}': round(float(f['R'].autocorr(k)), 3) for k in (1, 5, 20, 60)}}
    return res


out = {'note': 'Exploratory, not pre-registered. Descriptive only; no outcome joined; all data dated before 2026-08-21.',
       'seed': SEED,
       'engine_4input_HY': analyse(frame(hy20, hy), 'Engine inputs, HY OAS (FRED only holds 2023-10 ->)', 'hy'),
       'long_history_BAA_standin': analyse(frame(baa20, baa), 'Long history, BAA10Y as a credit stand-in (sensitivity only)', 'baa')}
# 3 inputs without credit over the full VIX3M history
f3 = frame(hy20.reindex(vix.index).fillna(0) * 0, hy.reindex(vix.index).fillna(0) * 0)   # placeholder credit = 0 (engine d 0)
f3 = f3[f3.index >= pd.Timestamp('2010-01-01')]
lv3 = pd.DataFrame({'-vix_pct1y': -f3['pct1y'], '-vix_vix3m': -f3['ratio'], 'spx_ret20': f3['ret20']})
p3, _ = pca(lv3)
out['three_inputs_2010'] = {'start': str(f3.index[0].date()), 'end': str(f3.index[-1].date()), 'n': int(len(f3)),
                            'corr_readings_spearman': corr(lv3, 'spearman'), 'pca_readings_riskon': {**p3, **block_boot_pc1(lv3)},
                            'corr_d_values_spearman': corr(f3[['d_vix', 'd_term', 'd_spx']], 'spearman')}
(OUT / 'risk_factors.json').write_text(json.dumps(out, indent=1))
for k in ('engine_4input_HY', 'long_history_BAA_standin'):
    r = out[k]
    print('==', r['label'], r['start'], r['end'], 'n', r['n'])
    print(' spearman readings', json.dumps(r['corr_readings_spearman']))
    print(' d spearman', json.dumps(r['corr_d_values_spearman']))
    print(' daily', json.dumps(r['corr_daily_changes']))
    print(' weekly', json.dumps(r['corr_weekly_changes']))
    print(' pca readings', json.dumps(r['pca_readings_riskon']))
    print(' pca d', json.dumps(r['pca_d_values']))
    print(' pca daily', json.dumps(r['pca_daily_changes']), '\n pca weekly', json.dumps(r['pca_weekly_changes']))
    print(' corr(R, PC1)', r['corr_R_with_pc1_of_readings'], 'autocorr', r['R_autocorr'])
    print(' agreement', json.dumps(r['agreement']))
print('== 3 inputs 2010', json.dumps(out['three_inputs_2010']))
