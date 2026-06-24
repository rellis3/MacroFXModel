// js/cogExecutionEngine.js — Gate 4: Nasdaq Execution Engine
//
// The only file in this system allowed to read Nasdaq price for the trade
// DECISION itself (see cogConfig.js header) — Gates 1-3 never see it. This
// file does two distinct things:
//
//   1. decideAction() — combines Gates 1-3's already-computed independent
//      classifications into a single LONG/SHORT/NO_TRADE action. This is the
//      ONE place those three gates' outputs are combined; each gate file
//      stays decision-agnostic about the other two.
//   2. buildEntryPlan() — once an action is decided, prices the trade against
//      the Nasdaq instrument's own OHLC: fill price (with slippage/spread),
//      standard + conservative stop (from Gate 2's chosen stop model), and
//      position size (from Gate 2's eligible risk tiers) — sizing only ever
//      caps DOWN from the requested tier, never up, per COG_RISK_TIERS.
//
// Fill discipline: per COG_EXECUTION.fillRule ('next-bar-open'), a signal
// computed off bar i's gate states (a close-of-bar-i snapshot) fills at bar
// i+1's OPEN. computeExecutionSignals enforces this directly — it is the
// only function here that touches the bar index — so callers can never
// accidentally fill on the same bar the signal fired (lookahead).

import { COG_EXECUTION, COG_RISK_TIERS } from './cogConfig.js';

const TIER_RANK = { conservative: 0, standard: 1, aggressive: 2 };

// Gate 1 (liquidity backdrop) and Gate 3 (cross-asset direction) must agree
// on direction, and Gate 2 (risk/vol) must independently clear its own VALID
// bar — any single gate disagreeing or being INVALID/NEUTRAL kills the
// trade. Returns the action plus the reasons a human would check first.
export function decideAction(gate1, gate2, gate3) {
  if (!gate1 || !gate2 || !gate3 || !gate1.dataValid || !gate2.dataValid || !gate3.dataValid) {
    return { action: 'NO_TRADE', reasons: ['One or more gates INVALID (insufficient data coverage)'] };
  }
  if (!gate2.valid) {
    return { action: 'NO_TRADE', reasons: [`Gate 2 risk conditions not VALID (score ${gate2.score?.toFixed(1) ?? 'n/a'})`] };
  }
  if (gate3.state !== 'LONG' && gate3.state !== 'SHORT') {
    return { action: 'NO_TRADE', reasons: [`Gate 3 direction is ${gate3.state}, not LONG/SHORT`] };
  }
  if (gate3.state === 'LONG' && gate1.state !== 'BULLISH') {
    return { action: 'NO_TRADE', reasons: [`Gate 3 LONG but Gate 1 liquidity is ${gate1.state}, not BULLISH`] };
  }
  if (gate3.state === 'SHORT' && gate1.state !== 'BEARISH') {
    return { action: 'NO_TRADE', reasons: [`Gate 3 SHORT but Gate 1 liquidity is ${gate1.state}, not BEARISH`] };
  }
  return {
    action: gate3.state,
    reasons: [
      `Gate 1 ${gate1.state} (${gate1.score.toFixed(2)})`,
      `Gate 2 VALID (${gate2.score.toFixed(1)})`,
      `Gate 3 ${gate3.state} (${gate3.score.toFixed(1)})`,
    ],
  };
}

// Caps `requestedTier` down to the best tier Gate 2 actually clears —
// never sizes up beyond what eligibleTiers (already sorted best-first by
// cogRiskGate.js's selectEligibleTiers) justifies.
export function selectTier(eligibleTiers, requestedTier) {
  if (!eligibleTiers || !eligibleTiers.length) return null;
  const requestedRank = TIER_RANK[requestedTier] ?? TIER_RANK.aggressive;
  const capped = eligibleTiers.filter(t => TIER_RANK[t] <= requestedRank);
  return capped[0] || null;
}

