#!/usr/bin/env node
/**
 * Asia Fib Atlas vote-margin backtest — the honest answer to "if the atlas
 * made the trade call per touch, using only what a live reader would have
 * had, would it have been profitable?" Real fixed target/stop (the touch's
 * own rung distances), real spread cost, true walk-forward IS/OOS split
 * (`book.splitDate`), the SAME barrier-pricing discipline as Level Atlas's
 * own vote-backtest (js/levelAtlasVoteReview.js) — see js/asiaFibAtlasVoteReview.js
 * for exactly what's reused vs adapted.
 *
 *   node scripts/run_asia_fib_atlas_vote_backtest.mjs [pairs...]
 *     (default: eurusd gbpusd usdjpy gold)
 *   node scripts/run_asia_fib_atlas_vote_backtest.mjs --headline [pairs...]
 *     (default: all 26 locally-cached pairs)
 */
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { asiaFibAtlasWalk } from '../js/asiaFibAtlasEngine.js';
import { buildAsiaFibAtlasBook } from '../js/asiaFibAtlasReport.js';
import { runBarrierWalkForward } from '../js/asiaFibAtlasVoteReview.js';
import { applyConcurrencyCap } from '../js/levelAtlasVoteReview.js';
import { cvolSeries, CVOL_PRODUCTS } from '../js/cvolLoader.js';
import { majorEventEpochs } from '../js/calendarLoader.js';
import { costForPair } from '../js/perLineStrategy.js';

const ALL_26_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurjpy', 'eurgbp', 'euraud', 'eurcad', 'eurchf', 'eurnzd', 'gbpjpy', 'gbpaud', 'gbpcad',
  'gbpchf', 'gbpnzd', 'audjpy', 'audnzd', 'audcad', 'audchf', 'cadjpy', 'chfjpy', 'nzdjpy', 'gold'];

const args = process.argv.slice(2);
const headline = args.includes('--headline');
const pairs = args.filter(a => !a.startsWith('-'));
const list = pairs.length ? pairs : (headline ? ALL_26_PAIRS : ['eurusd', 'gbpusd', 'usdjpy', 'gold']);

const CVOL_PRODUCT = { gold: 'XAUUSD' };
const macroEvents = majorEventEpochs();

// The grid worth checking: margin can only be 1 or 2 here (see
// asiaFibAtlasVoteReview.js's header — only 2 voting dimensions), crossed
// with the owner's own "grab the line with confluence" ask.
const GRID = [
  { minMargin: 1, confluenceOnly: false, label: 'margin>=1, any' },
  { minMargin: 2, confluenceOnly: false, label: 'margin=2 (both agree), any' },
  { minMargin: 1, confluenceOnly: true, label: 'margin>=1, confluence<=2p' },
  { minMargin: 2, confluenceOnly: true, label: 'margin=2, confluence<=2p' },
];

const allTradesByGrid = GRID.map(() => ({}));   // [gridIdx] -> { pair: trades[] }

for (const pair of list) {
  const t0 = Date.now();
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { console.log(`\n=== ${pair}: no M1 ===`); continue; }
  const assetClass = pair === 'gold' ? 'commodity' : 'fx';

  const cvolProduct = CVOL_PRODUCT[pair] ?? pair.toUpperCase();
  const ivByDate = CVOL_PRODUCTS.includes(cvolProduct) ? await cvolSeries(cvolProduct) : null;

  const { touches } = asiaFibAtlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [0.3], ivByDate, macroEvents });
  const book = buildAsiaFibAtlasBook(touches, { rearmFrac: 0.3 });
  const walkMs = Date.now() - t0;
  if (!book) { console.log(`\n=== ${pair}: no book (too few touches) ===`); continue; }

  const cost = costForPair(pair, assetClass);
  console.log(`\n=== ${pair.toUpperCase()} — ${touches.length} touches, cost=${cost}%, walk ${walkMs}ms, split ${book.splitDate} ===`);
  const voteCache = new Map();   // shared across the grid — each touch's vote only derived once, not once per grid cell
  GRID.forEach((g, i) => {
    const wf = runBarrierWalkForward(touches, book, { rearmFrac: 0.3, cost, minMargin: g.minMargin, confluenceOnly: g.confluenceOnly, voteCache });
    if (!wf || !wf.tradesUsed) { console.log(`  ${g.label.padEnd(28)} 0 trades`); return; }
    const o = wf.overall;
    console.log(`  ${g.label.padEnd(28)} RAW    n=${String(wf.tradesUsed).padStart(5)}  winRate=${String(o.winRate).padStart(5)}%  Sharpe=${String(o.sharpe).padStart(7)}±${o.sharpeSE}  totalPnl=${String(o.totalPnl).padStart(8)}%  maxDD=${String(o.maxDD).padStart(7)}%  PF=${o.profitFactor}`);

    // Same-day clustering check + a real concurrency cap (max 1 open position
    // at a time) — the exact diagnostic Level Atlas's own vote-backtest history
    // needed (LEGO_MODULES.md: 346/622 EURUSD days had 2+ overlapping trades,
    // which roughly HALVED its reported Sharpe once capped). `prevOutcomeSameDay`
    // is defined by "another touch already happened today", so trades using it
    // are especially likely to cluster on the SAME trending day — a raw Sharpe
    // that treats those as independent observations is not to be trusted
    // without checking this first.
    const trades = wf.trades ?? [];
    const byDate = new Map();
    for (const t of trades) byDate.set(t.date, (byDate.get(t.date) ?? 0) + 1);
    const daysWithMulti = [...byDate.values()].filter(n => n >= 2).length;
    const capped = applyConcurrencyCap(trades, { maxConcurrent: 1 });
    if (capped) {
      const c = capped.keptSummary;
      console.log(`  ${''.padEnd(28)} CAPPED n=${String(c.trades).padStart(5)}  winRate=${String(c.winRate).padStart(5)}%  Sharpe=${String(c.sharpe).padStart(7)}±${c.sharpeSE}  totalPnl=${String(c.totalPnl).padStart(8)}%  maxDD=${String(c.maxDD).padStart(7)}%  PF=${c.profitFactor}  (skipped ${capped.skippedCount}/${capped.totalCount}, ${daysWithMulti}/${byDate.size} days had 2+ trades)`);
    }
    allTradesByGrid[i][pair] = trades;
  });
}

if (headline || list.length > 4) {
  console.log('\n\n================ PER-GRID CROSS-PAIR SUMMARY ================');
  GRID.forEach((g, i) => {
    const perPair = allTradesByGrid[i];
    const pairsWithTrades = Object.entries(perPair).filter(([, ts]) => ts.length >= 30);
    console.log(`\n--- ${g.label} ---`);
    console.log(`  pairs with >=30 OOS trades: ${pairsWithTrades.length}/${list.length}`);
    for (const [pair, trades] of pairsWithTrades) {
      const wins = trades.filter(t => t.win).length;
      const avgPnl = trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length;
      console.log(`    ${pair.toUpperCase().padEnd(8)} n=${String(trades.length).padStart(5)}  winRate=${(wins / trades.length * 100).toFixed(1)}%  avgPnl/trade=${avgPnl.toFixed(4)}%`);
    }
  });
}
