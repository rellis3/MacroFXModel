// Full-config pooled-OOS validation, asia | monday | combined (2026-08-31) —
// direct continuation of the cost-ratio/stop-frac corrections: those were
// Asia-only. The owner asked for the same corrected check (BOTH day-pooled
// AND per-trade basis, pooled across 3 walk-forward-style OOS windows) on
// Monday too, and on COMBINED specifically — "combined is what I will
// trade and combined is where all the high numbers are coming from".
//
// Combined mode is NOT "run Asia and Monday separately and add them up":
// the live route (asiaFibAtlasRoutes.js's /vote-portfolio-combined) treats
// each pair's Asia leg and Monday leg as TWO SEPARATE constituents
// ("EURUSD (Asia)"/"EURUSD (Monday)") that can both be open at once, and
// critically — minCostRatio/stopTightenFrac are ONE GLOBAL value applied
// to every constituent regardless of ladder (confirmed by reading the
// route: `minCostRatio` is a single request param, no per-ladder branch).
// The client already flags this as unvalidated (costRatioFor() comment:
// "combined mode reuses Asia's ratio ... NOT independently validated").
// This script tests exactly that shipped shape: one global ratio/fraction
// applied across all 32 (16 pairs × 2 ladders) streams.
//
//   LADDER=asia     node analysis/fib_atlas_full_config_pooled_oos.mjs
//   LADDER=monday   node analysis/fib_atlas_full_config_pooled_oos.mjs
//   LADDER=combined node analysis/fib_atlas_full_config_pooled_oos.mjs
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

const MIN_MARGIN = 2, RISK_PCT = 0.5, CHANDELIER_PERIOD = 60;
const DECISIONS = ['fade', 'follow'];
const ASIA_MULT = 3, MONDAY_MULT = 1.5;
const ASIA_EXCLUDE = new Set(['gbpcad', 'gbpchf', 'eurcad', 'gbpnzd', 'eurchf', 'audchf', 'chfjpy', 'eurnzd', 'gbpjpy', 'eurjpy']);
const MODE = { maxConcurrent: 1, perDirection: true }; // shipped hedge-only, held fixed (already confirmed both ladders)

const LADDER = (process.env.LADDER || 'asia').toLowerCase();
// Shipped comparison point per ladder mode -- combined intentionally
// reuses Asia's ratio (see header note), NOT independently chosen.
const SHIPPED_RATIO = { asia: 3, monday: 4, combined: 3 }[LADDER];
const RATIOS = [1, 1.5, 2, 2.5, 3, 4, 5];
const FRACTIONS = [1.0, 0.90, 0.75, 0.60, 0.50, 0.40, 0.25];

// Each entry: { symKey, prefix, mult, exclude } -- one per (pair,ladder)
// CONSTITUENT this run needs to load. Combined loads BOTH legs per pair.
function constituentSpecs() {
  const pairs = RANGE_FIB_INSTRUMENTS.filter(p => LADDER === 'monday' ? true : !ASIA_EXCLUDE.has(p));
  if (LADDER === 'combined') {
    return pairs.flatMap(p => [
      { pair: p, symKey: `${p.toUpperCase()}_ASIA`, prefix: 'asia-fib-atlas', mult: ASIA_MULT },
      { pair: p, symKey: `${p.toUpperCase()}_MONDAY`, prefix: 'monday-fib-atlas', mult: MONDAY_MULT },
    ]);
  }
  const prefix = LADDER === 'monday' ? 'monday-fib-atlas' : 'asia-fib-atlas';
  const mult = LADDER === 'monday' ? MONDAY_MULT : ASIA_MULT;
  return pairs.map(p => ({ pair: p, symKey: p.toUpperCase(), prefix, mult }));
}

async function loadRaw() {
  const out = {};
  const specs = constituentSpecs();
  const barsCache = {}; // pair -> bars, shared across ladders (same underlying M1)
  for (const spec of specs) {
    const stored = await getJSON(`${spec.prefix}/${spec.pair}-votetrades.json`);
    if (!stored) continue;
    const marginFiltered = stored.trades.filter(t => t.margin >= MIN_MARGIN);
    if (!marginFiltered.length) continue;
    const needsBars = marginFiltered.some(t => DECISIONS.includes(t.decision) && t.win);
    let bars = null;
    if (needsBars) {
      if (!(spec.pair in barsCache)) {
        console.log(`  ... ${spec.pair}: loading M1`);
        barsCache[spec.pair] = await loadM1ForPair(spec.pair);
      }
      bars = barsCache[spec.pair];
    }
    console.log(`  ... ${spec.symKey}: ${marginFiltered.length} margin-filtered trades (mult=${spec.mult})`);
    out[spec.symKey] = { marginFiltered, cost: stored.cost, bars, mult: spec.mult };
  }
  return out;
}

