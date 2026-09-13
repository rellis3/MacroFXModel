// FIB_ATLAS_BACKTEST_VS_LIVE.md item #1 ("Charge the broker's REAL spread on
// both legs, not the registry default, per instrument") -- the doc's own
// #1-ranked, never-yet-tested hypothesis for why live wins 39.6% against an
// 85.7% backtest. js/perLineStrategy.js's PAIR_COST_PCT is a hand-guessed
// table; /api/level-atlas/spread-check measures REAL per-pair spread from
// 2500 OANDA H1 bid/ask candles. This re-scores the real production trade
// list with the MEASURED spread as round-trip cost instead of the guess,
// leaving every other mechanic (fills at the rung, barrier resolution
// order) untouched -- isolating exactly how much of the gap this one
// correction closes, same "one variable at a time" discipline as the
// heat-cap/holdsOOS/clustering/same-bar checks already run this session.
//
// Round-trip cost convention: buy at ask (mid+half-spread), sell at bid
// (mid-half-spread) -> total cost = ONE full spread, paid once (matches
// PAIR_COST_PCT's own framing as "ROUND-TRIP cost", not per-leg).
import { applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries,
  applyCostEfficiencyFilter, applyGapFilter, applyFadeStopFraction, applyStoredContinuationExit } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { costForPair } from '../js/perLineStrategy.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';

const BASE = process.env.BASE || 'https://macrofxmodel-production.up.railway.app';
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurgbp', 'euraud', 'eurcad', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'];
const LADDERS = ['asia', 'monday'];
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

function runPipeline(trades, cost) {
  const swapped = applyStoredContinuationExit(trades, CONFIG.continuationExit);
  const marginFiltered = swapped.filter(t => t.margin >= CONFIG.minMargin);
  const costFiltered = applyCostEfficiencyFilter(marginFiltered, cost, CONFIG.minCostRatio);
  const gapFiltered = applyGapFilter(costFiltered, CONFIG.maxGapMin);
  const capped = applyConcurrencyCap(gapFiltered, { maxConcurrent: 1, perDirection: true });
  const tightened = applyFadeStopFraction(capped?.kept ?? [], CONFIG.stopTightenFrac, 0, { preserveSizing: true });
  return tightened;
}

async function main() {
  console.log('Fetching real measured spreads (OANDA, 2500 H1 candles)...');
  const spreadResp = await fetchWithRetry(`${BASE}/api/level-atlas/spread-check?instruments=${PAIRS.join(',')}&count=2500&granularity=H1`);
  const spreadData = spreadResp && spreadResp.ok ? await spreadResp.json() : null;
  if (!spreadData?.ok) { console.log('FAILED to fetch real spreads:', spreadResp?.status); return; }

  console.log('\npair\tguessedCostPct\trealSpreadPips\trealCostPct(median)\tratio(real/guessed)');
  const realCostPct = {};
  for (const pair of PAIRS) {
    const ac = assetClassFor(pair);
    const guessed = costForPair(pair, ac);
    const s = spreadData.spreads[pair];
    if (!s) { console.log(`${pair}\t${guessed}\tNO DATA`); continue; }
    // Convert measured spread (pips) -> round-trip cost (% of price) using
    // this pair's typical recent price level, read from the trades below --
    // placeholder computed per-trade instead (more accurate, uses the
    // trade's own actual price), this table is diagnostic only.
    console.log(`${pair}\t${guessed}\t${s.medianPips}\t—\t—`);
  }

  console.log('\nRe-scoring real production trades with MEASURED spread as cost (all else unchanged)...');
  const combinedRaw = [], combinedCorrected = [];
  const perPairSummary = [];
  for (const pair of PAIRS) {
    const s = spreadData.spreads[pair];
    let pooledRaw = [], pooledCorrected = [];
    for (const ladder of LADDERS) {
      const routePrefix = ladder === 'asia' ? 'asia-fib-atlas' : 'monday-fib-atlas';
      const resp = await fetchWithRetry(`${BASE}/api/${routePrefix}/vote-trades/${pair.toUpperCase()}?minMargin=1`);
      if (!resp || !resp.ok) continue;
      const j = await resp.json();
      const guessedCost = j.cost;
      const filtered = runPipeline(j.trades ?? [], guessedCost);
      for (const t of filtered) {
        pooledRaw.push({ ...t, pair, ladder });
        if (s && t.pip && t.entry > 0) {
          // Real round-trip cost for THIS trade's own price level.
          const realCost = s.medianPips * t.pip / t.entry * 100;
          const correctedPct = +((t.pnlPct + guessedCost - realCost)).toFixed(4);
          pooledCorrected.push({ ...t, pair, ladder, pnlPct: correctedPct });
        } else {
          pooledCorrected.push({ ...t, pair, ladder });
        }
      }
    }
    combinedRaw.push(...pooledRaw);
    combinedCorrected.push(...pooledCorrected);
    const rawWins = pooledRaw.filter(t => t.pnlPct > 0).length;
    const corrWins = pooledCorrected.filter(t => t.pnlPct > 0).length;
    perPairSummary.push({ pair, n: pooledRaw.length,
      rawWinRate: pooledRaw.length ? +(100 * rawWins / pooledRaw.length).toFixed(1) : null,
      corrWinRate: pooledCorrected.length ? +(100 * corrWins / pooledCorrected.length).toFixed(1) : null });
  }

  console.log('\npair\tn\trawWinRate%\tcorrectedWinRate%(realSpread)');
  for (const r of perPairSummary) console.log(`${r.pair.toUpperCase()}\t${r.n}\t${r.rawWinRate}\t${r.corrWinRate}`);

  function portfolioStatsFor(trades) {
    const riskAdj = riskAdjustTrades(trades, 0.5);
    const byPair = {};
    for (const t of riskAdj) (byPair[t.pair] ??= []).push(t);
    const weights = Object.fromEntries(Object.keys(byPair).map(p => [p, 1 / Object.keys(byPair).length]));
    const combined = buildPortfolioDailySeries(byPair, { weights });
    return portfolioStats(combined.dailyReturns, { mc: false });
  }

  const rawStats = portfolioStatsFor(combinedRaw);
  const corrStats = portfolioStatsFor(combinedCorrected);
  const rawWins = combinedRaw.filter(t => t.pnlPct > 0).length;
  const corrWins = combinedCorrected.filter(t => t.pnlPct > 0).length;

  console.log('\n=== PORTFOLIO COMPARISON: guessed flat cost vs real measured spread ===');
  console.log(`n trades: ${combinedRaw.length}`);
  console.log(`Win rate:  raw=${(100*rawWins/combinedRaw.length).toFixed(1)}%  corrected=${(100*corrWins/combinedCorrected.length).toFixed(1)}%`);
  console.log(`Sharpe:    raw=${rawStats.sharpe}  corrected=${corrStats.sharpe}`);
  console.log(`PF:        raw=${rawStats.profitFactor}  corrected=${corrStats.profitFactor}`);
  console.log(`CAGR%:     raw=${rawStats.cagr}  corrected=${corrStats.cagr}`);
  console.log(`maxDD%:    raw=${rawStats.maxDD}  corrected=${corrStats.maxDD}`);
}

main();
