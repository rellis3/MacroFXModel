// Fib Atlas sibling of Level Atlas's analysis/drawdown_throttle_backtest.mjs
// (the source behind level-atlas-vote-portfolio.html's "Load best config"
// button) -- built because an audit of that button found several of its
// levers were validated on an ISOLATED slice (Asia ladder, fade decisions
// only, analysis/fib_atlas_sl_tightening_backtest.mjs), not the full
// blended real portfolio the checklist calls for. Same rigor, same
// pre-stated rule, same daily-basis Sharpe CI, run fresh on the FULL book
// (fade+follow combined) using the OOS-validated "recommended" pair set
// from analysis/fib_atlas_oos_validate_pair_selection.mjs.
//
// Grids drawdown-throttle (trigger x mult, restore fixed) AND portfolio
// heat cap TOGETHER -- the earlier Asia/fade-only sweep found heat cap and
// throttle both matter, but never froze a heat-cap choice via IS/OOS
// discipline either. The already-validated 0.9x fade-stop tightening
// (js/levelAtlasVoteReview.js's applyFadeStopFraction, held-out validated
// across 26 pairs x 2 ladders earlier this session) is applied as a FIXED
// baseline throughout, since that lever already cleared its own bar
// independently -- this script isn't re-testing it, just building on it.
//
//   LADDER=asia     node analysis/fib_atlas_best_config_backtest.mjs
//   LADDER=monday   node analysis/fib_atlas_best_config_backtest.mjs
//   LADDER=combined node analysis/fib_atlas_best_config_backtest.mjs
import { getJSON } from '../js/r2Store.js';
import {
  applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries,
  applyPortfolioHeatCap, applyDrawdownThrottle, applyFadeStopFraction,
} from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { sharpeStdError } from '../js/metricsCore.js';
import { RANGE_FIB_INSTRUMENTS } from '../js/rangeFibEngine.js';
// portfolioStats' own maxDD/cagr assume reinvestment (compounding) --
// riskAdjustTrades never actually compounds (every trade risks a CONSTANT
// % of the ORIGINAL notional), so at Fib Atlas's much higher trade density
// than Level Atlas's, naive compounded annualization explodes into
// thousands-of-percent CAGR / near-zero maxDD -- a stark, direct
// demonstration of exactly why js/fibAtlasVotePortfolio.js already built
// withNonCompoundedDD (now exported, reused here rather than re-derived).
// Level Atlas's OWN validation scripts (drawdown_throttle_backtest.mjs
// etc.) use bare portfolioStats() without this correction -- flagged
// separately, not fixed here (out of scope for this file).
import { withNonCompoundedDD } from '../js/fibAtlasVotePortfolio.js';

const LADDER = (process.env.LADDER || 'asia').toLowerCase(); // 'asia' | 'monday' | 'combined'
const MIN_MARGIN = Number(process.env.MIN_MARGIN || 2), MAX_CONCURRENT = 1, RISK_PCT = 0.5;
const STOP_FRAC = 0.9; // already-validated fade-stop tightening, applied as a fixed baseline
const RESTORE_DD = -2;
const TRIGGERS = [-3, -5, -8, -10, -12, -15];
const MULTS = [0.25, 0.5, 0.75];
const HEAT_CAPS = [1, 2, 3, 5];
const LADDER_PREFIX = { asia: 'asia-fib-atlas', monday: 'monday-fib-atlas' };
const LADDER_LABEL = { asia: 'Asia', monday: 'Monday' };

// OOS-validated "recommended" exclusion sets from
// fib_atlas_oos_validate_pair_selection.mjs (MIN_KEPT_FRAC=0.60). Monday's
// OWN exclusion attempt FAILED OOS (maxDD got worse, -7.1%->-10.21%), so
// Monday deliberately gets NO exclusion here -- shipping one anyway just
// because Level Atlas has one would be fabricating a result that didn't
// hold up.
const ASIA_EXCLUDE = new Set(['gbpcad', 'gbpchf', 'eurcad', 'gbpnzd', 'eurchf', 'audchf', 'chfjpy', 'eurnzd', 'gbpjpy', 'eurjpy']);
const MONDAY_EXCLUDE = new Set(); // not validated -- Monday's own study failed OOS, see above