function pipelineForConstituent(raw, { costRatio, stopFrac }) {
  const costFiltered = applyCostEfficiencyFilter(raw.marginFiltered, raw.cost, costRatio);
  if (!costFiltered.length) return [];
  const repriced = raw.bars
    ? applyTrailingContinuation(costFiltered, raw.bars, { trailMode: 'chandelier', chandelierMult: raw.mult, chandelierPeriod: CHANDELIER_PERIOD, decisions: DECISIONS }).map(t =>
        t.trailedPnlPct == null ? t : { ...t, resolveTime: t.trailedResolveTime, pnlPips: t.trailedPnlPips, pnlPct: t.trailedPnlPct })
    : costFiltered;
  const capped = applyConcurrencyCap(repriced, MODE); // per-constituent budget, matches the live route (same pair's 2 legs are independent constituents)
  if (!capped?.kept?.length) return [];
  const tightened = applyFadeStopFraction(capped.kept, stopFrac, 0, { preserveSizing: true });
  return riskAdjustTrades(tightened, RISK_PCT).map(t => ({ ...t }));
}

function tradesFor(byRaw, syms, dateFilter, params) {
  const final = {};
  for (const s of syms) {
    const raw = byRaw[s];
    if (!raw) continue;
    const dateSliced = { ...raw, marginFiltered: raw.marginFiltered.filter(t => dateFilter(t.date)) };
    if (!dateSliced.marginFiltered.length) continue;
    const trades = pipelineForConstituent(dateSliced, params);
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
  for (const f of finals) for (const [k, trades] of Object.entries(f)) (merged[k] ??= []).push(...trades);
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

function ciStr(s) { return s.sharpeCI95 ? `[${s.sharpeCI95[0]}, ${s.sharpeCI95[1]}]` : '—'; }
function printRow(label, s) {
  console.log([label.padEnd(24), String(s.trades).padStart(6), String(s.sharpe).padStart(7), ciStr(s).padStart(14),
    (s.maxDD + '%').padStart(8), (s.cagr + '%').padStart(9), String(s.profitFactor).padStart(6)].join('  '));
}
function header() {
  console.log(['config'.padEnd(24), 'trades'.padStart(6), 'sharpe'.padStart(7), 'sharpeCI95'.padStart(14),
    'maxDD(add.)'.padStart(8), 'CAGR(add.)'.padStart(9), 'PF'.padStart(6)].join('  '));
}
function printPerTradeRow(label, s) {
  if (!s) { console.log(`${label.padEnd(24)}  no trades`); return; }
  console.log([label.padEnd(24), String(s.trades).padStart(6), (s.winRate + '%').padStart(8), String(s.profitFactor).padStart(6), String(s.rawTradeSharpe).padStart(10)].join('  '));
}
function perTradeHeader() {
  console.log(['config'.padEnd(24), 'trades'.padStart(6), 'winRate'.padStart(8), 'PF'.padStart(6), 'rawSharpe'.padStart(10)].join('  '));
}

async function main() {
  console.log(`Fib Atlas FULL-CONFIG pooled-OOS validation — LADDER=${LADDER}  shipped ratio=${SHIPPED_RATIO}, stopFrac=0.9, mode=hedgeOnly\n`);
  console.log('Loading all constituents ...');
  const byRaw = await loadRaw();
  const allSyms = Object.keys(byRaw);
  const allDates = [...new Set(Object.values(byRaw).flatMap(r => r.marginFiltered.map(t => t.date)))].sort();
  console.log(`\n${allDates.length} unique trading days across ${allSyms.length} constituents (${allDates[0]} -> ${allDates[allDates.length - 1]})\n`);

  const at = frac => allDates[Math.floor(allDates.length * frac)];
  const folds = [
    { name: 'fold 1', testStart: at(0.40), testEnd: at(0.60) },
    { name: 'fold 2', testStart: at(0.60), testEnd: at(0.80) },
    { name: 'fold 3', testStart: at(0.80), testEnd: allDates[allDates.length - 1] + '~' },
  ];

  // ── Cost-efficiency ratio ──
  console.log('════ Cost-efficiency ratio ════');
  header();
  const pooledCostFinal = {};
  for (const ratio of RATIOS) {
    const finals = folds.map(f => tradesFor(byRaw, allSyms, d => d >= f.testStart && d < f.testEnd, { costRatio: ratio, stopFrac: 0.9 }));
    const pooled = mergeFinal(...finals);
    pooledCostFinal[ratio] = pooled;
    printRow(`ratio=${ratio}`, statsFromFinal(pooled));
  }
  console.log('\n-- per-trade basis --');
  perTradeHeader();
  for (const ratio of RATIOS) printPerTradeRow(`ratio=${ratio}`, perTradeStatsFor(pooledCostFinal[ratio]));

  // ── Stop-tighten fraction (held at shipped ratio) ──
  console.log('\n════ Stop-tighten fraction ════');
  header();
  const pooledFracFinal = {};
  for (const frac of FRACTIONS) {
    const finals = folds.map(f => tradesFor(byRaw, allSyms, d => d >= f.testStart && d < f.testEnd, { costRatio: SHIPPED_RATIO, stopFrac: frac }));
    const pooled = mergeFinal(...finals);
    pooledFracFinal[frac] = pooled;
    printRow(`frac=${frac}`, statsFromFinal(pooled));
  }
  console.log('\n-- per-trade basis --');
  perTradeHeader();
  for (const frac of FRACTIONS) printPerTradeRow(`frac=${frac}`, perTradeStatsFor(pooledFracFinal[frac]));

  console.log('\n════ Summary ════');
  console.log(`Shipped: ratio=${SHIPPED_RATIO}, stopFrac=0.9`);
}

main();
