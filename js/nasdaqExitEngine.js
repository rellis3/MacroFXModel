// js/nasdaqExitEngine.js
//
// Gate 4 — Dynamic Exit Engine, plus the secondary exit models the backtest
// runs alongside it purely for comparison (never to override a live trade).
//
// PRIMARY exit (live + backtest): ContinuationScore, re-evaluated every
// CONTINUATION_SCORE.reevaluateEveryMinutes. Every raw feature is aligned to
// the open trade's direction before scoring (see alignContinuationFeatures)
// so the same ramp anchors in nasdaqConfig.js work for both LONG and SHORT —
// "higher aligned value" always means "more supportive of staying in".
//
// SECONDARY exit models (backtest research only): 8 named rule-based exits
// (fixed 2R, fixed 3R, ATR trailing, chandelier, momentum deterioration,
// VWAP loss, breadth deterioration, time exit) plus one hybrid, replayed
// against every completed primary trade so the backtest report can show
// which exit style would have produced the best expectancy/profit factor —
// a robustness check, not a suggestion to swap the primary exit out.
//
// Self-contained: does not import from, or share logic with, any other
// gate/backtest system already in this repository.

import { CONTINUATION_SCORE, SECONDARY_EXIT_MODELS } from './nasdaqConfig.js';
import { compositeRampScore } from './nasdaqTransforms.js';

// Inputs whose raw sign is tied to "up means bullish" (+1) or "up means
// bearish" (-1) before direction alignment — mirrors NY_CONFIRMATION's
// polarity convention (nasdaqNyConfirmationEngine.js) so the same market
// reality is interpreted identically by both gates.
const LONG_POLARITY = {
  momentum30m: +1, breadth: +1, add: +1, tick: +1, yields: +1, vwapDist: +1,
  dxy: -1, trin: -1, vix: -1, vvix: -1,
};

// raw: { momentum30m, adx, adxSlope, hurst, vwapDist, vwapLoss, breadth, add,
//        tick, trin, dxy, yields, vix, vvix, realizedVol } — natural-sign
// market values. adx/adxSlope/hurst/vwapLoss/realizedVol are magnitude- or
// already-direction-aware fields and pass through unchanged.
export function alignContinuationFeatures(direction, raw) {
  const dirSign = direction === 'LONG' ? 1 : -1;
  const aligned = {};
  for (const [key, val] of Object.entries(raw)) {
    aligned[key] = (key in LONG_POLARITY && Number.isFinite(val))
      ? LONG_POLARITY[key] * dirSign * val
      : val;
  }
  return aligned;
}

export function scoreContinuation(alignedValuesById) {
  const { score, coverage, breakdown } = compositeRampScore(alignedValuesById, CONTINUATION_SCORE.components);
  let action = 'CLOSE';
  if (score != null) {
    action = score > CONTINUATION_SCORE.stayInThreshold ? 'STAY_IN'
      : score < CONTINUATION_SCORE.closeThreshold ? 'CLOSE'
      : 'REDUCE'; // covers reduceBand and the boundary gap between closeThreshold and stayInThreshold
  }
  return { score, coverage, action, breakdown };
}

// ── Secondary exit models ───────────────────────────────────────────────────

function favorableExcursion(ctx) {
  return ctx.direction === 'LONG' ? (ctx.price - ctx.entryPrice) : (ctx.entryPrice - ctx.price);
}

function checkFixedR(ctx, rMultiple) {
  return Number.isFinite(ctx.initialStopDistance) && favorableExcursion(ctx) >= rMultiple * ctx.initialStopDistance;
}

function checkAtrTrailing(ctx, atrMultiplier) {
  if (!Number.isFinite(ctx.atr)) return false;
  const trailDistance = atrMultiplier * ctx.atr;
  return ctx.direction === 'LONG'
    ? ctx.price <= ctx.highestSinceEntry - trailDistance
    : ctx.price >= ctx.lowestSinceEntry + trailDistance;
}

