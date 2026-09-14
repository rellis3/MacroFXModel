// Hybrid throttle idea (user-proposed, 2026-09-14): cliff on the way down
// (identical to CURRENT -- no reduction at all until -8%, so zero extra
// opportunity cost during a normal dip), but STAGED, ratcheting-upward-only
// recovery instead of a single jump from 0.25x straight to 1.0x at -2%.
//
// Caches the 17-pair daily-return series to disk so repeat design iterations
// don't re-walk M1 every time (this is the 3rd throttle-design script tonight
// using the exact same underlying trades).
import fs from 'fs';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook, splitAt } from '../js/levelAtlasReport.js';
import { buildBarrierTrades, applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries, applyDrawdownThrottle } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { costForPair } from '../js/perLineStrategy.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { boundPacked, LOOKBACK_DAYS, DEFAULT_REARM } from '../js/levelAtlasRoutes.js';

const CACHE_PATH = 'analysis/output/throttle_daily_returns_cache.json';
const MIN_MARGIN = 3, MAX_CONCURRENT = 3, RISK_PCT = 0.5;
const INDEX_CLUSTER = new Set(['nq', 'spx', 'dow', 'us2000', 'de30', 'uk100']);
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

let dates, dailyReturns, indexReturns, fxGoldReturns;
if (fs.existsSync(CACHE_PATH)) {
  console.log(`Loading cached daily-return series from ${CACHE_PATH}...`);
  ({ dates, dailyReturns, indexReturns, fxGoldReturns } = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')));
} else {
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
  dates = combined.dates; dailyReturns = combined.dailyReturns;

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
  indexReturns = reindexed(indexPairs);
  fxGoldReturns = reindexed(fxGoldPairs);

  fs.mkdirSync('analysis/output', { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify({ dates, dailyReturns, indexReturns, fxGoldReturns }));
  console.log(`Cached to ${CACHE_PATH} for future runs.`);
}

const splitIdx = Math.floor(dates.length * 0.7);
console.log(`\n${dates.length} trading days (${dates[0]} -> ${dates.at(-1)}). IS/OOS split at ${dates[splitIdx]} (day ${splitIdx}).`);

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

// Cliff on the way down (single trigger, no graded reduction pre-trigger);
// staged, ratchet-upward-only recovery. upStages ordered floor-first, e.g.
// [{ddAbove:-8,mult:0.25},{ddAbove:-6,mult:0.40},{ddAbove:-4,mult:0.65}]:
// once DD recovers past a stage's ddAbove threshold, mult steps up to that
// stage's mult and NEVER drops back down again unless DD falls all the way
// back through the ORIGINAL cliff trigger (a genuine fresh breach, not chop).
function applyCliffDownStagedUp(returns, { triggerDD, restoreDD, upStages }) {
  let equity = 1, peak = 1, throttled = false, stageIdx = 0;
  const scaled = []; let daysThrottled = 0;
  const track = [];
  for (let i = 0; i < returns.length; i++) {
    const ddNow = (equity - peak) / peak * 100;
    let mult = 1;
    if (!throttled) {
      if (ddNow <= triggerDD) { throttled = true; stageIdx = 0; }
    } else {
      if (ddNow >= restoreDD) {
        throttled = false;
      } else if (ddNow <= triggerDD) {
        stageIdx = 0; // fresh breach of the original floor trigger -- re-floor, not chop
      } else {
        while (stageIdx + 1 < upStages.length && ddNow > upStages[stageIdx + 1].ddAbove) stageIdx++;
      }
    }
    if (throttled) { mult = upStages[stageIdx].mult; daysThrottled++; }
    const r = returns[i] * mult;
    scaled.push(+r.toFixed(4));
    equity *= (1 + r / 100);
    if (equity > peak) peak = equity;
    track.push({ date: dates[i], ddNow: +ddNow.toFixed(2), throttled, mult });
  }
  return { dailyReturns: scaled, daysThrottled, track };
}

function segStats(returns, from, to) {
  const slice = returns.slice(from, to);
  const ps = portfolioStats(slice, { mc: false, targetVol: 10 });
  return { n: slice.length, sharpe: ps.sharpe, cagr: ps.cagr, ddc: ps.maxDD };
}
function printRow(label, returns) {
  const full = segStats(returns, 0, returns.length);
  const is = segStats(returns, 0, splitIdx);
  const oos = segStats(returns, splitIdx, returns.length);
  console.log(
    label.padEnd(28) +
    `FULL: Sh${full.sharpe?.toFixed(2)} CAGR${full.cagr?.toFixed(0)}% DD${full.ddc?.toFixed(1)}%`.padEnd(26) +
    `  IS: Sh${is.sharpe?.toFixed(2)} CAGR${is.cagr?.toFixed(0)}% DD${is.ddc?.toFixed(1)}%`.padEnd(26) +
    `  OOS: Sh${oos.sharpe?.toFixed(2)} CAGR${oos.cagr?.toFixed(0)}% DD${oos.ddc?.toFixed(1)}%`
  );
}

console.log('\n' + '='.repeat(100));
console.log('HEADLINE: cliff-down / staged-up hybrid vs current cliff vs #2 graded-both-ways');
console.log('='.repeat(100));
const current = applyDrawdownThrottle(dailyReturns, dates, { triggerDD: -8, restoreDD: -2, throttleMult: 0.25 });
printRow('Current (cliff/cliff)', current.dailyReturns);
const graded = applyGraded(dailyReturns, [{ trigger: -4, mult: 0.65 }, { trigger: -6, mult: 0.40 }, { trigger: -8, mult: 0.25 }], -2);
printRow('#2 Graded (both ways)', graded.dailyReturns);
const hybrid = applyCliffDownStagedUp(dailyReturns, {
  triggerDD: -8, restoreDD: -2,
  upStages: [{ ddAbove: -8, mult: 0.25 }, { ddAbove: -6, mult: 0.40 }, { ddAbove: -4, mult: 0.65 }],
});
printRow('Hybrid (cliff down/staged up)', hybrid.dailyReturns);

console.log('\n' + '='.repeat(100));
console.log('WORST EPISODE TRACE (same Oct 2023 episode as before)');
console.log('='.repeat(100));
let eq = 1, peak = 1, peakIdx = 0, worstDD = 0, worstTroughIdx = 0, worstPeakIdx = 0;
for (let i = 0; i < dailyReturns.length; i++) {
  eq *= (1 + dailyReturns[i] / 100);
  if (eq > peak) { peak = eq; peakIdx = i; }
  const dd = (eq - peak) / peak * 100;
  if (dd < worstDD) { worstDD = dd; worstTroughIdx = i; worstPeakIdx = peakIdx; }
}
console.log(`Episode: ${dates[worstPeakIdx]} -> ${dates[worstTroughIdx]} (unthrottled reached ${worstDD.toFixed(1)}%)`);
for (const [label, series] of [['No throttle', dailyReturns], ['Current (cliff/cliff)', current.dailyReturns], ['#2 Graded', graded.dailyReturns], ['Hybrid', hybrid.dailyReturns]]) {
  let e = 1, p = 1, worst = 0;
  for (let i = worstPeakIdx; i <= worstTroughIdx; i++) { e *= (1 + series[i] / 100); if (e > p) p = e; const dd = (e - p) / p * 100; if (dd < worst) worst = dd; }
  console.log(`  ${label.padEnd(22)} actual DD reached: ${worst.toFixed(1)}%`);
}

console.log('\n' + '='.repeat(100));
console.log('DAY-BY-DAY WALK THROUGH THE WORST EPISODE (hybrid track: DD, throttled?, mult)');
console.log('='.repeat(100));
const windowStart = Math.max(0, worstPeakIdx);
const windowEnd = Math.min(dates.length - 1, worstTroughIdx + 15); // show a bit of the recovery tail too
for (let i = windowStart; i <= windowEnd; i++) {
  const t = hybrid.track[i];
  console.log(`  ${t.date}  DD ${t.ddNow.toFixed(1)}%  throttled=${t.throttled}  mult=${t.mult}`);
}
