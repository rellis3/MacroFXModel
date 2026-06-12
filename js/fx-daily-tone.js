// js/fx-daily-tone.js — FX Daily Tone Model
//
// Fast daily layer: uses live OHLC bars (NOT FRED data) to classify the current
// session tone. Complements the slow FRED macro model (weekly/monthly backdrop).
// Updates at daily bar cadence (~once per day when bars refresh).
//
// Architecture:
//   Cross-pair risk barometer  — 4 key pairs, weighted z-score composites
//   Dollar barometer           — reuses computeUSDStrength() from macro.js
//   Per-pair daily tone        — classifies into 7 regimes + directional bias
//
// Export: computeFXDailyTone, computeRiskBarometer

import { S } from './state.js'
import { computeUSDStrength } from './macro.js'
import { PAIR_DRIVERS } from './fx-macro-model.js'

// ── Tone Regime Metadata ───────────────────────────────────────────────────────
export const TONE_REGIMES = {
  RISK_OFF_SESSION:    { label: 'Risk-Off Session',     emoji: '🔴', description: 'Safe haven flows active. JPY and CHF bid, growth currencies under pressure.' },
  RISK_ON_SESSION:     { label: 'Risk-On Session',      emoji: '🟢', description: 'Risk appetite strong. Carry trades working, growth currencies leading.' },
  USD_BID_SESSION:     { label: 'Dollar Bid',           emoji: '💵', description: 'Broad dollar strength. USD outperforming across the board.' },
  USD_OFFERED_SESSION: { label: 'Dollar Offered',       emoji: '📉', description: 'Broad dollar weakness. USD underperforming across majors.' },
  TRENDING_BULL:       { label: 'Pair Trending Up',     emoji: '↑',  description: 'This pair is in a clear upward trend over the past week.' },
  TRENDING_BEAR:       { label: 'Pair Trending Down',   emoji: '↓',  description: 'This pair is in a clear downward trend over the past week.' },
  NEUTRAL_SESSION:     { label: 'Neutral Session',      emoji: '⚪', description: 'No dominant tone. Mixed signals across risk, dollar, and trend factors.' },
}

// ── Z-score momentum helper ────────────────────────────────────────────────────
// bars: newest-first array of {close} objects
// Returns z-score of current N-bar momentum vs history of last histLen N-bar returns
function zScoreMom(bars, momBars = 5, histLen = 30) {
  if (!bars || bars.length < momBars + histLen) return null
  const moms = []
  for (let i = 0; i < histLen; i++) {
    if (bars[i + momBars] == null) break
    moms.push((bars[i].close - bars[i + momBars].close) / bars[i + momBars].close)
  }
  if (moms.length < 10) return null
  const mean = moms.reduce((a, b) => a + b, 0) / moms.length
  const std  = Math.sqrt(moms.reduce((a, b) => a + (b - mean) ** 2, 0) / moms.length)
  return std > 1e-10 ? (moms[0] - mean) / std : 0
}

// ── Cross-pair risk barometer ──────────────────────────────────────────────────
// Cached per compute cycle (reset once per checkFXDailyToneAlerts call).
// Positive = risk-off, Negative = risk-on.
let _riskBarometerCache = null

export function computeRiskBarometer() {
  if (_riskBarometerCache !== null) return _riskBarometerCache

  const audjpyBars  = S.ohlcData?.['AUD/JPY']?.values
  const usdjpyBars  = S.ohlcData?.['USD/JPY']?.values
  const xauusdBars  = S.ohlcData?.['XAU/USD']?.values
  const usdchfBars  = S.ohlcData?.['USD/CHF']?.values

  const zAudJpy  = zScoreMom(audjpyBars)   // falling AUDJPY = risk-off
  const zUsdJpy  = zScoreMom(usdjpyBars)   // falling USDJPY = risk-off
  const zXauUsd  = zScoreMom(xauusdBars)   // rising Gold    = risk-off
  const zUsdChf  = zScoreMom(usdchfBars)   // falling USDCHF = CHF bid = risk-off

  let score = 0
  let pairsUsed = 0

  if (zAudJpy != null)  { score += -zAudJpy  * 0.40; pairsUsed++ }
  if (zUsdJpy != null)  { score += -zUsdJpy  * 0.25; pairsUsed++ }
  if (zXauUsd != null)  { score +=  zXauUsd  * 0.20; pairsUsed++ }
  if (zUsdChf != null)  { score += -zUsdChf  * 0.15; pairsUsed++ }

  // Normalise if some pairs unavailable
  if (pairsUsed > 0 && pairsUsed < 4) {
    score = score / (pairsUsed / 4)
  }

  const result = {
    score,
    pairsUsed,
    components: {
      audjpy: zAudJpy,
      usdjpy: zUsdJpy,
      xauusd: zXauUsd,
      usdchf: zUsdChf,
    },
    label: score > 0.6 ? 'risk-off' : score < -0.6 ? 'risk-on' : 'neutral',
  }

  _riskBarometerCache = result
  return result
}

