"""pattern_lifecycle — the shared formation-quality / acceptance scoring layer
every chart-pattern detector plugs into, regenerated (not ported —
PYTHON_LEGO.md's rule) from `js/patternEngine.js`'s `computeAcceptance` +
`computeConfidence`, using that algorithm as the validated spec.

This is the "was the shape tracking standard geometry, or did it deviate"
layer the owner's full shape-prediction ask calls for — built ONCE here as a
Tier-1 brick so every current AND future detector (touches, flags/pennants,
head & shoulders, triangles/wedges/channels) gets it for free instead of
each carrying its own copy (the exact "bit-identical port" drift CLAUDE.md
exists to prevent).

Contract: pure functions over a detector instance's own already-computed
geometry (`raw_scores`, `start_idx`, `confirm_idx`, `direction`,
`breakout_level`) plus two ATR series (fast + a slower one) — no detector-
specific knowledge, no I/O. `raw_scores` is a 3-key dict
(`impulse_quality`/`shape_quality`/`retracement_quality`, each 0-1) that
EVERY detector already computes internally in its own geometry-specific
way (e.g. flags/pennants: pole cleanliness + total touches beyond the 4
anchors + how centred the retracement is in its healthy band; touches:
retrace depth + touch-price spread + gap evenness between touches) — this
module doesn't recompute those, it composes them with the two checks that
apply identically to ANY shape:

- `compute_acceptance` — after a confirmed breakout, does price actually
  STAY beyond the breakout level for a few bars, or immediately snap back
  in (a classic false-breakout tell, especially on noisy lower timeframes
  where one bar closing through is easy to fake)?
- `compute_confidence` — a 0-100 score blending the detector's own 3 raw
  sub-scores with two shape-agnostic checks computed here: volatility
  COMPRESSION during formation (ATR at the shape's start vs a slower ATR —
  every reference pattern in a textbook shows the volatility drying up
  before it forms) and breakout STRENGTH (how many ATRs through the line
  the confirming close travelled). Acceptance folds in last. Trend
  alignment is deliberately kept OUT of this number (own- and higher-
  timeframe context are separate questions from "is this a well-formed
  shape") — same design reasoning as the JS original, not simplified away.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

CONFIDENCE_WEIGHTS = {
    "impulse_quality": 20, "shape_quality": 20, "retracement_quality": 15,
    "vol_compression": 15, "breakout_strength": 15, "acceptance": 15,
}


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


@dataclass
class Acceptance:
    checked: int
    held: int
    hold_frac: float
    accepted: bool


def compute_acceptance(bars: pd.DataFrame, confirm_idx: int, breakout_level: float, direction: int, *,
                       accept_bars: int = 3, min_hold_frac: float = 0.66) -> Acceptance:
    """direction: +1 up, -1 down (this repo's convention throughout, vs the
    JS original's 'up'/'down' strings)."""
    close = bars["close"].to_numpy()
    n = len(bars)
    last_idx = min(n - 1, confirm_idx + accept_bars)
    held = checked = 0
    for k in range(confirm_idx + 1, last_idx + 1):
        checked += 1
        holds = close[k] >= breakout_level if direction == 1 else close[k] <= breakout_level
        if holds:
            held += 1
    hold_frac = held / checked if checked else 0.0
    return Acceptance(checked=checked, held=held, hold_frac=round(hold_frac, 4),
                      accepted=checked > 0 and hold_frac >= min_hold_frac)


@dataclass
class Confidence:
    total: int
    sub: dict[str, float]


def compute_confidence(raw_scores: dict[str, float], bars: pd.DataFrame,
                       atr_arr: np.ndarray, atr_slow_arr: np.ndarray,
                       start_idx: int, confirm_idx: int, breakout_level: float | None,
                       acceptance: Acceptance | None) -> Confidence:
    close = bars["close"].to_numpy()

    slow_at_start = atr_slow_arr[start_idx] if start_idx < len(atr_slow_arr) else 0.0
    if not slow_at_start:
        slow_at_start = atr_slow_arr[0] if len(atr_slow_arr) else 0.0
    fast_at_start = atr_arr[start_idx] if start_idx < len(atr_arr) else (atr_arr[0] if len(atr_arr) else 0.0)
    vol_ratio = (fast_at_start / slow_at_start) if slow_at_start > 0 else 1.0
    vol_compression = _clamp01(1 - abs(vol_ratio - 0.6) / 0.6)

    local_atr = atr_arr[confirm_idx] if confirm_idx < len(atr_arr) else (atr_arr[-1] if len(atr_arr) else 1.0)
    if not local_atr:
        local_atr = 1.0
    breakout_distance = abs(close[confirm_idx] - breakout_level) / local_atr if breakout_level is not None else 0.0
    breakout_strength = _clamp01(breakout_distance / 0.75)

    acceptance_score = acceptance.hold_frac if acceptance is not None else 0.0

    sub = {
        "impulse_quality": _clamp01(raw_scores.get("impulse_quality", 0.5)),
        "shape_quality": _clamp01(raw_scores.get("shape_quality", 0.5)),
        "retracement_quality": _clamp01(raw_scores.get("retracement_quality", 0.5)),
        "vol_compression": vol_compression, "breakout_strength": breakout_strength,
        "acceptance": acceptance_score,
    }
    score = sum(sub[k] * w for k, w in CONFIDENCE_WEIGHTS.items())
    return Confidence(total=round(score), sub={k: round(v, 4) for k, v in sub.items()})
