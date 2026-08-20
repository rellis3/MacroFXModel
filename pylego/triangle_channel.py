"""triangle_channel — triangles, wedges & multi-touch channels detector.

Regenerated (not ported — PYTHON_LEGO.md's "generate-don't-port" rule) from
`js/patternEngine.js`'s `detectTrianglesChannels`, using that algorithm as
the validated spec, not its code: a fresh Python implementation, its own
tests, reusing the already-regenerated `pylego.swing_structure.pivot_highs`/
`pivot_lows` and `pylego.trendline` bricks. ONE detector covers SEVEN shape
types — the geometry only differs in how the two fitted trendline slopes
relate to each other:

  - flat top + rising bottom  -> ascending_triangle (expected: up)
  - flat bottom + falling top -> descending_triangle (expected: down)
  - opposite-sign slopes converging to an apex -> symmetrical_triangle
    (expected: undecided — genuinely no forced 50/50 guess, `None` not 0)
  - SAME-sign slopes that still converge (the steeper line catching up to
    the other) -> rising_wedge (expected: down, the classic exhaustion
    read) / falling_wedge (expected: up)
  - same-sign slopes staying roughly PARALLEL (not converging)
    -> channel_up / channel_down (expected: continuation of that slope)

Unlike `flag_pennant`/`head_shoulders`'s greedy left-to-right advance, this
is a FIXED-SIZE sliding window (`window_bars`, default 120): fit the two
trendlines to whatever pivots exist inside that exact window, and if no
instance confirms, slide the window forward by HALF its size (not one bar)
— so unsuccessful windows overlap 50%, successful ones jump straight past
the confirmed breakout. Matches the JS original's search strategy exactly,
not a redesign.

Causality: the two trendline anchor points are always drawn from pivots
inside `[win_start, win_end]` (never beyond it), and the breakout scan only
starts at `win_end + 1` — same "only ever reads bars up to the index it's
currently evaluating" discipline as every other AnalogML detector.

Deliberately does NOT compute its own measured-move target/stop — entries
are meant to be raced through `pylego.barrier_race` with the SAME frozen
SL-pips/TP-R grid every other AnalogML check uses.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from pylego.swing_structure import pivot_highs, pivot_lows
from pylego.trendline import line_at, line_touches, sign

TRI_EXPECTED_DIRECTION: dict[str, int | None] = {
    "ascending_triangle": 1, "descending_triangle": -1, "symmetrical_triangle": None,
    "rising_wedge": -1, "falling_wedge": 1,
    "channel_up": 1, "channel_down": -1,
}


@dataclass
class TriangleChannel:
    """One completed triangle/wedge/channel instance.

    shape_type: one of TRI_EXPECTED_DIRECTION's keys.
    expected_direction: None for symmetrical_triangle (genuinely undecided
      per conventional TA, not a fabricated 50/50), else +1/-1.
    played_out: expected_direction == direction, or None if expected_direction
      is None (nothing to compare against).
    measured_move: the channel's own height (upper minus lower trendline) at
      the window's start, price units (NOT a target).
    """
    shape_type: str
    start_idx: int
    win_end_idx: int
    confirm_idx: int
    direction: int
    expected_direction: int | None
    played_out: bool | None
    measured_move: float
    breakout_level: float
    upper_touches: int
    lower_touches: int
    upper_p1_idx: int
    upper_p1_price: float
    upper_p2_idx: int
    upper_p2_price: float
    lower_p1_idx: int
    lower_p1_price: float
    lower_p2_idx: int
    lower_p2_price: float


def _classify_shape(upper_slope: float, lower_slope: float, flat_thresh: float) -> str | None:
    upper_flat = abs(upper_slope) < flat_thresh
    lower_flat = abs(lower_slope) < flat_thresh
    if upper_flat and lower_slope > flat_thresh:
        return "ascending_triangle"
    if lower_flat and upper_slope < -flat_thresh:
        return "descending_triangle"
    if upper_slope < -flat_thresh and lower_slope > flat_thresh:
        return "symmetrical_triangle"
    if sign(upper_slope) == sign(lower_slope) and abs(upper_slope) > flat_thresh and abs(lower_slope) > flat_thresh:
        if upper_slope < lower_slope - flat_thresh:
            return "rising_wedge" if upper_slope > 0 else "falling_wedge"
        if abs(upper_slope - lower_slope) < flat_thresh:
            return "channel_up" if upper_slope > 0 else "channel_down"
    return None


def detect_triangles_channels(bars: pd.DataFrame, atr_arr: np.ndarray, *,
                              pivot_n: int = 5, window_bars: int = 120, min_touches_per_side: int = 3,
                              touch_tol_pct: float = 0.0025, flat_slope_atr_frac: float = 0.02,
                              breakout_max_bars: int = 40) -> list[TriangleChannel]:
    close = bars["close"].to_numpy()
    n = len(bars)
    out: list[TriangleChannel] = []
    win_start = 0

    while win_start + window_bars < n:
        win_end = win_start + window_bars
        window = bars.iloc[win_start:win_end + 1]
        highs = pivot_highs(window, pivot_n)
        lows = pivot_lows(window, pivot_n)
        local_atr = atr_arr[win_end] if win_end < len(atr_arr) else (atr_arr[-1] if len(atr_arr) else 0.0)

        matched = False
        if len(highs) >= 2 and len(lows) >= 2 and local_atr:
            h1, h2 = highs[0], highs[-1]
            l1, l2 = lows[0], lows[-1]
            upper_touches = line_touches(highs, h1.idx, h1.price, h2.idx, h2.price, touch_tol_pct) if h2.idx != h1.idx else 0
            lower_touches = line_touches(lows, l1.idx, l1.price, l2.idx, l2.price, touch_tol_pct) if l2.idx != l1.idx else 0

            if upper_touches >= min_touches_per_side and lower_touches >= min_touches_per_side:
                upper_slope = (h2.price - h1.price) / (h2.idx - h1.idx)
                lower_slope = (l2.price - l1.price) / (l2.idx - l1.idx)
                flat_thresh = flat_slope_atr_frac * local_atr
                shape_type = _classify_shape(upper_slope, lower_slope, flat_thresh)

                if shape_type:
                    upper_p1_idx, upper_p1_price = win_start + h1.idx, h1.price
                    upper_p2_idx, upper_p2_price = win_start + h2.idx, h2.price
                    lower_p1_idx, lower_p1_price = win_start + l1.idx, l1.price
                    lower_p2_idx, lower_p2_price = win_start + l2.idx, l2.price
                    height_at_start = (line_at(upper_p1_idx, upper_p1_price, upper_p2_idx, upper_p2_price, upper_p1_idx)
                                      - line_at(lower_p1_idx, lower_p1_price, lower_p2_idx, lower_p2_price, upper_p1_idx))
                    pattern_start_idx = win_start + min(h1.idx, l1.idx)

                    confirm_idx, direction, breakout_level = None, None, None
                    scan_from = win_end + 1
                    hi_end = min(scan_from + breakout_max_bars, n - 1)
                    for i in range(scan_from, hi_end + 1):
                        up = line_at(upper_p1_idx, upper_p1_price, upper_p2_idx, upper_p2_price, i)
                        dn = line_at(lower_p1_idx, lower_p1_price, lower_p2_idx, lower_p2_price, i)
                        if close[i] > up:
                            confirm_idx, direction, breakout_level = i, 1, up
                            break
                        if close[i] < dn:
                            confirm_idx, direction, breakout_level = i, -1, dn
                            break

                    if confirm_idx is not None:
                        expected_direction = TRI_EXPECTED_DIRECTION[shape_type]
                        played_out = (direction == expected_direction) if expected_direction is not None else None
                        out.append(TriangleChannel(
                            shape_type=shape_type, start_idx=pattern_start_idx, win_end_idx=win_end,
                            confirm_idx=confirm_idx, direction=direction, expected_direction=expected_direction,
                            played_out=played_out, measured_move=abs(height_at_start), breakout_level=breakout_level,
                            upper_touches=upper_touches, lower_touches=lower_touches,
                            upper_p1_idx=upper_p1_idx, upper_p1_price=upper_p1_price,
                            upper_p2_idx=upper_p2_idx, upper_p2_price=upper_p2_price,
                            lower_p1_idx=lower_p1_idx, lower_p1_price=lower_p1_price,
                            lower_p2_idx=lower_p2_idx, lower_p2_price=lower_p2_price,
                        ))
                        win_start = confirm_idx + 1
                        matched = True

        if not matched:
            win_start += window_bars // 2

    return out
