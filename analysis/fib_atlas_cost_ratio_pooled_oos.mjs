// Pooled-OOS head-to-head for the cost-efficiency ratio (2026-08-31) —
// direct follow-up to fib_atlas_remaining_levers_walkforward.mjs's finding
// that the ratio chosen per fold flip-flopped (fold1=3, fold2=1, fold3=1):
// that per-fold framing answers "which ratio does THIS fold's fit data
// like", but doesn't settle which single global choice would actually have
// performed best if shipped and left untouched across the WHOLE walk-forward
// evaluation window. This does that directly: run every close-contender
// ratio (1 through 3 — the ones that were actually competitive; 4+ already
// showed clearly worse Sharpe/PF in every fold) on each fold's OWN
// TEST-only window (never touched to choose anything here), then POOL all
// 3 folds' test windows into one combined ~60%-of-history OOS track record
// per ratio. Whichever ratio wins the POOLED number is the honest answer
// to "what should actually ship", not whichever a single fold's fit
// happened to prefer.
//
//   node analysis/fib_atlas_cost_ratio_pooled_oos.mjs
import { getJSON } from '../js/r2Store.js';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import {
  applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries,
  applyFadeStopFraction, applyCostEfficiencyFilter, applyTrailingContinuation,
} from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { sharpeStdError, summarizeTrades } from '../js/metricsCore.js';
import { RANGE_FIB_INSTRUMENTS } from '../js/rangeFibEngine.js';
import { withNonCompoundedDD } from '../js/fibAtlasVotePortfolio.js';

const MIN_MARGIN = 2, RISK_PCT = 0.5;
const CHANDELIER_MULT = 3, CHANDELIER_PERIOD = 60;
const DECISIONS = ['fade', 'follow'];
const STOP_FRAC = 0.9, MODE = { maxConcurrent: 1, perDirection: true }; // shipped, held fixed
const RATIOS = [1, 1.5, 2, 2.5, 3];

const LADDER = 'asia';
const ASIA_EXCLUDE = new Set(['gbpcad', 'gbpchf', 'eurcad', 'gbpnzd', 'eurchf', 'audchf', 'chfjpy', 'eurnzd', 'gbpjpy', 'eurjpy']);

async function loadRaw() {
  const out = {};
  for (const pair of RANGE_FIB_INSTRUMENTS) {
    if (ASIA_EXCLUDE.has(pair)) continue;
    const stored = await getJSON(`asia-fib-atlas/${pair}-votetrades.json`);
    if (!stored) continue;
    const marginFiltered = stored.trades.filter(t => t.margin >= MIN_MARGIN);
    if (!marginFiltered.length) continue;
    const needsBars = marginFiltered.some(t => DECISIONS.includes(t.decision) && t.win);
    console.log(`  ... ${pair}: ${marginFiltered.length} margin-filtered trades${needsBars ? ', loading M1' : ''}`);
    const bars = needsBars ? await loadM1ForPair(pair) : null;
    out[pair.toUpperCase()] = { marginFiltered, cost: stored.cost, bars };
  }
  return out;
}

function pipelineForPair(raw, costRatio) {
  const costFiltered = applyCostEfficiencyFilter(raw.marginFiltered, raw.cost, costRatio);
  if (!costFiltered.length) return [];
  const repriced = raw.bars
    ? applyTrailingContinuation(costFiltered, raw.bars, { trailMode: 'chandelier', chandelierMult: CHANDELIER_MULT, chandelierPeriod: CHANDELIER_PERIOD, decisions: DECISIONS }).map(t =>
        t.trailedPnlPct == null ? t : { ...t, resolveTime: t.trailedResolveTime, pnlPips: t.trailedPnlPips, pnlPct: t.trailedPnlPct })
    : costFiltered;
  const capped = applyConcurrencyCap(repriced, MODE);
  if (!capped?.kept?.length) return [];
  const tightened = applyFadeStopFraction(capped.kept, STOP_FRAC, 0, { preserveSizing: true });
  return riskAdjustTrades(tightened, RISK_PCT).map(t => ({ ...t }));
}

