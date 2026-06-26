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
//      This converts slowly-drifting level series (e.g. Fed balance sheet) into
//      a momentum series that carries a strong persistent signal. A balance sheet
//      declining for 18 months has roc ≈ constant negative even though its level
//      z-score ≈ 0 (because the rolling mean is also declining).
//   3. Rolling z-score the ROC series over LIQUIDITY_SCORE.zWindowDays.
//   4. Apply the input's `sign` so a positive signed z-score always means
//      "more bullish for liquidity", then clip to +/- zClip std devs.
//   5. Weighted average of signed/clipped z-scores (weight-present only —
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
import { applyPublicationLag, forwardFillOnto, rollingZScore, rollingRoc, clip } from './nasdaqTransforms.js';

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
  // Step 1: compute ROC for each input, then z-score the ROC series.
  // We z-score momentum (ROC), not levels, so that slowly-trending macro series
  // (e.g. a balance sheet declining for 18 months) produce a persistent non-zero
  // signal rather than washing out because the rolling mean is itself declining.
  const rocByInput = {};
  const zByInput = {};
  for (const input of LIQUIDITY_INPUTS) {
    rocByInput[input.id] = rollingRoc(alignedByInputId[input.id], LIQUIDITY_SCORE.rocLookbackDays);
    zByInput[input.id] = rollingZScore(rocByInput[input.id], LIQUIDITY_SCORE.zWindowDays, LIQUIDITY_SCORE.zClip);
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
      const z = zByInput[input.id][i];
      const signedZ = Number.isFinite(z) ? input.sign * z : NaN;
      components.push({
        id: input.id, label: input.label, weight: input.weight, sign: input.sign,
        rawValue: Number.isFinite(rawValue) ? rawValue : null,
        roc: Number.isFinite(roc) ? roc : null,
        z: Number.isFinite(z) ? z : null,
        signedZ: Number.isFinite(signedZ) ? signedZ : null,
      });
      if (Number.isFinite(signedZ)) {
        weightedSum += input.weight * signedZ;
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
