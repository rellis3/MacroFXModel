"""wt_projection.py — freeze the forward WaveTrend path, per state.

The one thing in this study that projects well is the OSCILLATOR, not price.

`duration.py` / `transitions.py` found the wave's forward behaviour matches a
random walk — which was a null for predicting PRICE, but is exactly what makes
the wave's own path projectable: its dynamics are dominated by its own
construction (an EMA chain against a 3-bar SMA), so given the current state the
distribution of where the wave goes next is tight and stable.

Measured on gold: from `OS/fall`, WT1's interquartile band 15m out is ~24 points
wide against an unconditional spread of 78 — three times tighter — and the wave
decays to ~0 from either extreme within about two hours.

Contrast with a price cone, where the VuManChu contribution is ~0.05σ against a
~1.25σ envelope and is invisible when drawn. Projecting the wave sidesteps that
entirely: WT is bounded ±100 and self-normalising, so the projection lives on
the oscillator's own axis at its own scale.

WHAT IT EMITS
─────────────
For each (instrument, state) a forward ladder of WT1 percentiles:

    { "OS/fall": { "n": 28136, "now": -65.7,
                   "steps": [{ "bars": 3, "p10":…, "p25":…, "p50":…, "p75":…, "p90":… }, …] } }

State is the same `level/form` vocabulary the live read uses
(`js/vumanchuState.js`), so the pane can look up the current state and draw the
ladder straight onto the WaveTrend pane.

CAUSALITY: the state at bar i uses only bars <= i; the ladder is the DISTRIBUTION
of what followed historically. It is a description of past continuations, not a
forecast of this one — the bands are wide for a reason and should be drawn as
bands, never as a line.

  python vumanchuLab/wt_projection.py --instruments gold,eurusd,nq
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from vumanchuLab.analyse import DATA  # noqa: E402
from vumanchuLab.panel import OB, OS, load_m1, resample  # noqa: E402
from pylego.indicators.vumanchu import OPERATOR_WT, wave_trend  # noqa: E402

EVENT_TF = 5                      # the grid the pane is usually read on
STEPS = [1, 2, 3, 4, 6, 8, 12, 18, 24, 36]   # bars ahead (5m each -> 5m .. 3h)
FORM_LAG = 10
MIN_N = 300
PCTS = [10, 25, 50, 75, 90]


def state_codes(w1: np.ndarray) -> pd.Series:
    """`level/form`, identical to js/vumanchuState.js and shapes.py."""
    lvl = np.where(w1 >= OB, 'OB', np.where(w1 <= OS, 'OS', 'mid'))
    far = np.r_[[np.nan] * FORM_LAG, w1[:-FORM_LAG]]
    half = np.r_[[np.nan] * (FORM_LAG // 2), w1[:-(FORM_LAG // 2)]]
    early, late = half - far, w1 - half
    form = np.where((early < 0) & (late > 0), 'Vup',
           np.where((early > 0) & (late < 0), 'Vdn',
           np.where(late >= 0, 'rise', 'fall')))
    return pd.Series(lvl) + '/' + pd.Series(form)


def project(instrument: str, event_tf: int = EVENT_TF, min_n: int = MIN_N) -> dict:
    ev = resample(load_m1(instrument), event_tf)
    h = ev['high'].to_numpy(float); l = ev['low'].to_numpy(float)
    c = ev['close'].to_numpy(float)
    w1 = wave_trend(h, l, c, **OPERATOR_WT).wt1
    codes = state_codes(w1)
    maxk = max(STEPS)

    out = {}
    for st, idx in codes.groupby(codes).groups.items():
        i = np.asarray(idx)
        i = i[(i < len(w1) - maxk - 1) & np.isfinite(w1[i])]
        if i.size < min_n:
            continue
        steps = []
        for k in STEPS:
            v = w1[i + k]
            v = v[np.isfinite(v)]
            if v.size < min_n:
                continue
            q = np.percentile(v, PCTS)
            steps.append({'bars': int(k), 'mins': int(k * event_tf),
                          **{f'p{p}': round(float(x), 1) for p, x in zip(PCTS, q)}})
        if steps:
            out[str(st)] = {'n': int(i.size), 'now': round(float(np.median(w1[i])), 1),
                            'steps': steps}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--instruments', default='gold,eurusd,nq')
    ap.add_argument('--event-tf', type=int, default=EVENT_TF)
    ap.add_argument('--out', default=os.path.join(DATA, 'vumanchu_wt_projection.json'))
    a = ap.parse_args()

    table = {
        '_generated_by': 'vumanchuLab/wt_projection.py',
        '_what': 'Forward WaveTrend(9/12/3) percentile ladder, conditioned on the '
                 'current level/form state. Percentiles of WT1 at each step.',
        '_read': 'These are BANDS describing what followed historically, not a '
                 'forecast of this instance. Draw them as bands. The p25-p75 span '
                 'is roughly 3x tighter than the unconditional WT1 spread at short '
                 'horizons, and widens toward it as the horizon grows.',
        'event_tf_min': a.event_tf, 'wt': OPERATOR_WT,
        'percentiles': PCTS, 'instruments': {},
    }
    for inst in [s.strip() for s in a.instruments.split(',') if s.strip()]:
        try:
            print(f'  {inst} ...', end='', flush=True)
            table['instruments'][inst] = project(inst, a.event_tf)
            print(f' {len(table["instruments"][inst])} states')
        except Exception as e:
            print(f' FAILED {str(e)[:60]}')
        with open(a.out, 'w') as fh:
            json.dump(table, fh, separators=(',', ':'))

    with open(a.out, 'w') as fh:
        json.dump(table, fh, separators=(',', ':'))
    print(f'\nwrote {a.out} ({os.path.getsize(a.out)/1024:.0f} KB), '
          f'{len(table["instruments"])} instruments')


if __name__ == '__main__':
    main()