// Returns the FINAL per-pair trade lists (post full pipeline, date-sliced)
// for a ratio -- reused both to compute one fold's own stats AND to pool
// across folds later without re-running the pipeline.
function tradesFor(byPairRaw, syms, dateFilter, costRatio) {
  const final = {};
  for (const s of syms) {
    const raw = byPairRaw[s];
    if (!raw) continue;
    const dateSliced = { ...raw, marginFiltered: raw.marginFiltered.filter(t => dateFilter(t.date)) };
    if (!dateSliced.marginFiltered.length) continue;
    const trades = pipelineForPair(dateSliced, costRatio);
    if (trades.length) final[s] = trades;
  }
  return final;
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

function mergeFinal(...finals) {
  const merged = {};
  for (const f of finals) for (const [pair, trades] of Object.entries(f)) (merged[pair] ??= []).push(...trades);
  return merged;
}

// Per-trade check (2026-08-31) -- the day-pooled portfolio Sharpe above can
// improve just from adding MORE trades that smooth the daily sum, even if
// each individual trade's own edge is worse or unchanged (the exact
// day-pooled-vs-per-trade gap this session's dashboard fixes exist to
// separate out). Settle whether dropping the filter is a REAL per-trade
// edge improvement or a portfolio-smoothing illusion before recommending
// anything -- same summarizeTrades brick as the dashboard's per-trade card.
function perTradeStatsFor(final) {
  const all = Object.values(final).flat();
  if (!all.length) return null;
  const sorted = all.slice().sort((a, b) => a.resolveTime - b.resolveTime);
  const base = summarizeTrades(sorted.map(t => t.pnlPct), sorted.map(t => t.date));
  const rawTradeSharpe = base.tradesPerYr > 0 ? base.sharpe / Math.sqrt(base.tradesPerYr) : base.sharpe;
  return { trades: all.length, winRate: base.winRate, profitFactor: base.profitFactor, rawTradeSharpe: +rawTradeSharpe.toFixed(3) };
}
function printPerTradeRow(label, s) {
  if (!s) { console.log(`${label.padEnd(22)}  no trades`); return; }
  console.log([label.padEnd(22), String(s.trades).padStart(6), (s.winRate + '%').padStart(8), String(s.profitFactor).padStart(6), String(s.rawTradeSharpe).padStart(10)].join('  '));
}
function perTradeHeader() {
  console.log(['config'.padEnd(22), 'trades'.padStart(6), 'winRate'.padStart(8), 'PF'.padStart(6), 'rawSharpe'.padStart(10)].join('  '));
}

function ciStr(s) { return s.sharpeCI95 ? `[${s.sharpeCI95[0]}, ${s.sharpeCI95[1]}]` : '—'; }
function printRow(label, s) {
  console.log([label.padEnd(22), String(s.trades).padStart(6), String(s.sharpe).padStart(7), ciStr(s).padStart(14),
    (s.maxDD + '%').padStart(8), (s.cagr + '%').padStart(9), String(s.profitFactor).padStart(6)].join('  '));
}
function header() {
  console.log(['config'.padEnd(22), 'trades'.padStart(6), 'sharpe'.padStart(7), 'sharpeCI95'.padStart(14),
    'maxDD(add.)'.padStart(8), 'CAGR(add.)'.padStart(9), 'PF'.padStart(6)].join('  '));
}

async function main() {
  console.log(`Fib Atlas cost-efficiency ratio -- POOLED OOS head-to-head across all 3 walk-forward folds' test windows (ladder=asia)\n`);
  console.log('Loading all pairs ...');
  const byPairRaw = await loadRaw();
  const allSyms = Object.keys(byPairRaw);
  const allDates = [...new Set(Object.values(byPairRaw).flatMap(r => r.marginFiltered.map(t => t.date)))].sort();
  console.log(`\n${allDates.length} unique trading days across ${allSyms.length} pairs (${allDates[0]} -> ${allDates[allDates.length - 1]})\n`);

  const at = frac => allDates[Math.floor(allDates.length * frac)];
  const folds = [
    { name: 'fold 1', testStart: at(0.40), testEnd: at(0.60) },
    { name: 'fold 2', testStart: at(0.60), testEnd: at(0.80) },
    { name: 'fold 3', testStart: at(0.80), testEnd: allDates[allDates.length - 1] + '~' },
  ];

  header();
  const pooledPerRatio = {}, pooledFinalPerRatio = {};
  for (const ratio of RATIOS) {
    const perFoldFinals = folds.map(fold => {
      const testFilter = d => d >= fold.testStart && d < fold.testEnd;
      return tradesFor(byPairRaw, allSyms, testFilter, ratio);
    });
    perFoldFinals.forEach((final, i) => printRow(`${folds[i].name}: ratio=${ratio}`, statsFromFinal(final)));
    const pooled = mergeFinal(...perFoldFinals);
    pooledFinalPerRatio[ratio] = pooled;
    pooledPerRatio[ratio] = statsFromFinal(pooled);
    printRow(`POOLED: ratio=${ratio}`, pooledPerRatio[ratio]);
    console.log();
  }

  console.log("════ Pooled-OOS summary, PORTFOLIO (day-pooled) basis (all 3 folds' test windows combined, ~60% of full history, never used to choose anything) ════");
  header();
  for (const ratio of RATIOS) printRow(`ratio=${ratio}`, pooledPerRatio[ratio]);
  const best = RATIOS.map(r => ({ r, ...pooledPerRatio[r] })).sort((a, b) => b.sharpe - a.sharpe)[0];
  console.log(`\nBest pooled-OOS Sharpe: ratio=${best.r} (${best.sharpe})`);
  console.log(`Shipped ratio=3 pooled-OOS Sharpe: ${pooledPerRatio[3].sharpe}  vs  ratio=1 (no filter): ${pooledPerRatio[1].sharpe}`);

  // Settle whether the day-pooled win above is a REAL per-trade edge
  // improvement or a portfolio-smoothing illusion (more, even lower-edge,
  // trades can raise the day-pooled Sharpe just by smoothing the daily
  // sum) -- exactly the day-pooled-vs-per-trade gap this session's
  // dashboard fixes exist to separate out. Same pooled OOS trade sets,
  // same summarizeTrades brick, PER-TRADE basis this time.
  console.log("\n════ Same pooled-OOS trades, PER-TRADE basis (individual wins/losses, Sharpe NOT annualized) ════");
  perTradeHeader();
  for (const ratio of RATIOS) printPerTradeRow(`ratio=${ratio}`, perTradeStatsFor(pooledFinalPerRatio[ratio]));
}

main();
