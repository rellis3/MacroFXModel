// What if 'neither' touches kept walking forward past midnight instead of
// being dropped -- but WITHOUT letting the leftover position block a new
// trade opening the following day (the owner's own point: Asia's new
// range isn't built until 6am anyway, so a stale prior-day rung sitting
// unresolved shouldn't crowd out a fresh signal)? (2026-08-31)
//
// Two things are deliberately DECOUPLED here, matching the owner's ask:
//   1. PRICING window -- how long we keep searching for a real inner/outer
//      touch (extended forward through subsequent days' bars, using the
//      SAME race-to-resolution logic the core engine uses, reconstructed
//      from the touch's own stored price/pip/innerDistPips/outerDistPips
//      -- no re-walk of the full feature engine needed).
//   2. CONCURRENCY occupancy window -- how long the trade counts as "open"
//      for applyConcurrencyCap's per-pair/per-direction budget. Capped at
//      the NEXT session's build time (asia.epoch + 30h = 6am the following
//      day) regardless of how long the real resolution search took, so an
//      extended-but-still-open trade never blocks a touch on the following
//      day's freshly-built Asia range.
//
// Trades that resolve are priced NORMALLY (real target/stop pips hit, same
// as priceBarrierTrade) -- not mark-to-close, since now there IS a real
// resolution. Trades that STILL never resolve even given the full
// remaining dataset are dropped, same as today (nothing else to do with
// them).
//
//   node analysis/fib_atlas_neither_extend_test.mjs
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { asiaFibAtlasWalk } from '../js/asiaFibAtlasEngine.js';
import { buildAsiaFibAtlasBook } from '../js/asiaFibAtlasReport.js';
import { voteDecision, buildBarrierTrades } from '../js/asiaFibAtlasVoteReview.js';
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
const NEXT_SESSION_BUILD_HR = 6; // Asia's new range isn't built until 6am -- concurrency frees up here regardless of real resolution
const MAX_EXTEND_DAYS = 14; // bounded search -- an unbounded one could scan years of bars for a handful of never-resolving early touches

function bracketDistances(touch, decision) {
  const targetPips = decision === 'fade' ? touch.innerDistPips : touch.outerDistPips;
  const stopPips = decision === 'fade' ? touch.outerDistPips : touch.innerDistPips;
  return { targetPips, stopPips };
}

// Continue the SAME race-to-resolution the core engine uses (reach outer ->
// 'out', touch inner -> 'back'), starting right after the original
// same-day cutoff, using bars from there to the end of the dataset (no cap
// -- this is the PRICING search; concurrency capping happens separately).
function extendedOutcome(touch, decision, bars) {
  const isAbove = touch.side === 'above';
  const { targetPips, stopPips } = bracketDistances(touch, decision);
  if (targetPips == null || stopPips == null) return null;
  const here = touch.price, pip = touch.pip;
  const inner = isAbove ? here - touch.innerDistPips * pip : here + touch.innerDistPips * pip;
  const outer = touch.outerDistPips != null ? (isAbove ? here + touch.outerDistPips * pip : here - touch.outerDistPips * pip) : null;
  const reach = (px, target) => (isAbove ? px >= target : px <= target);

  // `bars` is already pre-sliced by the caller to start right after the
  // touch's own same-day cutoff (extractBars from midnight onward).
  for (let j = 0; j < bars.length; j++) {
    const b = bars[j];
    const fwd = isAbove ? b.high : b.low, bwd = isAbove ? b.low : b.high;
    if (outer != null && reach(fwd, outer)) return { outcome: 'out', resolveTime: b.time };
    if (isAbove ? bwd <= inner : bwd >= inner) return { outcome: 'back', resolveTime: b.time };
  }
  return null; // never resolved even given the rest of the dataset
}

function priceResolved(touch, decision, outcome, cost) {
  const denom = touch.price > 0 ? touch.price : null;
  const { targetPips, stopPips } = bracketDistances(touch, decision);
  if (denom == null) return null;
  const win = (decision === 'fade' && outcome === 'back') || (decision === 'follow' && outcome === 'out');
  const pnlPips = win ? targetPips : -stopPips;
  const pnlPct = +((pnlPips * touch.pip / denom * 100) - cost).toFixed(4);
  return { win, pnlPct, targetPips, stopPips };
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
  console.log([label.padEnd(30), String(s.trades).padStart(7), String(s.sharpe).padStart(7), ciStr(s).padStart(14),
    (s.maxDD + '%').padStart(8), (s.cagr + '%').padStart(9), String(s.profitFactor).padStart(7)].join('  '));
}
function header() {
  console.log(['config'.padEnd(30), 'trades'.padStart(7), 'sharpe'.padStart(7), 'sharpeCI95'.padStart(14),
    'maxDD(add.)'.padStart(8), 'CAGR(add.)'.padStart(9), 'PF'.padStart(7)].join('  '));
}
function printPerTradeRow(label, s) {
  if (!s) { console.log(`${label.padEnd(30)}  no trades`); return; }
  console.log([label.padEnd(30), String(s.trades).padStart(7), (s.winRate + '%').padStart(8), String(s.profitFactor).padStart(7), String(s.rawTradeSharpe).padStart(10)].join('  '));
}
function perTradeHeader() {
  console.log(['config'.padEnd(30), 'trades'.padStart(7), 'winRate'.padStart(8), 'PF'.padStart(7), 'rawSharpe'.padStart(10)].join('  '));
}

