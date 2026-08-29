// One-off OOS validation for the drawdown throttle / portfolio heat cap
// parameters hand-tuned on the FULL sample earlier today. Splits the 5-pair
// fixed-risk combined daily series chronologically (70% IS / 30% OOS), grid-
// searches a small set of candidate configs on IS ONLY (selection by Calmar,
// the metric the throttle specifically targets), then applies the WINNING
// config unchanged to OOS and reports both sides honestly next to the
// no-overlay baseline. Read-only — does not touch any route/UI code.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyConcurrencyCap, buildPortfolioDailySeries, riskAdjustTrades, applyDrawdownThrottle, applyPortfolioHeatCap } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'analysis', 'output', 'level-atlas-vote-trades');
const PAIRS = ['eurusd', 'gbpusd', 'gold', 'usdjpy', 'audusd'];
const MIN_MARGIN = 3, MAX_CONCURRENT = 1, RISK_PCT = 1;

function loadPair(pair) {
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, `${pair}-votetrades.json`), 'utf8'));
  const filtered = raw.trades.filter(t => t.margin >= MIN_MARGIN);
  const capped = applyConcurrencyCap(filtered, { maxConcurrent: MAX_CONCURRENT });
  const adjusted = riskAdjustTrades(capped.kept, RISK_PCT).map(t => ({ ...t, pair: raw.instrument }));
  return adjusted;
}

const perPairTrades = {};
for (const p of PAIRS) perPairTrades[p] = loadPair(p);

const weights = Object.fromEntries(Object.keys(perPairTrades).map(p => [p, 1]));
const combined = buildPortfolioDailySeries(perPairTrades, { weights });
const N = combined.dates.length;
const splitIdx = Math.floor(N * 0.7);
const splitDate = combined.dates[splitIdx];
console.log(`Total days: ${N}, split at index ${splitIdx} (${splitDate}) -> IS=${splitIdx} days, OOS=${N - splitIdx} days`);

const isReturns = combined.dailyReturns.slice(0, splitIdx);
const isDates = combined.dates.slice(0, splitIdx);
const oosReturns = combined.dailyReturns.slice(splitIdx);
const oosDates = combined.dates.slice(splitIdx);

function report(label, stats) {
  console.log(`  ${label}: Sharpe ${stats.sharpe}  CAGR ${stats.cagr}%  maxDD ${stats.maxDD}%  Calmar ${stats.calmar}  annVol ${stats.annVol}%`);
}

console.log('\n=== BASELINE (no throttle, no heat cap) ===');
const isBase = portfolioStats(isReturns, { mc: false });
const oosBase = portfolioStats(oosReturns, { mc: false });
report('IS ', isBase);
report('OOS', oosBase);

console.log('\n=== DRAWDOWN THROTTLE — grid search on IS, apply winner to OOS ===');
const throttleCandidates = [
  { triggerDD: -5, restoreDD: 0, throttleMult: 0.5 },
  { triggerDD: -8, restoreDD: 0, throttleMult: 0.5 },
  { triggerDD: -8, restoreDD: -2, throttleMult: 0.5 },
  { triggerDD: -6, restoreDD: -1, throttleMult: 0.4 },
  { triggerDD: -10, restoreDD: -3, throttleMult: 0.3 },
  { triggerDD: -8, restoreDD: -2, throttleMult: 0.4 },
];
let bestCfg = null, bestCalmar = -Infinity;
for (const cfg of throttleCandidates) {
  const tr = applyDrawdownThrottle(isReturns, isDates, cfg);
  const st = portfolioStats(tr.dailyReturns, { mc: false });
  console.log(`  IS candidate ${JSON.stringify(cfg)} -> Sharpe ${st.sharpe} Calmar ${st.calmar} maxDD ${st.maxDD}%`);
  if (st.calmar > bestCalmar) { bestCalmar = st.calmar; bestCfg = cfg; }
}
console.log(`\n  WINNER (by IS Calmar): ${JSON.stringify(bestCfg)}`);
const trIS = applyDrawdownThrottle(isReturns, isDates, bestCfg);
const trOOS = applyDrawdownThrottle(oosReturns, oosDates, bestCfg);
report('IS  (throttled, chosen config)', portfolioStats(trIS.dailyReturns, { mc: false }));
report('OOS (throttled, SAME config, unseen data)', portfolioStats(trOOS.dailyReturns, { mc: false }));

console.log('\n=== PORTFOLIO HEAT CAP — grid search on IS, apply winner to OOS ===');
// Heat cap needs the per-pair trade lists (not the combined series) since it
// operates on individual trades' riskPctUsed before they're summed by day.
function isDateOnOrBefore(t, cutoff) { return t.date <= cutoff; }
const perPairIS = {}, perPairOOS = {};
for (const p of Object.keys(perPairTrades)) {
  perPairIS[p] = perPairTrades[p].filter(t => isDateOnOrBefore(t, splitDate));
  perPairOOS[p] = perPairTrades[p].filter(t => !isDateOnOrBefore(t, splitDate));
}
const heatCandidates = [1, 1.5, 2, 3];
let bestHeat = null, bestHeatCalmar = -Infinity;
for (const maxHeatPct of heatCandidates) {
  const capped = applyPortfolioHeatCap(perPairIS, { maxHeatPct });
  const byPair = {};
  for (const t of capped.kept) (byPair[t.pair] ??= []).push(t);
  const w = Object.fromEntries(Object.keys(byPair).map(p => [p, 1]));
  const c = buildPortfolioDailySeries(byPair, { weights: w });
  const st = portfolioStats(c.dailyReturns, { mc: false });
  console.log(`  IS candidate maxHeatPct=${maxHeatPct} -> Sharpe ${st.sharpe} Calmar ${st.calmar} maxDD ${st.maxDD}%`);
  if (st.calmar > bestHeatCalmar) { bestHeatCalmar = st.calmar; bestHeat = maxHeatPct; }
}
console.log(`\n  WINNER (by IS Calmar): maxHeatPct=${bestHeat}`);
function heatCapStats(perPairSet, maxHeatPct) {
  const capped = applyPortfolioHeatCap(perPairSet, { maxHeatPct });
  const byPair = {};
  for (const t of capped.kept) (byPair[t.pair] ??= []).push(t);
  const w = Object.fromEntries(Object.keys(byPair).map(p => [p, 1]));
  const c = buildPortfolioDailySeries(byPair, { weights: w });
  return portfolioStats(c.dailyReturns, { mc: false });
}
report('IS  (heat-capped, chosen config)', heatCapStats(perPairIS, bestHeat));
report('OOS (heat-capped, SAME config, unseen data)', heatCapStats(perPairOOS, bestHeat));
