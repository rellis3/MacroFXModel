// js/cogThreshold1Gate.js — Threshold 1: Composite Liquidity Gate
//
// Replaces the old Gate1A+Gate1B hard conjunction (cogEventBacktestEngine.js's
// combinedGate1 required BOTH the slow daily macro regime AND the fast
// intraday flow reading to independently agree BULLISH/BEARISH before
// Gate2/Gate3 were even consulted) with a SINGLE blended score. A 2-year
// synthetic backtest under that 4-way Gate1A∩Gate1B∩Gate2∩Gate3 conjunction
// produced zero trades — an architectural problem (too many independent hard
// gates stacked), not a threshold-calibration one. The observed COG UI's own
// workflow — "1. Threshold 1, 2. Threshold 2, 3. Order Filled, 4. Closed" —
// has only one liquidity-style gate ahead of execution, which this mirrors.
//
// Slow leg: the same daily balance-sheet/credit panel and ROC-z + level-
// percentile blend as cogLiquidityGate.js (Gate1A), computed once per
// CALENDAR DAY and frozen across that day's intraday bars. Fast leg: a
// 5-input subset of cogLiquidityGate1B.js (Gate1B)'s cross-asset ROC-z panel
// (dxy/us10y/us2y/hygLqd/vix — see COG_THRESHOLD1_FAST_INPUTS), computed
// every INTRADAY bar. Both legs reuse the exact same normalization math as
// their standalone-gate counterparts (duplicated here, not imported, so
// cogLiquidityGate.js/cogLiquidityGate1B.js stay completely untouched and
// independently usable if standalone Gate1A/Gate1B work resumes later).
//
// Combination: each leg's own weighted-average vote (on [-1,1], skipping
// missing inputs) is blended via COG_THRESHOLD1_SCORE's slowWeight/fastWeight
// — re-normalized over whichever legs actually have data — onto one score.
// Classification is BULLISH/BEARISH/INVALID only (no NEUTRAL), the same
// binary-with-a-dead-zone style the old standalone Gate1B used.
//
// Output shape `{ dataValid, state, score, ... }` satisfies
// cogExecutionEngine.js's decideAction() gate1 contract directly — no
// changes needed there. `contributions[]` entries are findContribution()-
// compatible (id/signedValue/normalized/contribution), so cogExitEngine.js's
// vix-contribution lookup (currently reading gate1B?.contributions) keeps
// working unmodified when the caller passes this same series as both the
// gate1 and gate1B snapshot fields.
//
// "No black boxes": every input's raw value, normalized [-1,1] signal and
// final weighted contribution is returned per bar, tagged `leg: 'slow'|'fast'`.

import { roc, rollingZScore, rollingPercentile, clip } from './nasdaqTransforms.js';
import { COG_LIQUIDITY_1A_INPUTS, COG_LIQUIDITY_1A_SCORE, COG_THRESHOLD1_FAST_INPUTS, COG_THRESHOLD1_SCORE } from './cogConfig.js';

const TRADING_DAYS_PER_CALENDAR_DAY = 5 / 7;
function tradingDayHorizon(calendarDays) { return Math.max(1, Math.round(calendarDays * TRADING_DAYS_PER_CALENDAR_DAY)); }

// [supportivePhrase, opposingPhrase] per input id, read off the input's
// *signed* normalized value — same "bullish for Nasdaq" framing as Gate1A/
// Gate1B's own PHRASES tables.
const PHRASES = {
  walcl:  ['Fed balance sheet expanding (liquidity supportive)', 'Fed balance sheet contracting (liquidity drain)'],
  rrp:    ['Reverse repo draining (liquidity supportive)', 'Reverse repo building (liquidity drain)'],
  tga:    ['TGA drawing down (liquidity supportive)', 'TGA rebuilding (liquidity drain)'],
  ecb:    ['ECB balance sheet expanding', 'ECB balance sheet contracting'],
  boj:    ['BOJ balance sheet expanding', 'BOJ balance sheet contracting'],
  credit: ['HY credit spreads tightening (risk appetite up)', 'HY credit spreads widening (risk appetite down)'],
  dxy:    ['DXY falling fast (dollar flow supportive)', 'DXY rising fast (dollar flow headwind)'],
  us10y:  ['US10Y yields falling fast', 'US10Y yields rising fast'],
  us2y:   ['US2Y yields falling fast', 'US2Y yields rising fast'],
  hygLqd: ['Credit ROC rising fast (risk appetite up)', 'Credit ROC falling fast (risk appetite down)'],
  vix:    ['VIX falling fast (vol flow calm)', 'VIX rising fast (vol flow stress)'],
};
function phraseFor(id, signedValue) {
  const pair = PHRASES[id] || [`${id} supportive`, `${id} unsupportive`];
  return signedValue >= 0 ? pair[0] : pair[1];
}

