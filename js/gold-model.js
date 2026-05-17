// js/gold-model.js — Gold Two-Layer Macro Model
//
// Theory: Gold is a repricing asset. The alpha lives in the RATE OF CHANGE of
// macro factors, not static levels. 2022: BEI was ~9% (bullish from level),
// but TIPS momentum was sharply positive (Fed hiking fast) → gold sold off
// because real yield momentum overwhelmed the inflation level entirely.
//
// Architecture:
//   Layer 1 (Level)    — structural opportunity cost context
//   Layer 2 (Momentum) — where the repricing alpha lives
//   Adaptive Weights   — regime determines which layer dominates
//   Breakeven Decomp   — expected inflation vs uncertainty continuum
//   Regime Confidence  — stable vs transitioning (Hurst-like persistence proxy)
//
// Factors:
//   Breakeven momentum  → inflation repricing signal
//   Real yield momentum → policy shock flow (overrides level in tightening)
//   DXY momentum        → global dollar scarcity
//   VIX + HY spread     → rates uncertainty / safe haven demand proxy
//   2Y yield momentum   → Fed pricing / policy credibility proxy

import { S } from './state.js';

// ── Regime Adaptive Weight Tables ─────────────────────────────────────────────
// Weights sum to 1.0 in each regime. The regime determines which factor gets
// the most signal weight.
const REGIME_WEIGHTS = {
  // Real yields falling, DXY weak — breakeven momentum carries the primary signal
  QE_EXPANSION: {
    realYieldLevel: 0.10, realYieldMomentum: 0.25,
    breakevenLevel: 0.15, breakevenMomentum: 0.30,
    dxyMomentum: 0.15,    safeHaven: 0.05,
  },
  // Real yields rising fast (2022 scenario) — real yield momentum overwhelms everything
  AGGRESSIVE_TIGHTENING: {
    realYieldLevel: 0.10, realYieldMomentum: 0.40,
    breakevenLevel: 0.05, breakevenMomentum: 0.15,
    dxyMomentum: 0.25,    safeHaven: 0.05,
  },
  // VIX spiking, credit stress — safe haven flows override macro fundamentals
  CRISIS: {
    realYieldLevel: 0.05, realYieldMomentum: 0.15,
    breakevenLevel: 0.05, breakevenMomentum: 0.10,
    dxyMomentum: 0.20,    safeHaven: 0.45,
  },
  // BEI rising faster than TIPS — inflation risk premium expanding (not just expectation)
  FISCAL_DOMINANCE: {
    realYieldLevel: 0.10, realYieldMomentum: 0.10,
    breakevenLevel: 0.25, breakevenMomentum: 0.35,
    dxyMomentum: 0.15,    safeHaven: 0.05,
  },
  // Inflation elevated but real yields rising — conflicted environment
  STAGFLATION: {
    realYieldLevel: 0.20, realYieldMomentum: 0.30,
    breakevenLevel: 0.15, breakevenMomentum: 0.15,
    dxyMomentum: 0.15,    safeHaven: 0.05,
  },
  // No dominant signal — balanced across all factors
  NEUTRAL: {
    realYieldLevel: 0.20, realYieldMomentum: 0.20,
    breakevenLevel: 0.15, breakevenMomentum: 0.20,
    dxyMomentum: 0.15,    safeHaven: 0.10,
  },
};

