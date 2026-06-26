"""
GlobalLiquidity — regime classifier + risk gate.

Liquidity tells you *when* (fuel). Regime tells you *what* (which engine).
Four states from the 2x2 of liquidity impulse x growth direction:

                 Liquidity Impulse
                 RISING            FALLING
  Growth UP   │  REFLATION      │  GOLDILOCKS_LATE
  Growth DOWN │  RECOVERY       │  DEFLATION

Overlaid is the Macro Alf RISK GATE: when credit spreads blow out or vol spikes
(z over threshold), gross is cut regardless of how bullish liquidity looks.
That overlay is what survives 2008/2020/2022.

Each regime carries a directional "tilt" toward risk (long-risk vs long-USD/
funders) and a vol stance, consumed by the ranker/sizer.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from . import config, mathx

REFLATION = "REFLATION"
RECOVERY = "RECOVERY"
GOLDILOCKS_LATE = "GOLDILOCKS_LATE"
DEFLATION = "DEFLATION"

# Per-regime risk tilt in [-1, +1]: +1 = max long-risk (sell USD/funders, buy
# pro-cyclical), -1 = max risk-off (long USD/JPY/CHF/gold). Vol stance is a hint.
REGIME_PROFILE = {
    REFLATION:       {"risk_tilt": 1.0,  "vol": "short_vol/carry"},
    RECOVERY:        {"risk_tilt": 0.5,  "vol": "neutral"},
    GOLDILOCKS_LATE: {"risk_tilt": 0.0,  "vol": "buy_convexity"},
    DEFLATION:       {"risk_tilt": -1.0, "vol": "long_vol"},
}


@dataclass
class RegimeResult:
    dates: list[str]
    regime: list[str]              # state per week
    risk_tilt: np.ndarray         # -1..+1, regime direction
    conviction: np.ndarray        # 0..1, |impulse|*|growth| strength
    gate_tripped: np.ndarray      # bool, risk gate active
    gross_mult: np.ndarray        # multiplier from the gate (gross_cut..1)
    growth_z: np.ndarray
    credit_z: np.ndarray
    vol_z: np.ndarray

    def latest(self) -> dict:
        i = len(self.dates) - 1
        return {
            "date": self.dates[i],
            "regime": self.regime[i],
            "risk_tilt": round(float(self.risk_tilt[i]), 3),
            "conviction": round(float(self.conviction[i]), 3),
            "gate_tripped": bool(self.gate_tripped[i]),
            "gross_mult": round(float(self.gross_mult[i]), 3),
        }


def _growth_nowcast(ds) -> np.ndarray:
    """Growth direction z. Prefer ISM/PMI (already a diffusion index); fall back
    to YoY of INDPRO."""
    z, mp = config.Z_WINDOW_WEEKS, config.MIN_Z_WEEKS
    pmi = ds.get(config.REGIME_INPUTS["growth_alt"])
    if pmi is not None and np.isfinite(pmi).sum() > config.MIN_Z_WEEKS:
        g = mathx.lag(mathx.ffill(pmi), config.PUB_LAG_WEEKS["growth"])
        # PMI already centred ~50; z-score its level and add its momentum.
        return mathx.rolling_z(g, z, mp) + 0.5 * mathx.rolling_z(mathx.roc(g, 8), z, mp)
    indpro = mathx.ffill(ds.get(config.REGIME_INPUTS["growth"]))
    yoy = mathx.roc(indpro, 52)
    yoy = mathx.lag(yoy, config.PUB_LAG_WEEKS["growth"])
    return mathx.rolling_z(yoy, z, mp)


def classify(ds, gli) -> RegimeResult:
    z, mp = config.Z_WINDOW_WEEKS, config.MIN_Z_WEEKS

    impulse = gli.gli_impulse
    growth_z = _growth_nowcast(ds)

    credit = mathx.lag(mathx.ffill(ds.get(config.RISK_GATE["credit"])),
                       config.PUB_LAG_WEEKS["credit"])
    credit_z = mathx.rolling_z(credit, z, mp)
    vol = mathx.lag(mathx.ffill(ds.get(config.RISK_GATE["vol"])),
                    config.PUB_LAG_WEEKS["vol"])
    vol_z = mathx.rolling_z(vol, z, mp)

    n = ds.n
    regime: list[str] = []
    risk_tilt = np.zeros(n)
    conviction = np.zeros(n)
    gate = np.zeros(n, dtype=bool)
    gross_mult = np.ones(n)

    for i in range(n):
        imp = impulse[i] if not np.isnan(impulse[i]) else 0.0
        g = growth_z[i] if not np.isnan(growth_z[i]) else 0.0

        if imp >= 0 and g >= 0:
            st = REFLATION
        elif imp >= 0 and g < 0:
            st = RECOVERY
        elif imp < 0 and g >= 0:
            st = GOLDILOCKS_LATE
        else:
            st = DEFLATION
        regime.append(st)

        risk_tilt[i] = REGIME_PROFILE[st]["risk_tilt"]
        conviction[i] = float(np.tanh(abs(imp)) * (0.5 + 0.5 * np.tanh(abs(g))))

        cz = credit_z[i] if not np.isnan(credit_z[i]) else 0.0
        vz = vol_z[i] if not np.isnan(vol_z[i]) else 0.0
        tripped = (cz > config.RISK_GATE["credit_z"]) or (vz > config.RISK_GATE["vol_z"])
        gate[i] = tripped
        if tripped:
            gross_mult[i] = config.RISK_GATE["gross_cut"]
            # A tripped gate forces a risk-off lean even if quadrant disagrees.
            risk_tilt[i] = min(risk_tilt[i], -0.5)

    return RegimeResult(
        dates=ds.dates, regime=regime, risk_tilt=risk_tilt, conviction=conviction,
        gate_tripped=gate, gross_mult=gross_mult,
        growth_z=growth_z, credit_z=credit_z, vol_z=vol_z,
    )
