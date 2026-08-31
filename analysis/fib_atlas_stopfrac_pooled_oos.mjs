// Pooled-OOS head-to-head for the stop-tighten fraction (2026-08-31) --
// same correction as analysis/fib_atlas_cost_ratio_pooled_oos.mjs just
// applied to the cost-efficiency ratio: the walk-forward script
// (fib_atlas_remaining_levers_walkforward.mjs) picked a "winner" fraction
// each fold by maximizing the DAY-POOLED portfolio Sharpe -- the exact
// metric this session's dashboard fixes exist to warn is misleading, since
// adding/removing trades can move the day-pooled number just by changing
// how much the daily return series gets smoothed, independent of whether
// each individual trade's own edge actually improved. The cost-ratio check
// found EXACTLY that illusion (day-pooled preferred no filter; per-trade
// PF/Sharpe monotonically preferred MORE filtering, the opposite). This
// script runs the same two-basis check for the stop-tighten fraction
// before trusting the walk-forward's frac=0.75 finding.
//
// Unlike the cost-efficiency filter (which changes trade COUNT), tightening
// a fade loss's stop only REPRICES existing losing trades to a smaller
// loss (same trade, cut earlier) -- so trade count is identical across
// fractions, which means the day-pooled-vs-per-trade divergence mechanism
// found for the cost ratio (more trades -> smoother daily sum) can't apply
// the same way here. Worth checking anyway rather than assuming.
//
//   node analysis/fib_atlas_stopfrac_pooled_oos.mjs
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
const COST_RATIO = 3, MODE = { maxConcurrent: 1, perDirection: true }; // shipped, held fixed
const FRACTIONS = [1.0, 0.90, 0.75, 0.60, 0.50, 0.40, 0.25];

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

function pipelineForPair(raw, stopFrac) {
  const costFiltered = applyCostEfficiencyFilter(raw.marginFiltered, raw.cost, COST_RATIO);
  if (!costFiltered.length) return [];
  const repriced = raw.bars
    ? applyTrailingContinuation(costFiltered, raw.bars, { trailMode: 'chandelier', chandelierMult: CHANDELIER_MULT, chandelierPeriod: CHANDELIER_PERIOD, decisions: DECISIONS }).map(t =>
        t.trailedPnlPct == null ? t : { ...t, resolveTime: t.trailedResolveTime, pnlPips: t.trailedPnlPips, pnlPct: t.trailedPnlPct })
    : costFiltered;
  const capped = applyConcurrencyCap(repriced, MODE);
  if (!capped?.kept?.length) return [];
  const tightened = applyFadeStopFraction(capped.kept, stopFrac, 0, { preserveSizing: true });
  return riskAdjustTrades(tightened, RISK_PCT).map(t => ({ ...t }));
}

function tradesFor(byPairRaw, syms, dateFilter, stopFrac) {
  const final = {};
  for (const s of syms) {
    const raw = byPairRaw[s];
    if (!raw) continue;
    const dateSliced = { ...raw, marginFiltered: raw.marginFiltered.filter(t => dateFilter(t.date)) };
    if (!dateSliced.marginFiltered.length) continue;
    const trades = pipelineForPair(dateSliced, stopFrac);
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
  console.log(`Fib Atlas stop-tighten fraction -- POOLED OOS head-to-head across all 3 walk-forward folds' test windows (ladder=asia)\n`);
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
  const pooledPerFrac = {}, pooledFinalPerFrac = {};
  for (const frac of FRACTIONS) {
    const perFoldFinals = folds.map(fold => {
      const testFilter = d => d >= fold.testStart && d < fold.testEnd;
      return tradesFor(byPairRaw, allSyms, testFilter, frac);
    });
    perFoldFinals.forEach((final, i) => printRow(`${folds[i].name}: frac=${frac}`, statsFromFinal(final)));
    const pooled = mergeFinal(...perFoldFinals);
    pooledFinalPerFrac[frac] = pooled;
    pooledPerFrac[frac] = statsFromFinal(pooled);
    printRow(`POOLED: frac=${frac}`, pooledPerFrac[frac]);
    console.log();
  }

  console.log("════ Pooled-OOS summary, PORTFOLIO (day-pooled) basis ════");
  header();
  for (const frac of FRACTIONS) printRow(`frac=${frac}`, pooledPerFrac[frac]);
  const best = FRACTIONS.map(f => ({ f, ...pooledPerFrac[f] })).sort((a, b) => b.sharpe - a.sharpe)[0];
  console.log(`\nBest pooled-OOS Sharpe (day-pooled): frac=${best.f} (${best.sharpe})`);
  console.log(`Shipped frac=0.9 pooled-OOS Sharpe: ${pooledPerFrac[0.9].sharpe}  vs  frac=0.75: ${pooledPerFrac[0.75].sharpe}  vs  no tightening (1.0): ${pooledPerFrac[1.0].sharpe}`);

  console.log("\n════ Same pooled-OOS trades, PER-TRADE basis (individual wins/losses, Sharpe NOT annualized) ════");
  perTradeHeader();
  for (const frac of FRACTIONS) printPerTradeRow(`frac=${frac}`, perTradeStatsFor(pooledFinalPerFrac[frac]));
}

main();
