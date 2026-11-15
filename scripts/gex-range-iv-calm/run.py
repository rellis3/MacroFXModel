"""gex-range-iv-calm -- short-gamma range widening once implied vol is controlled, in calm-VIX sessions only.
Prereg: forge/GEX_RANGE_IV_CALM_PREREG.md (seed 20261114). Imports the parent's builders (oi_research_book/scripts/32_gex_range_iv.py).
Stages: --stage power (counts and design-based SEs, no calm-subsample coefficient is fitted), --stage score.
Run with the repo venv: python -I scripts/gex-range-iv-calm/run.py --stage power|score"""
import argparse, importlib.util, json, os
from pathlib import Path
import numpy as np, pandas as pd

HERE = Path(__file__).resolve()
REPO = HERE.parents[2]
OUT = REPO / 'analysis' / 'output' / 'gex-range-iv-calm'
OUT.mkdir(parents=True, exist_ok=True)
SEED, B = 20261114, 4000
GATE, OPERATIONAL = 0.05, 0.10
_s = importlib.util.spec_from_file_location('p32', REPO / 'oi_research_book' / 'scripts' / '32_gex_range_iv.py')
p32 = importlib.util.module_from_spec(_s); _s.loader.exec_module(p32)
m = p32.m
FIXED = {'ES': 20.0, 'NQ': 25.0}


def frames():
    start = m.first_date(None); out = {}
    for name in ('ES', 'NQ'):
        d = p32.build(name, start)
        d = d[np.isfinite(d[['dr', 'r5', 'r20', 'dr' if False else 'dd60', 'v']]).all(axis=1)].reset_index(drop=True)
        ser = p32.cboe(p32.IVFILE[name]).dropna()
        med = ser.rolling(252, min_periods=126).median()
        q33 = ser.rolling(252, min_periods=126).quantile(1 / 3)
        d1 = pd.DatetimeIndex(d['d1'])
        d['iv_d1'] = p32.asof(ser, d1); d['med252'] = p32.asof(med, d1); d['q33'] = p32.asof(q33, d1)
        d['n_prior'] = [int((ser.index <= x).sum()) for x in d1]
        out[name] = d
    return out


def label(d, kind):
    if kind == 'median': return (d['iv_d1'] <= d['med252']).to_numpy(), d['med252'].notna().to_numpy()
    if kind == 'fixed': return (d['iv_d1'] < d['FIX']).to_numpy(), np.ones(len(d), bool)
    if kind == 'tercile': return (d['iv_d1'] <= d['q33']).to_numpy(), d['q33'].notna().to_numpy()


def design(d, extra):
    A, j = p32.X_of(d, ['r5', 'r20', 'dd60'] + extra)
    return A, j


def fit_short(A, y, j, rows):
    if rows.sum() < 40: return np.nan
    return float(np.linalg.lstsq(A[rows], y[rows], rcond=None)[0][j])


def stage_power(F):
    res = {'seed': SEED, 'stage': 'power', 'cells': {}}
    for name, d in F.items():
        calm, ok = label(d, 'median'); keep = ok
        y = d['dr'].to_numpy(); A1, j1 = design(d, ['v'])
        # whole-sample B1 residual SD (the parent's banked fit; no calm-subsample coefficient is read)
        beta = np.linalg.lstsq(A1, y, rcond=None)[0]; resid_sd = float((y - A1 @ beta).std(ddof=A1.shape[1]))
        c = keep & calm
        Ac = A1[c]; XtXi = np.linalg.pinv(Ac.T @ Ac); se_design = resid_sd * float(np.sqrt(XtXi[j1, j1]))
        res['cells'][name] = {'n_total': int(len(d)), 'n_with_label': int(keep.sum()), 'n_calm': int(c.sum()), 'n_stress': int((keep & ~calm).sum()),
                              'resid_sd_whole_sample': resid_sd, 'se_design_calm': se_design, 'mde_calm': 3.0 * se_design,
                              'n_short_calm': int(d['is_short'].to_numpy()[c].sum()), 'n_short_stress': int(d['is_short'].to_numpy()[keep & ~calm].sum())}
    json.dump(res, open(OUT / 'power.json', 'w'), indent=1); print(json.dumps(res, indent=1))


