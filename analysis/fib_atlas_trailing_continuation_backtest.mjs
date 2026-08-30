// Trailing/continuation exit for WINNING trades (2026-08-30) — direct
// follow-up to the owner's own suggestion: "if we are trading a level
// which will continue the same direction we move to, sl etc and don't
// close and open a trade?" Today's trades (js/asiaFibAtlasVoteReview.js's
// `priceBarrierTrade`) close at a FIXED target the instant price first
// touches the target rung (`asiaFibAtlasEngine.js`'s walk loop breaks the
// moment `outcome` fires) -- there is no mechanism to keep riding a
// genuinely continuing move. This is the only lever this session that
// needed a real M1 re-walk (not just reprocessing the already-built
// touch/trade JSON): the touch record only carries `mfePips`/`maePips` up
// through the FIRST resolution, nothing about what price did after.
// Confirmed M1 bars ARE loadable in this sandbox via `loadM1ForPair`
// (R2 parquet, ~25s/pair) before committing to the build -- CLAUDE.md's
// live-OANDA sandbox restriction does not apply to this cached data.
//
// DECISION env var (2026-08-30 #2, added after the owner's own follow-up
// question -- "why have we not tested both sides of the line for the
// continuation or fade?" -- a fair miss: this originally only covered
// FOLLOW wins, with no principled reason fade couldn't get the same
// treatment. `applyTrailingContinuation` (js/levelAtlasVoteReview.js) was
// generalized the same day to take a `decisions` list; DECISION=follow
// (default, preserves the original run) | fade | all selects which.
//
// Design (minimal-DOF, one new tunable): applies ONLY to WINNING trades on
// the selected decision(s) -- losses on either side are completely
// untouched, so there's no risk-model interaction with the already-shipped
// fade-stop-tightening lever (which only ever repricing fade LOSSES via a
// tighter stop, a disjoint set of rows). From the resolution bar (where
// price first touched the target rung), walk M1 bars FORWARD, tracking a
// trailing stop that only ever ratchets in the FAVORABLE direction for
// THAT trade's own decision (see the brick's own doc for why fade and
// follow on the SAME side of a line are mirror images, not the same
// direction), initialized AT the original target price -- so the worst
// case is IDENTICAL to today's fixed exit (an instant reversal loses
// nothing extra) and the best case captures a real continuation.
// `givebackFrac` is how much of the peak excursion beyond the original
// target is given back before the trailing stop fires. Bounded to the
// trade's own calendar `date` (forced close at day-end if never stopped
// out) -- keeps every trade same-day, matching this project's existing
// daily-return-series convention (`dailySeriesFor` sums one day's trades
// into one observation) and avoiding open-ended multi-day holds this
// system was never designed to carry.
//
// CORRECTNESS NOTE: the trailing walk lengthens `resolveTime` for these
// trades, which the per-pair `applyConcurrencyCap` (max 1 concurrent) must
// see BEFORE deciding which trades survive -- reordering the pipeline vs.
// every other lever this session (trail first, then concurrency-cap, not
// the other way around), specifically to avoid keeping a trade the ORIGINAL
// (shorter) occupancy window would have blocked out.
//
// Pre-stated rule: maximize IS Sharpe (same as the cost-efficiency filter --
// this lever changes trade ECONOMICS, not which trades are taken, so
// Sharpe is the direct read). 70/30 IS/OOS freeze. Leverage-in-disguise
// check: avg win should move, avg loss must NOT move (no stop/sizing
// change on losses) -- checked explicitly below, not assumed. Unlike the
// SL-tightening levers, this one never touches `stopPips`, so it doesn't
// interact with `riskAdjustTrades`' per-trade sizing the way those do --
// see LEGO_MODULES.md's 2026-08-30 correction entry for that separate issue.
//
//   node analysis/fib_atlas_trailing_continuation_backtest.mjs
//   DECISION=fade node analysis/fib_atlas_trailing_continuation_backtest.mjs
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

