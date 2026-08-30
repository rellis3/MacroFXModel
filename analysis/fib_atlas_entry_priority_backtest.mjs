// Entry-priority ordering under the portfolio heat cap (2026-08-30) --
// direct follow-up to the owner's own suggestion ("could we analyse a
// different order to enter the trades in the portfolio?"). Diagnosed FIRST
// (not assumed): merged, margin>=2 Asia trades across the recommended pair
// set have 2028 exact-same-entry-timestamp groups (4558 trades) where
// `applyConcurrencyCap`'s admission order today falls back to plain array
// order (whichever pair happened to load first) -- an arbitrary tie-break,
// not an economically motivated one, at exactly the moments multiple Fib
// Atlas lines fire simultaneously (session-open evaluation across pairs).
//
// `applyConcurrencyCap`/`applyPortfolioHeatCap` (js/levelAtlasVoteReview.js)
// got a new opt-in `priorityOf` param: a secondary sort key used ONLY to
// break EXACT-SAME-timestamp ties, never to reorder trades at different
// times (that would defer an earlier trade's admission on the hope a
// better one shows up later -- look-ahead a live system can't do).
//
// FIRST candidate tried -- margin -- turned out to be a structural no-op:
// checked directly (not assumed) and EVERY one of the 857 real contention
// groups in this book has a UNIFORM margin across all its simultaneous
// members (margin reflects a session-wide vote, identical for every pair
// firing at that instant), so sorting by margin never actually reorders
// anything -- confirmed by diffing admitted-trade sets at 5 different heat
// caps (1/2/3/5/10%), all bit-identical to the do-nothing baseline. Ruled
// out and reported honestly, not silently dropped.
//
// SECOND candidate -- `asiaConfPips` (the Asia-vs-previous-Asia confluence
// distance already stored per trade, known at entry time -- see
// js/asiaFibAtlasVoteReview.js's own `confluenceOnly` filter, which treats
// SMALLER asiaConfPips as tighter/stronger confluence) -- does vary within
// 853/857 groups, and DOES change which trades get admitted (checked
// directly: 195 differing admissions at heatCap=1%, the frozen BEST_CONFIG
// value). This is the one this script actually tests: prioritize the
// SMALLEST asiaConfPips (tightest confluence) trade when two+ compete for
// the SAME heat-cap slot at the SAME instant, against the do-nothing
// baseline (today's behavior), on top of the full already-validated
// pipeline (recommended pairs, cost-efficiency filter >=3x, fade-stop-
// tighten 0.9x, heat cap + throttle at the frozen BEST_CONFIG levels from
// fib_atlas_best_config_backtest.mjs). Only tests where the heat cap is
// actually ACTIVE has anything to reorder -- Monday's BEST_CONFIG has no
// heat cap, so this lever is structurally a no-op there and isn't tested.
//
// Pre-stated rule: maximize IS Sharpe (this lever doesn't change trade
// COUNT by design as much as WHICH trades get the shared budget, so a
// drawdown-shape rule is less apt here than for the earlier heat-cap/
// throttle grid -- Sharpe is the direct read on "did picking better trades
// under contention help"). 70/30 IS/OOS freeze, same discipline as every
// other lever this session.
//
//   node analysis/fib_atlas_entry_priority_backtest.mjs
import { getJSON } from '../js/r2Store.js';
import {
  applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries,
  applyPortfolioHeatCap, applyDrawdownThrottle, applyFadeStopFraction, applyCostEfficiencyFilter,
} from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { sharpeStdError } from '../js/metricsCore.js';
import { RANGE_FIB_INSTRUMENTS } from '../js/rangeFibEngine.js';
import { withNonCompoundedDD } from '../js/fibAtlasVotePortfolio.js';

const MIN_MARGIN = 2, MAX_CONCURRENT = 1, RISK_PCT = 0.5;
const STOP_FRAC = 0.9, MIN_COST_RATIO = 3; // Asia's own frozen choices, see LEGO_MODULES.md
const BEST = { heatCapPct: 1, triggerDD: -3, restoreDD: -2, throttleMult: 0.25 }; // Asia's frozen best-config
const ASIA_EXCLUDE = new Set(['gbpcad', 'gbpchf', 'eurcad', 'gbpnzd', 'eurchf', 'audchf', 'chfjpy', 'eurnzd', 'gbpjpy', 'eurjpy']);

async function loadTrades(pair) {
  const stored = await getJSON(`asia-fib-atlas/${pair}-votetrades.json`);
  if (!stored) return null;
  const marginFiltered = stored.trades.filter(t => t.margin >= MIN_MARGIN);
  const costFiltered = applyCostEfficiencyFilter(marginFiltered, stored.cost, MIN_COST_RATIO);
  const capped = applyConcurrencyCap(costFiltered, { maxConcurrent: MAX_CONCURRENT });
  if (!capped?.kept?.length) return null;
  const tightened = applyFadeStopFraction(capped.kept, STOP_FRAC);
  return riskAdjustTrades(tightened, RISK_PCT).map(t => ({ ...t }));
}

