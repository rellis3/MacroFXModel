// js/fx-macro-model.js — FX Pair Macro Regime Model
//
// Theory: FX pairs are priced at the margin of central bank policy divergence,
// risk appetite, and commodity dynamics. The alpha lives in the RATE OF CHANGE of
// these macro factors — rate differential momentum, not just level — combined with
// the cyclical risk environment (VIX, HY credit spreads).
//
// Architecture:
//   Rate Differential    — base CB vs quote CB short-rate divergence (level + momentum)
//   Risk Environment     — VIX + HY spread determine safe haven / carry regime
//   Commodity Overlay    — WTI/oil for commodity-linked pairs (CAD, AUD, NOK proxied)
//   Regime Classification — priority-ordered: Risk-Off > Risk-On > Commodity > Rate
//   Confidence Assessment — contradiction-based transition detection
//
// Supported pairs: 26 major and cross pairs.
// NZD pairs: RBNZ has no short-rate series on FRED; proxied via au_short.
//
// All FRED data accessed from S.fredData as { value, prev } objects.

import { S } from './state.js'

// ── Pair Driver Configuration ──────────────────────────────────────────────────
// Fields:
//   baseRateKey  — FRED field for the base currency short rate
//   quoteRateKey — FRED field for the quote currency short rate
//   baseName     — central bank name for base currency
//   quoteName    — central bank name for quote currency
//   riskSens     — how the pair moves in risk-off environments:
//                  -1.0 = pair falls sharply (risk currencies like AUD, NZD vs JPY)
//                  +1.0 = pair rises sharply (defensive pairs like EUR/AUD in stress)
//   commodityKey — FRED field for commodity driver (null = no commodity overlay)
//   commodityDir — +1 = commodity up is bullish for base, -1 = bearish for base, 0 = no effect
//   nzdProxy     — true = NZD rate proxied via au_short (no RBNZ data on FRED)
export const PAIR_DRIVERS = {
  // ── Major USD Pairs ──────────────────────────────────────────────────────────
  'EUR/USD': { baseRateKey: 'de_short', quoteRateKey: 'us2y',     baseName: 'ECB',  quoteName: 'Fed',  riskSens: -0.5, commodityKey: null,  commodityDir:  0 },
  'GBP/USD': { baseRateKey: 'gb_short', quoteRateKey: 'us2y',     baseName: 'BOE',  quoteName: 'Fed',  riskSens: -0.6, commodityKey: null,  commodityDir:  0 },
  'USD/JPY': { baseRateKey: 'us2y',     quoteRateKey: 'jp_short', baseName: 'Fed',  quoteName: 'BOJ',  riskSens: -0.8, commodityKey: null,  commodityDir:  0 },
  'USD/CHF': { baseRateKey: 'us2y',     quoteRateKey: 'ch_short', baseName: 'Fed',  quoteName: 'SNB',  riskSens: -0.7, commodityKey: null,  commodityDir:  0 },
  'USD/CAD': { baseRateKey: 'us2y',     quoteRateKey: 'ca_short', baseName: 'Fed',  quoteName: 'BoC',  riskSens: +0.5, commodityKey: 'wti', commodityDir: -1 },
  'AUD/USD': { baseRateKey: 'au_short', quoteRateKey: 'us2y',     baseName: 'RBA',  quoteName: 'Fed',  riskSens: -0.8, commodityKey: 'wti', commodityDir: +1 },
  'NZD/USD': { baseRateKey: 'au_short', quoteRateKey: 'us2y',     baseName: 'RBNZ', quoteName: 'Fed',  riskSens: -0.8, commodityKey: null,  commodityDir:  0, nzdProxy: true },

  // ── EUR Crosses ──────────────────────────────────────────────────────────────
  'EUR/GBP': { baseRateKey: 'de_short', quoteRateKey: 'gb_short', baseName: 'ECB',  quoteName: 'BOE',  riskSens: +0.3, commodityKey: null,  commodityDir:  0 },
  'EUR/JPY': { baseRateKey: 'de_short', quoteRateKey: 'jp_short', baseName: 'ECB',  quoteName: 'BOJ',  riskSens: -0.9, commodityKey: null,  commodityDir:  0 },
  'EUR/AUD': { baseRateKey: 'de_short', quoteRateKey: 'au_short', baseName: 'ECB',  quoteName: 'RBA',  riskSens: +0.8, commodityKey: 'wti', commodityDir: -1 },
  'EUR/CAD': { baseRateKey: 'de_short', quoteRateKey: 'ca_short', baseName: 'ECB',  quoteName: 'BoC',  riskSens: +0.6, commodityKey: 'wti', commodityDir: -1 },
  'EUR/CHF': { baseRateKey: 'de_short', quoteRateKey: 'ch_short', baseName: 'ECB',  quoteName: 'SNB',  riskSens: -0.8, commodityKey: null,  commodityDir:  0 },
  'EUR/NZD': { baseRateKey: 'de_short', quoteRateKey: 'au_short', baseName: 'ECB',  quoteName: 'RBNZ', riskSens: +0.8, commodityKey: null,  commodityDir:  0, nzdProxy: true },

  // ── GBP Crosses ──────────────────────────────────────────────────────────────
  'GBP/JPY': { baseRateKey: 'gb_short', quoteRateKey: 'jp_short', baseName: 'BOE',  quoteName: 'BOJ',  riskSens: -0.9, commodityKey: null,  commodityDir:  0 },
  'GBP/AUD': { baseRateKey: 'gb_short', quoteRateKey: 'au_short', baseName: 'BOE',  quoteName: 'RBA',  riskSens: +0.7, commodityKey: 'wti', commodityDir: -1 },
  'GBP/CAD': { baseRateKey: 'gb_short', quoteRateKey: 'ca_short', baseName: 'BOE',  quoteName: 'BoC',  riskSens: +0.2, commodityKey: 'wti', commodityDir: -1 },
  'GBP/CHF': { baseRateKey: 'gb_short', quoteRateKey: 'ch_short', baseName: 'BOE',  quoteName: 'SNB',  riskSens: -0.8, commodityKey: null,  commodityDir:  0 },
  'GBP/NZD': { baseRateKey: 'gb_short', quoteRateKey: 'au_short', baseName: 'BOE',  quoteName: 'RBNZ', riskSens: +0.7, commodityKey: null,  commodityDir:  0, nzdProxy: true },

  // ── AUD Crosses ──────────────────────────────────────────────────────────────
  'AUD/JPY': { baseRateKey: 'au_short', quoteRateKey: 'jp_short', baseName: 'RBA',  quoteName: 'BOJ',  riskSens: -1.0, commodityKey: 'wti', commodityDir: +1 },
  // AUD/NZD: both share au_short — rate diff not meaningful; aud_usd vs nzd_usd momentum used as proxy
  'AUD/NZD': { baseRateKey: 'au_short', quoteRateKey: 'au_short', baseName: 'RBA',  quoteName: 'RBNZ', riskSens: +0.2, commodityKey: null,  commodityDir:  0, nzdProxy: true },
  // AUD/CAD: both commodity — oil slightly favours CAD more; netting effect is mild bullish for base on oil rises
  'AUD/CAD': { baseRateKey: 'au_short', quoteRateKey: 'ca_short', baseName: 'RBA',  quoteName: 'BoC',  riskSens: +0.2, commodityKey: 'wti', commodityDir: +1 },
  'AUD/CHF': { baseRateKey: 'au_short', quoteRateKey: 'ch_short', baseName: 'RBA',  quoteName: 'SNB',  riskSens: -0.9, commodityKey: 'wti', commodityDir: +1 },
  'NZD/JPY': { baseRateKey: 'au_short', quoteRateKey: 'jp_short', baseName: 'RBNZ', quoteName: 'BOJ',  riskSens: -0.95, commodityKey: null, commodityDir:  0, nzdProxy: true },

  // ── JPY Crosses ──────────────────────────────────────────────────────────────
  'CAD/JPY': { baseRateKey: 'ca_short', quoteRateKey: 'jp_short', baseName: 'BoC',  quoteName: 'BOJ',  riskSens: -0.9, commodityKey: 'wti', commodityDir: +1 },
  // CHF/JPY: both safe havens — CHF slightly stronger in acute stress; pair can rally even in mild risk-off
  'CHF/JPY': { baseRateKey: 'ch_short', quoteRateKey: 'jp_short', baseName: 'SNB',  quoteName: 'BOJ',  riskSens: +0.3, commodityKey: null,  commodityDir:  0 },
}

