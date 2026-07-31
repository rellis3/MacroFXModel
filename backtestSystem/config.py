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
    # flipOnSL: reversing on a stop-out has no evidence basis and doubles cost
    # drag at failed levels — default OFF (Batch 6). An explicit `true` in
    # active.json / KV config is still honoured (owner opt-in; main.py logs a
    # warning at startup).
    "flipOnSL":          False,
    "tradeCooldownMins": 10,             # minutes to block new entries after a trade closes

    # SL → Breakeven
    "slToBePct":         0.0,           # 0=disabled; e.g. 0.5 moves SL to BE when 50% to TP
    "slBeBuffer":        1.0,           # pips above/below entry for the new SL

    # Chandelier trailing stop (ratcheting exit that locks profit) — OFF by
    # default. Sits ON TOP of SL→BE via the same TRADE_ACTION_SLTP path, and the
    # fixed TP stays as a ceiling. The trail only ever ratchets the stop in the
    # favourable direction (never loosens it) so it can only lock MORE profit —
    # this is the "ran +Nk, never hit the far TP, round-tripped back" fix. Not an
    # edge source; pure exit management (let winners run, don't give it all back).
    "chandelierEnabled":     False,     # master toggle
    "chandelierAtrMult":     3.0,       # trail width behind the peak, in 30m-ATR units
    "chandelierActivateAtr": 1.0,       # start trailing once profit ≥ this × ATR (~0.7R at slMult 1.5)

    # Server regime veto (1m HMM from Railway /api/hmm5m)
    "useServerRegime":       False,     # enable 1m HMM quality gate
    "regimeVetoConfidence":  70,        # min confidence % to trigger veto

    # Kill switches (0 = disabled). NOTE: these were INEFFECTIVE until the switch
    # was made restart-persistent (risk.py) — the bot restarts often and the
    # in-memory daily counter zeroed each time, so the worst live day was −18.5R
    # against a 2R limit that never fired. Backtest (analysis/backtest_entry_quality.py)
    # on the live book: a working −3R day-stop halves BOTH total loss and drawdown.
    "killDaily":         3.0,           # max daily R loss (was 2.0; 3.0 tested best on the live book)
    "killWeekly":        5.0,
    "killMonthly":       10.0,
    "killDailyPct":      3.0,           # max daily % account drawdown — the ROBUST guard: read from
                                        # live balance, independent of close-detection (catches SL/TP
                                        # hits the bot never journalled). 0 = off.
    "killDayTrades":     0,             # max trades opened per day (0 = off). Backtested cut: 3/day
                                        # slashed drawdown but is aggressive — opt in and validate OOS.
    "killConsecLosses":  0,             # pause new entries for the rest of the day after N consecutive
                                        # losses (0 = off). Backtested 3 helped; in-sample, tune OOS.

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


def chandelier_stop(is_long: bool, entry: float, peak: float, atr: float,
                    current_sl: float, atr_mult: float,
                    activate_atr: float) -> float | None:
    """ATR chandelier trailing stop for a live position.

    Returns a NEW stop-loss price that ratchets behind the best price reached
    since entry (``peak`` = highest high for a long, lowest low for a short), or
    ``None`` when the trail should not move the stop on this poll.

        trail = peak ∓ atr_mult · atr        (below peak for a long, above for a short)

    Two guards keep it honest:
      * the trail engages only once the trade is ``activate_atr · atr`` in profit
        (so noise near entry can't trip it), and
      * the returned stop is ALWAYS floored at ``current_sl`` — it can only tighten
        in the favourable direction, never loosen.
    Mirrors the ratchet semantics of ``pylego.strategy.rangeline.chandelier_stop``
    (peak ∓ trail-width, clamped to the protect stop) but widths the trail off ATR
    rather than a ladder rung, matching this bot's ATR-based SL math.
    """
    if atr <= 0 or atr_mult <= 0:
        return None
    if is_long:
        if peak - entry < activate_atr * atr:
            return None                        # not enough favourable move yet
        trail = peak - atr_mult * atr
        return trail if trail > current_sl else None
    # short
    if entry - peak < activate_atr * atr:
        return None
    trail = peak + atr_mult * atr
    # A short's SL sits ABOVE price; tighter = lower. current_sl<=0 means unset.
    return trail if (current_sl <= 0 or trail < current_sl) else None
