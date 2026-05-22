"""
Config loading — reads configs/active.json and deep-merges with defaults.
"""
import json
import os

DEFAULTS = {
    # Entry levels
    "method":            "asia",          # asia | monday | both
    "confTolPips":       2.0,             # confluence tolerance pips
    "signalFilter":      "all_conf",      # all_conf | tight_only | all_levels
    "priceMode":         "lowest",        # midpoint | lowest | highest
    "clusterMerge":      True,

    # Entry timing & proximity
    "entryWindow":       800,             # HHMM London: no entries before this
    "eodExit":           2100,            # HHMM London: close all / no new entries
    "entryProximityATR": 0.5,             # feature scan triggers when price within this × asiaRange of level
    "entryTolPips":      3.0,             # actual order fires only when price within this many pips of level

    # Entry quality filters
    "minConviction":     0.20,            # 0-1 conviction threshold
    "minConfirms":       3,               # min features voting in direction
    "levelReentry":      2,               # max re-entries per level per day

    "requireSweep":      False,
    "sweepPips":         2,
    "secondTouchOnly":   False,
    "candleConfirmN":    0,
    "candleConfirmPct":  0.6,
    "rejectionBar":      False,
    "rejWickPct":        0.40,
    "rejMinAtrPct":      0.30,
    "useM1Features":     True,

    # SL
    "slMode":            "atr30m",        # range | atr | atr30m
    "slFraction":        0.35,            # range × this fraction
    "slMult":            1.5,             # ATR × this multiplier
    "minSlPips":         5,
    "atrPeriod":         14,

    # TP
    "tpMode":            "fixedR",        # fixedR | structural | volScaledR
    "rrRatio":           2.2,
    "maxRR":             4.0,             # hard ceiling on TP distance regardless of mode
    "tpBuf":             5,               # pips buffer from structural level
    "tpAtrFallback":     5,               # ATR multiplier if structural fails
    "tpVolLo":           2.0,
    "tpVolMed":          3.0,
    "tpVolHi":           5.0,

    # Trade management
    "reEnterTp":         True,
    "flipOnSL":          True,
    "tradeCooldownMins": 10,             # minutes to block new entries after a trade closes

    # SL → Breakeven
    "slToBePct":         0.0,           # 0=disabled; e.g. 0.5 moves SL to BE when 50% to TP
    "slBeBuffer":        1.0,           # pips above/below entry for the new SL

    # Server regime veto (1m HMM from Railway /api/hmm5m)
    "useServerRegime":       False,     # enable 1m HMM quality gate
    "regimeVetoConfidence":  70,        # min confidence % to trigger veto

    # Kill switches (in R units, 0 = disabled)
    "killDaily":         2.0,
    "killWeekly":        5.0,
    "killMonthly":       10.0,

    # Poll interval
    "pollInterval":      2,             # seconds between price checks

    # Position sizing
    "posMode":           "risk_pct",
    "fixedSize":         10,              # £/pip in fixed mode
    "riskPct":           1.0,            # % of balance per trade

    # Enabled pairs
    "enabledPairs": ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "XAUUSD","USTECH100M"],

    # Feature flags — all off by default; set in configs/active.json
    "features": {
        "rangePosition": {"enabled": False, "weight": 1, "label": "Range Position"},
        "chochBos":      {"enabled": False, "weight": 2, "label": "CHoCH / BOS"},
        "wickRejection": {"enabled": False, "weight": 1, "label": "Wick Rejection"},
        "rsiDivergence": {"enabled": False, "weight": 1, "label": "RSI Divergence"},
        "orderBlock":    {"enabled": False, "weight": 1, "label": "Order Block"},
        "htfEma":        {"enabled": False, "weight": 1, "label": "HTF EMA 21/50"},
        "vwapSlope":     {"enabled": False, "weight": 1, "label": "TWAP Slope"},
        "adxFilter":     {"enabled": False, "weight": 1, "label": "ADX Filter"},
        "hurstRegime":   {"enabled": False, "weight": 1, "label": "Hurst Regime"},
        "fvgBias":       {"enabled": False, "weight": 1, "label": "FVG Bias"},
        "weeklyPivot":   {"enabled": False, "weight": 1, "label": "Weekly Pivot"},
        "ichimokuCloud": {"enabled": False, "weight": 1, "label": "Ichimoku Cloud"},
        "macdSignal":    {"enabled": False, "weight": 1, "label": "MACD (12/26/9)"},
    },
}


def _deep_merge(base: dict, override: dict) -> dict:
    result = dict(base)
    for k, v in override.items():
        if k in result and isinstance(result[k], dict) and isinstance(v, dict):
            result[k] = _deep_merge(result[k], v)
        else:
            result[k] = v
    return result


def load_config(path: str = None) -> dict:
    if path is None:
        path = os.path.join(os.path.dirname(__file__), 'configs', 'active.json')
    if not os.path.exists(path):
        import logging
        logging.getLogger(__name__).warning(
            f'Config file not found: {path} — using built-in defaults. '
            f'Full config will be loaded from dashboard KV (backtestsystem_live_config).'
        )
        return dict(DEFAULTS)
    with open(path, encoding='utf-8') as f:
        user = json.load(f)
    return _deep_merge(DEFAULTS, user)


def sl_distance(cfg: dict, atr_5m: float, atr_30m: float,
                asia_range: float, pip: float) -> float:
    """Compute SL distance in price units from config mode."""
    mode = cfg.get('slMode', 'range')
    mult = cfg.get('slMult', 1.5)
    frac = cfg.get('slFraction', 0.35)
    min_sl = cfg.get('minSlPips', 5) * pip

    if mode == 'atr':
        dist = atr_5m * mult
    elif mode == 'atr30m':
        dist = atr_30m * mult
    else:  # range
        dist = asia_range * frac

    return max(dist, min_sl)


def tp_distance(cfg: dict, sl_dist: float, pip: float, asia_range: float,
                next_level_dist: float | None = None) -> float:
    """Compute TP distance in price units."""
    mode   = cfg.get('tpMode', 'fixedR')
    rr     = cfg.get('rrRatio', 2.2)
    max_rr = cfg.get('maxRR',   4.0)

    if mode == 'fixedR':
        dist = sl_dist * rr

    elif mode == 'structural' and next_level_dist is not None:
        buf  = cfg.get('tpBuf', 5) * pip
        dist = next_level_dist - buf
        if dist <= sl_dist * 0.5:
            dist = sl_dist * cfg.get('tpAtrFallback', 5)

    elif mode == 'volScaledR':
        range_pips = asia_range / pip
        if range_pips < 25:
            mult = cfg.get('tpVolLo', 2.0)
        elif range_pips < 50:
            mult = cfg.get('tpVolMed', 3.0)
        else:
            mult = cfg.get('tpVolHi', 5.0)
        dist = sl_dist * mult

    else:
        dist = sl_dist * rr  # fallback

    return min(dist, sl_dist * max_rr)
