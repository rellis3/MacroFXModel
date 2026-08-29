// leave_one_out_with_ccygate.mjs found a MEANINGFULLY different (and better,
// in-sample) exclusion set once the currency loss gate is active: same rough
// pair COUNT (~17 kept) but a different membership (keeps USDCAD/EURGBP/
// GBPJPY that the stale pre-gate selection excluded; newly excludes AUDJPY/
// CHFJPY/USDCHF instead). Before recommending a change, apply the SAME
// discipline the original selection and the gate itself both got: pick the
// exclusion set from IS-only data, freeze it, check it holds up on the
// UNTOUCHED OOS slice -- not just that it looks better in-sample.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyConcurrencyCap, buildPortfolioDailySeries, riskAdjustTrades, applyCurrencyLossGate } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'analysis', 'output', 'level-atlas-vote-trades');
const MIN_MARGIN = 3, MAX_CONCURRENT = 1, RISK_PCT = 1, MAX_DAILY_LOSS_PCT = 1;
const STOP_AT_N = 17; // same pair COUNT as the currently-shipped "Select recommended" set, for a direct apples-to-apples comparison

const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurjpy', 'eurgbp', 'euraud', 'eurcad', 'eurchf', 'gbpjpy', 'gbpaud',
  'gbpchf', 'audjpy', 'audcad', 'cadjpy', 'chfjpy', 'nzdjpy', 'gold',
  'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

function loadPair(pair) {
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, `${pair}-votetrades.json`), 'utf8'));
  const filtered = raw.trades.filter(t => t.margin >= MIN_MARGIN);
  const capped = applyConcurrencyCap(filtered, { maxConcurrent: MAX_CONCURRENT });
  return { sym: raw.instrument, trades: riskAdjustTrades(capped.kept, RISK_PCT).map(t => ({ ...t, pair: raw.instrument })) };
}

const perPairTrades = {};
for (const p of PAIRS) {
  const { sym, trades } = loadPair(p);
  perPairTrades[sym] = trades;
}
const allSyms = new Set(Object.keys(perPairTrades));

function splitDate() {
  const combined = buildPortfolioDailySeries(perPairTrades, { weights: Object.fromEntries([...allSyms].map(s => [s, 1])) });
  return combined.dates[Math.floor(combined.dates.length * 0.7)];
}
const cutoff = splitDate();
console.log(`Split date: ${cutoff}\n`);

const isTradesRaw = {}, oosTradesRaw = {};
for (const sym of allSyms) {
  isTradesRaw[sym] = perPairTrades[sym].filter(t => t.date <= cutoff);
  oosTradesRaw[sym] = perPairTrades[sym].filter(t => t.date > cutoff);
}

// Gate IS and OOS as INDEPENDENT chronological streams (the gate's daily
// tally resets each date, so splitting by date first is safe -- no leakage).
function gateStream(tradesRaw) {
  const merged = Object.values(tradesRaw).flat();
  const gated = applyCurrencyLossGate(merged, { maxDailyLossPct: MAX_DAILY_LOSS_PCT });
  const byPair = {};
  for (const t of gated.kept) (byPair[t.pair] ??= []).push(t);
  return byPair;
}
const isTrades = gateStream(isTradesRaw);
const oosTrades = gateStream(oosTradesRaw);

function combine(tradesBySym, symSet) {
  const subset = Object.fromEntries([...symSet].filter(s => tradesBySym[s]).map(s => [s, tradesBySym[s]]));
  const weights = Object.fromEntries(Object.keys(subset).map(s => [s, 1]));
  const combined = buildPortfolioDailySeries(subset, { weights });
  return portfolioStats(combined.dailyReturns, { mc: false });
}

// Greedy elimination on IS ONLY (gated).
let current = new Set(allSyms);
const removedInOrder = [];
while (current.size > STOP_AT_N) {
  const stats = combine(isTrades, current);
  let worst = null, worstImprovement = -Infinity;
  for (const sym of current) {
    const without = new Set([...current].filter(s => s !== sym));
    const s = combine(isTrades, without);
    const improvement = s.maxDD - stats.maxDD;
    if (improvement > worstImprovement) { worstImprovement = improvement; worst = sym; }
  }
  current.delete(worst);
  removedInOrder.push(worst);
}
console.log(`NEW (gate-aware) IS-chosen exclusion set (${removedInOrder.length} pairs): ${removedInOrder.join(', ')}\n`);

const OLD_EXCLUDE = new Set(['GBPAUD', 'GBPCHF', 'USDCAD', 'AUDCAD', 'NZDJPY', 'EURGBP', 'GBPJPY', 'NZDUSD', 'EURJPY', 'EURCAD']);
const oldKept = new Set([...allSyms].filter(s => !OLD_EXCLUDE.has(s)));
console.log(`OLD (stale, pre-gate) exclusion set (${OLD_EXCLUDE.size} pairs): ${[...OLD_EXCLUDE].join(', ')}\n`);

const isFull = combine(isTrades, allSyms);
const isNew = combine(isTrades, current);
const isOld = combine(isTrades, oldKept);
console.log('IS (chosen on):');
console.log(`  all 27 pairs:        Sharpe ${isFull.sharpe}  maxDD ${isFull.maxDD}%`);
console.log(`  OLD exclusion (17):  Sharpe ${isOld.sharpe}  maxDD ${isOld.maxDD}%`);
console.log(`  NEW exclusion (17):  Sharpe ${isNew.sharpe}  maxDD ${isNew.maxDD}%`);

const oosFull = combine(oosTrades, allSyms);
const oosNew = combine(oosTrades, current);
const oosOld = combine(oosTrades, oldKept);
console.log('\nOOS (unseen, gate frozen from IS logic but re-applied fresh on the OOS stream):');
console.log(`  all 27 pairs:        Sharpe ${oosFull.sharpe}  maxDD ${oosFull.maxDD}%`);
console.log(`  OLD exclusion (17):  Sharpe ${oosOld.sharpe}  maxDD ${oosOld.maxDD}%`);
console.log(`  NEW exclusion (17):  Sharpe ${oosNew.sharpe}  maxDD ${oosNew.maxDD}%`);

console.log('\nOOS deltas vs the OLD (currently shipped) exclusion set:');
console.log(`  Sharpe ${(oosNew.sharpe - oosOld.sharpe >= 0 ? '+' : '')}${(oosNew.sharpe - oosOld.sharpe).toFixed(2)}   maxDD ${(oosNew.maxDD - oosOld.maxDD).toFixed(2)}pp`);
