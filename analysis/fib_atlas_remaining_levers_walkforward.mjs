// Walk-forward validation of the remaining single-split-only Fib Atlas
// levers (2026-08-31) — direct follow-up to the chandelierMult walk-forward
// (analysis/fib_atlas_chandelier_walkforward.mjs), which was itself a
// follow-up to the owner's own question: with ~10 separate Fib Atlas levers
// this session each fit against the SAME single 70/30 calendar split, which
// of them are genuinely robust vs which just happen to like that one split?
//
// chandelierMult already got the walk-forward treatment and came back
// STABLE (mult=3 Asia / 1.5 Monday, chosen fresh in all 3 folds) — and as a
// side effect, that same run already re-validates the chandelier exit's
// EXISTENCE too: some mult beat the no-continuation-exit fit baseline in
// every fold, not just once. So "should we use a continuation exit at all"
// does not need a separate script here.
//
// Two levers remain that were EACH only ever checked against the one shared
// 70/30 split, with their own dedicated single-lever scripts:
//   analysis/fib_atlas_cost_efficiency_filter.mjs  -> minCostRatio=3
//   analysis/fib_atlas_sl_tightening_backtest.mjs  -> stopFrac=0.9
// This script re-derives EACH of them fresh, in EACH of the same 3
// expanding-window folds the chandelierMult script used, varying ONE lever
// at a time (holding the other at its shipped value, chandelier mult fixed
// at the already-validated 3) — exactly how each original single-lever
// script isolated its own variable. A THIRD check (blocked vs hedge-only
// concurrency, already found "statistically indistinguishable" on the
// single split post-bug-fix) is folded in too, since that comparison was
// also never walk-forward-checked.
//
// Same discipline as chandelierMult: same pre-stated rule each fold, using
// ONLY that fold's own fit-period data, never peeking at its own test
// window or reusing another fold's chosen value.
//   node analysis/fib_atlas_remaining_levers_walkforward.mjs
//   LADDER=monday node analysis/fib_atlas_remaining_levers_walkforward.mjs
import { getJSON } from '../js/r2Store.js';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import {
  applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries,
  applyFadeStopFraction, applyCostEfficiencyFilter, applyTrailingContinuation,
} from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { sharpeStdError } from '../js/metricsCore.js';
import { RANGE_FIB_INSTRUMENTS } from '../js/rangeFibEngine.js';
import { withNonCompoundedDD } from '../js/fibAtlasVotePortfolio.js';

const MIN_MARGIN = 2, RISK_PCT = 0.5;
const CHANDELIER_MULT = 3, CHANDELIER_PERIOD = +(process.env.CHANDELIER_PERIOD || 60);
const DECISIONS = ['fade', 'follow'];
const COST_RATIOS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
const STOP_FRACTIONS = [1.0, 0.90, 0.75, 0.60, 0.50, 0.40, 0.25];
const CONCURRENCY_MODES = { blocked: { maxConcurrent: 1, perDirection: false }, hedgeOnly: { maxConcurrent: 1, perDirection: true } };
const SHIPPED = { costRatio: 3, stopFrac: 0.9, mode: 'hedgeOnly' };

const LADDER = (process.env.LADDER || 'asia').toLowerCase();
const LADDER_PREFIX = { asia: 'asia-fib-atlas', monday: 'monday-fib-atlas' };
const ASIA_EXCLUDE = new Set(['gbpcad', 'gbpchf', 'eurcad', 'gbpnzd', 'eurchf', 'audchf', 'chfjpy', 'eurnzd', 'gbpjpy', 'eurjpy']);
const EXCLUDE = LADDER === 'monday' ? new Set() : ASIA_EXCLUDE;

