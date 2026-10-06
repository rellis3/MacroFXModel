"""Layer 7 sizing rule (compliance action A4; plans/SIZING_RULE.md).

Lesson 3 §03: "a portfolio sized on volatility alone understates the loss it can suffer in a single step; one that
recognises the jump component sizes for both." The stop-risk map (forge/STOP_RISK_PREREG.md, stop-risk.json) gives,
per stop distance and condition, the loss actually taken when a stop is hit. This module turns that into a size.

    loss_given_stop(d_sigma, cls, weekend, release_minute, overnight, tier1, q="p99")   in R (1.0 = a clean stop)
    position_units(risk_cash, entry, stop, **conditions)                             size so a stop costs ≤ risk_cash
    vol_target_weight(sigma_d, sigma_median, cap=2.0)                                σ-targeted exposure (VOL_TARGET)

Conditions combine conservatively: the largest p99 of the applicable cells (they overlap, so this is an upper bound,
not a product). Stop distances between the mapped ones (0.25, 0.5, 1, 1.5, 2 σ) use the nearest mapped distance at or
below — tighter stops gap worse, so rounding down is the cautious side.
"""
import json
from pathlib import Path

_MAP = json.loads(Path(__file__).resolve().parent.parent.joinpath("stop-risk.json").read_text())
_CELLS = {(c["d"], c["var"], c["bucket"]): c for c in _MAP["cells"]}
_DS = sorted({c["d"] for c in _MAP["cells"]})


def _d(d_sigma: float) -> float:
    below = [d for d in _DS if d <= d_sigma + 1e-9]
    return below[-1] if below else _DS[0]


def loss_given_stop(d_sigma: float, cls: str = "major", weekend: bool = False, release_minute: bool = False,
                    overnight: bool = False, tier1: bool = False, q: str = "p99") -> float:
    """Loss in R when the stop is hit, for the worst applicable condition. q = 'p99' (sizing) or 'mean' (expectancy)."""
    d = _d(d_sigma)
    keys = [("class", cls),
            ("weekend", "crossed a weekend" if weekend else "within the week"),
            ("hit minute", "on :00/:30 (+4 min)" if release_minute else "other minutes"),
            ("hit in", "next session" if overnight else "same session"),
            ("event day", "tier1" if tier1 else "none")]
    vals = [_CELLS[(d, v, b)][q] for v, b in keys if (d, v, b) in _CELLS]
    return float(max(vals + [1.0]))


def position_units(risk_cash: float, entry: float, stop: float, sigma_d: float, **conditions) -> dict:
    """Units such that a stop, filled at its realistic (p99) loss for the conditions, costs at most risk_cash."""
    dist = abs(entry - stop)
    d_sigma = dist / (sigma_d * entry)
    lgs = loss_given_stop(d_sigma, **conditions)
    return {"units": risk_cash / (dist * lgs), "loss_given_stop_R": lgs, "stop_in_sigma": d_sigma,
            "naive_units": risk_cash / dist}


def vol_target_weight(sigma_d: float, sigma_median: float, cap: float = 2.0) -> float:
    """σ-targeted exposure relative to normal size (forge/VOL_TARGET_PREREG.md): median σ ÷ today's σ, capped."""
    return float(min(cap, max(0.0, sigma_median / sigma_d)))


if __name__ == "__main__":
    for cond in ({}, {"weekend": True}, {"release_minute": True}, {"overnight": True}, {"tier1": True}, {"cls": "index"},
                 {"weekend": True, "cls": "index"}):
        print(f"1σ stop {str(cond):40} p99 loss {loss_given_stop(1.0, **cond):.2f}R   mean {loss_given_stop(1.0, q='mean', **cond):.3f}R")
    p = position_units(1000, 1.1000, 1.0960, 0.004, weekend=True)
    print(f"\nexample: risk £1,000, EURUSD 1.1000 stop 1.0960 (σ_d 0.4%) held over a weekend: "
          f"{p['units']:,.0f} units vs {p['naive_units']:,.0f} naive (loss given stop {p['loss_given_stop_R']:.2f}R)")