// ── FX Regime Metadata ─────────────────────────────────────────────────────────
// Seven regimes covering the macro drivers relevant to FX.
// Emoji and bias are the static defaults; actual bias is computed per-pair from
// riskSens and commodityDir for the risk and commodity regimes.
const FX_REGIME_META = {
  RATE_BASE_EXPANDING: {
    label: 'Base CB Tightening',
    description: 'Base central bank tightening faster — rate differential widening in base currency favour.',
    defaultBias: 'BULLISH',
    emoji: '🟢',
  },
  RATE_QUOTE_EXPANDING: {
    label: 'Quote CB Tightening',
    description: 'Quote central bank tightening faster — rate differential shifting against the base currency.',
    defaultBias: 'BEARISH',
    emoji: '🔴',
  },
  RISK_OFF: {
    label: 'Risk-Off / Safe Haven',
    description: 'VIX and credit stress elevated — safe haven flows dominate over carry and rate differentials.',
    defaultBias: 'MIXED',
    emoji: '⚠️',
  },
  RISK_ON: {
    label: 'Risk-On / Carry',
    description: 'Risk appetite strong — carry trades rewarded, growth and commodity currencies bid.',
    defaultBias: 'MIXED',
    emoji: '🟢',
  },
  COMMODITY_BULL: {
    label: 'Commodity Bull',
    description: 'Commodity prices rising (WTI/oil) — direction impact depends on pair composition.',
    defaultBias: 'MIXED',
    emoji: '🟠',
  },
  COMMODITY_BEAR: {
    label: 'Commodity Bear',
    description: 'Commodity prices falling — direction impact depends on pair composition.',
    defaultBias: 'MIXED',
    emoji: '🟤',
  },
  NEUTRAL: {
    label: 'Neutral Macro',
    description: 'No dominant macro driver. Rate differential, risk, and commodity signals are balanced or flat.',
    defaultBias: 'NEUTRAL',
    emoji: '⚪',
  },
}

