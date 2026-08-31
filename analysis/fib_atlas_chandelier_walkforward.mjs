// Chandelier-mult walk-forward validation (2026-08-31) — direct follow-up
// to the owner's own question: given that ~10 separate Fib Atlas levers
// this session were each validated against overlapping slices of the SAME
// single 70/30 calendar split, is the shipped chandelierMult choice
// (Asia=3, Monday=1.5 — analysis/fib_atlas_chandelier_exit_backtest.mjs)
// robust, or could it be a product of that one particular split point
// rather than a genuinely stable characteristic of the data?
//
// A single train/test split answers "does this ONE split like this
// choice"; it can't distinguish a real, stable edge from a choice that
// happens to fit one specific historical stretch. A walk-forward with
// MULTIPLE independent, non-overlapping test windows can: it re-picks the
// mult fresh in each fold (never reusing a prior fold's chosen value) and
// checks it ONLY on that fold's own held-out slice, so a mult that keeps
// winning across genuinely different stretches of history is a much
// stronger claim than one that won once.
//
// 3 EXPANDING-WINDOW folds (fit grows, test window moves forward, test
// windows never overlap each other or any earlier fold's fit window):
//   fold 1: fit on first 40%,  test on the next 20% (40-60%)
//   fold 2: fit on first 60%,  test on the next 20% (60-80%)
//   fold 3: fit on first 80%,  test on the final 20% (80-100%)
// Same pre-stated rule each fold, applied fresh: among mults that beat
// that fold's OWN fit-period baseline Sharpe, the one with the highest
// fit-period Sharpe. maxConcurrent=1/perDirection=false (blocked) only —
// this script isolates whether the MULT choice itself is robust, not the
// (already separately walk-forward-relevant, but different question)
// concurrency mode.
//
//   node analysis/fib_atlas_chandelier_walkforward.mjs
//   LADDER=monday node analysis/fib_atlas_chandelier_walkforward.mjs
import { getJSON } from '../js/r2Store.js';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import {
  applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries,
  applyPortfolioHeatCap, applyDrawdownThrottle, applyFadeStopFraction, applyCostEfficiencyFilter,
  applyTrailingContinuation,
} from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { sharpeStdError } from '../js/metricsCore.js';
import { RANGE_FIB_INSTRUMENTS } from '../js/rangeFibEngine.js';
import { withNonCompoundedDD } from '../js/fibAtlasVotePortfolio.js';

const MIN_MARGIN = 2, RISK_PCT = 0.5;
const STOP_FRAC = 0.9, MIN_COST_RATIO = 3; // Asia's own frozen choices, see LEGO_MODULES.md
const CHAND_MULTS = [1.5, 2, 3, 4, 5];
const CHANDELIER_PERIOD = +(process.env.CHANDELIER_PERIOD || 60);
const DECISIONS = ['fade', 'follow'];

const LADDER = (process.env.LADDER || 'asia').toLowerCase();
const LADDER_PREFIX = { asia: 'asia-fib-atlas', monday: 'monday-fib-atlas' };
const ASIA_EXCLUDE = new Set(['gbpcad', 'gbpchf', 'eurcad', 'gbpnzd', 'eurchf', 'audchf', 'chfjpy', 'eurnzd', 'gbpjpy', 'eurjpy']);
const EXCLUDE = LADDER === 'monday' ? new Set() : ASIA_EXCLUDE;
const BEST_BY_LADDER = { asia: { heatCapPct: 1, triggerDD: -3, restoreDD: -2, throttleMult: 0.25 }, monday: null };
const BEST = BEST_BY_LADDER[LADDER] ?? null;
const SHIPPED_MULT = { asia: 3, monday: 1.5 }[LADDER];

