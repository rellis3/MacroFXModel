// Net exposure cap for the Fib Atlas portfolio (2026-08-31) — direct
// follow-up to the drawdown-reduction question: this book's worst
// drawdown was previously found to be a 19-day CORRELATED losing stretch
// across pairs (win rate 45.5% vs 58.9% overall), not a pile-up of
// simultaneous positions — the existing portfolio heat cap
// (`applyPortfolioHeatCap`) sums GROSS risk regardless of direction, so a
// long EURUSD + long USDCHF (partially hedged: +EUR-USD and +USD-CHF net
// close to zero USD exposure) costs the same budget as long USDJPY +
// long USDCHF (+USD twice, real doubled exposure) — it can't tell a hedge
// from a stack. `applyExposureCap`/`tradeFactors`
// (js/levelAtlasVoteReview.js) already exist for exactly this — built
// earlier for Level Atlas, never tried on Fib Atlas until this script.
//
// REAL BUG FOUND AND FIXED BEFORE TRUSTING ANY RESULT (2026-08-31): the
// exposure cap's direction sign comes from `betDirection(t)`, which
// checked `t.side === 'up'` -- but Fib Atlas trades carry `side:
// 'above'|'below'`, never the literal string 'up'. Every Fib Atlas
// trade's computed direction was silently wrong (depended only on
// `decision`, ignoring `side` entirely) before `betDirection` was fixed
// to recognize 'above'/'below' as Level Atlas's 'up'/'down' equivalent —
// see that function's own doc and js/levelAtlasVoteReview.test.mjs's new
// T21 assertions. Caught by reading the function against real trade data,
// not assumed correct just because it accepted a generic shape.
//
// Applied on top of the full already-shipped pipeline (recommended pairs,
// cost-efficiency filter >=3x, fade-stop-tighten 0.9x with
// preserveSizing:true, heat cap + throttle at frozen BEST_CONFIG) --
// exposure cap runs BEFORE the heat cap (finer, direction-aware gate
// first; heat cap's coarser aggregate-risk gate second), needs
// `riskPctUsed` from riskAdjustTrades to weight exposure so runs AFTER
// risk-adjustment, and needs the FULL merged, chronologically-sorted
// trade list across pairs (same requirement as applyPortfolioHeatCap).
//
// Pre-stated rule: among cap values with LOWER IS maxDD than the (no
// exposure cap) baseline, the one with the HIGHEST IS Sharpe -- same rule
// shape used throughout this session's SL-tightening/best-config studies.
// 70/30 IS/OOS freeze.
//
//   node analysis/fib_atlas_exposure_cap_backtest.mjs
//   LADDER=monday node analysis/fib_atlas_exposure_cap_backtest.mjs
import { getJSON } from '../js/r2Store.js';
import {
  applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries,
  applyPortfolioHeatCap, applyDrawdownThrottle, applyFadeStopFraction, applyCostEfficiencyFilter,
  applyExposureCap,
} from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { sharpeStdError } from '../js/metricsCore.js';
import { RANGE_FIB_INSTRUMENTS } from '../js/rangeFibEngine.js';
import { withNonCompoundedDD } from '../js/fibAtlasVotePortfolio.js';

const LADDER = (process.env.LADDER || 'asia').toLowerCase();
const LADDER_PREFIX = { asia: 'asia-fib-atlas', monday: 'monday-fib-atlas' };
const MIN_MARGIN = 2, MAX_CONCURRENT = 1, RISK_PCT = 0.5;
const STOP_FRAC = 0.9, MIN_COST_RATIO = 3; // Asia's own frozen choices, see LEGO_MODULES.md
const ASIA_EXCLUDE = new Set(['gbpcad', 'gbpchf', 'eurcad', 'gbpnzd', 'eurchf', 'audchf', 'chfjpy', 'eurnzd', 'gbpjpy', 'eurjpy']);
const EXCLUDE = LADDER === 'monday' ? new Set() : ASIA_EXCLUDE;
const BEST_BY_LADDER = { asia: { heatCapPct: 1, triggerDD: -3, restoreDD: -2, throttleMult: 0.25 }, monday: null };
const BEST = BEST_BY_LADDER[LADDER] ?? null;
const EXPOSURE_CAPS = [0.5, 0.75, 1, 1.5, 2, 3, 5];

async function loadPairTrades(pair) {
  const stored = await getJSON(`${LADDER_PREFIX[LADDER]}/${pair}-votetrades.json`);
  if (!stored) return null;
  const marginFiltered = stored.trades.filter(t => t.margin >= MIN_MARGIN);
  const costFiltered = applyCostEfficiencyFilter(marginFiltered, stored.cost, MIN_COST_RATIO);
  const capped = applyConcurrencyCap(costFiltered, { maxConcurrent: MAX_CONCURRENT });
  if (!capped?.kept?.length) return null;
  const tightened = applyFadeStopFraction(capped.kept, STOP_FRAC, 0, { preserveSizing: true });
  const sym = pair.toUpperCase();
  return riskAdjustTrades(tightened, RISK_PCT).map(t => ({ ...t, pair: sym }));
}

