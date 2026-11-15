"""Evidence pack per scored cell of positioning-flow-inputs (forge/POSITIONING_FLOW_INPUTS_PREREG.md).

Reads the runner's out-of-sample predictions (analysis/output/positioning-flow-inputs/cache/oos_predictions.parquet)
and results.json, and calls scripts/evidence_pack/pack.py build_pack for each of the 28 cells.

Row encoding (one row per instrument x test date):
    alone cell:       ref = b0;   statistic BSS_B0 = 1 - sum (p - y)^2 / sum (b0 - y)^2
    incremental cell: ref = base (the bias-learner readings on the B0 offset);
                      statistic dBSS = (sum (base - y)^2 - sum (p - y)^2) / sum (b0 - y)^2
    signal = p - ref (the input's lean), side = sign(signal), outcome = per-row Brier gain (ref - y)^2 - (p - y)^2
estimate_fn rebuilds p = ref + signal, so the pack's shuffled placebo really scrambles the input's lean.
plant_fn (positive control): a bar-sized drift in the signal's direction on the real rows: labels that disagree with
the lean are flipped to agree, in a fixed random order, the smallest number that lifts the statistic by the planted
amount. leak_fn (lookahead canary): signal = y - ref, the same-day realised move's direction.

    python -X utf8 -I scripts/positioning-flow-inputs/evidence.py
"""
from __future__ import annotations

import json
import os
import shutil
import sys

os.environ.setdefault('OMP_NUM_THREADS', '2')
for k in [k for k in os.environ if k.startswith('R2_')]:
    del os.environ[k]

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'evidence_pack'))
from pack import build_pack  # noqa: E402

OUT = os.path.join(ROOT, 'analysis', 'output', 'positioning-flow-inputs')
EV = os.path.join(OUT, 'evidence')
SEED = 20261115
EPS = 1e-6


def _p(r):
    return np.clip(r['ref'].to_numpy(float) + r['signal'].to_numpy(float), EPS, 1 - EPS)


def est_fn(r):
    y, b0, ref = r['y'].to_numpy(float), r['b0'].to_numpy(float), r['ref'].to_numpy(float)
    d = ((b0 - y) ** 2).sum()
    if d <= 0:
        return float('nan')
    return float((((ref - y) ** 2).sum() - ((_p(r) - y) ** 2).sum()) / d)


def plant(r, eff, rng):
    base = est_fn(r)
    side = np.sign(r['signal'].to_numpy(float))
    y = r['y'].to_numpy(float)
    cand = np.flatnonzero((side != 0) & ((y > 0.5) != (side > 0)))
    cand = cand[rng.permutation(len(cand))]

    def with_k(k):
        y2 = y.copy(); y2[cand[:k]] = (side[cand[:k]] > 0).astype(float)
        r2 = r.copy(); r2['y'] = y2
        return r2
    lo, hi = 0, len(cand)
    if est_fn(with_k(hi)) - base < eff:
        return with_k(hi)
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if est_fn(with_k(mid)) - base >= eff:
            hi = mid
        else:
            lo = mid
    return with_k(hi)


def leak(r, rng):
    s = r['y'].to_numpy(float) - r['ref'].to_numpy(float)
    return r.assign(signal=s, side=np.sign(s).astype(int))


def main():
    res = json.load(open(os.path.join(OUT, 'results.json')))
    pr = pd.read_parquet(os.path.join(OUT, 'cache', 'oos_predictions.parquet'))
    summary, packs = [], {}
    for c in res['cells']:
        sub = pr[pr.cell == c['name']]
        ref = sub['base'] if c['kind'] == 'incr' else sub['b0']
        rows = pd.DataFrame({'date': pd.to_datetime(sub['date']), 'inst': sub['inst'], 'y': sub['y'].astype(float),
                             'b0': sub['b0'].astype(float), 'ref': ref.astype(float),
                             'signal': (sub['p'] - ref).astype(float)})
        rows['side'] = np.sign(rows['signal']).astype(int)
        rows['outcome'] = (rows['ref'] - rows['y']) ** 2 - (sub['p'].to_numpy() - rows['y']) ** 2
        assert rows['date'].max() <= pd.Timestamp('2026-08-21'), 'lockbox breach'
        bar = float(c['U'])
        tag = c['name'].replace('|', '_').replace(':', '').replace('+', 'p')
        tmp = os.path.join(EV, f'_build_{tag}')
        pk = build_pack(rows, slug=f"positioning-flow-inputs:{c['name']}", out=tmp, estimate_fn=est_fn, bar=bar,
                        unit=('Brier skill vs B0 (fraction)' if c['kind'] == 'alone' else
                              'Brier skill gain over the bias-learner base, as a fraction of B0 error'),
                        plant_fn=plant, leak_fn=leak, verdict_word=c['verdict'], seed=SEED, B=1000, n_placebo=500,
                        n_plants=20,
                        notes=(f"Runner: est {c['est']:+.5f} [{c['lo']:+.5f}, {c['hi']:+.5f}] (21-date moving-block "
                               f"bootstrap); 200-refit block-shuffled-input placebo 95th pct {c['placebo_p95']:+.5f}. "
                               "The pack bootstraps dates iid and its placebo shuffles the fitted lean without refit, "
                               "so the runner's numbers are the binding ones. Plant = labels flipped toward the lean "
                               "until the statistic rises by the bar; canary = lean set to the realised direction."))
        dest = os.path.join(EV, tag)
        if os.path.exists(dest):
            shutil.rmtree(dest)
        shutil.move(os.path.join(tmp, 'evidence'), dest)
        shutil.rmtree(tmp, ignore_errors=True)
        pc = {x['multiple_of_bar']: x['detected_share'] for x in pk['positive_control']}
        packs[c['name']] = {'dir': f'analysis/output/positioning-flow-inputs/evidence/{tag}',
                            'label': pk['diagnosis']['label'], 'plant_1x_detected': pc.get(1.0),
                            'placebo_pct': pk['placebo']['real_percentile'],
                            'canary': pk['lookahead_canary']['estimate_with_leak'],
                            'without_top1pct': pk.get('without_top1pct')}
        line = (f"{c['name']}: est {pk['estimate']:+.5f} bar {bar:+.5f} plant1x {pc.get(1.0)} placebo pct "
                f"{pk['placebo']['real_percentile']:.0f} canary {pk['lookahead_canary']['estimate_with_leak']:+.3f} "
                f"-> {pk['diagnosis']['label']}")
        print(line, flush=True)
        summary.append(line)
    os.makedirs(EV, exist_ok=True)
    open(os.path.join(EV, 'summary.txt'), 'w', encoding='utf-8').write('\n'.join(summary) + '\n')
    res['packs'] = packs
    json.dump(res, open(os.path.join(OUT, 'results.json'), 'w'), indent=1, default=float)


if __name__ == '__main__':
    main()
