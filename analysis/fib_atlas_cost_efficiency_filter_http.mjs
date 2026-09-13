// HTTP-only re-run of fib_atlas_cost_efficiency_filter.mjs (2026-09-12) —
// same adaptation pattern as fib_atlas_oos_validate_pair_selection_http.mjs.
// Uses the CURRENTLY-SHIPPED Asia exclusion set (unchanged from the
// original script) so this checks "does THIS lever still hold under the
// same pair set it was validated under" in isolation from the separate
// pair-selection re-validation.
//
//   LADDER=asia node analysis/fib_atlas_cost_efficiency_filter_http.mjs
import { applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { RANGE_FIB_INSTRUMENTS } from '../js/rangeFibEngine.js';

const BASE = process.env.BASE || 'https://macrofxmodel-production.up.railway.app';
const LADDER = (process.env.LADDER || 'asia').toLowerCase();
const MIN_MARGIN = 2, MAX_CONCURRENT = 1, RISK_PCT = 1;
const LADDER_ROUTE = { asia: 'asia-fib-atlas', monday: 'monday-fib-atlas' };
const COST_RATIOS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
const ASIA_EXCLUDE = new Set(['gbpcad', 'gbpchf', 'eurcad', 'gbpnzd', 'eurchf', 'audchf', 'chfjpy', 'eurnzd', 'gbpjpy', 'eurjpy']);

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (resp.ok || resp.status === 404) return resp;
      if (i === retries) return resp;
    } catch (e) { if (i === retries) return null; }
    await new Promise(r => setTimeout(r, 2000 * (i + 1)));
  }
}

async function loadAll() {
  const routePrefix = LADDER_ROUTE[LADDER];
  const byPair = {};
  for (const pair of RANGE_FIB_INSTRUMENTS) {
    if (LADDER === 'asia' && ASIA_EXCLUDE.has(pair)) continue;
    const resp = await fetchWithRetry(`${BASE}/api/${routePrefix}/vote-trades/${pair.toUpperCase()}?minMargin=${MIN_MARGIN}`);
    if (!resp || !resp.ok) continue;
    const s = await resp.json();
    const filtered = s.trades ?? [];
    if (!filtered.length) continue;
    byPair[pair.toUpperCase()] = filtered.map(t => ({
      ...t, pair: pair.toUpperCase(), costPct: s.cost,
      targetPnlPct: t.targetPips * t.pip / t.entry * 100,
    }));
  }
  return byPair;
}

function statsFor(byPairFiltered) {
  const capped = {};
  for (const sym of Object.keys(byPairFiltered)) {
    const c = applyConcurrencyCap(byPairFiltered[sym], { maxConcurrent: MAX_CONCURRENT });
    if (c?.kept?.length) capped[sym] = riskAdjustTrades(c.kept, RISK_PCT).map(t => ({ ...t, pair: sym }));
  }
  const weights = Object.fromEntries(Object.keys(capped).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(capped, { weights });
  const ps = portfolioStats(combined.dailyReturns, { mc: false });
  const all = Object.values(capped).flat();
  const wins = all.filter(t => t.win), losses = all.filter(t => !t.win);
  const avgWin = wins.length ? wins.reduce((a, t) => a + t.pnlPct, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((a, t) => a + t.pnlPct, 0) / losses.length : 0;
  return { trades: all.length, sharpe: ps.sharpe, maxDD: ps.maxDD, cagr: ps.cagr, avgWin: +avgWin.toFixed(4), avgLoss: +avgLoss.toFixed(4), ratio: avgLoss ? +(avgWin / -avgLoss).toFixed(2) : null };
}

function printRow(label, s) {
  console.log([label.padEnd(12), String(s.trades).padStart(7), String(s.sharpe).padStart(7), (s.maxDD + '%').padStart(8), (s.cagr + '%').padStart(9), (s.avgWin + '%').padStart(9), (s.avgLoss + '%').padStart(9), String(s.ratio).padStart(6)].join('  '));
}
function header() {
  console.log(['ratio>='.padEnd(12), 'trades'.padStart(7), 'sharpe'.padStart(7), 'maxDD'.padStart(8), 'CAGR'.padStart(9), 'avgWin'.padStart(9), 'avgLoss'.padStart(9), 'W:L'.padStart(6)].join('  '));
}

async function main() {
  console.log(`Fib Atlas cost-efficiency filter (HTTP re-run) — ladder=${LADDER}  minMargin=${MIN_MARGIN}\n`);
  const byPair = await loadAll();
  const allSyms = Object.keys(byPair);
  const allTrades = Object.values(byPair).flat().sort((a, b) => a.time - b.time);
  const uniqueDates = [...new Set(allTrades.map(t => t.date))].sort();
  const cutoff = uniqueDates[Math.floor(uniqueDates.length * 0.7)];
  console.log(`${allTrades.length} trades across ${allSyms.length} pairs. IS/OOS split: ${cutoff}\n`);

  console.log('──── IN-SAMPLE (fit) ────');
  header();
  const isRows = [];
  for (const r of COST_RATIOS) {
    const filtered = {};
    for (const sym of allSyms) filtered[sym] = byPair[sym].filter(t => t.date <= cutoff && (t.targetPnlPct / t.costPct) >= r);
    const s = statsFor(filtered);
    isRows.push({ r, ...s });
    printRow(`>=${r}x`, s);
  }
  const chosen = isRows.slice().sort((a, b) => b.sharpe - a.sharpe)[0];
  console.log(`\nChosen (pre-stated rule: maximize IS Sharpe): cost-ratio >= ${chosen.r}x (IS Sharpe ${chosen.sharpe})\n`);

  console.log('──── OUT-OF-SAMPLE (frozen from IS, applied unchanged) ────');
  header();
  const oosBaseline = {}; for (const sym of allSyms) oosBaseline[sym] = byPair[sym].filter(t => t.date > cutoff);
  printRow('baseline', statsFor(oosBaseline));
  const oosChosen = {}; for (const sym of allSyms) oosChosen[sym] = byPair[sym].filter(t => t.date > cutoff && (t.targetPnlPct / t.costPct) >= chosen.r);
  printRow(`>=${chosen.r}x`, statsFor(oosChosen));
  console.log('\n(full OOS grid, for context:)');
  for (const r of COST_RATIOS) {
    const filtered = {};
    for (const sym of allSyms) filtered[sym] = byPair[sym].filter(t => t.date > cutoff && (t.targetPnlPct / t.costPct) >= r);
    printRow(`>=${r}x`, statsFor(filtered));
  }
}

main();