def boot_indices(n, rng):
    for ch in m.s18._boot_stats(n, B, rng, chunk=500):
        for ix in ch: yield ix


def stage_score(F):
    rng = np.random.default_rng(SEED)
    res = {'seed': SEED, 'stage': 'score', 'cells': {}}
    for name, d in F.items():
        y = d['dr'].to_numpy(); d = d.copy(); d['FIX'] = FIXED[name]
        calm, ok = label(d, 'median')
        A0, j0 = design(d, []); A1, j1 = design(d, ['v'])
        short = d['is_short'].to_numpy().astype(bool)
        keep = ok
        cC, cS = keep & calm, keep & ~calm
        r = {'n': int(keep.sum()), 'dropped_no_trailing_iv': int((~keep).sum()), 'n_calm': int(cC.sum()), 'n_stress': int(cS.sum()),
             'n_short_calm': int(short[cC].sum()), 'n_short_stress': int(short[cS].sum())}
        b = {k: fit_short(A, y, j, rows) for k, (A, j, rows) in {'B0_calm': (A0, j0, cC), 'B1_calm': (A1, j1, cC), 'B0_stress': (A0, j0, cS), 'B1_stress': (A1, j1, cS)}.items()}
        r['coef'] = b
        # pooled interaction (B1 + calm + short x calm) -- coefficient on short x calm
        Ai = np.column_stack([A1[keep], calm[keep].astype(float), (short & calm)[keep].astype(float)]); yi = y[keep]
        r['interaction_short_x_calm'] = float(np.linalg.lstsq(Ai, yi, rcond=None)[0][-1])
        # one set of resamples of the FULL frame (stationary blocks); the calm/stress sub-sample is re-selected inside every resample
        bs = {k: [] for k in b}; bint = []
        for ix in boot_indices(len(y), rng):
            for k, (A, j, rows) in {'B0_calm': (A0, j0, cC), 'B1_calm': (A1, j1, cC), 'B0_stress': (A0, j0, cS), 'B1_stress': (A1, j1, cS)}.items():
                bs[k].append(fit_short(A[ix], y[ix], j, rows[ix]))
            Aii = np.column_stack([A1[ix], calm[ix].astype(float), (short & calm)[ix].astype(float)]); kk = keep[ix]
            bint.append(float(np.linalg.lstsq(Aii[kk], y[ix][kk], rcond=None)[0][-1]) if kk.sum() > 80 else np.nan)
        bs = {k: np.array(v, float) for k, v in bs.items()}; bint = np.array(bint, float)
        def ci(a):
            a = a[~np.isnan(a)]; se = float(a.std()); return {'se': se, 'lo95': float(np.quantile(a, .025)), 'hi95': float(np.quantile(a, .975)), 'n_boot': int(len(a))}
        r['ci'] = {k: ci(v) for k, v in bs.items()}
        r['ci_interaction'] = ci(bint)
        dif = bs['B1_calm'] - bs['B1_stress']; dif0 = bs['B0_calm'] - bs['B0_stress']; dab = bs['B0_calm'] - bs['B1_calm']
        r['calm_minus_stress_B1'] = {'est': b['B1_calm'] - b['B1_stress'], **ci(dif)}
        r['calm_minus_stress_B0'] = {'est': b['B0_calm'] - b['B0_stress'], **ci(dif0)}
        r['absorbed_calm'] = {'d_b': b['B0_calm'] - b['B1_calm'], 'share': (b['B0_calm'] - b['B1_calm']) / b['B0_calm'] if b['B0_calm'] else None, **ci(dab)}
        # all-shift placebo on the short label within the calm sub-sample
        dc = d[cC].reset_index(drop=True); yc = y[cC]; Ac = A1[cC]; pl = []
        for k in range(60, len(yc) - 60, 5):
            A2 = Ac.copy(); A2[:, j1] = np.roll(Ac[:, j1], k); pl.append(float(np.linalg.lstsq(A2, yc, rcond=None)[0][j1]))
        pl = np.array(pl); r['placebo_calm'] = {'n_shifts': int(len(pl)), 'mean': float(pl.mean()), 'sd': float(pl.std()), 'real_above_share': float((pl < b['B1_calm']).mean())}
        Ac2 = A1[cS]; yc2 = y[cS]; pl2 = []
        for k in range(60, len(yc2) - 60, 5):
            A2 = Ac2.copy(); A2[:, j1] = np.roll(Ac2[:, j1], k); pl2.append(float(np.linalg.lstsq(A2, yc2, rcond=None)[0][j1]))
        pl2 = np.array(pl2); r['placebo_stress'] = {'n_shifts': int(len(pl2)), 'mean': float(pl2.mean()), 'sd': float(pl2.std()), 'real_above_share': float((pl2 < b['B1_stress']).mean())}
        # sensitivities (never scored)
        sens = {}
        for kind in ('fixed', 'tercile'):
            cl, okk = label(d, kind); c1, s1 = okk & cl, okk & ~cl
            sens[kind] = {'n_calm': int(c1.sum()), 'n_stress': int(s1.sum()), 'B1_calm': fit_short(A1, y, j1, c1), 'B1_stress': fit_short(A1, y, j1, s1), 'B0_calm': fit_short(A0, y, j0, c1), 'B0_stress': fit_short(A0, y, j0, s1)}
        half = len(y) // 2
        for lab, sl in (('first_half', slice(0, half)), ('second_half', slice(half, None))):
            idx = np.zeros(len(y), bool); idx[sl] = True
            sens[lab] = {'B1_calm': fit_short(A1, y, j1, cC & idx), 'B1_stress': fit_short(A1, y, j1, cS & idx), 'n_calm': int((cC & idx).sum())}
        r['sensitivities'] = sens
        res['cells'][name] = r
    # parent whole-sample reproduction check (B0 and B1 on the whole sample, sanity)
    for name, d in F.items():
        y = d['dr'].to_numpy(); A0, j0 = design(d, []); A1, j1 = design(d, ['v'])
        res['cells'][name]['whole_sample_B0'] = float(np.linalg.lstsq(A0, y, rcond=None)[0][j0]); res['cells'][name]['whole_sample_B1'] = float(np.linalg.lstsq(A1, y, rcond=None)[0][j1])
        res['cells'][name]['b0_reproduces_banked'] = bool(abs(res['cells'][name]['whole_sample_B0'] - p32.BANKED_B0[name]) <= 0.005)
    def pn(t): return p32.pnorm(t)
    ps = []
    for k in ('ES', 'NQ'):
        c = res['cells'][k]; c['b_IV_calm'] = c['coef']['B1_calm']; c['t_calm'] = c['b_IV_calm'] / c['ci']['B1_calm']['se']; c['p_calm'] = pn(c['t_calm']); ps.append(c['p_calm'])
    adj = m.holm(ps)
    for k, h in zip(('ES', 'NQ'), adj):
        c = res['cells'][k]; c['p_calm_holm'] = float(h)
        gate = {'b_ge_0.05': c['b_IV_calm'] >= GATE, 'ci_lower_gt_0': c['ci']['B1_calm']['lo95'] > 0, 'holm_p_lt_0.05': h < 0.05, 'placebo_above_95pct': c['placebo_calm']['real_above_share'] >= 0.95}
        c['gate'] = gate
        c['verdict'] = 'VALIDATED' if all(gate.values()) else ('NULL' if c['ci']['B1_calm']['hi95'] < OPERATIONAL else 'UNDERPOWERED')
    res['verdict'] = {k: res['cells'][k]['verdict'] for k in ('ES', 'NQ')}
    json.dump(res, open(OUT / 'results.json', 'w'), indent=1, default=str); print(json.dumps(res, indent=1, default=str))


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--stage', required=True, choices=['power', 'score']); a = ap.parse_args()
    F = frames()
    stage_power(F) if a.stage == 'power' else stage_score(F)
