// js/nasdaqLiquidityEngine.js
//
// Gate 1 — Liquidity Engine. Turns the daily LIQUIDITY_INPUTS panel
// (nasdaqConfig.js) into one LiquidityScore per trading day, with full
// per-component visibility (raw value, ROC, rolling z-score, signed/clipped
// z-score, weighted contribution) so every number behind the final score
// can be inspected — never just a headline number.
//
// Method (intentionally simple, not a black box):
//   1. Align each input's raw print series onto the trading-day calendar,
//      respecting its real publicationLagDays (no lookahead — a print is
//      invisible to the backtest until its real-world publication date).
//   2. Compute rate-of-change: roc[i] = level[i] - level[i - rocLookbackDays].
//      This converts slowly-drifting level series into a momentum series.
//   3. Normalize the ROC by its trailing std-dev (NOT a z-score — the mean is
//      NOT subtracted). A z-score of roc would wash out for constant-pace QT:
//      if QT runs at -50B/quarter for 252 days, all roc ≈ -50, mean ≈ -50,
//      z ≈ 0 → NEUTRAL. Dividing by std only gives -50/30 = -1.67 → persistent
//      BEARISH reading. `zWindowDays` drives the std-dev lookback window.
//   4. Apply the input's `sign` so a positive normalised value always means
//      "more bullish for liquidity", then clip to +/- zClip std devs.
//   5. Weighted average of signed/clipped values (weight-present only —
//      missing inputs are excluded, not treated as zero), rescaled from
//      [-zClip, +zClip] onto LIQUIDITY_SCORE.range.
//   6. Classify: score > bullishThreshold => BULLISH, score < bearishThreshold
//      => BEARISH, else NEUTRAL. If less than minCoverage of the panel (by
//      weight) has data, the score is null and dataValid is false — Gate 1
//      cannot rule either direction in or out for that day.
//
// Self-contained: does not import from, or share logic with, any other
// gate/backtest system already in this repository.

import { LIQUIDITY_INPUTS, LIQUIDITY_SCORE } from './nasdaqConfig.js';
import { applyPublicationLag, forwardFillOnto, rollingStdNorm, rollingRoc, clip } from './nasdaqTransforms.js';

const SCALE = LIQUIDITY_SCORE.range[1] / LIQUIDITY_SCORE.zClip;

// rawByInputId: { [input.id]: [{date,value}, ...] } ascending, unlagged raw prints.
// tradingDates: ascending ['YYYY-MM-DD', ...] calendar to align everything onto.
export function alignLiquidityInputs(rawByInputId, tradingDates) {
  const aligned = {};
  for (const input of LIQUIDITY_INPUTS) {
    const raw = rawByInputId[input.id] || [];
    const lagged = applyPublicationLag(raw, input.publicationLagDays);
    aligned[input.id] = forwardFillOnto(lagged, tradingDates);
  }
  return aligned;
}

// Returns one record per trading date with the full component breakdown.
export function computeLiquidityScoreSeries(alignedByInputId, tradingDates) {
  // Step 1: ROC then std-norm. For each input:
  //   roc[i]   = level[i] - level[i - rocLookbackDays]
  //   norm[i]  = roc[i] / rollingStdDev(roc, zWindowDays)   ← no mean subtraction
  // A balance sheet declining at a constant -50B/quarter has roc ≈ -50 every bar.
  // z-score → (roc − mean) / σ ≈ 0 (NEUTRAL). Std-norm → roc / σ ≈ −1.7 (BEARISH).
  const rocByInput = {};
  const normByInput = {};
  for (const input of LIQUIDITY_INPUTS) {
    rocByInput[input.id] = rollingRoc(alignedByInputId[input.id], LIQUIDITY_SCORE.rocLookbackDays);
    normByInput[input.id] = rollingStdNorm(rocByInput[input.id], LIQUIDITY_SCORE.zWindowDays, LIQUIDITY_SCORE.zClip);
  }

  const totalWeight = LIQUIDITY_INPUTS.reduce((a, inp) => a + inp.weight, 0);
  const out = new Array(tradingDates.length);

  for (let i = 0; i < tradingDates.length; i++) {
    const components = [];
    let weightedSum = 0;
    let weightPresent = 0;

    for (const input of LIQUIDITY_INPUTS) {
      const rawValue = alignedByInputId[input.id][i];
      const roc = rocByInput[input.id][i];
      const norm = normByInput[input.id][i];
      const signedNorm = Number.isFinite(norm) ? input.sign * norm : NaN;
      components.push({
        id: input.id, label: input.label, weight: input.weight, sign: input.sign,
        rawValue: Number.isFinite(rawValue) ? rawValue : null,
        roc: Number.isFinite(roc) ? roc : null,
        norm: Number.isFinite(norm) ? norm : null,
        signedNorm: Number.isFinite(signedNorm) ? signedNorm : null,
      });
      if (Number.isFinite(signedNorm)) {
        weightedSum += input.weight * signedNorm;
        weightPresent += input.weight;
      }
    }

    const coverage = weightPresent / totalWeight;
    let score = null, state = 'NEUTRAL', dataValid = false;
    if (weightPresent > 0 && coverage >= LIQUIDITY_SCORE.minCoverage) {
      const weightedZ = weightedSum / weightPresent;
      score = clip(weightedZ * SCALE, LIQUIDITY_SCORE.range[0], LIQUIDITY_SCORE.range[1]);
      dataValid = true;
      state = score > LIQUIDITY_SCORE.bullishThreshold ? 'BULLISH'
        : score < LIQUIDITY_SCORE.bearishThreshold ? 'BEARISH'
        : 'NEUTRAL';
    }

    out[i] = { date: tradingDates[i], score, state, dataValid, coverage, components };
  }
  return out;
}

export function runLiquidityEngine(rawByInputId, tradingDates) {
  const aligned = alignLiquidityInputs(rawByInputId, tradingDates);
  return computeLiquidityScoreSeries(aligned, tradingDates);
}