// ── Rate Differential Scoring ──────────────────────────────────────────────────
// Computes how the base–quote rate differential compares to the prior period.
// Positive score = base rate advantage widening (bullish base currency).
// Negative score = quote rate advantage widening (bearish base currency).
//
// Special case: AUD/NZD shares the same FRED series for both legs.
//   Instead of computing a meaningless 0 differential, we proxy using aud_usd
//   vs nzd_usd momentum — the relative move of each currency vs USD captures
//   the market-implied rate advantage signal.
function scoreRateDiff(f, cfg) {
  // ── AUD/NZD special case: momentum proxy from spot ────────────────────────
  if (cfg.nzdProxy && cfg.baseRateKey === cfg.quoteRateKey) {
    const audUsd  = f.aud_usd?.value
    const audPrev = f.aud_usd?.prev
    const nzdUsd  = f.nzd_usd?.value
    const nzdPrev = f.nzd_usd?.prev

    if (audUsd == null || nzdUsd == null) {
      return { diff: null, momentum: null, levelScore: 0, momScore: 0, score: 0, label: 'AUD/NZD proxy unavailable' }
    }

    const audMom = (audPrev != null) ? (audUsd / audPrev - 1) * 100 : null
    const nzdMom = (nzdPrev != null) ? (nzdUsd / nzdPrev - 1) * 100 : null
    const relMom = (audMom != null && nzdMom != null) ? audMom - nzdMom : null

    let momScore = 0
    if (relMom != null) {
      if      (relMom >  0.30) momScore =  1.0
      else if (relMom >  0.15) momScore =  0.6
      else if (relMom >  0.05) momScore =  0.3
      else if (relMom < -0.30) momScore = -1.0
      else if (relMom < -0.15) momScore = -0.6
      else if (relMom < -0.05) momScore = -0.3
    }

    const score = momScore // level is not meaningful for same-series diff
    return {
      diff: 0,
      momentum: relMom,
      levelScore: 0,
      momScore,
      score,
      label: relMom != null ? `AUD/NZD spot proxy: rel-mom ${relMom > 0 ? '+' : ''}${relMom.toFixed(2)}%` : 'AUD/NZD proxy — insufficient data',
    }
  }

  // ── Standard rate differential ────────────────────────────────────────────
  const base      = f[cfg.baseRateKey]?.value
  const basePrev  = f[cfg.baseRateKey]?.prev
  const quote     = f[cfg.quoteRateKey]?.value
  const quotePrev = f[cfg.quoteRateKey]?.prev

  if (base == null || quote == null) {
    return { diff: null, momentum: null, levelScore: 0, momScore: 0, score: 0, label: 'Rate data unavailable' }
  }

  const diff     = base - quote
  const prevDiff = (basePrev != null && quotePrev != null) ? basePrev - quotePrev : null
  const momentum = prevDiff != null ? diff - prevDiff : null

  // Level score: how wide is the differential in base's favour?
  let levelScore = 0
  if      (diff >  1.50) levelScore =  1.0
  else if (diff >  0.75) levelScore =  0.7
  else if (diff >  0.25) levelScore =  0.4
  else if (diff < -1.50) levelScore = -1.0
  else if (diff < -0.75) levelScore = -0.7
  else if (diff < -0.25) levelScore = -0.4

  // Momentum score: how fast is the differential moving?
  let momScore = 0
  if (momentum != null) {
    if      (momentum >  0.15) momScore =  1.0
    else if (momentum >  0.08) momScore =  0.7
    else if (momentum >  0.03) momScore =  0.4
    else if (momentum < -0.15) momScore = -1.0
    else if (momentum < -0.08) momScore = -0.7
    else if (momentum < -0.03) momScore = -0.4
  }

  // Alpha lives in momentum (60%) more than level (40%)
  const score = 0.4 * levelScore + 0.6 * (momScore ?? 0)

  const diffStr = diff >= 0 ? `+${diff.toFixed(2)}%` : `${diff.toFixed(2)}%`
  const momStr  = momentum != null ? ` mom ${momentum > 0 ? '+' : ''}${(momentum * 100).toFixed(1)}bp` : ''
  return {
    diff,
    momentum,
    levelScore,
    momScore,
    score: Math.max(-1, Math.min(1, score)),
    label: `${cfg.baseName}–${cfg.quoteName} spread ${diffStr}${momStr}`,
  }
}

