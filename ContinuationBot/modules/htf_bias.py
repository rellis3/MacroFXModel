"""
HTF Bias Engine V2 — structure-first Daily + 4H trend direction for XAU/USD.

V1 failure mode (documented in the May–Jul 2026 demo record): the Daily
EMA21/50 cross stays "bullish" for weeks after a top, so the bot kept buying
retraces all the way down a ~12% decline while the counter-trend block
filtered every short. V2 fixes this three ways:

  1. H4 market structure (HH/HL vs LH/LL from confirmed swing pivots) is the
     fastest input — it flips within days, not weeks.
  2. Daily trend requires PRICE to agree (close vs EMA21/EMA50), not just the
     EMAs' relationship to each other.
  3. Daily and 4H disagreement → NEUTRAL (stand down). V1 scored
     "Daily EMA bullish | 4H EMA bearish" as BULL 50% — exactly the regime
     where it caught falling knives.

Output contract matches V1 (HTFBias dataclass) so downstream code is unchanged.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Optional


@dataclass
class HTFBias:
    bias: str              # BULL | BEAR | NEUTRAL
    confidence: float      # 0.0-1.0
    daily_trend: str       # UP | DOWN | FLAT
    h4_trend: str          # UP | DOWN | FLAT  (market structure, not EMA)
    ema21_daily: float
    ema50_daily: float
    last_bos: Optional[str]   # BULLISH_BOS | BEARISH_BOS | None (H4 structure break)
    reason: str


def _ema(values: list[float], period: int) -> list[float]:
    if not values or period <= 0:
        return []
    k = 2.0 / (period + 1)
    result = [values[0]]
    for v in values[1:]:
        result.append(v * k + result[-1] * (1 - k))
    return result


# ── Daily trend: price + EMA alignment ────────────────────────────────────────

def _daily_trend(closes: list[float], fast: int = 21, slow: int = 50
                 ) -> tuple[str, float, float]:
    """
    UP   — close > EMA21 > EMA50 and EMA21 sloping up
    DOWN — close < EMA21 < EMA50 and EMA21 sloping down
    FLAT — anything else (including "EMAs bullish but price below them",
           which is the falling-knife configuration V1 called bullish)
    """
    if len(closes) < slow + 5:
        last = closes[-1] if closes else 0.0
        return 'FLAT', last, last

    ef_series = _ema(closes, fast)
    es_series = _ema(closes, slow)
    ef, es = ef_series[-1], es_series[-1]
    price  = closes[-1]

    sloping_up   = ef_series[-1] > ef_series[-5]
    sloping_down = ef_series[-1] < ef_series[-5]

    if price > ef > es and sloping_up:
        trend = 'UP'
    elif price < ef < es and sloping_down:
        trend = 'DOWN'
    else:
        trend = 'FLAT'

    return trend, round(ef, 2), round(es, 2)


# ── H4 market structure: swing sequence ──────────────────────────────────────

def _find_pivots(bars: list[dict], n: int = 3) -> tuple[list[tuple[int, float]],
                                                        list[tuple[int, float]]]:
    """Confirmed swing highs/lows: n bars each side. Returns (highs, lows)."""
    highs = [b['high'] for b in bars]
    lows  = [b['low']  for b in bars]
    ph: list[tuple[int, float]] = []
    pl: list[tuple[int, float]] = []
    for i in range(n, len(bars) - n):
        if highs[i] >= max(highs[i - n: i + n + 1]):
            ph.append((i, highs[i]))
        if lows[i] <= min(lows[i - n: i + n + 1]):
            pl.append((i, lows[i]))
    return ph, pl


def _h4_structure(h4_bars: list[dict], pivot_n: int = 3) -> tuple[str, Optional[str]]:
    """
    Classify the 4H swing sequence and detect a structure break.

    UP   — last two swing highs rising AND last two swing lows rising
    DOWN — last two swing highs falling AND last two swing lows falling
    FLAT — mixed sequence

    BOS: last close beyond the most recent confirmed swing extreme overrides
    a FLAT/opposing sequence reading (a fresh break is the earliest signal
    that structure has shifted).

    Fallback: a relentless one-way move can form too few confirmed pivots to
    read a sequence at all; price-vs-EMA on the H4 closes breaks that tie so
    a strong trend never reads FLAT for lack of pullbacks.
    """
    closes = [b['close'] for b in h4_bars]

    def _ema_fallback() -> str:
        trend, _, _ = _daily_trend(closes)
        return trend

    if len(h4_bars) < pivot_n * 2 + 10:
        return _ema_fallback(), None

    ph, pl = _find_pivots(h4_bars, pivot_n)
    if len(ph) < 2 or len(pl) < 2:
        return _ema_fallback(), None

    (_, h1), (_, h2) = ph[-2], ph[-1]   # h2 more recent
    (_, l1), (_, l2) = pl[-2], pl[-1]

    if h2 > h1 and l2 > l1:
        struct = 'UP'
    elif h2 < h1 and l2 < l1:
        struct = 'DOWN'
    else:
        struct = 'FLAT'

    last_close = h4_bars[-1]['close']
    bos: Optional[str] = None
    if last_close > h2 * 1.0005:
        bos = 'BULLISH_BOS'
    elif last_close < l2 * 0.9995:
        bos = 'BEARISH_BOS'

    # A fresh break against the sequence reading takes precedence
    if bos == 'BULLISH_BOS' and struct != 'UP':
        struct = 'UP'
    elif bos == 'BEARISH_BOS' and struct != 'DOWN':
        struct = 'DOWN'

    return struct, bos


# ── Combined bias ─────────────────────────────────────────────────────────────

def compute_htf_bias(daily_bars: list[dict], h4_bars: list[dict]) -> HTFBias:
    """
    daily_bars / h4_bars: chronological lists of dicts with open/high/low/close.

    Agreement table (daily price+EMA trend vs H4 market structure):
      daily UP   + h4 UP    → BULL  0.9
      daily UP   + h4 FLAT  → BULL  0.55
      daily FLAT + h4 UP    → BULL  0.45   (structure leads, daily undecided)
      daily UP   + h4 DOWN  → NEUTRAL 0.3  (disagreement — stand down)
      (mirror for BEAR; both FLAT → NEUTRAL 0.3)
    """
    d_closes = [b['close'] for b in daily_bars]

    daily_trend, ema21, ema50 = _daily_trend(d_closes)
    h4_trend, h4_bos          = _h4_structure(h4_bars)

    reasons: list[str] = []
    if daily_trend != 'FLAT':
        reasons.append(f'Daily price+EMA {daily_trend}')
    if h4_trend != 'FLAT':
        reasons.append(f'4H structure {h4_trend}')
    if h4_bos:
        reasons.append(f'4H {h4_bos}')

    def _same(a: str, b: str, d: str) -> bool:
        return a == d and b == d

    if _same(daily_trend, h4_trend, 'UP'):
        bias, conf = 'BULL', 0.9
    elif _same(daily_trend, h4_trend, 'DOWN'):
        bias, conf = 'BEAR', 0.9
    elif daily_trend == 'UP' and h4_trend == 'FLAT':
        bias, conf = 'BULL', 0.55
    elif daily_trend == 'DOWN' and h4_trend == 'FLAT':
        bias, conf = 'BEAR', 0.55
    elif daily_trend == 'FLAT' and h4_trend == 'UP':
        bias, conf = 'BULL', 0.45
    elif daily_trend == 'FLAT' and h4_trend == 'DOWN':
        bias, conf = 'BEAR', 0.45
    else:
        # Disagreement or double-FLAT: stand down.
        bias, conf = 'NEUTRAL', 0.30
        if daily_trend != 'FLAT' and h4_trend != 'FLAT':
            reasons.append('Daily/4H disagree — standing down')

    return HTFBias(
        bias=bias, confidence=round(conf, 2),
        daily_trend=daily_trend, h4_trend=h4_trend,
        ema21_daily=ema21, ema50_daily=ema50,
        last_bos=h4_bos,
        reason=' | '.join(reasons) or 'No clear HTF bias',
    )
