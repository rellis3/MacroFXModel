"""null-audit yield-ladder-eurusd: INDEPENDENT re-implementation (imports nothing from scripts/yield-predictive-ladder).
Builds the inputs from the raw FRED CSVs the study cached (DEXUSEU, DGS2, DGS10) and the Bundesbank DE2/DE10
(analysis/output/dynlead/yields_daily.parquet), with its own pandas merge_asof joins, then:
  (A) cross-checks its features/targets against the study's panel (same data, different code);
  (B) expanding-window OLS of y_h (h = 1, 5, 20) on the US-DE 2y (and 10y) differential change + own momentum,
      refitted annually (2015..2026) with an h-row purge, scored OOS by Spearman IC with a 63-row moving-block
      bootstrap; the slope-only part of the forecast is scored separately so the annual intercept cannot drive it;
  (C) direct OOS IC of the raw rate feature (no fitting) and of the intercept-only forecast (expanding mean);
  (D) planted-signal power for THIS pipeline: (i) iid planted feature as in the study's planted.py, (ii) a
      persistent planted feature (20-row rolling sum of noise, like a real 20-day rate change) put into the TARGET,
      rho in {0.03, 0.05, 0.10}, 20 reps each.
Writes analysis/output/null-audit/yield-ladder-eurusd/reimpl.json"""
import os, json, time
import numpy as np, pandas as pd
from scipy.stats import spearmanr, rankdata

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
RAW = os.path.join(ROOT, 'analysis', 'output', 'yield-predictive-ladder', 'raw')
OUT = os.path.join(ROOT, 'analysis', 'output', 'null-audit', 'yield-ladder-eurusd'); os.makedirs(OUT, exist_ok=True)
SEED = 20261024
rng = np.random.default_rng(SEED)
HS = (1, 5, 20)
VAL = ('2015-01-01', '2019-12-31'); TEST = ('2020-01-01', '2026-08-21')
t0 = time.time()


def fred(sid):
    d = pd.read_csv(os.path.join(RAW, f'{sid}.csv')); d.columns = ['date', 'v']
    d['date'] = pd.to_datetime(d['date']).astype('datetime64[ns]'); d['v'] = pd.to_numeric(d['v'], errors='coerce')
    return d.dropna().set_index('date')['v'].loc['2004-01-01':'2026-08-21']


fx = fred('DEXUSEU'); us2 = fred('DGS2'); us10 = fred('DGS10')
yd = pd.read_parquet(os.path.join(ROOT, 'analysis', 'output', 'dynlead', 'yields_daily.parquet'))
yd.index = pd.to_datetime(yd.index).astype('datetime64[ns]')
de2 = yd['DE2'].dropna().loc[:'2026-08-21']; de10 = yd['DE10'].dropna().loc[:'2026-08-21']

# differential on dates where both curves printed; n-observation change in bp
def diff_change(u, d, n):
    j = pd.concat([u.rename('u'), d.rename('d')], axis=1).dropna()
    s = (j['u'] - j['d']) * 100.0
    return (s - s.shift(n)).dropna()

rows = pd.DataFrame({'date': fx.index, 'lp': np.log(fx.to_numpy())})
for h in HS:
    rows[f'y{h}'] = rows['lp'].shift(-h) - rows['lp']
rows['mom20'] = rows['lp'].shift(1) - rows['lp'].shift(21)          # own 20-row return ending at d-1 (as the study)
rows['mom20_t'] = rows['lp'] - rows['lp'].shift(20)                 # ending at the d print itself (also knowable at noon d)
rows['cut'] = rows['date'] - pd.Timedelta(days=1)                   # rate info strictly before the FX print date
for nm, (u, d) in {'D2': (us2, de2), 'D10': (us10, de10)}.items():
    for n in (5, 20):
        c = diff_change(u, d, n).rename(f'{nm}_{n}').reset_index().rename(columns={'index': 'rdate'})
        c.columns = ['rdate', f'{nm}_{n}']; c['rdate'] = c['rdate'].astype('datetime64[ns]')
        rows = pd.merge_asof(rows.sort_values('cut'), c.sort_values('rdate'), left_on='cut', right_on='rdate', direction='backward')
        rows.loc[(rows['cut'] - rows['rdate']).dt.days > 7, f'{nm}_{n}'] = np.nan
        rows = rows.drop(columns='rdate').sort_values('date')
