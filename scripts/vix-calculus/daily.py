"""vix-calculus parts A (Brownian scaling, descriptive), B (integrals, 24 cells) and C (second derivatives, 16 cells), as registered in
forge/VIX_CALCULUS_PREREG.md. Daily panel = vvix-nasdaq-ratio panel + vix-nasdaq-beta features. Writes analysis/output/vix-calculus/{panel_daily.parquet,
results_A.json, results_BC.json}."""
import os, sys, json
import numpy as np, pandas as pd
from statsmodels.stats.multitest import multipletests
from scipy.stats import norm
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'vvix-nasdaq-ratio'))
import model as M

OUT = os.path.join(ROOT, 'analysis', 'output', 'vix-calculus'); os.makedirs(OUT, exist_ok=True)
SEED = 20261023; NPLAC = int(os.environ.get('NPLAC', 200)); rng = np.random.default_rng(SEED)
P = pd.read_parquet(os.path.join(ROOT, 'analysis', 'output', 'vix-nasdaq-beta', 'panel.parquet'))   # includes R_* flags, B_level, B_change (+flags)
lnN, lnV = np.log(P['NDX']), np.log(P['VIX']); rN, rV = lnN.diff(), lnV.diff()
BASE = list(M.CONTROLS)


def flags(P, k):
    pc = P[k].rolling(252, min_periods=200).rank(pct=True)
    P[f'{k}_pct'] = pc; P[f'{k}_hi'] = (pc >= 0.9).astype(float).where(pc.notna()); P[f'{k}_lo'] = (pc <= 0.1).astype(float).where(pc.notna())


# ── constructions ──
P['vrpN'] = (P['VXN'] / 100) ** 2 - 252 * (rN ** 2).rolling(20).mean()                      # B1: priced variance minus integrated realised variance
P['vrpV'] = (P['VVIX'] / 100) ** 2 - 252 * (rV ** 2).rolling(20).mean()                     # B2: same for the VIX
cov = rV.rolling(252).cov(rN); var = rN.rolling(252).var(); bhat = (cov / var).shift(20)     # slope estimated on the 252 sessions ending d-20
P['F20'] = (rV - bhat * rN).rolling(20).sum()                                                # B3: accumulated VIX move the Nasdaq did not explain
P['d2R'] = P['B_change'] - P['B_change'].shift(5)                                            # C1: d2R/dt2
P['dRimp'] = np.log(P['VVIX'] / P['VXN']).diff(5)                                            # C2: dR_imp/dt
for k in ('vrpN', 'vrpV', 'F20', 'd2R', 'dRimp'): flags(P, k)
P.to_parquet(os.path.join(OUT, 'panel_daily.parquet'))

# ── part A: Brownian scaling (descriptive) ──
def block_boot(f, n, block, B=1000):
    out = []; nb = int(np.ceil(n / block))
    for _ in range(B):
        st = rng.integers(0, n - block, nb); idx = (st[:, None] + np.arange(block)).ravel()[:n]; out.append(f(idx))
    return np.nanpercentile(out, [2.5, 97.5]).tolist()

A = {'kappa': {}, 'vr': {}, 'jordan': {}}
for name, ln, iv in (('NDX', lnN, P['VXN']), ('VIX', lnV, P['VVIX'])):
    for h in (1, 5, 10, 20):
        mv = (ln.shift(-h) - ln).abs().to_numpy(); ex = (iv / 100 * np.sqrt(h / 252) * np.sqrt(2 / np.pi)).to_numpy(); ok = np.isfinite(mv) & np.isfinite(ex)
        mv, ex = mv[ok], ex[ok]; k = mv.mean() / ex.mean()
        A['kappa'][f'{name}|h{h}'] = dict(kappa=float(k), ci=block_boot(lambda i: mv[i].mean() / ex[i].mean(), len(mv), max(h, 5)))
    r1 = ln.diff().dropna().to_numpy()
    for h in (5, 10, 20):
        def vr(idx, r1=r1, h=h):
            x = r1[np.sort(idx)] if False else r1[idx]; s = pd.Series(x).rolling(h).sum().dropna().to_numpy(); return s.var() / (h * x.var())
        full = pd.Series(r1).rolling(h).sum().dropna().to_numpy(); A['vr'][f'{name}|h{h}'] = dict(vr=float(full.var() / (h * r1.var())), ci=block_boot(vr, len(r1), 20))
