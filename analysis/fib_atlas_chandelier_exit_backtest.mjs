// Chandelier (ATR-trailed) continuation exit for Fib Atlas (2026-08-31) —
// direct follow-up to the owner's own question: "did we have a reduction in
// drawdown from [the exposure cap]? if not let's test something else? did
// we ever test ... instead of closing a trade at tp we move to breakeven
// and then trade from chandelier effect to see if actually we can catch
// runners? this may mean we have multiple trades open at once on a pair so
// interested in analysis first?" -- the exposure cap tested a clean null
// (see fib_atlas_exposure_cap_backtest.mjs), so this is "something else".
//
// WHY THE EXISTING TRAILING EXIT COULDN'T ANSWER THIS: Fib Atlas already
// ships a trailing/continuation exit (`applyTrailingContinuation`,
// `trailMode:'giveback'`, live at givebackFrac=0.02) -- but that trail gives
// back a FIXED FRACTION of the excursion made so far, which is why it was
// found (this session, in the "test all 2" follow-up) to exit almost
// immediately on ANY pullback: median hold-time extension ~0 across 17,399
// kept Asia trades, max ~2min even on the busiest pair. It structurally
// cannot ride a real multi-hour continuation, so it never once created a
// "second trade wants to open on this pair while the first is still open"
// scenario worth analysing -- the concurrency question was moot for it.
//
// This script instead uses `trailMode:'chandelier'` (js/levelAtlasVoteReview.js,
// added 2026-08-31): the trail follows `chandelierMult` x a rolling ATR
// (Wilder EMA, `chandelierPeriod` M1 bars) behind the running extreme, so
// only a pullback that's large relative to THIS pair's own recent
// volatility stops it out -- a real "move to breakeven [-ish] and trade the
// chandelier from there" mechanism, built on the SAME already-shipped brick
// (same floor, same day-boundary forced close, same M1 re-walk machinery)
// rather than a new engine.
//
// Pre-stated rule (identical shape to the giveback-trail study): among
// chandelierMult values that beat the (no-trail) baseline's IS Sharpe, the
// one with the HIGHEST IS Sharpe. 70/30 IS/OOS freeze. Leverage-in-disguise
// check: avg loss must NOT move (this lever only ever touches WINNING
// trades' exit, never stopPips or sizing).
//
// "ANALYSIS FIRST" (the owner's own explicit ask, honoured literally):
// after freezing the exit shape, this script tests BOTH concurrency models
// at that frozen config, per the owner's "test all 2" follow-up --
//   (1) BLOCKED (maxConcurrent=1, perDirection=false, today's production
//       behaviour): a later signal on the same pair is skipped outright if
//       the chandelier-held trade is still open, regardless of direction.
//   (2) HEDGE-ONLY (maxConcurrent=1, perDirection=true): a SECOND trade on
//       the same pair may open only if it's the OPPOSITE direction (a real
//       hedge) -- same-direction "stacking" is never allowed.
//
// REVISION (2026-08-31, caught by the owner spotting an absurd live result
// -- PF 133, 94% win rate -- and asking hard questions, not by this script
// catching it first): the ORIGINAL version of this test used
// maxConcurrent=2/perDirection=false as "stacking", which allows TWO
// SAME-DIRECTION positions on one pair at once. That let adjacent fib rungs
// touched minutes apart during the SAME real continuation both survive the
// cap, and since chandelier extends both to the SAME underlying move, they
// resolved at the IDENTICAL timestamp with the IDENTICAL pnlPct -- one real
// market event paid out twice. Quantified on the live "best config" pull:
// 27.1% of total win PnL came from exact (pair, resolveTime) duplicates.
// perDirection=true fixes this at the root (same-direction pyramiding is
// structurally impossible, not just discouraged) while still allowing the
// one economically distinct case -- a genuine hedge. `duplicateContamination`
// below re-measures the SAME diagnostic on the corrected pipeline to prove
// the fix, not just assert it.
// This is deliberately ANALYSIS, not a wired-in change -- nothing here
// touches the live page or BEST_CONFIG until the owner decides what to do
// with the result.
//
//   node analysis/fib_atlas_chandelier_exit_backtest.mjs
//   LADDER=monday node analysis/fib_atlas_chandelier_exit_backtest.mjs
//   CHANDELIER_PERIOD=120 node analysis/fib_atlas_chandelier_exit_backtest.mjs
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
const DECISION = (process.env.DECISION || 'all').toLowerCase(); // production runs 'all' (both sides) -- see LEGO_MODULES.md
const DECISIONS = DECISION === 'all' ? ['fade', 'follow'] : [DECISION];