// ── Regime Metadata ────────────────────────────────────────────────────────────
const REGIME_META = {
  QE_EXPANSION: {
    label: 'QE / Liquidity Expansion',
    description: 'Real yields falling, DXY weak. Breakeven momentum carries the signal. Weight BEI heavier.',
    goldBias: 'BULLISH', emoji: '🟢',
  },
  AGGRESSIVE_TIGHTENING: {
    label: 'Aggressive Tightening',
    description: 'Real yield momentum dominant — overwhelms inflation level. TIPS momentum is the primary driver.',
    goldBias: 'BEARISH', emoji: '🔴',
  },
  CRISIS: {
    label: 'Crisis / Safe Haven',
    description: 'Safe haven flows override macro fundamentals. VIX and credit stress driving gold.',
    goldBias: 'BULLISH', emoji: '🟡',
  },
  FISCAL_DOMINANCE: {
    label: 'Fiscal Dominance',
    description: 'Inflation risk premium expanding. BEI rising faster than TIPS — uncertainty premium building.',
    goldBias: 'BULLISH', emoji: '🟠',
  },
  STAGFLATION: {
    label: 'Stagflation',
    description: 'Elevated inflation but real yields rising. Real yield pressure moderates gold upside.',
    goldBias: 'MIXED', emoji: '🟤',
  },
  NEUTRAL: {
    label: 'Neutral Macro',
    description: 'No dominant macro regime. Balanced weighting across all factors.',
    goldBias: 'NEUTRAL', emoji: '⚪',
  },
};

// ── Component Scoring Functions ────────────────────────────────────────────────
// Each returns [-1, +1]: positive = bullish gold.

function scoreTipsLevel(tips) {
  if (tips == null) return 0;
  if (tips < -0.5) return  1.0;  // negative real yield: no opportunity cost to hold gold
  if (tips <  0.0) return  0.7;
  if (tips <  0.5) return  0.3;
  if (tips <  1.0) return  0.0;  // neutral zone
  if (tips <  1.5) return -0.4;  // real yield rising — opportunity cost increasing
  if (tips <  2.0) return -0.7;
  return -1.0;
}

function scoreTipsMomentum(change) {
  // Rate of change is the alpha layer — falling real yields more bullish than level alone
  if (change == null) return 0;
  if (change < -0.15) return  1.0;
  if (change < -0.08) return  0.7;
  if (change < -0.03) return  0.4;
  if (change >  0.15) return -1.0;
  if (change >  0.08) return -0.7;
  if (change >  0.03) return -0.4;
  return 0;
}

function scoreBreakevenLevel(bei) {
  if (bei == null) return 0;
  if (bei > 3.0)  return  1.0;  // market pricing high inflation: gold hedge demand
  if (bei > 2.5)  return  0.6;
  if (bei > 2.2)  return  0.3;
  if (bei > 2.0)  return  0.1;
  if (bei < 1.5)  return -0.5;  // deflationary: reduces gold's inflation hedge role
  if (bei < 1.8)  return -0.2;
  return 0;
}

function scoreBreakevenMomentum(change) {
  // Inflation repricing — the market re-pricing future inflation is where the alpha is
  if (change == null) return 0;
  if (change >  0.08) return  1.0;
  if (change >  0.04) return  0.6;
  if (change >  0.01) return  0.3;
  if (change < -0.08) return -1.0;
  if (change < -0.04) return -0.6;
  if (change < -0.01) return -0.3;
  return 0;
}

function scoreDxyMomentum(pctChange) {
  // Dollar weakening → capital flows away from USD → bullish gold
  if (pctChange == null) return 0;
  if (pctChange < -0.5)  return  1.0;
  if (pctChange < -0.2)  return  0.6;
  if (pctChange < -0.05) return  0.3;
  if (pctChange >  0.5)  return -1.0;
  if (pctChange >  0.2)  return -0.6;
  if (pctChange >  0.05) return -0.3;
  return 0;
}