async function buildByPair() {
  const byPair = {};
  for (const pair of RANGE_FIB_INSTRUMENTS) {
    if (EXCLUDE.has(pair)) continue;
    const trades = await loadPairTrades(pair);
    if (trades) byPair[pair.toUpperCase()] = trades;
  }
  return byPair;
}

// Applies the exposure cap (if capPct is finite) to the FULL merged trade
// list, then the frozen heat cap + throttle, matching this book's
// established layering (finer direction-aware gate before the coarser
// aggregate-risk one).
function statsFor(byPair, syms, capPct) {
  const merged = syms.flatMap(s => byPair[s] ?? []);
  let afterExposure = merged;
  let exposureSkipped = null;
  if (isFinite(capPct)) {
    const er = applyExposureCap(merged, { maxNetExposurePct: capPct });
    afterExposure = er.kept;
    exposureSkipped = { skipped: er.skippedCount, total: er.totalCount };
  }
  let byPairAfter = {};
  for (const t of afterExposure) (byPairAfter[t.pair] ??= []).push(t);

  let final = byPairAfter;
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
    avgWin: +avgWin.toFixed(4), avgLoss: +avgLoss.toFixed(4), exposureSkipped,
  };
}

function ciStr(s) { return s.sharpeCI95 ? `[${s.sharpeCI95[0]}, ${s.sharpeCI95[1]}]` : '—'; }
function printRow(label, s) {
  console.log([label.padEnd(16), String(s.trades).padStart(6), String(s.sharpe).padStart(7), ciStr(s).padStart(14),
    (s.maxDD + '%').padStart(8), (s.cagr + '%').padStart(9), String(s.profitFactor).padStart(6), (s.avgWin + '%').padStart(9), (s.avgLoss + '%').padStart(9),
    s.exposureSkipped ? `${s.exposureSkipped.skipped}/${s.exposureSkipped.total}` : '—'].join('  '));
}
function header() {
  console.log(['config'.padEnd(16), 'trades'.padStart(6), 'sharpe'.padStart(7), 'sharpeCI95'.padStart(14),
    'maxDD(add.)'.padStart(8), 'CAGR(add.)'.padStart(9), 'PF'.padStart(6), 'avgWin'.padStart(9), 'avgLoss'.padStart(9), 'exp.skip/tot'].join('  '));
}

async function main() {
  console.log(`Fib Atlas net exposure cap — ladder=${LADDER}\n`);
  const byPair = await buildByPair();
  const allSyms = Object.keys(byPair);
  const allTrades = Object.values(byPair).flat().sort((a, b) => a.time - b.time);
  const uniqueDates = [...new Set(allTrades.map(t => t.date))].sort();
  const cutoff = uniqueDates[Math.floor(uniqueDates.length * 0.7)];
  console.log(`${allTrades.length} trades across ${allSyms.length} pairs. IS/OOS split: ${cutoff}\n`);

  const isByPair = {}, oosByPair = {};
  for (const s of allSyms) { isByPair[s] = byPair[s].filter(t => t.date <= cutoff); oosByPair[s] = byPair[s].filter(t => t.date > cutoff); }

  console.log('──── IN-SAMPLE (fit) ────');
  header();
  const isBaseline = statsFor(isByPair, allSyms, Infinity);
  printRow('baseline', isBaseline);
  const isRows = [];
  for (const cap of EXPOSURE_CAPS) {
    const s = statsFor(isByPair, allSyms, cap);
    isRows.push({ cap, ...s });
    printRow(`cap=${cap}%`, s);
  }

  const eligible = isRows.filter(r => r.maxDD > isBaseline.maxDD);
  const chosen = eligible.length ? eligible.reduce((best, r) => (r.sharpe > best.sharpe ? r : best)) : null;
  console.log(chosen
    ? `\nChosen (pre-stated rule: among caps with lower IS maxDD than baseline, the one with the HIGHEST IS Sharpe): cap=${chosen.cap}%\n`
    : '\nNo cap improved maxDD over baseline -- none frozen for OOS, reporting the null honestly.\n');

  console.log('──── OUT-OF-SAMPLE (frozen from IS, applied unchanged) ────');
  header();
  const oosBaseline = statsFor(oosByPair, allSyms, Infinity);
  printRow('baseline', oosBaseline);
  if (chosen) {
    const oosChosen = statsFor(oosByPair, allSyms, chosen.cap);
    printRow(`cap=${chosen.cap}%`, oosChosen);
    console.log(`\nLeverage-in-disguise check (avg win/loss must NOT move -- this is a pure selection gate, resizes nothing):`);
    console.log(`  OOS avg win:  baseline ${oosBaseline.avgWin}% vs cap=${chosen.cap}% ${oosChosen.avgWin}%`);
    console.log(`  OOS avg loss: baseline ${oosBaseline.avgLoss}% vs cap=${chosen.cap}% ${oosChosen.avgLoss}%`);
  }
  console.log('\n(full OOS grid, for context beyond just the chosen cap:)');
  for (const cap of EXPOSURE_CAPS) printRow(`cap=${cap}%`, statsFor(oosByPair, allSyms, cap));
}

main();