function excludeSetFor(ladder) {
  return ladder === 'monday' ? MONDAY_EXCLUDE : ASIA_EXCLUDE; // combined mode reuses Asia's (the dominant risk driver)
}

async function loadTrades(prefix, pair) {
  const stored = await getJSON(`${prefix}/${pair}-votetrades.json`);
  if (!stored) return null;
  const filtered = stored.trades.filter(t => t.margin >= MIN_MARGIN); // BOTH decisions -- the real, full book
  const capped = applyConcurrencyCap(filtered, { maxConcurrent: MAX_CONCURRENT });
  if (!capped?.kept?.length) return null;
  // Order matches js/fibAtlasVotePortfolio.js's own established convention:
  // fade-stop-tightening AFTER concurrency cap, BEFORE risk-adjustment (the
  // repriced stop must be in place before sizing is computed off it).
  const tightened = applyFadeStopFraction(capped.kept, STOP_FRAC);
  return riskAdjustTrades(tightened, RISK_PCT).map(t => ({ ...t }));
}

async function buildByPair() {
  const byPair = {};
  if (LADDER === 'combined') {
    for (const ladder of ['asia', 'monday']) {
      const exclude = excludeSetFor(ladder);
      for (const pair of RANGE_FIB_INSTRUMENTS) {
        if (exclude.has(pair)) continue;
        const trades = await loadTrades(LADDER_PREFIX[ladder], pair);
        if (!trades) continue;
        const sym = `${pair.toUpperCase()} (${LADDER_LABEL[ladder]})`;
        byPair[sym] = trades.map(t => ({ ...t, pair: sym }));
      }
    }
  } else {
    const exclude = excludeSetFor(LADDER);
    const prefix = LADDER_PREFIX[LADDER];
    if (!prefix) throw new Error(`LADDER must be asia|monday|combined, got "${LADDER}"`);
    for (const pair of RANGE_FIB_INSTRUMENTS) {
      if (exclude.has(pair)) continue;
      const trades = await loadTrades(prefix, pair);
      if (!trades) continue;
      const sym = pair.toUpperCase();
      byPair[sym] = trades.map(t => ({ ...t, pair: sym }));
    }
  }
  return byPair;
}