const MIN_MARGIN = 2, MAX_CONCURRENT = 1, RISK_PCT = 0.5;
const STOP_FRAC = 0.9, MIN_COST_RATIO = 3; // Asia's own frozen choices, see LEGO_MODULES.md
const GIVEBACK_FRACS = [0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
const DECISION = (process.env.DECISION || 'follow').toLowerCase(); // 'follow' | 'fade' | 'all'
const DECISIONS = DECISION === 'all' ? ['fade', 'follow'] : [DECISION];

// LADDER (2026-08-30 #2, added alongside the DECISION generalization) --
// this script was Asia-only until now, which meant the follow-side lever's
// "validated for Monday too" wiring comment was never actually true (no
// LADDER support existed to run it there). Mirrors the same LADDER/exclude/
// best-config pattern every other Fib Atlas analysis script this session
// uses (fib_atlas_sl_tightening_backtest.mjs etc.) -- Monday gets NO
// exclusion (its own pair-selection study failed OOS) and NO frozen heat-
// cap/throttle (never independently validated for Monday, BEST_BY_LADDER.monday
// stays null so statsFor skips both rather than borrowing Asia's).
const LADDER = (process.env.LADDER || 'asia').toLowerCase();
const LADDER_PREFIX = { asia: 'asia-fib-atlas', monday: 'monday-fib-atlas' };
const ASIA_EXCLUDE = new Set(['gbpcad', 'gbpchf', 'eurcad', 'gbpnzd', 'eurchf', 'audchf', 'chfjpy', 'eurnzd', 'gbpjpy', 'eurjpy']);
const EXCLUDE = LADDER === 'monday' ? new Set() : ASIA_EXCLUDE;
const BEST_BY_LADDER = { asia: { heatCapPct: 1, triggerDD: -3, restoreDD: -2, throttleMult: 0.25 }, monday: null };
const BEST = BEST_BY_LADDER[LADDER] ?? null;

// Finishes the pipeline for ONE pair's already cost-filtered trades at ONE
// givebackFrac (null = baseline, no trailing) -- pure, no I/O. Reuses the
// shared `applyTrailingContinuation` brick (js/levelAtlasVoteReview.js) --
// no private copy of the trailing-walk math here.
function finishPair(costFiltered, cost, bars, givebackFrac) {
  const repriced = givebackFrac == null ? costFiltered
    : applyTrailingContinuation(costFiltered, bars, { givebackFrac, cost, decisions: DECISIONS }).map(t =>
        t.trailedPnlPct == null ? t : { ...t, resolveTime: t.trailedResolveTime, pnlPips: t.trailedPnlPips, pnlPct: t.trailedPnlPct });
  // Concurrency cap MUST see the (possibly extended) resolveTime -- run it
  // AFTER trailing, not before (see this file's header correctness note).
  const capped = applyConcurrencyCap(repriced, { maxConcurrent: MAX_CONCURRENT });
  if (!capped?.kept?.length) return null;
  const tightened = applyFadeStopFraction(capped.kept, STOP_FRAC);
  return riskAdjustTrades(tightened, RISK_PCT).map(t => ({ ...t }));
}

// Loads each pair's M1 bars ONCE and computes EVERY givebackFrac variant
// (plus the null baseline) before moving to the next pair -- bounds memory
// to one pair's decoded M1 array set at a time instead of reloading per
// giveback value (16 pairs x 8 variants would otherwise mean 128 redundant
// R2 parquet fetches at ~25s each).
//
//   -> { null: {SYM: trades}, 0.2: {SYM: trades}, ... }
async function buildAllVariants(givebackFracs) {
  const keys = [null, ...givebackFracs];
  const out = Object.fromEntries(keys.map(k => [k, {}]));
  for (const pair of RANGE_FIB_INSTRUMENTS) {
    if (EXCLUDE.has(pair)) continue;
    const stored = await getJSON(`${LADDER_PREFIX[LADDER]}/${pair}-votetrades.json`);
    if (!stored) continue;
    const marginFiltered = stored.trades.filter(t => t.margin >= MIN_MARGIN);
    const costFiltered = applyCostEfficiencyFilter(marginFiltered, stored.cost, MIN_COST_RATIO);
    if (!costFiltered.length) continue;
    const sym = pair.toUpperCase();

    const baseline = finishPair(costFiltered, stored.cost, null, null);
    if (baseline) out[null][sym] = baseline.map(t => ({ ...t, pair: sym }));

    const needsTrail = costFiltered.some(t => DECISIONS.includes(t.decision) && t.win);
    if (!needsTrail) { for (const gb of givebackFracs) if (baseline) out[gb][sym] = out[null][sym]; continue; }

    console.log(`  ... ${pair}: loading M1 for trailing re-walk`);
    const bars = await loadM1ForPair(pair);
    for (const gb of givebackFracs) {
      const trades = finishPair(costFiltered, stored.cost, bars, gb);
      if (trades) out[gb][sym] = trades.map(t => ({ ...t, pair: sym }));
    }
  }
  return out;
}

function statsFor(byPair, syms) {
  let final = Object.fromEntries(syms.map(s => [s, byPair[s]]).filter(([, v]) => v));
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
  return {
    trades: all.length, sharpe: ps.sharpe, sharpeCI95, maxDD: ps.maxDDNonCompounded, cagr: ps.cagrNonCompounded, profitFactor: ps.profitFactor,
    avgWin: +avgWin.toFixed(4), avgLoss: +avgLoss.toFixed(4),
  };
}

function ciStr(s) { return s.sharpeCI95 ? `[${s.sharpeCI95[0]}, ${s.sharpeCI95[1]}]` : '—'; }
function printRow(label, s) {
  console.log([label.padEnd(20), String(s.trades).padStart(6), String(s.sharpe).padStart(7), ciStr(s).padStart(14),
    (s.maxDD + '%').padStart(8), (s.cagr + '%').padStart(9), String(s.profitFactor).padStart(6), (s.avgWin + '%').padStart(9), (s.avgLoss + '%').padStart(9)].join('  '));
}
function header() {
  console.log(['config'.padEnd(20), 'trades'.padStart(6), 'sharpe'.padStart(7), 'sharpeCI95'.padStart(14),
    'maxDD(add.)'.padStart(8), 'CAGR(add.)'.padStart(9), 'PF'.padStart(6), 'avgWin'.padStart(9), 'avgLoss'.padStart(9)].join('  '));
}

async function main() {
  console.log(`Fib Atlas trailing/continuation exit for WINS — ladder=${LADDER}  decision=${DECISION}\n`);
  console.log('Loading all pairs (M1 fetched once per pair, reused across every giveback fraction) ...');
  const variants = await buildAllVariants(GIVEBACK_FRACS);

  const baselineByPair = variants[null];
  const allSyms = Object.keys(baselineByPair);
  const allTrades = Object.values(baselineByPair).flat().sort((a, b) => a.time - b.time);
  const uniqueDates = [...new Set(allTrades.map(t => t.date))].sort();
  const cutoff = uniqueDates[Math.floor(uniqueDates.length * 0.7)];
  console.log(`\n${allTrades.length} trades across ${allSyms.length} pairs. IS/OOS split: ${cutoff}\n`);

  const baselineIsSyms = {}, baselineOosSyms = {};
  for (const s of allSyms) { baselineIsSyms[s] = baselineByPair[s].filter(t => t.date <= cutoff); baselineOosSyms[s] = baselineByPair[s].filter(t => t.date > cutoff); }

  console.log('──── IN-SAMPLE (fit) ────');
  header();
  const isBaseline = statsFor(baselineIsSyms, allSyms);
  printRow('baseline', isBaseline);

  const isRows = [];
  for (const gb of GIVEBACK_FRACS) {
    const byPair = variants[gb];
    const isSyms = {};
    for (const s of Object.keys(byPair)) isSyms[s] = byPair[s].filter(t => t.date <= cutoff);
    const s = statsFor(isSyms, Object.keys(byPair));
    isRows.push({ gb, byPair, ...s });
  }
  for (const r of isRows) printRow(`giveback=${r.gb}`, r);

  const chosen = isRows.filter(r => r.sharpe > isBaseline.sharpe).sort((a, b) => b.sharpe - a.sharpe)[0] ?? null;
  console.log(chosen
    ? `\nChosen (pre-stated rule: maximize IS Sharpe, must beat baseline): giveback=${chosen.gb} (IS Sharpe ${isBaseline.sharpe} -> ${chosen.sharpe})\n`
    : '\nNo giveback fraction beat the baseline IS Sharpe -- not carried to OOS, reporting the null honestly.\n');

  if (!chosen) return;

  console.log('──── OUT-OF-SAMPLE (frozen from IS, applied unchanged) ────');
  header();
  const oosSyms = {};
  for (const s of Object.keys(chosen.byPair)) oosSyms[s] = chosen.byPair[s].filter(t => t.date > cutoff);
  const oosBaseline = statsFor(baselineOosSyms, allSyms);
  const oosChosen = statsFor(oosSyms, Object.keys(chosen.byPair));
  printRow('baseline', oosBaseline);
  printRow(`giveback=${chosen.gb}`, oosChosen);

  console.log(`\nLeverage-in-disguise check (avg loss must NOT move -- no stop/sizing change on losses or fade trades):`);
  console.log(`  OOS avg loss: baseline ${oosBaseline.avgLoss}% vs giveback=${chosen.gb} ${oosChosen.avgLoss}%`);
  console.log(`  OOS avg win:  baseline ${oosBaseline.avgWin}% vs giveback=${chosen.gb} ${oosChosen.avgWin}%`);
}

main();
