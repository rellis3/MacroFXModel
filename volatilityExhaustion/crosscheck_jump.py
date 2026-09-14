"""
crosscheck_jump.py — the JS/Python parity contract for the jump decomposition.

`js/jumpDiffusionCore.js` runs on today's live session; `jump_detect_lm.py` +
`vol_exhaustion_lib.py` run the offline study. They are the same estimator, so a
drift between them would mean the live page describes a different market than the
research measured — silently, and only on days that matter.

Per PYTHON_LEGO.md's generate-don't-port rule, that is asserted rather than assumed:
this writes a synthetic return series with a planted jump and a real diurnal cycle,
runs the JS module on the identical bytes, and requires agreement to 1e-12 on RV, BV,
the jump fraction, the Gumbel threshold, every local-sigma value, every deseasonalised
return, and the exact set of detected jump indices.

Run:  python3 crosscheck_jump.py       (exits non-zero on any disagreement)
"""
import os, sys, json, math, subprocess
import numpy as np
from vol_exhaustion_lib import bipower, jump_fraction
from jump_detect_lm import local_sigma, lm_threshold, BUCKET, K, ALPHA

HERE = os.path.dirname(os.path.abspath(__file__))
INP = os.path.join(HERE, '_xcheck_jump.json')
TOL = 1e-12


def main():
    rng = np.random.default_rng(21)
    n_ret = 900
    tod = [(i * 5) % 1440 for i in range(n_ret)]          # a real 5-min clock
    # a genuine ~3x diurnal cycle, so the periodicity path is actually exercised
    nb = 1440 // BUCKET
    factors = [0.6 + 2.0 * math.exp(-((b - 27) ** 2) / 50.0) for b in range(nb)]
    mean_f = sum(factors) / nb
    factors = [max(f / mean_f, 0.05) for f in factors]     # normalised, as the fit does
    r = rng.normal(0, 1e-4, n_ret) * np.array([factors[(t // BUCKET) % nb] for t in tod])
    r[500] += 0.008                                        # a planted jump
    r[770] -= 0.006                                        # and one the other way
    returns = [float(x) for x in r]

    with open(INP, 'w') as f:
        json.dump(dict(returns=returns, tod=tod, factors=factors,
                       k=K, alpha=ALPHA, n=288), f)

    out = subprocess.run(['node', os.path.join(HERE, 'crosscheck_jump.mjs')],
                         capture_output=True, text=True)
    if out.returncode != 0:
        print('node failed:\n' + out.stderr); return 1
    js = json.loads(out.stdout)

    ra = np.array(returns)
    py_rv, py_bv = bipower(ra)
    py_jf = jump_fraction(ra)
    py_thr = lm_threshold(288, ALPHA)
    fac = np.array(factors)
    b = (np.array(tod) // BUCKET) % nb
    py_adj = ra / np.maximum(fac[b], 0.05)
    py_sig = local_sigma(py_adj, K)
    with np.errstate(invalid='ignore'):
        L = np.abs(py_adj) / py_sig
    py_idx = np.flatnonzero(np.isfinite(L) & (L > py_thr)).tolist()

    fails = []

    def cmp(name, a, bv):
        d = abs(a - bv)
        print(f'  {name:16s} py={a:.12g}  js={bv:.12g}  |Δ|={d:.2e}')
        if not (d <= TOL * max(1.0, abs(a))):
            fails.append(name)

    print('JS vs Python — jump decomposition parity\n')
    cmp('RV', float(py_rv), js['rv'])
    cmp('BV', float(py_bv), js['bv'])
    cmp('jump_fraction', float(py_jf), js['jump_fraction'])
    cmp('threshold', float(py_thr), js['threshold'])

    js_sig = np.array([np.nan if v is None else v for v in js['local_sigma']])
    m = np.isfinite(py_sig) | np.isfinite(js_sig)
    if not np.array_equal(np.isfinite(py_sig), np.isfinite(js_sig)):
        fails.append('local_sigma NaN pattern')
        print('  local_sigma     NaN PATTERN DIFFERS')
    else:
        d = np.nanmax(np.abs(py_sig[m] - js_sig[m])) if m.any() else 0.0
        print(f'  {"local_sigma":16s} max|Δ| over {int(np.isfinite(py_sig).sum())} finite = {d:.2e}')
        if not (d <= TOL):
            fails.append('local_sigma')

    d_adj = float(np.max(np.abs(py_adj - np.array(js['adjusted']))))
    print(f'  {"deseasonalised":16s} max|Δ| = {d_adj:.2e}')
    if not (d_adj <= TOL):
        fails.append('deseasonalised')

    print(f'  {"jump indices":16s} py={py_idx}  js={js["jump_idx"]}')
    if py_idx != js['jump_idx']:
        fails.append('jump indices')

    os.remove(INP)
    if fails:
        print(f'\nFAIL — disagreement in: {", ".join(fails)}')
        return 1
    print(f'\nPASS — js/jumpDiffusionCore.js is identical to the Python study maths '
          f'(tolerance {TOL:g}).')
    return 0


if __name__ == '__main__':
    sys.exit(main())