async function buildByPair() {
  const byPair = {};
  for (const pair of RANGE_FIB_INSTRUMENTS) {
    if (ASIA_EXCLUDE.has(pair)) continue;
    const trades = await loadTrades(pair);
    if (!trades) continue;
    const sym = pair.toUpperCase();
    byPair[sym] = trades.map(t => ({ ...t, pair: sym }));
  }
  return byPair;
}

function statsFor(byPair, syms, { priorityOf = null } = {}) {
  let final = Object.fromEntries(syms.map(s => [s, byPair[s]]));
  const heatResult = applyPortfolioHeatCap(final, { maxHeatPct: BEST.heatCapPct, priorityOf });
  if (heatResult) {
    final = {};
    for (const t of heatResult.kept) (final[t.pair] ??= []).push(t);
  }
  const weights = Object.fromEntries(Object.keys(final).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(final, { weights });
  let dailyReturns = combined.dailyReturns;
  const tr = applyDrawdownThrottle(dailyReturns, combined.dates, { triggerDD: BEST.triggerDD, restoreDD: BEST.restoreDD, throttleMult: BEST.throttleMult });
  if (tr) dailyReturns = tr.dailyReturns;
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
  console.log([label.padEnd(22), String(s.trades).padStart(6), String(s.sharpe).padStart(7), ciStr(s).padStart(14),
    (s.maxDD + '%').padStart(8), (s.cagr + '%').padStart(9), String(s.profitFactor).padStart(6), (s.avgWin + '%').padStart(9), (s.avgLoss + '%').padStart(9)].join('  '));
}
function header() {
  console.log(['config'.padEnd(22), 'trades'.padStart(6), 'sharpe'.padStart(7), 'sharpeCI95'.padStart(14),
    'maxDD(add.)'.padStart(8), 'CAGR(add.)'.padStart(9), 'PF'.padStart(6), 'avgWin'.padStart(9), 'avgLoss'.padStart(9)].join('  '));
}

async function main() {
  console.log(`Fib Atlas entry-priority ordering under the heat cap — Asia, heatCap=${BEST.heatCapPct}%\n`);
  const byPair = await buildByPair();
  const allSyms = Object.keys(byPair);
  const allTrades = Object.values(byPair).flat().sort((a, b) => a.time - b.time);
  const uniqueDates = [...new Set(allTrades.map(t => t.date))].sort();
  const cutoff = uniqueDates[Math.floor(uniqueDates.length * 0.7)];
  console.log(`${allTrades.length} trades across ${allSyms.length} pairs. IS/OOS split: ${cutoff}\n`);

  const isSyms = {}, oosSyms = {};
  for (const s of allSyms) { isSyms[s] = byPair[s].filter(t => t.date <= cutoff); oosSyms[s] = byPair[s].filter(t => t.date > cutoff); }

  // Diagnostic: how many same-timestamp ties actually exist in the FINAL
  // (post cost-filter, post concurrency-cap, post-tightening) IS trades --
  // confirms this lever has something real to act on, not a diagnostic run
  // on unfiltered raw data.
  const byTime = new Map();
  for (const t of Object.values(isSyms).flat()) { const k = t.time; byTime.set(k, (byTime.get(k) ?? 0) + 1); }
  const tieGroups = [...byTime.values()].filter(n => n > 1).length;
  console.log(`IS same-timestamp contention groups (post-pipeline): ${tieGroups}\n`);

  console.log('──── IN-SAMPLE (fit) ────');
  header();
  const isBaseline = statsFor(isSyms, allSyms, {});
  printRow('baseline (array order)', isBaseline);
  // priorityOf ranks HIGHER score first; asiaConfPips is "smaller = tighter
  // confluence = better", so negate it. A trade missing asiaConfPips sorts
  // last (never displaces a trade that has the signal).
  const confPriority = t => (t.asiaConfPips == null ? -Infinity : -t.asiaConfPips);
  const isPriority = statsFor(isSyms, allSyms, { priorityOf: confPriority });
  printRow('priority=asiaConfPips', isPriority);

  const improves = isPriority.sharpe > isBaseline.sharpe;
  console.log(`\n${improves ? 'Priority-by-asiaConfPips IMPROVES' : 'Priority-by-asiaConfPips does NOT improve'} IS Sharpe (${isBaseline.sharpe} -> ${isPriority.sharpe}).`);
  console.log(improves ? 'Freezing priority=asiaConfPips for OOS check.\n' : 'Pre-stated rule not met -- not carried to OOS, reporting the null honestly.\n');

  console.log('──── OUT-OF-SAMPLE (frozen from IS, applied unchanged) ────');
  header();
  printRow('baseline (array order)', statsFor(oosSyms, allSyms, {}));
  printRow('priority=asiaConfPips', statsFor(oosSyms, allSyms, { priorityOf: confPriority }));
}

main();
