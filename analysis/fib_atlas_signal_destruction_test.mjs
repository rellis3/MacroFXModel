// "Destroy the signal" test (owner-requested, external review's test #3) --
// the single most decisive falsification check for the suspiciously clean
// combined-portfolio numbers (Sharpe 15-18, win rate 85-97%, PF 100-210).
//
// Method: take the REAL trades (real dates, real pairs, real gapMin, real
// margin/decision context -- everything the gap filter/cost filter/
// concurrency cap actually gate on), then SHUFFLE the win/pnlPct pairing
// across all trades (breaking the link between a trade's own real context
// and its own real outcome, while preserving the overall distribution of
// outcomes that exist in the data). Run the IDENTICAL production portfolio
// pipeline (buildFibAtlasVotePortfolio, unmodified) on both the real and
// shuffled trade sets, same "best config" levers throughout.
//
// If the shuffled version STILL produces a great Sharpe via the same gap
// filter + chandelier + stop-tighten stack, that proves the machinery is
// manufacturing the edge through selection effects (e.g. gap filter
// concentrating into low-volatility periods that would look good under
// ANY random outcome) rather than genuine predictive signal. If it
// collapses to ~0, the real win/loss outcomes are what's doing the work,
// and the filter is genuinely selecting predictive touches.
//
// Repeats the shuffle N times (default 50) to report a distribution, not
// one lucky/unlucky draw.
import { applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries,
  applyCostEfficiencyFilter, applyGapFilter, applyFadeStopFraction, applyStoredContinuationExit } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';

