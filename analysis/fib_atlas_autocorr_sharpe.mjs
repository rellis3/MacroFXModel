// Bandwidth-sensitivity sweep for js/metricsCore.js's neweyWestSharpe — the
// follow-up to the "is Sharpe real" investigation
// (analysis/fib_atlas_best_config_backtest.mjs, LEGO_MODULES.md 2026-08-30):
// the owner spotted implausible Sharpe/CAGR numbers in production
// (asia-fib-atlas-vote-portfolio.html) and asked for TRUTHFUL statistics,
// not another caveat. This is the rigorous version of the daily/weekly/
// monthly eyeball check that investigation started with — same finding,
// properly quantified with an explicit, swept bandwidth rather than three
// arbitrary calendar windows.
//
// Run on TWO series: a single pair alone (EURUSD Asia, no other mitigation
// — isolates the effect from any portfolio-combination question) and the
// full "Load best config" recommended portfolio (fade+follow, all levers
// on — the number actually shown on the live page).
//
//   node analysis/fib_atlas_autocorr_sharpe.mjs
import { getJSON } from '../js/r2Store.js';
import {
  applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries,
  applyPortfolioHeatCap, applyDrawdownThrottle, applyFadeStopFraction,
} from '../js/levelAtlasVoteReview.js';
import { neweyWestSharpe } from '../js/metricsCore.js';
import { RANGE_FIB_INSTRUMENTS } from '../js/rangeFibEngine.js';

const MIN_MARGIN = 2;
const BANDWIDTHS = [5, 10, 15, 20, 30, 45, 60, 90, 120];
const ASIA_EXCLUDE = new Set(['gbpcad', 'gbpchf', 'eurcad', 'gbpnzd', 'eurchf', 'audchf', 'chfjpy', 'eurnzd', 'gbpjpy', 'eurjpy']);
const BEST = { STOP_FRAC: 0.9, RISK_PCT: 0.5, HEAT_CAP: 1, TRIGGER: -3, RESTORE: -2, MULT: 0.25 };

function sweep(label, dailyReturns) {
  console.log(`\n=== ${label} (n=${dailyReturns.length} days) ===`);
  console.log('bandwidth   sharpeNaive   sharpeNW   varianceInflation');
  for (const L of BANDWIDTHS) {
    const r = neweyWestSharpe(dailyReturns, 252, L);
    console.log(`${String(L).padStart(9)}   ${String(r.sharpeNaive).padStart(11)}   ${String(r.sharpeNW).padStart(8)}   ${String(r.varianceInflation).padStart(17)}x`);
  }
  const nwRule = neweyWestSharpe(dailyReturns, 252); // Newey-West's own rule-of-thumb bandwidth
  console.log(`Newey-West's own rule-of-thumb bandwidth (L=${nwRule.bandwidth}): naive ${nwRule.sharpeNaive} -> HAC-adjusted ${nwRule.sharpeNW}`);
}

async function main() {
  // 1. Single pair, isolated.
  const stored = await getJSON('asia-fib-atlas/eurusd-votetrades.json');
  const trades = stored.trades.filter(t => t.margin >= MIN_MARGIN);
  const byDay = new Map();
  for (const t of trades) byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.pnlPct);
  const soloDaily = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, v]) => v);
  sweep('EURUSD Asia alone, margin>=2, NO other mitigation', soloDaily);

  // 2. Full "Load best config" recommended portfolio (Asia, all levers on)
  // -- the number actually shown on the live page.
  const byPair = {};
  for (const pair of RANGE_FIB_INSTRUMENTS) {
    if (ASIA_EXCLUDE.has(pair)) continue;
    const s = await getJSON(`asia-fib-atlas/${pair}-votetrades.json`);
    if (!s) continue;
    const filtered = s.trades.filter(t => t.margin >= MIN_MARGIN);
    const capped = applyConcurrencyCap(filtered, { maxConcurrent: 1 });
    if (!capped?.kept?.length) continue;
    const tightened = applyFadeStopFraction(capped.kept, BEST.STOP_FRAC);
    const sym = pair.toUpperCase();
    byPair[sym] = riskAdjustTrades(tightened, BEST.RISK_PCT).map(t => ({ ...t, pair: sym }));
  }
  let final = byPair;
  const heatResult = applyPortfolioHeatCap(byPair, { maxHeatPct: BEST.HEAT_CAP });
  if (heatResult) { final = {}; for (const t of heatResult.kept) (final[t.pair] ??= []).push(t); }
  const weights = Object.fromEntries(Object.keys(final).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(final, { weights });
  let dailyReturns = combined.dailyReturns;
  const tr = applyDrawdownThrottle(dailyReturns, combined.dates, { triggerDD: BEST.TRIGGER, restoreDD: BEST.RESTORE, throttleMult: BEST.MULT });
  if (tr) dailyReturns = tr.dailyReturns;
  sweep('Full "Load best config" recommended portfolio (Asia, all levers on)', dailyReturns);
}

main();
