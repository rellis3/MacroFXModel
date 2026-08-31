// What if unresolved ('neither') touches were marked-to-market at their
// window-end close instead of dropped? (2026-08-31) -- direct owner
// question after learning ~3.5-4% of touches never resolve within their
// window (same-day for Asia, ~8 days for Monday) and are currently
// EXCLUDED entirely (buildBarrierTrades filters `outcome !== 'neither'`
// before a trade row is ever built -- js/asiaFibAtlasVoteReview.js:139).
// The owner's hypothesis: including them, priced at wherever the market
// actually was when the window ran out, would blow out drawdown.
//
// This builds a SECOND trade list containing ONLY the currently-dropped
// touches, priced by the ACTUAL price move from entry to the window-end
// close (not target/stop -- there was no target/stop hit, so mark-to-
// close is the honest "what would closing this position actually have
// looked like" number), using the exact same decision/margin/pip/cost
// conventions as priceBarrierTrade, then runs BOTH the baseline (shipped,
// drops neither) and baseline+neither-marked through the identical
// downstream pipeline (cost filter, hedge-only concurrency, stop-tighten,
// risk-adjust, portfolio combine) at today's shipped Asia settings, on
// both statistical bases (day-pooled and per-trade) since this session
// found they can disagree.
//
//   node analysis/fib_atlas_neither_markclose_test.mjs
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { asiaFibAtlasWalk } from '../js/asiaFibAtlasEngine.js';
import { buildAsiaFibAtlasBook } from '../js/asiaFibAtlasReport.js';
import { voteDecision, priceBarrierTrade, buildBarrierTrades } from '../js/asiaFibAtlasVoteReview.js';
import { buildAsiaSessions } from '../js/sessionRanges.js';
import { extractBars } from '../js/barUtils.js';
import { costForPair } from '../js/perLineStrategy.js';
import {
  applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries,
  applyFadeStopFraction, applyCostEfficiencyFilter,
} from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { sharpeStdError, summarizeTrades } from '../js/metricsCore.js';
import { withNonCompoundedDD } from '../js/fibAtlasVotePortfolio.js';

const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf', 'gold'];
const DEFAULT_REARM = 0.3, MIN_MARGIN = 2, ASIA_HRS = 6;
const COST_RATIO = 3, STOP_FRAC = 0.9, RISK_PCT = 0.5;
const MODE = { maxConcurrent: 1, perDirection: true };

// Same bracket-distance derivation priceBarrierTrade uses -- there WAS a
// real target/stop distance defined at touch time even though neither
// was hit, so stopPips is still meaningful (needed for riskAdjustTrades'
// R-multiple sizing).
function bracketDistances(touch, decision) {
  const targetPips = decision === 'fade' ? touch.innerDistPips : touch.outerDistPips;
  const stopPips = decision === 'fade' ? touch.outerDistPips : touch.innerDistPips;
  return { targetPips, stopPips };
}

// Mark-to-close price for a 'neither' touch: the actual close of the LAST
// bar in that touch's own walk window (midnight local for Asia). Built
// once per calendar date (the window is the same for every touch that
// date), cached.
function windowEndByDate(bars) {
  const asiaSessions = buildAsiaSessions(bars, 'london', ASIA_HRS, 5);
  const cache = new Map();
  for (const s of asiaSessions) {
    const winStart = s.epoch + ASIA_HRS * 3600, winEnd = s.epoch + 24 * 3600;
    const win = extractBars(bars, winStart, winEnd);
    if (win.length) cache.set(s.date, { close: win[win.length - 1].close, time: winEnd });
  }
  return cache;
}

function priceMarkToClose(touch, decision, markClose, cost) {
  const denom = touch.price > 0 ? touch.price : null;
  const { targetPips, stopPips } = bracketDistances(touch, decision);
  if (denom == null || targetPips == null || stopPips == null || markClose == null) return null;
  const isAbove = touch.side === 'above';
  const moveUp = markClose - touch.price; // + if price rose from entry to window-end
  // 'above' side: follow profits from price RISING further; fade profits from FALLING back.
  // 'below' side: mirrored.
  const favorableMove = isAbove ? (decision === 'follow' ? moveUp : -moveUp) : (decision === 'follow' ? -moveUp : moveUp);
  const pnlPips = favorableMove / touch.pip;
  const pnlPct = +((pnlPips * touch.pip / denom * 100) - cost).toFixed(4);
  return { win: pnlPct > 0, pnlPips: +pnlPips.toFixed(1), pnlPct, targetPips, stopPips };
}

function pipelineTrades(trades, cost) {
  const filtered = applyCostEfficiencyFilter(trades, cost, COST_RATIO);
  const capped = applyConcurrencyCap(filtered, MODE);
  if (!capped?.kept?.length) return [];
  const tightened = applyFadeStopFraction(capped.kept, STOP_FRAC, 0, { preserveSizing: true });
  return riskAdjustTrades(tightened, RISK_PCT).map(t => ({ ...t }));
}

