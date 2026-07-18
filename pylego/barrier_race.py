"""barrier_race — the ONE fixed-SL/TP barrier walker, shared by every SL/TP
distribution study (signal-agnostic terrain maps AND per-bot signal replays).

This is the core that used to live inline in
`VolRangeForecaster/sltp_distribution.py`'s `run_window()`. Pulling it out
matters because Layer 2 (per-bot signal replay) asks the exact same question
as Layer 1 (mechanical terrain mapping) — "for a fixed SL/TP grid, which
barrier gets touched first on the real M1 path" — and copying that walker a
second time per bot is precisely the "bit-identical port" drift bug
`CLAUDE.md` / `PYTHON_LEGO.md` exist to prevent. One walker, many entry
sources.

Contract: pure function of `bars` + a list of `Entry` (bar index + direction,
entry price optional) + a grid. No file I/O, no instrument/pip knowledge, no
network — the caller resolves pips/costs/entries; this only walks price.
Synthetic-testable (`barrier_race_test.py`), matching every other pylego brick.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass
class Entry:
    """One trade entry to race against the grid.

    idx: integer position into `bars` (NOT a timestamp — resolve with
      `bars.index.searchsorted(t)` once per entry; grouping by idx lets
      entries that share a bar reuse the same forward path).
    direction: +1 long, -1 short. Layer 1's mechanical mapping supplies BOTH
      directions from every sampled bar (append two Entry objects, same idx);
      a bot's signal replay supplies exactly one — the bot's actual call.
    entry_price: explicit fill price (e.g. a limit/zone price). None uses the
      bar's open, matching a market-order-on-bar-open assumption.
    """
    idx: int
    direction: int
    entry_price: float | None = None


@dataclass
class BarrierResult:
    """All rates/avg_r are FULL PRECISION (unrounded) — rounding is a display
    concern for the caller, not the core's job. Rounding here before a caller
    derives something (e.g. expectancy = avg_r * sl) silently changes the
    result depending on rounding order — round once, at the edge, in the
    caller that's about to print or store the number."""
    sl: float          # price-distance stop, as supplied in sl_grid (caller's units)
    tp_r: float         # TP as an R-multiple of sl
    n: int
    win_rate: float
    sl_rate: float
    timeout_rate: float
    avg_r: float


def race_grid(bars: pd.DataFrame, entries: list[Entry], sl_grid: list[float],
              tp_r_grid: list[float], max_bars_ahead: int,
              cost_price: float = 0.0, min_bars_ahead: int = 10) -> list[BarrierResult]:
    """Walk the real forward M1 path for every entry, for every (sl, tp_r) in
    the grid, and report which barrier got touched first.

    `cost_price` is a round-trip cost in the SAME price units as `bars` (e.g.
    one full spread) subtracted from every outcome as `cost_price / sl` R —
    a fixed drag per grid cell, not a fill-price shift. This is an
    approximation (real slippage varies by fill), adequate for grid-level
    comparison; a bot's own `pylego.costs.entry_slip_pct` audit remains the
    source of truth for actual realized cost.

    `min_bars_ahead` drops any entry with less than this much forward runway
    left in `bars` (default 10, sized for M1 data near the end of a history —
    lower it for coarser bars or short synthetic tests).

    `bars` must have `open`/`high`/`low`/`close` columns, oldest-first.
    """
    high = bars['high'].to_numpy()
    low = bars['low'].to_numpy()
    close = bars['close'].to_numpy()
    opens = bars['open'].to_numpy()
    n_bars = len(bars)

    by_idx: dict[int, list[Entry]] = {}
    for e in entries:
        by_idx.setdefault(e.idx, []).append(e)

    # One forward path per unique bar index — shared by every Entry at that
    # index (Layer 1's two directions from the same bar reuse it for free).
    paths = []   # (entry_price, direction, cummax_high, cummin_low, last_close)
    for idx, es in by_idx.items():
        if idx >= n_bars:
            continue
        end_pos = min(idx + max_bars_ahead, n_bars)
        if end_pos - idx < min_bars_ahead:   # not enough runway left in the data
            continue
        cmax = np.maximum.accumulate(high[idx:end_pos])
        cmin = np.minimum.accumulate(low[idx:end_pos])
        last_close = float(close[end_pos - 1])
        for e in es:
            entry_price = e.entry_price if e.entry_price is not None else float(opens[idx])
            paths.append((entry_price, e.direction, cmax, cmin, last_close))

    if not paths:
        return []

    results: list[BarrierResult] = []
    for sl in sl_grid:
        for tp_r in tp_r_grid:
            tp_dist = sl * tp_r
            outcomes_r = []
            tp_hits = sl_hits = timeouts = 0
            for entry_price, direction, cmax, cmin, last_close in paths:
                if direction > 0:
                    tp_price, sl_price = entry_price + tp_dist, entry_price - sl
                    tp_idx_arr = np.flatnonzero(cmax >= tp_price)
                    sl_idx_arr = np.flatnonzero(cmin <= sl_price)
                else:
                    tp_price, sl_price = entry_price - tp_dist, entry_price + sl
                    tp_idx_arr = np.flatnonzero(cmin <= tp_price)
                    sl_idx_arr = np.flatnonzero(cmax >= sl_price)
                tp_i = tp_idx_arr[0] if tp_idx_arr.size else None
                sl_i = sl_idx_arr[0] if sl_idx_arr.size else None

                if tp_i is not None and (sl_i is None or tp_i <= sl_i):
                    r = tp_r
                    tp_hits += 1
                elif sl_i is not None:
                    r = -1.0
                    sl_hits += 1
                else:
                    r = direction * (last_close - entry_price) / sl
                    timeouts += 1
                outcomes_r.append(r - (cost_price / sl if sl > 0 else 0.0))

            n = len(outcomes_r)
            if n == 0:
                continue
            results.append(BarrierResult(
                sl=sl, tp_r=tp_r, n=n,
                win_rate=tp_hits / n, sl_rate=sl_hits / n, timeout_rate=timeouts / n,
                avg_r=float(np.mean(outcomes_r)),
            ))
    return results
