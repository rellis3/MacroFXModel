"""
GlobalLiquidity — vol-targeted position sizer.

Sizing IS the alpha. These frameworks are usually right on direction and broke
on size. The book weights from the ranker are gross-normalised to 1; this module
turns them into actual exposure by scaling so the *portfolio* hits a target
annualised volatility, then:

  * scales gross by regime conviction (strong impulse+growth -> more gross), and
  * applies the risk-gate multiplier (cut hard on credit/vol stress),
  * caps leverage and floors conviction so the book is never accidentally flat
    (unless the gate explicitly says go to cash).

The realised-vol estimate is causal (trailing window), so the leverage applied
at week i uses only data through i-1.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from . import config, mathx


@dataclass
class SizedBook:
    dates: list[str]
    pairs: list[str]
    weights: np.ndarray     # [n_weeks, n_pairs] final exposure (post vol-target)
    gross: np.ndarray       # [n_weeks] gross leverage applied
    realised_vol: np.ndarray


def size_book(ranker, regime, fx_returns: dict[str, np.ndarray]) -> SizedBook:
    pairs = ranker.pairs
    n, m = len(ranker.dates), len(pairs)

    # Returns matrix aligned to pairs.
    R = np.zeros((n, m))
    for j, p in enumerate(pairs):
        r = fx_returns.get(p)
        if r is not None:
            R[:, j] = np.nan_to_num(r[:n] if len(r) >= n else np.pad(r, (0, n - len(r))))

    base_w = ranker.weights
    # Gross-1 book's *realised* weekly return (using prior week's weights to
    # avoid lookahead): pnl_i = sum_j w_{i-1,j} * R_{i,j}
    book_ret = np.zeros(n)
    for i in range(1, n):
        book_ret[i] = float(np.dot(base_w[i - 1], R[i]))

    lookback = config.SIZER["vol_lookback_weeks"]
    target = config.SIZER["target_vol_annual"]
    max_gross = config.SIZER["max_gross"]
    floor = config.SIZER["conviction_floor"]

    realised_vol = np.full(n, np.nan)
    gross = np.zeros(n)
    weights = np.zeros((n, m))

    for i in range(n):
        lo = max(0, i - lookback)
        seg = book_ret[lo:i]            # strictly past
        seg = seg[seg != 0]
        if seg.size >= 8:
            wk_vol = seg.std(ddof=1)
            ann_vol = wk_vol * np.sqrt(52)
            realised_vol[i] = ann_vol
            vol_scale = target / ann_vol if ann_vol > 1e-6 else 0.0
        else:
            vol_scale = 1.0

        conv = max(floor, regime.conviction[i])
        g = vol_scale * conv * regime.gross_mult[i]
        g = float(np.clip(g, 0.0, max_gross))
        gross[i] = g
        weights[i] = base_w[i] * g

    return SizedBook(dates=ranker.dates, pairs=pairs, weights=weights,
                     gross=gross, realised_vol=realised_vol)