function statsFromFinal(final) {
  const weights = Object.fromEntries(Object.keys(final).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(final, { weights });
  const dailyReturns = combined?.dailyReturns ?? [];
  const ps = withNonCompoundedDD(portfolioStats(dailyReturns, { mc: false }), dailyReturns);
  const se = ps.days > 1 ? sharpeStdError(ps.sharpe, ps.days, 252) : Infinity;
  const sharpeCI95 = isFinite(se) ? [+(ps.sharpe - 1.96 * se).toFixed(2), +(ps.sharpe + 1.96 * se).toFixed(2)] : null;
  const all = Object.values(final).flat();
  return { trades: all.length, sharpe: ps.sharpe, sharpeCI95, maxDD: ps.maxDDNonCompounded, cagr: ps.cagrNonCompounded, profitFactor: ps.profitFactor };
}
function perTradeStatsFor(final) {
  const all = Object.values(final).flat();
  if (!all.length) return null;
  const sorted = all.slice().sort((a, b) => a.resolveTime - b.resolveTime);
  const base = summarizeTrades(sorted.map(t => t.pnlPct), sorted.map(t => t.date));
  const rawTradeSharpe = base.tradesPerYr > 0 ? base.sharpe / Math.sqrt(base.tradesPerYr) : base.sharpe;
  return { trades: all.length, winRate: base.winRate, profitFactor: base.profitFactor, rawTradeSharpe: +rawTradeSharpe.toFixed(3) };
}

function ciStr(s) { return s.sharpeCI95 ? `[${s.sharpeCI95[0]}, ${s.sharpeCI95[1]}]` : '—'; }
function printRow(label, s) {
  console.log([label.padEnd(28), String(s.trades).padStart(7), String(s.sharpe).padStart(7), ciStr(s).padStart(14),
    (s.maxDD + '%').padStart(8), (s.cagr + '%').padStart(9), String(s.profitFactor).padStart(7)].join('  '));
}
function header() {
  console.log(['config'.padEnd(28), 'trades'.padStart(7), 'sharpe'.padStart(7), 'sharpeCI95'.padStart(14),
    'maxDD(add.)'.padStart(8), 'CAGR(add.)'.padStart(9), 'PF'.padStart(7)].join('  '));
}
function printPerTradeRow(label, s) {
  if (!s) { console.log(`${label.padEnd(28)}  no trades`); return; }
  console.log([label.padEnd(28), String(s.trades).padStart(7), (s.winRate + '%').padStart(8), String(s.profitFactor).padStart(7), String(s.rawTradeSharpe).padStart(10)].join('  '));
}
function perTradeHeader() {
  console.log(['config'.padEnd(28), 'trades'.padStart(7), 'winRate'.padStart(8), 'PF'.padStart(7), 'rawSharpe'.padStart(10)].join('  '));
}

async function main() {
  const baselineFinal = {}, includingNeitherFinal = {};
  let totalNeitherDropped = 0, totalNeitherMarked = 0, neitherWins = 0;

  for (const pair of PAIRS) {
    console.log(`... ${pair}`);
    const bars = await loadM1ForPair(pair);
    const { touches } = asiaFibAtlasWalk(bars, { instrument: pair });
    const book = buildAsiaFibAtlasBook(touches, { rearmFrac: DEFAULT_REARM });
    const cost = costForPair(pair, pair === 'gold' ? 'metal' : 'fx');
    const sym = pair.toUpperCase();

    // Baseline -- EXACT shipped function, drops 'neither' internally.
    const baseTrades = buildBarrierTrades(touches, book, { rearmFrac: DEFAULT_REARM, cost, minMargin: MIN_MARGIN });
    if (baseTrades?.length) baselineFinal[sym] = pipelineTrades(baseTrades, cost);

    // The dropped touches, priced by mark-to-window-end-close instead.
    const oos = touches.filter(t => t.rearmFrac === DEFAULT_REARM && t.date >= book.splitDate && t.outcome === 'neither');
    const windowEnd = windowEndByDate(bars);
    const neitherTrades = [];
    for (const t of oos) {
      const vd = voteDecision(book, t);
      if (!vd || vd.margin < MIN_MARGIN) continue;
      const we = windowEnd.get(t.date);
      const priced = we ? priceMarkToClose(t, vd.decision, we.close, cost) : null;
      if (!priced) continue;
      neitherTrades.push({
        instrument: t.instrument, date: t.date, time: t.time, resolveTime: we.time,
        side: t.side, rung: t.level, entry: t.price, pip: t.pip, decision: vd.decision, margin: vd.margin,
        targetPips: priced.targetPips, stopPips: priced.stopPips,
        win: priced.win, pnlPct: priced.pnlPct, asiaConfPips: t.asiaConfPips ?? null,
      });
    }
    totalNeitherDropped += oos.length;
    totalNeitherMarked += neitherTrades.length;
    neitherWins += neitherTrades.filter(t => t.win).length;

    const combinedTrades = [...(baseTrades ?? []), ...neitherTrades].sort((a, b) => a.time - b.time);
    if (combinedTrades.length) includingNeitherFinal[sym] = pipelineTrades(combinedTrades, cost);
  }

  console.log(`\n${totalNeitherDropped} 'neither' touches would clear the margin gate; ${totalNeitherMarked} priced (some lost vote/margin along the way); ${neitherWins} of those mark-to-close as wins (${(neitherWins / totalNeitherMarked * 100).toFixed(1)}%)\n`);

  header();
  printRow('BASELINE (shipped, drops neither)', statsFromFinal(baselineFinal));
  printRow('+ neither marked-to-close', statsFromFinal(includingNeitherFinal));

  console.log();
  perTradeHeader();
  printPerTradeRow('BASELINE (shipped, drops neither)', perTradeStatsFor(baselineFinal));
  printPerTradeRow('+ neither marked-to-close', perTradeStatsFor(includingNeitherFinal));
}

main();
