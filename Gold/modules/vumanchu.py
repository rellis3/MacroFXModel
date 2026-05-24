"""
VuManChu Cipher B — three-component confirmation engine.

Components:
  WT1/WT2     WaveTrend momentum oscillator (matches dashboard divergence.js)
  Money Flow  Volume-weighted directional pressure, scaled –100 to +100
  VWAP        Right-angle departure from consolidation near VWAP

Gold-specific behaviour:
  A money-flow SPIKE as price hits a zone signals EXHAUSTION, not continuation.
  (opposite to Bitcoin — sellers/buyers forced in, then snap-back)

Entry fires only when components_aligned >= min_required (default 2).
Direction alignment is checked against the zone's expected trade direction.
"""

from __future__ import annotations
from dataclasses import dataclass


@dataclass
class VuManChuSignal:
    direction: str           # LONG | SHORT | NEUTRAL
    confidence: str          # HIGH | MEDIUM | LOW
    wt1: float
    wt2: float
    wt_signal: str           # BULLISH | BEARISH | DIVERGENCE_BULL | DIVERGENCE_BEAR | NEUTRAL
    mf_value: float
    mf_signal: str           # BULLISH_EXHAUSTION | BEARISH_EXHAUSTION | BULLISH | BEARISH | NEUTRAL
    vwap_signal: str         # RIGHT_ANGLE_UP | RIGHT_ANGLE_DOWN | AT_VWAP | NEUTRAL
    components_aligned: int  # 0–3
    reason: str


# ── EMA / SMA helpers ────────────────────────────────────────────────────────

def _ema(vals: list[float], period: int) -> list[float]:
    if not vals or period <= 0:
        return []
    k, res = 2.0 / (period + 1), [vals[0]]
    for v in vals[1:]:
        res.append(v * k + res[-1] * (1 - k))
    return res


def _sma(vals: list[float], period: int) -> list[float]:
    out = []
    for i in range(len(vals)):
        if i < period - 1:
            out.append(float('nan'))
        else:
            out.append(sum(vals[i - period + 1: i + 1]) / period)
    return out


# ── WT series ────────────────────────────────────────────────────────────────

def _wt_series(bars: list[dict], n1: int = 10, n2: int = 21
               ) -> tuple[list[float], list[float]]:
    closes = [float(b['close']) for b in bars]
    highs  = [float(b['high'])  for b in bars]
    lows   = [float(b['low'])   for b in bars]
    hlc3   = [(h + l + c) / 3 for h, l, c in zip(highs, lows, closes)]

    esa = _ema(hlc3, n1)
    d   = _ema([abs(h - e) for h, e in zip(hlc3, esa)], n1)
    ci  = [(h - e) / (0.015 * dv) if dv else 0.0
           for h, e, dv in zip(hlc3, esa, d)]

    wt1 = _ema(ci, n2)
    wt2 = _sma(wt1, 4)
    return wt1, wt2


# ── Money flow ───────────────────────────────────────────────────────────────

def _money_flow(bars: list[dict], period: int = 14) -> list[float]:
    """
    Directional volume pressure per bar: (close-open)/(high-low) × volume.
    Smoothed with EMA and normalised to [–100, +100].
    """
    raw = []
    for b in bars:
        rng = b['high'] - b['low'] + 0.001
        raw.append((b['close'] - b['open']) / rng * b.get('tick_volume', 1))

    peak = max(abs(v) for v in raw) if raw else 1.0
    if peak > 0:
        raw = [v / peak * 100 for v in raw]
    return _ema(raw, period)


# ── VWAP right-angle detection ────────────────────────────────────────────────

def _vwap_signal(bars: list[dict], consol_n: int = 10) -> str:
    if len(bars) < consol_n + 3:
        return 'NEUTRAL'

    closes = [b['close'] for b in bars]
    vwap   = sum((b['high'] + b['low'] + b['close']) / 3 * b.get('tick_volume', 1)
                 for b in bars) / max(sum(b.get('tick_volume', 1) for b in bars), 1)

    prior   = closes[-(consol_n + 3):-3]
    near_vw = sum(1 for c in prior if abs(c - vwap) < vwap * 0.002)
    atr_est = sum(abs(b['high'] - b['low']) for b in bars[-10:]) / 10
    move    = closes[-1] - closes[-3]

    if near_vw >= consol_n // 2:
        if move > atr_est * 0.8:
            return 'RIGHT_ANGLE_UP'
        elif move < -atr_est * 0.8:
            return 'RIGHT_ANGLE_DOWN'

    if abs(closes[-1] - vwap) < vwap * 0.001:
        return 'AT_VWAP'
    return 'NEUTRAL'


# ── Divergence ───────────────────────────────────────────────────────────────

