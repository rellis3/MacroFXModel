"""transition_matrix.py — P(the timeframe stack becomes fully aligned), frozen.

The aligned state — all three timeframes in the same zone — is the one that
carries the price tilt (+2.11pp median, positive on 31/31 instruments). This
measures the probability of REACHING it from wherever the stack is now, so the
live side can flag "one timeframe away" before the setup exists rather than
after.

    currently aligned    +30m    +1h     +2h     +4h
    0 of 3                0.2%    1.2%    4.3%   12.0%
    2 of 3 (OS)          14.8%   21.5%   29.1%   38.6%

A ~50x spread at 30 minutes, and it replicates to a tenth of a point between
gold and eurusd on 60k+ observations each. That is a far larger and more stable
number than anything else in this study — because it forecasts the INDICATOR'S
OWN STATE, not price.

WHAT IT IS NOT
──────────────
Not a price forecast. It says the setup is likely to FORM, not that price will
move. Its usefulness is entirely borrowed: the aligned state is worth watching
because of the (small) price tilt measured elsewhere, and this says when to
start watching.

THE RANDOM-WALK CONTROL IS NOT OPTIONAL
───────────────────────────────────────
Three timeframes of one oscillator on one price series are nested views of the
same data, so a large fraction of this structure is mechanical. The identical
pipeline is run on a matched-volatility random walk and BOTH numbers are frozen.
A consumer that shows the real number without the control would be presenting
arithmetic as insight — the same mistake `duration.py` caught, where a rising
hazard turned out to be entirely reproduced by a random walk.

Read `excess = real - randomWalk`. If it is ~0, the probability is real but
carries no market information — still usable for "is the setup forming?", but
not evidence of anything about price.

  python vumanchuLab/transition_matrix.py --instruments gold,eurusd,nq
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
from vumanchuLab.panel import OB, OS, epoch_seconds, load_m1, resample  # noqa: E402
from pylego.indicators.vumanchu import (  # noqa: E402
    OPERATOR_WT, align_htf_causal, wave_trend,
)

TFS = (5, 15, 60)                 # the stack the live read watches
STEPS = [3, 6, 12, 24, 48, 96]    # 5m bars -> 15m .. 8h
MIN_N = 500


def zone_stack(bars_by_tf: dict, base_close: np.ndarray, tfs=TFS) -> np.ndarray:
    """One row per timeframe of {-1, 0, +1}, causally aligned to the base grid."""
    rows = []
    for tf in tfs:
        b = bars_by_tf[tf]
        w = wave_trend(b['high'].to_numpy(float), b['low'].to_numpy(float),
                       b['close'].to_numpy(float), **OPERATOR_WT).wt1
        z = np.where(w >= OB, 1.0, np.where(w <= OS, -1.0, 0.0))
        rows.append(z if tf == tfs[0]
                    else align_htf_causal(base_close, epoch_seconds(b.index) + tf * 60, z))
    return np.vstack(rows)


def label_states(S: np.ndarray):
    """Compact alignment label per bar, plus the two fully-aligned masks."""
    fin = np.all(np.isfinite(S), axis=0)
    nOS = (S == -1).sum(axis=0)
    nOB = (S == 1).sum(axis=0)
    lab = np.full(S.shape[1], 'n/a', dtype=object)
    lab[fin & (nOS == 3)] = '3-OS'
    lab[fin & (nOB == 3)] = '3-OB'
    lab[fin & (nOS == 2) & (nOB == 0)] = '2-OS'
    lab[fin & (nOB == 2) & (nOS == 0)] = '2-OB'
    lab[fin & (nOS == 1) & (nOB == 0)] = '1-OS'
    lab[fin & (nOB == 1) & (nOS == 0)] = '1-OB'
    lab[fin & (nOS == 0) & (nOB == 0)] = '0-flat'
    lab[fin & (nOS >= 1) & (nOB >= 1)] = 'split'      # timeframes disagree in DIRECTION
    return lab, fin & (nOS == 3), fin & (nOB == 3)


def _within(mask: np.ndarray, k: int) -> np.ndarray:
    """True at i if `mask` is true anywhere in (i, i+k]."""
    n = mask.size
    out = np.zeros(n, bool)
    for j in range(1, k + 1):
        out[:n - j] |= mask[j:]
    return out


def measure(S: np.ndarray, min_n=MIN_N) -> dict:
    lab, allOS, allOB = label_states(S)
    anyAligned = allOS | allOB
    pre = {k: _within(anyAligned, k) for k in STEPS}
    preOS = {k: _within(allOS, k) for k in STEPS}
    preOB = {k: _within(allOB, k) for k in STEPS}
    # For a state that is ALREADY aligned, the useful question is the opposite:
    # how long does it hold? Measured as P(no longer aligned within k).
    notAligned = ~anyAligned
    exit_ = {k: _within(notAligned, k) for k in STEPS}

    out = {}
    for st in ['0-flat', '1-OS', '1-OB', '2-OS', '2-OB', '3-OS', '3-OB', 'split']:
        m = lab == st
        if m.sum() < min_n:
            continue
        row = {'n': int(m.sum()), 'freq_pct': round(100 * m.sum() / len(lab), 2), 'steps': []}
        for k in STEPS:
            e = {'bars': k, 'mins': k * TFS[0]}
            if st.startswith('3-'):
                e['p_exit'] = round(100 * float(exit_[k][m].mean()), 1)
            else:
                e['p_align'] = round(100 * float(pre[k][m].mean()), 1)
                e['p_align_os'] = round(100 * float(preOS[k][m].mean()), 1)
                e['p_align_ob'] = round(100 * float(preOB[k][m].mean()), 1)
            row['steps'].append(e)
        out[st] = row
    return out


def build(instrument: str, seed: int = 11) -> dict:
    m1 = load_m1(instrument)
    ev = resample(m1, TFS[0])
    base_close = epoch_seconds(ev.index) + TFS[0] * 60
    by_tf = {tf: (ev if tf == TFS[0] else resample(m1, tf)) for tf in TFS}
    real = measure(zone_stack(by_tf, base_close))

    # Matched-volatility random walk through the IDENTICAL pipeline.
    c = ev['close'].to_numpy(float)
    rng = np.random.default_rng(seed)
    vol = float(np.nanstd(np.diff(np.log(c))))
    p = c[0] * np.exp(np.cumsum(rng.normal(0, vol, len(c))))
    wig = p * vol * 0.5
    synth = pd.DataFrame({'open': p, 'high': p + wig, 'low': p - wig, 'close': p,
                          'volume': 1.0}, index=ev.index)
    sy = {tf: (synth if tf == TFS[0] else resample(synth, tf)) for tf in TFS}
    rw = measure(zone_stack(sy, base_close))

    for st, row in real.items():
        ctrl = rw.get(st)
        for i, e in enumerate(row['steps']):
            ce = ctrl['steps'][i] if ctrl and i < len(ctrl['steps']) else None
            for key in ('p_align', 'p_exit'):
                if key in e:
                    e[key + '_rw'] = ce.get(key) if ce else None
                    e[key + '_excess'] = (round(e[key] - ce[key], 1)
                                          if ce and ce.get(key) is not None else None)
    return {'real': real, 'rw_n': {k: v['n'] for k, v in rw.items()}}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--instruments', default='gold,eurusd,nq')
    ap.add_argument('--out', default=os.path.join(DATA, 'vumanchu_transitions.json'))
    a = ap.parse_args()

    table = {
        '_generated_by': 'vumanchuLab/transition_matrix.py',
        '_what': 'P(the 5m/15m/1h WaveTrend zone stack becomes FULLY ALIGNED) from '
                 'each alignment state, and P(exit) once already aligned.',
        '_read': 'This forecasts the INDICATOR\'S STATE, not price. It says the setup '
                 'is likely to form, not that price will move — its usefulness is '
                 'borrowed from the small price tilt the aligned state carries. '
                 'ALWAYS read p_align_excess (real minus a matched random walk): the '
                 'timeframes are nested views of one series, so much of this is '
                 'mechanical, and excess ~0 means the number is real but carries no '
                 'market information.',
        'timeframes': list(TFS), 'base_tf_min': TFS[0], 'instruments': {},
    }
    for inst in [s.strip() for s in a.instruments.split(',') if s.strip()]:
        try:
            print(f'  {inst} ...', end='', flush=True)
            table['instruments'][inst] = build(inst)
            print(f" {len(table['instruments'][inst]['real'])} states")
        except Exception as e:
            print(f' FAILED {str(e)[:70]}')
        with open(a.out, 'w') as fh:
            json.dump(table, fh, separators=(',', ':'))

    with open(a.out, 'w') as fh:
        json.dump(table, fh, separators=(',', ':'))
    print(f"\nwrote {a.out} ({os.path.getsize(a.out)/1024:.0f} KB), "
          f"{len(table['instruments'])} instruments")


if __name__ == '__main__':
    main()
