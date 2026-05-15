"""
Technical indicators computed from MT5 bar data.
All functions accept a numpy structured array as returned by
mt5.copy_rates_from_pos() — fields: time, open, high, low, close, tick_volume.

In paper mode (no MT5) these are never called; the caller falls back to
fixed pip tolerances from config.
"""

from __future__ import annotations


# ── EMA ──────────────────────────────────────────────────────────────────────

def _ema(values: list[float], period: int) -> list[float]:
    if not values or period <= 0:
        return []
    k = 2.0 / (period + 1)
    result = [values[0]]
    for v in values[1:]:
        result.append(v * k + result[-1] * (1 - k))
    return result


def _sma(values: list[float], period: int) -> list[float]:
    out = []
    for i in range(len(values)):
        if i < period - 1:
            out.append(float('nan'))
        else:
            out.append(sum(values[i - period + 1 : i + 1]) / period)
    return out


# ── ATR (EMA smoothed, alpha=0.15 matches vol.js) ────────────────────────────

def compute_atr(bars, period: int = 14) -> float:
    """
    Returns current EMA-ATR value from MT5 bar array.
    Alpha fixed at 0.15 to match the dashboard vol.js calculation.
    """
    if bars is None or len(bars) < 2:
        return 0.0

    alpha = 0.15
    tr = abs(float(bars[1]['high']) - float(bars[1]['low']))  # seed with first real TR
    for i in range(1, len(bars)):
        h = float(bars[i]['high'])
        l = float(bars[i]['low'])
        pc = float(bars[i - 1]['close'])
        true_range = max(h - l, abs(h - pc), abs(l - pc))
        tr = alpha * true_range + (1 - alpha) * tr

    return round(tr, 6)


# ── WaveTrend oscillator (matches divergence.js / backtest-engine.js) ─────────

def compute_wt1(bars, n1: int = 10, n2: int = 21) -> float:
    """
    Returns the latest WT1 value.

    Algorithm (matches dashboard JS):
      hlc3 = (high + low + close) / 3
      esa  = EMA(hlc3, n1)
      d    = EMA(|hlc3 - esa|, n1)
      ci   = (hlc3 - esa) / (0.015 * d)   ← Channel Index
      wt1  = EMA(ci, n2)
    """
    if bars is None or len(bars) < n2 + n1:
        return float('nan')

    closes = [float(b['close']) for b in bars]
    highs  = [float(b['high'])  for b in bars]
    lows   = [float(b['low'])   for b in bars]
    hlc3   = [(h + l + c) / 3 for h, l, c in zip(highs, lows, closes)]

    esa = _ema(hlc3, n1)
    d   = _ema([abs(h - e) for h, e in zip(hlc3, esa)], n1)

    ci = []
    for h, e, dv in zip(hlc3, esa, d):
        ci.append((h - e) / (0.015 * dv) if dv != 0 else 0.0)

    wt1 = _ema(ci, n2)
    return round(wt1[-1], 2) if wt1 else float('nan')


# ── Dynamic proximity tolerance from ATR ─────────────────────────────────────

def atr_to_tol_pips(atr: float, pip_size: float, factor: float = 0.30) -> float:
    """
    Converts EMA-ATR to a proximity tolerance in pips.
    factor=0.30 means tolerance ≈ 30% of the current ATR.

    This makes the tolerance widen on volatile days and tighten on calm ones,
    matching the dynamic `tol` visible in the original bot's log output.
    """
    if pip_size <= 0 or atr <= 0:
        return 8.0  # safe fallback
    return round(atr / pip_size * factor, 2)
