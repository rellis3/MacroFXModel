"""reopened-audit-rerun 3A (forge/REOPENED_AUDIT_RERUN_PREREG.md): the C.OG VIX family re-judged with block-bootstrap SEs.
Same panels, cells, regressions, controls and outcome scaling as the registered runs (scripts/vvix-nasdaq-ratio/run.py,
scripts/vix-nasdaq-beta/run.py, scripts/vix-calculus/daily.py and vx.py); only the standard error changes:
circular moving-block PAIRS bootstrap of the (X, y) rows, block 63 (primary) and 126, B = 2000, seed 20261128.
Gate: within-prereg Holm (registered) AND family-wide Holm over all 82 cells on the block-63 p, plus the registered sign
and placebo conditions read from the original results files (they do not depend on the SE).
Reads the panels READ-ONLY from DATA_ROOT (the main checkout). Writes analysis/output/reopened-audit-rerun/vix_family.json."""
import os, sys, json
import numpy as np, pandas as pd
from statsmodels.stats.multitest import multipletests
from scipy.stats import norm

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
DATA = os.environ.get('DATA_ROOT', REPO)
OUT = os.path.join(REPO, 'analysis', 'output', 'reopened-audit-rerun'); os.makedirs(OUT, exist_ok=True)
SEED, B, BLOCKS = 20261128, int(os.environ.get('NBOOT', 2000)), (63, 126)
rng = np.random.default_rng(SEED)
sys.path.insert(0, os.path.join(REPO, 'scripts', 'vvix-nasdaq-ratio'))
import model as M
BASE = list(M.CONTROLS)


def block_idx(n, L):
    nb = int(np.ceil(n / L)); st = rng.integers(0, n, nb)
    return ((st[:, None] + np.arange(L)) % n).ravel()[:n]


def fit_block(P, y, k, which, controls):
    """Registered OLS beta (same design/ok-mask as model.fit) + block-bootstrap SE for each block length."""
    M.CONTROLS = controls
    try:
        X = M.design(P, k)
    finally:
        M.CONTROLS = BASE
    ok = np.isfinite(y) & np.isfinite(X.to_numpy()).all(1)
    Xm, ym = X.to_numpy()[ok], np.asarray(y)[ok]; n = len(ym); j = list(X.columns).index(which)
    try:
        b = np.linalg.lstsq(Xm, ym, rcond=None)[0][j]
    except np.linalg.LinAlgError:
        return dict(beta=np.nan, n=n)
    out = dict(beta=float(b), n=int(n))
    for L in BLOCKS:
        bs = []
        for _ in range(B):
            ix = block_idx(n, L); Xb, yb = Xm[ix], ym[ix]
            try: bs.append(np.linalg.solve(Xb.T @ Xb, Xb.T @ yb)[j])
            except np.linalg.LinAlgError: continue
        bs = np.asarray(bs); se = float(np.std(bs, ddof=1))
        out[f'se{L}'] = se; out[f't{L}'] = float(b / se); out[f'p{L}'] = float(2 * norm.sf(abs(b / se)))
        out[f'ci{L}'] = [float(b - 1.96 * se), float(b + 1.96 * se)]
    return out


def outcomes(P):
    lnN, lnV = np.log(P['NDX']), np.log(P['VIX']); r = lnN.diff()
    Y = {'ret5': lnN.shift(-6) - lnN.shift(-1), 'ret20': lnN.shift(-21) - lnN.shift(-1),
         'range20': np.log(r[::-1].rolling(20).std()[::-1].shift(-2) * np.sqrt(252) * 100 / P['VXN']), 'dvix20': lnV.shift(-21) - lnV.shift(-1)}
    return {k: (v / v.std()).to_numpy() for k, v in Y.items()}


cells = []
# ── vvix-nasdaq-ratio (24) ──
P = pd.read_parquet(os.path.join(DATA, 'analysis/output/vvix-nasdaq-ratio/panel.parquet')); Y = outcomes(P)
orig = json.load(open(os.path.join(DATA, 'analysis/output/vvix-nasdaq-ratio/results.json')))['cells']
for c in orig:
    r = fit_block(P, Y[c['outcome']], c['construction'], c['tail'], BASE)
    cells.append(dict(prereg='vvix-nasdaq-ratio', construction=c['construction'], tail=c['tail'], outcome=c['outcome'], beta_orig=c['beta_sd'], t_nw=c['t'],
                      sign_ok=bool(c['same_sign_3']), placebo_ok=bool(abs(c['t']) > c['placebo_t95']), gate_orig=bool(c['gate']), **r))
print('vvix done', flush=True)
# ── vix-nasdaq-beta (16) ──
P = pd.read_parquet(os.path.join(DATA, 'analysis/output/vix-nasdaq-beta/panel.parquet')); Y = outcomes(P)
EXTRA = {'B_level': ['R_b_hi', 'R_b_lo'], 'B_change': []}
orig = json.load(open(os.path.join(DATA, 'analysis/output/vix-nasdaq-beta/results.json')))['cells']
for c in orig:
    r = fit_block(P, Y[c['outcome']], c['construction'], c['tail'], BASE + EXTRA[c['construction']])
    cells.append(dict(prereg='vix-nasdaq-beta', construction=c['construction'], tail=c['tail'], outcome=c['outcome'], beta_orig=c['beta_sd'], t_nw=c['t'],
                      sign_ok=bool(c['same_sign_3']), placebo_ok=bool(abs(c['t']) > c['placebo_t95']), gate_orig=bool(c['gate']), **r))