rows = rows.set_index('date').loc['2005-01-03':'2026-08-21']
acct = {'fx_rows_2005_to_lockbox': int(len(rows))}

# (A) cross-check against the study's panel
P = pd.read_parquet(os.path.join(ROOT, 'analysis', 'output', 'yield-predictive-ladder', 'panel_eurusd.parquet'))
xc = {}
for mine, theirs in (('y1', 'y1'), ('y5', 'y5'), ('y20', 'y20'), ('mom20', 'b_ret20'), ('D2_5', 'r_DIFF2_d5'), ('D2_20', 'r_DIFF2_d20'), ('D10_20', 'r_DIFF10_d20')):
    a, b = rows[mine], P[theirs].reindex(rows.index)
    k = a.notna() & b.notna()
    xc[mine] = dict(n_both=int(k.sum()), n_mine_only=int((a.notna() & b.isna()).sum()), n_theirs_only=int((a.isna() & b.notna()).sum()),
                    max_abs_diff=float((a[k] - b[k]).abs().max()))
print('cross-check', xc, flush=True)


def spear(a, b):
    return float(np.corrcoef(rankdata(a), rankdata(b))[0, 1])


def block_ci(f, y, block=63, B=1000):
    n = len(f); nb = int(np.ceil(n / block)); rf, ry = rankdata(f), rankdata(y); out = np.empty(B)
    for i in range(B):
        st = rng.integers(0, n - block, nb); ix = (st[:, None] + np.arange(block)).ravel()[:n]
        out[i] = np.corrcoef(rf[ix], ry[ix])[0, 1]                    # rank-then-resample: fast approximation of Spearman
    return [float(np.percentile(out, 2.5)), float(np.percentile(out, 97.5)), float(np.mean(out <= 0))]


def walk(df, feats, h):
    """annual expanding OLS refits, 2015..2026, purge h rows; returns full forecast and slope-only part"""
    y = df[f'y{h}'].to_numpy(); X = df[feats].to_numpy(float); dates = df.index
    ok = np.isfinite(X).all(1)
    f = np.full(len(df), np.nan); fs = np.full(len(df), np.nan); betas = {}
    for yr in range(2015, 2027):
        st = np.searchsorted(dates.values, np.datetime64(f'{yr}-01-01'))
        te = np.where((dates.year == yr) & ok)[0]
        tr = np.arange(0, st - h); tr = tr[ok[tr] & np.isfinite(y[tr])]
        A = np.column_stack([np.ones(len(tr)), X[tr]]); b = np.linalg.lstsq(A, y[tr], rcond=None)[0]
        f[te] = b[0] + X[te] @ b[1:]; fs[te] = X[te] @ b[1:]; betas[yr] = b.tolist()
    return f, fs, betas


def scoreic(f, y, mask):
    k = mask & np.isfinite(f) & np.isfinite(y)
    if k.sum() < 50 or np.nanstd(f[k]) == 0: return None
    return dict(n=int(k.sum()), ic=spear(f[k], y[k]), ci=block_ci(f[k], y[k]))