def _divergence(closes: list[float], wt: list[float], n: int = 5) -> str:
    if len(closes) < n + 2 or len(wt) < n + 2:
        return 'NONE'
    wt_peak = max(wt[-n:])
    wt_trou = min(wt[-n:])
    price_peak = max(closes[-n:])
    price_trou = min(closes[-n:])

    # Bearish div: price at/near peak but WT rolling lower
    if closes[-1] >= price_peak * 0.999 and wt[-1] < wt_peak * 0.90:
        return 'DIVERGENCE_BEAR'
    # Bullish div: price at/near trough but WT turning higher
    if closes[-1] <= price_trou * 1.001 and wt[-1] > wt_trou * 0.90:
        return 'DIVERGENCE_BULL'
    return 'NONE'


# ── Public API ────────────────────────────────────────────────────────────────

def compute_vumanchu(bars: list[dict], zone_direction: str,
                     n1: int = 10, n2: int = 21, mf_period: int = 14,
                     min_components: int = 2) -> VuManChuSignal:
    """
    bars:           5m or 15m bars, at least 40 recommended.
    zone_direction: 'long' or 'short' — expected trade direction.
    """
    if len(bars) < n2 + n1:
        return VuManChuSignal(
            direction='NEUTRAL', confidence='LOW',
            wt1=0.0, wt2=0.0, wt_signal='NEUTRAL',
            mf_value=0.0, mf_signal='NEUTRAL',
            vwap_signal='NEUTRAL', components_aligned=0,
            reason='Insufficient bars',
        )

    closes         = [float(b['close']) for b in bars]
    wt1_s, wt2_s   = _wt_series(bars, n1, n2)
    mf_s           = _money_flow(bars, mf_period)
    vwap_sig       = _vwap_signal(bars)

    wt1 = wt1_s[-1] if wt1_s else 0.0
    wt2_v = wt2_s[-1] if wt2_s and not (isinstance(wt2_s[-1], float) and
                                          wt2_s[-1] != wt2_s[-1]) else 0.0
    mf  = mf_s[-1]  if mf_s  else 0.0

    # ── WT signal ─────────────────────────────────────────────────────────────
    div = _divergence(closes, wt1_s)
    if div != 'NONE':
        wt_sig = div
    elif wt1 > wt2_v:
        wt_sig = 'BULLISH'
    elif wt1 < wt2_v:
        wt_sig = 'BEARISH'
    else:
        wt_sig = 'NEUTRAL'

    # ── Money flow (gold: spike = exhaustion) ─────────────────────────────────
    prev5  = mf_s[-6:-1] if len(mf_s) >= 6 else mf_s[:-1]
    mf_max = max(prev5) if prev5 else mf
    mf_min = min(prev5) if prev5 else mf

    if mf_max > 30 and mf < mf_max * 0.7:
        mf_sig = 'BEARISH_EXHAUSTION'   # spike has rolled over = sellers tapped out at resistance
    elif mf_min < -30 and mf > mf_min * 0.7:
        mf_sig = 'BULLISH_EXHAUSTION'   # negative spike rolling over = buyers tapped out at support
    elif mf > 20:
        mf_sig = 'BULLISH'
    elif mf < -20:
        mf_sig = 'BEARISH'
    else:
        mf_sig = 'NEUTRAL'

    # ── Count aligned components ──────────────────────────────────────────────
    aligned = 0
    notes: list[str] = []

    if zone_direction == 'long':
        if wt_sig in ('BULLISH', 'DIVERGENCE_BULL'):
            aligned += 1; notes.append(f'WT {wt_sig}')
        if mf_sig in ('BULLISH_EXHAUSTION', 'BULLISH'):
            aligned += 1; notes.append(f'MF {mf_sig}')
        if vwap_sig in ('RIGHT_ANGLE_UP', 'AT_VWAP'):
            aligned += 1; notes.append(f'VWAP {vwap_sig}')
    else:
        if wt_sig in ('BEARISH', 'DIVERGENCE_BEAR'):
            aligned += 1; notes.append(f'WT {wt_sig}')
        if mf_sig in ('BEARISH_EXHAUSTION', 'BEARISH'):
            aligned += 1; notes.append(f'MF {mf_sig}')
        if vwap_sig in ('RIGHT_ANGLE_DOWN', 'AT_VWAP'):
            aligned += 1; notes.append(f'VWAP {vwap_sig}')

    if aligned >= 3:
        confidence = 'HIGH';   direction = zone_direction.upper()
    elif aligned >= min_components:
        confidence = 'MEDIUM'; direction = zone_direction.upper()
    else:
        confidence = 'LOW';    direction = 'NEUTRAL'

    return VuManChuSignal(
        direction=direction, confidence=confidence,
        wt1=round(wt1, 2), wt2=round(wt2_v, 2), wt_signal=wt_sig,
        mf_value=round(mf, 1), mf_signal=mf_sig,
        vwap_signal=vwap_sig,
        components_aligned=aligned,
        reason=' · '.join(notes) or 'No alignment',
    )