// ── Risk Environment Scoring ───────────────────────────────────────────────────
// VIX thresholds: 15 = calm, 18 = elevated, 22 = stressed, 28 = crisis
// HY thresholds (bps): 300 = tight, 400 = moderate, 500 = distressed
//
// riskOnScore only high when BOTH VIX and HY are genuinely calm — the true
// carry-trade environment. A low VIX alone (while HY is elevated) is not risk-on.
function scoreRisk(f) {
  const vix   = f.vix?.value
  const vixPrev = f.vix?.prev
  const hy    = f.hy?.value
  const hyBps = hy != null ? hy * 100 : null

  // VIX component of risk-off [0,1]
  let vixScore = 0
  if (vix != null) {
    if      (vix >= 28) vixScore = 1.0
    else if (vix >= 22) vixScore = 0.7
    else if (vix >= 18) vixScore = 0.4
    else if (vix >= 15) vixScore = 0.1
    else                vixScore = 0.0
  }

  // HY credit spread component of risk-off [0,1]
  let hyScore = 0
  if (hyBps != null) {
    if      (hyBps >= 500) hyScore = 1.0
    else if (hyBps >= 400) hyScore = 0.6
    else if (hyBps >= 300) hyScore = 0.2
    else                   hyScore = 0.0
  }

  const riskOffScore = Math.max(vixScore, hyScore)

  // Risk-on: only when BOTH conditions signal calm
  const vixCalm = vix != null && vix < 15
  const hyCalm  = hyBps != null && hyBps < 330
  const riskOnScore = (vixCalm && hyCalm) ? Math.min(1.0, (15 - vix) / 5 * 0.7 + (330 - hyBps) / 330 * 0.3) : 0

  const vixChange = (vix != null && vixPrev != null) ? vix - vixPrev : null

  let label
  if      (riskOffScore >= 0.7) label = `Risk-Off STRONG (VIX ${vix?.toFixed(0) ?? '—'} / HY ${hyBps != null ? Math.round(hyBps) : '—'}bp)`
  else if (riskOffScore >= 0.4) label = `Risk-Off MODERATE (VIX ${vix?.toFixed(0) ?? '—'} / HY ${hyBps != null ? Math.round(hyBps) : '—'}bp)`
  else if (riskOnScore  >= 0.5) label = `Risk-On (VIX ${vix?.toFixed(0) ?? '—'} / HY ${hyBps != null ? Math.round(hyBps) : '—'}bp)`
  else                          label = `Neutral (VIX ${vix?.toFixed(0) ?? '—'} / HY ${hyBps != null ? Math.round(hyBps) : '—'}bp)`

  return { riskOffScore, riskOnScore, vix, hy, hyBps, vixChange, label }
}

