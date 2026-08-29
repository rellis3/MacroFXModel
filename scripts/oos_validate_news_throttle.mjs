// OOS validation for the scheduled, currency-blind news-proximity throttle
// (applyNewsProximityThrottle, levelAtlasVoteReview.js, 2026-08-28) -- built
// after scripts/check_news_overlap.mjs found a clean NULL on the direct
// hypothesis (trades near a Major event do NOT lose more on average) but
// confirmed the worst-day bursts genuinely coincide with scheduled prints
// (2024-09-06 = September NFP). The mechanism this targets is variance/tail,
// not mean return, so -- same discipline as the currency loss gate -- this
// does NOT chase IS Sharpe. It sweeps window width AND the risk multiplier
// on IS ONLY, reports the full tradeoff curve, freezes ONE choice via a
// pre-stated rule, and reports what that frozen choice does OOS on every
// headline number.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { majorEventEpochs } from '../js/calendarLoader.js';
import { applyConcurrencyCap, buildPortfolioDailySeries, riskAdjustTrades, mergeMajorEventWindows, applyNewsProximityThrottle } from '../js/levelAtlasVoteReview.js';
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
const cutoff = uniqueDates[Math.floor(uniqueDates.length * 0.7)];
console.log(`${allTrades.length} total trades across ${PAIRS.length} pairs. Split date: ${cutoff}\n`);

const isTrades = allTrades.filter(t => t.date <= cutoff);
const oosTrades = allTrades.filter(t => t.date > cutoff);

const events = majorEventEpochs().map(e => e.epoch); // USD/GBP/EUR Major, 2014-2026

function statsFor(trades) {
  const byPair = {};
  for (const t of trades) (byPair[t.pair] ??= []).push(t);
  const weights = Object.fromEntries(Object.keys(byPair).map(s => [s, 1]));
  const combined = buildPortfolioDailySeries(byPair, { weights });
  return portfolioStats(combined.dailyReturns, { mc: false });
}

const isBase = statsFor(isTrades);
console.log(`IS baseline (no throttle): Sharpe ${isBase.sharpe}  annVol ${isBase.annVol}%  maxDD ${isBase.maxDD}%  CVaR95 ${isBase.cvar95}%\n`);

const WIDTHS = [15, 30, 45, 60, 90]; // symmetric preMin=postMin=width
const MULTS = [0, 0.25, 0.5, 0.75];
console.log('IS sweep (width min / mult -> Sharpe / annVol / maxDD / CVaR95 / throttled%):');
const isRows = [];
for (const width of WIDTHS) {
  const windows = mergeMajorEventWindows(events, { preMin: width, postMin: width });
  for (const mult of MULTS) {
    const throttled = applyNewsProximityThrottle(isTrades, { windows, mult });
    const s = statsFor(throttled);
    const nThrottled = throttled.filter(t => t.newsThrottled).length;
    isRows.push({ width, mult, sharpe: s.sharpe, annVol: s.annVol, maxDD: s.maxDD, cvar95: s.cvar95, nThrottled });
    console.log(`  w=${String(width).padStart(3)}  mult=${String(mult).padEnd(4)}  Sharpe ${String(s.sharpe).padEnd(5)} annVol ${String(s.annVol).padEnd(6)} maxDD ${String(s.maxDD).padEnd(7)} CVaR95 ${String(s.cvar95).padEnd(7)} throttled ${nThrottled}/${isTrades.length} (${(nThrottled / isTrades.length * 100).toFixed(1)}%)`);
  }
}

// Pre-stated selection rule, same principle as the currency loss gate: don't
// chase IS Sharpe (that's the throttle-tuning trap that failed OOS earlier
// today). Among combos with IS Sharpe >= 90% of baseline, pick the one with
// the LARGEST CVaR95 improvement (the tail metric this mechanism specifically
// targets) -- not the largest annVol drop, since annVol is a whole-
// distribution average and this throttle only ever touches ~5-15% of trades;
// CVaR is the more direct read on whether the RARE bad days actually improved.
const sharpeFloor = isBase.sharpe * 0.9;
const eligible = isRows.filter(r => r.sharpe >= sharpeFloor);
eligible.sort((a, b) => b.cvar95 - a.cvar95); // CVaR95 is negative; b.cvar95 - a.cvar95 > 0 means b is LESS negative (better)
const chosen = eligible[0] ?? isRows[0];
console.log(`\nChosen (pre-stated rule: best IS CVaR95 among combos with IS Sharpe >= 90% of baseline [${sharpeFloor.toFixed(2)}]): width=${chosen.width}min, mult=${chosen.mult}\n`);

// Freeze, apply unchanged to OOS.
const oosBase = statsFor(oosTrades);
const oosWindows = mergeMajorEventWindows(events, { preMin: chosen.width, postMin: chosen.width });
const oosThrottled = applyNewsProximityThrottle(oosTrades, { windows: oosWindows, mult: chosen.mult });
const oosAfter = statsFor(oosThrottled);
const nOosThrottled = oosThrottled.filter(t => t.newsThrottled).length;

console.log('OOS, threshold frozen from IS, applied unchanged:');
console.log(`  before: Sharpe ${oosBase.sharpe}  annVol ${oosBase.annVol}%  maxDD ${oosBase.maxDD}%  CVaR95 ${oosBase.cvar95}%`);
console.log(`  after:  Sharpe ${oosAfter.sharpe}  annVol ${oosAfter.annVol}%  maxDD ${oosAfter.maxDD}%  CVaR95 ${oosAfter.cvar95}%  (throttled ${nOosThrottled}/${oosTrades.length}, ${(nOosThrottled / oosTrades.length * 100).toFixed(1)}%)`);
console.log(`\nOOS deltas: Sharpe ${(oosAfter.sharpe - oosBase.sharpe >= 0 ? '+' : '')}${(oosAfter.sharpe - oosBase.sharpe).toFixed(2)}  annVol ${(oosAfter.annVol - oosBase.annVol).toFixed(1)}pp  maxDD ${(oosAfter.maxDD - oosBase.maxDD).toFixed(2)}pp  CVaR95 ${(oosAfter.cvar95 - oosBase.cvar95).toFixed(2)}pp`);
