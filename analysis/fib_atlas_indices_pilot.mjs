// Exploratory pilot (2026-09-17, direct owner ask): does the Fib Atlas
// engine show ANY signal on index instruments (NQ/SPX/DE30/UK100/US2000/
// DOW)? Fib Atlas has only ever run FX+gold -- a deliberate scope choice
// (the founding Pine indicator's own scope), not a technical limitation.
// This is a first-pass feasibility check, NOT a validated config: reuses
// the FX/gold-tuned production filter thresholds (margin>=2, cost-
// efficiency>=3x, gap<=30min, chandelier, stop-tighten 0.9) as-is, since
// nothing index-specific has ever been swept. A real signal here would
// justify a proper per-index sweep later; a null/negative result here
// means this isn't worth pursuing further without one.
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { asiaFibAtlasWalk } from '../js/asiaFibAtlasEngine.js';
import { mondayFibAtlasWalk } from '../js/mondayFibAtlasEngine.js';
import { buildAsiaFibAtlasBook } from '../js/asiaFibAtlasReport.js';
import { voteDecision, priceBarrierTrade } from '../js/asiaFibAtlasVoteReview.js';
import { applyConcurrencyCap, applyCostEfficiencyFilter, applyGapFilter, applyFadeStopFraction } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { costForPair } from '../js/perLineStrategy.js';

const INDICES = ['nq', 'spx', 'de30', 'uk100', 'us2000', 'dow'];
const LADDERS = ['asia', 'monday'];
const REARM = 0.3;
const CONFIG = { minMargin: 2, minCostRatio: 3, maxGapMin: 30, stopTightenFrac: 0.9 };

function runPipeline(trades, cost) {
  const marginFiltered = trades.filter(t => t.margin >= CONFIG.minMargin);
  const costFiltered = applyCostEfficiencyFilter(marginFiltered, cost, CONFIG.minCostRatio);
  const gapFiltered = applyGapFilter(costFiltered, CONFIG.maxGapMin);
  const capped = applyConcurrencyCap(gapFiltered, { maxConcurrent: 1, perDirection: true });
  return applyFadeStopFraction(capped?.kept ?? [], CONFIG.stopTightenFrac, 0, { preserveSizing: true });
}

async function buildIndexTrades(pair, ladder) {
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) return { trades: [], reason: 'no local M1' };
  let assetClass;
  try { assetClass = assetClassFor(pair); } catch (e) { return { trades: [], reason: `assetClassFor failed: ${e.message}` }; }
  let cost;
  try { cost = costForPair(pair, assetClass); } catch (e) { return { trades: [], reason: `costForPair failed: ${e.message}` }; }
  const walkFn = ladder === 'asia' ? asiaFibAtlasWalk : mondayFibAtlasWalk;
  let touches;
  try {
    const w = walkFn(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [REARM] });
    touches = w.touches;
  } catch (e) { return { trades: [], reason: `walk failed: ${e.message}` }; }
  const pool = touches.filter(t => t.rearmFrac === REARM);
  const book = buildAsiaFibAtlasBook(pool, { rearmFrac: REARM });
  if (!book) return { trades: [], reason: 'book build failed (too few touches?)' };
  const realOOS = pool.filter(t => t.date >= book.splitDate && t.outcome !== 'neither');
  const trades = [];
  for (const t of realOOS) {
    const vd = voteDecision(book, t);
    if (!vd) continue;
    const priced = priceBarrierTrade(t, vd.decision, cost);
    if (!priced) continue;
    trades.push({
      instrument: t.instrument, date: t.date, time: t.time,
      resolveTime: t.concurrencyResolveTime ?? t.resolveTime ?? t.sessionCloseTime,
      side: t.side, rung: t.level, entry: t.price, pip: t.pip,
      decision: vd.decision, margin: vd.margin,
      targetPips: priced.targetPips, stopPips: priced.stopPips,
      win: priced.win, pnlPct: priced.pnlPct, gapMin: t.gapMin ?? null,
    });
  }
  return { trades: runPipeline(trades, cost), rawTouchCount: pool.length, splitDate: book.splitDate, cost };
}

async function main() {
  console.log('pair\tladder\trawTouches\tsplitDate\tcost%\tfinalTrades\twinRate%\tSharpe\tPF\tCAGR%\tmaxDD%');
  for (const pair of INDICES) {
    for (const ladder of LADDERS) {
      try {
        const { trades, rawTouchCount, splitDate, cost, reason } = await buildIndexTrades(pair, ladder);
        if (!trades.length) { console.log(`${pair.toUpperCase()}\t${ladder}\t-\t-\t-\t0\t-\t-\t-\t-\t- (${reason || 'no trades survived filters'})`); continue; }
        const wins = trades.filter(t => t.win).length;
        const winRate = +(100 * wins / trades.length).toFixed(1);
        const byDay = new Map();
        for (const t of trades) byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.pnlPct);
        const dailyReturns = [...byDay.values()];
        const stats = portfolioStats(dailyReturns, { mc: false });
        console.log(`${pair.toUpperCase()}\t${ladder}\t${rawTouchCount}\t${splitDate}\t${cost}\t${trades.length}\t${winRate}\t${stats.sharpe}\t${stats.profitFactor}\t${stats.cagr}\t${stats.maxDD}`);
      } catch (e) {
        console.log(`${pair.toUpperCase()}\t${ladder}\tFAILED: ${e.message}`);
      }
    }
  }
}

main();
