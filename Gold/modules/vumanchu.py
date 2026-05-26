"""
VuManChu Cipher B — three-component confirmation engine.

Components:
  WT1/WT2     WaveTrend momentum oscillator (matches dashboard divergence.js)
  Money Flow  Volume-weighted directional pressure, scaled –100 to +100
  VWAP        Dual-mode: slope exhaustion + price-vs-VWAP oscillator divergence

Divergence types (applied to both WT and VWAP oscillators):

  Regular divergence (DIVERGENCE_BULL / DIVERGENCE_BEAR):
    Price makes a new swing extreme but the oscillator does not confirm it.
    Signals a potential reversal — momentum is breaking down at the zone.
    Example: price higher high + oscillator lower high → DIVERGENCE_BEAR

  Hidden divergence (HIDDEN_BULL / HIDDEN_BEAR):
    Oscillator makes a more extreme reading while price makes a shallower move.
    Signals trend continuation — a pullback within the prevailing trend.
    Example: price higher low + oscillator lower low → HIDDEN_BULL (uptrend resumes)

Both regular and hidden divergence support zone entries in the same direction:
  DIVERGENCE_BULL / HIDDEN_BULL → LONG zone
  DIVERGENCE_BEAR / HIDDEN_BEAR → SHORT zone

Structural detection uses the last two confirmed price swing points and reads
the oscillator in a small window around each to handle natural lag. This
replaces the phase-1 approximation (current value vs window max/min).

VWAP component (two independent signals, either triggers alignment):
  1. Slope exhaustion: momentum pushing price into the zone is fading.
  2. Price-vs-VWAP divergence: structural comparison of price swing points
     against the VWAP oscillator (close − session_VWAP, normalised ±100).

WT signal priority (most specific first):
  1. OVERSOLD / OVERBOUGHT — WT1 beyond ±60 at the zone.
  2. Structural divergence (regular + hidden) from last two swing points.
  3. WT1 > WT2 crossover — weakest, only when neither above fires.

Gold-specific money flow behaviour:
  A money-flow SPIKE as price hits a zone signals EXHAUSTION, not continuation.

Entry fires when components_aligned >= min_required (default 2).
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Optional


@dataclass
class VuManChuSignal:
    direction: str           # LONG | SHORT | NEUTRAL
    confidence: str          # HIGH | MEDIUM | LOW
    wt1: float
    wt2: float
    wt_signal: str           # OVERSOLD | OVERBOUGHT | DIVERGENCE_BULL | DIVERGENCE_BEAR | HIDDEN_BULL | HIDDEN_BEAR | BULLISH | BEARISH | NEUTRAL
    mf_value: float
    mf_signal: str           # BULLISH_EXHAUSTION | BEARISH_EXHAUSTION | BULLISH | BEARISH | NEUTRAL
    vwap_signal: str         # EXHAUSTION | REVERSAL | NEUTRAL  (slope-based)
    components_aligned: int  # 0–3
    reason: str
    zone_entry_bar_idx: int = 0
    vwap_divergence: str = 'NONE'   # DIVERGENCE_BULL | DIVERGENCE_BEAR | HIDDEN_BULL | HIDDEN_BEAR | NONE


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


# ── VWAP slope exhaustion ────────────────────────────────────────────────────

def _vwap_exhaustion(bars: list[dict], zone_direction: str,
                     window: int = 20) -> str:
    """
    Reads the session VWAP slope to determine whether the momentum carrying
    price INTO the zone is running out of energy.

    Compares early-window slope vs late-window slope. A strong initial slope
    that is fading as price enters the zone signals exhaustion — confirmation
    for a reversal entry.

    Returns EXHAUSTION | REVERSAL | NEUTRAL
    """
    if len(bars) < window + 5:
        return 'NEUTRAL'

    cum_tpv = cum_vol = 0.0
    vwap_series: list[float] = []
    for b in bars:
        tp = (b['high'] + b['low'] + b['close']) / 3
        v  = b.get('tick_volume', 1)
        cum_tpv += tp * v; cum_vol += v
        vwap_series.append(cum_tpv / cum_vol if cum_vol else tp)

    recent = vwap_series[-window:]
    half   = window // 2

    early_slope = recent[half] - recent[0]
    late_slope  = recent[-1]  - recent[half]

    if zone_direction == 'long':
        if early_slope < 0 and late_slope > 0:
            return 'REVERSAL'
        if early_slope < 0 and abs(late_slope) < abs(early_slope) * 0.45:
            return 'EXHAUSTION'
    else:
        if early_slope > 0 and late_slope < 0:
            return 'REVERSAL'
        if early_slope > 0 and abs(late_slope) < abs(early_slope) * 0.45:
            return 'EXHAUSTION'

    return 'NEUTRAL'


# ── VWAP oscillator series ───────────────────────────────────────────────────

def _vwap_osc_series(bars: list[dict]) -> list[float]:
    """
    VWAP oscillator: (close − session_VWAP) normalised to ±100.
    Positive = price above VWAP (bullish pressure), negative = below (bearish).
    Normalisation makes divergence comparisons scale-independent.
    """
    cum_tpv = cum_vol = 0.0
    raw: list[float] = []
    for b in bars:
        tp = (b['high'] + b['low'] + b['close']) / 3
        v  = b.get('tick_volume', 1)
        cum_tpv += tp * v
        cum_vol += v
        vwap = cum_tpv / cum_vol if cum_vol else tp
        raw.append(float(b['close']) - vwap)

    peak = max(abs(v) for v in raw) if raw else 1.0
    if peak > 0:
        raw = [v / peak * 100 for v in raw]
    return raw


# ── Swing detection ──────────────────────────────────────────────────────────

def _find_swings(series: list[float], left: int = 3, right: int = 2
                 ) -> tuple[list[tuple[int, float]], list[tuple[int, float]]]:
    """
    Local swing highs and lows. Returns (highs, lows) as (index, value) pairs
    in chronological order. Requires `left` strictly-lower bars to the left and
    `right` strictly-lower bars to the right (strict both sides avoids detecting
    plateau-adjacent duplicates).
    """
    highs: list[tuple[int, float]] = []
    lows:  list[tuple[int, float]] = []
    for i in range(left, len(series) - right):
        v = series[i]
        if (all(v > series[i - j] for j in range(1, left + 1)) and
                all(v > series[i + j] for j in range(1, right + 1))):
            highs.append((i, v))
        if (all(v < series[i - j] for j in range(1, left + 1)) and
                all(v < series[i + j] for j in range(1, right + 1))):
            lows.append((i, v))
    return highs, lows


# ── Structural divergence ────────────────────────────────────────────────────

# Minimum oscillator unit difference between two swing reads to count as
# divergence. Both WT and VWAP oscillator are scaled to ±100 so this is
# comparable across both.
_OSC_MIN_DIFF = 2.0


def _divergence_structural(
        closes: list[float], oscillator: list[float],
        start_idx: int = 0, swing_left: int = 3, swing_right: int = 2,
        osc_window: int = 2, min_gap: int = 5,
) -> str:
    """
    Structural divergence between price and an oscillator using the last two
    confirmed swing points.

    For each price swing, the oscillator is read in a ±osc_window bar radius
    to handle the natural lag between price and oscillator extremes.

    Regular divergence  — oscillator fails to confirm a new price extreme.
                          Signals reversal: momentum breaking down at zone.
    Hidden divergence   — oscillator exceeds a new (shallower) price extreme.
                          Signals trend continuation: pullback within trend.

    Falls back to the tail of the full series when start_idx leaves too few
    bars for swing detection (matches the phase-1 fallback behaviour).

    Returns DIVERGENCE_BULL | DIVERGENCE_BEAR | HIDDEN_BULL | HIDDEN_BEAR | NONE
    """
    c = closes[start_idx:] if start_idx > 0 else closes
    o = oscillator[start_idx:] if start_idx > 0 else oscillator

    min_bars = swing_left + swing_right + min_gap + 2
    if len(c) < min_bars or len(o) < min_bars:
        # Zone-entry window too short — fall back to full series tail
        c = closes[-min_bars:]
        o = oscillator[-min_bars:]
        if len(c) < min_bars:
            return 'NONE'

    n = min(len(c), len(o))
    c, o = c[:n], o[:n]

    price_highs, price_lows = _find_swings(c, left=swing_left, right=swing_right)

    def _osc_near(idx: int, take_max: bool) -> Optional[float]:
        """Oscillator extreme in a ±osc_window bar window around a price swing."""
        s = max(0, idx - osc_window)
        e = min(n, idx + osc_window + 1)
        seg = o[s:e]
        if not seg:
            return None
        return max(seg) if take_max else min(seg)

    # --- Divergence at swing HIGHS (bearish regular / hidden bearish) ---------
    if len(price_highs) >= 2:
        ph1_i, ph1 = price_highs[-2]
        ph2_i, ph2 = price_highs[-1]
        if ph2_i - ph1_i >= min_gap:
            oh1 = _osc_near(ph1_i, take_max=True)
            oh2 = _osc_near(ph2_i, take_max=True)
            if oh1 is not None and oh2 is not None:
                # Regular bearish: price higher high, oscillator lower high
                if ph2 > ph1 and (oh1 - oh2) >= _OSC_MIN_DIFF:
                    return 'DIVERGENCE_BEAR'
                # Hidden bearish: price lower high, oscillator higher high
                if ph2 < ph1 and (oh2 - oh1) >= _OSC_MIN_DIFF:
                    return 'HIDDEN_BEAR'

    # --- Divergence at swing LOWS (bullish regular / hidden bullish) ----------
    if len(price_lows) >= 2:
        pl1_i, pl1 = price_lows[-2]
        pl2_i, pl2 = price_lows[-1]
        if pl2_i - pl1_i >= min_gap:
            ol1 = _osc_near(pl1_i, take_max=False)
            ol2 = _osc_near(pl2_i, take_max=False)
            if ol1 is not None and ol2 is not None:
                # Regular bullish: price lower low, oscillator higher low
                if pl2 < pl1 and (ol2 - ol1) >= _OSC_MIN_DIFF:
                    return 'DIVERGENCE_BULL'
                # Hidden bullish: price higher low, oscillator lower low
                if pl2 > pl1 and (ol1 - ol2) >= _OSC_MIN_DIFF:
                    return 'HIDDEN_BULL'

    return 'NONE'


# WT levels for gold — beyond ±60 indicates genuine exhaustion at a zone.
WT_OVERSOLD  = -60.0
WT_OVERBOUGHT = 60.0


# ── Public API ────────────────────────────────────────────────────────────────

def compute_vumanchu(bars: list[dict], zone_direction: str,
                     n1: int = 10, n2: int = 21, mf_period: int = 14,
                     min_components: int = 2,
                     entry_time: Optional[float] = None) -> VuManChuSignal:
    """
    bars:           5m or 15m bars, at least 40 recommended (chronological).
    zone_direction: 'long' or 'short' — expected trade direction.
    entry_time:     Unix timestamp (float) of when price first entered the GP
                    window. When supplied, divergence is measured from that bar
                    onwards so we catch setups that form *at the zone* rather
                    than anywhere in the lookback window.
    """
    if len(bars) < n2 + n1:
        return VuManChuSignal(
            direction='NEUTRAL', confidence='LOW',
            wt1=0.0, wt2=0.0, wt_signal='NEUTRAL',
            mf_value=0.0, mf_signal='NEUTRAL',
            vwap_signal='NEUTRAL', components_aligned=0,
            reason='Insufficient bars',
        )

    closes       = [float(b['close']) for b in bars]
    wt1_s, wt2_s = _wt_series(bars, n1, n2)
    mf_s         = _money_flow(bars, mf_period)
    vwap_sig     = _vwap_exhaustion(bars, zone_direction)
    vwap_osc     = _vwap_osc_series(bars)

    wt1   = wt1_s[-1] if wt1_s else 0.0
    wt2_v = wt2_s[-1] if wt2_s and not (isinstance(wt2_s[-1], float) and
                                          wt2_s[-1] != wt2_s[-1]) else 0.0
    mf    = mf_s[-1]  if mf_s  else 0.0

    # ── Resolve zone-entry bar index ──────────────────────────────────────────
    zone_entry_bar_idx = 0
    if entry_time is not None:
        for i, b in enumerate(bars):
            if b.get('time', 0) >= entry_time:
                zone_entry_bar_idx = i
                break

    # ── WT signal — priority order ────────────────────────────────────────────
    # 1. OVERSOLD / OVERBOUGHT — most direct exhaustion read for gold.
    # 2. Structural divergence (regular + hidden) from last two swing points.
    # 3. WT1/WT2 crossover — weakest; only used when neither above fires.
    if zone_direction == 'long' and wt1 <= WT_OVERSOLD:
        wt_sig = 'OVERSOLD'
    elif zone_direction == 'short' and wt1 >= WT_OVERBOUGHT:
        wt_sig = 'OVERBOUGHT'
    else:
        div = _divergence_structural(closes, wt1_s, start_idx=zone_entry_bar_idx)
        if div != 'NONE':
            wt_sig = div   # DIVERGENCE_BULL | DIVERGENCE_BEAR | HIDDEN_BULL | HIDDEN_BEAR
        elif wt1 > wt2_v:
            wt_sig = 'BULLISH'
        elif wt1 < wt2_v:
            wt_sig = 'BEARISH'
        else:
            wt_sig = 'NEUTRAL'

    # ── VWAP divergence (structural, price vs VWAP oscillator) ───────────────
    vwap_div = _divergence_structural(closes, vwap_osc, start_idx=zone_entry_bar_idx)

    # ── Money flow (gold: spike = exhaustion) ─────────────────────────────────
    prev5  = mf_s[-6:-1] if len(mf_s) >= 6 else mf_s[:-1]
    mf_max = max(prev5) if prev5 else mf
    mf_min = min(prev5) if prev5 else mf

    if mf_max > 30 and mf < mf_max * 0.7:
        mf_sig = 'BEARISH_EXHAUSTION'
    elif mf_min < -30 and mf > mf_min * 0.7:
        mf_sig = 'BULLISH_EXHAUSTION'
    elif mf > 20:
        mf_sig = 'BULLISH'
    elif mf < -20:
        mf_sig = 'BEARISH'
    else:
        mf_sig = 'NEUTRAL'

    # ── Count aligned components ──────────────────────────────────────────────
    aligned = 0
    notes: list[str] = []

    # VWAP component fires on slope exhaustion OR structural divergence.
    if zone_direction == 'long':
        vwap_confirmed = (vwap_sig in ('EXHAUSTION', 'REVERSAL') or
                          vwap_div in ('DIVERGENCE_BULL', 'HIDDEN_BULL'))
    else:
        vwap_confirmed = (vwap_sig in ('EXHAUSTION', 'REVERSAL') or
                          vwap_div in ('DIVERGENCE_BEAR', 'HIDDEN_BEAR'))

    if zone_direction == 'long':
        if wt_sig in ('OVERSOLD', 'BULLISH', 'DIVERGENCE_BULL', 'HIDDEN_BULL'):
            aligned += 1; notes.append(f'WT {wt_sig}')
        if mf_sig in ('BULLISH_EXHAUSTION', 'BULLISH'):
            aligned += 1; notes.append(f'MF {mf_sig}')
        if vwap_confirmed:
            label = f'VWAP {vwap_div}' if vwap_div not in ('NONE',) else f'VWAP slope {vwap_sig}'
            aligned += 1; notes.append(label)
    else:
        if wt_sig in ('OVERBOUGHT', 'BEARISH', 'DIVERGENCE_BEAR', 'HIDDEN_BEAR'):
            aligned += 1; notes.append(f'WT {wt_sig}')
        if mf_sig in ('BEARISH_EXHAUSTION', 'BEARISH'):
            aligned += 1; notes.append(f'MF {mf_sig}')
        if vwap_confirmed:
            label = f'VWAP {vwap_div}' if vwap_div not in ('NONE',) else f'VWAP slope {vwap_sig}'
            aligned += 1; notes.append(label)

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
        zone_entry_bar_idx=zone_entry_bar_idx,
        vwap_divergence=vwap_div,
    )
