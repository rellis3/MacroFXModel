"""sizing — position sizing primitive (risk% → lots).

The pure math behind "how many lots", lifted from the bots so the formula has
ONE definition instead of a copy per bot (regime_bot, RegimeV2, V7, DynAnchor
all carry their own). Pure: no globals, no MT5, no pip-table lookup — the caller
passes pip and pip_value (resolve those via pylego.instruments /
pylego.point_values). Fully unit-testable offline.

    from pylego.sizing import position_size
    from pylego.instruments import pip_size
    from pylego.point_values import point_value
    lots = position_size(balance, risk_pct, sl_dist,
                         pip=pip_size(pair), pip_value=point_value(pair),
                         max_lot=cfg['max_lot'], decay_score=decay)
"""
from __future__ import annotations


def position_size(
    balance: float,
    risk_pct: float,
    sl_dist: float,
    pip: float,
    pip_value: float,
    max_lot: float,
    decay_score: float = 0.0,
) -> float:
    """Risk-based lot size.

    risk_amt = balance × risk_pct%; lots = risk_amt / (sl_pips × pip_value),
    then discounted linearly by decay_score and clamped to [0.01, max_lot].

    Byte-identical to bot/regime_bot.py's former position_size() math (the only
    change is pip/pip_value are passed in instead of looked up from module
    globals). Returns the 0.01 floor on a non-positive stop or pip_value.
    """
    sl_pips = sl_dist / pip
    risk_amt = balance * (risk_pct / 100)
    if sl_pips <= 0 or pip_value <= 0:
        return 0.01
    raw_lots = risk_amt / (sl_pips * pip_value)
    # Decay discount: lots shrink linearly as decay approaches 1.
    lots = raw_lots * (1.0 - decay_score)
    return float(max(0.01, min(round(lots, 2), float(max_lot))))