// ── Commodity Scoring ──────────────────────────────────────────────────────────
// Uses WTI oil momentum (percentage change) as the commodity signal.
// Direction is pair-relative: multiply raw score by cfg.commodityDir.
//
// Thresholds (percentage move period-on-period):
//   ±5% = strong move, ±2% = moderate, ±0.5% = minor, below = noise
function scoreCommodity(f, cfg) {
  if (!cfg.commodityKey) return null

  const wti     = f[cfg.commodityKey]?.value
  const wtiPrev = f[cfg.commodityKey]?.prev

  if (wti == null || wtiPrev == null || wtiPrev === 0) {
    return { rawScore: 0, score: 0, wti, momentum: null, label: 'WTI data unavailable' }
  }

  const momentum = (wti - wtiPrev) / wtiPrev * 100

  let rawScore = 0
  if      (momentum >=  5.0) rawScore =  1.0
  else if (momentum >=  2.0) rawScore =  0.7
  else if (momentum >=  0.5) rawScore =  0.3
  else if (momentum <= -5.0) rawScore = -1.0
  else if (momentum <= -2.0) rawScore = -0.7
  else if (momentum <= -0.5) rawScore = -0.3

  const score = rawScore * cfg.commodityDir

  const momStr = `${momentum > 0 ? '+' : ''}${momentum.toFixed(1)}%`
  const label  = `WTI $${wti.toFixed(1)} (${momStr}) → pair impact ${score > 0 ? 'BULLISH' : score < 0 ? 'BEARISH' : 'NEUTRAL'}`

  return { rawScore, score, wti, momentum, label }
}

// ── FX Regime Classification ───────────────────────────────────────────────────
// Priority order ensures risk regimes override rate/commodity signals when stress is high.
//
//   1. RISK_OFF      — VIX/HY stress > 0.6 overrides everything
//   2. RISK_ON       — genuinely calm, carry environment
//   3. COMMODITY     — pair has commodity driver and strong signal (|score| > 0.6)
//   4. RATE regimes  — rate differential dominant when risk/commodity subdued
//   5. NEUTRAL       — no dominant driver
function classifyFXRegime(scores, cfg) {
  const { rateDiff, risk, commodity } = scores

  // 1. Risk-off: stress overrides all other signals
  if (risk.riskOffScore > 0.6) return 'RISK_OFF'

  // 2. Risk-on: only when genuinely calm (both VIX and HY)
  if (risk.riskOnScore > 0.5 && risk.riskOffScore < 0.15) return 'RISK_ON'

  // 3. Commodity regime: only for pairs with a commodity driver, and when signal is strong
  if (cfg.commodityKey && commodity != null && Math.abs(commodity.score) > 0.6) {
    return commodity.score > 0 ? 'COMMODITY_BULL' : 'COMMODITY_BEAR'
  }

  // 4. Rate differential regimes
  const mom = rateDiff.momentum ?? 0
  if (rateDiff.score > 0.35 || (rateDiff.score > 0.15 && mom > 0.08)) return 'RATE_BASE_EXPANDING'
  if (rateDiff.score < -0.35 || (rateDiff.score < -0.15 && mom < -0.08)) return 'RATE_QUOTE_EXPANDING'

  return 'NEUTRAL'
}