// Slow-leg per-input normalization — identical math to cogLiquidityGate.js's
// own precomputeInputSignal.
function precomputeSlowSignal(seriesAligned) {
  const { rocHorizonsDays, zWindowDays, percentileWindowDays, zClip } = COG_LIQUIDITY_1A_SCORE;
  const n = seriesAligned.length;
  const rocZArrays = rocHorizonsDays.map(calDays => {
    const period = tradingDayHorizon(calDays);
    return rollingZScore(roc(seriesAligned, period), zWindowDays, zClip);
  });
  const pctArray = rollingPercentile(seriesAligned, percentileWindowDays);
  const normalized = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    let rocSum = 0, rocCount = 0;
    for (const arr of rocZArrays) { const z = arr[i]; if (Number.isFinite(z)) { rocSum += z / zClip; rocCount++; } }
    const rocSignal = rocCount > 0 ? clip(rocSum / rocCount, -1, 1) : null;
    const pct = pctArray[i];
    const pctSignal = Number.isFinite(pct) ? clip((pct - 50) / 50, -1, 1) : null;
    const parts = [rocSignal, pctSignal].filter(v => v != null);
    normalized[i] = parts.length ? clip(parts.reduce((a, b) => a + b, 0) / parts.length, -1, 1) : null;
  }
  return normalized;
}

// Fast-leg per-input normalization — identical math to cogLiquidityGate1B.js's
// own precomputeInputSignal (single short-horizon ROC z-score, no percentile
// sub-signal).
function precomputeFastSignal(seriesAligned, rocBars) {
  const { zWindowBars, zClip } = COG_THRESHOLD1_SCORE;
  const z = rollingZScore(roc(seriesAligned, rocBars), zWindowBars, zClip);
  return z.map(v => Number.isFinite(v) ? clip(v / zClip, -1, 1) : null);
}

function buildContribution(input, rawValue, normalized, leg) {
  if (!Number.isFinite(rawValue) || normalized == null) {
    return { id: input.id, label: input.label, leg, weight: input.weight, rawValue: Number.isFinite(rawValue) ? rawValue : null, normalized: null, signedValue: null, contribution: null };
  }
  const signedValue = input.sign * normalized;
  const contribution = input.weight * signedValue;
  return { id: input.id, label: input.label, leg, weight: input.weight, rawValue, normalized, signedValue, contribution };
}

// Reduces one leg's per-bar contributions to a weight-present-normalized vote.
function legVote(contributions, totalWeight) {
  let weightedSum = 0, weightPresent = 0;
  for (const c of contributions) {
    if (c.contribution != null) { weightedSum += c.contribution; weightPresent += c.weight; }
  }
  return {
    totalWeight,
    weightPresent,
    avgVote: weightPresent > 0 ? weightedSum / weightPresent : null,
    coverage: totalWeight > 0 ? weightPresent / totalWeight : 0,
  };
}

