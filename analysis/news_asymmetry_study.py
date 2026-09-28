"""NEWS-ASYMMETRY — the harness for MD files/NEWS_ASYMMETRY_PREREG.md.

Does a bad surprise (z < 0, polarity-signed) move FX more in the first 30 minutes
than an equally large good one? Reads backfill/event_response_events.json only.

    python3 analysis/news_asymmetry_study.py

Writes analysis/output/news_asymmetry.json. Every definition is §3 of the prereg;
nothing here is a free parameter.
"""
import json
import math
import os

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVENTS = os.path.join(ROOT, 'backfill', 'event_response_events.json')
OUT = os.path.join(ROOT, 'analysis', 'output', 'news_asymmetry.json')

FAMILIES = [
    'us|core-inflation-rate-month-over-month',
    'us|payroll-jobs-growth',
    'us|headline-unemployment-rate',
    'us|annual-wage-growth',
    'ca|unemployment-rate',
    'au|employment-change',
]
Z_CAP = 3.0
SPLIT_MS = 1609459200000  # 2021-01-01T00:00Z
BAR = 0.25


def load():
    fams = json.load(open(EVENTS))['families']
    # sign-blind per-instrument scale: median |R0| over every release of the six families
    pooled = {}
    for f in FAMILIES:
        for inst, rows in fams[f]['instruments'].items():
            pooled.setdefault(inst, []).extend(abs(r['r0']) for r in rows if r.get('r0') is not None)
    scale = {inst: float(np.median(v)) for inst, v in pooled.items()}
    rows = []
    for fi, f in enumerate(FAMILIES):
        by_ms = {}
        for inst, evs in fams[f]['instruments'].items():
            for r in evs:
                if r.get('z') is None or r.get('r0') is None:
                    continue
                e = by_ms.setdefault(r['ms'], {'z': r['z'], 'v': []})
                e['v'].append(abs(r['r0']) / scale[inst])
        for ms, e in by_ms.items():
            rows.append({'fam': fi, 'ms': ms, 'z': max(-Z_CAP, min(Z_CAP, e['z'])), 'y': float(np.mean(e['v']))})
    return rows, scale


def ols_hc1(X, y):
    n, k = X.shape
    XtX_inv = np.linalg.inv(X.T @ X)
    b = XtX_inv @ X.T @ y
    e = y - X @ b
    meat = (X * (e ** 2)[:, None]).T @ X
    V = XtX_inv @ meat @ XtX_inv * n / (n - k)
    return b, V


def delta_fit(rows, fixed_effects=True):
    fam_ids = sorted({r['fam'] for r in rows})
    z = np.array([r['z'] for r in rows])
    y = np.array([r['y'] for r in rows])
    cols = [np.abs(z) * (z > 0), np.abs(z) * (z < 0)]
    if fixed_effects:
        cols += [np.array([r['fam'] == f for r in rows], dtype=float) for f in fam_ids]
    else:
        cols += [np.ones(len(rows))]
    X = np.column_stack(cols)
    b, V = ols_hc1(X, y)
    c = np.zeros(X.shape[1]); c[0], c[1] = -1.0, 1.0
    d = float(c @ b)
    se = float(math.sqrt(c @ V @ c))
    return {
        'n': len(rows),
        'nGood': int((z > 0).sum()), 'nBad': int((z < 0).sum()), 'nInline': int((z == 0).sum()),
        'betaGood': round(float(b[0]), 4), 'seGood': round(float(math.sqrt(V[0, 0])), 4),
        'betaBad': round(float(b[1]), 4), 'seBad': round(float(math.sqrt(V[1, 1])), 4),
        'delta': round(d, 4), 'seDelta': round(se, 4), 't': round(d / se, 2),
        'ci95': [round(d - 1.96 * se, 4), round(d + 1.96 * se, 4)],
        'p': round(math.erfc(abs(d / se) / math.sqrt(2)), 4),
    }


def bh(pvals, q=0.10):
    m = len(pvals)
    order = sorted(range(m), key=lambda i: pvals[i])
    k_max = -1
    for rank, i in enumerate(order):
        if pvals[i] <= (rank + 1) / m * q:
            k_max = rank
    rej = [False] * m
    for rank, i in enumerate(order):
        if rank <= k_max:
            rej[i] = True
    return rej


def main():
    rows, scale = load()
    pooled = delta_fit(rows)
    halves = {
        '2016-2020': delta_fit([r for r in rows if r['ms'] < SPLIT_MS]),
        '2021-2026': delta_fit([r for r in rows if r['ms'] >= SPLIT_MS]),
    }
    per_family = {f: delta_fit([r for r in rows if r['fam'] == i], fixed_effects=False) for i, f in enumerate(FAMILIES)}
    rej = bh([v['p'] for v in per_family.values()])
    for (f, v), r in zip(per_family.items(), rej):
        v['bhReject_q10'] = r

    sign = 1 if pooled['delta'] > 0 else -1
    halves_same = all((h['delta'] > 0) == (sign > 0) for h in halves.values())
    fam_same = sum((v['delta'] > 0) == (sign > 0) for v in per_family.values())
    gate = halves_same and fam_same >= 4
    passed = pooled['delta'] >= BAR and pooled['t'] >= 2 and gate
    reversed_ = pooled['delta'] <= -BAR and pooled['t'] <= -2 and gate
    verdict = 'PASS' if passed else 'REVERSED' if reversed_ else 'NULL'

    out = {
        'spec': 'MD files/NEWS_ASYMMETRY_PREREG.md',
        'zCap': Z_CAP, 'bar': BAR,
        'pooled': pooled, 'halves': halves, 'perFamily': per_family,
        'gate': {'halvesSameSign': halves_same, 'familiesSameSign': fam_same, 'holds': gate},
        'verdict': verdict,
        'scale': {k: round(v, 3) for k, v in scale.items()},
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, 'w'), indent=2)
    print(json.dumps({k: out[k] for k in ('pooled', 'halves', 'gate', 'verdict')}, indent=2))
    for f, v in per_family.items():
        print(f"{f:45s} n={v['n']:4d} good={v['betaGood']:+.3f} bad={v['betaBad']:+.3f} Δ={v['delta']:+.3f} [{v['ci95'][0]:+.3f},{v['ci95'][1]:+.3f}] p={v['p']:.3f} BH={v['bhReject_q10']}")


if __name__ == '__main__':
    main()
