"""
Fib Engine — Multi-timeframe traditional Fibonacci retracement zones.

For each timeframe, detects valid displacement legs using swing pivot logic,
then computes retracement levels. All TFs are processed independently; the
confluence scorer handles clustering and weighting.

Direction:
  'long'  — impulse was UP (low→high). Retrace pulls back downward. Look to BUY.
  'short' — impulse was DOWN (high→low). Retrace pulls back upward. Look to SELL.

Each impulse generates FIVE zone variants, all independently scored:
  'gp'   — Golden Pocket [.618–.650], tightest, highest-probability reversal
  '50pct'— Symmetric window around .5 midpoint level
  '382'  — Shallow pullback [level ± DEEP_RETRACE_WINDOW×R], continuation entries
  '786'  — .786 retrace  [level ± DEEP_RETRACE_WINDOW×R], deep but still valid
  '886'  — .886 retrace  [level ± DEEP_RETRACE_WINDOW×R], near structure origin

Jay/Max usage: .382 = shallow trend continuation; GP = primary reversal;
.786/.886 = deep retrace scalp (886 strongest per Jay backtest).
A .786 or .886 with NPOC + pivot confluence is a tradeable setup on its own.
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

MAX_ZONES_PER_TF = 18      # up to 3 impulses × 6 variants (gp / 382 / 50pct / 786 / 886 / retest)

# Symmetric half-window around .786/.886 and .5 as fraction of impulse R
DEEP_RETRACE_WINDOW = 0.016

# Half-window around the broken anchor level for retest zones
RETEST_WINDOW = 0.012


@dataclass
class FibZone:
    zone_id: str
    tf: str              # D1 | H4 | H1 | M30 | M15
    direction: str       # long | short
    zone_variant: str    # gp | 786 | 886
    swing_origin: float  # start of the impulse leg
    swing_end: float     # end of the impulse leg
    impulse_size: float

    level_382: float
    level_618: float
    level_650: float
    level_786: float
    level_886: float
    level_500: float         # 0.5 retracement level (impulse midpoint)

    gp_low: float        # lower price boundary of entry window
    gp_high: float       # upper price boundary of entry window
    zone_low: float      # widest watch zone (382–886 spread)
    zone_high: float

    # Unix timestamps of the pivot bars that define the impulse leg.
    # swing_origin_time = bar time at the start of the impulse (low for long, high for short).
    # swing_end_time    = bar time at the end of the impulse   (high for long, low for short).
    swing_origin_time: int = 0
    swing_end_time: int = 0

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
               age_bars: int, variant: str = 'gp',
               origin_time: int = 0, end_time: int = 0) -> FibZone:
    """
    variant: 'gp'     → golden pocket (.618–.650)
             '382'    → symmetric window around .382 shallow pullback level
             '50pct'  → symmetric window around .5 midpoint level
             '786'    → symmetric window around .786 level
             '886'    → symmetric window around .886 level
             'retest' → tight window around the broken anchor (0 or 1 level)
    """
    r = swing_high - swing_low
    w = DEEP_RETRACE_WINDOW * r   # half-window for .382/.786/.886/50pct zones

    if direction == 'long':
        l382 = swing_high - 0.382 * r
        l618 = swing_high - 0.618 * r
        l650 = swing_high - 0.650 * r
        l786 = swing_high - 0.786 * r
        l886 = swing_high - 0.886 * r
        zone_low, zone_high = l886, l382
        origin, end         = swing_low, swing_high
        o_time, e_time      = origin_time, end_time
    else:
        l382 = swing_low + 0.382 * r
        l618 = swing_low + 0.618 * r
        l650 = swing_low + 0.650 * r
        l786 = swing_low + 0.786 * r
        l886 = swing_low + 0.886 * r
        zone_low, zone_high = l382, l886
        origin, end         = swing_high, swing_low
        o_time, e_time      = origin_time, end_time

    l500 = (swing_high + swing_low) / 2

    if variant == '382':
        gp_low, gp_high = l382 - w, l382 + w
    elif variant == '786':
        gp_low, gp_high = l786 - w, l786 + w
    elif variant == '886':
        gp_low, gp_high = l886 - w, l886 + w
    elif variant == '50pct':
        gp_low, gp_high = l500 - w, l500 + w
    elif variant == 'retest':
        w_rt = RETEST_WINDOW * r
        gp_low  = end - w_rt
        gp_high = end + w_rt
        zone_low  = gp_low
        zone_high = gp_high
        # Override origin so update_zone_activity invalidates when the retest fails
        if direction == 'long':
            origin = end - w_rt * 2.5
        else:
            origin = end + w_rt * 2.5
    else:
        # Standard GP: .618 to .650 (direction-agnostic — lower always gp_low)
        gp_low  = min(l618, l650)
        gp_high = max(l618, l650)

    suffix  = f'_{variant}' if variant != 'gp' else ''
    zone_id = f'{tf}_{direction}_{round(swing_low)}_{round(swing_high)}{suffix}'
    return FibZone(
        zone_id=zone_id, tf=tf, direction=direction, zone_variant=variant,
        swing_origin=round(origin, 2), swing_end=round(end, 2),
        swing_origin_time=o_time, swing_end_time=e_time,
        impulse_size=round(r, 2),
        level_382=round(l382, 2), level_618=round(l618, 2),
        level_650=round(l650, 2), level_786=round(l786, 2),
        level_886=round(l886, 2), level_500=round(l500, 2),
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
            # origin = pivot low bar (pidx), end = pivot high bar (idx)
            origin_time = bars[pidx].get('time', 0)
            end_time    = bars[idx].get('time', 0)
        else:
            swing_low, swing_high = price, pprice
            direction = 'short'
            # origin = pivot high bar (pidx), end = pivot low bar (idx)
            origin_time = bars[pidx].get('time', 0)
            end_time    = bars[idx].get('time', 0)

        impulse_size = swing_high - swing_low
        if impulse_size >= min_size:
            age = length - 1 - idx
            for variant in ('gp', '382', '50pct', '786', '886'):
                zone = _make_zone(tf, direction, swing_low, swing_high, age, variant,
                                  origin_time=origin_time, end_time=end_time)

                # Invalidate if price has closed beyond the impulse origin
                if direction == 'long' and current_price < zone.swing_origin * 0.999:
                    zone.active = False
                elif direction == 'short' and current_price > zone.swing_origin * 1.001:
                    zone.active = False

                zones.append(zone)

            # Retest variant: price has broken through the "1" level (swing_end).
            # The broken level often acts as new S/R on the first retest.
            if direction == 'long' and current_price > swing_high * 1.001:
                zones.append(_make_zone(tf, direction, swing_low, swing_high, age, 'retest',
                                        origin_time=origin_time, end_time=end_time))
            elif direction == 'short' and current_price < swing_low * 0.999:
                zones.append(_make_zone(tf, direction, swing_low, swing_high, age, 'retest',
                                        origin_time=origin_time, end_time=end_time))

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
