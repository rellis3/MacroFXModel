/**
 * Regime Confidence Engine
 *
 * Synthesises HMM state probabilities, GARCH clustering, ARMA transition risk,
 * and Hurst exponent into a continuous sizing multiplier.
 *
 * Core insight: volatility measures regime *confidence*, not just vol level.
 * When vol is expanding (GARCH > ATR), the regime itself is likely transitioning —
 * reduce size defensively regardless of which regime we're in.
 *
 * Sizing scale: 0.25 (regime in flux, high transition risk) → 1.0 (high confidence, stable)
 */

/**
 * @param {object|null} hmm         — output of fitHMM(): { regime, rangeProb, trendProb, sigmaRatio }
 * @param {object|null} garch       — garch sub-object from calculateVolRegime(): { cluster, volImpulsePct }
 * @param {object|null} armaResult  — computeRegimeTransition() result: { lowVolPersistenceFlag, ... }
 * @param {number|null} hurst       — Hurst exponent (0.3–0.7 typical range)
 * @param {number|null} arimaStability — residualStability from computeArimaContext() (0–1)
 * @returns {object} regimeConfidence, transitionRisk, sizingMult, defensiveMode, label, components, narrative
 */
export function computeRegimeConfidence(hmm, garch, armaResult, hurst, arimaStability = null) {
  // 1. HMM state certainty — distance from 50/50 ambiguity
  //    rangeProb near 0.5 means the model cannot decide → very low certainty
  const rangeProb    = hmm?.rangeProb ?? 0.5;
  const hmmCertainty = Math.abs(rangeProb - 0.5) * 2; // 0 = coin-flip, 1 = certain

  // 2. GARCH cluster — is vol expanding (regime breaking) or settling?
  const cluster        = garch?.cluster ?? 'STABLE';
  const garchStability = cluster === 'EXPANDING'   ? 0.55
                       : cluster === 'CONTRACTING' ? 0.85
                       : 1.0;

  // 3. Vol impulse — rapid vol acceleration signals a potential regime break
  const volImpulsePct  = Math.abs(garch?.volImpulsePct ?? 0);
  const impulseDiscount = volImpulsePct > 30 ? 0.75
                        : volImpulsePct > 15 ? 0.90
                        : 1.0;

  // 4. ARMA low-vol persistence danger — prolonged calm precedes violent regime shifts
  const lowVolFlag  = armaResult?.lowVolPersistenceFlag ?? false;
  const armaFactor  = lowVolFlag ? 0.75 : 1.0;

  // 5. HMM sigma ratio — how well-separated are RANGE and TREND states?
  //    sigmaRatio < 1.2 means states look similar → we can't tell which regime we're in
  const sigmaRatio        = hmm?.sigmaRatio ?? 2.0;
  const separationClarity = sigmaRatio < 1.1 ? 0.60
                          : sigmaRatio < 1.3 ? 0.80
                          : 1.0;

  // 6. Hurst alignment — does H confirm the HMM's current regime classification?
  let hurstBonus = 0;
  if (hurst != null && hmm?.regime) {
    if (hmm.regime === 'RANGE') {
      hurstBonus = hurst < 0.45 ? 0.08 : hurst > 0.55 ? -0.08 : 0;
    } else {
      hurstBonus = hurst > 0.55 ? 0.08 : hurst < 0.45 ? -0.08 : 0;
    }
  }

  // 7. ARIMA price residual stability — erratic residuals signal regime breakdown
  //    Default 0.85 when not yet computed (conservative, not punishing)
  const arimaFactor = arimaStability ?? 0.85;

  // Combined regime confidence (multiplicative — weakest link dominates)
  const rawConfidence    = hmmCertainty * garchStability * impulseDiscount * armaFactor * separationClarity * arimaFactor;
  const regimeConfidence = Math.max(0.05, Math.min(1.0, rawConfidence + hurstBonus));

  // Transition risk: the highest individual signal determines defensive posture
  const transitionRisk = Math.max(
    1 - hmmCertainty,
    cluster === 'EXPANDING'   ? 0.65 : cluster === 'CONTRACTING' ? 0.30 : 0,
    lowVolFlag                ? 0.55 : 0,
    sigmaRatio < 1.2          ? 0.55 : 0,
    volImpulsePct > 30        ? 0.50 : 0,
    arimaFactor < 0.50        ? 0.60 : arimaFactor < 0.70 ? 0.35 : 0,
  );

  // Sizing multiplier — smooth continuous scale from 0.25 to 1.0
  // Base shifts from 0.35 (zero confidence) to 1.0 (full confidence),
  // then discounted up to 45% by transition risk.
  const confidenceAdj = 0.35 + 0.65 * regimeConfidence;
  const transitionDisc = transitionRisk * 0.45;
  const sizingMult = Math.max(0.25, Math.round(confidenceAdj * (1 - transitionDisc) * 100) / 100);

  const defensiveMode = transitionRisk > 0.55 || regimeConfidence < 0.30;

  const label = defensiveMode       ? 'DEFENSIVE'
    : regimeConfidence > 0.72       ? 'HIGH_CONFIDENCE'
    : regimeConfidence > 0.45       ? 'MODERATE'
    : 'LOW_CONFIDENCE';

  return {
    regimeConfidence: Math.round(regimeConfidence * 100) / 100,
    transitionRisk:   Math.round(transitionRisk   * 100) / 100,
    sizingMult,
    defensiveMode,
    label,
    components: {
      hmmCertainty:      Math.round(hmmCertainty      * 100) / 100,
      garchStability,
      impulseDiscount,
      armaFactor,
      separationClarity,
      hurstBonus:        Math.round(hurstBonus         * 100) / 100,
      arimaFactor:       Math.round(arimaFactor        * 100) / 100,
    },
    narrative: _buildNarrative(
      regimeConfidence, transitionRisk, cluster, lowVolFlag, hmmCertainty, sigmaRatio, volImpulsePct, arimaFactor
    ),
  };
}

