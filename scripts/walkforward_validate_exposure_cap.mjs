// Follow-up to oos_validate_exposure_cap.mjs: the single 70/30 split's
// pre-registered rule (tightest cap costing <=10% of IS Sharpe) landed on a
// loose cap (3) that barely bites OOS (Sharpe +0.01, CVaR +0.16pp) -- weak.
// Printing the OOS curve at OTHER grid points (purely descriptive, done
// AFTER seeing the frozen result) showed cap=1 would have had a MUCH bigger
// effect on that same OOS slice (CVaR +2.71pp, maxDD +9.6pp) at a real
// Sharpe cost (-0.53) -- but picking cap=1 NOW, having already seen it work
// on that slice, is exactly the data-snooping this project's whole OOS
// discipline exists to prevent. A single static split can't resolve this
// honestly once contaminated by hindsight.
//
// The clean way forward: WALK-FORWARD validation over multiple sequential
// folds. Each fold selects its cap from IS-only data using the SAME
// pre-stated rule, tests on its own fresh OOS block never touched by that
// fold's selection -- so every fold's OOS reading stays honest, and running
// several folds shows whether tighter caps help CONSISTENTLY (real
// mechanism) or only on the one slice already looked at (period-specific
// fluke). 4 equal blocks -> 3 forward folds.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyConcurrencyCap, buildPortfolioDailySeries, riskAdjustTrades, applyExposureCap } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'analysis', 'output', 'level-atlas-vote-trades');
const MIN_MARGIN = 3, MAX_CONCURRENT = 1, RISK_PCT = 1;
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

function loadPair(pair) {
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, `${pair}-votetrades.json`), 'utf8'));
  const filtered = raw.trades.filter(t => t.margin >= MIN_MARGIN);
  const capped = applyConcurrencyCap(filtered, { maxConcurrent: MAX_CONCURRENT });
  const adjusted = riskAdjustTrades(capped.kept, RISK_PCT);
  return adjusted.map(t => ({ ...t, pair: raw.instrument }));
}

let allTrades = [];
for (const p of PAIRS) allTrades.push(...loadPair(p));
allTrades.sort((a, b) => a.time - b.time);
const uniqueDates = [...new Set(allTrades.map(t => t.date))].sort();

function statsFor(trades) {
  const byPair = {};
  for (const t of trades) (byPair[t.pair] ??= []).push(t);
  const weights = Object.fromEntries(Object.keys(byPair).map(s => [s, 1]));
  const combined = buildPortfolioDailySeries(byPair, { weights });
  return portfolioStats(combined.dailyReturns, { mc: false });
}

const GRID = [1, 2, 3, 4, 5, 6, 8, 10];
const N_BLOCKS = 4;
const blockEdges = Array.from({ length: N_BLOCKS + 1 }, (_, i) => uniqueDates[Math.min(uniqueDates.length - 1, Math.floor(i * uniqueDates.length / N_BLOCKS))]);
console.log(`${N_BLOCKS} blocks, edges: ${blockEdges.join(' | ')}\n`);

const foldResults = [];
for (let fold = 1; fold < N_BLOCKS; fold++) {
  const trainEnd = blockEdges[fold];
  const testEnd = blockEdges[fold + 1];
  const trainTrades = allTrades.filter(t => t.date <= trainEnd);
  const testTrades = allTrades.filter(t => t.date > trainEnd && t.date <= testEnd);
  if (!testTrades.length) continue;

  const trainBase = statsFor(trainTrades);
  const rows = GRID.map(cap => {
    const g = applyExposureCap(trainTrades, { maxNetExposurePct: cap });
    const s = statsFor(g.kept);
    return { cap, sharpe: s.sharpe };
  });
  const floor = trainBase.sharpe * 0.9;
  const eligible = rows.filter(r => r.sharpe >= floor).sort((a, b) => a.cap - b.cap);
  const chosen = (eligible[0] ?? rows[rows.length - 1]).cap;

  const testBase = statsFor(testTrades);
  const gTest = applyExposureCap(testTrades, { maxNetExposurePct: chosen });
  const testCapped = statsFor(gTest.kept);

  foldResults.push({ fold, trainEnd, testEnd, chosen, testBase, testCapped, blocked: gTest.skippedCount, total: gTest.totalCount });
  console.log(`Fold ${fold} (train <= ${trainEnd}, test ${trainEnd} -> ${testEnd}): chosen cap=${chosen}`);
  console.log(`  test before: Sharpe ${testBase.sharpe}  annVol ${testBase.annVol}%  maxDD ${testBase.maxDD}%  CVaR95 ${testBase.cvar95}%`);
  console.log(`  test after:  Sharpe ${testCapped.sharpe}  annVol ${testCapped.annVol}%  maxDD ${testCapped.maxDD}%  CVaR95 ${testCapped.cvar95}%  (blocked ${gTest.skippedCount}/${gTest.totalCount}, ${(gTest.skippedCount / gTest.totalCount * 100).toFixed(1)}%)`);
  console.log(`  deltas: Sharpe ${(testCapped.sharpe - testBase.sharpe >= 0 ? '+' : '')}${(testCapped.sharpe - testBase.sharpe).toFixed(2)}  annVol ${(testCapped.annVol - testBase.annVol).toFixed(1)}pp  maxDD ${(testCapped.maxDD - testBase.maxDD).toFixed(2)}pp  CVaR95 ${(testCapped.cvar95 - testBase.cvar95).toFixed(2)}pp\n`);
}

console.log('Summary across folds (each fold\'s cap chosen independently from ITS OWN train slice only):');
for (const f of foldResults) {
  console.log(`  fold ${f.fold}: cap=${f.chosen}  Sharpe delta ${(f.testCapped.sharpe - f.testBase.sharpe).toFixed(2)}  CVaR95 delta ${(f.testCapped.cvar95 - f.testBase.cvar95).toFixed(2)}pp  maxDD delta ${(f.testCapped.maxDD - f.testBase.maxDD).toFixed(2)}pp`);
}
