"""analog_signal — turn shape-matched neighbours into a directional call
(Category-A combiner brick, sits on `shape_match` + `barrier_race`).

Pulled out of `AnalogML/pattern_scan.py`'s inline loop so a SECOND consumer
(`AnalogML/ml_walkforward.py`'s analog-margin feature) doesn't recreate the
same "find analogs, race both directions, vote on the side that did
better" logic a second time -- the exact copy-paste-drift failure mode
PYTHON_LEGO.md exists to prevent. Both scripts now call `neighbor_consensus`.

Pure-ish: it's a function of `bars` + precomputed shapes + one query, using
the SAME shared barrier walker (`pylego.barrier_race.race_trades`) every
other SL/TP study in this repo uses for outcomes -- no second walker.
Offline-testable on synthetic bars (`analog_signal_test.py`).
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from pylego.barrier_race import Entry, race_trades
from pylego.shape_match import find_analogs


@dataclass
class AnalogConsensus:
    """direction: +1 long, -1 short, 0 = flat (too few neighbours, or both
    sides non-positive -- nothing to act on). avg_long_r/avg_short_r/margin
    are None when direction is 0 for the "too few neighbours" reason (no
    trades to average at all); margin = avg_long_r - avg_short_r is the
    signed strength of the vote, usable as a raw feature independent of the
    direction call itself. long_win_rate/short_win_rate are the fraction of
    neighbours that were net-profitable in that direction -- this IS the
    "probability" a shape-match method can honestly offer (there's no
    separate "did the pattern complete" question the way rule-based chart
    patterns have; the neighbours' own realized win/loss already answers
    it). neighbours is populated only when `detail=True` is passed to
    neighbor_consensus (see below) -- the per-bar backtest/walk-forward
    callers never need it and it's needless list-of-dicts overhead there."""
    direction: int
    avg_long_r: float | None
    avg_short_r: float | None
    margin: float | None
    n_neighbours: int
    long_win_rate: float | None = None
    short_win_rate: float | None = None
    neighbours: list[dict] | None = None


def neighbor_consensus(bars: pd.DataFrame, end_idx: np.ndarray, shapes: np.ndarray,
                       query_shape: np.ndarray, query_end: int, *, k: int, min_gap_bars: int,
                       sl_price: float, tp_r: float, cost_price: float,
                       max_bars_ahead: int, min_bars_ahead: int,
                       min_neighbours: int | None = None,
                       detail: bool = False) -> AnalogConsensus:
    """Find up to `k` causal shape-matched analogs to `query_shape` (a window
    ENDING at bar `query_end`), race BOTH directions from each analog's next
    bar at one fixed (sl_price, tp_r) cell via `race_trades`, and return the
    direction the neighbours did better on -- "which side would a
    similar-shape trader have taken" turned into an actual vote instead of a
    marketing sentence. `exclude_after=query_end` (passed to `find_analogs`)
    is the only leakage guard here; the caller must not pass shapes/end_idx
    that already leak future information some other way.

    detail=True additionally populates `.neighbours`: one row per analog,
    nearest-first, with its own historical entry date, `find_analogs`
    closeness percentile (rank among ALL eligible candidates, not just the
    k chosen -- see shape_match.find_analogs), and its own realized long_r/
    short_r (None if that entry didn't have enough bars of runway left to
    resolve -- race_trades silently drops those, same convention as the
    aggregate)."""
    if min_neighbours is None:
        min_neighbours = max(3, k // 3)
    neighbours, _dist, pct = find_analogs(query_shape, end_idx, shapes, k=k,
                                          min_gap_bars=min_gap_bars, exclude_after=query_end)
    if len(neighbours) < min_neighbours:
        return AnalogConsensus(direction=0, avg_long_r=None, avg_short_r=None,
                               margin=None, n_neighbours=len(neighbours))

    neighbour_entries = []
    for nb in neighbours:
        neighbour_entries.append(Entry(idx=int(nb) + 1, direction=1))
        neighbour_entries.append(Entry(idx=int(nb) + 1, direction=-1))
    trades = race_trades(bars, neighbour_entries, sl=sl_price, tp_r=tp_r,
                         max_bars_ahead=max_bars_ahead, cost_price=cost_price,
                         min_bars_ahead=min_bars_ahead)
    long_r = [t["r"] for t in trades if t["direction"] == 1]
    short_r = [t["r"] for t in trades if t["direction"] == -1]
    if not long_r or not short_r:
        return AnalogConsensus(direction=0, avg_long_r=None, avg_short_r=None,
                               margin=None, n_neighbours=len(neighbours))

    avg_long, avg_short = float(np.mean(long_r)), float(np.mean(short_r))
    long_win_rate = float(np.mean([r > 0 for r in long_r]))
    short_win_rate = float(np.mean([r > 0 for r in short_r]))
    margin = avg_long - avg_short
    direction = 0 if (avg_long <= 0 and avg_short <= 0) else (1 if avg_long > avg_short else -1)

    neighbour_detail = None
    if detail:
        r_by_key = {(t["idx"], t["direction"]): t["r"] for t in trades}
        neighbour_detail = []
        for nb, d, p in zip(neighbours, _dist, pct):
            entry_idx = int(nb) + 1
            neighbour_detail.append({
                "entry_idx": entry_idx,
                "entry_date": bars.index[entry_idx].isoformat() if entry_idx < len(bars) else None,
                "distance": float(d),
                "percentile": float(p),
                "long_r": r_by_key.get((entry_idx, 1)),
                "short_r": r_by_key.get((entry_idx, -1)),
            })

    return AnalogConsensus(direction=direction, avg_long_r=avg_long, avg_short_r=avg_short,
                           margin=margin, n_neighbours=len(neighbours),
                           long_win_rate=long_win_rate, short_win_rate=short_win_rate,
                           neighbours=neighbour_detail)
