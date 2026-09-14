// Deeper look at throttle ideas #2 (graded ramp) and #4 (asset-class-aware) — 2026-09-14
//
// Two questions the headline numbers didn't answer:
// (a) Does the improvement hold on a genuine held-out OOS slice, or is it
//     riding one lucky stretch in the full 4.5-year sample?
// (b) Is the win robust to the exact tier/threshold numbers chosen (which
//     were reasonable round numbers, not IS-fit), or a knife-edge artifact?
// #3 (rolling peak) is dropped -- confirmed null in the first pass, nothing
// left to dig into.
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook, splitAt } from '../js/levelAtlasReport.js';
import { buildBarrierTrades, applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries, applyDrawdownThrottle } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { maxDrawdownFromPnls } from '../js/metricsCore.js';
import { costForPair } from '../js/perLineStrategy.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { boundPacked, LOOKBACK_DAYS, DEFAULT_REARM } from '../js/levelAtlasRoutes.js';

const MIN_MARGIN = 3, MAX_CONCURRENT = 3, RISK_PCT = 0.5;
const INDEX_CLUSTER = new Set(['nq', 'spx', 'dow', 'us2000', 'de30', 'uk100']);
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

const perPairTrades = {};
for (const pair of PAIRS) {
  console.log(`${pair.toUpperCase()}: loading M1...`);
  const packed0 = await loadM1ForPair(pair);
  const packed = boundPacked(packed0, LOOKBACK_DAYS);
  const assetClass = assetClassFor(pair);
  const cost = costForPair(pair, assetClass);
  const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [DEFAULT_REARM], pendingRearmFrac: DEFAULT_REARM });
  const atRearm = touches.filter(t => t.rearmFrac === DEFAULT_REARM);
  const { split: realSplit } = splitAt(atRearm);
  const isOnly = atRearm.filter(t => t.date < realSplit);
  const honestBook = buildAtlasBook(isOnly, { rearmFrac: DEFAULT_REARM });
  const trades = buildBarrierTrades(touches, honestBook, { rearmFrac: DEFAULT_REARM, cost, oosStartDate: realSplit }).filter(t => t.margin >= MIN_MARGIN);
  const capped = applyConcurrencyCap(trades, { maxConcurrent: MAX_CONCURRENT }).kept ?? [];
  const adjusted = riskAdjustTrades(capped, RISK_PCT).map(t => ({ ...t, pair: pair.toUpperCase() }));
  perPairTrades[pair.toUpperCase()] = adjusted;
  console.log(`  ${adjusted.length} trades`);
}

const weights = Object.fromEntries(Object.keys(perPairTrades).map(p => [p, 1]));
const combined = buildPortfolioDailySeries(perPairTrades, { weights });
const { dailyReturns, dates } = combined;
const splitIdx = Math.floor(dates.length * 0.7);
console.log(`\n${dates.length} trading days (${dates[0]} -> ${dates.at(-1)}). IS/OOS split at ${dates[splitIdx]} (day ${splitIdx}).`);

function dailySeriesFor(trades) {
  const m = new Map();
  for (const t of trades ?? []) m.set(t.date, (m.get(t.date) ?? 0) + t.pnlPct);
  return m;
}
function reindexed(pairSubset) {
  const m = new Map();
  for (const pair of pairSubset) for (const [d, v] of dailySeriesFor(perPairTrades[pair] ?? [])) m.set(d, (m.get(d) ?? 0) + v);
  return dates.map(d => m.get(d) ?? 0);
}
const indexPairs = Object.keys(perPairTrades).filter(p => INDEX_CLUSTER.has(p.toLowerCase()));
const fxGoldPairs = Object.keys(perPairTrades).filter(p => !INDEX_CLUSTER.has(p.toLowerCase()));
const indexReturns = reindexed(indexPairs);
const fxGoldReturns = reindexed(fxGoldPairs);