print('beta done', flush=True)
# ── vix-calculus B/C (40) ──
P = pd.read_parquet(os.path.join(DATA, 'analysis/output/vix-calculus/panel_daily.parquet')); Y = outcomes(P)
CTRL = {'vrpN': [c for c in BASE if c != 'c_rv20_over_vxn'], 'vrpV': BASE, 'F20': BASE + ['R_b_hi', 'R_b_lo'],
        'd2R': BASE + ['B_change_hi', 'B_change_lo'], 'dRimp': BASE + ['R_c_hi', 'R_c_lo']}
orig = json.load(open(os.path.join(DATA, 'analysis/output/vix-calculus/results_BC.json')))['cells']
for c in orig:
    r = fit_block(P, Y[c['outcome']], c['construction'], c['tail'], CTRL[c['construction']])
    cells.append(dict(prereg=f"vix-calculus-{c['part']}", construction=c['construction'], tail=c['tail'], outcome=c['outcome'], beta_orig=c['beta_sd'], t_nw=c['t'],
                      sign_ok=bool(c['same_sign_3']), placebo_ok=bool(abs(c['t']) > c['placebo_t95']) if c['placebo_t95'] is not None else False, gate_orig=bool(c['gate']), **r))
print('calculus BC done', flush=True)
# ── vix-calculus E (2): VX futures outcome, exactly as vx.py ──
V = pd.read_parquet(os.path.join(DATA, 'analysis/output/vix-calculus/data/vx_settle.parquet'))
F = V.pivot_table(index='date', columns='expiry', values='settle')
Q = P[P.index >= F.index.min()].copy(); dates = Q.index
yF = np.full(len(Q), np.nan)
for i in range(len(Q) - 21):
    d1, d21 = dates[i + 1], dates[i + 21]
    if d1 not in F.index or d21 not in F.index: continue
    row = F.loc[d1].dropna(); ex = [e for e in row.index if (e - d1).days >= 35]
    if not ex: continue
    e = min(ex); a = row[e]; b = F.at[d21, e] if e in F.columns else np.nan
    if np.isfinite(a) and np.isfinite(b) and a > 0 and b > 0: yF[i] = np.log(b / a)
Q['vx20'] = yF; Q = Q[dates <= pd.Timestamp('2026-08-21')]
y = (Q['vx20'] / np.nanstd(Q['vx20'])).to_numpy()
orig = json.load(open(os.path.join(DATA, 'analysis/output/vix-calculus/results_E.json')))['cells']
for c in orig:
    r = fit_block(Q, y, c['construction'], 'hi', BASE)
    cells.append(dict(prereg='vix-calculus-E', construction=c['construction'], tail='hi', outcome='vx20', beta_orig=c['beta_sd'], t_nw=c['t'],
                      sign_ok=bool(c['same_sign_3']), placebo_ok=bool(abs(c['t']) > c['placebo_t95']), gate_orig=bool(c['gate']), **r))
C = pd.DataFrame(cells)
# within-prereg Holm as registered (vix-calculus: B and C each their own Holm, E its own Holm-2)
C['holm_within'] = False
for g, idx in C.groupby('prereg').groups.items():
    C.loc[idx, 'holm_within'] = multipletests(C.loc[idx, 'p63'].fillna(1), 0.05, 'holm')[0]
C['holm_family82'] = multipletests(C['p63'].fillna(1), 0.05, 'holm')[0]
C['holm_family82_p126'] = multipletests(C['p126'].fillna(1), 0.05, 'holm')[0]
C['gate_new'] = C['holm_within'] & C['holm_family82'] & C['sign_ok'] & C['placebo_ok']
lo = C['ci63'].map(lambda v: v[0] if isinstance(v, list) else np.nan); hi = C['ci63'].map(lambda v: v[1] if isinstance(v, list) else np.nan)
C['verdict_cell'] = np.where(C['gate_new'], 'validated', np.where((lo > -0.2) & (hi < 0.2), 'null', 'underpowered'))
C['beta_reproduced'] = (C['beta'] - C['beta_orig']).abs() < 1e-6
json.dump(dict(id='reopened-audit-rerun', part='3A', seed=SEED, B=B, blocks=BLOCKS, n_cells=len(C), cells=json.loads(C.to_json(orient='records'))),
          open(os.path.join(OUT, 'vix_family.json'), 'w'), indent=1)
pd.set_option('display.width', 250)
show = C[C['gate_orig'] | (C['p63'] < 0.01)]
print(show[['prereg', 'construction', 'tail', 'outcome', 'n', 'beta', 'beta_reproduced', 't_nw', 't63', 't126', 'holm_within', 'holm_family82', 'sign_ok', 'placebo_ok', 'gate_orig', 'gate_new', 'verdict_cell']].round(3).to_string())
print('beta reproduced on', int(C['beta_reproduced'].sum()), 'of', len(C), '| cells passing new gate:', int(C['gate_new'].sum()))