absb = -P['B_level']; jr = P['VVIX'] / P['VXN']; ratio = (absb / jr).replace([np.inf, -np.inf], np.nan)
rho = rV.rolling(20).corr(rN)
A['jordan'] = dict(median_ratio=float(ratio.median()), p25=float(ratio.quantile(.25)), p75=float(ratio.quantile(.75)), median_abs_rho=float(rho.abs().median()),
                   median_VVIX_over_VXN=float(jr.median()), median_abs_beta=float(absb.median()),
                   by_rho_quintile={str(q): float(ratio[pd.qcut(rho.abs(), 5, labels=False) == q].median()) for q in range(5)},
                   corr_ratio_with_abs_rho=float(ratio.corr(rho.abs())))
json.dump(A, open(os.path.join(OUT, 'results_A.json'), 'w'), indent=1)
print(json.dumps(A, indent=1))

# ── parts B and C: scored cells ──
Y = {'ret5': lnN.shift(-6) - lnN.shift(-1), 'ret20': lnN.shift(-21) - lnN.shift(-1),
     'range20': np.log(rN[::-1].rolling(20).std()[::-1].shift(-2) * np.sqrt(252) * 100 / P['VXN']), 'dvix20': lnV.shift(-21) - lnV.shift(-1)}
H = {'ret5': 5, 'ret20': 20, 'range20': 20, 'dvix20': 20}; SD = {k: float(v.std()) for k, v in Y.items()}; Y = {k: (v / v.std()).to_numpy() for k, v in Y.items()}
CTRL = {'vrpN': [c for c in BASE if c != 'c_rv20_over_vxn'], 'vrpV': BASE, 'F20': BASE + ['R_b_hi', 'R_b_lo'],
        'd2R': BASE + ['B_change_hi', 'B_change_lo'], 'dRimp': BASE + ['R_c_hi', 'R_c_lo']}
PART = {'vrpN': 'B', 'vrpV': 'B', 'F20': 'B', 'd2R': 'C', 'dRimp': 'C'}
split = P['split'].to_numpy()


def cell(Q, k, tail, o, mask=None):
    M.CONTROLS = CTRL[k]
    try: return M.fit(Q, Y[o], k, tail, H[o], mask=mask)
    except np.linalg.LinAlgError: return (np.nan, np.nan, 0)
    finally: M.CONTROLS = BASE


rows = []
for k in CTRL:
    for tail in ('hi', 'lo'):
        for o in Y:
            b, t, n = cell(P, k, tail, o); per = {s: cell(P, k, tail, o, mask=(split == s))[0] for s in ('discover', 'validate', 'test')}
            rows.append(dict(part=PART[k], construction=k, tail=tail, outcome=o, beta_sd=b, t=t, n=n, n_flag=int(np.nansum(P[f'{k}_{tail}'])), p=float(2 * norm.sf(abs(t))),
                             ci_lo=b - 1.96 * abs(b / t), ci_hi=b + 1.96 * abs(b / t), **{f'{s}_beta': per[s] for s in per}))
C = pd.DataFrame(rows)
C['holm_part'] = False
for part in ('B', 'C'):
    m = C['part'] == part; C.loc[m, 'holm_part'] = multipletests(C.loc[m, 'p'], 0.05, 'holm')[0]
C['holm46'] = C['p'] < 0.05 / 46   # conservative view across the whole family (first Holm step); reported, not the gate
C['same_sign_3'] = [all(np.sign(c[f'{s}_beta']) == np.sign(c['beta_sd']) for s in ('discover', 'validate', 'test')) for _, c in C.iterrows()]
PL = {i: [] for i in range(len(C))}
for d in range(NPLAC):
    sh = int(rng.integers(252, len(P) - 252)); Q = P.copy()
    for k in CTRL:
        Q[k] = np.roll(P[k].to_numpy(), sh); flags(Q, k)
    for i, c in C.iterrows(): PL[i].append(abs(cell(Q, c['construction'], c['tail'], c['outcome'])[1]))
C['placebo_t95'] = [float(np.nanpercentile(PL[i], 95)) for i in range(len(C))]
C['gate'] = C['holm_part'] & C['same_sign_3'] & (C['t'].abs() > C['placebo_t95'])
C['verdict_cell'] = np.where(C['gate'], 'validated', np.where((C['ci_lo'] > -0.2) & (C['ci_hi'] < 0.2), 'null', 'underpowered'))
json.dump(dict(id='vix-calculus', parts='B,C', seed=SEED, nplacebo=NPLAC, outcome_sd=SD, cells=json.loads(C.to_json(orient='records'))), open(os.path.join(OUT, 'results_BC.json'), 'w'), indent=1)
pd.set_option('display.width', 250)
print(C[['part', 'construction', 'tail', 'outcome', 'beta_sd', 't', 'n_flag', 'discover_beta', 'validate_beta', 'test_beta', 'placebo_t95', 'holm_part', 'same_sign_3', 'gate', 'verdict_cell']].round(3).to_string())
