"""duration.py — HOW LONG, not what. The timing question, measured properly.

Everything else in this lab asks "what happens over the next N minutes" — a
fixed-horizon question. This asks the one that was actually being claimed:

    how long does the yellow line stay above zero before it flips back?
    and given it has ALREADY been up for t bars, how much longer?

That is a survival/hazard question, and the difference matters enormously:

  FLAT hazard (memoryless / exponential)
      elapsed time tells you NOTHING about remaining time. "It's been up 20
      bars so it's due" is then simply false — the expected wait is the same
      as it was at bar 1. This is the null.

  RISING hazard
      the longer it has run, the more likely it flips next bar. This is the
      "a turn is overdue" intuition, and it is the ONLY case in which elapsed
      time is a usable timing signal.

  FALLING hazard
      long runs beget longer runs. Elapsed time is still informative — but in
      the opposite direction to the intuition, i.e. a long run means EXPECT
      MORE, not expect a flip.

The engine has no clock without this. With it, a state can carry an expected
remaining duration and a distribution around it.

DEFINITIONS
───────────
Yellow line = the Cipher B "VWAP" = `wt1 - wt2` (see jordan_rule.py for why it
is not a volume-weighted price). An EPISODE is a maximal run of bars with the
same sign. Episodes still open at the end of the data are dropped (right-
censored — keeping them would bias every duration downward).

  python vumanchuLab/duration.py --instrument eurusd --tf 5
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Redirecting stdout to a file makes Python pick the locale codec (cp1252 on
# Windows), which dies on the sigma/arrow glyphs this module prints. Force
# UTF-8 so `> out.txt` behaves the same as the console.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from vumanchuLab.panel import load_m1, resample  # noqa: E402
from pylego.indicators.vumanchu import OPERATOR_WT, wave_trend  # noqa: E402


def episodes(series: np.ndarray):
    """Maximal same-sign runs. Returns (start, length, sign), last one dropped."""
    s = np.sign(np.asarray(series, dtype=float))
    ok = np.isfinite(s) & (s != 0)
    idx = np.flatnonzero(ok)
    if idx.size < 2:
        return np.empty(0, int), np.empty(0, int), np.empty(0, int)
    v = s[idx]
    brk = np.flatnonzero(np.r_[True, v[1:] != v[:-1]])
    starts = idx[brk]
    lens = np.diff(np.r_[brk, v.size])
    signs = v[brk].astype(int)
    # drop the final, still-open episode (right-censored)
    return starts[:-1], lens[:-1], signs[:-1]


def hazard_table(lens: np.ndarray, bins) -> pd.DataFrame:
    """P(episode ends within this bucket | it reached the bucket) — the hazard.

    Compared against the exponential (memoryless) expectation implied by the
    same mean, which is the null this whole question hangs on.
    """
    lens = np.asarray(lens, dtype=float)
    mean = lens.mean()
    rows = []
    for lo, hi in zip(bins[:-1], bins[1:]):
        at_risk = int((lens >= lo).sum())
        if at_risk < 50:
            continue
        ended = int(((lens >= lo) & (lens < hi)).sum())
        h = ended / at_risk
        # memoryless benchmark for a bucket of this width
        p_exp = 1 - np.exp(-(hi - lo) / mean)
        surv = lens[lens >= lo]
        rows.append({
            'elapsed': f'{int(lo)}-{int(hi)-1}',
            'at_risk': at_risk,
            'flip_pct': round(100 * h, 1),
            'if_memoryless': round(100 * p_exp, 1),
            'ratio': round(h / p_exp, 2) if p_exp > 0 else np.nan,
            'med_remaining': round(float(np.median(surv - lo)), 1),
        })
    return pd.DataFrame(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--instrument', default='eurusd')
    ap.add_argument('--tf', type=int, default=5, help='minutes per bar')
    ap.add_argument('--start', default=None)
    a = ap.parse_args()

    m1 = load_m1(a.instrument, a.start)
    bars = resample(m1, a.tf)
    wt = wave_trend(bars['high'].to_numpy(float), bars['low'].to_numpy(float),
                    bars['close'].to_numpy(float), **OPERATOR_WT)
    yellow = wt.wt1 - wt.wt2
    st, ln, sg = episodes(yellow)
    if ln.size == 0:
        print('no episodes'); return

    tf = a.tf
    print(f'\n{"="*88}')
    print(f'HOW LONG DOES THE YELLOW LINE STAY ON ONE SIDE OF ZERO?')
    print(f'{a.instrument} · {tf}m bars · {len(ln):,} completed episodes · '
          f'{bars.index[0].date()} -> {bars.index[-1].date()}')
    print(f'{"="*88}')

    for label, mask in (('ABOVE zero', sg > 0), ('BELOW zero', sg < 0), ('all', sg != 0)):
        L = ln[mask]
        if L.size == 0:
            continue
        q = np.percentile(L, [10, 25, 50, 75, 90, 99])
        print(f'\n  {label}:  n={L.size:,}')
        print(f'    bars   p10 {q[0]:.0f}  p25 {q[1]:.0f}  MEDIAN {q[2]:.0f}  '
              f'p75 {q[3]:.0f}  p90 {q[4]:.0f}  p99 {q[5]:.0f}   mean {L.mean():.1f}')
        print(f'    mins   p10 {q[0]*tf:.0f}  p25 {q[1]*tf:.0f}  '
              f'MEDIAN {q[2]*tf:.0f}  p75 {q[3]*tf:.0f}  p90 {q[4]*tf:.0f}  '
              f'p99 {q[5]*tf:.0f}   mean {L.mean()*tf:.0f}')

    print(f'\n-- THE HAZARD: does elapsed time tell you anything? --')
    bins = [1, 3, 5, 8, 12, 18, 26, 40, 60, 10**6]
    for label, mask in (('ABOVE zero', sg > 0), ('BELOW zero', sg < 0)):
        L = ln[mask]
        t = hazard_table(L, bins)
        if t.empty:
            continue
        t['med_remaining_min'] = (t['med_remaining'] * tf).round(0)
        print(f'\n  {label} (mean episode {L.mean():.1f} bars = {L.mean()*tf:.0f} min)')
        print(t.to_string(index=False))

    print(f'\n{"-"*88}')
    print('ratio  = observed flip rate ÷ the memoryless expectation.')
    print('         ~1.0 -> elapsed time tells you NOTHING ("it\'s due" is false)')
    print('         >1   -> flips get MORE likely the longer it runs (the intuition)')
    print('         <1   -> long runs beget longer runs (the opposite)')
    print('med_remaining = median ADDITIONAL bars, given it already reached this age.')
    print('         If that column is flat, the process is memoryless and there is')
    print('         no timing signal in elapsed duration at all.')
    print('-' * 88)


if __name__ == '__main__':
    main()
