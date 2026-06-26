"""
GlobalLiquidity — cross-sectional FX liquidity-impulse ranker.

FX is the cleanest expression of liquidity *divergence*: you trade one country's
money conditions against another's. Each pair is scored by

    spread = impulse(base_ccy) - impulse(quote_ccy)

where a currency's impulse is either its own central-bank liquidity impulse
(from the GLI, for USD/EUR/JPY/GBP/CNY) or, for currencies without a dedicated
block (AUD/NZD/CAD/CHF/XAU), its beta to the *global* impulse.

Each week we go long the top-N pairs and short the bottom-N by spread, equal
risk-weighted, with a hysteresis buffer so a pair must clear the entry
threshold by a margin before it swaps in/out — this is what throttles turnover
to the ~1-3 trades/week the system is designed for.

The regime `risk_tilt` adds a directional lean on top of the market-neutral
cross-section, so in REFLATION the book leans net-long risk currencies and in
DEFLATION it leans net-long funders/USD.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from . import config
from .data import _split_pair


@dataclass
class RankerResult:
    dates: list[str]
    pairs: list[str]
    weights: np.ndarray          # [n_weeks, n_pairs], signed, gross-normalised
    spread_z: np.ndarray         # [n_weeks, n_pairs] the ranking score
    turnover: np.ndarray         # [n_weeks] sum |dw| (trade activity proxy)

    def latest_book(self) -> list[tuple[str, float]]:
        i = len(self.dates) - 1
        w = self.weights[i]
        book = [(self.pairs[j], float(w[j])) for j in range(len(self.pairs)) if abs(w[j]) > 1e-6]
        return sorted(book, key=lambda x: -abs(x[1]))


def _currency_impulse(gli, regime, ccy: str, i: int) -> float:
    """Impulse for one currency at week i."""
    if ccy in gli.per_ccy_impulse:
        v = gli.per_ccy_impulse[ccy][i]
        return 0.0 if np.isnan(v) else float(v)
    # No dedicated block: proxy via beta to global impulse.
    beta = config.CCY_BETA_TO_GLI.get(ccy, 0.0)
    gi = gli.gli_impulse[i]
    gi = 0.0 if np.isnan(gi) else float(gi)
    return beta * gi


def build_book(gli, regime) -> RankerResult:
    pairs = config.FX_PAIRS
    n, m = len(gli.dates), len(pairs)
    spread = np.zeros((n, m))

    for i in range(n):
        for j, pair in enumerate(pairs):
            base, quote = _split_pair(pair)
            spread[i, j] = (_currency_impulse(gli, regime, base, i)
                            - _currency_impulse(gli, regime, quote, i))

    long_n = config.RANKER["long_n"]
    short_n = config.RANKER["short_n"]
    buf = config.RANKER["entry_buffer"]

    weights = np.zeros((n, m))
    turnover = np.zeros(n)
    prev = np.zeros(m)

    for i in range(n):
        s = spread[i]
        order = np.argsort(-s)          # high spread -> long
        longs = set(order[:long_n].tolist())
        shorts = set(order[-short_n:].tolist())

        target = np.zeros(m)
        for j in range(m):
            if j in longs:
                target[j] = 1.0
            elif j in shorts:
                target[j] = -1.0

        # Hysteresis: keep an existing position unless the spread has decayed
        # past the buffer, to avoid churning on rank wobble.
        for j in range(m):
            if prev[j] > 0 and target[j] <= 0:
                # was long; stay long if still comfortably above median
                if s[j] >= np.median(s) + buf:
                    target[j] = 1.0
            elif prev[j] < 0 and target[j] >= 0:
                if s[j] <= np.median(s) - buf:
                    target[j] = -1.0

        # Directional lean from regime: scale longs/shorts toward the risk tilt.
        tilt = regime.risk_tilt[i]
        lean = np.where(target > 0, 1.0 + 0.5 * tilt, target)
        lean = np.where(target < 0, -(1.0 - 0.5 * tilt), lean)
        target = np.where(target != 0, lean, 0.0)

        gross = np.abs(target).sum()
        if gross > 1e-9:
            target = target / gross    # gross-normalise to 1 (sizer scales later)

        weights[i] = target
        turnover[i] = np.abs(target - prev).sum()
        prev = target

    return RankerResult(dates=gli.dates, pairs=pairs, weights=weights,
                        spread_z=spread, turnover=turnover)
