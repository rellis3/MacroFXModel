// Does Thread 1 (the vote) trade BETTER when it agrees with Thread 2 (the raw
// p50=continuation/p75=fade base rate) than when it bets against it? — 2026-09-11
//
// Thread 2 alone is closed (negative after cost, no context/exit fix rescued
// it -- see level_base_rates_*.mjs). But its directional lean IS real
// (z=13-22, level_base_rates_honest.mjs). Thread 1's vote doesn't always
// agree with that naive lean -- it sometimes bets the OPPOSITE way when
// enough context dimensions disagree. This asks a purely descriptive
// question on Thread 1's OWN already-validated real-OOS trades: does
// agreement with the raw lean predict a better or worse trade? No new
// parameter is fit here (agreement is a deterministic function of two
// already-fixed fields), so no further train/test split is needed beyond
// the honest real-OOS trades already built.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook, splitAt } from '../js/levelAtlasReport.js';
import { buildBarrierTrades, applyConcurrencyCap } from '../js/levelAtlasVoteReview.js';
import { summarizeTrades } from '../js/metricsCore.js';
import { costForPair } from '../js/perLineStrategy.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { boundPacked, LOOKBACK_DAYS, DEFAULT_REARM } from '../js/levelAtlasRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');
const MIN_MARGIN = 3;
const MAX_CONCURRENT = 3; // matches shared live config
const NAIVE_RULE = { p50: 'follow', p75: 'fade' }; // Thread 2's raw lean

const PAIRS = process.env.LA_PAIRS ? process.env.LA_PAIRS.split(',') : ['eurusd', 'gbpusd', 'usdjpy', 'audusd',
  'usdchf', 'euraud', 'eurchf', 'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

const allTrades = [];
const perPair = {};
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
  const trades = buildBarrierTrades(touches, honestBook, { rearmFrac: DEFAULT_REARM, cost, oosStartDate: realSplit })
    .filter(t => t.margin >= MIN_MARGIN);
  const capped = applyConcurrencyCap(trades, { maxConcurrent: MAX_CONCURRENT }).kept ?? [];
  const withAgree = capped.map(t => ({ ...t, instrument: pair.toUpperCase(), agrees: NAIVE_RULE[t.rung] === t.decision }));
  perPair[pair.toUpperCase()] = withAgree;
  allTrades.push(...withAgree);
  console.log(`  ${withAgree.length} trades, ${withAgree.filter(t => t.agrees).length} agree with naive base rate`);
}

function row(label, trades) {
  if (trades.length < 30) return `${label.padEnd(32)}${String(trades.length).padStart(7)}   [thin]`;
  const s = summarizeTrades(trades.map(t => t.pnlPct), trades.map(t => t.date));
  const n = trades.length;
  const m = trades.reduce((a, t) => a + t.pnlPct, 0) / n;
  const sd = Math.sqrt(trades.reduce((a, t) => a + (t.pnlPct - m) ** 2, 0) / (n - 1));
  const t = sd > 0 ? m / (sd / Math.sqrt(n)) : 0;
  return label.padEnd(32) + String(n).padStart(7) + (s.winRate ?? 0).toFixed(1).padStart(8) +
    ((m >= 0 ? '+' : '') + m.toFixed(4)).padStart(10) + (s.profitFactor ?? 0).toFixed(2).padStart(7) +
    (s.sharpe ?? 0).toFixed(2).padStart(8) + ('t' + t.toFixed(2)).padStart(8);
}

console.log(`\nTotal: ${allTrades.length} trades, ${allTrades.filter(t => t.agrees).length} agree (${(allTrades.filter(t => t.agrees).length / allTrades.length * 100).toFixed(1)}%)`);

console.log('\n' + '='.repeat(94));
console.log('DOES VOTE AGREEMENT WITH THE RAW BASE RATE PREDICT TRADE QUALITY?');
console.log('='.repeat(94));
console.log('policy'.padEnd(32), 'n'.padStart(7), 'win%'.padStart(8), 'meanPct'.padStart(10), 'PF'.padStart(7), 'sharpe'.padStart(8), 't-stat'.padStart(8));
console.log(row('ALL (current live trades)', allTrades));
console.log(row('AGREES with base rate', allTrades.filter(t => t.agrees)));
console.log(row('DISAGREES with base rate', allTrades.filter(t => !t.agrees)));

console.log('\n--- per pair ---');
let agreeBetter = 0, disagreeBetter = 0, tested = 0;
for (const pair of PAIRS) {
  const P = pair.toUpperCase();
  const agree = perPair[P].filter(t => t.agrees);
  const disagree = perPair[P].filter(t => !t.agrees);
  console.log(row(`${P} agrees`, agree));
  console.log(row(`${P} disagrees`, disagree));
  if (agree.length >= 30 && disagree.length >= 30) {
    tested++;
    const mA = agree.reduce((a, t) => a + t.pnlPct, 0) / agree.length;
    const mD = disagree.reduce((a, t) => a + t.pnlPct, 0) / disagree.length;
    if (mA > mD) agreeBetter++; else disagreeBetter++;
  }
}
console.log(`\nOf ${tested} pairs with enough data in both buckets: agree-better in ${agreeBetter}, disagree-better in ${disagreeBetter}`);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'vote_atlas_confluence_with_base_rate.json'), JSON.stringify({
  all: allTrades.length >= 30 ? summarizeTrades(allTrades.map(t => t.pnlPct), allTrades.map(t => t.date)) : null,
  agrees: summarizeTrades(allTrades.filter(t => t.agrees).map(t => t.pnlPct), allTrades.filter(t => t.agrees).map(t => t.date)),
  disagrees: summarizeTrades(allTrades.filter(t => !t.agrees).map(t => t.pnlPct), allTrades.filter(t => !t.agrees).map(t => t.date)),
}, null, 1));
console.log(`\nWrote ${OUT_DIR}/vote_atlas_confluence_with_base_rate.json`);