function repriceForMult(costFiltered, bars, mult) {
  return mult == null ? costFiltered
    : applyTrailingContinuation(costFiltered, bars, { trailMode: 'chandelier', chandelierMult: mult, chandelierPeriod: CHANDELIER_PERIOD, decisions: DECISIONS }).map(t =>
        t.trailedPnlPct == null ? t : { ...t, resolveTime: t.trailedResolveTime, pnlPips: t.trailedPnlPips, pnlPct: t.trailedPnlPct });
}

function finishConcurrency(repriced) {
  const capped = applyConcurrencyCap(repriced, { maxConcurrent: 1, perDirection: false });
  if (!capped?.kept?.length) return null;
  const tightened = applyFadeStopFraction(capped.kept, STOP_FRAC, 0, { preserveSizing: true });
  return riskAdjustTrades(tightened, RISK_PCT).map(t => ({ ...t }));
}

// Loads each pair's M1 once, computes every mult variant (blocked
// concurrency only) -- one M1 fetch per pair total, reused across every
// fold below (folds only differ in which DATES they slice, not in the
// underlying trade computation).
async function buildAllMultVariants(mults) {
  const out = Object.fromEntries([null, ...mults].map(m => [m, {}]));
  for (const pair of RANGE_FIB_INSTRUMENTS) {
    if (EXCLUDE.has(pair)) continue;
    const stored = await getJSON(`${LADDER_PREFIX[LADDER]}/${pair}-votetrades.json`);
    if (!stored) continue;
    const marginFiltered = stored.trades.filter(t => t.margin >= MIN_MARGIN);
    const costFiltered = applyCostEfficiencyFilter(marginFiltered, stored.cost, MIN_COST_RATIO);
    if (!costFiltered.length) continue;
    const sym = pair.toUpperCase();

    const baseTrades = finishConcurrency(costFiltered);
    if (baseTrades) out[null][sym] = baseTrades.map(t => ({ ...t, pair: sym }));

    const needsTrail = costFiltered.some(t => DECISIONS.includes(t.decision) && t.win);
    if (!needsTrail) continue;

    console.log(`  ... ${pair}: loading M1 for chandelier re-walk`);
    const bars = await loadM1ForPair(pair);
    for (const mult of mults) {
      const repriced = repriceForMult(costFiltered, bars, mult);
      const trades = finishConcurrency(repriced);
      if (trades) out[mult][sym] = trades.map(t => ({ ...t, pair: sym }));
    }
  }
  return out;
}

