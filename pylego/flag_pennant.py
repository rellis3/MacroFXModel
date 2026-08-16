"""flag_pennant — flag/pennant (continuation) chart-pattern detector.

Regenerated (not ported — PYTHON_LEGO.md's "generate-don't-port" rule) from
`js/patternEngine.js`'s `detectFlagsPennants` (+ its `findPole`/
`findConsolidation`/`findBreakout` helpers), using that algorithm as the
validated spec, not its code: a fresh Python implementation, its own tests,
reusing the already-regenerated `pylego.swing_structure.pivot_highs`/
`pivot_lows` bricks instead of a third copy of pivot detection.

Geometry, in order:
  1. `_find_pole` — scan forward from a candidate start bar for the
     highest-ATR-multiple, straight-line-efficient net move (an "impulse")
     within `pole_min_bars..pole_max_bars`. Picks the BEST-scoring length in
     that range, not the first one that clears the threshold — matching the
     JS original exactly.
  2. `_find_consolidation` — starting right after the pole, grow a window bar
     by bar and, at each length, fit upper/lower trendlines through the
     window's own pivot highs/lows (`consol_pivot_n`). Requires: the window
     hasn't given back more than `max_retrace_pct` of the pole; the channel
     drifts flat-to-against the pole's direction (a channel still running
     WITH the pole isn't a distinguishable consolidation); slopes diverging
     in sign classifies it a pennant (converging wedge), near-equal slopes a
     flag (parallel channel); and at least `min_touches_total` total pivots
     lie on the two fitted lines (the 4 anchor points alone aren't evidence
     of a real channel). Returns the FIRST window length that satisfies all
     of this — the earliest a live system could have called the shape formed.
  3. `_find_breakout` — from just after the consolidation, scan forward for
     the first close beyond either boundary. Checks BOTH boundaries (not just
     the pole's direction) so a failed flag (breaks the wrong way) is a
     possible, counted outcome — searching only the expected direction would
     silently drop every failure from the data, inflating the apparent
     reliability.

Causality: every step only ever reads bars up to the index it's currently
evaluating (`_find_pole` up to its own candidate end; `_find_consolidation`'s
pivot windows are re-sliced and re-detected per candidate length, so a pivot
counts only once `consol_pivot_n` bars have passed after it — same
confirmability-lag discipline `pylego.motif_touch` had to add explicitly
after a real bug; here it falls out of the window-slice-then-pivot-detect
construction for free, the same way `motif_touch._finer_pivots` gets it for
free by re-slicing rather than filtering a global pivot list). `confirm_idx`
(the only bar this module treats as an entry point) is always strictly after
every bar used to build the pole and the consolidation.

Deliberately does NOT compute its own measured-move target/stop the way
`js/patternEngine.js`'s `computeOutcome` does — same reasoning as
`pylego.motif_touch`: that would change the entry-selection idea AND a
risk-sizing idea in the same test. Detected entries are meant to be raced
through `pylego.barrier_race` with the SAME frozen SL-pips/TP-R grid every
other AnalogML check uses first; per-cluster adaptive SL/TP (the deferred
"Phase 1" idea) only makes sense once a detector has shown something worth
sizing risk around.

This is the first additional shape family beyond N-touches-of-a-level in the
owner's full "shape prediction" ask (see `MD files/LEGO_MODULES.md`'s
AnalogML entry) — flags/pennants specifically, per that ask's suggested
build order (minimal-DOF-first: validate ONE new family standalone before
multi-timeframe or adaptive sizing).
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from pylego.swing_structure import Pivot, pivot_highs, pivot_lows
from pylego.trendline import line_at, line_touches, sign


@dataclass
class Pole:
    start_idx: int
    end_idx: int
    direction: int  # +1 up, -1 down
    height: float   # abs(net move), price units
    score: float    # abs(net move) / local ATR
    efficiency: float  # |net move| / total path length (1.0 = dead straight)


@dataclass
class Consolidation:
    abs_end_idx: int
    shape_type: str  # 'flag' | 'pennant'
    upper_touches: int
    lower_touches: int
    retrace: float
    upper_p1_idx: int
    upper_p1_price: float
    upper_p2_idx: int
    upper_p2_price: float
    lower_p1_idx: int
    lower_p1_price: float
    lower_p2_idx: int
    lower_p2_price: float


@dataclass
class Breakout:
    idx: int
    level: float
    direction: int  # +1 up, -1 down


@dataclass
class FlagPennant:
    """One completed flag/pennant instance.

    label: 'bull_flag' | 'bear_flag' | 'bull_pennant' | 'bear_pennant' — fixed
      by the pole's direction and the consolidation's shape, same convention
      as the JS original (a "bull flag" stays a bull flag whether it goes on
      to continue up as expected or fails and breaks down).
    direction: the breakout's ACTUAL direction (+1/-1).
    expected_direction: what the pole implies (+1/-1).
    played_out: direction == expected_direction.
    measured_move: the pole's height in price units (NOT a target — see
      module docstring on why this doesn't size its own risk).
    """
    label: str
    pole_start_idx: int
    pole_end_idx: int
    consol_end_idx: int
    confirm_idx: int
    direction: int
    expected_direction: int
    played_out: bool
    measured_move: float
    breakout_level: float
    upper_touches: int
    lower_touches: int
    retrace: float
    upper_p1_idx: int
    upper_p1_price: float
    upper_p2_idx: int
    upper_p2_price: float
    lower_p1_idx: int
    lower_p1_price: float
    lower_p2_idx: int
    lower_p2_price: float


def _find_pole(close: np.ndarray, open_: np.ndarray, abs_diff_cumsum: np.ndarray, atr_arr: np.ndarray,
               start: int, pole_min_bars: int, pole_max_bars: int,
               pole_min_atr_mult: float, pole_min_efficiency: float) -> Pole | None:
    n = len(close)
    best: Pole | None = None
    for w in range(pole_min_bars, pole_max_bars + 1):
        end = start + w
        if end >= n:
            break
        net_move = close[end] - open_[start]
        path_len = abs_diff_cumsum[end] - abs_diff_cumsum[start]
        if path_len == 0:
            continue
        efficiency = abs(net_move) / path_len
        local_atr = atr_arr[end] if end < len(atr_arr) else atr_arr[-1]
        if local_atr <= 0:
            continue
        if abs(net_move) >= pole_min_atr_mult * local_atr and efficiency >= pole_min_efficiency:
            score = abs(net_move) / local_atr
            if best is None or score > best.score:
                best = Pole(start_idx=start, end_idx=end, direction=1 if net_move > 0 else -1,
                           height=abs(net_move), score=score, efficiency=efficiency)
    return best


def _find_consolidation(bars: pd.DataFrame, atr_arr: np.ndarray, pole: Pole,
                        consol_min_bars: int, consol_max_bars: int, consol_pivot_n: int,
                        max_retrace_pct: float, flag_flat_slope_atr_frac: float,
                        parallel_tol_pct: float, touch_tol_pct: float,
                        min_touches_total: int) -> Consolidation | None:
    win_start = pole.end_idx
    n = len(bars)
    close = bars["close"].to_numpy()
    high = bars["high"].to_numpy()
    low = bars["low"].to_numpy()
    win_end_max = min(win_start + consol_max_bars, n - 1)

    for win_end in range(win_start + consol_min_bars, win_end_max + 1):
        window = bars.iloc[win_start:win_end + 1]
        highs = pivot_highs(window, consol_pivot_n)
        lows = pivot_lows(window, consol_pivot_n)
        if len(highs) < 2 or len(lows) < 2:
            continue

        h1, h2 = highs[0], highs[-1]
        l1, l2 = lows[0], lows[-1]
        if h2.idx == h1.idx or l2.idx == l1.idx:
            continue

        upper_slope = (h2.price - h1.price) / (h2.idx - h1.idx)
        lower_slope = (l2.price - l1.price) / (l2.idx - l1.idx)
        local_atr = atr_arr[win_end] if win_end < len(atr_arr) else atr_arr[-1]
        if not local_atr:
            continue

        window_low = float(low[win_start:win_end + 1].min())
        window_high = float(high[win_start:win_end + 1].max())
        if pole.direction == 1:
            retrace = (close[win_start] - window_low) / pole.height
        else:
            retrace = (window_high - close[win_start]) / pole.height
        if retrace > max_retrace_pct:
            continue

        flat_thresh = flag_flat_slope_atr_frac * local_atr
        avg_slope = (upper_slope + lower_slope) / 2
        opposing_or_flat = avg_slope <= flat_thresh if pole.direction == 1 else avg_slope >= -flat_thresh
        if not opposing_or_flat:
            continue

        slope_diff = abs(upper_slope - lower_slope)
        converging = sign(upper_slope) != sign(lower_slope) and slope_diff > flat_thresh
        is_parallel = (not converging) and slope_diff <= parallel_tol_pct * local_atr
        if converging:
            shape_type = "pennant"
        elif is_parallel:
            shape_type = "flag"
        else:
            continue

        upper_touches = line_touches(highs, h1.idx, h1.price, h2.idx, h2.price, touch_tol_pct)
        lower_touches = line_touches(lows, l1.idx, l1.price, l2.idx, l2.price, touch_tol_pct)
        if upper_touches + lower_touches < min_touches_total:
            continue

        return Consolidation(
            abs_end_idx=win_end, shape_type=shape_type,
            upper_touches=upper_touches, lower_touches=lower_touches, retrace=retrace,
            upper_p1_idx=win_start + h1.idx, upper_p1_price=h1.price,
            upper_p2_idx=win_start + h2.idx, upper_p2_price=h2.price,
            lower_p1_idx=win_start + l1.idx, lower_p1_price=l1.price,
            lower_p2_idx=win_start + l2.idx, lower_p2_price=l2.price,
        )
    return None


def _find_breakout(bars: pd.DataFrame, consol: Consolidation, breakout_max_bars: int) -> Breakout | None:
    close = bars["close"].to_numpy()
    n = len(bars)
    hi_end = min(consol.abs_end_idx + breakout_max_bars, n - 1)
    for i in range(consol.abs_end_idx + 1, hi_end + 1):
        up_level = line_at(consol.upper_p1_idx, consol.upper_p1_price, consol.upper_p2_idx, consol.upper_p2_price, i)
        dn_level = line_at(consol.lower_p1_idx, consol.lower_p1_price, consol.lower_p2_idx, consol.lower_p2_price, i)
        if close[i] > up_level:
            return Breakout(idx=i, level=up_level, direction=1)
        if close[i] < dn_level:
            return Breakout(idx=i, level=dn_level, direction=-1)
    return None


def detect_flags_pennants(bars: pd.DataFrame, atr_arr: np.ndarray, *,
                          pole_min_bars: int = 4, pole_max_bars: int = 20,
                          pole_min_atr_mult: float = 3.0, pole_min_efficiency: float = 0.55,
                          consol_min_bars: int = 5, consol_max_bars: int = 50, consol_pivot_n: int = 2,
                          max_retrace_pct: float = 0.65, breakout_max_bars: int = 30,
                          parallel_tol_pct: float = 0.35, flag_flat_slope_atr_frac: float = 0.05,
                          touch_tol_pct: float = 0.003, min_touches_total: int = 5) -> list[FlagPennant]:
    """Detects bull/bear flags AND pennants across `bars`, causally (each
    instance's confirm_idx only ever depends on bars at-or-before itself —
    see module docstring). Greedy left-to-right: after emitting (or failing
    to complete) a candidate, resumes scanning right after it — same
    convention as the JS original, not a sliding window over every start."""
    close = bars["close"].to_numpy()
    open_ = bars["open"].to_numpy()
    abs_diff_cumsum = np.concatenate(([0.0], np.cumsum(np.abs(np.diff(close)))))

    instances: list[FlagPennant] = []
    n = len(bars)
    i = pole_min_bars
    max_i = n - pole_max_bars - consol_min_bars - 1
    while i < max_i:
        pole = _find_pole(close, open_, abs_diff_cumsum, atr_arr, i,
                          pole_min_bars, pole_max_bars, pole_min_atr_mult, pole_min_efficiency)
        if pole is None:
            i += 1
            continue
        consol = _find_consolidation(bars, atr_arr, pole, consol_min_bars, consol_max_bars, consol_pivot_n,
                                     max_retrace_pct, flag_flat_slope_atr_frac, parallel_tol_pct,
                                     touch_tol_pct, min_touches_total)
        if consol is None:
            i = pole.end_idx + 1
            continue
        breakout = _find_breakout(bars, consol, breakout_max_bars)
        if breakout is None:
            i = consol.abs_end_idx + 1
            continue

        label_dir = "bull" if pole.direction == 1 else "bear"
        label = f"{label_dir}_{consol.shape_type}"
        instances.append(FlagPennant(
            label=label,
            pole_start_idx=pole.start_idx, pole_end_idx=pole.end_idx,
            consol_end_idx=consol.abs_end_idx,
            confirm_idx=breakout.idx,
            direction=breakout.direction,
            expected_direction=pole.direction,
            played_out=(breakout.direction == pole.direction),
            measured_move=pole.height,
            breakout_level=breakout.level,
            upper_touches=consol.upper_touches, lower_touches=consol.lower_touches,
            retrace=consol.retrace,
            upper_p1_idx=consol.upper_p1_idx, upper_p1_price=consol.upper_p1_price,
            upper_p2_idx=consol.upper_p2_idx, upper_p2_price=consol.upper_p2_price,
            lower_p1_idx=consol.lower_p1_idx, lower_p1_price=consol.lower_p1_price,
            lower_p2_idx=consol.lower_p2_idx, lower_p2_price=consol.lower_p2_price,
        ))
        i = breakout.idx + 1
    return instances
