// js/cogExitEngine.js — Exit Engine: dynamic ContinuationScore
//
// Re-evaluates an OPEN trade's health by diffing the CURRENT bar's Gate
// 1/2/3 snapshots against the trade's ENTRY-bar snapshot, realigning every
// raw feature so a HIGHER value always means "more supportive of staying
// in", independent of LONG/SHORT (see COG_EXIT_SCORE's header in
// cogConfig.js). Reuses Gate 1/2/3's own already-computed per-bar
// contributions/breakdowns directly — no new market-data fetching or
// precomputation needed, same reuse discipline as the rest of this system.
//
// Live re-evaluation cadence (5/15/30 min) and the daily-backtest's
// once-per-bar limitation are both the CALLER's concern (cogBacktestEngine.js
// / the live monitor loop) — this file only answers "given these two
// snapshots and this direction, what's the ContinuationScore right now?".

import { compositeRampScore } from './nasdaqTransforms.js';
import { COG_EXIT_SCORE } from './cogConfig.js';

function findContribution(contributions, id) {
  return contributions?.find(c => c.id === id) || null;
}
function findBreakdown(breakdown, id) {
  return breakdown?.find(c => c.id === id) || null;
}

// Builds the direction-aligned raw value for every COG_EXIT_SCORE component.
// "Change since entry" components (liquidity/DXY/yield/credit) diff the
// current bar against the entry bar; "current regime" components
// (vix/vvix spike, ATR expansion, regime shift) are direction-agnostic by
// design — a vol spike or blown-out ATR threatens stops on either side of a
// trade, so they read straight off the current bar with no entry diff.
export function alignExitFeatures(entrySnapshot, currentSnapshot, direction) {
  const sideSign = direction === 'LONG' ? 1 : -1;
  const entryGate1 = entrySnapshot?.gate1;
  const { gate1, gate2, gate3 } = currentSnapshot || {};
  const values = {};

  if (Number.isFinite(gate1?.score) && Number.isFinite(entryGate1?.score)) {
    values.liquidityDeterioration = sideSign * (gate1.score - entryGate1.score);
  }

  const dxyC = findContribution(gate3?.contributions, 'dxy');
  if (dxyC?.signedValue != null) values.dxyReversal = sideSign * dxyC.signedValue;

  const us10yC = findContribution(gate3?.contributions, 'us10y');
  if (us10yC?.signedValue != null) values.yieldReversal = sideSign * us10yC.signedValue;

  const hygLqdC = findContribution(gate3?.contributions, 'hygLqd');
  if (hygLqdC?.signedValue != null) values.creditWeakening = sideSign * hygLqdC.signedValue;

  // Gate 1's vix/vvix `normalized` is already direction-agnostic (positive
  // when the raw VIX/VVIX level/ROC is rising) — exactly "spike magnitude",
  // no sign flip needed.
  const vixC = findContribution(gate1?.contributions, 'vix');
  if (vixC?.normalized != null) values.vixSpike = vixC.normalized;

  const vvixC = findContribution(gate1?.contributions, 'vvix');
  if (vvixC?.normalized != null) values.vvixSpike = vvixC.normalized;

  // Momentum continuation: re-derive Gate 3's own avgVote from its score
  // ((score-50)/50 inverts that gate's [-1,1]->[0,100] rescale), aligned by
  // direction — positive means the cross-asset direction signal still
  // confirms this trade.
  if (Number.isFinite(gate3?.score)) {
    values.momentumDecay = sideSign * (gate3.score - 50) / 50;
  }

  const atrB = findBreakdown(gate2?.breakdown, 'atrPercentile');
  if (atrB?.rawValue != null) values.atrExpansion = atrB.rawValue;

  const vixPctB = findBreakdown(gate2?.breakdown, 'vixPercentile');
  if (vixPctB?.rawValue != null) values.regimeShift = vixPctB.rawValue >= 80 ? 1 : 0;

  return values;
}

// Computes the ContinuationScore for an open trade at the current bar.
// `entrySnapshot`/`currentSnapshot` = { gate1, gate2, gate3 } per-bar
// entries (same per-bar shapes cogExecutionEngine.js consumes) from the
// trade's entry bar and the bar being re-evaluated. `direction` = 'LONG' |
// 'SHORT'. Never forces a CLOSE purely off missing data — score == null
// (zero components present) holds at full size rather than faking urgency.
export function computeExitScore(entrySnapshot, currentSnapshot, direction) {
  const { stayInThreshold, closeThreshold, components } = COG_EXIT_SCORE;
  const values = alignExitFeatures(entrySnapshot, currentSnapshot, direction);
  const { score, coverage, breakdown } = compositeRampScore(values, components);

  let action = 'HOLD';
  if (score != null) {
    if (score < closeThreshold) action = 'CLOSE';
    else if (score < stayInThreshold) action = 'REDUCE';
  }

  const ranked = breakdown
    .filter(c => c.subScore != null)
    .sort((a, b) => a.subScore - b.subScore) // worst (most exit-supportive of leaving) first
    .slice(0, 3);
  const reasons = ranked.map(c => `${c.label} (sub-score ${c.subScore.toFixed(0)})`);

  return { score, coverage, action, breakdown, reasons };
}

// Convenience wrapper for the backtest/live loop: extracts entry + current
// snapshots from the three gate series by bar index so callers never have
// to hand-assemble { gate1, gate2, gate3 } bundles themselves.
export function evaluateOpenTrade(trade, gate1Series, gate2Series, gate3Series, currentIndex) {
  const entrySnapshot = { gate1: gate1Series[trade.entryIndex], gate2: gate2Series[trade.entryIndex], gate3: gate3Series[trade.entryIndex] };
  const currentSnapshot = { gate1: gate1Series[currentIndex], gate2: gate2Series[currentIndex], gate3: gate3Series[currentIndex] };
  return computeExitScore(entrySnapshot, currentSnapshot, trade.direction);
}
