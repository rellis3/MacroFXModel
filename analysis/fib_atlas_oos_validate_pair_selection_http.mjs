// HTTP-only re-run of fib_atlas_oos_validate_pair_selection.mjs (2026-09-12),
// for an environment with network access to the live app but no local
// R2/OANDA credentials — see analysis/fib_atlas_live_vs_backtest_reconcile_http.mjs
// for the same adaptation pattern. IDENTICAL methodology to the original
// script (greedy IS-only forward elimination, frozen, checked against the
// untouched OOS slice) — only `loadConstituent`'s data source changed
// (vote-trades HTTP route instead of getJSON against R2 directly). Re-run
// because the underlying trade population has materially changed since the
// original validation: the 2026-09-11/12 dropped-touch fix added trades
// system-wide, and several pairs (euraud/gbpaud/nzdjpy/audnzd) went from
// months-stale to fully current in the 2026-09-12 regen.
//
//   LADDER=asia    node analysis/fib_atlas_oos_validate_pair_selection_http.mjs
//   LADDER=monday  node analysis/fib_atlas_oos_validate_pair_selection_http.mjs
//   LADDER=combined node analysis/fib_atlas_oos_validate_pair_selection_http.mjs
import { applyConcurrencyCap, buildPortfolioDailySeries, riskAdjustTrades } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { RANGE_FIB_INSTRUMENTS } from '../js/rangeFibEngine.js';

const BASE = process.env.BASE || 'https://macrofxmodel-production.up.railway.app';
const LADDER = (process.env.LADDER || 'asia').toLowerCase(); // 'asia' | 'monday' | 'combined'
const MIN_MARGIN = Number(process.env.MIN_MARGIN || 2), MAX_CONCURRENT = 1, RISK_PCT = 1;
const MIN_KEPT_FRAC = 0.60;
const SHARPE_FLOOR_FRAC = 0.90;
const LADDER_ROUTE = { asia: 'asia-fib-atlas', monday: 'monday-fib-atlas' };
const LADDER_LABEL = { asia: 'Asia', monday: 'Monday' };

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (resp.ok) return resp;
      if (resp.status === 404) return resp;
      if (i === retries) return resp;
    } catch (e) {
      if (i === retries) return null;
    }
    await new Promise(r => setTimeout(r, 2000 * (i + 1)));
  }
}

async function loadConstituent(routePrefix, pair) {
  const resp = await fetchWithRetry(`${BASE}/api/${routePrefix}/vote-trades/${pair.toUpperCase()}?minMargin=${MIN_MARGIN}`);
  if (!resp || !resp.ok) return null;
  const stored = await resp.json();
  const filtered = stored.trades ?? [];   // route already applied minMargin server-side
  const capped = applyConcurrencyCap(filtered, { maxConcurrent: MAX_CONCURRENT });
  if (!capped?.kept?.length) return null;
  return riskAdjustTrades(capped.kept, RISK_PCT).map(t => ({ ...t }));
}

async function buildConstituents() {
  const perPairTrades = {};
  if (LADDER === 'combined') {
    for (const pair of RANGE_FIB_INSTRUMENTS) {
      for (const ladder of ['asia', 'monday']) {
        const trades = await loadConstituent(LADDER_ROUTE[ladder], pair);
        if (!trades) continue;
        const sym = `${pair.toUpperCase()} (${LADDER_LABEL[ladder]})`;
        perPairTrades[sym] = trades.map(t => ({ ...t, pair: sym }));
      }
    }
  } else {
    const routePrefix = LADDER_ROUTE[LADDER];
    if (!routePrefix) throw new Error(`LADDER must be asia|monday|combined, got "${LADDER}"`);
    for (const pair of RANGE_FIB_INSTRUMENTS) {
      const trades = await loadConstituent(routePrefix, pair);
      if (!trades) continue;
      const sym = pair.toUpperCase();
      perPairTrades[sym] = trades.map(t => ({ ...t, pair: sym }));
    }
  }
  return perPairTrades;
}

function combine(tradesBySym, symSet) {
  const subset = Object.fromEntries([...symSet].map(s => [s, tradesBySym[s]]));
  const weights = Object.fromEntries([...symSet].map(s => [s, 1]));
  const combined = buildPortfolioDailySeries(subset, { weights });
  return portfolioStats(combined.dailyReturns, { mc: false });
}

