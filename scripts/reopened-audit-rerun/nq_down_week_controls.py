"""reopened-audit-rerun 3D (forge/REOPENED_AUDIT_RERUN_PREREG.md): nq-down-week with the vol state controlled.
NY-close NAS100 daily bars from M1 (oi_research_book/data/gex_range_es/nas100_nyclose_d1.parquet; sessions with >= 60 M1
bars), 2016-01 to 2026-08-20. Outcome: next-session H-L / ATR14 (ATR at t). Regressors: down-week (5-session log
return <= -1%), up-week (>= +1%, mirror), ATR14 percentile (trailing 250), today's H-L / ATR14, rv20 / ATR14, VIX
percentile (Cboe seed, trailing 252, causal). CI: circular moving-block bootstrap of rows, 20-session blocks, B 2000.
Reads data READ-ONLY from DATA_ROOT. Writes analysis/output/reopened-audit-rerun/nq_down_week.json."""
import os, json
import numpy as np, pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
DATA = os.environ.get('DATA_ROOT', REPO); OUT = os.path.join(REPO, 'analysis', 'output', 'reopened-audit-rerun')
SEED, B, L = 20261128, 2000, 20; rng = np.random.default_rng(SEED)

d = pd.read_parquet(os.path.join(DATA, 'oi_research_book/data/gex_range_es/nas100_nyclose_d1.parquet')).sort_index()
d = d[(d['n'] >= 60) & (d.index <= '2026-08-20')].copy()
pc = d['close'].shift(1)
tr = pd.concat([d['high'] - d['low'], (d['high'] - pc).abs(), (d['low'] - pc).abs()], axis=1).max(axis=1)
d['atr'] = tr.rolling(14).mean()
d['hl_atr'] = (d['high'] - d['low']) / d['atr']
d['y'] = (d['high'] - d['low']).shift(-1) / d['atr']                      # next session's range on ATR known at t
lc = np.log(d['close']); d['r5'] = lc.diff(5); r1 = lc.diff()
d['down'] = (d['r5'] <= -0.01).astype(float); d['up'] = (d['r5'] >= 0.01).astype(float)
d['atr_pct'] = (d['atr'] / d['close']).rolling(250, min_periods=200).rank(pct=True)
d['rv_atr'] = r1.rolling(20).std() * d['close'] / d['atr']
v = pd.read_csv(os.path.join(DATA, 'analysis/surfaces/cboe/VIX.csv'), header=None)
v = v[pd.to_datetime(v[0], format='%m/%d/%Y', errors='coerce').notna()]
vix = pd.Series(pd.to_numeric(v[v.columns[-1]], errors='coerce').to_numpy(), index=pd.to_datetime(v[0], format='%m/%d/%Y')).dropna().sort_index()
vix_pct = vix.rolling(252, min_periods=200).rank(pct=True)
d['vix_pct'] = vix_pct.reindex(d.index)                                    # same NY date = the close of t (both 16:00-17:00 NY)

def fit(cols, mask=None):
    D = d[['y'] + cols].dropna()
    if mask is not None: D = D[mask(D)]
    X = np.column_stack([np.ones(len(D))] + [D[c].to_numpy() for c in cols]); y = D['y'].to_numpy(); n = len(y)
    b = np.linalg.lstsq(X, y, rcond=None)[0]; bs = []
    for _ in range(B):
        st = rng.integers(0, n, int(np.ceil(n / L))); ix = ((st[:, None] + np.arange(L)) % n).ravel()[:n]
        bs.append(np.linalg.solve(X[ix].T @ X[ix], X[ix].T @ y[ix]))
    bs = np.asarray(bs)
    return {c: dict(beta=float(b[i + 1]), lo=float(np.percentile(bs[:, i + 1], 2.5)), hi=float(np.percentile(bs[:, i + 1], 97.5)), se=float(bs[:, i + 1].std(ddof=1))) for i, c in enumerate(cols)} | {'n': int(n), 'n_down': int(D['down'].sum()) if 'down' in D else None}

CTRL = ['atr_pct', 'hl_atr', 'rv_atr', 'vix_pct']
res = {
    'raw (flags only)': fit(['down', 'up']),
    'controlled (registered 3D)': fit(['down', 'up'] + CTRL),
    'controlled, 2016-2020': fit(['down', 'up'] + CTRL, lambda D: D.index < '2021-01-01'),
    'controlled, 2021-2026': fit(['down', 'up'] + CTRL, lambda D: D.index >= '2021-01-01'),
}
c = res['controlled (registered 3D)']['down']
verdict = 'validated' if (c['beta'] >= 0.10 and c['lo'] > 0) else ('context' if c['lo'] > 0 else ('null' if (c['lo'] > -0.10 and c['hi'] < 0.10) else 'underpowered'))
out = dict(id='reopened-audit-rerun', part='3D', seed=SEED, B=B, block=L, span=[str(d.index[0].date()), str(d.index[-1].date())], unconditional_y=float(d['y'].mean()), cells=res, verdict=verdict)
json.dump(out, open(os.path.join(OUT, 'nq_down_week.json'), 'w'), indent=1)
for k, r in res.items():
    print(k, 'n', r['n'], '| down', {a: round(b, 3) for a, b in r['down'].items()}, '| up', {a: round(b, 3) for a, b in r['up'].items()})
print('controls:', {k: round(res['controlled (registered 3D)'][k]['beta'], 3) for k in CTRL}); print('verdict', verdict)
