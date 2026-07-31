"""transitions.py — the timing question, posed the way the data can answer it.

Two earlier attempts at "when" both failed:
  cycle_phase.py  phase alone was null; "overdue" was the WEAKEST bucket
  duration.py     the hazard was real but a random walk reproduced it

Both asked about the oscillator's own rhythm. This asks something different and
strictly more useful: treat the discretised VMC state as a MARKOV CHAIN and
measure, from each state, the distribution of bars until it reaches another.

    from state A, how many bars until oversold?
    from state A, is overbought or oversold reached first, and how often?

That is "when", expressed as a distribution with a sample count, which is what
the engine was asked for. It is also directly checkable against the null the
duration study needed: a random walk is run through the identical pipeline, and
only the REAL-MINUS-RANDOM-WALK difference is treated as market content.

STATE SPACE
───────────
The three-timeframe zone read (1m / 5m / 15m each OS / mid / OB) is 27 states,
most of them rare. Default is the coarser and far better-populated
`stack` alphabet: the fast zone crossed with how many timeframes agree.

  python vumanchuLab/transitions.py --instrument gold
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vumanchuLab.labcommon import get_panel  # noqa: E402
from vumanchuLab.panel import OB, OS, TIMEFRAMES  # noqa: E402
from pylego.indicators.vumanchu import OPERATOR_WT, wave_trend  # noqa: E402

MAX_WAIT = 400          # bars; beyond this the wait is right-censored
TARGETS = ('OS', 'OB')


def state_labels(panel: pd.DataFrame) -> pd.Series:
    z = panel['tf1_wt_zone']
    lab = np.where(z > 0, 'OB', np.where(z < 0, 'OS', 'mid'))
    n = panel['stack_n_agree'].fillna(0).astype(int).astype(str)
    return pd.Series(lab, index=panel.index) + '/' + n


def first_passage(states: np.ndarray, target_mask: np.ndarray,
                  max_wait: int = MAX_WAIT) -> np.ndarray:
    """Bars from each position until `target_mask` is next true.

    Right-censored at `max_wait` (returns -1) rather than dropped, so the
    censoring is visible instead of silently biasing every wait downward —
    the same trap `duration.py` avoided by discarding its final open episode.
    """
    n = target_mask.size
    nxt = np.full(n, -1, dtype=np.int64)
    last = -1
    for i in range(n - 1, -1, -1):
        if target_mask[i]:
            last = i
        nxt[i] = last
    wait = np.where(nxt < 0, -1, nxt - np.arange(n))
    wait = np.where((wait < 0) | (wait > max_wait), -1, wait)
    return wait


def table(states: pd.Series, waits: dict, min_n: int = 300) -> pd.DataFrame:
    rows = []
    for st, idx in states.groupby(states).groups.items():
        pos = states.index.get_indexer(idx)
        if pos.size < min_n:
            continue
        row = {'state': st, 'n': pos.size,
               'freq_pct': round(100 * pos.size / len(states), 2)}
        for tgt, w in waits.items():
            v = w[pos]
            reached = v >= 0
            row[f'{tgt}_reached_pct'] = round(100 * reached.mean(), 1)
            row[f'{tgt}_median'] = round(float(np.median(v[reached])), 1) if reached.any() else np.nan
            row[f'{tgt}_p25'] = round(float(np.percentile(v[reached], 25)), 1) if reached.any() else np.nan
            row[f'{tgt}_p75'] = round(float(np.percentile(v[reached], 75)), 1) if reached.any() else np.nan
        # which extreme arrives first
        a, b = waits['OS'][pos], waits['OB'][pos]
        both = (a >= 0) | (b >= 0)
        aa = np.where(a < 0, 10**9, a)
        bb = np.where(b < 0, 10**9, b)
        row['OS_first_pct'] = round(100 * float((aa < bb)[both].mean()), 1) if both.any() else np.nan
        rows.append(row)
    return pd.DataFrame(rows).sort_values('n', ascending=False).reset_index(drop=True)


def run(panel: pd.DataFrame, label: str, min_n: int = 300) -> pd.DataFrame:
    st = state_labels(panel)
    z = panel['tf1_wt_zone'].to_numpy()
    waits = {'OS': first_passage(None, z <= -1), 'OB': first_passage(None, z >= 1)}
    t = table(st, waits, min_n)
    t.insert(0, 'series', label)
    return t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--instrument', default='gold')
    ap.add_argument('--min-n', type=int, default=300)
    a = ap.parse_args()

    print(f'Loading {a.instrument} ...')
    p = get_panel(a.instrument)
    real = run(p, 'real', a.min_n)

    # Random-walk null through the identical pipeline. This is the control that
    # killed duration.py's result, so it is mandatory here.
    from vumanchuLab.panel import load_m1, resample
    m1 = resample(load_m1(a.instrument), 1)
    c = m1['close'].to_numpy(float)
    rng = np.random.default_rng(23)
    vol = float(np.nanstd(np.diff(np.log(c))))
    synth = c[0] * np.exp(np.cumsum(rng.normal(0, vol, len(c))))
    wig = synth * vol * 0.5
    wt = wave_trend(synth + wig, synth - wig, synth, **OPERATOR_WT)
    sp = pd.DataFrame(index=m1.index)
    sp['tf1_wt_zone'] = np.where(wt.wt1 >= OB, 1, np.where(wt.wt1 <= OS, -1, 0))
    sp['stack_n_agree'] = p['stack_n_agree'].reindex(sp.index).fillna(1).values \
        if len(p) == len(sp) else 1
    sp = sp.iloc[::5]
    rw = run(sp, 'random walk', a.min_n)

    pd.set_option('display.width', 220)
    print(f'\n{"="*104}')
    print(f'FIRST-PASSAGE TIMES — {a.instrument}, panel bars (stride 5 => 1 row = 5 min)')
    print('"from this state, how many bars until the wave reaches OS / OB?"')
    print(f'{"="*104}\n')
    cols = ['state', 'n', 'freq_pct', 'OS_reached_pct', 'OS_median', 'OS_p25', 'OS_p75',
            'OB_reached_pct', 'OB_median', 'OB_p75', 'OS_first_pct']
    print('REAL'); print(real[cols].to_string(index=False))
    print('\nRANDOM WALK'); print(rw[cols].to_string(index=False))

    m = real.merge(rw, on='state', suffixes=('_real', '_rw'))
    if not m.empty:
        m['d_OS_median'] = (m['OS_median_real'] - m['OS_median_rw']).round(1)
        m['d_OS_first'] = (m['OS_first_pct_real'] - m['OS_first_pct_rw']).round(1)
        print('\nREAL minus RANDOM WALK — the only market content')
        print(m[['state', 'n_real', 'OS_median_real', 'OS_median_rw', 'd_OS_median',
                 'OS_first_pct_real', 'OS_first_pct_rw', 'd_OS_first']].to_string(index=False))

    print(f'\n{"-"*104}')
    print('OS_median   = median bars until the wave next reaches oversold.')
    print('OS_first_pct= from this state, how often oversold arrives BEFORE overbought.')
    print('d_*         = real minus random walk. Near zero means the timing is a')
    print('              property of the oscillator, not of the market (which is')
    print('              exactly what duration.py found for episode lengths).')
    print('-' * 104)


if __name__ == '__main__':
    main()
