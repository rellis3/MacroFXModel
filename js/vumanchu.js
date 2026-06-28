/**
 * vumanchu.js — VuManChu Cipher B: central shared utility
 *
 * Pure functions only — no imports from dashboard state, no side effects.
 * Designed to work in any context: server monitoring loop, browser signal
 * engine, Python-via-subprocess, or future bots.
 *
 * Callers pass a bars array and choose which components they need.
 * Timeframe is caller-controlled — pass M1, M5, M15, or resampled bars.
 * Use resampleBars(m1Bars, 5) to get M5-quality signals from M1 data.
 *
 * Components:
 *   WT    WaveTrend oscillator (WT1 line + WT2 signal line)
 *   MF    Money Flow — directional volume pressure scaled –100 to +100
 *   VWAP  Dual-mode: slope exhaustion + price-vs-VWAP oscillator divergence
 *
 * Divergence types (applied to WT and VWAP oscillators):
 *   DIVERGENCE_BULL  Price lower low, oscillator higher low → reversal long
 *   DIVERGENCE_BEAR  Price higher high, oscillator lower high → reversal short
 *   HIDDEN_BULL      Price higher low, oscillator lower low → trend continuation long
 *   HIDDEN_BEAR      Price lower high, oscillator higher high → trend continuation short
 *
 * Entry verdict from assessEntry():
 *   'agree'   — 2+ components confirm the trade direction
 *   'neutral' — oscillators not committed either way
 *   'oppose'  — oscillators actively contradict the trade direction
 *
 * Note on Money Flow for FX:
 *   FX tick_volume (price updates per bar) is not true traded volume.
 *   MF is included and useful as a directional pressure proxy, but weight
 *   it lower than for Gold where futures tick volume is a reliable proxy.
 *   Set opts.useMF = false to skip it entirely for a given call.
 */

// ── Shared compute (single source of truth) ──────────────────────────────────
// EMA/SMA, WaveTrend, Money Flow and VWAP live in the vumanchuCore brick so this
// module and asiaRangeEngine share ONE implementation (the divide-by-zero guard
// was the only thing that had drifted; core standardizes it on 1e-10, which also
// suppresses flat-market float-noise spikes). Re-exported under the original
// names so existing importers (signal.js computeWT, server.js, gold backtest)
// don't change.
import {
  ema, sma, computeWaveTrend, computeMoneyFlow, computeVWAP as _computeVWAP,
} from './vumanchuCore.js';

export { ema, sma };

// ── Bar resampling ────────────────────────────────────────────────────────────

/**
 * Resample an array of M1 bars into N-minute bars.
 * Bars must be in chronological order (oldest first).
 * Incomplete final group is discarded to avoid a forming-bar bias.
 *
 * Each bar: { open, high, low, close, volume? }
 * Returns same shape, fewer bars.
 */
export function resampleBars(bars, n) {
  if (!bars?.length || n <= 1) return bars ?? [];
  const out = [];
  for (let i = 0; i + n <= bars.length; i += n) {
    const group = bars.slice(i, i + n);
    out.push({
      open:   group[0].open,
      high:   Math.max(...group.map(b => b.high)),
      low:    Math.min(...group.map(b => b.low)),
      close:  group[group.length - 1].close,
      volume: group.reduce((s, b) => s + (b.volume ?? b.tick_volume ?? 1), 0),
    });
  }
  return out;
}

// ── WaveTrend oscillator ──────────────────────────────────────────────────────
// Classic VuManChu Cipher B formula. Parameters:
//   n1=10  channel length (ESA + deviation smoothing period)
//   n2=21  WT1 smoothing period
//   sp=4   WT2 SMA signal line period

export const computeWT = (bars, opts = {}) => computeWaveTrend(bars, opts);

// ── Money Flow ────────────────────────────────────────────────────────────────
// Directional volume pressure: (close − open) / range × volume, EMA-smoothed.
// Positive = buying pressure, negative = selling pressure.
// Scaled to ±100 against the peak value in the series.
//
// FX note: use tick_volume (price updates per bar) as the volume proxy.

export const computeMF = (bars, opts = {}) => computeMoneyFlow(bars, opts);

// ── VWAP ──────────────────────────────────────────────────────────────────────

/**
 * Session VWAP (cumulative from bar 0). Returns { vwap, osc }. Delegates to the
 * vumanchuCore brick (single source of truth).
 */
export const computeVWAP = (bars) => _computeVWAP(bars);