// Raw per-pair inputs, loaded ONCE (margin-filtered, pre-cost-filter — the
// cost filter is one of the things being re-derived per fold) plus M1 bars
// for the chandelier reprice step (held fixed at mult=3 throughout — that
// choice already has its own walk-forward result).
async function loadRaw() {
  const out = {};
  for (const pair of RANGE_FIB_INSTRUMENTS) {
    if (EXCLUDE.has(pair)) continue;
    const stored = await getJSON(`${LADDER_PREFIX[LADDER]}/${pair}-votetrades.json`);
    if (!stored) continue;
    const marginFiltered = stored.trades.filter(t => t.margin >= MIN_MARGIN);
    if (!marginFiltered.length) continue;
    const needsBars = marginFiltered.some(t => DECISIONS.includes(t.decision) && t.win);
    console.log(`  ... ${pair}: ${marginFiltered.length} margin-filtered trades${needsBars ? ', loading M1 for chandelier reprice' : ''}`);
    const bars = needsBars ? await loadM1ForPair(pair) : null;
    out[pair.toUpperCase()] = { marginFiltered, cost: stored.cost, bars };
  }
  return out;
}

// Full pipeline for one pair's raw trades, given the 3 lever values under
// test. Mirrors fib_atlas_chandelier_exit_backtest.mjs's exact shipped
// order: cost filter -> chandelier reprice -> concurrency cap ->
// stop-tighten -> risk-adjust.
function pipelineForPair(raw, { costRatio, stopFrac, mode }) {
  const costFiltered = applyCostEfficiencyFilter(raw.marginFiltered, raw.cost, costRatio);
  if (!costFiltered.length) return [];
  const repriced = raw.bars
    ? applyTrailingContinuation(costFiltered, raw.bars, { trailMode: 'chandelier', chandelierMult: CHANDELIER_MULT, chandelierPeriod: CHANDELIER_PERIOD, decisions: DECISIONS }).map(t =>
        t.trailedPnlPct == null ? t : { ...t, resolveTime: t.trailedResolveTime, pnlPips: t.trailedPnlPips, pnlPct: t.trailedPnlPct })
    : costFiltered;
  const capped = applyConcurrencyCap(repriced, CONCURRENCY_MODES[mode]);
  if (!capped?.kept?.length) return [];
  const tightened = applyFadeStopFraction(capped.kept, stopFrac, 0, { preserveSizing: true });
  return riskAdjustTrades(tightened, RISK_PCT).map(t => ({ ...t, pair: undefined }));
}

