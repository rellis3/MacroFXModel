// js/nasdaqLiquidityEngine.js
//
// Gate 1 — Liquidity Engine. Turns the daily LIQUIDITY_INPUTS panel
// (nasdaqConfig.js) into one LiquidityScore per trading day, with full
// per-component visibility (raw value, ROC, directional vote, weighted
// contribution) so every number behind the final score can be inspected.
//
// Method:
//   1. Align each input's raw print series onto the trading-day calendar,
//      respecting publicationLagDays (no lookahead).
//   2. Compute 63-day rate-of-change: roc[i] = level[i] - level[i - 63].
//   3. Each input casts a directional vote: +zClip if roc > 0, -zClip if
//      roc < 0, abstain if roc is zero or missing.  The input's `sign`
//      convention is applied so a positive vote always means "more bullish
//      for liquidity" (e.g. rising balance sheet = +vote; rising DXY with
//      sign=-1 = -vote).
//
//      Why voting, not z-scores or std-norm:
//      Magnitude-based normalisation (z-score, roc/σ) collapses to zero
//      whenever the comparison window is drawn from the same regime:
//        – z-score of roc: constant-pace QT has roc ≈ mean → z ≈ 0 → NEUTRAL
//        – roc / trailing σ: 2020 COVID spikes inflate σ, making 2022 QT
//          look like noise: -50B / 200B = -0.25 → NEUTRAL
//      A directional vote is regime-invariant — constant QT always votes
//      BEARISH, constant QE always votes BULLISH, only a genuinely flat
//      series (roc = 0) abstains.
//
//   4. Weighted average of votes (weight-present only — missing inputs
//      abstain, not counted as zero), rescaled from [-zClip, +zClip] onto
//      LIQUIDITY_SCORE.range [-5, +5].
//   5. Classify: score > bullishThreshold → BULLISH, score < bearishThreshold
//      → BEARISH, else NEUTRAL. A 65% weighted majority is required to cross
//      the ±1.5 threshold (with zClip=3 and range=5). If less than minCoverage
//      (50%) of panel weight has data, score is null and dataValid is false.
//
// Self-contained: does not import from, or share logic with, any other
// gate/backtest system already in this repository.

import { LIQUIDITY_INPUTS, LIQUIDITY_SCORE } from './nasdaqConfig.js';
import { applyPublicationLag, forwardFillOnto, rollingRoc, clip } from './nasdaqTransforms.js';

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
  const rocByInput = {};
  for (const input of LIQUIDITY_INPUTS) {
    rocByInput[input.id] = rollingRoc(alignedByInputId[input.id], LIQUIDITY_SCORE.rocLookbackDays);
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
      // Directional vote: ±zClip if there is a clear direction, NaN to abstain.
      // roc === 0 abstains (no directional signal, not a noise issue).
      const vote = (Number.isFinite(roc) && roc !== 0)
        ? input.sign * Math.sign(roc) * LIQUIDITY_SCORE.zClip
        : NaN;
      components.push({
        id: input.id, label: input.label, weight: input.weight, sign: input.sign,
        rawValue: Number.isFinite(rawValue) ? rawValue : null,
        roc: Number.isFinite(roc) ? roc : null,
        vote: Number.isFinite(vote) ? vote : null,
      });
      if (Number.isFinite(vote)) {
        weightedSum += input.weight * vote;
        weightPresent += input.weight;
      }
    }

    const coverage = weightPresent / totalWeight;
    let score = null, state = 'NEUTRAL', dataValid = false;
    if (weightPresent > 0 && coverage >= LIQUIDITY_SCORE.minCoverage) {
      const weightedVote = weightedSum / weightPresent;
      score = clip(weightedVote * SCALE, LIQUIDITY_SCORE.range[0], LIQUIDITY_SCORE.range[1]);
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