const BASE = process.env.BASE || 'https://macrofxmodel-production.up.railway.app';
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurgbp', 'euraud', 'eurcad', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'];
const LADDERS = ['asia', 'monday'];
const N_SHUFFLES = Number(process.env.N_SHUFFLES || 50);
const CONFIG = { minMargin: 2, minCostRatio: 3, maxGapMin: 30, continuationExit: 'chandelier', stopTightenFrac: 0.9 };

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

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Applies the SAME production pipeline (cost-efficiency -> gap filter ->
// concurrency cap -> fade-stop -> chandelier-swap ALREADY baked into
// stored trades) to one pair's raw trade list. Mirrors
// buildFibAtlasVotePortfolio's own per-constituent steps exactly (see that
// file's own order), just inlined so the shuffle can be injected between
// "real outcome" and "real context" cleanly.
function runPipeline(trades, cost) {
  const swapped = applyStoredContinuationExit(trades, CONFIG.continuationExit);
  const marginFiltered = swapped.filter(t => t.margin >= CONFIG.minMargin);
  const costFiltered = applyCostEfficiencyFilter(marginFiltered, cost, CONFIG.minCostRatio);
  const gapFiltered = applyGapFilter(costFiltered, CONFIG.maxGapMin);
  const capped = applyConcurrencyCap(gapFiltered, { maxConcurrent: 1, perDirection: false });
  const tightened = applyFadeStopFraction(capped?.kept ?? [], CONFIG.stopTightenFrac, 0, { preserveSizing: true });
  return tightened;
}

function portfolioStatsFor(byPair) {
  const riskAdj = {};
  for (const sym of Object.keys(byPair)) riskAdj[sym] = riskAdjustTrades(byPair[sym], 0.5).map(t => ({ ...t, pair: sym }));
  const weights = Object.fromEntries(Object.keys(riskAdj).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(riskAdj, { weights });
  const ps = portfolioStats(combined.dailyReturns, { mc: false });
  const all = Object.values(riskAdj).flat();
  const winRate = all.length ? +(100 * all.filter(t => t.win).length / all.length).toFixed(1) : null;
  return { trades: all.length, sharpe: ps.sharpe, maxDD: ps.maxDD, winRate };
}

async function main() {
  console.log(`Fetching raw trades for ${PAIRS.length} pairs x ${LADDERS.length} ladders...`);
  const raw = {};   // sym -> { trades: [...], cost }
  await Promise.all(PAIRS.flatMap(pair => LADDERS.map(async ladder => {
    const routePrefix = ladder === 'asia' ? 'asia-fib-atlas' : 'monday-fib-atlas';
    const resp = await fetchWithRetry(`${BASE}/api/${routePrefix}/vote-trades/${pair.toUpperCase()}?minMargin=1`);
    if (!resp || !resp.ok) return;
    const j = await resp.json();
    const label = ladder === 'asia' ? 'Asia' : 'Monday';
    raw[`${j.instrument} (${label})`] = { trades: j.trades ?? [], cost: j.cost };
  })));

  // ── REAL run (as-shipped pipeline, real context+outcome pairing) ──
  const realByPair = {};
  for (const sym of Object.keys(raw)) realByPair[sym] = runPipeline(raw[sym].trades, raw[sym].cost);
  const realStats = portfolioStatsFor(realByPair);
  console.log(`\nREAL (actual outcomes): trades=${realStats.trades}  Sharpe=${realStats.sharpe}  maxDD=${realStats.maxDD}%  winRate=${realStats.winRate}%`);

  // ── SHUFFLED runs: reassign (win, pnlPct) across ALL trades in the pool
  // (pre-filter, i.e. at margin>=1, so the shuffle pool matches what the
  // filters will actually select from), keeping every other field (date,
  // time, gapMin, margin, decision, targetPips, stopPips, pair identity)
  // exactly as it really was. This breaks "does THIS specific context
  // predict THIS specific outcome" while preserving the real distribution
  // of outcomes and the real distribution of contexts the filters gate on.
  const allTradesFlat = [];
  const membership = [];   // parallel array: which sym each trade belongs to
  for (const sym of Object.keys(raw)) {
    for (const t of raw[sym].trades) { allTradesFlat.push(t); membership.push(sym); }
  }
  // The WHOLE outcome-dependent bundle must move together as one donor, or
  // the later chandelier continuation-exit swap (applyStoredContinuationExit)
  // would mix a shuffled base outcome with the ORIGINAL trade's own real
  // trailed fields -- an inconsistent hybrid, not a clean "context vs
  // outcome" break.
  // mfePips/maePips must move too -- applyFadeStopFraction reprices a fade
  // trade off ITS OWN maePips against a tighter stop; leaving the real
  // (unshuffled) maePips in place would leak real outcome information back
  // in for every fade trade, undermining the whole point of the shuffle.
  const outcomeFields = ['win', 'pnlPct', 'pnlPips', 'resolveTime', 'realResolveTime',
    'mfePips', 'maePips', 'mfePct', 'maePct',
    'chandTrailedPnlPct', 'chandTrailedPnlPips', 'chandTrailedResolveTime',
    'trailedPnlPct', 'trailedPnlPips', 'trailedResolveTime', 'timedOut'];
  const results = [];
  for (let run = 0; run < N_SHUFFLES; run++) {
    const rng = mulberry32(0xC0FFEE + run * 7919);
    const shuffledOutcomeIdx = shuffle([...allTradesFlat.keys()], rng);
    const shuffledTrades = allTradesFlat.map((t, i) => {
      const donor = allTradesFlat[shuffledOutcomeIdx[i]];
      const out = { ...t };
      for (const f of outcomeFields) out[f] = donor[f];
      return out;
    });
    const byPair = {};
    for (const sym of Object.keys(raw)) byPair[sym] = [];
    shuffledTrades.forEach((t, i) => byPair[membership[i]].push(t));
    const filteredByPair = {};
    for (const sym of Object.keys(raw)) filteredByPair[sym] = runPipeline(byPair[sym], raw[sym].cost);
    results.push(portfolioStatsFor(filteredByPair));
    if ((run + 1) % 10 === 0) console.log(`  ...${run + 1}/${N_SHUFFLES} shuffles done`);
  }

  const sharpes = results.map(r => r.sharpe).filter(s => s != null).sort((a, b) => a - b);
  const winRates = results.map(r => r.winRate).filter(w => w != null).sort((a, b) => a - b);
  const pctile = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
  console.log(`\n=== SHUFFLED (${N_SHUFFLES} runs, outcome-context link broken) ===`);
  console.log(`Sharpe:  median=${pctile(sharpes, 0.5).toFixed(2)}  p5=${pctile(sharpes, 0.05).toFixed(2)}  p95=${pctile(sharpes, 0.95).toFixed(2)}  min=${sharpes[0].toFixed(2)}  max=${sharpes[sharpes.length - 1].toFixed(2)}`);
  console.log(`WinRate: median=${pctile(winRates, 0.5).toFixed(1)}%  p5=${pctile(winRates, 0.05).toFixed(1)}%  p95=${pctile(winRates, 0.95).toFixed(1)}%`);
  console.log(`\nREAL Sharpe ${realStats.sharpe} vs SHUFFLED median ${pctile(sharpes, 0.5).toFixed(2)} (range ${sharpes[0].toFixed(2)} to ${sharpes[sharpes.length - 1].toFixed(2)})`);
  const realBeatsShuffle = results.filter(r => r.sharpe >= realStats.sharpe).length;
  console.log(`Shuffled runs matching or beating the REAL Sharpe: ${realBeatsShuffle}/${N_SHUFFLES}`);
}

main();
