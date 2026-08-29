// Does the currency loss gate's value overlap with scheduled high-impact news,
// and would a news-based avoidance/sizing rule help? Reuses EXISTING bricks
// only: calendarLoader.majorEventEpochs() (the local historical FF calendar,
// 2014-2026, already Major-impact-filtered) + eventGateCore's
// buildEventWindows/pairCcys/eventGate (the SAME blackout-window brick the
// live bots already gate entries on) -- no new calendar logic.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { majorEventEpochs } from '../js/calendarLoader.js';
import { buildEventWindows, pairCcys, eventGate } from '../js/eventGateCore.js';
import { applyConcurrencyCap, riskAdjustTrades } from '../js/levelAtlasVoteReview.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'analysis', 'output', 'level-atlas-vote-trades');
const MIN_MARGIN = 3, MAX_CONCURRENT = 1, RISK_PCT = 1;
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

const events = majorEventEpochs(); // [{epoch, ccy}] -- USD/GBP/EUR only in this feed's 'Major' tier
const asEvents = events.map(e => ({ country: e.ccy, impact: 'major', time: new Date(e.epoch * 1000).toISOString().slice(0, 19).replace('T', ' ') }));
const identityCcy = Object.fromEntries(['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'NZD', 'CHF'].map(c => [c, c]));
const PRE_MIN = 30, POST_MIN = 15;
const windows = buildEventWindows(asEvents, { preMin: PRE_MIN, postMin: POST_MIN, impacts: ['major'], countryToCcy: identityCcy });
console.log(`${events.length} Major events -> ${windows.length} blackout windows (${PRE_MIN}min pre / ${POST_MIN}min post)\n`);

const epochs = events.map(e => e.epoch).sort((a, b) => a - b);
function bisect(arr, x) { let lo = 0, hi = arr.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < x) lo = mid + 1; else hi = mid; } return lo; }
function nearestSec(t) { const i = bisect(epochs, t); let best = Infinity; if (i < epochs.length) best = Math.min(best, Math.abs(epochs[i] - t)); if (i > 0) best = Math.min(best, Math.abs(t - epochs[i - 1])); return best; }

let allTrades = [];
for (const p of PAIRS) {
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, `${p}-votetrades.json`), 'utf8'));
  const filtered = raw.trades.filter(t => t.margin >= MIN_MARGIN);
  const capped = applyConcurrencyCap(filtered, { maxConcurrent: MAX_CONCURRENT });
  const adjusted = riskAdjustTrades(capped.kept, RISK_PCT).map(t => ({ ...t, pair: raw.instrument }));
  allTrades.push(...adjusted);
}
console.log(`${allTrades.length} total trades.\n`);

// Test 1: CURRENCY-SCOPED gate (own legs only, the way eventGate is actually used live).
let inWindow = 0, outWindow = 0, inWinSum = 0, outWinSum = 0, inWinWins = 0, outWinWins = 0;
let noCcyCoverage = 0;
for (const t of allTrades) {
  const ccys = pairCcys(t.pair);
  if (!ccys.length) noCcyCoverage++; // GOLD + all 6 indices resolve to [] -- structurally ungated
  const g = eventGate(ccys, t.time * 1000, windows);
  if (g.blackout) { inWindow++; inWinSum += t.pnlPct; if (t.win) inWinWins++; }
  else { outWindow++; outWinSum += t.pnlPct; if (t.win) outWinWins++; }
}
console.log(`CURRENCY-SCOPED gate (pairCcys(t.pair) must match the event's own currency):`);
console.log(`  ${noCcyCoverage} of ${allTrades.length} trades (${(noCcyCoverage / allTrades.length * 100).toFixed(1)}%) get NO coverage at all -- pairCcys('GOLD'/'NQ'/'SPX'/'DOW'/'US2000'/'DE30'/'UK100') returns [] (no ISO currency code to match)`);
console.log(`  inside window:  n=${inWindow} (${(inWindow / allTrades.length * 100).toFixed(1)}%)  winRate=${(inWinWins / inWindow * 100).toFixed(1)}%  avgPnlPct=${(inWinSum / inWindow).toFixed(3)}`);
console.log(`  outside window: n=${outWindow} (${(outWindow / allTrades.length * 100).toFixed(1)}%)  winRate=${(outWinWins / outWindow * 100).toFixed(1)}%  avgPnlPct=${(outWinSum / outWindow).toFixed(3)}\n`);

// Test 2: CURRENCY-BLIND proximity (any Major event, regardless of the pair's own legs) --
// tests the broader "risk sentiment / liquidity" contagion hypothesis, which a
// currency-scoped gate structurally can't see (esp. for gold/indices above).
let close = 0, far = 0, closeWins = 0, farWins = 0, closeSum = 0, farSum = 0;
for (const t of allTrades) {
  const d = nearestSec(t.time);
  if (d <= PRE_MIN * 60) { close++; closeSum += t.pnlPct; if (t.win) closeWins++; }
  else { far++; farSum += t.pnlPct; if (t.win) farWins++; }
}
console.log(`CURRENCY-BLIND proximity (within ${PRE_MIN}min of ANY Major event, any pair):`);
console.log(`  near:  n=${close} (${(close / allTrades.length * 100).toFixed(1)}%)  winRate=${(closeWins / close * 100).toFixed(1)}%  avgPnlPct=${(closeSum / close).toFixed(3)}`);
console.log(`  far:   n=${far}  winRate=${(farWins / far * 100).toFixed(1)}%  avgPnlPct=${(farSum / far).toFixed(3)}\n`);

// Sanity: the 2024-09-06 burst IS real scheduled news (Sept NFP, confirmed in
// calendar_events.csv: "Payroll Jobs Growth" tagged Major at 12:30:00 UTC,
// exactly matching the observed 12:30-12:36 entry cluster) -- but restrict the
// check to the ACTUAL burst window, not the whole day (most of a day's 53
// trades happen hours later, unrelated to the print, and correctly don't
// match).
console.log('Burst-window sanity check (2024-09-06, 12:25-12:40 UTC only -- the actual cluster, not the whole day):');
const burst = allTrades.filter(t => t.date === '2024-09-06' && t.time >= Date.UTC(2024, 8, 6, 12, 25) / 1000 && t.time <= Date.UTC(2024, 8, 6, 12, 40) / 1000);
const burstCcyFlagged = burst.filter(t => eventGate(pairCcys(t.pair), t.time * 1000, windows).blackout).length;
const burstBlindFlagged = burst.filter(t => nearestSec(t.time) <= PRE_MIN * 60).length;
console.log(`  ${burst.length} trades in the burst window. Currency-scoped catches ${burstCcyFlagged}; currency-blind catches ${burstBlindFlagged}.`);
console.log(`  Pairs in the burst without currency coverage: ${[...new Set(burst.filter(t => !pairCcys(t.pair).length).map(t => t.pair))].join(', ') || 'none'}`);