/**
 * VWAP slope exhaustion — detects whether the momentum carrying price into a
 * zone is fading. Compares early-window slope vs late-window slope.
 *
 * Returns 'EXHAUSTION' | 'REVERSAL' | 'NEUTRAL'
 */
export function vwapExhaustion(bars, direction, { window = 20 } = {}) {
  if (bars.length < window + 5) return 'NEUTRAL';
  const { vwap } = computeVWAP(bars);
  const recent = vwap.slice(-window);
  const half   = Math.floor(window / 2);
  const earlySlope = recent[half]    - recent[0];
  const lateSlope  = recent[window - 1] - recent[half];

  if (direction === 'long') {
    if (earlySlope < 0 && lateSlope > 0)                               return 'REVERSAL';
    if (earlySlope < 0 && Math.abs(lateSlope) < Math.abs(earlySlope) * 0.45) return 'EXHAUSTION';
  } else {
    if (earlySlope > 0 && lateSlope < 0)                               return 'REVERSAL';
    if (earlySlope > 0 && Math.abs(lateSlope) < Math.abs(earlySlope) * 0.45) return 'EXHAUSTION';
  }
  return 'NEUTRAL';
}

// ── Swing point detection ─────────────────────────────────────────────────────

/**
 * Find local swing highs and lows in a series.
 * Returns { highs: [{i, v}], lows: [{i, v}] } in chronological order.
 * left/right: number of strictly-lower/higher bars required on each side.
 */
export function findSwings(series, { left = 3, right = 2 } = {}) {
  const highs = [], lows = [];
  for (let i = left; i < series.length - right; i++) {
    const v = series[i];
    let isH = true, isL = true;
    for (let j = 1; j <= left;  j++) { if (series[i - j] >= v) { isH = false; } if (series[i - j] <= v) { isL = false; } }
    for (let j = 1; j <= right; j++) { if (series[i + j] >= v) { isH = false; } if (series[i + j] <= v) { isL = false; } }
    if (isH) highs.push({ i, v });
    if (isL) lows.push({ i, v });
  }
  return { highs, lows };
}

// ── Structural divergence ─────────────────────────────────────────────────────

const OSC_MIN_DIFF = 2.0; // min oscillator unit gap between swings to count

/**
 * Detect structural divergence between price and an oscillator.
 *
 * startIdx: bar index from which to begin (use 0 for full series, or the
 *   index where price first entered a zone for zone-specific divergences).
 *
 * Returns 'DIVERGENCE_BULL' | 'DIVERGENCE_BEAR' |
 *         'HIDDEN_BULL'     | 'HIDDEN_BEAR'     | 'NONE'
 */
export function detectDivergence(closes, oscillator, {
  startIdx  = 0,
  oscWindow = 2,
  minGap    = 5,
  minDiff   = OSC_MIN_DIFF,
  swingLeft = 3,
  swingRight = 2,
} = {}) {
  let c = startIdx > 0 ? closes.slice(startIdx)     : closes;
  let o = startIdx > 0 ? oscillator.slice(startIdx) : oscillator;

  const minBars = swingLeft + swingRight + minGap + 2;
  if (c.length < minBars || o.length < minBars) {
    // Zone-entry window too short — fall back to full series tail
    c = closes.slice(-minBars);
    o = oscillator.slice(-minBars);
    if (c.length < minBars) return 'NONE';
  }

  const n = Math.min(c.length, o.length);
  c = c.slice(0, n); o = o.slice(0, n);

  const { highs: pH, lows: pL } = findSwings(c, { left: swingLeft, right: swingRight });

  // Read oscillator extreme in a ±oscWindow bar window around a price swing
  const oscNear = (idx, takeMax) => {
    const seg = o.slice(Math.max(0, idx - oscWindow), Math.min(n, idx + oscWindow + 1));
    if (!seg.length) return null;
    return takeMax ? Math.max(...seg) : Math.min(...seg);
  };

  // Divergence at swing HIGHS
  if (pH.length >= 2) {
    const { i: i1, v: ph1 } = pH[pH.length - 2];
    const { i: i2, v: ph2 } = pH[pH.length - 1];
    if (i2 - i1 >= minGap) {
      const oh1 = oscNear(i1, true), oh2 = oscNear(i2, true);
      if (oh1 != null && oh2 != null) {
        if (ph2 > ph1 && oh1 - oh2 >= minDiff) return 'DIVERGENCE_BEAR';
        if (ph2 < ph1 && oh2 - oh1 >= minDiff) return 'HIDDEN_BEAR';
      }
    }
  }

  // Divergence at swing LOWS
  if (pL.length >= 2) {
    const { i: i1, v: pl1 } = pL[pL.length - 2];
    const { i: i2, v: pl2 } = pL[pL.length - 1];
    if (i2 - i1 >= minGap) {
      const ol1 = oscNear(i1, false), ol2 = oscNear(i2, false);
      if (ol1 != null && ol2 != null) {
        if (pl2 < pl1 && ol2 - ol1 >= minDiff) return 'DIVERGENCE_BULL';
        if (pl2 > pl1 && ol1 - ol2 >= minDiff) return 'HIDDEN_BULL';
      }
    }
  }

  return 'NONE';
}

