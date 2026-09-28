"""motif_touch — N-touches-of-a-level structural motif detector.

Regenerated (not ported — PYTHON_LEGO.md's "generate-don't-port" rule) from
`js/patternEngine.js`'s `detectExtremesOneSide` (the double/triple top/bottom
detector), using its algorithm as the validated spec, not its code: find a
run of 2-3 pivot highs/lows clustered within an ATR-scaled tolerance of each
other (the "touches"), each separated by a genuine intervening retracement
(a real pullback between touches, not a shallow noise wiggle riding on one
deep swing elsewhere), then look for a confirmed close-through of the level
within a bar horizon — either the textbook reversal (breaks the
support/resistance formed BETWEEN the touches) or the failure case (price
instead pushes to a new extreme beyond the touch zone).

Built for Phase 3 of the AnalogML structural-motif work (see
`MD files/LEGO_MODULES.md`'s AnalogML entry, "null banked 2026-08-12" note):
the fixed-window k-NN shape-matching method tested null across the full
26-pair universe, so this is a structurally different idea — recognizing a
SPECIFIC, NAMED event (N touches of a level) and only signaling on the entry
that event actually implies (the Nth-touch breakout), instead of comparing
every 64-bar window to every other window regardless of what either looks
like.

Deliberately does NOT compute its own measured-move target/stop the way
`js/patternEngine.js`'s `computeOutcome` does — that would be changing two
things at once (a new entry-selection idea AND a new risk-sizing idea in the
same test). For a first honest read, detected entries are meant to be raced
through `pylego.barrier_race` with the SAME frozen SL-pips/TP-R grid every
other AnalogML check uses, isolating the ONE new variable (motif-based entry
timing) — per-cluster adaptive SL/TP is Phase 1, deliberately deferred until
this detector shows it has something to size risk around.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from pylego.swing_structure import Pivot, pivot_highs, pivot_lows


@dataclass
class TouchMotif:
    """One completed N-touch instance.

    n_touches: 2 or 3.
    is_top: True for a double/triple TOP (touches on highs), False for a
      double/triple BOTTOM (touches on lows).
    touch_idxs: bar indices of each touch, oldest first.
    level: the support/resistance price formed by the deepest intervening
      retracement between touches (what a breakout has to close through for
      the "textbook" read).
    touch_level: the touches' own price (the ceiling/floor being tested).
    confirm_idx: bar index the close confirmed a direction, or None if
      neither the level nor the touch_level was closed through within the
      bar horizon (still returned, not dropped — a caller needs the
      resolve-rate too, not just the trades that fired).
    direction: +1 (closed up through touch_level — pattern FAILED, textbook
      top wanted down) / -1 (closed down through level — textbook reversal)
      for a top; mirrored for a bottom. 0 if unconfirmed.
    played_out: direction matches the textbook expectation (reversal off the
      level). None if unconfirmed.
    """
    n_touches: int
    is_top: bool
    touch_idxs: list[int]
    level: float
    touch_level: float
    confirm_idx: int | None
    direction: int
    played_out: bool | None


def _finer_pivots(bars: pd.DataFrame, seg_lo: int, seg_hi: int, pivot_n: int, want_highs: bool) -> list[Pivot]:
    """Re-detects pivots on the SLICE between two touches, at a finer pivotN
    (half the main one, floor, min 1) — same as the JS original's
    `oppFinder(segBars, Math.max(1, Math.floor(pivotN / 2)))`. A genuine
    intervening retracement pivot in a short segment may not qualify as a
    pivot at the coarser main pivotN, so re-scanning locally (not just
    filtering the already-computed global pivot list) matters."""
    seg = bars.iloc[seg_lo : seg_hi + 1]
    finer_n = max(1, pivot_n // 2)
    local = pivot_highs(seg, finer_n) if want_highs else pivot_lows(seg, finer_n)
    return [Pivot(idx=seg_lo + p.idx, price=p.price, time=p.time, kind=p.kind) for p in local]


def _run_level(run: list[Pivot], bars: pd.DataFrame, local_atr: float, pivot_n: int,
               min_retrace_atr_mult: float, is_top: bool) -> float | None:
    """Validate every consecutive pair of touches has a genuine intervening
    opposite-side retracement; return the deepest/highest one (the
    support/resistance), or None if any segment fails."""
    level_pt = None
    for k in range(len(run) - 1):
        seg_opp = _finer_pivots(bars, run[k].idx, run[k + 1].idx, pivot_n, want_highs=not is_top)
        if not seg_opp:
            return None
        seg_pt = min(seg_opp, key=lambda p: p.price) if is_top else max(seg_opp, key=lambda p: p.price)
        if abs(run[k].price - seg_pt.price) < min_retrace_atr_mult * local_atr:
            return None
        if level_pt is None or (seg_pt.price < level_pt if is_top else seg_pt.price > level_pt):
            level_pt = seg_pt.price
    return level_pt


def _confirm(run: list[Pivot], level: float, close: np.ndarray, pivot_n: int,
             breakout_max_bars: int, is_top: bool) -> tuple[int | None, int]:
    """First close through `level` (textbook) or the touch price (failure)
    inside the breakout horizon -> (confirm_idx, direction), else (None, 0)."""
    touch_level = max(p.price for p in run) if is_top else min(p.price for p in run)
    last_touch = run[-1]
    hi_end = min(last_touch.idx + breakout_max_bars, len(close) - 1)
    # The last touch isn't actually KNOWABLE as a genuine pivot until
    # pivot_n bars have passed after it (pivot_highs/pivot_lows need a
    # centered window) -- scanning for a breakout starting any earlier
    # credits a signal a live system couldn't have had yet. Confirmed
    # empirically: ~15% of "confirmed" motifs were resolving before
    # this lag had even elapsed, before this fix.
    lo_start = max(last_touch.idx + 1, last_touch.idx + pivot_n)
    for k in range(lo_start, hi_end + 1):
        if is_top and close[k] < level:
            return k, -1
        if not is_top and close[k] > level:
            return k, 1
        if is_top and close[k] > touch_level:
            return k, 1
        if not is_top and close[k] < touch_level:
            return k, -1
    return None, 0


def _touch_runs(pivots: list[Pivot], bars: pd.DataFrame, atr_arr: np.ndarray, pivot_n: int,
                tol_atr_mult: float, min_retrace_atr_mult: float,
                min_bars_between_touches: int, is_top: bool,
                breakout_max_bars: int = 40) -> list[tuple[list[Pivot], float]]:
    """Greedy left-to-right run builder: extend a run of up to 3 same-level
    pivots (each >= min_bars_between_touches from the last, within
    tol_atr_mult of the run's FIRST touch price), then validate every
    consecutive pair has a genuine intervening opposite-side retracement.
    Returns (run, level) pairs — level is the deepest/highest intervening
    retracement across all validated segments (the support/resistance).

    CAUSALITY (2026-09-28): a 2-touch run that has ALREADY CONFIRMED before a
    later same-level pivot becomes knowable (that pivot's idx + pivot_n) is
    emitted as its own run, and the extended 3-touch run is emitted beside
    it. Before this, the greedy extension absorbed that later pivot and
    silently replaced the confirmed 2-touch motif with a 3-touch one --
    something a live scanner standing at the 2-touch's confirm bar cannot
    know. The runs this rewrote were exactly the ones where price came BACK
    to the touch level after the breakout (mostly stop-outs), so full-history
    detection dropped those 2-touch losers from every backtest while the live
    tracker (which only ever sees bars up to "now") logged and traded them.
    Emitting both is what the live tracker's own log accumulates: the
    2-touch key when it confirms, the 3-touch key later if it confirms too."""
    runs = []
    close = bars["close"].to_numpy()
    i, n = 0, len(pivots)
    while i < n - 1:
        local_atr = atr_arr[pivots[i].idx] if pivots[i].idx < len(atr_arr) else atr_arr[-1]
        if not local_atr or local_atr <= 0:
            i += 1
            continue
        run = [pivots[i]]
        early = None   # a 2-touch run that confirmed before the pivot that extended it was knowable
        j = i + 1
        while j < n and len(run) < 3:
            last = run[-1]
            if pivots[j].idx - last.idx < min_bars_between_touches:
                j += 1
                continue
            if abs(pivots[j].price - run[0].price) <= tol_atr_mult * local_atr:
                if len(run) == 2:
                    lvl = _run_level(run, bars, local_atr, pivot_n, min_retrace_atr_mult, is_top)
                    if lvl is not None:
                        c_idx, _ = _confirm(run, lvl, close, pivot_n, breakout_max_bars, is_top)
                        if c_idx is not None and c_idx < pivots[j].idx + pivot_n:
                            early = (list(run), lvl)
                run.append(pivots[j])
                j += 1
            else:
                break
        if early is not None:
            runs.append(early)
        if len(run) < 2:
            i += 1
            continue

        level_pt = _run_level(run, bars, local_atr, pivot_n, min_retrace_atr_mult, is_top)
        if level_pt is not None:
            runs.append((run, level_pt))
            i += len(run)
        else:
            i += 1
    return runs


def detect_touch_motifs(bars: pd.DataFrame, atr_arr: np.ndarray, *, pivot_n: int = 5,
                        tol_atr_mult: float = 1.2, min_retrace_atr_mult: float = 2.5,
                        min_bars_between_touches: int = 10, breakout_max_bars: int = 40) -> list[TouchMotif]:
    """Detects double/triple tops AND bottoms across `bars`, causally (each
    instance's confirm_idx only ever looks forward from its own touches, and
    a confirmed run is never rewritten by a touch that arrived after it
    confirmed -- see `_touch_runs`). The caller is responsible for not
    passing bars beyond whatever "now" a walk-forward evaluation is standing
    at, same convention as pylego.shape_match."""
    out = []
    close = bars["close"].to_numpy()
    for is_top in (True, False):
        pivots = pivot_highs(bars, pivot_n) if is_top else pivot_lows(bars, pivot_n)
        for run, level in _touch_runs(pivots, bars, atr_arr, pivot_n, tol_atr_mult,
                                       min_retrace_atr_mult, min_bars_between_touches, is_top,
                                       breakout_max_bars):
            touch_level = max(p.price for p in run) if is_top else min(p.price for p in run)
            confirm_idx, direction = _confirm(run, level, close, pivot_n, breakout_max_bars, is_top)
            expected = -1 if is_top else 1
            played_out = (direction == expected) if confirm_idx is not None else None
            out.append(TouchMotif(
                n_touches=len(run), is_top=is_top, touch_idxs=[p.idx for p in run],
                level=level, touch_level=touch_level, confirm_idx=confirm_idx,
                direction=direction, played_out=played_out,
            ))
    out.sort(key=lambda m: m.touch_idxs[0])
    return out
