// Narrower follow-up to oos_validate_news_throttle.mjs: that version throttled
// around EVERY 'Major'-impact calendar event (158 distinct event types,
// pooled) and lost badly to the currency loss gate OOS (-0.66 Sharpe for only
// +0.36pp CVaR) -- a broad blunt instrument catching mostly-fine trades along
// with the rare bad ones. This restricts to a SURGICAL set: only the
// well-known "big three" US releases (NFP, CPI, FOMC) that are genuinely
// famous for moving every asset class at once, not the full 158-type Major
// grab-bag (business confidence indices, GDP revisions, speeches, etc).
//
// Reads calendar_events.csv directly (bypassing calendarLoader.js's
// majorEventEpochs(), which strips the event name this filter needs) --
// same column-index parsing convention calendarLoader.js documents as safe
// for these columns (none of the 7 whitelisted event names contain a comma).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyConcurrencyCap, buildPortfolioDailySeries, riskAdjustTrades, mergeMajorEventWindows, applyNewsProximityThrottle } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'analysis', 'output', 'level-atlas-vote-trades');
const MIN_MARGIN = 3, MAX_CONCURRENT = 1, RISK_PCT = 1;
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

// NFP + CPI + FOMC only, USD only (confirmed via check: all 7 are >=84 USD
// rows each; a couple of these titles also carry EUR/GBP rows elsewhere in
// the file for their own countries' releases, deliberately excluded here to
// stay surgical -- this is specifically the US "big three", not a general
// inflation/employment/rate-decision sweep).
const SURGICAL_NAMES = new Set([
  'Payroll Jobs Growth', 'Headline Unemployment Rate',           // NFP (same print, 12:30 UTC)
  'Inflation Rate Year-over-Year', 'Core Inflation Rate Year-over-Year', // CPI
  'Fed Interest Rate Decision', 'Fed Press Conference', 'FOMC Meeting Minutes', // FOMC
]);

function loadSurgicalEpochs() {
  const text = fs.readFileSync(path.join(__dirname, '..', 'calendar_events.csv'), 'latin1');
  const lines = text.split('\n');
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]; if (!line) continue;
    const c1 = line.indexOf(','); if (c1 < 0) continue;
    const c2 = line.indexOf(',', c1 + 1); if (c2 < 0) continue;
    const c3 = line.indexOf(',', c2 + 1); if (c3 < 0) continue;
    const c4 = line.indexOf(',', c3 + 1); if (c4 < 0) continue;
    const c5 = line.indexOf(',', c4 + 1); if (c5 < 0) continue;
    const c6 = line.indexOf(',', c5 + 1); if (c6 < 0) continue;
    const datetimeRaw = line.slice(c1 + 1, c2);
    const ccy = line.slice(c3 + 1, c4);
    const impact = line.slice(c4 + 1, c5);
    const event = line.slice(c5 + 1, c6);
    if (impact !== 'Major' || ccy !== 'USD' || !SURGICAL_NAMES.has(event)) continue;
    const m = datetimeRaw.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    if (!m) continue;
    out.push(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000);
  }
  return out.sort((a, b) => a - b);
}

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

const isTrades = allTrades.filter(t => t.date <= cutoff);
const oosTrades = allTrades.filter(t => t.date > cutoff);

const events = loadSurgicalEpochs();
console.log(`${events.length} surgical (NFP/CPI/FOMC, USD-only) event epochs vs 5189 for the broad 'every Major' version. Split date: ${cutoff}\n`);

function statsFor(trades) {
  const byPair = {};
  for (const t of trades) (byPair[t.pair] ??= []).push(t);
  const weights = Object.fromEntries(Object.keys(byPair).map(s => [s, 1]));
  const combined = buildPortfolioDailySeries(byPair, { weights });
  return portfolioStats(combined.dailyReturns, { mc: false });
}

const isBase = statsFor(isTrades);
console.log(`IS baseline (no throttle): Sharpe ${isBase.sharpe}  annVol ${isBase.annVol}%  maxDD ${isBase.maxDD}%  CVaR95 ${isBase.cvar95}%\n`);

const WIDTHS = [15, 30, 45, 60, 90];
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

// Same pre-stated rule as the broad version, for a fair like-for-like comparison.
const sharpeFloor = isBase.sharpe * 0.9;
const eligible = isRows.filter(r => r.sharpe >= sharpeFloor);
eligible.sort((a, b) => b.cvar95 - a.cvar95);
const chosen = eligible[0] ?? isRows[0];
console.log(`\nChosen (same rule as broad version: best IS CVaR95 among IS Sharpe >= 90% of baseline [${sharpeFloor.toFixed(2)}]): width=${chosen.width}min, mult=${chosen.mult}\n`);

const oosBase = statsFor(oosTrades);
const oosWindows = mergeMajorEventWindows(events, { preMin: chosen.width, postMin: chosen.width });
const oosThrottled = applyNewsProximityThrottle(oosTrades, { windows: oosWindows, mult: chosen.mult });
const oosAfter = statsFor(oosThrottled);
const nOosThrottled = oosThrottled.filter(t => t.newsThrottled).length;

console.log('OOS, threshold frozen from IS, applied unchanged:');
console.log(`  before: Sharpe ${oosBase.sharpe}  annVol ${oosBase.annVol}%  maxDD ${oosBase.maxDD}%  CVaR95 ${oosBase.cvar95}%`);
console.log(`  after:  Sharpe ${oosAfter.sharpe}  annVol ${oosAfter.annVol}%  maxDD ${oosAfter.maxDD}%  CVaR95 ${oosAfter.cvar95}%  (throttled ${nOosThrottled}/${oosTrades.length}, ${(nOosThrottled / oosTrades.length * 100).toFixed(1)}%)`);
console.log(`\nOOS deltas: Sharpe ${(oosAfter.sharpe - oosBase.sharpe >= 0 ? '+' : '')}${(oosAfter.sharpe - oosBase.sharpe).toFixed(2)}  annVol ${(oosAfter.annVol - oosBase.annVol).toFixed(1)}pp  maxDD ${(oosAfter.maxDD - oosBase.maxDD).toFixed(2)}pp  CVaR95 ${(oosAfter.cvar95 - oosBase.cvar95).toFixed(2)}pp`);
