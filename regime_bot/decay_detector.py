"""
Trailing Regime Decay Detector.

Maintains a rolling window of RegimeSnapshots and computes a 0–1 decay
score each bar.  Score near 0 = regime is strong and building.
Score near 1 = regime is collapsing — exit soon.

Three components, each 0–1:
  conf_decay  — confidence trending downward (slope of conf over window)
  volz_decay  — vol_z trending upward toward 0 / positive (friction returning)
  rl_stall    — run_length not extending (regime losing momentum)

A regime flip inside the window (mixed regimes) returns a high score
immediately rather than waiting for the slope math to catch up.
"""

import math
import logging
from collections import deque
from typing import Optional

import config
from regime_engine import RegimeSnapshot

log = logging.getLogger(__name__)


def _ols_slope(values: list[float]) -> float:
    """Ordinary least-squares slope of y=values over x=0..n-1."""
    n = len(values)
    if n < 2:
        return 0.0
    x_mean = (n - 1) / 2.0
    y_mean = sum(values) / n
    sXY    = sum((i - x_mean) * (v - y_mean) for i, v in enumerate(values))
    sX2    = sum((i - x_mean) ** 2 for i in range(n))
    return sXY / sX2 if sX2 > 0 else 0.0


def _soft_clamp(slope: float, scale: float) -> float:
    """Normalise slope to [-1, +1] via soft clamping: tanh-like."""
    if scale == 0:
        return 0.0
    return max(-1.0, min(1.0, slope / scale))


class DecayDetector:
    """
    Call push(snap) once per bar, then score() for the current decay level.
    summary() gives the per-component breakdown for logging.
    """

    # Slope scale factors — tuned for 1m bars where conf moves in small steps
    _CONF_SCALE  = 0.003   # per-bar conf drift that maps to decay=1
    _VOLZ_SCALE  = 0.04    # per-bar vol_z rise that maps to decay=1

    def __init__(self):
        self._window: deque[RegimeSnapshot] = deque(maxlen=config.DECAY_WINDOW)

    def push(self, snap: RegimeSnapshot) -> None:
        self._window.append(snap)

    def score(self) -> float:
        """Returns decay score 0.0 (strong) → 1.0 (decayed)."""
        w = list(self._window)
        if len(w) < 3:
            return 0.0

        regimes = {s.regime for s in w}
        if len(regimes) > 1:
            # Mixed-regime window — transition already happening
            return 0.90

        confs = [s.conf    for s in w]
        vzs   = [s.vol_z   for s in w]
        rls   = [s.run_length for s in w]

        # 1. Confidence slope — negative = declining = decay
        conf_slope  = _ols_slope(confs)
        conf_decay  = max(0.0, _soft_clamp(-conf_slope, self._CONF_SCALE))

        # 2. vol_z slope — positive = vol returning = friction
        volz_slope  = _ols_slope(vzs)
        volz_decay  = max(0.0, _soft_clamp(volz_slope, self._VOLZ_SCALE))

        # 3. Run-length stall — fraction of window where rl did NOT increase
        rl_increases = sum(1 for i in range(1, len(rls)) if rls[i] > rls[i - 1])
        rl_stall     = 1.0 - rl_increases / max(1, len(rls) - 1)

        score = (
            conf_decay * config.DECAY_CONF_WEIGHT +
            volz_decay * config.DECAY_VOL_WEIGHT  +
            rl_stall   * config.DECAY_RL_WEIGHT
        )
        return round(min(1.0, max(0.0, score)), 3)

    def summary(self) -> dict:
        """Component breakdown for diagnostic logging."""
        w = list(self._window)
        if len(w) < 3:
            return {}
        regimes = {s.regime for s in w}
        if len(regimes) > 1:
            return {'mixed_regimes': list(regimes)}

        confs = [s.conf    for s in w]
        vzs   = [s.vol_z   for s in w]
        rls   = [s.run_length for s in w]

        conf_slope   = _ols_slope(confs)
        volz_slope   = _ols_slope(vzs)
        conf_decay   = max(0.0, _soft_clamp(-conf_slope, self._CONF_SCALE))
        volz_decay   = max(0.0, _soft_clamp(volz_slope,  self._VOLZ_SCALE))
        rl_inc       = sum(1 for i in range(1, len(rls)) if rls[i] > rls[i - 1])
        rl_stall     = 1.0 - rl_inc / max(1, len(rls) - 1)

        return {
            'conf_decay':  round(conf_decay,  3),
            'volz_decay':  round(volz_decay,  3),
            'rl_stall':    round(rl_stall,    3),
            'conf_slope':  round(conf_slope,  5),
            'volz_slope':  round(volz_slope,  4),
            'window_size': len(w),
        }