// Computes the full Threshold 1 time series, one entry per INTRADAY bar.
// `slowSeriesById` = map of COG_LIQUIDITY_1A_INPUTS id -> aligned DAILY raw
// value array (length `numDays`, same shape cogLiquidityGate.js consumes).
// `fastSeriesById` = map of COG_THRESHOLD1_FAST_INPUTS id -> aligned
// INTRADAY raw value array (length `n`, same shape cogLiquidityGate1B.js
// consumes — extra ids like breadth/vvix are simply ignored). `dayIndexForBar`
// maps each intraday bar to its calendar day's ordinal position in the daily
// arrays — the slow leg is frozen at that day's value for every bar within
// the day, mirroring exactly how Gate1A used to be looked up by day index at
// the old combinedGate1 call site.
export function computeThreshold1(slowSeriesById, fastSeriesById, numDays, n, dayIndexForBar) {
  const { range, bullishThreshold, bearishThreshold, slowWeight, fastWeight, minCoverage } = COG_THRESHOLD1_SCORE;
  const slowTotalWeight = COG_LIQUIDITY_1A_INPUTS.reduce((a, inp) => a + inp.weight, 0);
  const fastTotalWeight = COG_THRESHOLD1_FAST_INPUTS.reduce((a, inp) => a + inp.weight, 0);

  const slowNormalizedByInput = {};
  for (const input of COG_LIQUIDITY_1A_INPUTS) {
    const series = slowSeriesById[input.id];
    slowNormalizedByInput[input.id] = series ? precomputeSlowSignal(series) : null;
  }
  const fastNormalizedByInput = {};
  for (const input of COG_THRESHOLD1_FAST_INPUTS) {
    const series = fastSeriesById[input.id];
    fastNormalizedByInput[input.id] = series ? precomputeFastSignal(series, input.rocBars) : null;
  }

  // Slow leg's contributions computed once per CALENDAR DAY, not once per
  // bar — the frozen-daily-value discipline the old combinedGate1 call site
  // used, centralized here instead of in the caller.
  const slowContributionsByDay = new Array(numDays);
  for (let d = 0; d < numDays; d++) {
    slowContributionsByDay[d] = COG_LIQUIDITY_1A_INPUTS.map(input => {
      const series = slowSeriesById[input.id];
      const normArr = slowNormalizedByInput[input.id];
      return series
        ? buildContribution(input, series[d], normArr[d], 'slow')
        : { id: input.id, label: input.label, leg: 'slow', weight: input.weight, rawValue: null, normalized: null, signedValue: null, contribution: null };
    });
  }

  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const dayIdx = dayIndexForBar[i];
    const slowContributions = slowContributionsByDay[dayIdx] || [];
    const fastContributions = COG_THRESHOLD1_FAST_INPUTS.map(input => {
      const series = fastSeriesById[input.id];
      const normArr = fastNormalizedByInput[input.id];
      return series
        ? buildContribution(input, series[i], normArr[i], 'fast')
        : { id: input.id, label: input.label, leg: 'fast', weight: input.weight, rawValue: null, normalized: null, signedValue: null, contribution: null };
    });

    const slow = legVote(slowContributions, slowTotalWeight);
    const fast = legVote(fastContributions, fastTotalWeight);

    // Blend re-normalized over whichever legs actually have data this bar —
    // a leg with zero coverage contributes neither vote nor weight, rather
    // than silently pulling the blend toward zero.
    const legWeightPresent = (slow.avgVote != null ? slowWeight : 0) + (fast.avgVote != null ? fastWeight : 0);
    const blendedVote = legWeightPresent > 0
      ? ((slow.avgVote != null ? slow.avgVote * slowWeight : 0) + (fast.avgVote != null ? fast.avgVote * fastWeight : 0)) / legWeightPresent
      : null;

    // Combined coverage spans BOTH legs' raw input panels together — this is
    // what makes Threshold1 less restrictive than the old Gate1A∩Gate1B
    // conjunction: a leg fully missing just dilutes coverage rather than
    // independently vetoing the bar.
    const combinedTotalWeight = slow.totalWeight + fast.totalWeight;
    const coverage = combinedTotalWeight > 0 ? (slow.weightPresent + fast.weightPresent) / combinedTotalWeight : 0;
    const dataValid = coverage >= minCoverage;
    const score = dataValid && blendedVote != null ? clip(blendedVote * range[1], range[0], range[1]) : null;

    let state = 'INVALID';
    if (dataValid && score != null) {
      if (score > bullishThreshold) state = 'BULLISH';
      else if (score < bearishThreshold) state = 'BEARISH';
      // Dead zone stays INVALID per spec — no NEUTRAL state, same as the old standalone Gate1B.
    }

    const contributions = [...slowContributions, ...fastContributions];
    const ranked = contributions
      .filter(c => c.contribution != null)
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, 4);
    const reasons = ranked.map(c => `${phraseFor(c.id, c.signedValue)} (${c.contribution >= 0 ? '+' : ''}${c.contribution.toFixed(2)})`);

    out[i] = {
      dataValid, state, score, coverage, contributions, reasons,
      legs: { slow: { score: slow.avgVote, coverage: slow.coverage }, fast: { score: fast.avgVote, coverage: fast.coverage } },
    };
  }
  return out;
}