function applyGraded(returns, tiers, restoreDD) {
  let equity = 1, peak = 1, throttled = false;
  const scaled = []; let daysThrottled = 0;
  for (let i = 0; i < returns.length; i++) {
    const ddNow = (equity - peak) / peak * 100;
    if (!throttled && ddNow <= tiers[0].trigger) throttled = true;
    else if (throttled && ddNow >= restoreDD) throttled = false;
    let mult = 1;
    if (throttled) { mult = tiers[0].mult; for (const t of tiers) if (ddNow <= t.trigger) mult = t.mult; daysThrottled++; }
    const r = returns[i] * mult;
    scaled.push(+r.toFixed(4));
    equity *= (1 + r / 100);
    if (equity > peak) peak = equity;
  }
  return { dailyReturns: scaled, daysThrottled };
}
function applyAssetAware(returns, idxReturns, fxReturns, cfg) {
  let eqIdx = 1, peakIdx = 1, eqFx = 1, peakFx = 1;
  let equity = 1, peak = 1, throttled = false;
  const scaled = []; let daysThrottled = 0;
  for (let i = 0; i < returns.length; i++) {
    const ddIdx = (eqIdx - peakIdx) / peakIdx * 100;
    const ddFx = (eqFx - peakFx) / peakFx * 100;
    const badIdx = Math.abs(Math.min(0, ddIdx)), badFx = Math.abs(Math.min(0, ddFx));
    const segWeight = (badIdx + badFx) > 0 ? badIdx / (badIdx + badFx) : 0.5;
    const trigger = cfg.mildTrigger + segWeight * (cfg.strictTrigger - cfg.mildTrigger);
    const mult0 = cfg.mildMult + segWeight * (cfg.strictMult - cfg.mildMult);
    const restore = cfg.mildRestore + segWeight * (cfg.strictRestore - cfg.mildRestore);
    const ddNow = (equity - peak) / peak * 100;
    if (!throttled && ddNow <= trigger) throttled = true;
    else if (throttled && ddNow >= restore) throttled = false;
    const mult = throttled ? mult0 : 1;
    if (throttled) daysThrottled++;
    const r = returns[i] * mult;
    scaled.push(+r.toFixed(4));
    equity *= (1 + r / 100);
    if (equity > peak) peak = equity;
    eqIdx *= (1 + (idxReturns[i] || 0) / 100); if (eqIdx > peakIdx) peakIdx = eqIdx;
    eqFx *= (1 + (fxReturns[i] || 0) / 100); if (eqFx > peakFx) peakFx = eqFx;
  }
  return { dailyReturns: scaled, daysThrottled };
}

function segStats(returns, from, to) {
  const slice = returns.slice(from, to);
  const ps = portfolioStats(slice, { mc: false, targetVol: 10 });
  const ddnc = maxDrawdownFromPnls(slice);
  return { n: slice.length, sharpe: ps.sharpe, cagr: ps.cagr, ddc: ps.maxDD, ddnc };
}
function printRow(label, returns) {
  const full = segStats(returns, 0, returns.length);
  const is = segStats(returns, 0, splitIdx);
  const oos = segStats(returns, splitIdx, returns.length);
  console.log(
    label.padEnd(26) +
    `FULL: Sh${full.sharpe?.toFixed(2)} CAGR${full.cagr?.toFixed(0)}% DD${full.ddc?.toFixed(1)}%`.padEnd(26) +
    `  IS: Sh${is.sharpe?.toFixed(2)} CAGR${is.cagr?.toFixed(0)}% DD${is.ddc?.toFixed(1)}%`.padEnd(26) +
    `  OOS: Sh${oos.sharpe?.toFixed(2)} CAGR${oos.cagr?.toFixed(0)}% DD${oos.ddc?.toFixed(1)}%`
  );
}

console.log('\n' + '='.repeat(100));
console.log('PART A: IS/OOS HONESTY CHECK (same pre-specified design run continuously, scored per segment)');
console.log('='.repeat(100));
printRow('No throttle', dailyReturns);
const current = applyDrawdownThrottle(dailyReturns, dates, { triggerDD: -8, restoreDD: -2, throttleMult: 0.25 });
printRow('Current (cliff)', current.dailyReturns);
const graded = applyGraded(dailyReturns, [{ trigger: -4, mult: 0.65 }, { trigger: -6, mult: 0.40 }, { trigger: -8, mult: 0.25 }], -2);
printRow('#2 Graded', graded.dailyReturns);
const assetAware = applyAssetAware(dailyReturns, indexReturns, fxGoldReturns, { mildTrigger: -12, mildMult: 0.5, mildRestore: -4, strictTrigger: -8, strictMult: 0.25, strictRestore: -2 });
printRow('#4 Asset-aware', assetAware.dailyReturns);

