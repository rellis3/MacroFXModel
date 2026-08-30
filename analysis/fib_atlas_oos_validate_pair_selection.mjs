// Stage 2 of the Fib Atlas pair-selection study — the OOS-validation half
// analysis/fib_atlas_leave_one_out.mjs's own header explicitly deferred
// ("Print-only, no button/UI wiring here — this is stage 1"). SAME method
// as Level Atlas's own stage 2 (scripts/oos_validate_pair_selection.mjs,
// the source of level-atlas-vote-portfolio.html's "Select recommended"
// button): split the combined portfolio 70/30 chronologically, run greedy
// forward-elimination (remove the single biggest maxDD contributor, re-rank,
// repeat) on the IS slice ONLY, freeze whatever set that lands on, then
// check whether it — UNCHANGED — actually improves the OOS slice's own
// maxDD too. If it only helps IS, it's noise, not a real finding.
//
// One deliberate improvement over the Level Atlas reference script: that
// one's stopping point (STOP_AT_N=17) was picked by eyeballing the
// FULL-SAMPLE elimination curve before the IS/OOS split was even applied —
// a soft spot an independent audit of that button flagged (the count had
// indirect exposure to the eventual OOS window). Here the stopping point is
// instead a PRE-STATED RULE evaluated purely on the IS slice: keep removing
// while IS Sharpe stays >= 90% of the full-set IS Sharpe, down to a floor of
// MIN_KEPT constituents (don't prune to a near-empty book). No full-sample
// or OOS data is consulted to decide when to stop.
//
//   LADDER=asia    node analysis/fib_atlas_oos_validate_pair_selection.mjs
//   LADDER=monday  node analysis/fib_atlas_oos_validate_pair_selection.mjs
//   LADDER=combined node analysis/fib_atlas_oos_validate_pair_selection.mjs
import { getJSON } from '../js/r2Store.js';
import { applyConcurrencyCap, buildPortfolioDailySeries, riskAdjustTrades } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { RANGE_FIB_INSTRUMENTS } from '../js/rangeFibEngine.js';

const LADDER = (process.env.LADDER || 'asia').toLowerCase(); // 'asia' | 'monday' | 'combined'
const MIN_MARGIN = Number(process.env.MIN_MARGIN || 2), MAX_CONCURRENT = 1, RISK_PCT = 1;
// MIN_KEPT as a FRACTION of the starting universe, not a fixed count — a
// first run at a hardcoded floor of 8 hit that floor in every ladder mode
// (Sharpe never actually dropped below the 90% rule even at 8 remaining),
// meaning the floor — not the pre-stated Sharpe rule — was doing the real
// stopping, concentrating into as few as 8 of 26 (31%) or 8 of 52 (15%)
// constituents. That is exactly the checklist-D "curve that never peaks"
// red flag: leave-one-out-on-maxDD mechanically keeps looking better as a
// portfolio concentrates into fewer, larger idiosyncratic bets, which is a
// SEPARATE effect from genuine correlated-risk removal and isn't safe to
// extrapolate from a few years of backtest. Floor raised to keep at least
// 60% of the starting universe — proportionate to Level Atlas's own shipped
// retention (17/27 = 63%) — chosen BEFORE re-running, not fit to whatever
// number happened to look best OOS.
const MIN_KEPT_FRAC = 0.60;
const SHARPE_FLOOR_FRAC = 0.90; // pre-stated rule: keep removing while IS Sharpe >= 90% of full-set IS Sharpe
const LADDER_PREFIX = { asia: 'asia-fib-atlas', monday: 'monday-fib-atlas' };
const LADDER_LABEL = { asia: 'Asia', monday: 'Monday' };

async function loadConstituent(prefix, pair) {
  const stored = await getJSON(`${prefix}/${pair}-votetrades.json`);
  if (!stored) return null;
  const filtered = stored.trades.filter(t => t.margin >= MIN_MARGIN);
  const capped = applyConcurrencyCap(filtered, { maxConcurrent: MAX_CONCURRENT });
  if (!capped?.kept?.length) return null;
  return riskAdjustTrades(capped.kept, RISK_PCT).map(t => ({ ...t }));
}

async function buildConstituents() {
  const perPairTrades = {};
  if (LADDER === 'combined') {
    for (const pair of RANGE_FIB_INSTRUMENTS) {
      for (const ladder of ['asia', 'monday']) {
        const trades = await loadConstituent(LADDER_PREFIX[ladder], pair);
        if (!trades) continue;
        const sym = `${pair.toUpperCase()} (${LADDER_LABEL[ladder]})`;
        perPairTrades[sym] = trades.map(t => ({ ...t, pair: sym }));
      }
    }
  } else {
    const prefix = LADDER_PREFIX[LADDER];
    if (!prefix) throw new Error(`LADDER must be asia|monday|combined, got "${LADDER}"`);
    for (const pair of RANGE_FIB_INSTRUMENTS) {
      const trades = await loadConstituent(prefix, pair);
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
  console.log(`Fib Atlas OOS pair-selection validation — ladder=${LADDER}  minMargin=${MIN_MARGIN}\n`);
  const perPairTrades = await buildConstituents();
  const allSyms = new Set(Object.keys(perPairTrades));
  const MIN_KEPT = Math.max(2, Math.round(allSyms.size * MIN_KEPT_FRAC));
  if (allSyms.size < MIN_KEPT + 2) { console.error(`Only ${allSyms.size} constituent(s) with data — nothing meaningful to eliminate down to MIN_KEPT=${MIN_KEPT}.`); process.exit(1); }

  // 70/30 split by the FULL combined portfolio's own date index (all
  // constituents equal-weighted) — same convention as Level Atlas's script.
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

  // Greedy elimination on IS ONLY, stopped by the pre-stated rule above.
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

  const oosDDImproved = oosReduced.maxDD > oosFull.maxDD; // less negative = shallower
  console.log(`\n${oosDDImproved ? 'PASSED' : 'FAILED'}: OOS maxDD ${oosDDImproved ? 'improved' : 'did NOT improve'} (${oosFull.maxDD}% -> ${oosReduced.maxDD}%) using an IS-only-frozen exclusion set.`);
}

main();
