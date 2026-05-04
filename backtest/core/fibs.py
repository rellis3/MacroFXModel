"""
Fibonacci level projection and confluence detection.

Fib level formula (mirrors dashboard js/config.js):
    price = range_low + level * range_size

So level 0 = range_low, level 1 = range_high, level 0.5 = midpoint,
level 1.618 = first extension above the range, level -0.618 = extension below.
"""

from __future__ import annotations
import numpy as np
from config import FIB_LEVELS


def project_fibs(
    range_high: float,
    range_low: float,
    levels: list[float] | None = None,
) -> list[tuple[float, float]]:
    """
    Project fib levels from a range.

    Returns a list of (level, price) tuples for all requested levels.
    Uses the full FIB_LEVELS list from config if levels is not specified.
    """
    if levels is None:
        levels = FIB_LEVELS

    size = range_high - range_low
    if size <= 0:
        return []

    return [(lvl, range_low + lvl * size) for lvl in levels]


def find_confluences(
    fib_sets: list[list[tuple[float, float]]],
    pip_size: float,
    threshold_pips: float = 5.0,
    min_sources: int = 2,
) -> list[dict]:
    """
    Find price zones where fib levels from different sources cluster together.

    fib_sets: list of fib projection outputs, one per source
              (e.g. [today_asia_fibs, yesterday_asia_fibs, monday_fibs])
    threshold_pips: max pip distance between levels to count as confluent
    min_sources: minimum distinct sources that must contribute a level

    Returns a list of confluence zone dicts:
        { 'price': float, 'levels': [(source_idx, level, price), ...], 'sources': int }
    """
    threshold = threshold_pips * pip_size

    # Flatten all levels with source index
    all_levels: list[tuple[int, float, float]] = []
    for src_idx, fibs in enumerate(fib_sets):
        for lvl, price in fibs:
            all_levels.append((src_idx, lvl, price))

    if not all_levels:
        return []

    all_levels.sort(key=lambda x: x[2])  # sort by price

    confluences = []
    used = set()

    for i, (src_i, lvl_i, price_i) in enumerate(all_levels):
        if i in used:
            continue

        cluster = [(src_i, lvl_i, price_i)]
        sources = {src_i}

        for j in range(i + 1, len(all_levels)):
            src_j, lvl_j, price_j = all_levels[j]
            if price_j - price_i > threshold:
                break
            if src_j not in sources:  # only count one level per source
                cluster.append((src_j, lvl_j, price_j))
                sources.add(src_j)
                used.add(j)

        if len(sources) >= min_sources:
            avg_price = np.mean([p for _, _, p in cluster])
            confluences.append({
                'price':   avg_price,
                'levels':  cluster,
                'sources': len(sources),
            })

    return confluences


def nearest_confluence(price: float, confluences: list[dict], pip_size: float) -> dict | None:
    """Return the closest confluence zone to price, or None if list is empty."""
    if not confluences:
        return None
    return min(confluences, key=lambda c: abs(c['price'] - price))


def confluence_distance_pips(price: float, confluences: list[dict], pip_size: float) -> float:
    """Distance in pips from price to the nearest confluence zone."""
    c = nearest_confluence(price, confluences, pip_size)
    if c is None:
        return float('inf')
    return abs(price - c['price']) / pip_size