function scoreSafeHaven(vix, vixChange, hy, hyChange) {
  // VIX (rates uncertainty proxy, not just equity fear) + HY credit stress
  let score = 0, count = 0;

  if (vix != null) {
    let s = vix > 35 ? 1.0 : vix > 25 ? 0.6 : vix > 20 ? 0.2 : vix < 15 ? -0.3 : 0;
    if (vixChange != null) {
      if      (vixChange >  5) s += 0.30;
      else if (vixChange >  2) s += 0.15;
      else if (vixChange < -3) s -= 0.15;
    }
    score += Math.max(-1, Math.min(1, s));
    count++;
  }

  if (hy != null) {
    const hyBps = hy * 100;
    let s = hyBps > 600 ? 1.0 : hyBps > 500 ? 0.6 : hyBps > 400 ? 0.2 : hyBps < 300 ? -0.3 : 0;
    if (hyChange != null) {
      const chgBps = hyChange * 100;
      if      (chgBps >  30) s += 0.30;
      else if (chgBps >  10) s += 0.10;
      else if (chgBps < -20) s -= 0.15;
    }
    score += Math.max(-1, Math.min(1, s));
    count++;
  }

  return count > 0 ? score / count : 0;
}

// ── Breakeven Decomposition ────────────────────────────────────────────────────
// BEI ≠ pure inflation expectation. It also encodes:
//   - Inflation risk premium (uncertainty about future inflation)
//   - Liquidity premium
//
// Key insight: is gold responding to EXPECTED inflation or INFLATION UNCERTAINTY?
//   Model as a continuum using divergence between BEI and TIPS momentum.
//
// When BEI momentum > TIPS momentum: risk premium expanding — uncertainty dominant.
//   Gold can rally on uncertainty even if expected inflation is stable.
// When TIPS momentum > BEI momentum: real yield pressure dominant.
//   Classic bearish pressure from rising real rates.
function decomposeBreakeven(tips, tipsPrev, bei, beiPrev) {
  if (bei == null || tips == null) return null;

  const beiMom  = beiPrev  != null ? bei  - beiPrev  : null;
  const tipsMom = tipsPrev != null ? tips - tipsPrev  : null;
  const divergence = (beiMom != null && tipsMom != null) ? beiMom - tipsMom : null;

  let dominantDriver, interpretation;
  if (divergence == null) {
    dominantDriver = 'unknown';
    interpretation = 'Insufficient data for decomposition';
  } else if (divergence > 0.05) {
    dominantDriver = 'uncertainty_premium';
    interpretation = 'Uncertainty premium expanding — BEI diverging positively from TIPS';
  } else if (divergence < -0.05) {
    dominantDriver = 'real_yield_dominant';
    interpretation = 'Real yield pressure dominant — TIPS moving faster than BEI';
  } else {
    dominantDriver = 'aligned';
    interpretation = 'BEI and TIPS moving together — pure inflation repricing';
  }

  // Implied nominal yield = real yield + breakeven (Fisher equation proxy)
  const impliedNominal = (tips != null && bei != null) ? parseFloat((tips + bei).toFixed(3)) : null;

  return {
    expectedInflation: bei,
    realYield: tips,
    impliedNominal,
    beiMomentum: beiMom,
    tipsMomentum: tipsMom,
    divergence,
    dominantDriver,
    interpretation,
    // Score contribution: uncertainty premium is gold-bullish, real yield dominant is bearish
    score: divergence != null
      ? (divergence > 0.05 ? 0.3 : divergence < -0.05 ? -0.3 : 0)
      : 0,
  };
}

