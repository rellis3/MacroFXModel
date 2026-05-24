"""
HTF Bias Engine — Daily and 4H trend direction for XAU/USD.

Combines EMA relationship, slope, and recent Break of Structure to produce
a BULL / BEAR / NEUTRAL directional bias with a 0–1 confidence score.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Optional


@dataclass
class HTFBias:
    bias: str              # BULL | BEAR | NEUTRAL
    confidence: float      # 0.0–1.0
    daily_trend: str       # UP | DOWN | FLAT
    h4_trend: str          # UP | DOWN | FLAT
    ema21_daily: float
    ema50_daily: float
    last_bos: Optional[str]   # BULLISH_BOS | BEARISH_BOS | None
    reason: str


def _ema(values: list[float], period: int) -> list[float]:
    if not values or period <= 0:
        return []
    k = 2.0 / (period + 1)
    result = [values[0]]
    for v in values[1:]:
        result.append(v * k + result[-1] * (1 - k))
    return result


def _detect_trend(closes: list[float], fast: int = 21, slow: int = 50
                  ) -> tuple[str, float, float]:
    """Returns (trend, ema_fast_last, ema_slow_last)."""
    if len(closes) < slow + 5:
        return 'FLAT', closes[-1] if closes else 0.0, closes[-1] if closes else 0.0

    ef_series = _ema(closes, fast)
    es_series = _ema(closes, slow)
    ef, es = ef_series[-1], es_series[-1]

    gap_pct = (ef - es) / es if es else 0.0
    sloping_up   = ef_series[-1] > ef_series[-5]
    sloping_down = ef_series[-1] < ef_series[-5]

    if gap_pct > 0.0005 and sloping_up:
        trend = 'UP'
    elif gap_pct < -0.0005 and sloping_down:
        trend = 'DOWN'
    else:
        trend = 'FLAT'

    return trend, round(ef, 2), round(es, 2)


def _detect_bos(highs: list[float], lows: list[float], closes: list[float],
                lookback: int = 20) -> Optional[str]:
    """Has recent close broken above the last swing high or below the last swing low?"""
    if len(highs) < lookback + 5:
        return None

    swing_high = max(highs[-lookback:-5])
    swing_low  = min(lows[-lookback:-5])
    last_close = closes[-1]

    if last_close > swing_high * 1.001:
        return 'BULLISH_BOS'
    if last_close < swing_low * 0.999:
        return 'BEARISH_BOS'
    return None


def compute_htf_bias(daily_bars: list[dict], h4_bars: list[dict]) -> HTFBias:
    """
    daily_bars / h4_bars: chronological list of dicts with open/high/low/close.
    """
    d_closes = [b['close'] for b in daily_bars]
    d_highs  = [b['high']  for b in daily_bars]
    d_lows   = [b['low']   for b in daily_bars]
    h4_closes = [b['close'] for b in h4_bars]

    daily_trend, ema21, ema50 = _detect_trend(d_closes)
    h4_trend, _, _            = _detect_trend(h4_closes)
    last_bos                  = _detect_bos(d_highs, d_lows, d_closes)

    votes = 0
    reasons: list[str] = []

    if daily_trend == 'UP':
        votes += 2; reasons.append('Daily EMA bullish')
    elif daily_trend == 'DOWN':
        votes -= 2; reasons.append('Daily EMA bearish')

    if h4_trend == 'UP':
        votes += 1; reasons.append('4H EMA bullish')
    elif h4_trend == 'DOWN':
        votes -= 1; reasons.append('4H EMA bearish')

    if last_bos == 'BULLISH_BOS':
        votes += 1; reasons.append('Daily BOS bullish')
    elif last_bos == 'BEARISH_BOS':
        votes -= 1; reasons.append('Daily BOS bearish')

    if votes >= 2:
        bias, confidence = 'BULL', round(min(votes / 4.0, 1.0), 2)
    elif votes <= -2:
        bias, confidence = 'BEAR', round(min(abs(votes) / 4.0, 1.0), 2)
    else:
        bias, confidence = 'NEUTRAL', 0.30

    return HTFBias(
        bias=bias, confidence=confidence,
        daily_trend=daily_trend, h4_trend=h4_trend,
        ema21_daily=ema21, ema50_daily=ema50,
        last_bos=last_bos,
        reason=' | '.join(reasons) or 'No clear HTF bias',
    )