async function main() {
  console.log(`Fib Atlas OOS pair-selection validation (HTTP re-run) — ladder=${LADDER}  minMargin=${MIN_MARGIN}\n`);
  const perPairTrades = await buildConstituents();
  const allSyms = new Set(Object.keys(perPairTrades));
  console.log(`Loaded ${allSyms.size} constituents with data: ${[...allSyms].join(', ')}\n`);
  const MIN_KEPT = Math.max(2, Math.round(allSyms.size * MIN_KEPT_FRAC));
  if (allSyms.size < MIN_KEPT + 2) { console.error(`Only ${allSyms.size} constituent(s) with data — nothing meaningful to eliminate down to MIN_KEPT=${MIN_KEPT}.`); process.exit(1); }

  const fullCombined = buildPortfolioDailySeries(perPairTrades, { weights: Object.fromEntries([...allSyms].map(s => [s, 1])) });
  const cutoff = fullCombined.dates[Math.floor(fullCombined.dates.length * 0.7)];
  console.log(`Split date: ${cutoff}  (${fullCombined.dates.length} combined trading days)\n`);

  const isTrades = {}, oosTrades = {};
  for (const sym of allSyms) {
    isTrades[sym] = perPairTrades[sym].filter(t => t.date <= cutoff);
    oosTrades[sym] = perPairTrades[sym].filter(t => t.date > cutoff);
  }

  const isFullStats = combine(isTrades, allSyms);
  const sharpeFloor = +(isFullStats.sharpe * SHARPE_FLOOR_FRAC).toFixed(3);
  console.log(`IS baseline (all ${allSyms.size}): Sharpe ${isFullStats.sharpe}  maxDD ${isFullStats.maxDD}%  -- stopping floor: IS Sharpe >= ${sharpeFloor} (${SHARPE_FLOOR_FRAC * 100}% of baseline), min ${MIN_KEPT} kept\n`);

  let current = new Set(allSyms);
  const removedInOrder = [];
  while (current.size > MIN_KEPT) {
    const stats = combine(isTrades, current);
    let worst = null, worstImprovement = -Infinity, worstStats = null;
    for (const sym of current) {
      const without = new Set([...current].filter(s => s !== sym));
      const s = combine(isTrades, without);
      const improvement = s.maxDD - stats.maxDD;
      if (improvement > worstImprovement) { worstImprovement = improvement; worst = sym; worstStats = s; }
    }
    if (worstStats.sharpe < sharpeFloor) {
      console.log(`  stopping: removing ${worst} next would drop IS Sharpe to ${worstStats.sharpe} (< floor ${sharpeFloor})`);
      break;
    }
    current.delete(worst);
    removedInOrder.push(worst);
    console.log(`  removed ${worst.padEnd(20)} (IS maxDD ${stats.maxDD}% -> ${worstStats.maxDD}%, IS Sharpe -> ${worstStats.sharpe})`);
  }
  console.log(`\nIS-chosen exclusion set (${removedInOrder.length} constituents): ${removedInOrder.join(', ')}\n`);

  const isFull = combine(isTrades, allSyms);
  const isReduced = combine(isTrades, current);
  const oosFull = combine(oosTrades, allSyms);
  const oosReduced = combine(oosTrades, current);

  console.log(`IS  (chosen on):  all ${allSyms.size} constituents: Sharpe ${isFull.sharpe} maxDD ${isFull.maxDD}%   ->  reduced (${current.size}): Sharpe ${isReduced.sharpe} maxDD ${isReduced.maxDD}%`);
  console.log(`OOS (unseen):     all ${allSyms.size} constituents: Sharpe ${oosFull.sharpe} maxDD ${oosFull.maxDD}%   ->  reduced (${current.size}): Sharpe ${oosReduced.sharpe} maxDD ${oosReduced.maxDD}%`);

  const oosDDImproved = oosReduced.maxDD > oosFull.maxDD;
  console.log(`\n${oosDDImproved ? 'PASSED' : 'FAILED'}: OOS maxDD ${oosDDImproved ? 'improved' : 'did NOT improve'} (${oosFull.maxDD}% -> ${oosReduced.maxDD}%) using an IS-only-frozen exclusion set.`);
}

main();
