"""swing_structure — pivot-based market structure (Category-A math brick).

Regenerated (not ported — PYTHON_LEGO.md's "generate-don't-port" rule) from
`js/patternEngine.js`'s `pivotHighs`/`pivotLows`/`classifySwingStructure`,
using its algorithm as the validated spec, not its code: a fresh, vectorized
numpy implementation with its own tests, same contract discipline as every
other pylego brick (pure, offline-testable, no I/O).

A "pivot high" at bar i is a bar whose high is not exceeded by any bar within
`n` bars either side (ties count — same tie-inclusive semantics as the JS
original: only a STRICTLY greater neighbour disqualifies a bar). Pivot lows
are the mirror image on `low`. `classify_swing_structure` walks the
chronological sequence of pivots and labels each stretch Higher-High+
Higher-Low (uptrend), Lower-High+Lower-Low (downtrend), or mixed (range/
CHoCH) — the same read a price-action trader uses to ask "does this setup
agree with the prevailing trend."

This is Phase 2 of the AnalogML structural-motif build (see
`MD files/LEGO_MODULES.md`'s AnalogML entry, "null banked 2026-08-12" note):
the fixed-window k-NN shape-matching method tested null across the full
26-pair universe, so the next honest attempt is a structurally different
idea — motif/structural-event matching (e.g. N touches of a level, entry on
the Nth) instead of raw fixed-window Euclidean distance. This brick is the
first piece: finding the touches at all. `pylego/motif_touch.py` (Phase 3)
builds the touch-run / level detector on top of it.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass
class Pivot:
    """idx: integer position into the bars this pivot was found on.
    kind: 'high' or 'low'."""
    idx: int
    price: float
    time: object
    kind: str


def pivot_highs(bars: pd.DataFrame, n: int) -> list[Pivot]:
    """Bars whose high is >= every other high within `n` bars either side.
    Only the FIRST n and LAST n bars can never be pivots (no full window) —
    same boundary convention as the JS original."""
    high = bars["high"].to_numpy()
    m = len(high)
    if m < 2 * n + 1:
        return []
    windows = np.lib.stride_tricks.sliding_window_view(high, 2 * n + 1)
    win_max = windows.max(axis=1)
    center = high[n : m - n]
    hit = np.nonzero(center == win_max)[0] + n
    times = bars.index.to_numpy()
    return [Pivot(idx=int(i), price=float(high[i]), time=times[i], kind="high") for i in hit]


def pivot_lows(bars: pd.DataFrame, n: int) -> list[Pivot]:
    """Mirror of pivot_highs on `low` — bars whose low is <= every other low
    within `n` bars either side."""
    low = bars["low"].to_numpy()
    m = len(low)
    if m < 2 * n + 1:
        return []
    windows = np.lib.stride_tricks.sliding_window_view(low, 2 * n + 1)
    win_min = windows.min(axis=1)
    center = low[n : m - n]
    hit = np.nonzero(center == win_min)[0] + n
    times = bars.index.to_numpy()
    return [Pivot(idx=int(i), price=float(low[i]), time=times[i], kind="low") for i in hit]


def atr(bars: pd.DataFrame, period: int = 14) -> np.ndarray:
    """Wilder's ATR, same recursion as `js/patternEngine.js`'s `computeATR`
    (simple average of true range for the first `period` bars, then
    `atr[i] = (atr[i-1]*(period-1) + tr[i]) / period`). Sequential by
    construction (Wilder smoothing), not vectorizable without changing the
    definition."""
    high = bars["high"].to_numpy()
    low = bars["low"].to_numpy()
    close = bars["close"].to_numpy()
    n = len(bars)
    out = np.zeros(n)
    tr_sum = 0.0
    for i in range(n):
        prev_close = close[i - 1] if i > 0 else close[i]
        tr = max(high[i] - low[i], abs(high[i] - prev_close), abs(low[i] - prev_close))
        if i < period:
            tr_sum += tr
            out[i] = tr_sum / (i + 1)
        else:
            out[i] = (out[i - 1] * (period - 1) + tr) / period
    return out


@dataclass
class RegimePoint:
    """A change-point in classify_swing_structure's output series. `dir` is
    +1 (up), -1 (down), or None (range/mixed)."""
    idx: int
    time: object
    regime: str  # 'trend_up' | 'trend_down' | 'range'
    dir: int | None
    label: str


def classify_swing_structure(bars: pd.DataFrame, pivot_n: int = 5) -> list[RegimePoint]:
    """Walks the chronological sequence of swing highs/lows and labels each
    new pair HH+HL (uptrend), LH+LL (downtrend), or mixed (range/CHoCH) —
    same read as js/patternEngine.js's classifySwingStructure. Returns a
    sparse list of regime change-points; use regime_at() to look up whichever
    regime was in force at any bar index."""
    highs = pivot_highs(bars, pivot_n)
    lows = pivot_lows(bars, pivot_n)
    events = sorted(highs + lows, key=lambda p: p.idx)

    times = bars.index.to_numpy()
    series = [RegimePoint(idx=0, time=times[0] if len(times) else None,
                          regime="range", dir=None, label="insufficient structure")]
    prev_high = last_high = prev_low = last_low = None

    for ev in events:
        if ev.kind == "high":
            prev_high, last_high = last_high, ev
        else:
            prev_low, last_low = last_low, ev
        if prev_high is None or prev_low is None:
            continue

        hh = last_high.price > prev_high.price
        hl = last_low.price > prev_low.price
        lh = last_high.price < prev_high.price
        ll = last_low.price < prev_low.price

        regime, direction, label = "range", None, "mixed structure (CHoCH)"
        if hh and hl:
            regime, direction, label = "trend_up", 1, "HH + HL"
        elif lh and ll:
            regime, direction, label = "trend_down", -1, "LH + LL"

        last = series[-1]
        if regime != last.regime or direction != last.dir:
            series.append(RegimePoint(idx=ev.idx, time=ev.time, regime=regime, dir=direction, label=label))
    return series


def regime_at(series: list[RegimePoint], idx: int) -> RegimePoint | None:
    """Binary search: the regime in force at bar index `idx` (last
    change-point <= idx)."""
    if not series:
        return None
    lo, hi, ans = 0, len(series) - 1, series[0]
    while lo <= hi:
        mid = (lo + hi) // 2
        if series[mid].idx <= idx:
            ans = series[mid]
            lo = mid + 1
        else:
            hi = mid - 1
    return ans