function statsFor(byPair, syms, dateFilter) {
  let final = {};
  for (const s of syms) {
    const filtered = (byPair[s] ?? []).filter(t => dateFilter(t.date));
    if (filtered.length) final[s] = filtered;
  }
  if (BEST) {
    const heatResult = applyPortfolioHeatCap(final, { maxHeatPct: BEST.heatCapPct });
    if (heatResult) {
      final = {};
      for (const t of heatResult.kept) (final[t.pair] ??= []).push(t);
    }
  }
  const weights = Object.fromEntries(Object.keys(final).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(final, { weights });
  let dailyReturns = combined.dailyReturns;
  if (BEST) {
    const tr = applyDrawdownThrottle(combined.dailyReturns, combined.dates, { triggerDD: BEST.triggerDD, restoreDD: BEST.restoreDD, throttleMult: BEST.throttleMult });
    if (tr) dailyReturns = tr.dailyReturns;
  }
  const ps = withNonCompoundedDD(portfolioStats(dailyReturns, { mc: false }), dailyReturns);
  const se = ps.days > 1 ? sharpeStdError(ps.sharpe, ps.days, 252) : Infinity;
  const sharpeCI95 = isFinite(se) ? [+(ps.sharpe - 1.96 * se).toFixed(2), +(ps.sharpe + 1.96 * se).toFixed(2)] : null;
  const all = Object.values(final).flat();
  return { trades: all.length, sharpe: ps.sharpe, sharpeCI95, maxDD: ps.maxDDNonCompounded, cagr: ps.cagrNonCompounded, profitFactor: ps.profitFactor };
}

function ciStr(s) { return s.sharpeCI95 ? `[${s.sharpeCI95[0]}, ${s.sharpeCI95[1]}]` : '—'; }
function printRow(label, s) {
  console.log([label.padEnd(16), String(s.trades).padStart(6), String(s.sharpe).padStart(7), ciStr(s).padStart(14),
    (s.maxDD + '%').padStart(8), (s.cagr + '%').padStart(9), String(s.profitFactor).padStart(6)].join('  '));
}
function header() {
  console.log(['config'.padEnd(16), 'trades'.padStart(6), 'sharpe'.padStart(7), 'sharpeCI95'.padStart(14),
    'maxDD(add.)'.padStart(8), 'CAGR(add.)'.padStart(9), 'PF'.padStart(6)].join('  '));
}

async function main() {
  console.log(`Fib Atlas chandelier-mult WALK-FORWARD — ladder=${LADDER}  shipped mult=${SHIPPED_MULT}\n`);
  console.log('Loading all pairs (M1 fetched once per pair, reused across every fold) ...');
  const variants = await buildAllMultVariants(CHAND_MULTS);

  const allSyms = Object.keys(variants[null]);
  const allDates = [...new Set(Object.values(variants[null]).flat().map(t => t.date))].sort();
  console.log(`\n${allDates.length} unique trading days across ${allSyms.length} pairs (${allDates[0]} -> ${allDates[allDates.length - 1]})\n`);

  const at = frac => allDates[Math.floor(allDates.length * frac)];
  const folds = [
    { name: 'fold 1', fitEnd: at(0.40), testStart: at(0.40), testEnd: at(0.60) },
    { name: 'fold 2', fitEnd: at(0.60), testStart: at(0.60), testEnd: at(0.80) },
    { name: 'fold 3', fitEnd: at(0.80), testStart: at(0.80), testEnd: allDates[allDates.length - 1] + '~' },
  ];

  const chosenPerFold = [];
  for (const fold of folds) {
    console.log(`──── ${fold.name}: fit < ${fold.fitEnd}, test [${fold.testStart}, ${fold.testEnd}) ────`);
    header();
    const fitFilter = d => d < fold.fitEnd;
    const testFilter = d => d >= fold.testStart && d < fold.testEnd;

    const fitBaseline = statsFor(variants[null], allSyms, fitFilter);
    printRow('fit: baseline', fitBaseline);
    const fitRows = [];
    for (const mult of CHAND_MULTS) {
      const s = statsFor(variants[mult], Object.keys(variants[mult]), fitFilter);
      fitRows.push({ mult, ...s });
      printRow(`fit: mult=${mult}`, s);
    }
    const chosen = fitRows.filter(r => r.sharpe > fitBaseline.sharpe).sort((a, b) => b.sharpe - a.sharpe)[0] ?? null;
    console.log(chosen ? `  -> chosen this fold: mult=${chosen.mult}` : '  -> no mult beat fit baseline this fold');
    chosenPerFold.push(chosen?.mult ?? null);

    const testBaseline = statsFor(variants[null], allSyms, testFilter);
    printRow('test: baseline', testBaseline);
    if (chosen) {
      const testChosen = statsFor(variants[chosen.mult], Object.keys(variants[chosen.mult]), testFilter);
      printRow(`test: mult=${chosen.mult}`, testChosen);
    }
    console.log();
  }

  console.log('──── Summary ────');
  console.log(`Mult chosen per fold: ${chosenPerFold.map((m, i) => `fold${i + 1}=${m ?? 'none'}`).join(', ')}`);
  console.log(`Shipped/production mult: ${SHIPPED_MULT}`);
  const allSame = chosenPerFold.every(m => m === chosenPerFold[0]);
  console.log(allSame
    ? `-> STABLE: every fold independently picked the same mult (${chosenPerFold[0]}) from its own fit-only data.`
    : `-> NOT stable: different folds picked different mults -- the single 70/30 split's choice may be split-specific, not a robust characteristic.`);
}

main();