// ── Gold Regime Classification ─────────────────────────────────────────────────
// Uses momentum signals to classify the macro environment for gold pricing.
// This determines adaptive weights in the composite score.
function classifyGoldRegime(f) {
  const tips     = f.tips?.value;
  const tipsPrev = f.tips?.prev;
  const bei      = f.bei?.value;
  const beiPrev  = f.bei?.prev;
  const dxy      = f.dxy?.value;
  const dxyPrev  = f.dxy?.prev;
  const vix      = f.vix?.value;
  const hy       = f.hy?.value;
  const us2y     = f.us2y?.value;
  const us2yPrev = f.us2y?.prev;

  const tipsMom = (tips != null && tipsPrev != null) ? tips - tipsPrev : null;
  const beiMom  = (bei  != null && beiPrev  != null) ? bei  - beiPrev  : null;
  const dxyMom  = (dxy  != null && dxyPrev  != null) ? (dxy / dxyPrev - 1) * 100 : null;
  const us2yMom = (us2y != null && us2yPrev != null) ? us2y - us2yPrev : null;

  // Crisis overrides all else — safe haven demand takes over
  if ((vix != null && vix > 30) || (hy != null && hy * 100 > 500)) {
    return { regime: 'CRISIS', tipsMom, beiMom, dxyMom, us2yMom };
  }

  // Aggressive Tightening: multiple tightening signals firing simultaneously
  // 2Y momentum used as Fed pricing proxy (most FOMC-sensitive tenor)
  const tightSignals = [
    tipsMom != null && tipsMom > 0.08,   // real yields rising fast
    us2yMom != null && us2yMom > 0.15,   // Fed pricing tighter (2Y most sensitive)
    dxyMom  != null && dxyMom  > 0.30,   // dollar strengthening (capital repatriation)
  ].filter(Boolean).length;
  if (tightSignals >= 2) return { regime: 'AGGRESSIVE_TIGHTENING', tipsMom, beiMom, dxyMom, us2yMom };

  // Fiscal Dominance: BEI rising faster than TIPS — inflation risk premium expanding
  // This is the "uncertainty is rising even if real yields stable" scenario
  if (beiMom != null && tipsMom != null && (beiMom - tipsMom) > 0.05 && beiMom > 0.02) {
    return { regime: 'FISCAL_DOMINANCE', tipsMom, beiMom, dxyMom, us2yMom };
  }

  // QE / Liquidity Expansion: real yields falling, conditions loosening
  const easySignals = [
    tipsMom != null && tipsMom < -0.05,
    dxyMom  != null && dxyMom  < -0.20,
    f.vix?.value != null && f.vix?.prev != null && f.vix.value < f.vix.prev * 0.92,
  ].filter(Boolean).length;
  if (easySignals >= 2) return { regime: 'QE_EXPANSION', tipsMom, beiMom, dxyMom, us2yMom };

  // Stagflation: BEI elevated but real yields also rising
  if (bei != null && bei > 2.5 && tipsMom != null && tipsMom > 0.03) {
    return { regime: 'STAGFLATION', tipsMom, beiMom, dxyMom, us2yMom };
  }

  return { regime: 'NEUTRAL', tipsMom, beiMom, dxyMom, us2yMom };
}

