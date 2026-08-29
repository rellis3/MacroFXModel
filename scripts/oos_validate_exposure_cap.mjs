// OOS validation for the pre-trade net exposure cap (applyExposureCap,
// levelAtlasVoteReview.js, 2026-08-28) -- the "real fix" flagged repeatedly
// this session: unlike the heat cap (gross % regardless of sign) or the
// currency loss gate (reactive to REALIZED loss), this tracks RUNNING net
// signed exposure per currency/gold/equity-risk factor across currently-OPEN
// positions and blocks a candidate only if IT would push one of its own
// factors past the cap -- an offsetting trade is free even when the account
// is heavily exposed elsewhere; a same-direction stack is what gets capped.
// Same discipline as every other lever this session: sweep the cap on IS
// ONLY, pick via a pre-stated rule (not best-IS-Sharpe), freeze it, check
// the untouched OOS slice on every headline number.
//
// Tested STANDALONE (no currency loss gate) first -- this is the more
// fundamental mechanism; whether it composes with the currency gate is a
// separate question for later, not conflated with this test.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyConcurrencyCap, buildPortfolioDailySeries, riskAdjustTrades, applyExposureCap } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'analysis', 'output', 'level-atlas-vote-trades');
const MIN_MARGIN = 3, MAX_CONCURRENT = 1, RISK_PCT = 1;

// The "Select recommended" 17-pair set -- same universe every other lever
// this session was tested against, for direct comparability.
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
console.log(`IS baseline (no cap): Sharpe ${isBase.sharpe}  annVol ${isBase.annVol}%  maxDD ${isBase.maxDD}%  CVaR95 ${isBase.cvar95}%\n`);

const GRID = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
console.log('IS sweep (maxNetExposurePct -> Sharpe / annVol / maxDD / CVaR95 / blocked%):');
const isRows = [];
for (const cap of GRID) {
  const g = applyExposureCap(isTrades, { maxNetExposurePct: cap });
  const s = statsFor(g.kept);
  isRows.push({ cap, sharpe: s.sharpe, annVol: s.annVol, maxDD: s.maxDD, cvar95: s.cvar95, skipped: g.skippedCount, total: g.totalCount });
  console.log(`  cap=${String(cap).padStart(4)}  Sharpe ${String(s.sharpe).padEnd(5)} annVol ${String(s.annVol).padEnd(6)} maxDD ${String(s.maxDD).padEnd(7)} CVaR95 ${String(s.cvar95).padEnd(7)} blocked ${g.skippedCount}/${g.totalCount} (${(g.skippedCount / g.totalCount * 100).toFixed(1)}%)`);
}

// Same pre-stated rule as the currency loss gate: tightest cap that costs no
// more than 10% of uncapped IS Sharpe. Tightest, not best-Sharpe -- the
// throttle failed OOS earlier this session precisely by chasing IS Sharpe.
const sharpeFloor = isBase.sharpe * 0.9;
const eligible = isRows.filter(r => r.sharpe >= sharpeFloor).sort((a, b) => a.cap - b.cap);
const chosen = eligible[0] ?? isRows[isRows.length - 1];
console.log(`\nChosen (pre-stated rule: tightest cap with IS Sharpe >= 90% of uncapped [${sharpeFloor.toFixed(2)}]): maxNetExposurePct=${chosen.cap}\n`);

const oosBase = statsFor(oosTrades);
const gOos = applyExposureCap(oosTrades, { maxNetExposurePct: chosen.cap });
const oosCapped = statsFor(gOos.kept);

console.log('OOS, threshold frozen from IS, applied unchanged:');
console.log(`  before cap: Sharpe ${oosBase.sharpe}  annVol ${oosBase.annVol}%  maxDD ${oosBase.maxDD}%  CVaR95 ${oosBase.cvar95}%`);
console.log(`  after  cap: Sharpe ${oosCapped.sharpe}  annVol ${oosCapped.annVol}%  maxDD ${oosCapped.maxDD}%  CVaR95 ${oosCapped.cvar95}%  (blocked ${gOos.skippedCount}/${gOos.totalCount}, ${(gOos.skippedCount / gOos.totalCount * 100).toFixed(1)}%)`);
console.log(`\nOOS deltas: Sharpe ${(oosCapped.sharpe - oosBase.sharpe >= 0 ? '+' : '')}${(oosCapped.sharpe - oosBase.sharpe).toFixed(2)}  annVol ${(oosCapped.annVol - oosBase.annVol).toFixed(1)}pp  maxDD ${(oosCapped.maxDD - oosBase.maxDD).toFixed(2)}pp  CVaR95 ${(oosCapped.cvar95 - oosBase.cvar95).toFixed(2)}pp`);