async function main() {
  const baselineFinal = {}, extendedFinal = {};
  let totalCandidates = 0, totalStillUnresolved = 0, totalResolvedOut = 0, totalResolvedBack = 0;

  for (const pair of PAIRS) {
    console.log(`... ${pair}`);
    const bars = await loadM1ForPair(pair);
    const { touches } = asiaFibAtlasWalk(bars, { instrument: pair });
    const book = buildAsiaFibAtlasBook(touches, { rearmFrac: DEFAULT_REARM });
    const cost = costForPair(pair, pair === 'gold' ? 'metal' : 'fx');
    const sym = pair.toUpperCase();

    const baseTrades = buildBarrierTrades(touches, book, { rearmFrac: DEFAULT_REARM, cost, minMargin: MIN_MARGIN });
    if (baseTrades?.length) baselineFinal[sym] = pipelineTrades(baseTrades, cost);

    const asiaSessions = buildAsiaSessions(bars, 'london', ASIA_HRS, 5);
    const winEndByDate = new Map(asiaSessions.map(s => [s.date, s.epoch + 24 * 3600]));

    const oos = touches.filter(t => t.rearmFrac === DEFAULT_REARM && t.date >= book.splitDate && t.outcome === 'neither');
    const extendedTrades = [];
    for (const t of oos) {
      const vd = voteDecision(book, t);
      if (!vd || vd.margin < MIN_MARGIN) continue;
      const midnight = winEndByDate.get(t.date);
      if (midnight == null) continue;
      totalCandidates++;
      // Search forward from midnight, bounded to MAX_EXTEND_DAYS.
      const searchBars = extractBars(bars, midnight, midnight + MAX_EXTEND_DAYS * 86400);
      const found = extendedOutcome(t, vd.decision, searchBars);
      if (!found) { totalStillUnresolved++; continue; }
      if (found.outcome === 'out') totalResolvedOut++; else totalResolvedBack++;
      const priced = priceResolved(t, vd.decision, found.outcome, cost);
      if (!priced) continue;
      // Concurrency occupancy capped at next session's build time (6am the
      // following day) regardless of the real (possibly much later)
      // resolution -- the pricing above already used the REAL outcome.
      const concurrencyResolveTime = Math.min(found.resolveTime, midnight + NEXT_SESSION_BUILD_HR * 3600);
      extendedTrades.push({
        instrument: t.instrument, date: t.date, time: t.time, resolveTime: concurrencyResolveTime,
        side: t.side, rung: t.level, entry: t.price, pip: t.pip, decision: vd.decision, margin: vd.margin,
        targetPips: priced.targetPips, stopPips: priced.stopPips,
        win: priced.win, pnlPct: priced.pnlPct, asiaConfPips: t.asiaConfPips ?? null,
      });
    }

    const combinedTrades = [...(baseTrades ?? []), ...extendedTrades].sort((a, b) => a.time - b.time);
    if (combinedTrades.length) extendedFinal[sym] = pipelineTrades(combinedTrades, cost);
  }

  console.log(`\n${totalCandidates} 'neither' touches had a valid vote+margin to search further.`);
  console.log(`Given the REST of the dataset to resolve: ${totalResolvedOut} eventually hit 'out', ${totalResolvedBack} eventually hit 'back', ${totalStillUnresolved} STILL never resolved (${(totalStillUnresolved / totalCandidates * 100).toFixed(1)}%).`);
  console.log(`Eventual win rate of the ones that DID resolve: ${((totalResolvedOut + totalResolvedBack) ? 'see per-trade table below' : 'n/a')}\n`);

  header();
  printRow('BASELINE (shipped, drops neither)', statsFromFinal(baselineFinal));
  printRow('+ extended (concurrency capped @6am)', statsFromFinal(extendedFinal));

  console.log();
  perTradeHeader();
  printPerTradeRow('BASELINE (shipped, drops neither)', perTradeStatsFor(baselineFinal));
  printPerTradeRow('+ extended (concurrency capped @6am)', perTradeStatsFor(extendedFinal));
}

main();