// ── Regime Confidence / Transition Risk ────────────────────────────────────────
// Assesses how stable the current regime is vs actively transitioning.
// A transitioning regime means lower signal confidence and reduced position size.
//
// Hurst-like persistence proxy (without requiring historical data):
//   All momentum signals agree in direction → high persistence (trending, H > 0.55 analog)
//   Mixed momentum signals → low persistence (mean-reverting, H ≈ 0.5 analog)
//
// GARCH integration: high price vol from the vol engine signals regime uncertainty.
//
// Volatility regimes from vol.js are used to adjust the confidence level —
// the framework the user described: "use vol to measure regime confidence."
function assessRegimeConfidence(f, regimeData, volRegime) {
  const { regime, tipsMom, beiMom, dxyMom } = regimeData;
  const vix     = f.vix?.value;
  const vixPrev = f.vix?.prev;
  const hy      = f.hy?.value;
  const hyPrev  = f.hy?.prev;

  const signals = [];
  let transitionScore = 0;

  // 1. Internal regime consistency — momentum signals contradicting regime classification
  if (regime === 'AGGRESSIVE_TIGHTENING' && beiMom != null && beiMom > 0.05) {
    signals.push('BEI rising despite tightening — fiscal dominance risk');
    transitionScore += 1;
  }
  if (regime === 'QE_EXPANSION' && tipsMom != null && tipsMom > 0.05) {
    signals.push('Real yields rising in expansion — tightening may be starting');
    transitionScore += 1.5;
  }
  if (regime === 'FISCAL_DOMINANCE' && beiMom != null && beiMom < -0.05) {
    signals.push('BEI falling in fiscal dominance — inflation fear dissipating');
    transitionScore += 1;
  }
  if (regime === 'CRISIS' && vix != null && vixPrev != null && vix < vixPrev * 0.85) {
    signals.push('VIX falling sharply in crisis — risk appetite returning');
    transitionScore += 1;
  }

  // 2. VIX spike — sudden market stress = potential regime shift catalyst
  if (vix != null && vixPrev != null) {
    const vixChgPct = Math.abs(vix - vixPrev) / (vixPrev || 1) * 100;
    if      (vixChgPct > 15) { transitionScore += 1.5; signals.push(`VIX spike ${vixChgPct.toFixed(0)}%`); }
    else if (vixChgPct >  8) { transitionScore += 0.5; signals.push('VIX elevated change'); }
  }

  // 3. HY spread sudden move — credit is the first market to reprice regime shifts
  if (hy != null && hyPrev != null) {
    const hyChgBps = (hy - hyPrev) * 100;
    if      (hyChgBps >  40) { transitionScore += 1.0; signals.push(`HY widening +${hyChgBps.toFixed(0)}bps`); }
    else if (hyChgBps < -40) { transitionScore += 0.5; signals.push(`HY tightening ${hyChgBps.toFixed(0)}bps`); }
  }

  // 4. Momentum signal divergence — Hurst-like persistence proxy
  //    If signals are mixed in direction, regime persistence is LOW (H ≈ 0.5 analog)
  const momSignals = [tipsMom, beiMom, dxyMom].filter(v => v != null);
  let hurstProxy = null;
  if (momSignals.length >= 2) {
    const pos   = momSignals.filter(v => v >  0.01).length;
    const neg   = momSignals.filter(v => v < -0.01).length;
    const total = momSignals.length;
    // Mixed signals (both positive and negative) with neither dominating → low persistence
    if (pos > 0 && neg > 0 && Math.min(pos, neg) / total >= 0.33) {
      transitionScore += 0.75;
      signals.push('Momentum signals diverging — low persistence, possible transition');
    }
    // Estimate persistence: how much do signals agree?
    const dominantCount = Math.max(pos, neg);
    hurstProxy = total > 0 ? dominantCount / total : null; // 0.5 = random, 1.0 = all agree
  }

  // 5. GARCH price vol — HIGH vol regime means macro signals are less reliable
  if (volRegime?.regime === 'HIGH') {
    transitionScore += 0.75;
    signals.push('Gold price vol HIGH — macro signal less reliable');
  } else if (volRegime?.volBias === 'expanding') {
    transitionScore += 0.4;
    signals.push('Gold vol expanding — watch for regime shift');
  }

  const isTransitioning = transitionScore >= 1.5;
  const confidence = transitionScore <= 0.5 ? 'HIGH' :
                     transitionScore <= 1.5 ? 'MEDIUM' : 'LOW';

  // Size multiplier: regime confidence directly maps to position sizing
  // This implements "reduce position size because volatility is high" from user framework
  const sizeMult = isTransitioning ? 0.55 :
                   confidence === 'MEDIUM' ? 0.80 : 1.0;

  return {
    confidence,
    transitionScore: Math.round(Math.min(4, transitionScore) * 10) / 10,
    isTransitioning,
    signals,
    sizeMult,
    hurstProxy, // rough trend persistence proxy (0.5 = mixed, 1.0 = all agree)
  };
}

