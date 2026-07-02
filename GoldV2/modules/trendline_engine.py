"""
Trendline Engine — detect descending and ascending structural trendlines
from swing pivot points on H4 and H1 bars.

A trendline requires at least 2 confirmed pivot touches to be valid.
The projected price of the trendline at the current bar becomes an
additional confluence level for the zone scorer.

Directional alignment rule (only aligned lines add to score):
  Ascending TL  at a LONG zone  → structural rising support agrees with fib support
  Descending TL at a SHORT zone → structural falling resistance agrees with fib resistance

Cross-aligned trendlines (descending at a long zone = resistance overhead,
ascending at a short zone = support below) are detected but not scored,
as they work against the expected reversal.
"""

from __future__ import annotations
from dataclasses import dataclass

_PIVOT_N: dict[str, int] = {'H4': 3, 'H1': 3, 'H4_coarse': 4}
_TOUCH_TOL_PCT = 0.003    # 0.3% tolerance for pivot-on-line check (~$7 at gold 2300)
_MIN_BARS = 30
_MAX_LINES_PER_KIND = 3   # cap per tf/kind to avoid noise


@dataclass
class Trendline:
    tf: str           # H4 | H1
    kind: str         # 'ascending' | 'descending'
    touches: int      # pivot confirmations (including the two anchors)
    projected: float  # line price projected to the current (latest) bar
    slope: float      # price change per bar (negative = descending)
    age_bars: int     # bars since the most recent anchor pivot


def _pivot_highs(bars: list[dict], n: int) -> list[tuple[int, float]]:
    highs = [b['high'] for b in bars]
    out: list[tuple[int, float]] = []
    for i in range(n, len(bars) - n):
        if highs[i] >= max(highs[i - n: i + n + 1]):
            out.append((i, highs[i]))
    return out


def _pivot_lows(bars: list[dict], n: int) -> list[tuple[int, float]]:
    lows = [b['low'] for b in bars]
    out: list[tuple[int, float]] = []
    for i in range(n, len(bars) - n):
        if lows[i] <= min(lows[i - n: i + n + 1]):
            out.append((i, lows[i]))
    return out


def _count_touches(pivots: list[tuple[int, float]],
                   i1: int, p1: float,
                   i2: int, p2: float) -> int:
    """Count pivots that lie on the line through (i1,p1)→(i2,p2)."""
    slope = (p2 - p1) / (i2 - i1)
    count = 2   # the two defining pivots always count
    for i, p in pivots:
        if i in (i1, i2):
            continue
        expected = p1 + slope * (i - i1)
        if expected > 0 and abs(p - expected) / expected < _TOUCH_TOL_PCT:
            count += 1
    return count


def _build_lines(bars: list[dict], tf: str,
                 pivots: list[tuple[int, float]],
                 kind: str) -> list[Trendline]:
    """
    For 'descending': each successive pivot high is LOWER than the previous.
    For 'ascending':  each successive pivot low is HIGHER than the previous.
    Scans newest-to-oldest so the most recent lines are discovered first.
    """
    n = len(pivots)
    current_idx = len(bars) - 1
    lines: list[Trendline] = []

    for j in range(n - 1, 0, -1):
        i2, p2 = pivots[j]
        for k in range(j - 1, -1, -1):
            i1, p1 = pivots[k]
            if kind == 'descending' and p2 >= p1:
                continue
            if kind == 'ascending' and p2 <= p1:
                continue

            slope = (p2 - p1) / (i2 - i1)
            projected = p2 + slope * (current_idx - i2)
            if projected <= 0:
                continue

            touches = _count_touches(pivots, i1, p1, i2, p2)
            if touches < 2:
                continue

            lines.append(Trendline(
                tf=tf, kind=kind, touches=touches,
                projected=round(projected, 2),
                slope=round(slope, 4),
                age_bars=current_idx - i2,
            ))
            break   # best line anchored at j found; move to next j

        if len(lines) >= _MAX_LINES_PER_KIND:
            break

    # Deduplicate: drop lines whose projected prices are within $4 of each other
    unique: list[Trendline] = []
    for tl in sorted(lines, key=lambda x: -x.touches):
        if not any(abs(tl.projected - u.projected) < 4.0 for u in unique):
            unique.append(tl)

    return unique[:_MAX_LINES_PER_KIND]


def detect_trendlines(bars: list[dict], tf: str) -> list[Trendline]:
    """
    bars: chronological OHLCV dicts, oldest first. At least 30 bars.
    Returns all valid ascending and descending trendlines for this TF.
    """
    if len(bars) < _MIN_BARS:
        return []
    n = _PIVOT_N.get(tf, 3)
    ph = _pivot_highs(bars, n)
    pl = _pivot_lows(bars, n)
    return _build_lines(bars, tf, ph, 'descending') + _build_lines(bars, tf, pl, 'ascending')
