"""head_shoulders — head & shoulders (regular + inverse) chart-pattern detector.

Regenerated (not ported — PYTHON_LEGO.md's "generate-don't-port" rule) from
`js/patternEngine.js`'s `detectHeadShouldersOneSide`/`detectHeadShoulders`,
using that algorithm as the validated spec, not its code: a fresh Python
implementation, its own tests, reusing the already-regenerated
`pylego.swing_structure.pivot_highs`/`pivot_lows` and `pylego.trendline`
bricks instead of a fourth copy of pivot/trendline math.

Geometry, in order, over consecutive TRIPLES of same-side pivots
(highs for a regular top, lows for an inverse/bottom):
  1. Left shoulder (L), head (H), right shoulder (R) — three consecutive
     pivots. The head must be the tallest of the three by at least
     `head_min_atr_mult` ATRs, and the two shoulders must sit within
     `shoulder_tol_atr_mult` ATRs of each other (roughly even height).
  2. The neckline anchors are the deepest intervening pivot BETWEEN L-H and
     BETWEEN H-R (troughs for a regular top, crests for an inverse) —
     re-detected on each segment at a finer pivot_n, same
     re-slice-then-detect convention as `flag_pennant`/`motif_touch` (which
     gets confirmability-lag correctness for free, not by a separate fix).
  3. Each shoulder must show a genuine pullback of its own toward its
     neckline point (`shoulder_prominence_atr_mult`) — without this, a
     shoulder sitting inside a chop cluster could match the other
     shoulder's height and pass every check above while looking like noise
     on the actual chart.
  4. Confirmation scans forward from the right shoulder for EITHER a
     neckline break (the textbook reversal) OR a new extreme beyond the
     right shoulder itself (the standard invalidation — the failure
     boundary is the right shoulder, not the neckline, since the neckline
     sits far below/above where price actually is at R; checking against it
     directly would trigger "failure" almost immediately regardless of what
     price does).

Causality: exactly the same construction as `flag_pennant`/`motif_touch` —
segment-local pivot re-detection means a neckline point is only used once
it's actually confirmable within its own segment, and `confirm_idx` only
ever depends on bars up to and including itself.

Deliberately does NOT compute its own measured-move target/stop (same
Phase-1-deferred reasoning as every other AnalogML detector) — entries are
meant to be raced through `pylego.barrier_race` with the SAME frozen
SL-pips/TP-R grid every other check uses.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from pylego.swing_structure import Pivot, pivot_highs, pivot_lows
from pylego.trendline import line_at


@dataclass
class HeadShoulders:
    """One completed head & shoulders instance.

    is_inverse: False = regular (bearish) head & shoulders, built on pivot
      HIGHS. True = inverse (bullish), built on pivot LOWS.
    direction: the breakout's ACTUAL direction (+1/-1).
    expected_direction: what the pattern implies (-1 for regular, +1 for
      inverse).
    played_out: direction == expected_direction (neckline break) vs False
      (price instead made a new extreme beyond the right shoulder).
    measured_move: |head price - neckline price at the head's own index|,
      price units (NOT a target -- see module docstring).
    """
    is_inverse: bool
    left_idx: int
    head_idx: int
    right_idx: int
    confirm_idx: int
    direction: int
    expected_direction: int
    played_out: bool
    measured_move: float
    breakout_level: float
    neckline_p1_idx: int
    neckline_p1_price: float
    neckline_p2_idx: int
    neckline_p2_price: float


def _finer_pivots(bars: pd.DataFrame, seg_lo: int, seg_hi: int, pivot_n: int, want_highs: bool) -> list[Pivot]:
    """Re-detects pivots on the SLICE between two shoulder/head pivots, at a
    finer pivot_n (half the main one, floor, min 1) -- same convention as
    `motif_touch._finer_pivots` (identical formula, kept as its own copy
    here since it's a 2-line closure over locally-scoped absolute-index
    translation, not a shared contract worth a brick -- see CLAUDE.md's
    "what is NOT a brick" guidance)."""
    seg = bars.iloc[seg_lo:seg_hi + 1]
    finer_n = max(1, pivot_n // 2)
    local = pivot_highs(seg, finer_n) if want_highs else pivot_lows(seg, finer_n)
    return [Pivot(idx=seg_lo + p.idx, price=p.price, time=p.time, kind=p.kind) for p in local]


def _detect_one_side(bars: pd.DataFrame, atr_arr: np.ndarray, *, is_inverse: bool,
                     pivot_n: int, head_min_atr_mult: float, shoulder_tol_atr_mult: float,
                     shoulder_prominence_atr_mult: float, breakout_max_bars: int) -> list[HeadShoulders]:
    extremes = pivot_lows(bars, pivot_n) if is_inverse else pivot_highs(bars, pivot_n)
    close = bars["close"].to_numpy()
    n = len(bars)
    out: list[HeadShoulders] = []
    ci = 0
    while ci + 2 < len(extremes):
        L, H, R = extremes[ci], extremes[ci + 1], extremes[ci + 2]
        local_atr = atr_arr[H.idx] if H.idx < len(atr_arr) else (atr_arr[-1] if len(atr_arr) else 0.0)
        if not local_atr:
            ci += 1
            continue

        head_taller = (H.price < L.price and H.price < R.price) if is_inverse else (H.price > L.price and H.price > R.price)
        head_margin = min(L.price - H.price, R.price - H.price) if is_inverse else min(H.price - L.price, H.price - R.price)
        shoulders_even = abs(L.price - R.price) <= shoulder_tol_atr_mult * local_atr

        if not (head_taller and head_margin >= head_min_atr_mult * local_atr and shoulders_even):
            ci += 1
            continue

        want_highs = is_inverse  # troughFinder = pivotHighs if inverse else pivotLows
        seg1 = _finer_pivots(bars, L.idx, H.idx, pivot_n, want_highs)
        seg2 = _finer_pivots(bars, H.idx, R.idx, pivot_n, want_highs)
        if not seg1 or not seg2:
            ci += 1
            continue

        n1 = max(seg1, key=lambda p: p.price) if is_inverse else min(seg1, key=lambda p: p.price)
        n2 = max(seg2, key=lambda p: p.price) if is_inverse else min(seg2, key=lambda p: p.price)

        left_prominence = (n1.price - L.price) if is_inverse else (L.price - n1.price)
        right_prominence = (n2.price - R.price) if is_inverse else (R.price - n2.price)
        min_prominence = shoulder_prominence_atr_mult * local_atr
        if left_prominence < min_prominence or right_prominence < min_prominence:
            ci += 1
            continue

        expected_direction = 1 if is_inverse else -1
        failure_level = R.price
        confirm_idx, direction = None, None
        # R (like every pivot from pivot_highs/pivot_lows) isn't actually
        # KNOWABLE as a genuine pivot until pivot_n bars have passed after it
        # -- pivot detection needs a centered window. Unlike flag_pennant/
        # triangle_channel (which re-slice-then-detect pivots inside a
        # growing/fixed window and get this lag for free), L/H/R here come
        # from a single global pivot_highs/pivot_lows(bars, pivot_n) call
        # over the WHOLE array -- the exact same construction that caused
        # motif_touch.py's lookahead bug (see its docstring). Scanning for
        # confirmation starting at R.idx+1 would credit signals a live
        # system couldn't have had yet; delaying to R.idx+pivot_n fixes it,
        # same as motif_touch's `last_touch.idx + pivot_n` fix.
        lo_start = max(R.idx + 1, R.idx + pivot_n)
        hi_end = min(R.idx + breakout_max_bars, n - 1)
        for i in range(lo_start, hi_end + 1):
            neck_at = line_at(n1.idx, n1.price, n2.idx, n2.price, i)
            if is_inverse:
                if close[i] > neck_at:
                    confirm_idx, direction = i, 1
                    break
                if close[i] < failure_level:
                    confirm_idx, direction = i, -1
                    break
            else:
                if close[i] < neck_at:
                    confirm_idx, direction = i, -1
                    break
                if close[i] > failure_level:
                    confirm_idx, direction = i, 1
                    break

        if confirm_idx is None:
            ci += 1
            continue

        measured_move = abs(H.price - line_at(n1.idx, n1.price, n2.idx, n2.price, H.idx))
        confirmed_breakout_level = (
            line_at(n1.idx, n1.price, n2.idx, n2.price, confirm_idx)
            if direction == expected_direction else failure_level
        )
        out.append(HeadShoulders(
            is_inverse=is_inverse, left_idx=L.idx, head_idx=H.idx, right_idx=R.idx,
            confirm_idx=confirm_idx, direction=direction, expected_direction=expected_direction,
            played_out=(direction == expected_direction), measured_move=measured_move,
            breakout_level=confirmed_breakout_level,
            neckline_p1_idx=n1.idx, neckline_p1_price=n1.price,
            neckline_p2_idx=n2.idx, neckline_p2_price=n2.price,
        ))
        ci += 3
    return out


def detect_head_shoulders(bars: pd.DataFrame, atr_arr: np.ndarray, *,
                          pivot_n: int = 5, head_min_atr_mult: float = 1.5,
                          shoulder_tol_atr_mult: float = 2.0, shoulder_prominence_atr_mult: float = 0.75,
                          breakout_max_bars: int = 40) -> list[HeadShoulders]:
    """Detects regular (bearish, off pivot highs) AND inverse (bullish, off
    pivot lows) head & shoulders across `bars`, causally."""
    kwargs = dict(pivot_n=pivot_n, head_min_atr_mult=head_min_atr_mult,
                  shoulder_tol_atr_mult=shoulder_tol_atr_mult,
                  shoulder_prominence_atr_mult=shoulder_prominence_atr_mult,
                  breakout_max_bars=breakout_max_bars)
    out = _detect_one_side(bars, atr_arr, is_inverse=False, **kwargs) + \
          _detect_one_side(bars, atr_arr, is_inverse=True, **kwargs)
    out.sort(key=lambda hs: hs.confirm_idx)
    return out