// ── Main Gold Model ────────────────────────────────────────────────────────────
// Call after FRED data loads. Result stored in S.goldModel.
// volRegime: optional output from calculateVolRegime() — used for confidence assessment.
export function computeGoldMacroModel(volRegime) {
  const f = S.fredData;
  if (!f) return null;

  const tips     = f.tips?.value;
  const tipsPrev = f.tips?.prev;
  const tips5    = f.tips5?.value;
  const bei      = f.bei?.value;
  const beiPrev  = f.bei?.prev;
  const dxy      = f.dxy?.value;
  const dxyPrev  = f.dxy?.prev;
  const vix      = f.vix?.value;
  const vixPrev  = f.vix?.prev;
  const hy       = f.hy?.value;
  const hyPrev   = f.hy?.prev;
  const us2y     = f.us2y?.value;
  const us2yPrev = f.us2y?.prev;
  const nfci     = f.nfci?.value;

  // ── Momentum (rate of change — the alpha layer) ────────────────────────────
  const tipsMom   = (tips != null && tipsPrev != null) ? tips - tipsPrev : null;
  const beiMom    = (bei  != null && beiPrev  != null) ? bei  - beiPrev  : null;
  const dxyMom    = (dxy  != null && dxyPrev  != null) ? (dxy / dxyPrev - 1) * 100 : null;
  const vixChange = (vix  != null && vixPrev  != null) ? vix  - vixPrev  : null;
  const hyChange  = (hy   != null && hyPrev   != null) ? hy   - hyPrev   : null;
  const us2yMom   = (us2y != null && us2yPrev != null) ? us2y - us2yPrev : null;

  // ── Regime Classification ──────────────────────────────────────────────────
  const regimeData = classifyGoldRegime(f);
  const { regime } = regimeData;
  const weights    = REGIME_WEIGHTS[regime];
  const meta       = REGIME_META[regime];

  // ── Layer 1: Level scores (structural context) ─────────────────────────────
  const realYieldLevelScore = scoreTipsLevel(tips);
  const breakevenLevelScore = scoreBreakevenLevel(bei);

  // ── Layer 2: Momentum scores (primary alpha) ───────────────────────────────
  const realYieldMomentumScore = scoreTipsMomentum(tipsMom);
  const breakevenMomentumScore = scoreBreakevenMomentum(beiMom);
  const dxyMomentumScore       = scoreDxyMomentum(dxyMom);
  const safeHavenScore         = scoreSafeHaven(vix, vixChange, hy, hyChange);

  // ── Weighted composite gold score ──────────────────────────────────────────
  const rawScore =
    weights.realYieldLevel    * realYieldLevelScore    +
    weights.realYieldMomentum * realYieldMomentumScore +
    weights.breakevenLevel    * breakevenLevelScore    +
    weights.breakevenMomentum * breakevenMomentumScore +
    weights.dxyMomentum       * dxyMomentumScore       +
    weights.safeHaven         * safeHavenScore;

  const goldScore = Math.max(-1, Math.min(1, rawScore));

  // ── Signal direction and strength ──────────────────────────────────────────
  const signal   = goldScore > 0.25 ? 'BULLISH' : goldScore < -0.25 ? 'BEARISH' : 'NEUTRAL';
  const strength = Math.abs(goldScore) > 0.60 ? 'STRONG'
                 : Math.abs(goldScore) > 0.30 ? 'MODERATE' : 'WEAK';

  // T1 tier score [-3, +3] for integration with the existing tier system
  const t1Score = Math.max(-3, Math.min(3, Math.round(goldScore * 3)));

  // ── Breakeven decomposition ────────────────────────────────────────────────
  const beiDecomp = decomposeBreakeven(tips, tipsPrev, bei, beiPrev);

  // ── Regime confidence / transition risk ───────────────────────────────────
  const regimeConf = assessRegimeConfidence(f, { regime, tipsMom, beiMom, dxyMom }, volRegime ?? null);

  // Fed pricing proxy: 2Y momentum (most FOMC-sensitive tenor)
  const fedPricingSignal = us2yMom != null
    ? (us2yMom >  0.15 ? 'Pricing Fed hikes'
    :  us2yMom < -0.15 ? 'Pricing Fed cuts'
    :  'Fed pricing stable')
    : null;

  // NFCI integration: tight financial conditions compound real yield pressure on gold
  const nfciSignal = nfci != null
    ? (nfci >  0.5 ? 'Tight conditions — amplifies real yield headwind'
    :  nfci < -0.5 ? 'Loose conditions — supports gold via liquidity'
    :  null)
    : null;

  return {
    // ── Core output ──────────────────────────────────────────────────────────
    regime,
    regimeLabel:       meta.label,
    regimeDescription: meta.description,
    regimeBias:        meta.goldBias,
    regimeEmoji:       meta.emoji,
    signal,
    strength,
    goldScore: Math.round(goldScore * 1000) / 1000,
    t1Score,

    // ── Raw data ─────────────────────────────────────────────────────────────
    tips, tipsMom, tips5, bei, beiMom,
    dxy, dxyMom,
    vix, vixChange,
    hyBps: hy != null ? Math.round(hy * 100) : null,
    hyChangeBps: hyChange != null ? Math.round(hyChange * 100) : null,
    us2y, us2yMom, nfci,

    // ── Two-layer breakdown ───────────────────────────────────────────────────
    layers: {
      level: {
        realYield: {
          score: realYieldLevelScore,
          value: tips,
          label: tips != null ? `TIPS ${tips.toFixed(2)}%` : null,
        },
        breakeven: {
          score: breakevenLevelScore,
          value: bei,
          label: bei != null ? `BEI ${bei.toFixed(2)}%` : null,
        },
      },
      momentum: {
        realYield: {
          score: realYieldMomentumScore,
          change: tipsMom,
          label: tipsMom != null ? `Real Yield ${tipsMom > 0 ? '+' : ''}${(tipsMom * 100).toFixed(1)}bp` : null,
        },
        breakeven: {
          score: breakevenMomentumScore,
          change: beiMom,
          label: beiMom != null ? `BEI ${beiMom > 0 ? '+' : ''}${(beiMom * 100).toFixed(1)}bp` : null,
        },
        dxy: {
          score: dxyMomentumScore,
          change: dxyMom,
          label: dxyMom != null ? `DXY ${dxyMom > 0 ? '+' : ''}${dxyMom.toFixed(2)}%` : null,
        },
        safeHaven: {
          score: safeHavenScore,
          label: `VIX ${vix?.toFixed(0) ?? '—'} / HY ${hy != null ? Math.round(hy * 100) : '—'}bp`,
        },
      },
    },

    // ── Adaptive weights (regime-specific) ────────────────────────────────────
    weights,

    // ── Breakeven decomposition ───────────────────────────────────────────────
    beiDecomp,

    // ── Regime confidence ─────────────────────────────────────────────────────
    regimeConfidence: regimeConf,

    // ── Contextual signals ────────────────────────────────────────────────────
    fedPricingSignal,
    nfciSignal,

    computedAt: Date.now(),
  };
}