function _buildNarrative(confidence, transitionRisk, cluster, lowVolFlag, hmmCertainty, sigmaRatio, impulse, arimaFactor) {
  const parts = [];
  if (hmmCertainty < 0.30) parts.push('HMM near 50/50 state split — regime ambiguous');
  if (cluster === 'EXPANDING') parts.push('GARCH vol expanding — regime may be breaking');
  if (cluster === 'CONTRACTING') parts.push('Vol contracting — new regime forming');
  if (lowVolFlag) parts.push('Prolonged low-vol persistence — shock risk elevated');
  if (sigmaRatio < 1.2) parts.push('RANGE/TREND states poorly separated');
  if (impulse > 30) parts.push(`Vol impulse +${impulse.toFixed(0)}% — accelerating`);
  if (arimaFactor < 0.50) parts.push('ARIMA residuals very erratic — price behaving unpredictably');
  else if (arimaFactor < 0.70) parts.push('ARIMA residuals elevated — some regime uncertainty');
  if (transitionRisk > 0.55) parts.push('⚠ Transition risk HIGH — defensive sizing active');
  return parts.length > 0 ? parts.join('; ') : 'Regime stable — full confidence';
}

/**
 * Range Utilisation Context
 *
 * If the market has already consumed most of its expected daily GARCH range,
 * breakout continuation odds collapse and mean-reversion probability rises.
 *
 * Example: expected range = 60 pips, already moved 52 pips by 14:00 →
 *   breakoutFilter = true, reversionFavoured = true
 *
 * @param {object} volRegime — output of calculateVolRegime()
 * @returns {object} usedPct, remainingPips, rangeLabel, breakoutOdds, reversionBias, breakoutFilter, reversionFavoured
 */
export function computeRangeContext(volRegime) {
  const usedPct       = volRegime?.usedPct       ?? 0;
  const remainingPips = volRegime?.remainingPips  ?? 0;

  let rangeLabel, breakoutOdds, reversionBias;

  if (usedPct < 25) {
    rangeLabel    = 'EARLY_SESSION';
    breakoutOdds  = 'HIGH';
    reversionBias = 'LOW';
  } else if (usedPct < 55) {
    rangeLabel    = 'MID_SESSION';
    breakoutOdds  = 'MODERATE';
    reversionBias = 'MODERATE';
  } else if (usedPct < 80) {
    rangeLabel    = 'EXTENDED';
    breakoutOdds  = 'LOW';
    reversionBias = 'HIGH';
  } else {
    rangeLabel    = 'EXHAUSTED';
    breakoutOdds  = 'VERY_LOW';
    reversionBias = 'VERY_HIGH';
  }

  const breakoutFilter    = usedPct > 75;
  const reversionFavoured = usedPct > 55;

  return {
    usedPct,
    remainingPips:    Math.round(remainingPips),
    rangeLabel,
    breakoutOdds,
    reversionBias,
    breakoutFilter,
    reversionFavoured,
    narrative: `Range ${usedPct}% used, ${Math.round(remainingPips)} pips remaining — ${rangeLabel}. Breakout odds: ${breakoutOdds}. Reversion bias: ${reversionBias}.`,
  };
}