function statsFor(byPairRaw, syms, dateFilter, params) {
  const final = {};
  for (const s of syms) {
    const raw = byPairRaw[s];
    if (!raw) continue;
    const dateSliced = { ...raw, marginFiltered: raw.marginFiltered.filter(t => dateFilter(t.date)) };
    if (!dateSliced.marginFiltered.length) continue;
    const trades = pipelineForPair(dateSliced, params);
    if (trades.length) final[s] = trades;
  }
  const weights = Object.fromEntries(Object.keys(final).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(final, { weights });
  const dailyReturns = combined?.dailyReturns ?? [];
  const ps = withNonCompoundedDD(portfolioStats(dailyReturns, { mc: false }), dailyReturns);
  const se = ps.days > 1 ? sharpeStdError(ps.sharpe, ps.days, 252) : Infinity;
  const sharpeCI95 = isFinite(se) ? [+(ps.sharpe - 1.96 * se).toFixed(2), +(ps.sharpe + 1.96 * se).toFixed(2)] : null;
  const all = Object.values(final).flat();
  return { trades: all.length, sharpe: ps.sharpe, sharpeCI95, maxDD: ps.maxDDNonCompounded, cagr: ps.cagrNonCompounded, profitFactor: ps.profitFactor };
}

function ciStr(s) { return s.sharpeCI95 ? `[${s.sharpeCI95[0]}, ${s.sharpeCI95[1]}]` : '—'; }
function printRow(label, s) {
  console.log([label.padEnd(20), String(s.trades).padStart(6), String(s.sharpe).padStart(7), ciStr(s).padStart(14),
    (s.maxDD + '%').padStart(8), (s.cagr + '%').padStart(9), String(s.profitFactor).padStart(6)].join('  '));
}
function header() {
  console.log(['config'.padEnd(20), 'trades'.padStart(6), 'sharpe'.padStart(7), 'sharpeCI95'.padStart(14),
    'maxDD(add.)'.padStart(8), 'CAGR(add.)'.padStart(9), 'PF'.padStart(6)].join('  '));
}

async function main() {
  console.log(`Fib Atlas remaining-levers WALK-FORWARD — ladder=${LADDER}  shipped: costRatio=${SHIPPED.costRatio}, stopFrac=${SHIPPED.stopFrac}, mode=${SHIPPED.mode} (chandelierMult=${CHANDELIER_MULT} held fixed, already validated)\n`);
  console.log('Loading all pairs (M1 fetched once per pair where needed, reused across every fold/lever combo) ...');
  const byPairRaw = await loadRaw();
  const allSyms = Object.keys(byPairRaw);

  const allDates = [...new Set(Object.values(byPairRaw).flatMap(r => r.marginFiltered.map(t => t.date)))].sort();
  console.log(`\n${allDates.length} unique trading days across ${allSyms.length} pairs (${allDates[0]} -> ${allDates[allDates.length - 1]})\n`);

  const at = frac => allDates[Math.floor(allDates.length * frac)];
  const folds = [
    { name: 'fold 1', fitEnd: at(0.40), testStart: at(0.40), testEnd: at(0.60) },
    { name: 'fold 2', fitEnd: at(0.60), testStart: at(0.60), testEnd: at(0.80) },
    { name: 'fold 3', fitEnd: at(0.80), testStart: at(0.80), testEnd: allDates[allDates.length - 1] + '~' },
  ];

  const chosenCostRatioPerFold = [], chosenStopFracPerFold = [], chosenModePerFold = [];

  for (const fold of folds) {
    console.log(`════ ${fold.name}: fit < ${fold.fitEnd}, test [${fold.testStart}, ${fold.testEnd}) ════`);
    const fitFilter = d => d < fold.fitEnd;
    const testFilter = d => d >= fold.testStart && d < fold.testEnd;

    // ── Lever 1: cost-efficiency ratio (hold stopFrac/mode at shipped) ──
    console.log('\n-- cost-efficiency ratio --');
    header();
    const costFitRows = COST_RATIOS.map(r => ({ r, ...statsFor(byPairRaw, allSyms, fitFilter, { costRatio: r, stopFrac: SHIPPED.stopFrac, mode: SHIPPED.mode }) }));
    for (const row of costFitRows) printRow(`fit: ratio=${row.r}`, row);
    const chosenCost = costFitRows.slice().sort((a, b) => b.sharpe - a.sharpe)[0];
    console.log(`  -> chosen (maximize IS Sharpe): ratio=${chosenCost.r}`);
    chosenCostRatioPerFold.push(chosenCost.r);
    printRow(`test: ratio=${chosenCost.r}`, statsFor(byPairRaw, allSyms, testFilter, { costRatio: chosenCost.r, stopFrac: SHIPPED.stopFrac, mode: SHIPPED.mode }));
    printRow('test: shipped(3)', statsFor(byPairRaw, allSyms, testFilter, { costRatio: SHIPPED.costRatio, stopFrac: SHIPPED.stopFrac, mode: SHIPPED.mode }));

    // ── Lever 2: SL-tighten fraction (hold costRatio/mode at shipped) ──
    console.log('\n-- stop-tighten fraction --');
    header();
    const fracBaseline = statsFor(byPairRaw, allSyms, fitFilter, { costRatio: SHIPPED.costRatio, stopFrac: 1.0, mode: SHIPPED.mode });
    printRow('fit: baseline(1.0)', fracBaseline);
    const fracFitRows = STOP_FRACTIONS.filter(f => f < 1.0).map(f => ({ f, ...statsFor(byPairRaw, allSyms, fitFilter, { costRatio: SHIPPED.costRatio, stopFrac: f, mode: SHIPPED.mode }) }));
    for (const row of fracFitRows) printRow(`fit: frac=${row.f}`, row);
    const fracEligible = fracFitRows.filter(r => r.maxDD > fracBaseline.maxDD); // less-negative maxDD = improvement
    const chosenFrac = fracEligible.length ? fracEligible.slice().sort((a, b) => b.sharpe - a.sharpe)[0] : null;
    console.log(chosenFrac ? `  -> chosen (among fractions with lower maxDD than baseline, highest IS Sharpe): frac=${chosenFrac.f}` : '  -> no fraction improved fit maxDD over baseline -- none frozen this fold');
    chosenStopFracPerFold.push(chosenFrac?.f ?? null);
    if (chosenFrac) printRow(`test: frac=${chosenFrac.f}`, statsFor(byPairRaw, allSyms, testFilter, { costRatio: SHIPPED.costRatio, stopFrac: chosenFrac.f, mode: SHIPPED.mode }));
    printRow('test: shipped(0.9)', statsFor(byPairRaw, allSyms, testFilter, { costRatio: SHIPPED.costRatio, stopFrac: SHIPPED.stopFrac, mode: SHIPPED.mode }));
    printRow('test: baseline(1.0)', statsFor(byPairRaw, allSyms, testFilter, { costRatio: SHIPPED.costRatio, stopFrac: 1.0, mode: SHIPPED.mode }));

    // ── Lever 3: concurrency mode (hold costRatio/stopFrac at shipped) ──
    console.log('\n-- concurrency mode --');
    header();
    const blockedFit = statsFor(byPairRaw, allSyms, fitFilter, { costRatio: SHIPPED.costRatio, stopFrac: SHIPPED.stopFrac, mode: 'blocked' });
    const hedgeFit = statsFor(byPairRaw, allSyms, fitFilter, { costRatio: SHIPPED.costRatio, stopFrac: SHIPPED.stopFrac, mode: 'hedgeOnly' });
    printRow('fit: blocked', blockedFit);
    printRow('fit: hedgeOnly', hedgeFit);
    const chosenMode = hedgeFit.sharpe >= blockedFit.sharpe ? 'hedgeOnly' : 'blocked';
    console.log(`  -> chosen (maximize IS Sharpe): ${chosenMode}`);
    chosenModePerFold.push(chosenMode);
    printRow(`test: ${chosenMode}`, statsFor(byPairRaw, allSyms, testFilter, { costRatio: SHIPPED.costRatio, stopFrac: SHIPPED.stopFrac, mode: chosenMode }));
    printRow('test: blocked', statsFor(byPairRaw, allSyms, testFilter, { costRatio: SHIPPED.costRatio, stopFrac: SHIPPED.stopFrac, mode: 'blocked' }));
    printRow('test: hedgeOnly', statsFor(byPairRaw, allSyms, testFilter, { costRatio: SHIPPED.costRatio, stopFrac: SHIPPED.stopFrac, mode: 'hedgeOnly' }));

    console.log();
  }

  console.log('════ Summary ════');
  console.log(`Cost-efficiency ratio chosen per fold: ${chosenCostRatioPerFold.map((r, i) => `fold${i + 1}=${r}`).join(', ')}  (shipped: ${SHIPPED.costRatio})`);
  console.log(`Stop-tighten fraction chosen per fold: ${chosenStopFracPerFold.map((f, i) => `fold${i + 1}=${f ?? 'none'}`).join(', ')}  (shipped: ${SHIPPED.stopFrac})`);
  console.log(`Concurrency mode chosen per fold: ${chosenModePerFold.map((m, i) => `fold${i + 1}=${m}`).join(', ')}  (shipped: ${SHIPPED.mode})`);

  const allSameCost = chosenCostRatioPerFold.every(r => r === chosenCostRatioPerFold[0]);
  const allSameFrac = chosenStopFracPerFold.every(f => f === chosenStopFracPerFold[0]);
  const allSameMode = chosenModePerFold.every(m => m === chosenModePerFold[0]);
  console.log(`\ncost-efficiency ratio: ${allSameCost ? `STABLE (every fold picked ${chosenCostRatioPerFold[0]})` : 'NOT stable -- different folds picked different ratios'}`);
  console.log(`stop-tighten fraction: ${allSameFrac ? `STABLE (every fold picked ${chosenStopFracPerFold[0] ?? 'none'})` : 'NOT stable -- different folds picked different fractions/none'}`);
  console.log(`concurrency mode: ${allSameMode ? `STABLE (every fold picked ${chosenModePerFold[0]})` : 'NOT stable -- different folds picked different modes'}`);
}

main();