// ── Gold T1 Tier ───────────────────────────────────────────────────────────────
// Drop-in replacement for the existing basic gold T1 in macro.js.
// Returns the standard tier shape with the full gold model attached.
export function computeGoldT1(volRegime) {
  const model = computeGoldMacroModel(volRegime);

  if (!model) {
    return {
      tier: 'T1', name: 'Gold Macro (TIPS+BEI)', max: 3, score: 0,
      val: '—', reading: 'Data unavailable', source: 'Gold Model',
      isMonthly: false, na: true,
    };
  }

  const conf    = model.regimeConfidence;
  const confTag = conf.isTransitioning ? ' ⚠ transitioning' : '';
  const sizeTag = conf.sizeMult < 1.0 ? ` [size ×${conf.sizeMult}]` : '';

  return {
    tier: 'T1',
    name: 'Gold Macro (TIPS+BEI)',
    max: 3,
    score: model.t1Score,
    val: `${model.regimeEmoji} ${model.signal} ${model.strength}${confTag}`,
    reading: `${model.regimeDescription}${sizeTag}`,
    source: `TIPS ${model.tips?.toFixed(2) ?? '—'}% · BEI ${model.bei?.toFixed(2) ?? '—'}% · ${model.regimeLabel}`,
    isMonthly: false,
    goldModel: model,
  };
}