console.log('\n' + '='.repeat(100));
console.log('PART B: SENSITIVITY — is #2 robust to the exact tier choice? (all use the SAME -8/0.25 floor)');
console.log('='.repeat(100));
const gradedVariants = {
  'Original (-4/-6/-8, .65/.40/.25)': [{ trigger: -4, mult: 0.65 }, { trigger: -6, mult: 0.40 }, { trigger: -8, mult: 0.25 }],
  'Gentler start (-3/-5.5/-8, .70/.45/.25)': [{ trigger: -3, mult: 0.70 }, { trigger: -5.5, mult: 0.45 }, { trigger: -8, mult: 0.25 }],
  'Coarser 2-tier (-5/-8, .50/.25)': [{ trigger: -5, mult: 0.50 }, { trigger: -8, mult: 0.25 }],
  'Steeper (-5/-6.5/-8, .55/.35/.25)': [{ trigger: -5, mult: 0.55 }, { trigger: -6.5, mult: 0.35 }, { trigger: -8, mult: 0.25 }],
};
for (const [label, tiers] of Object.entries(gradedVariants)) {
  const r = applyGraded(dailyReturns, tiers, -2);
  const full = segStats(r.dailyReturns, 0, r.dailyReturns.length);
  console.log(`  ${label.padEnd(42)} Sharpe ${full.sharpe?.toFixed(2)}  CAGR ${full.cagr?.toFixed(0)}%  DD ${full.ddc?.toFixed(1)}%`);
}

console.log('\n' + '='.repeat(100));
console.log('PART B: SENSITIVITY — is #4 robust to the mild-side threshold choice?');
console.log('='.repeat(100));
const assetVariants = {
  'Original (mild -12/.5, strict -8/.25)': { mildTrigger: -12, mildMult: 0.5, mildRestore: -4, strictTrigger: -8, strictMult: 0.25, strictRestore: -2 },
  'Less aggressive mild (-10/.5)': { mildTrigger: -10, mildMult: 0.5, mildRestore: -4, strictTrigger: -8, strictMult: 0.25, strictRestore: -2 },
  'More aggressive mild (-14/.6)': { mildTrigger: -14, mildMult: 0.6, mildRestore: -4, strictTrigger: -8, strictMult: 0.25, strictRestore: -2 },
  'Tighter mild mult (-12/.35)': { mildTrigger: -12, mildMult: 0.35, mildRestore: -4, strictTrigger: -8, strictMult: 0.25, strictRestore: -2 },
};
for (const [label, cfg] of Object.entries(assetVariants)) {
  const r = applyAssetAware(dailyReturns, indexReturns, fxGoldReturns, cfg);
  const full = segStats(r.dailyReturns, 0, r.dailyReturns.length);
  console.log(`  ${label.padEnd(42)} Sharpe ${full.sharpe?.toFixed(2)}  CAGR ${full.cagr?.toFixed(0)}%  DD ${full.ddc?.toFixed(1)}%  throttled ${(r.daysThrottled / r.dailyReturns.length * 100).toFixed(0)}%`);
}

console.log('\n' + '='.repeat(100));
console.log('PART C: THE WORST DRAWDOWN EPISODE, TRACED THROUGH EACH POLICY');
console.log('='.repeat(100));
// Find the deepest peak-to-trough episode in the UN-throttled series (the real, underlying pain point).
let eq = 1, peak = 1, peakIdx = 0, worstDD = 0, worstTroughIdx = 0, worstPeakIdx = 0;
for (let i = 0; i < dailyReturns.length; i++) {
  eq *= (1 + dailyReturns[i] / 100);
  if (eq > peak) { peak = eq; peakIdx = i; }
  const dd = (eq - peak) / peak * 100;
  if (dd < worstDD) { worstDD = dd; worstTroughIdx = i; worstPeakIdx = peakIdx; }
}
console.log(`Worst un-throttled episode: ${dates[worstPeakIdx]} -> ${dates[worstTroughIdx]} (${worstTroughIdx - worstPeakIdx} trading days), reached ${worstDD.toFixed(1)}%`);
const idxBad = indexReturns.slice(worstPeakIdx, worstTroughIdx + 1).filter(r => r < 0).reduce((a, b) => a + b, 0);
const fxBad = fxGoldReturns.slice(worstPeakIdx, worstTroughIdx + 1).filter(r => r < 0).reduce((a, b) => a + b, 0);
console.log(`During that episode: index-cluster contributed ${idxBad.toFixed(2)}pp of losses, FX/gold contributed ${fxBad.toFixed(2)}pp -- ${Math.abs(idxBad) > Math.abs(fxBad) ? 'index-cluster-driven' : 'FX/gold-driven'}`);
for (const [label, series] of [['No throttle', dailyReturns], ['Current (cliff)', current.dailyReturns], ['#2 Graded', graded.dailyReturns], ['#4 Asset-aware', assetAware.dailyReturns]]) {
  let e = 1, p = 1, worst = 0;
  for (let i = worstPeakIdx; i <= worstTroughIdx; i++) { e *= (1 + series[i] / 100); if (e > p) p = e; const dd = (e - p) / p * 100; if (dd < worst) worst = dd; }
  console.log(`  ${label.padEnd(20)} actual DD reached during this episode: ${worst.toFixed(1)}%`);
}
