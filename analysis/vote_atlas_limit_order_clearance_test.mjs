// Owner ask (2026-09-15): would switching Vote Atlas's live entry from a
// reactive market order to a RESTING LIMIT ORDER (at the plan's modeled rung
// price) help or hurt? Level Atlas counterpart of
// analysis/fib_atlas_limit_order_clearance_test.mjs -- same method, ported
// to this engine's own touch/book/trade shape (side 'up'/'down' not
// 'above'/'below', rung not level, no ladder split).
//
// Key realization (same as the Fib Atlas version): `priceBarrierTrade`
// already prices every trade as a guaranteed fill the instant a bar's
// high/low reaches the rung -- an implicit PERFECT limit order (rest at the
// level, fill whenever touched, zero slippage), not a market-order model.
// So this isn't a new scenario to build -- it's asking how much of the
// CURRENT backtest's edge rides on touches so marginal a real resting order
// might plausibly never have filled (thin liquidity at that exact instant,
// a broker's own spread/feed never quite reaching the level even though
// this M1 source's bar high/low did).
//
// Method: for every touch in the standard validated pipeline (17-pair,
// honest OOS book, margin>=3, maxConcurrent=3, riskPct=0.5%), compute
// CLEARANCE -- how many pips beyond the rung the touching bar's own
// high/low actually reached (re-derived from the raw M1 bar, since the
// touch record only carries the rung price). Recompute the portfolio at
// rising minimum-clearance thresholds and compare against the unfiltered
// baseline -- the sensitivity curve answers "does the edge survive
// discarding wick-only touches."
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook, splitAt } from '../js/levelAtlasReport.js';
import { voteDecision, priceBarrierTrade, applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { costForPair } from '../js/perLineStrategy.js';
import { boundPacked, LOOKBACK_DAYS, DEFAULT_REARM } from '../js/levelAtlasRoutes.js';

const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const MIN_MARGIN = 3, MAX_CONCURRENT = 3, RISK_PCT = 0.5;
const CLEARANCE_THRESHOLDS = [0, 0.2, 0.5, 1, 2, 3];   // pips

function barAt(times, t) {
  let lo = 0, hi = times.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (times[mid] <= t) lo = mid; else hi = mid - 1; }
  return times[lo] === t ? lo : -1;
}

async function buildPairTrades(pair) {
  const packed0 = await loadM1ForPair(pair);
  if (!packed0?.n) return [];
  const packed = boundPacked(packed0, LOOKBACK_DAYS);
  const assetClass = assetClassFor(pair);
  const cost = costForPair(pair, assetClass);
  const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [DEFAULT_REARM], pendingRearmFrac: DEFAULT_REARM });
  const atRearm = touches.filter(t => t.rearmFrac === DEFAULT_REARM);
  const { split: realSplit } = splitAt(atRearm);
  const isOnly = atRearm.filter(t => t.date < realSplit);
  const honestBook = buildAtlasBook(isOnly, { rearmFrac: DEFAULT_REARM });
  if (!honestBook) return [];

  const times = packed.times;
  const oos = atRearm.filter(t => t.date >= realSplit && t.rung !== 'p90');
  const trades = [];
  for (const t of oos) {
    const vd = voteDecision(honestBook, t);
    if (!vd || vd.margin < MIN_MARGIN) continue;
    const priced = priceBarrierTrade(t, vd.decision, cost);
    if (!priced) continue;
    const idx = barAt(times, t.time);
    let clearancePips = null;
    if (idx >= 0) {
      const isUp = t.side === 'up';
      const barExtreme = isUp ? packed.highs[idx] : packed.lows[idx];
      clearancePips = isUp ? (barExtreme - t.level) / t.pip : (t.level - barExtreme) / t.pip;
    }
    trades.push({
      instrument: t.instrument, date: t.date, time: t.time,
      resolveTime: t.resolveTime ?? t.sessionCloseTime,
      side: t.side, rung: t.rung, entry: t.level, pip: t.pip,
      decision: vd.decision, margin: vd.margin,
      targetPips: priced.targetPips, stopPips: priced.stopPips,
      win: priced.win, pnlPct: priced.pnlPct, timedOut: !!priced.timedOut,
      clearancePips,
    });
  }
  return applyConcurrencyCap(trades, { maxConcurrent: MAX_CONCURRENT }).kept ?? [];
}

function summarize(trades) {
  const wins = trades.filter(t => t.win).length;
  return { n: trades.length, winRate: trades.length ? +(100 * wins / trades.length).toFixed(1) : null };
}

async function main() {
  console.log('Building full per-pair trade lists with clearance data (17 pairs)...\n');
  const perPairAll = {};
  for (const pair of PAIRS) {
    try {
      const trades = await buildPairTrades(pair);
      perPairAll[pair.toUpperCase()] = trades;
      console.log(`${pair.toUpperCase()}: ${trades.length} trades built`);
    } catch (e) { console.log(`${pair.toUpperCase()}: FAILED (${e.message})`); perPairAll[pair.toUpperCase()] = []; }
  }

  const allTrades = Object.values(perPairAll).flat();
  const clearanceKnown = allTrades.filter(t => t.clearancePips != null);
  console.log(`\nTotal trades: ${allTrades.length} (${clearanceKnown.length} with resolvable clearance, ${allTrades.length - clearanceKnown.length} bar-index lookup misses)`);

  const sorted = [...clearanceKnown].sort((a, b) => a.clearancePips - b.clearancePips);
  console.log('\nClearance distribution (pips beyond the rung):');
  for (const p of [0.01, 0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.99]) {
    const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
    console.log(`  p${(p * 100).toFixed(0)}: ${sorted[idx].clearancePips.toFixed(2)}p`);
  }

  console.log('\nthreshold(p)\tn\tdropped\twinRate%\tSharpe\tPF\tCAGR%\tmaxDD%');
  for (const thresh of CLEARANCE_THRESHOLDS) {
    const filteredByPair = {};
    let totalKept = 0, totalDropped = 0;
    for (const [pair, trades] of Object.entries(perPairAll)) {
      const kept = trades.filter(t => t.clearancePips == null || t.clearancePips >= thresh);
      filteredByPair[pair] = riskAdjustTrades(kept, RISK_PCT).map(t => ({ ...t, pair }));
      totalKept += kept.length; totalDropped += trades.length - kept.length;
    }
    const weights = Object.fromEntries(Object.keys(filteredByPair).map(p => [p, 1]));
    const combined = buildPortfolioDailySeries(filteredByPair, { weights });
    const stats = portfolioStats(combined.dailyReturns, { mc: false });
    const s = summarize(Object.values(filteredByPair).flat());
    console.log(`${thresh}p\t${totalKept}\t${totalDropped}\t${s.winRate}\t${stats.sharpe}\t${stats.profitFactor}\t${stats.cagr}\t${stats.maxDD}`);
  }
}

main();
