"""shape_match — historical analog / motif search (Category-A math brick).

Normalizes windows of a price series so shape becomes comparable across price
levels and vol regimes — "where has this market geometry happened before, and
what happened next" instead of a scalar indicator threshold. Pure numpy, no
I/O, no instrument knowledge, offline-testable (shape_match_test.py) — same
contract discipline as pylego/barrier_race.py (PYTHON_LEGO.md Section 0,
Category A: math/contract bricks are one canonical impl, imported everywhere).

Normalization (normalize_window): log returns over the window, divided by the
window's own realized vol (std of those returns), cumulative-summed back into
a path. Price LEVEL is gone (path starts at 0); VOLATILITY is scaled to 1 (by
construction); TIME SPACING is unchanged (one point per bar) — the three
properties the "shape matching" idea calls for. A flat window (zero variance)
has no shape to match — normalize_window returns None rather than dividing by
zero; rolling_shapes silently drops those windows.

Search (find_analogs): brute-force vectorized Euclidean distance across ALL
candidate windows via a sliding-window view — O(n_windows x window_len), fine
for the resampled bar counts this is meant for (H1/H4 history, not raw M1
tick-by-tick); NOT a matrix-profile/DTW-scale tool. This is intentionally the
simplest correct version of the idea (CLAUDE.md: "start with the minimal-DOF
version") — matrix profile (stumpy) or DTW are candidate upgrades once this
baseline has been run and its OOS numbers are known, not before.

Caller owns the walk-forward leakage guard: `find_analogs(..., exclude_after=)`
only excludes candidates by bar index; a true OOS analog search must also
restrict the `shapes`/`end_idx` arrays passed in to the training period, the
same way every other fold in this repo is built (see pylego/walkforward.py).
"""
from __future__ import annotations

import numpy as np


def normalize_window(closes: np.ndarray) -> np.ndarray | None:
    """closes: 1D array of length window_len (oldest -> newest). Returns a
    length-(window_len - 1) unit-vol, zero-start shape vector, or None if the
    window is degenerate (zero or non-finite realized vol -- nothing to
    match)."""
    closes = np.asarray(closes, dtype=np.float64)
    if closes.ndim != 1 or len(closes) < 3:
        return None
    log_r = np.diff(np.log(closes))
    vol = log_r.std(ddof=0)
    if not np.isfinite(vol) or vol <= 0:
        return None
    return np.cumsum(log_r / vol)


def rolling_shapes(closes: np.ndarray, window_len: int) -> tuple[np.ndarray, np.ndarray]:
    """Build normalized shapes for every window of `window_len` closes ending
    at each bar. Returns (end_idx, shapes) where end_idx[i] is the bar index
    the i-th window ENDS at (inclusive, 0-based into `closes`) and shapes[i]
    is that window's normalize_window output (window_len - 1 long).
    Degenerate windows are dropped, so end_idx/shapes stay aligned to each
    other but shorter than len(closes)."""
    closes = np.asarray(closes, dtype=np.float64)
    n = len(closes)
    if n < window_len:
        return np.empty(0, dtype=np.int64), np.empty((0, max(window_len - 1, 0)))
    windows = np.lib.stride_tricks.sliding_window_view(closes, window_len)  # (n-window_len+1, window_len)
    log_r = np.diff(np.log(windows), axis=1)                                # (.., window_len-1)
    vol = log_r.std(axis=1, ddof=0)
    ok = np.isfinite(vol) & (vol > 0)
    shapes = np.cumsum(log_r[ok] / vol[ok, None], axis=1)
    end_idx = np.arange(window_len - 1, n)[ok]
    return end_idx, shapes


def find_analogs(query_shape: np.ndarray, end_idx: np.ndarray, shapes: np.ndarray,
                  k: int, min_gap_bars: int = 0,
                  exclude_after: int | None = None) -> tuple[np.ndarray, np.ndarray]:
    """Nearest neighbours to `query_shape` (same length as each row of
    `shapes`) by Euclidean distance. `exclude_after` drops any candidate
    window ending at or after that bar index (pass the query's own end_idx so
    a query can never match itself or a window overlapping its own future).
    `min_gap_bars` greedily skips any candidate within that many bars of an
    already-chosen one, so the k neighbours aren't just the same overlapping
    window shifted by 1 bar. Returns (end_idx_of_matches, distances),
    nearest-first; both empty if nothing qualifies."""
    if len(shapes) == 0 or k <= 0:
        return np.empty(0, dtype=np.int64), np.empty(0)
    mask = np.ones(len(end_idx), dtype=bool)
    if exclude_after is not None:
        mask &= end_idx < exclude_after
    if not mask.any():
        return np.empty(0, dtype=np.int64), np.empty(0)
    cand_idx = end_idx[mask]
    cand_shapes = shapes[mask]
    dist = np.sqrt(((cand_shapes - query_shape[None, :]) ** 2).sum(axis=1))
    order = np.argsort(dist)

    chosen_idx: list[int] = []
    chosen_dist: list[float] = []
    for o in order:
        bar = int(cand_idx[o])
        if any(abs(bar - b) < min_gap_bars for b in chosen_idx):
            continue
        chosen_idx.append(bar)
        chosen_dist.append(float(dist[o]))
        if len(chosen_idx) >= k:
            break
    return np.array(chosen_idx, dtype=np.int64), np.array(chosen_dist)
