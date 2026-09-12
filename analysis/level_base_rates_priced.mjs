// Level Base Rates, Priced — 2026-09-11
//
// Converts the raw p50/p75 base-rate finding (level_base_rates_honest.mjs)
// into the SAME units Thread 1's vote is measured in -- real cost-inclusive
// %-return per trade, t-stat via summarizeTrades -- so the two are actually
// comparable, not a z-stat on a bare win/loss split next to a t-stat on
// priced PnL.
//
// The rule is deliberately the SIMPLEST possible expression of the base
// rate found: p50 touch -> bet continuation (follow), p75 touch -> bet fade,
// p90 -> skip (same structural exclusion every other engine here uses, no
// outer rung to price a follow against). No vote, no margin, no context
// dimensions -- exactly pass 1, priced.
//
// Reuses priceBarrierTrade (js/levelAtlasVoteReview.js) directly -- the
// SAME production pricing function Thread 1's trades go through, so a real
// £ number here means the same thing it means there.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { splitAt } from '../js/levelAtlasReport.js';
import { priceBarrierTrade, applyConcurrencyCap } from '../js/levelAtlasVoteReview.js';
import { summarizeTrades } from '../js/metricsCore.js';
import { costForPair } from '../js/perLineStrategy.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { boundPacked, LOOKBACK_DAYS } from '../js/levelAtlasRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');
const REARM = 0.3;

const ALL_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const PAIRS = process.env.LA_PAIRS ? process.env.LA_PAIRS.split(',') : ALL_PAIRS;

const RULE = { p50: 'follow', p75: 'fade' }; // p90 absent -> skipped

const perPairTrades = {};
let totalOosTouches = 0;

for (const pair of PAIRS) {
  console.log(`${pair.toUpperCase()}: loading M1...`);
  const packed0 = await loadM1ForPair(pair);
  const packed = boundPacked(packed0, LOOKBACK_DAYS);
  const assetClass = assetClassFor(pair);
  const cost = costForPair(pair, assetClass);
  const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [REARM], pendingRearmFrac: REARM });
  const atRearm = touches.filter(t => t.rearmFrac === REARM);
  const { split } = splitAt(atRearm);
  const oosBlock = atRearm.filter(t => t.date >= split);
  totalOosTouches += oosBlock.length;

  const trades = [];
  for (const t of oosBlock) {
    const decision = RULE[t.rung];
    if (!decision) continue; // p90, skipped -- same as everywhere else
    const priced = priceBarrierTrade(t, decision, cost);
    if (!priced) continue;
    trades.push({ instrument: pair.toUpperCase(), pair: pair.toUpperCase(), date: t.date, time: t.time,
      resolveTime: t.resolveTime ?? t.sessionCloseTime, side: t.side, rung: t.rung, decision,
      pnlPct: priced.pnlPct, win: priced.win, timedOut: !!priced.timedOut });
  }
  const capped = applyConcurrencyCap(trades, { maxConcurrent: 1 }).kept ?? trades;
  perPairTrades[pair.toUpperCase()] = capped;
  console.log(`  ${oosBlock.length} OOS touches -> ${trades.length} priced (p50/p75 only) -> ${capped.length} after concurrency cap`);
}

const allTrades = Object.values(perPairTrades).flat();
console.log(`\nTotal OOS touches: ${totalOosTouches}, priced+capped trades: ${allTrades.length}`);

function row(label, trades) {
  if (trades.length < 30) return `${label.padEnd(28)}${String(trades.length).padStart(7)}   [thin]`;
  const s = summarizeTrades(trades.map(t => t.pnlPct), trades.map(t => t.date));
  const n = trades.length;
  const m = trades.reduce((a, t) => a + t.pnlPct, 0) / n;
  const sd = Math.sqrt(trades.reduce((a, t) => a + (t.pnlPct - m) ** 2, 0) / (n - 1));
  const t = sd > 0 ? m / (sd / Math.sqrt(n)) : 0;
  return label.padEnd(28) + String(n).padStart(7) + (s.winRate ?? 0).toFixed(1).padStart(8) +
    ((m >= 0 ? '+' : '') + m.toFixed(4)).padStart(10) + (s.profitFactor ?? 0).toFixed(2).padStart(7) +
    (s.sharpe ?? 0).toFixed(2).padStart(8) + ('t' + t.toFixed(2)).padStart(8);
}

console.log('\n' + '='.repeat(90));
console.log('LEVEL BASE RATE RULE, PRICED — p50=follow, p75=fade, no vote, no context, real cost');
console.log('='.repeat(90));
console.log('policy'.padEnd(28), 'n'.padStart(7), 'win%'.padStart(8), 'meanPct'.padStart(10), 'PF'.padStart(7), 'sharpe'.padStart(8), 't-stat'.padStart(8));
console.log(row('ALL (p50+p75 combined)', allTrades));
console.log(row('p50 only (continuation)', allTrades.filter(t => t.rung === 'p50')));
console.log(row('p75 only (fade)', allTrades.filter(t => t.rung === 'p75')));
console.log(row('up side only', allTrades.filter(t => t.side === 'up')));
console.log(row('down side only', allTrades.filter(t => t.side === 'down')));

// Per-pair consistency, same discipline as everything else today
console.log('\n--- per pair ---');
for (const [pair, trades] of Object.entries(perPairTrades)) {
  console.log(row(pair, trades));
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'level_base_rates_priced.json'), JSON.stringify({
  totalOosTouches, totalTrades: allTrades.length,
  overall: allTrades.length >= 30 ? summarizeTrades(allTrades.map(t => t.pnlPct), allTrades.map(t => t.date)) : null,
}, null, 1));
console.log(`\nWrote ${OUT_DIR}/level_base_rates_priced.json`);
