// js/nasdaqNyConfirmationEngine.js
//
// Gate 3 — NY Confirmation Engine. Runs in the 14:20-14:35 UK window (real
// DST-aware local time — see nasdaqSessions.js) and checks whether a panel
// of NY-session market moves agrees with the directional bias that Gate 1
// (liquidity) + Gate 2 (trend) have already proposed. This gate cannot
// invent a direction — it can only confirm or veto one already on the table.
//
// Method:
//   1. Each NY_CONFIRMATION.inputs entry carries an explicit `polarity`
//      (+1 or -1, nasdaqConfig.js) such that polarity * rawMove > 0 means
//      "this input agrees with a LONG bias".
//   2. Weighted agreement = (sum of weights of inputs agreeing with the
//      proposed bias) / (sum of weights of inputs with data) — a number
//      in [0, 1], using the weight-present coverage policy used everywhere
//      else in this framework (missing inputs abstain, not auto-disagree).
//   3. agreement >= agreementThreshold => bias is CONFIRMED; otherwise the
//      gate result is INVALID (no trade), even though Gate 1 + Gate 2 fired.
//
// Self-contained: does not import from, or share logic with, any other
// gate/backtest system already in this repository.

import { NY_CONFIRMATION } from './nasdaqConfig.js';

// rawMovesById: { [input.id]: number } — raw (un-polarity-adjusted) 30m moves.
// bias: 'LONG' | 'SHORT' — the direction Gate 1 + Gate 2 have already proposed.
export function computeNyConfirmation(rawMovesById, bias) {
  if (bias !== 'LONG' && bias !== 'SHORT') {
    return { decision: 'INVALID', bias: null, agreement: null, coverage: 0, breakdown: [], reason: 'no bias proposed by Gate 1 + Gate 2' };
  }

  const totalWeight = NY_CONFIRMATION.inputs.reduce((a, inp) => a + inp.weight, 0);
  let weightedAgree = 0;
  let weightPresent = 0;
  const breakdown = [];

  for (const input of NY_CONFIRMATION.inputs) {
    const raw = rawMovesById[input.id];
    let agreesWithLong = null;
    if (Number.isFinite(raw) && raw !== 0) agreesWithLong = (input.polarity * raw) > 0;

    breakdown.push({
      id: input.id, label: input.label, weight: input.weight, polarity: input.polarity,
      rawMove: Number.isFinite(raw) ? raw : null, agreesWithLong,
    });

    if (agreesWithLong !== null) {
      const agreesWithBias = bias === 'LONG' ? agreesWithLong : !agreesWithLong;
      weightedAgree += input.weight * (agreesWithBias ? 1 : 0);
      weightPresent += input.weight;
    }
  }

  const coverage = weightPresent / totalWeight;
  const agreement = weightPresent > 0 ? weightedAgree / weightPresent : null;
  const decision = (agreement != null && agreement >= NY_CONFIRMATION.agreementThreshold) ? bias : 'INVALID';

  return { decision, bias, agreement, coverage, breakdown };
}
