"""trendline — two-point trendline fitting shared by every geometry-based
chart-pattern detector, regenerated from `js/patternEngine.js`'s `lineAt` /
`lineTouches`. Extracted as its own Tier-1 brick once a second detector
(`head_shoulders.py`) needed the identical formula `flag_pennant.py`
already had privately — CLAUDE.md's brick rule: a second copy is the signal
to extract, not more private duplicates per detector.
"""
from __future__ import annotations

from typing import Protocol


class _Pivot(Protocol):
    idx: int
    price: float


def sign(x: float) -> int:
    """Same semantics as JS's Math.sign: -1 / 0 / +1."""
    return (x > 0) - (x < 0)


def line_at(i1: int, p1: float, i2: int, p2: float, idx: int) -> float:
    """The line through (i1,p1)-(i2,p2), evaluated at bar index `idx`
    (extrapolates freely outside [i1, i2])."""
    slope = (p2 - p1) / (i2 - i1)
    return p1 + slope * (idx - i1)


def line_touches(pivots: list[_Pivot], i1: int, p1: float, i2: int, p2: float, tol_pct: float) -> int:
    """Anchors (i1,p1)/(i2,p2) always count as 2; every OTHER pivot in
    `pivots` (which may lie before i1 or after i2 too — the fitted line is
    checked against the whole pivot list, not just the segment between
    anchors) adds one more if it sits within tol_pct of the line's
    projected price at that pivot's own index."""
    slope = (p2 - p1) / (i2 - i1)
    count = 2
    for pt in pivots:
        if pt.idx == i1 or pt.idx == i2:
            continue
        expected = p1 + slope * (pt.idx - i1)
        if expected > 0 and abs(pt.price - expected) / expected < tol_pct:
            count += 1
    return count