// ── Entry quality assessment ──────────────────────────────────────────────────

/**
 * Full VuManChu entry assessment for a given set of bars and trade direction.
 *
 * opts:
 *   obLevel      {number}  WT1 overbought threshold (default 60)
 *   osLevel      {number}  WT1 oversold threshold (default -60)
 *   minComponents{number}  components needed for 'agree' (default 2)
 *   useMF        {boolean} include Money Flow component (default true)
 *   useVWAP      {boolean} include VWAP component (default true)
 *   startIdx     {number}  bar from which to measure divergence (0 = full series)
 *   n1/n2/sp     {number}  WT parameters
 *
 * Returns:
 *   signal      'agree' | 'neutral' | 'oppose'
 *   confidence  'HIGH' | 'MEDIUM' | 'LOW'
 *   components  number of aligned components (0–3)
 *   wt          { value, signal }
 *   mf          { value, signal }   (null when useMF=false)
 *   vwap        { signal, divergence } (null when useVWAP=false)
 *   reason      human-readable summary string
 *   warnings    string[]
 */
export function assessEntry(bars, direction, opts = {}) {
  const {
    obLevel       = 60,
    osLevel       = -60,
    minComponents = 2,
    useMF         = true,
    useVWAP       = true,
    startIdx      = 0,
    n1 = 10, n2 = 21, sp = 4,
    mfPeriod = 14,
    vwapWindow = 20,
  } = opts;

  const isLong = direction === 'long';
  const neutral = (reason, warnings = []) => ({
    signal: 'neutral', confidence: 'LOW', components: 0,
    wt: null, mf: null, vwap: null, reason, warnings,
  });

  if (!bars?.length || bars.length < n1 + n2) {
    return neutral('Insufficient bars');
  }

  const closes = bars.map(b => parseFloat(b.close));

  // ── WaveTrend ──────────────────────────────────────────────────────────────
  const { wt1: wt1s, wt2: wt2s } = computeWT(bars, { n1, n2, sp });
  const wt1Val = wt1s[wt1s.length - 1] ?? 0;
  const wt2Val = wt2s[wt2s.length - 1];
  const wt2Num = isNaN(wt2Val) ? 0 : wt2Val;

  let wtSig;
  if      (isLong  && wt1Val <= osLevel) wtSig = 'OVERSOLD';
  else if (!isLong && wt1Val >= obLevel) wtSig = 'OVERBOUGHT';
  else {
    const wtDiv = detectDivergence(closes, wt1s, { startIdx });
    if   (wtDiv !== 'NONE') wtSig = wtDiv;
    else if (wt1Val > wt2Num)  wtSig = 'BULLISH';
    else if (wt1Val < wt2Num)  wtSig = 'BEARISH';
    else                       wtSig = 'NEUTRAL';
  }

  // ── Money Flow ─────────────────────────────────────────────────────────────
  let mfSig = null, mfVal = 0;
  if (useMF) {
    const mfS  = computeMF(bars, { period: mfPeriod });
    mfVal      = mfS[mfS.length - 1] ?? 0;
    const prev5 = mfS.slice(-6, -1);
    const mfMax = prev5.length ? Math.max(...prev5) : mfVal;
    const mfMin = prev5.length ? Math.min(...prev5) : mfVal;

    if      (mfMax >  30 && mfVal < mfMax * 0.7)  mfSig = 'BEARISH_EXHAUSTION';
    else if (mfMin < -30 && mfVal > mfMin * 0.7)  mfSig = 'BULLISH_EXHAUSTION';
    else if (mfVal >  20)                          mfSig = 'BULLISH';
    else if (mfVal < -20)                          mfSig = 'BEARISH';
    else                                           mfSig = 'NEUTRAL';
  }

  // ── VWAP ───────────────────────────────────────────────────────────────────
  let vwapSig = null, vwapDiv = 'NONE';
  if (useVWAP) {
    const { osc } = computeVWAP(bars);
    vwapSig = vwapExhaustion(bars, direction, { window: vwapWindow });
    vwapDiv = detectDivergence(closes, osc, { startIdx });
  }

  // ── Count aligned components ───────────────────────────────────────────────
  const LONG_WT_OK   = ['OVERSOLD', 'BULLISH', 'DIVERGENCE_BULL', 'HIDDEN_BULL'];
  const SHORT_WT_OK  = ['OVERBOUGHT', 'BEARISH', 'DIVERGENCE_BEAR', 'HIDDEN_BEAR'];
  const LONG_MF_OK   = ['BULLISH_EXHAUSTION', 'BULLISH'];
  const SHORT_MF_OK  = ['BEARISH_EXHAUSTION', 'BEARISH'];
  const LONG_MF_BAD  = ['BEARISH_EXHAUSTION', 'BEARISH'];
  const SHORT_MF_BAD = ['BULLISH_EXHAUSTION', 'BULLISH'];

  const notes    = [];
  const warnings = [];
  let   aligned  = 0;
  let   opposing = 0;

  // WT
  const wtOk  = isLong  ? LONG_WT_OK.includes(wtSig)  : SHORT_WT_OK.includes(wtSig);
  const wtBad = isLong  ? SHORT_WT_OK.includes(wtSig) : LONG_WT_OK.includes(wtSig);
  if (wtOk)  { aligned++;  notes.push(`WT ${wtSig}`); }
  if (wtBad) { opposing++; warnings.push(`WT ${wtSig} opposing`); }

  // MF
  if (useMF && mfSig) {
    const mfOk  = isLong  ? LONG_MF_OK.includes(mfSig)  : SHORT_MF_OK.includes(mfSig);
    const mfBad = isLong  ? LONG_MF_BAD.includes(mfSig) : SHORT_MF_BAD.includes(mfSig);
    if (mfOk)  { aligned++;  notes.push(`MF ${mfSig}`); }
    if (mfBad) { opposing++; warnings.push(`MF ${mfSig} opposing`); }
  }

  // VWAP
  if (useVWAP && vwapSig) {
    const vwapMomentumOk = vwapSig !== 'NEUTRAL';  // EXHAUSTION or REVERSAL — valid for both directions
    const vwapDivLong    = ['DIVERGENCE_BULL', 'HIDDEN_BULL'].includes(vwapDiv);
    const vwapDivShort   = ['DIVERGENCE_BEAR', 'HIDDEN_BEAR'].includes(vwapDiv);
    const vwapConfirmed  = isLong ? (vwapMomentumOk || vwapDivLong)  : (vwapMomentumOk || vwapDivShort);
    const vwapOpposed    = isLong ? vwapDivShort : vwapDivLong;
    const vwapLabel      = vwapDiv !== 'NONE' ? `VWAP ${vwapDiv}` : `VWAP ${vwapSig}`;
    if (vwapConfirmed && !vwapOpposed) { aligned++;  notes.push(vwapLabel); }
    if (vwapOpposed)                   { opposing++; warnings.push(`${vwapLabel} opposing`); }
  }

  // ── Verdict ────────────────────────────────────────────────────────────────
  const maxComponents = 1 + (useMF ? 1 : 0) + (useVWAP ? 1 : 0);

  let signal, confidence;
  if (opposing > 0 && aligned === 0) {
    signal = 'oppose'; confidence = opposing >= 2 ? 'HIGH' : 'MEDIUM';
  } else if (aligned >= minComponents) {
    signal = 'agree';
    confidence = aligned >= maxComponents ? 'HIGH' : aligned >= minComponents ? 'MEDIUM' : 'LOW';
  } else {
    signal = 'neutral'; confidence = 'LOW';
  }

  return {
    signal,
    confidence,
    components:  aligned,
    opposing,
    wt:   { value: Math.round(wt1Val * 100) / 100, signal: wtSig },
    mf:   useMF    ? { value: Math.round(mfVal * 10) / 10, signal: mfSig }       : null,
    vwap: useVWAP  ? { signal: vwapSig, divergence: vwapDiv }                    : null,
    reason:   notes.join(' · ') || 'No alignment',
    warnings,
  };
}
