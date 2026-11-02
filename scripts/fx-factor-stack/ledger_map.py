#!/usr/bin/env python
"""fx-factor-carry ledger map (forge/FX_FACTOR_STACK_PREREG.md A1.8 + A3): logistic map of a pair's signed carry score,
fitted once on data <= 2026-08-21 and then frozen into js/directionResearch.js.

    score(pair) = z(base) - z(quote), z = cross-sectional z of the 3m rate differential vs USD over the eight currencies
                  (population SD, exactly run.py's zrow), rates exactly as run.py load_rates gives them (A1.3)
    P(pair up over h closes) = sigmoid(a_h + b_h * score); the forecaster adds sigmoid(a+b s) - sigmoid(a) to B0.

One pooled (a, b) per horizon over the seven USD pairs. Overlapping daily rows: the point estimate is unaffected, the
interval comes from a moving-block bootstrap over calendar months. This is an in-sample fit of a registered score; it
is not evidence. The forward record is.

Usage:  MFX_DATA_ROOT=<checkout holding features/> python -I scripts/fx-factor-stack/ledger_map.py
"""
import importlib.util, json, os
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('fxrun', ROOT / 'scripts/fx-factor-stack/run.py')
fx = importlib.util.module_from_spec(spec); spec.loader.exec_module(fx)
OUT = ROOT / 'analysis/output/fx-factor-stack'
SEED, HORIZONS, B = 20261017, (20, 60), 500


def zrow(a):
    sd = np.nanstd(a)
    return (a - np.nanmean(a)) / sd if sd > 0 else a * 0


def fit(s, y, iters=60):
    a, b = 0.0, 0.0
    X = np.column_stack([np.ones_like(s), s])
    for _ in range(iters):
        p = 1 / (1 + np.exp(-(a + b * s)))
        g = X.T @ (y - p)
        H = -(X * (p * (1 - p))[:, None]).T @ X
        d = np.linalg.solve(H, g)
        a, b = a - d[0], b - d[1]
        if np.abs(d).max() < 1e-10:
            break
    return a, b


def main():
    px = fx.load_prices(); idx = px.index
    R = fx.load_rates(idx)
    rate = pd.DataFrame({c: R[c] for c in fx.CCY}).ffill()
    carry = rate.sub(rate['USD'], axis=0)
    Z = pd.DataFrame([zrow(r) for r in carry.to_numpy()], index=idx, columns=fx.CCY)
    ok = carry.notna().all(axis=1)
    res = {'horizons': {}, 'eur_offset': R['_eur_offset'], 'eur_splice_from': R['_eur_splice_from'], 'data_end': str(fx.END.date()),
           'rows_per_pair': {}}
    rng = np.random.default_rng(SEED)
    for h in HORIZONS:
        S, Y, M = [], [], []
        for c, (p, sgn) in fx.PAIR.items():
            lp = np.log(px[c])
            up = (lp.shift(-h) > lp).astype(float).where(lp.shift(-h).notna())
            base, quote = ('USD', c) if sgn < 0 else (c, 'USD')       # sgn -1 = the pair is quoted USD/ccy
            s = Z[base] - Z[quote]
            m = ok & up.notna() & (idx >= fx.START)
            S.append(s[m].to_numpy()); Y.append(up[m].to_numpy()); M.append(idx[m].to_period('M').astype(str))
        S, Y, M = np.concatenate(S), np.concatenate(Y), np.concatenate(M)
        a, b = fit(S, Y)
        months, inv = np.unique(M, return_inverse=True)
        groups = [np.where(inv == k)[0] for k in range(len(months))]
        bs = []
        for _ in range(B):
            pick = rng.integers(0, len(months), len(months))
            sel = np.concatenate([groups[k] for k in pick])
            bs.append(fit(S[sel], Y[sel])[1])
        lo, hi = np.percentile(bs, [2.5, 97.5])
        sig = lambda x: 1 / (1 + np.exp(-x))
        res['horizons'][str(h)] = {'a': a, 'b': b, 'b_ci95_month_block_boot': [float(lo), float(hi)], 'n_rows': int(len(S)),
            'score_sd': float(S.std()), 'shift_at_plus1': float(sig(a + b) - sig(a)), 'shift_at_minus1': float(sig(a - b) - sig(a)),
            'first_row': str(idx[ok & (idx >= fx.START)].min().date())}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'ledger_map.json').write_text(json.dumps(res, indent=2, default=float))
    print(json.dumps(res, indent=2, default=float))


if __name__ == '__main__':
    main()