const LADDER = (process.env.LADDER || 'asia').toLowerCase();
const LADDER_PREFIX = { asia: 'asia-fib-atlas', monday: 'monday-fib-atlas' };
const ASIA_EXCLUDE = new Set(['gbpcad', 'gbpchf', 'eurcad', 'gbpnzd', 'eurchf', 'audchf', 'chfjpy', 'eurnzd', 'gbpjpy', 'eurjpy']);
const EXCLUDE = LADDER === 'monday' ? new Set() : ASIA_EXCLUDE;
const BEST_BY_LADDER = { asia: { heatCapPct: 1, triggerDD: -3, restoreDD: -2, throttleMult: 0.25 }, monday: null };
const BEST = BEST_BY_LADDER[LADDER] ?? null;

// Re-prices ONE pair's already cost-filtered trades for ONE chandelierMult
// (null = baseline, no trailing) -- pure, no I/O, no concurrency decision
// yet (that's applied separately per maxConcurrent so the M1 re-walk itself
// is never redundantly repeated across the concurrency grid).
function repriceForMult(costFiltered, bars, mult) {
  return mult == null ? costFiltered
    : applyTrailingContinuation(costFiltered, bars, { trailMode: 'chandelier', chandelierMult: mult, chandelierPeriod: CHANDELIER_PERIOD, decisions: DECISIONS }).map(t =>
        t.trailedPnlPct == null ? t : { ...t, resolveTime: t.trailedResolveTime, pnlPips: t.trailedPnlPips, pnlPct: t.trailedPnlPct });
}

// Concurrency modes tested (2026-08-31, replacing the earlier flawed
// maxConcurrent=2/perDirection=false "stacking" test -- see this file's own
// STEP 3 comment below for why that was wrong and what's tested instead).
const CONCURRENCY_MODES = [
  { key: 'blocked', maxConcurrent: 1, perDirection: false },   // today's production: at most 1 position per pair, either direction
  { key: 'hedgeOnly', maxConcurrent: 1, perDirection: true },  // at most 1 LONG *and* 1 SHORT per pair -- a genuine hedge, never same-direction pyramiding
];

// Finishes the pipeline for one already-repriced trade list at ONE
// concurrency mode -- pure. Reuses `applyConcurrencyCap` exactly as shipped,
// including its own `perDirection` option -- no new concurrency mechanism.
function finishConcurrency(repriced, mode) {
  const capped = applyConcurrencyCap(repriced, { maxConcurrent: mode.maxConcurrent, perDirection: mode.perDirection });
  if (!capped?.kept?.length) return null;
  const tightened = applyFadeStopFraction(capped.kept, STOP_FRAC, 0, { preserveSizing: true });
  return { trades: riskAdjustTrades(tightened, RISK_PCT).map(t => ({ ...t })), skippedCount: capped.skippedCount, totalCount: capped.totalCount };
}