mval = np.asarray((rows.index >= VAL[0]) & (rows.index <= VAL[1])); mtest = np.asarray((rows.index >= TEST[0]) & (rows.index <= TEST[1]))
RES = {'crosscheck_vs_study_panel': xc, 'accounting': acct}
SPECS = {'mom_only': ['mom20'], 'D2_5+mom': ['D2_5', 'mom20'], 'D2_20+mom': ['D2_20', 'mom20'], 'D2_5+D2_20+D10_20+mom': ['D2_5', 'D2_20', 'D10_20', 'mom20']}
for h in HS:
    y = rows[f'y{h}'].to_numpy(); R = {}
    # expanding-mean (intercept-only) forecast = the study's M0
    m0 = np.full(len(rows), np.nan)
    for yr in range(2015, 2027):
        st = np.searchsorted(rows.index.values, np.datetime64(f'{yr}-01-01')); te = np.where(rows.index.year == yr)[0]
        m0[te] = np.nanmean(y[:st - h])
    R['M0_expanding_mean'] = {p: scoreic(m0, y, m) for p, m in (('validate', mval), ('test', mtest))}
    for nm, feats in SPECS.items():
        f, fs, betas = walk(rows, feats, h)
        R[nm] = {'full': {p: scoreic(f, y, m) for p, m in (('validate', mval), ('test', mtest))},
                 'slope_only': {p: scoreic(fs, y, m) for p, m in (('validate', mval), ('test', mtest))},
                 'beta_by_year': {str(k): v for k, v in betas.items()}}
    # incremental: (D2_20+mom) slope part minus mom-only slope part
    fa, fsa, _ = walk(rows, ['D2_20', 'mom20'], h); fb, fsb, _ = walk(rows, ['mom20'], h)
    R['increment_D2_20_over_mom'] = {p: scoreic(fsa - fsb, y, m) for p, m in (('validate', mval), ('test', mtest))}
    # direct: raw feature vs future return (sign-free description; OOS window only, nothing fitted)
    for c in ('D2_5', 'D2_20', 'D10_20'):
        x = rows[c].to_numpy(); R[f'raw_{c}'] = {p: scoreic(x, y, m) for p, m in (('validate', mval), ('test', mtest))}
    RES[f'h{h}'] = R
    print('h', h, {k: (v['test']['ic'] if 'test' in v and v['test'] else (v['slope_only']['test']['ic'] if 'slope_only' in v else None)) for k, v in R.items()}, round(time.time() - t0), flush=True)

# (D) planted power through this pipeline. detection = OOS (2015-26) Spearman IC of the INCREMENT the planted feature adds
# to the slope-only forecast (with PL minus without PL), 63-row block-bootstrap one-sided p < 0.05
moos = mval | mtest
planted = {}
for kind in ('iid_feature', 'persistent_in_target'):
    for h in HS:
        y0 = rows[f'y{h}'].to_numpy()
        for rho in (0.0, 0.03, 0.05, 0.10):
            det, ics = 0, []
            for rep in range(20):
                df = rows.copy()
                if kind == 'iid_feature':                                         # as planted.py: feature correlated rho with the future return
                    z = (y0 - np.nanmean(y0)) / np.nanstd(y0)
                    df['PL'] = rho * np.nan_to_num(z) + np.sqrt(1 - rho ** 2) * rng.standard_normal(len(df))
                else:                                                             # persistent feature (like a 20d change); add it to the target
                    e = rng.standard_normal(len(df) + 20); s = pd.Series(e).rolling(20).sum().to_numpy()[20:]; s = (s - s.mean()) / s.std()
                    sy = np.nanstd(y0); beta = rho / np.sqrt(1 - rho ** 2) * sy        # corr(s, y0 + beta*s) = rho (y0 ~ independent of s)
                    df['PL'] = s; df[f'y{h}'] = y0 + beta * s
                f, fs, _ = walk(df, ['PL', 'D2_20', 'mom20'], h); _, fs0, _ = walk(df, ['D2_20', 'mom20'], h)
                s_ = scoreic(fs - fs0, df[f'y{h}'].to_numpy(), moos)             # what the planted feature ADDS (incremental)
                ics.append(s_['ic']); det += int(s_['ci'][2] < 0.05)
            planted[f'{kind}|h{h}|rho{rho}'] = dict(detected_of_20=det, mean_incremental_ic=float(np.mean(ics)))
            print(kind, h, rho, planted[f'{kind}|h{h}|rho{rho}'], round(time.time() - t0), flush=True)
RES['planted_power_this_pipeline'] = planted
RES['runtime_s'] = round(time.time() - t0); RES['seed'] = SEED
json.dump(RES, open(os.path.join(OUT, 'reimpl.json'), 'w'), indent=1)
