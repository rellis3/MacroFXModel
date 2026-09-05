"""level_read.py - apply the study's findings to a live level, on a chart.

This is deliberately shaped around what the research actually supports, which
is mostly NEGATIVE. Most of the value at a level is knowing which VuManChu
reads to ignore, because each one carries false confidence that the data does
not back:

  * the study's level test was a well-powered null (116,693 touches, base
    P(breakout) 0.5007, nothing above z=2.43). No VuManChu state on any
    timeframe shifts break-vs-hold. So this tool never outputs a break/hold
    probability from the oscillator - there isn't one.
  * MTF agreement is not monotone, so "3 of 4 timeframes agree" is not
    evidence and is not counted here.
  * Money Flow and divergence are not read at all; both were null.

What IS supported, and therefore what this prints:

  1. REGIME GATE. The one robust VuManChu effect (M15 overbought/oversold,
     -1.5pp, 12/12 instruments) exists ONLY in range conditions. Outside a
     range it does not apply, so the regime is resolved first and the read is
     withheld when it does not qualify.
  2. PRICE PHASE. Worth more than the indicator: "pullback within an uptrend"
     is +1.59pp on its own, 12/12, with no oscillator involved.
  3. M5 CROSS GEOMETRY. Spread and slope are the only components carrying
     information beyond recent returns, and the only ones that beat a plain
     return model on unseen markets.

  python vmcResearch/level_read.py --instrument eurusd --level 1.16561
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vmcResearch import events  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')

# Measured in this study; quoted so the output can never drift from the paper.
BASE_BREAKOUT = 0.5007
OBOS_RANGE_TILT = -0.0154      # M15 deeply oversold, range: delta P(continuation)
PULLBACK_TILT = +0.0159        # price-only pullback-in-trend
CROSS_TRIGGER_COST = -0.0064   # +1.79pp state -> +1.15pp after waiting for cross
PHASE = {0: 'RANGE', 1: 'IMPULSE', 2: 'PULLBACK', 3: 'BROKEN', 4: 'DRIFT'}


def read(instrument, level, at=None):
    p = pd.read_parquet(os.path.join(DATA, 'panel_%s.parquet' % instrument))
    p = events.add_events(p, horizons=(48,))
    row = p.iloc[-1] if at is None else p.loc[:at].iloc[-1]
    i = p.index.get_loc(row.name)

    c = float(row['close'])
    sig = float(row['sigma_price'])
    pip = 0.01 if instrument.endswith('jpy') else (0.01 if instrument in ('xauusd',) else 1e-4)
    dist_pips = (level - c) / pip
    side = 'SUPPORT (approached from above)' if level < c else 'RESISTANCE (approached from below)'
    trend_dir = int(row['trend_dir'])
    phase = PHASE[int(row['phase'])]
    phase_slow = PHASE[int(row['phase_slow'])]

    out = []
    A = out.append
    A('=' * 72)
    A('LEVEL READ  %s @ %.5f' % (instrument.upper(), level))
    A('bar: %s   close %.5f   1-bar sigma %.2f pips' % (row.name, c, sig / pip))
    A('=' * 72)
    A('')
    A('THE LEVEL')
    A('  %s' % side)
    A('  distance          %+.1f pips  (%.2f sigma)' % (dist_pips, (level - c) / sig))
    A('  base rate         P(break) = %.4f  <- a coin flip, measured on 116,693 touches' % BASE_BREAKOUT)
    A('  NOTE: no VuManChu state moved this. Do not expect the oscillator to')
    A('        tell you whether the level holds. It cannot.')
    A('')

    # ---- 1. regime gate ---------------------------------------------------
    A('1. REGIME GATE  (decides whether the one robust finding applies)')
    A('  4h price phase    %s' % phase)
    A('  24h price phase   %s' % phase_slow)
    A('  prevailing leg    %s  (%.2f sigma)' % ('UP' if trend_dir > 0 else 'DOWN' if trend_dir < 0 else 'flat',
                                                float(row['trend_sig'])))
    A('  retracement       %.0f%% of the leg given back' % (100 * float(row['retrace'])))
    in_range = phase == 'RANGE'
    A('  -> M15 OB/OS read %s' % ('APPLIES (range conditions)' if in_range
                                  else 'WITHHELD - only validated in a range, this is %s' % phase))
    A('')

    # ---- 2. the one supported oscillator read -----------------------------
    wt15 = float(row['tf15_wt1'])
    zone = ('deeply oversold' if wt15 <= -60 else 'oversold' if wt15 <= -53 else
            'deeply overbought' if wt15 >= 60 else 'overbought' if wt15 >= 53 else 'mid-range')
    A('2. M15 WAVETREND  (the only VuManChu state that replicated 12/12)')
    A('  tf15 WT1          %+.1f  -> %s' % (wt15, zone))
    if in_range and abs(wt15) >= 53:
        favours = 'the DOWN leg stalling' if trend_dir < 0 else 'the UP leg stalling'
        A('  -> tilt           %+.2fpp on P(prevailing move continues)' % (100 * OBOS_RANGE_TILT))
        A('     i.e. favours   %s' % favours)
        if level < c and trend_dir < 0 and wt15 <= -53:
            A('     for THIS level: price falling into support while M15 oversold in a')
            A('     range -> support marginally MORE likely to hold. ~51.5%% vs 50%%.')
    elif abs(wt15) < 53:
        A('  -> no read        WT is mid-range; the finding is about the extremes only')
    else:
        A('  -> no read        at an extreme, but not in a range. Withheld.')
    A('')

    # ---- 3. cross geometry -------------------------------------------------
    A('3. M5 CROSS GEOMETRY  (only component with info beyond recent returns)')
    A('  tf5 WT spread     %+.2f   slope %+.2f' % (float(row['tf5_wt_spread']), float(row['tf5_wt1_slope'])))
    A('  tf5 VWAP dist     %+.2f sigma' % float(row['tf5_vwap_dist']))
    A('  -> direction only, IC -0.014, mean-reverting. Sizing input at most.')
    A('')

    # ---- 4. what to ignore -------------------------------------------------
    A('4. DO NOT USE AT THIS LEVEL  (each was tested and failed)')
    A('  x  timeframe agreement count   non-monotone; 4-of-4 is a coin flip')
    A('  x  Money Flow / its slope      zero info beyond recent returns')
    A('  x  divergence, reg or hidden   1 surviving cell from 104')
    A('  x  H1 / H4 WaveTrend           both die under a return control')
    A('  x  waiting for the WT cross    costs %.2fpp vs acting on state' % (100 * CROSS_TRIGGER_COST))
    A('')
    A('5. WHAT ACTUALLY CARRIES THE EDGE HERE')
    if phase == 'PULLBACK':
        A('  Price is in a PULLBACK: worth %+.2fpp on continuation, 12/12 instruments,' % (100 * PULLBACK_TILT))
        A('  with no oscillator involved. This is the largest effect in the study.')
        A('  Act on the structure. Do not wait for a green dot to confirm it.')
    else:
        A('  Phase is %s, not PULLBACK - the +1.59pp structural edge does not apply.' % phase)
        A('  Nothing in this study gives an entry here. Trade it on your own thesis;')
        A('  VuManChu adds no information to the decision.')
    A('')
    A('SIZE CHECK: every surviving edge is 3-5x smaller than the spread.')
    A('  2-sigma barrier %.1f pips vs ~0.6 pip spread -> a 1.5pp tilt is worth' % (2 * sig / pip))
    A('  %.2f pips of expectancy. Use as a veto or a sizing nudge, never as a trigger.'
      % ((2 * 0.015) * 2 * sig / pip))
    return '\n'.join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--instrument', default='eurusd')
    ap.add_argument('--level', type=float, required=True)
    ap.add_argument('--at', default=None, help='timestamp to read at (default: last bar)')
    a = ap.parse_args()
    print(read(a.instrument, a.level, a.at))


if __name__ == '__main__':
    main()