// Loads each pair's M1 bars ONCE and computes every (mult x concurrency mode)
// combination before moving to the next pair -- the M1 re-walk itself only
// runs once per (pair, mult), not once per (pair, mult, mode).
//
//   -> { [mult|'null']: { blocked: {SYM: {trades,skippedCount,totalCount}}, hedgeOnly: {...} } }
async function buildAllVariants(mults, modes) {
  const keys = [null, ...mults];
  const out = Object.fromEntries(keys.map(k => [k, Object.fromEntries(modes.map(m => [m.key, {}]))]));
  for (const pair of RANGE_FIB_INSTRUMENTS) {
    if (EXCLUDE.has(pair)) continue;
    const stored = await getJSON(`${LADDER_PREFIX[LADDER]}/${pair}-votetrades.json`);
    if (!stored) continue;
    const marginFiltered = stored.trades.filter(t => t.margin >= MIN_MARGIN);
    const costFiltered = applyCostEfficiencyFilter(marginFiltered, stored.cost, MIN_COST_RATIO);
    if (!costFiltered.length) continue;
    const sym = pair.toUpperCase();

    for (const m of modes) {
      const r = finishConcurrency(costFiltered, m);
      if (r) out[null][m.key][sym] = { ...r, trades: r.trades.map(t => ({ ...t, pair: sym })) };
    }

    const needsTrail = costFiltered.some(t => DECISIONS.includes(t.decision) && t.win);
    if (!needsTrail) continue;

    console.log(`  ... ${pair}: loading M1 for chandelier re-walk`);
    const bars = await loadM1ForPair(pair);
    for (const mult of mults) {
      const repriced = repriceForMult(costFiltered, bars, mult);
      for (const m of modes) {
        const r = finishConcurrency(repriced, m);
        if (r) out[mult][m.key][sym] = { ...r, trades: r.trades.map(t => ({ ...t, pair: sym })) };
      }
    }
  }
  return out;
}