// Prices one trade. `fillOpen` must be the NEXT bar's open (see header) —
// this function has no awareness of bar indices, so that discipline is the
// caller's (computeExecutionSignals') responsibility.
function buildEntryPlan({ action, gate2Entry, fillOpen, instrument, stopModelId, requestedTier, accountEquity }) {
  const stopModel = gate2Entry?.stopModels?.[stopModelId];
  if (!stopModel || !Number.isFinite(stopModel.standard) || !Number.isFinite(stopModel.conservative)) {
    return { error: `Stop model '${stopModelId}' unavailable at this bar` };
  }
  const tier = selectTier(gate2Entry.eligibleTiers, requestedTier);
  if (!tier) {
    return { error: 'No eligible risk tier cleared by Gate 2' };
  }
  if (!Number.isFinite(fillOpen) || fillOpen <= 0) {
    return { error: 'Next-bar open price unavailable' };
  }

  const sideSign = action === 'LONG' ? 1 : -1;
  const adverseBps = COG_EXECUTION.slippageBps + COG_EXECUTION.spreadBps;
  // Slippage/spread always move the fill AGAINST the trade: worse (higher)
  // for a LONG entry, worse (lower) for a SHORT entry.
  const entryPrice = fillOpen * (1 + sideSign * adverseBps / 10000);

  const stopStandard = { distance: stopModel.standard, price: entryPrice - sideSign * stopModel.standard };
  const stopConservative = { distance: stopModel.conservative, price: entryPrice - sideSign * stopModel.conservative };

  const tierConfig = COG_RISK_TIERS[tier];
  const riskAmount = accountEquity * COG_EXECUTION.baseRiskPctOfEquity * tierConfig.riskPct;
  const pointValue = instrument.pointValue;
  // Sized off the STANDARD stop (the conservative stop is reported for
  // comparison but never used to inflate size).
  const positionSize = Math.floor(riskAmount / (stopStandard.distance * pointValue));

  if (positionSize < 1) {
    return { error: `Risk amount ($${riskAmount.toFixed(0)}) too small for stop distance (${stopStandard.distance.toFixed(2)} pts) — 0 ${instrument.label} units sized` };
  }

  const commissionCostPerUnit = entryPrice * pointValue * (COG_EXECUTION.commissionBps / 10000);
  const spreadSlippageCostPerUnit = fillOpen * pointValue * (adverseBps / 10000);
  const estTotalCost = (commissionCostPerUnit + spreadSlippageCostPerUnit) * positionSize;

  return {
    error: null,
    instrument: instrument.id,
    tier,
    stopModelId,
    fillOpenRaw: fillOpen,
    entryPrice,
    stopStandard,
    stopConservative,
    riskAmount,
    positionSize,
    costs: {
      commissionBps: COG_EXECUTION.commissionBps,
      slippageBps: COG_EXECUTION.slippageBps,
      spreadBps: COG_EXECUTION.spreadBps,
      commissionCostPerUnit,
      spreadSlippageCostPerUnit,
      estTotalCost,
    },
  };
}

// Computes the full Gate 4 time series. `gate1Series`/`gate2Series`/
// `gate3Series` are the aligned per-bar outputs from cogLiquidityGate.js /
// cogRiskGate.js / cogDirectionGate.js (same length n, same date axis).
// `ohlc` = { open, high, low, close } for the chosen instrument. Returns one
// entry per bar: { action, reasons, entryPlan } — entryPlan is null
// whenever action is NO_TRADE, the bar is the series' last bar (no next-bar
// open exists yet), or buildEntryPlan itself reports an error (folded into
// `reasons` so the bar's full explanation stays in one place).
export function computeExecutionSignals(gate1Series, gate2Series, gate3Series, ohlc, n, options = {}) {
  const {
    instrumentKey = 'primary',
    stopModelId = COG_EXECUTION.defaultStopModel,
    requestedTier = COG_EXECUTION.defaultTier,
    accountEquity = 100000,
  } = options;
  const instrument = COG_EXECUTION.instruments[instrumentKey];
  const out = new Array(n);

  for (let i = 0; i < n; i++) {
    const { action, reasons } = decideAction(gate1Series[i], gate2Series[i], gate3Series[i]);
    let entryPlan = null;
    const finalReasons = reasons.slice();

    if (action !== 'NO_TRADE' && i + 1 < n) {
      const fillOpen = ohlc.open ? ohlc.open[i + 1] : NaN;
      const plan = buildEntryPlan({ action, gate2Entry: gate2Series[i], fillOpen, instrument, stopModelId, requestedTier, accountEquity });
      if (plan.error) finalReasons.push(plan.error);
      else entryPlan = plan;
    } else if (action !== 'NO_TRADE') {
      finalReasons.push('No next-bar open available for fill (series end)');
    }

    out[i] = { action, reasons: finalReasons, entryPlan };
  }
  return out;
}