// ── Pair Bias Computation ──────────────────────────────────────────────────────
// Converts regime + pair-specific sensitivities into a directional bias.
// RISK_OFF/RISK_ON bias depends on riskSens (how the pair moves in stress).
// COMMODITY bias depends on commodityDir.
function computePairBias(regimeKey, scores, cfg) {
  switch (regimeKey) {
    case 'RATE_BASE_EXPANDING':  return 'BULLISH'
    case 'RATE_QUOTE_EXPANDING': return 'BEARISH'

    case 'RISK_OFF':
      // Pairs that fall sharply in risk-off (riskSens < -0.4): base currency is the risk leg
      if (cfg.riskSens < -0.4) return 'BEARISH'
      // Pairs that rise in risk-off (riskSens > 0.4): base is the safe haven
      if (cfg.riskSens > 0.4)  return 'BULLISH'
      return 'MIXED'

    case 'RISK_ON':
      // Opposite of risk-off behaviour
      if (cfg.riskSens < -0.4) return 'BULLISH'
      if (cfg.riskSens > 0.4)  return 'BEARISH'
      return 'MIXED'

    case 'COMMODITY_BULL':
      return cfg.commodityDir > 0 ? 'BULLISH' : 'BEARISH'

    case 'COMMODITY_BEAR':
      return cfg.commodityDir > 0 ? 'BEARISH' : 'BULLISH'

    case 'NEUTRAL':
    default:
      return 'NEUTRAL'
  }
}

// ── Regime Confidence / Transition Risk ───────────────────────────────────────
// Contradiction-based approach: if the current regime's key signals are weakening
// or reversing, the regime may be transitioning. Lower confidence = smaller size.
function assessFXConfidence(scores, regimeKey) {
  const { rateDiff, risk, commodity } = scores
  const signals = []
  let transitionScore = 0

  // Rate regime contradictions
  if (regimeKey === 'RATE_BASE_EXPANDING') {
    if (rateDiff.momentum != null && rateDiff.momentum < -0.05) {
      signals.push(`Rate momentum turning negative — ${Math.abs(rateDiff.momentum * 100).toFixed(1)}bp reversal`)
      transitionScore += 1
    }
  }
  if (regimeKey === 'RATE_QUOTE_EXPANDING') {
    if (rateDiff.momentum != null && rateDiff.momentum > 0.05) {
      signals.push(`Rate momentum reversing positive — differential compressing`)
      transitionScore += 1
    }
  }

  // Risk regime contradictions
  if (regimeKey === 'RISK_ON' && risk.riskOffScore > 0.3) {
    signals.push(`Risk-on regime but stress indicators elevated (riskOff: ${risk.riskOffScore.toFixed(2)})`)
    transitionScore += 1.5
  }
  if (regimeKey === 'RISK_OFF' && risk.riskOffScore < 0.3) {
    signals.push(`Risk-off regime but stress dissipating (riskOff: ${risk.riskOffScore.toFixed(2)})`)
    transitionScore += 1
  }

  // Commodity regime contradictions
  if ((regimeKey === 'COMMODITY_BULL' || regimeKey === 'COMMODITY_BEAR') && commodity != null) {
    if (Math.abs(commodity.momentum ?? 0) < 0.5) {
      signals.push(`Commodity regime but WTI momentum weakening (${(commodity.momentum ?? 0).toFixed(1)}%)`)
      transitionScore += 1
    }
  }

  // Cross-regime contradictions — risk rising while rate regime dominant
  if ((regimeKey === 'RATE_BASE_EXPANDING' || regimeKey === 'RATE_QUOTE_EXPANDING') && risk.riskOffScore > 0.4) {
    signals.push(`Rate regime but risk stress elevated — safe haven flows may override`)
    transitionScore += 0.75
  }

  const isTransitioning = transitionScore >= 1.5
  const confidence = transitionScore <= 0.5 ? 'HIGH'
                   : transitionScore <= 1.5 ? 'MEDIUM' : 'LOW'

  const sizeMult = isTransitioning ? 0.55
                 : confidence === 'MEDIUM' ? 0.80 : 1.0

  return {
    confidence,
    isTransitioning,
    sizeMult,
    signals,
    transitionScore: Math.round(Math.min(4, transitionScore) * 10) / 10,
  }
}

