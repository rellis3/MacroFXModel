// OOS validation for the per-currency daily loss gate (applyCurrencyLossGate,
// levelAtlasVoteReview.js, 2026-08-28) -- built after inspecting the
// portfolio's worst days directly showed no single PAIR drives more than
// ~30% of a bad day's loss, but a single CURRENCY (usually JPY or USD) often
// drives 40-80% of it. The gate is a genuine risk-management choice, not a
// return-maximizing parameter, so this script does NOT just chase OOS
// Sharpe: it sweeps maxDailyLossPct on IS ONLY, reports the FULL Sharpe/
// maxDD/CVaR/annVol tradeoff curve, picks ONE threshold via a pre-stated
// rule (tightest threshold that costs no more than 10% of uncapped IS
// Sharpe), freezes it, and reports what that SAME threshold does OOS on
// every headline number -- not just whether Sharpe went up.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyConcurrencyCap, buildPortfolioDailySeries, riskAdjustTrades, applyCurrencyLossGate } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'analysis', 'output', 'level-atlas-vote-trades');
const MIN_MARGIN = 3, MAX_CONCURRENT = 1, RISK_PCT = 1;

// The "Select recommended" 17-pair set from the portfolio page.
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
const cutoff = uniqueDates[Math.floor(uniqueDates.length * 0.7)];
console.log(`${allTrades.length} total trades across ${PAIRS.length} pairs. Split date: ${cutoff}\n`);

const isTrades = allTrades.filter(t => t.date <= cutoff);
const oosTrades = allTrades.filter(t => t.date > cutoff);

function statsFor(trades) {
  const byPair = {};
  for (const t of trades) (byPair[t.pair] ??= []).push(t);
  const weights = Object.fromEntries(Object.keys(byPair).map(s => [s, 1]));
  const combined = buildPortfolioDailySeries(byPair, { weights });
  return portfolioStats(combined.dailyReturns, { mc: false });
}

const isBase = statsFor(isTrades);
console.log(`IS baseline (no gate): Sharpe ${isBase.sharpe}  annVol ${isBase.annVol}%  maxDD ${isBase.maxDD}%  CVaR95 ${isBase.cvar95}%\n`);

const GRID = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
console.log('IS sweep (maxDailyLossPct -> Sharpe / annVol / maxDD / CVaR95 / skipped):');
const isRows = [];
for (const cap of GRID) {
  const g = applyCurrencyLossGate(isTrades, { maxDailyLossPct: cap });
  const s = statsFor(g.kept);
  isRows.push({ cap, sharpe: s.sharpe, annVol: s.annVol, maxDD: s.maxDD, cvar95: s.cvar95, skipped: g.skippedCount, total: g.totalCount });
  console.log(`  cap=${String(cap).padStart(4)}%  Sharpe ${String(s.sharpe).padEnd(5)} annVol ${String(s.annVol).padEnd(6)} maxDD ${String(s.maxDD).padEnd(7)} CVaR95 ${String(s.cvar95).padEnd(7)} skipped ${g.skippedCount}/${g.totalCount} (${(g.skippedCount / g.totalCount * 100).toFixed(1)}%)`);
}

// Pre-stated selection rule: tightest cap that costs no more than 10% of
// the uncapped IS Sharpe. Tightest, not best-Sharpe, because the objective
// here is risk reduction, not return-chasing -- picking by best-IS-Sharpe
// is exactly the in-sample-optimization trap the throttle got caught by.
const sharpeFloor = isBase.sharpe * 0.9;
const eligible = isRows.filter(r => r.sharpe >= sharpeFloor).sort((a, b) => a.cap - b.cap);
const chosen = eligible[0] ?? isRows[isRows.length - 1];
console.log(`\nChosen (pre-stated rule: tightest cap with IS Sharpe >= 90% of uncapped [${sharpeFloor.toFixed(2)}]): maxDailyLossPct=${chosen.cap}%\n`);

// Freeze that threshold, apply unchanged to OOS.
const oosBase = statsFor(oosTrades);
const gOos = applyCurrencyLossGate(oosTrades, { maxDailyLossPct: chosen.cap });
const oosGated = statsFor(gOos.kept);

console.log('OOS, threshold frozen from IS, applied unchanged:');
console.log(`  before gate: Sharpe ${oosBase.sharpe}  annVol ${oosBase.annVol}%  maxDD ${oosBase.maxDD}%  CVaR95 ${oosBase.cvar95}%`);
console.log(`  after  gate: Sharpe ${oosGated.sharpe}  annVol ${oosGated.annVol}%  maxDD ${oosGated.maxDD}%  CVaR95 ${oosGated.cvar95}%  (skipped ${gOos.skippedCount}/${gOos.totalCount}, ${(gOos.skippedCount / gOos.totalCount * 100).toFixed(1)}%)`);
console.log(`\nOOS deltas: Sharpe ${(oosGated.sharpe - oosBase.sharpe >= 0 ? '+' : '')}${(oosGated.sharpe - oosBase.sharpe).toFixed(2)}  annVol ${(oosGated.annVol - oosBase.annVol).toFixed(1)}pp  maxDD ${(oosGated.maxDD - oosBase.maxDD).toFixed(2)}pp  CVaR95 ${(oosGated.cvar95 - oosBase.cvar95).toFixed(2)}pp`);