// Duplicate-resolution diagnostic (2026-08-31) -- the mechanism that made
// the ORIGINAL maxConcurrent=2/perDirection=false "stacking" test dishonest:
// two SAME-DIRECTION touches on the same pair, entered minutes apart (e.g.
// adjacent fib rungs during one real continuation), both surviving the cap
// and both chandelier-extended to the SAME underlying move, resolving at
// the identical timestamp with the identical pnlPct -- one real market
// event paid out twice. Counts trades sharing an EXACT (pair, resolveTime)
// with another kept trade, and the % of total win PnL they contribute.
function duplicateContamination(byPairMode) {
  const all = Object.values(byPairMode).flatMap(v => v.trades);
  const groups = new Map();
  for (const t of all) { const k = t.pair + '|' + t.resolveTime; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
  const totalWinPnl = all.filter(t => t.win).reduce((a, t) => a + t.pnlPct, 0);
  let dupTrades = 0, dupPnl = 0;
  for (const [, g] of groups) {
    if (g.length < 2) continue;
    const sorted = [...g].sort((a, b) => a.time - b.time);
    for (let i = 1; i < sorted.length; i++) { dupTrades++; if (sorted[i].win) dupPnl += sorted[i].pnlPct; }
  }
  return { dupTrades, totalTrades: all.length, pctOfWinPnl: totalWinPnl > 0 ? +(100 * dupPnl / totalWinPnl).toFixed(2) : 0 };
}

function statsFor(byPairVariant, syms) {
  let final = Object.fromEntries(syms.map(s => [s, byPairVariant[s]?.trades]).filter(([, v]) => v));
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
  const wins = all.filter(t => t.win), losses = all.filter(t => !t.win);
  const avgWin = wins.length ? wins.reduce((a, t) => a + t.pnlPct, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((a, t) => a + t.pnlPct, 0) / losses.length : 0;
  const skipped = Object.values(byPairVariant).reduce((a, v) => a + (v?.skippedCount ?? 0), 0);
  const total = Object.values(byPairVariant).reduce((a, v) => a + (v?.totalCount ?? 0), 0);
  return {
    trades: all.length, sharpe: ps.sharpe, sharpeCI95, maxDD: ps.maxDDNonCompounded, cagr: ps.cagrNonCompounded, profitFactor: ps.profitFactor,
    avgWin: +avgWin.toFixed(4), avgLoss: +avgLoss.toFixed(4), skipped, total,
  };
}

function ciStr(s) { return s.sharpeCI95 ? `[${s.sharpeCI95[0]}, ${s.sharpeCI95[1]}]` : '—'; }
function printRow(label, s) {
  console.log([label.padEnd(22), String(s.trades).padStart(6), String(s.sharpe).padStart(7), ciStr(s).padStart(14),
    (s.maxDD + '%').padStart(8), (s.cagr + '%').padStart(9), String(s.profitFactor).padStart(6), (s.avgWin + '%').padStart(9), (s.avgLoss + '%').padStart(9),
    `${s.skipped}/${s.total}`.padStart(10)].join('  '));
}
function header() {
  console.log(['config'.padEnd(22), 'trades'.padStart(6), 'sharpe'.padStart(7), 'sharpeCI95'.padStart(14),
    'maxDD(add.)'.padStart(8), 'CAGR(add.)'.padStart(9), 'PF'.padStart(6), 'avgWin'.padStart(9), 'avgLoss'.padStart(9), 'concur.skip/tot'.padStart(10)].join('  '));
}

// Extension-duration diagnostic for the frozen config's kept trades at
// maxConcurrent=1 -- how much LONGER (minutes) does the chandelier hold a
// winner past its original fixed-target resolution, and does a SECOND
// touch on the same pair ever land inside that extended window (the direct
// "multiple trades open at once" question).
function extensionStats(byPairMult1, byPairBaseline1) {
  const rows = [];
  for (const sym of Object.keys(byPairMult1)) {
    const base = byPairBaseline1[sym]?.trades ?? [];
    const baseByTime = new Map(base.map(t => [t.time, t]));
    for (const t of byPairMult1[sym].trades) {
      const b = baseByTime.get(t.time);
      if (b && t.resolveTime > b.resolveTime) rows.push((t.resolveTime - b.resolveTime) / 60);
    }
  }
  rows.sort((a, b) => a - b);
  const p = q => rows.length ? rows[Math.min(rows.length - 1, Math.floor(rows.length * q))] : 0;
  return { n: rows.length, p10: +p(0.10).toFixed(1), median: +p(0.50).toFixed(1), p75: +p(0.75).toFixed(1), p90: +p(0.90).toFixed(1), max: rows.length ? +rows[rows.length - 1].toFixed(1) : 0 };
}

async function main() {
  console.log(`Fib Atlas chandelier (ATR-trailed) continuation exit — ladder=${LADDER}  decision=${DECISION}  period=${CHANDELIER_PERIOD}\n`);
  console.log('Loading all pairs (M1 fetched once per pair, reused across every mult/concurrency combination) ...');
  const variants = await buildAllVariants(CHAND_MULTS, CONCURRENCY_MODES);

  const baselineByPair = variants[null].blocked;
  const allSyms = Object.keys(baselineByPair);
  const allTrades = Object.values(baselineByPair).flatMap(v => v.trades).sort((a, b) => a.time - b.time);
  const uniqueDates = [...new Set(allTrades.map(t => t.date))].sort();
  const cutoff = uniqueDates[Math.floor(uniqueDates.length * 0.7)];
  console.log(`\n${allTrades.length} trades across ${allSyms.length} pairs. IS/OOS split: ${cutoff}\n`);

  const isFilter = v => Object.fromEntries(Object.entries(v).map(([s, r]) => [s, { ...r, trades: r.trades.filter(t => t.date <= cutoff) }]));
  const oosFilter = v => Object.fromEntries(Object.entries(v).map(([s, r]) => [s, { ...r, trades: r.trades.filter(t => t.date > cutoff) }]));

  console.log('──── STEP 1: freeze the exit shape (maxConcurrent=1, matching today\'s production) ────\n');
  console.log('──── IN-SAMPLE (fit) ────');
  header();
  const isBaseline = statsFor(isFilter(variants[null].blocked), allSyms);
  printRow('baseline', isBaseline);
  const isRows = [];
  for (const mult of CHAND_MULTS) {
    const s = statsFor(isFilter(variants[mult].blocked), Object.keys(variants[mult].blocked));
    isRows.push({ mult, ...s });
    printRow(`mult=${mult}`, s);
  }
  const chosen = isRows.filter(r => r.sharpe > isBaseline.sharpe).sort((a, b) => b.sharpe - a.sharpe)[0] ?? null;
  console.log(chosen
    ? `\nChosen (pre-stated rule: maximize IS Sharpe, must beat baseline): mult=${chosen.mult} (IS Sharpe ${isBaseline.sharpe} -> ${chosen.sharpe})\n`
    : '\nNo chandelierMult beat the baseline IS Sharpe -- not carried to OOS, reporting the null honestly.\n');

  console.log('──── OUT-OF-SAMPLE (frozen from IS, applied unchanged) ────');
  header();
  const oosBaseline = statsFor(oosFilter(variants[null].blocked), allSyms);
  printRow('baseline', oosBaseline);
  if (chosen) {
    const oosChosen = statsFor(oosFilter(variants[chosen.mult].blocked), Object.keys(variants[chosen.mult].blocked));
    printRow(`mult=${chosen.mult}`, oosChosen);
    console.log(`\nLeverage-in-disguise check (avg loss must NOT move -- this lever only ever touches WINNING trades' exit):`);
    console.log(`  OOS avg loss: baseline ${oosBaseline.avgLoss}% vs mult=${chosen.mult} ${oosChosen.avgLoss}%`);
    console.log(`  OOS avg win:  baseline ${oosBaseline.avgWin}% vs mult=${chosen.mult} ${oosChosen.avgWin}%`);
  }

  if (!chosen) return;

  console.log(`\n──── STEP 2: "analysis first" -- does the frozen exit ever create a real 2nd-trade-on-one-pair scenario? ────\n`);
  const ext = extensionStats(variants[chosen.mult].blocked, variants[null].blocked);
  console.log(`Hold-time EXTENSION vs the original fixed exit, for winners the chandelier actually extended (mult=${chosen.mult}, all dates, all pairs):`);
  console.log(`  n=${ext.n}  p10=${ext.p10}min  median=${ext.median}min  p75=${ext.p75}min  p90=${ext.p90}min  max=${ext.max}min\n`);

  console.log('──── STEP 3: "test all 2" -- BLOCKED (maxConcurrent=1) vs HEDGE-ONLY (maxConcurrent=1, perDirection=true), at the frozen exit ────\n');
  header();
  console.log('-- IN-SAMPLE --');
  printRow('blocked', statsFor(isFilter(variants[chosen.mult].blocked), Object.keys(variants[chosen.mult].blocked)));
  printRow('hedgeOnly', statsFor(isFilter(variants[chosen.mult].hedgeOnly), Object.keys(variants[chosen.mult].hedgeOnly)));
  console.log('-- OUT-OF-SAMPLE --');
  const oosBlocked = statsFor(oosFilter(variants[chosen.mult].blocked), Object.keys(variants[chosen.mult].blocked));
  const oosHedgeOnly = statsFor(oosFilter(variants[chosen.mult].hedgeOnly), Object.keys(variants[chosen.mult].hedgeOnly));
  printRow('blocked', oosBlocked);
  printRow('hedgeOnly', oosHedgeOnly);
  console.log(`\nOOS trades genuinely gained by allowing a hedge: ${oosHedgeOnly.trades - oosBlocked.trades} (${oosBlocked.trades} -> ${oosHedgeOnly.trades})`);

  console.log('\n──── Duplicate-resolution contamination check (proves the fix, not just asserts it) ────');
  const dupBlocked = duplicateContamination(oosFilter(variants[chosen.mult].blocked));
  const dupHedgeOnly = duplicateContamination(oosFilter(variants[chosen.mult].hedgeOnly));
  console.log(`  blocked:   ${dupBlocked.dupTrades} duplicate-resolveTime trades / ${dupBlocked.totalTrades} total = ${dupBlocked.pctOfWinPnl}% of win PnL`);
  console.log(`  hedgeOnly: ${dupHedgeOnly.dupTrades} duplicate-resolveTime trades / ${dupHedgeOnly.totalTrades} total = ${dupHedgeOnly.pctOfWinPnl}% of win PnL`);
  console.log(`  (the ORIGINAL maxConcurrent=2/perDirection=false "stacking" variant measured 27.1% here on the live Asia "best config" pull -- this is what perDirection=true fixes.)`);
}

main();
