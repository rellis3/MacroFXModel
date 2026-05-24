"""
Fib Engine — Multi-timeframe traditional Fibonacci retracement zones.

For each timeframe, detects valid displacement legs using swing pivot logic,
then computes retracement levels. All TFs are processed independently; the
confluence scorer handles clustering and weighting.

Direction:
  'long'  — impulse was UP (low→high). Retrace pulls back downward. Look to BUY.
  'short' — impulse was DOWN (high→low). Retrace pulls back upward. Look to SELL.

Fib levels for a LONG zone (retracing into an up-impulse):
  GP zone: [swing_high - 0.650×R,  swing_high - 0.618×R]  (price window to buy)

Fib levels for a SHORT zone (retracing into a down-impulse):
  GP zone: [swing_low + 0.618×R,   swing_low + 0.650×R]   (price window to sell)
"""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


# Minimum impulse size as multiple of ATR before a leg is considered valid
MIN_ATR_MULT: dict[str, float] = {
    'D1': 2.0, 'H4': 1.8, 'H1': 1.5, 'M30': 1.2, 'M15': 1.0,
}

# Bars each side required to confirm a pivot high/low
PIVOT_N: dict[str, int] = {
    'D1': 3, 'H4': 4, 'H1': 4, 'M30': 4, 'M15': 3,
}

MAX_ZONES_PER_TF = 3


@dataclass
class FibZone:
    zone_id: str
    tf: str              # D1 | H4 | H1 | M30 | M15
    direction: str       # long | short
    swing_origin: float  # start of the impulse leg
    swing_end: float     # end of the impulse leg
    impulse_size: float

    level_382: float
    level_618: float
    level_650: float
    level_786: float
    level_886: float

    gp_low: float        # lower price boundary of golden pocket
    gp_high: float       # upper price boundary of golden pocket
    zone_low: float      # widest watch zone (382–886 spread)
    zone_high: float

    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    age_bars: int = 0
    active: bool = True
    score: float = 0.0
    htf_aligned: bool = False
    composition: list = field(default_factory=list)


def _compute_atr(bars: list[dict], period: int = 14) -> float:
    if len(bars) < 2:
        return 10.0
    alpha = 0.15
    tr = abs(bars[1]['high'] - bars[1]['low'])
    for i in range(1, len(bars)):
        h, l, pc = bars[i]['high'], bars[i]['low'], bars[i - 1]['close']
        tr = alpha * max(h - l, abs(h - pc), abs(l - pc)) + (1 - alpha) * tr
    return tr


def _find_pivots(bars: list[dict], n: int) -> tuple[list[int], list[int]]:
    """Returns pivot_high_indices and pivot_low_indices. Bars must be chronological."""
    highs  = [b['high'] for b in bars]
    lows   = [b['low']  for b in bars]
    length = len(bars)
    ph, pl = [], []
    for i in range(n, length - n):
        window_h = highs[i - n: i + n + 1]
        window_l = lows[i - n: i + n + 1]
        if highs[i] >= max(window_h):
            ph.append(i)
        if lows[i] <= min(window_l):
            pl.append(i)
    return ph, pl


def _make_zone(tf: str, direction: str, swing_low: float, swing_high: float,
               age_bars: int) -> FibZone:
    r = swing_high - swing_low
    if direction == 'long':
        l382 = swing_high - 0.382 * r
        l618 = swing_high - 0.618 * r
        l650 = swing_high - 0.650 * r
        l786 = swing_high - 0.786 * r
        l886 = swing_high - 0.886 * r
        gp_low, gp_high     = l650, l618
        zone_low, zone_high = l886, l382
        origin, end         = swing_low, swing_high
    else:
        l382 = swing_low + 0.382 * r
        l618 = swing_low + 0.618 * r
        l650 = swing_low + 0.650 * r
        l786 = swing_low + 0.786 * r
        l886 = swing_low + 0.886 * r
        gp_low, gp_high     = l618, l650
        zone_low, zone_high = l382, l886
        origin, end         = swing_high, swing_low

    zone_id = f'{tf}_{direction}_{round(swing_low)}_{round(swing_high)}'
    return FibZone(
        zone_id=zone_id, tf=tf, direction=direction,
        swing_origin=round(origin, 2), swing_end=round(end, 2),
        impulse_size=round(r, 2),
        level_382=round(l382, 2), level_618=round(l618, 2),
        level_650=round(l650, 2), level_786=round(l786, 2),
        level_886=round(l886, 2),
        gp_low=round(gp_low, 2), gp_high=round(gp_high, 2),
        zone_low=round(zone_low, 2), zone_high=round(zone_high, 2),
        age_bars=age_bars,
    )


def detect_fib_zones(bars: list[dict], tf: str, current_price: float) -> list[FibZone]:
    """
    bars: chronological OHLC dicts (oldest first), at least 20 bars.
    Returns up to MAX_ZONES_PER_TF active zones, newest first.
    """
    if len(bars) < 20:
        return []

    atr      = _compute_atr(bars)
    min_size = atr * MIN_ATR_MULT.get(tf, 1.5)
    n        = PIVOT_N.get(tf, 3)
    length   = len(bars)

    ph_idx, pl_idx = _find_pivots(bars, n)
    if not ph_idx or not pl_idx:
        return []

    # Interleave pivot highs and lows by bar index, alternating types
    pivots = sorted(
        [(i, 'high', bars[i]['high']) for i in ph_idx] +
        [(i, 'low',  bars[i]['low'])  for i in pl_idx],
        key=lambda x: x[0],
    )

    zones: list[FibZone] = []
    prev: Optional[tuple] = None

    for idx, ptype, price in pivots:
        if prev is None:
            prev = (idx, ptype, price)
            continue

        pidx, pptype, pprice = prev

        # Same type: keep more extreme
        if pptype == ptype:
            if ptype == 'high':
                prev = (idx, ptype, price) if price > pprice else prev
            else:
                prev = (idx, ptype, price) if price < pprice else prev
            continue

        # Alternating pair — extract swing_low and swing_high
        if pptype == 'low':
            swing_low, swing_high = pprice, price
            direction = 'long'
        else:
            swing_low, swing_high = price, pprice
            direction = 'short'

        impulse_size = swing_high - swing_low
        if impulse_size >= min_size:
            age  = length - 1 - idx
            zone = _make_zone(tf, direction, swing_low, swing_high, age)

            # Invalidate if price has closed beyond the impulse origin
            if direction == 'long' and current_price < zone.swing_origin * 0.999:
                zone.active = False
            elif direction == 'short' and current_price > zone.swing_origin * 1.001:
                zone.active = False

            zones.append(zone)

        prev = (idx, ptype, price)

    # Deduplicate: keep only the first (newest) zone with each zone_id
    seen: set[str] = set()
    unique: list[FibZone] = []
    for z in zones:
        if z.zone_id not in seen:
            seen.add(z.zone_id)
            unique.append(z)

    active = [z for z in unique if z.active]
    active.sort(key=lambda z: z.age_bars)
    return active[:MAX_ZONES_PER_TF]


def update_zone_activity(zones: list[FibZone], current_price: float,
                         recent_closes: list[float]) -> None:
    """Expire a zone if two consecutive closes are beyond its origin."""
    for zone in zones:
        if not zone.active:
            continue
        if len(recent_closes) >= 2:
            if zone.direction == 'long' and all(c < zone.swing_origin for c in recent_closes[-2:]):
                zone.active = False
            elif zone.direction == 'short' and all(c > zone.swing_origin for c in recent_closes[-2:]):
                zone.active = False