// ── Overall Score ──────────────────────────────────────────────────────────────
// Blends rate differential, risk environment, and commodity into a single [-1, +1] score.
// Weights shift based on whether the pair has a commodity driver.
//
// Risk contribution: riskSens scales the directional effect of risk flows.
//   Positive riskSens means the pair rises in risk-on (risk is net bullish for base).
//   The formula: riskSens * (riskOffScore - riskOnScore * 0.5) captures both:
//     - Risk-off headwind/tailwind proportional to how risk-sensitive the pair is
//     - Risk-on partial offset (0.5 weight because risk-on is typically less extreme)
function computeOverallScore(scores, cfg) {
  const { rateDiff, risk, commodity } = scores

  const rateWeight = cfg.commodityKey ? 0.45 : 0.60
  const riskWeight = cfg.commodityKey ? 0.35 : 0.40
  const commWeight = cfg.commodityKey ? 0.20 : 0.00

  const riskComponent = cfg.riskSens * (risk.riskOffScore - risk.riskOnScore * 0.5)
  const commComponent = commodity?.score ?? 0

  const raw = rateDiff.score * rateWeight
            + riskComponent  * riskWeight
            + commComponent  * commWeight

  return Math.max(-1, Math.min(1, raw))
}

// ── Main FX Macro Model ────────────────────────────────────────────────────────
// Computes the full macro regime model for a single FX pair.
// Returns null if FRED data unavailable or pair not in PAIR_DRIVERS.
//
// Call after FRED data loads (not every price tick — FRED data updates slowly).
export function computeFXMacroModel(pair) {
  const f = S.fredData
  if (!f) return null

  const cfg = PAIR_DRIVERS[pair]
  if (!cfg) return null

  // ── Component scores ──────────────────────────────────────────────────────
  const rateDiff = scoreRateDiff(f, cfg)
  const risk     = scoreRisk(f)
  const commodity = scoreCommodity(f, cfg)

  const scores = { rateDiff, risk, commodity }

  // ── Regime classification ─────────────────────────────────────────────────
  const regimeKey = classifyFXRegime(scores, cfg)
  const meta      = FX_REGIME_META[regimeKey]

  // ── Pair-specific bias ────────────────────────────────────────────────────
  const regimeBias = computePairBias(regimeKey, scores, cfg)

  // ── Regime confidence ─────────────────────────────────────────────────────
  const regimeConfidence = assessFXConfidence(scores, regimeKey)

  // ── Overall score [-1, +1] ────────────────────────────────────────────────
  const score = computeOverallScore(scores, cfg)

  // ── Signal direction and strength ─────────────────────────────────────────
  const signal   = score > 0.1 ? 'BULLISH' : score < -0.1 ? 'BEARISH' : 'NEUTRAL'
  const strength = Math.abs(score) > 0.55 ? 'STRONG'
                 : Math.abs(score) > 0.25 ? 'MODERATE' : 'WEAK'

  // ── Regime summary (plain-English) ────────────────────────────────────────
  let regimeSummary = meta.description
  if (cfg.nzdProxy) {
    regimeSummary += ' (NZD rate proxied via AUD short rate — no RBNZ data on FRED)'
  }

  // Bias emoji for the summary line
  const biasEmoji = regimeBias === 'BULLISH' ? '↑' : regimeBias === 'BEARISH' ? '↓' : '↔'
  const biasLine = `${biasEmoji} ${pair} bias: ${regimeBias} under ${meta.label}`

  return {
    pair,
    regime:           regimeKey,
    regimeLabel:      meta.label,
    regimeEmoji:      meta.emoji,
    regimeBias,
    regimeSummary,
    biasLine,

    signal,
    strength,
    score: Math.round(score * 1000) / 1000,

    regimeConfidence,

    // Component scores for detailed display and alert formatting
    factors: {
      rateDiff,
      risk,
      commodity,
    },

    // Driver config for downstream consumers
    cfg,

    computedAt: Date.now(),
  }
}
