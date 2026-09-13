// Cross-ladder same-pair de-duplication check for the "Both (combined)"
// vote portfolio (2026-09-12) — direct follow-up to
// fib_atlas_cross_ladder_duplicate_check.mjs's finding (every one of 16
// pairs shows 2-13% of win PnL coming from Asia+Monday both riding the same
// real move, same direction, both counted as separate wins).
//
// Reuses the REAL production function (js/fibAtlasVotePortfolio.js's
// buildFibAtlasVotePortfolio) UNCHANGED, not a re-implementation — the only
// difference between the two runs below is what `loadPairVoteTrades`
// returns per pair:
//   (A) "as shipped": Asia and Monday trades kept as two SEPARATE
//       constituents ("EURUSD (Asia)"/"EURUSD (Monday)") — matches
//       /vote-portfolio-combined's actual current behaviour exactly.
//   (B) "deduped": Asia and Monday trades POOLED into ONE stream per pair
//       BEFORE buildFibAtlasVotePortfolio's own applyConcurrencyCap runs —
//       so a same-direction overlap between the two ladders is now caught
//       by the SAME hedge-only concurrency logic that already blocks
//       same-direction stacking WITHIN one ladder. No new concurrency
//       mechanism, just feeding it pooled data instead of pre-split data.
//
// Everything else matches the "Load best config" screenshot exactly:
// margin>=2, max concurrent 1 (per-direction/hedge-only), 0.5% fixed risk,
// fade-stop tightening 0.9x, cost-efficiency filter >=3x, whiplash gap
// filter on (maxGapMin=30, Asia's own frozen choice, reused for combined
// mode same as production does), chandelier continuation exit, currently-
// shipped Asia pair exclusion (10 pairs) -- i.e. the SAME 16 pairs checked
// in the screenshot. Heat cap and drawdown throttle stay OFF, matching
// shipped "best config".
import { buildFibAtlasVotePortfolio } from '../js/fibAtlasVotePortfolio.js';

const BASE = process.env.BASE || 'https://macrofxmodel-production.up.railway.app';
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurgbp', 'euraud', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'];
const BEST_CONFIG = {
  minMargin: 2, maxConcurrent: 1, perDirection: true,
  weighting: 'equal', sizing: 'fixed-risk', riskPct: 0.5,
  maxHeatPct: null, throttleOn: false,
  stopTightenFrac: 0.9, minCostRatio: 3, maxGapMin: 30, continuationExit: 'chandelier',
};

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

async function fetchLadderRaw(pair, ladder) {
  const routePrefix = ladder === 'asia' ? 'asia-fib-atlas' : 'monday-fib-atlas';
  // Raw stored blob (minMargin=1, no other filters) — buildFibAtlasVotePortfolio
  // does its OWN margin/cost/gap filtering internally, so this must hand it
  // the unfiltered superset, same as getJSON would.
  const resp = await fetchWithRetry(`${BASE}/api/${routePrefix}/vote-trades/${pair.toUpperCase()}?minMargin=1`);
  if (!resp || !resp.ok) return null;
  return resp.json();
}

const rawCache = new Map();
async function primeCache() {
  await Promise.all(PAIRS.flatMap(pair => ['asia', 'monday'].map(async ladder => {
    rawCache.set(`${pair}|${ladder}`, await fetchLadderRaw(pair, ladder));
  })));
}

// (A) as-shipped loader: separate constituents, exactly matching
// /vote-portfolio-combined's own cachedLoader.
async function loaderAsShipped(constituentKey) {
  const [pair, ladder] = constituentKey.split('|');
  const stored = rawCache.get(constituentKey);
  if (!stored) return null;
  const label = ladder === 'asia' ? 'Asia' : 'Monday';
  return { ...stored, groupKey: `${stored.instrument} (${label})`, ladder };
}

// (B) deduped loader: ONE call per pair, pools both ladders' trades into a
// single array (sorted by time) with no groupKey override, so
// buildFibAtlasVotePortfolio treats it as ONE constituent and applies its
// existing hedge-only concurrency cap across the pooled stream.
async function loaderDeduped(pair) {
  const asia = rawCache.get(`${pair}|asia`);
  const monday = rawCache.get(`${pair}|monday`);
  if (!asia && !monday) return null;
  const trades = [...(asia?.trades ?? []), ...(monday?.trades ?? [])].sort((a, b) => a.time - b.time);
  const cost = asia?.cost ?? monday?.cost;
  return { instrument: pair.toUpperCase(), trades, cost };
}

async function main() {
  console.log('Priming cache (fetching Asia+Monday raw vote-trades for 16 pairs)...');
  await primeCache();

  console.log('\nBuilding (A) AS SHIPPED — Asia+Monday as separate constituents...');
  const constituentKeys = PAIRS.flatMap(pair => ['asia', 'monday'].map(l => `${pair}|${l}`));
  const asShipped = await buildFibAtlasVotePortfolio({ ...BEST_CONFIG, pairs: constituentKeys, loadPairVoteTrades: loaderAsShipped });

  console.log('Building (B) DEDUPED — Asia+Monday pooled per pair before concurrency cap...');
  const deduped = await buildFibAtlasVotePortfolio({ ...BEST_CONFIG, pairs: PAIRS, loadPairVoteTrades: loaderDeduped });

  function printBuild(label, r) {
    if (r.error) { console.error(`${label} build failed:`, r.error, r.missing); return; }
    const s = r.stats;
    console.log(`\n=== ${label} ===`);
    console.log(`  trades kept: ${r.trades.length}`);
    console.log(`  Sharpe (naive): ${s.sharpe}   Sharpe (Newey-West HAC): ${s.sharpeHAC?.toFixed?.(2) ?? s.sharpeHAC}`);
    console.log(`  win rate (days): ${s.winRate}%`);
    console.log(`  maxDD (additive): ${s.maxDDNonCompounded}%   CAGR (additive): ${s.cagrNonCompounded}%   Calmar: ${s.calmarNonCompounded}`);
    console.log(`  profitFactor: ${s.profitFactor}   skew: ${s.skew}   VaR95: ${s.var95}%   CVaR95: ${s.cvar95}%`);
  }
  printBuild('AS SHIPPED (matches the screenshot)', asShipped);
  printBuild('DEDUPED (cross-ladder same-pair overlap blocked)', deduped);
  if (!asShipped.error && !deduped.error) {
    console.log(`\n=== DELTA ===`);
    console.log(`  trades: ${asShipped.trades.length} -> ${deduped.trades.length} (${deduped.trades.length - asShipped.trades.length})`);
    console.log(`  Sharpe (naive): ${asShipped.stats.sharpe} -> ${deduped.stats.sharpe}`);
    console.log(`  Sharpe (HAC): ${asShipped.stats.sharpeHAC} -> ${deduped.stats.sharpeHAC}`);
    console.log(`  maxDD: ${asShipped.stats.maxDDNonCompounded}% -> ${deduped.stats.maxDDNonCompounded}%`);
  }
}

main();