function checkChandelier(ctx) {
  const { atrMultiplier, lookbackBars } = SECONDARY_EXIT_MODELS.chandelier;
  if (!Number.isFinite(ctx.atr)) return false;
  const start = Math.max(0, ctx.i - lookbackBars + 1);
  const window = ctx.bars.slice(start, ctx.i + 1);
  const trailDistance = atrMultiplier * ctx.atr;
  if (ctx.direction === 'LONG') {
    const highestHigh = Math.max(...window.map(b => b.high));
    return ctx.price <= highestHigh - trailDistance;
  }
  const lowestLow = Math.min(...window.map(b => b.low));
  return ctx.price >= lowestLow + trailDistance;
}

const SECONDARY_EXIT_MODELS_REGISTRY = {
  fixed2R: (ctx) => checkFixedR(ctx, SECONDARY_EXIT_MODELS.fixedR.targets[0]),
  fixed3R: (ctx) => checkFixedR(ctx, SECONDARY_EXIT_MODELS.fixedR.targets[1]),
  atrTrailing: (ctx) => checkAtrTrailing(ctx, SECONDARY_EXIT_MODELS.atrTrailing.atrMultiplier),
  chandelier: (ctx) => checkChandelier(ctx),
  momentumDeterioration: (ctx) => ctx.negativeMomentumStreak >= SECONDARY_EXIT_MODELS.momentumDeterioration.negativeBarsToExit,
  vwapLoss: (ctx) => ctx.vwapLossStreak >= SECONDARY_EXIT_MODELS.vwapLoss.confirmBars,
  breadthDeterioration: (ctx) => Number.isFinite(ctx.breadthZAligned) && ctx.breadthZAligned < SECONDARY_EXIT_MODELS.breadthDeterioration.zThreshold,
  timeExit: (ctx) => ctx.barsHeld >= SECONDARY_EXIT_MODELS.timeExit.maxHoldingBars,
  hybridTrailTime: (ctx) => checkAtrTrailing(ctx, SECONDARY_EXIT_MODELS.hybridTrailTime.atrMultiplier) || ctx.barsHeld >= SECONDARY_EXIT_MODELS.hybridTrailTime.maxHoldingBars,
};

export const SECONDARY_EXIT_MODEL_IDS = Object.keys(SECONDARY_EXIT_MODELS_REGISTRY);

// Replays one named secondary exit model against a completed (or still-open)
// trade's actual subsequent bar path. All series are full-length, aligned to
// `bars`; `entryIndex` is the bar whose NEXT bar's open was the actual fill
// (EXECUTION.fillRule = next-bar-open), so the replay starts at entryIndex+1.
export function simulateSecondaryExit(modelId, params) {
  const {
    direction, entryIndex, entryPrice, initialStopDistance, bars, atrSeries,
    momentumAlignedSeries, vwapLossFlagSeries, breadthZAlignedSeries, maxBars,
  } = params;
  const modelFn = SECONDARY_EXIT_MODELS_REGISTRY[modelId];
  if (!modelFn) throw new Error(`Unknown secondary exit model: ${modelId}`);

  let highestSinceEntry = bars[entryIndex].close;
  let lowestSinceEntry = bars[entryIndex].close;
  let negativeMomentumStreak = 0;
  let vwapLossStreak = 0;
  const hardLimit = Math.min(bars.length - 1, entryIndex + (maxBars || bars.length));

  for (let i = entryIndex + 1; i <= hardLimit; i++) {
    const price = bars[i].close;
    highestSinceEntry = Math.max(highestSinceEntry, bars[i].high);
    lowestSinceEntry = Math.min(lowestSinceEntry, bars[i].low);

    const momentumAligned = momentumAlignedSeries[i];
    negativeMomentumStreak = (Number.isFinite(momentumAligned) && momentumAligned < 0) ? negativeMomentumStreak + 1 : 0;
    vwapLossStreak = vwapLossFlagSeries[i] ? vwapLossStreak + 1 : 0;

    const ctx = {
      direction, entryPrice, initialStopDistance, i, bars, price,
      atr: atrSeries[i], highestSinceEntry, lowestSinceEntry,
      barsHeld: i - entryIndex, negativeMomentumStreak, vwapLossStreak,
      breadthZAligned: breadthZAlignedSeries[i],
    };
    if (modelFn(ctx)) return { exitIndex: i, exitPrice: price, reason: modelId, barsHeld: ctx.barsHeld };
  }
  return { exitIndex: hardLimit, exitPrice: bars[hardLimit].close, reason: `${modelId}_maxBarsReached`, barsHeld: hardLimit - entryIndex };
}