function statsFor(byPair, syms, { triggerDD = null, restoreDD = RESTORE_DD, throttleMult = 0.5, heatCapPct = null } = {}) {
  let final = Object.fromEntries(syms.map(s => [s, byPair[s]]));
  if (heatCapPct) {
    const heatResult = applyPortfolioHeatCap(final, { maxHeatPct: heatCapPct });
    if (heatResult) {
      final = {};
      for (const t of heatResult.kept) (final[t.pair] ??= []).push(t);
    }
  }
  const weights = Object.fromEntries(Object.keys(final).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(final, { weights });
  let dailyReturns = combined.dailyReturns;
  if (triggerDD != null) {
    const tr = applyDrawdownThrottle(dailyReturns, combined.dates, { triggerDD, restoreDD, throttleMult });
    if (tr) dailyReturns = tr.dailyReturns;
  }
  const ps = withNonCompoundedDD(portfolioStats(dailyReturns, { mc: false }), dailyReturns);
  const se = ps.days > 1 ? sharpeStdError(ps.sharpe, ps.days, 252) : Infinity;
  const sharpeCI95 = isFinite(se) ? [+(ps.sharpe - 1.96 * se).toFixed(2), +(ps.sharpe + 1.96 * se).toFixed(2)] : null;
  const all = Object.values(final).flat();
  // maxDD/cagr below are the NON-COMPOUNDED figures (see this file's own
  // import comment) -- the honest numbers for fixed-fractional-of-original-
  // notional sizing. sharpe itself is unaffected by the compounding
  // question (computed straight off the daily-return series' mean/std).
  return { trades: all.length, sharpe: ps.sharpe, sharpeCI95, maxDD: ps.maxDDNonCompounded, cagr: ps.cagrNonCompounded, annVol: ps.annVol, profitFactor: ps.profitFactor };
}

function ciStr(s) { return s.sharpeCI95 ? `[${s.sharpeCI95[0]}, ${s.sharpeCI95[1]}]` : '—'; }
function printRow(label, s) {
  console.log([label.padEnd(24), String(s.trades).padStart(6), String(s.sharpe).padStart(7),
    ciStr(s).padStart(14), (s.maxDD + '%').padStart(8), (s.cagr + '%').padStart(9), String(s.profitFactor).padStart(6)].join('  '));
}
function header() {
  console.log(['config'.padEnd(24), 'trades'.padStart(6), 'sharpe'.padStart(7), 'sharpeCI95'.padStart(14),
    'maxDD(add.)'.padStart(8), 'CAGR(add.)'.padStart(9), 'PF'.padStart(6)].join('  '));
}

async function main() {
  console.log(`Fib Atlas full-portfolio best-config validation — ladder=${LADDER}  minMargin=${MIN_MARGIN}  fadeStopFrac=${STOP_FRAC}\n`);
  const byPair = await buildByPair();
  const allSyms = Object.keys(byPair);
  const allTrades = Object.values(byPair).flat().sort((a, b) => a.time - b.time);
  const uniqueDates = [...new Set(allTrades.map(t => t.date))].sort();
  const cutoff = uniqueDates[Math.floor(uniqueDates.length * 0.7)];
  console.log(`${allTrades.length} trades (fade+follow, recommended pairs) across ${allSyms.length} constituents. IS/OOS split: ${cutoff}\n`);

  const isSyms = {}, oosSyms = {};
  for (const s of allSyms) { isSyms[s] = byPair[s].filter(t => t.date <= cutoff); oosSyms[s] = byPair[s].filter(t => t.date > cutoff); }

  console.log('──── IN-SAMPLE (fit), no heat cap / no throttle baseline ────');
  header();
  const isBaseline = statsFor(isSyms, allSyms, {});
  printRow('baseline', isBaseline);

  const isRows = [];
  for (const cap of HEAT_CAPS) {
    for (const trig of TRIGGERS) {
      for (const mult of MULTS) {
        const s = statsFor(isSyms, allSyms, { heatCapPct: cap, triggerDD: trig, throttleMult: mult });
        isRows.push({ cap, trig, mult, ...s });
      }
    }
  }
  // Print just the per-cap best (by IS maxDD) row for readability; full grid is in isRows.
  for (const cap of HEAT_CAPS) {
    const bestForCap = isRows.filter(r => r.cap === cap).sort((a, b) => b.maxDD - a.maxDD)[0];
    printRow(`cap=${cap}% trig=${bestForCap.trig} mult=${bestForCap.mult}`, bestForCap);
  }

  // Pre-stated rule: shallowest IS maxDD among candidates with IS Sharpe >=
  // 90% of baseline -- same rule as Level Atlas's own script, deliberately
  // optimizing for drawdown, not Sharpe.
  const sharpeFloor = isBaseline.sharpe * 0.9;
  const eligible = isRows.filter(r => r.sharpe >= sharpeFloor).sort((a, b) => b.maxDD - a.maxDD);
  const chosen = eligible[0] ?? null;
  console.log(chosen
    ? `\nChosen (pre-stated rule: shallowest IS maxDD with Sharpe >= 90% of baseline [${sharpeFloor.toFixed(2)}]): heatCap=${chosen.cap}%, trigger=${chosen.trig}, mult=${chosen.mult}, restore=${RESTORE_DD}\n`
    : '\nNo config cleared the pre-stated bar -- none frozen for OOS.\n');

  console.log('──── OUT-OF-SAMPLE (config frozen from IS, applied unchanged) ────');
  header();
  printRow('baseline', statsFor(oosSyms, allSyms, {}));
  if (chosen) printRow(`cap=${chosen.cap}% trig=${chosen.trig} mult=${chosen.mult}`, statsFor(oosSyms, allSyms, { heatCapPct: chosen.cap, triggerDD: chosen.trig, throttleMult: chosen.mult }));
}

main();