// Reset cache — call at start of each checkFXDailyToneAlerts pass
export function resetRiskBarometerCache() {
  _riskBarometerCache = null
}

// ── Pair daily bias from regime ────────────────────────────────────────────────
function computePairBias(pair, regime, cfg) {
  switch (regime) {
    case 'RISK_OFF_SESSION':
      return cfg.riskSens < -0.3 ? 'BEARISH' : cfg.riskSens > 0.3 ? 'BULLISH' : 'NEUTRAL'

    case 'RISK_ON_SESSION':
      return cfg.riskSens < -0.3 ? 'BULLISH' : cfg.riskSens > 0.3 ? 'BEARISH' : 'NEUTRAL'

    case 'USD_BID_SESSION': {
      // USD as quote (EUR/USD, GBP/USD, AUD/USD, NZD/USD) → USD bid = pair falls = BEARISH
      // USD as base (USD/JPY, USD/CHF, USD/CAD) → USD bid = pair rises = BULLISH
      const usdIsBase = pair.startsWith('USD/')
      return usdIsBase ? 'BULLISH' : 'BEARISH'
    }

    case 'USD_OFFERED_SESSION': {
      const usdIsBase = pair.startsWith('USD/')
      return usdIsBase ? 'BEARISH' : 'BULLISH'
    }

    case 'TRENDING_BULL':
      return 'BULLISH'

    case 'TRENDING_BEAR':
      return 'BEARISH'

    default:
      return 'NEUTRAL'
  }
}

// ── Per-pair daily tone ────────────────────────────────────────────────────────
export function computeFXDailyTone(pair) {
  const cfg = PAIR_DRIVERS[pair]
  if (!cfg) return null

  const bars = S.ohlcData?.[pair]?.values
  if (!bars || bars.length < 35) return null  // need 5 + 30 bars minimum

  // 1. Risk barometer (shared, cached)
  const riskBar = computeRiskBarometer()

  // 2. Dollar barometer (reuse computeUSDStrength)
  const usdStrength = S.usdStrength || computeUSDStrength()

  // 3. Pair's own 5-day momentum z-score
  const pairZ = zScoreMom(bars)

  // 4. Classify regime — priority: risk > dollar > pair trend > neutral
  let regime = 'NEUTRAL_SESSION'

  if (riskBar.score > 0.6) {
    regime = 'RISK_OFF_SESSION'
  } else if (riskBar.score < -0.6) {
    regime = 'RISK_ON_SESSION'
  } else if (usdStrength && usdStrength.score > 0.5) {
    regime = 'USD_BID_SESSION'
  } else if (usdStrength && usdStrength.score < -0.5) {
    regime = 'USD_OFFERED_SESSION'
  } else if (pairZ != null && pairZ > 0.7) {
    regime = 'TRENDING_BULL'
  } else if (pairZ != null && pairZ < -0.7) {
    regime = 'TRENDING_BEAR'
  }

  // 5. Compute pair bias
  const bias = computePairBias(pair, regime, cfg)

  const toneData = TONE_REGIMES[regime]

  return {
    pair,
    regime,
    regimeLabel:   toneData.label,
    regimeEmoji:   toneData.emoji,
    description:   toneData.description,
    bias,
    pairZ,
    riskBarometer: riskBar,
    usdScore:      usdStrength?.score ?? null,
    computedAt:    Date.now(),
  }
}
