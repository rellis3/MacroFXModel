// Quantifies whether Fib Atlas's huge per-pair Sharpe/t-stats (9-20 Sharpe,
// t-stats of 20-45 on tens of thousands of "trades") are inflated by
// pseudo-replication: multiple rungs on the SAME ladder side can all get
// touched (and separately counted as independent trades) during ONE real
// underlying session move, and a single rung can re-arm and re-touch
// multiple times within the same session. Neither is a bug in the strategy
// mechanics -- both are real, tradeable setups -- but if the backtest
// stats (mean/stdev/t-stat/Sharpe) treat each as an INDEPENDENT draw, the
// true effective sample size is much smaller than the nominal trade count,
// which mechanically manufactures large t-stats and (via daily bucketing)
// smoother daily returns than a real trader would experience.
//
// STRICTLY READ-ONLY: fetches already-computed vote-trades over HTTP, runs
// the SAME production filter pipeline already used elsewhere this session
// (fib_atlas_pair_by_pair_oos.mjs's runPipeline), then just counts/groups.
// No engine/route file touched.
import { applyConcurrencyCap, riskAdjustTrades, applyCostEfficiencyFilter,
  applyGapFilter, applyFadeStopFraction, applyStoredContinuationExit } from '../js/levelAtlasVoteReview.js';

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
  const capped = applyConcurrencyCap(gapFiltered, { maxConcurrent: 1, perDirection: false });
  const tightened = applyFadeStopFraction(capped?.kept ?? [], CONFIG.stopTightenFrac, 0, { preserveSizing: true });
  return tightened;
}

function tStat(xs) {
  const n = xs.length; if (!n) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  const se = Math.sqrt(variance / n);
  return { n, mean, t: se > 0 ? mean / se : null };
}

async function main() {
  console.log(`Fetching + filtering trades for ${PAIRS.length} pairs x ${LADDERS.length} ladders...\n`);
  console.log(['pair', 'nominalTrades', 'sessionEvents(pair+date+side)', 'avgTradesPerEvent', 'maxTradesInOneEvent',
    'nominal_t', 'oneperEvent_t(firstOnly)'].join('\t'));

  let totalNominal = 0, totalEvents = 0;
  const allNominalPnl = [], allFirstOnlyPnl = [];

  for (const pair of PAIRS) {
    let pooled = [];
    for (const ladder of LADDERS) {
      const routePrefix = ladder === 'asia' ? 'asia-fib-atlas' : 'monday-fib-atlas';
      const resp = await fetchWithRetry(`${BASE}/api/${routePrefix}/vote-trades/${pair.toUpperCase()}?minMargin=1`);
      if (!resp || !resp.ok) continue;
      const j = await resp.json();
      const filtered = runPipeline(j.trades ?? [], j.cost);
      pooled.push(...filtered.map(t => ({ ...t, ladder })));
    }
    pooled.sort((a, b) => a.time - b.time);
    if (!pooled.length) { console.log(`${pair.toUpperCase()}\t(no trades)`); continue; }

    // Group by (date, side, ladder) -- one "session event" = one real
    // underlying session's directional move on one ladder. Multiple trades
    // in the same group = multiple rungs and/or re-arms of that SAME move.
    const groups = new Map();
    for (const t of pooled) {
      const key = `${t.date}|${t.side ?? t.direction ?? '?'}|${t.ladder}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    const groupArr = [...groups.values()];
    const nominalTrades = pooled.length;
    const sessionEvents = groupArr.length;
    const avgPerEvent = nominalTrades / sessionEvents;
    const maxPerEvent = Math.max(...groupArr.map(g => g.length));

    const nominalPnl = pooled.map(t => t.pnlPct);
    // "First only" = keep just ONE trade per session-event (the first
    // chronologically) -- collapses re-arm/multi-rung clustering down to
    // one independent bet per real underlying move.
    const firstOnlyPnl = groupArr.map(g => g.sort((a, b) => a.time - b.time)[0].pnlPct);

    const tNominal = tStat(nominalPnl);
    const tFirst = tStat(firstOnlyPnl);

    totalNominal += nominalTrades; totalEvents += sessionEvents;
    allNominalPnl.push(...nominalPnl); allFirstOnlyPnl.push(...firstOnlyPnl);

    console.log([pair.toUpperCase(), nominalTrades, sessionEvents, avgPerEvent.toFixed(2), maxPerEvent,
      tNominal.t?.toFixed(2) ?? '—', tFirst.t?.toFixed(2) ?? '—'].join('\t'));
  }

  console.log(`\nTOTAL: ${totalNominal} nominal trades collapse to ${totalEvents} distinct (pair,date,side,ladder) session-events`);
  console.log(`Overall clustering ratio: ${(totalNominal / totalEvents).toFixed(2)}x`);
  const tAllNominal = tStat(allNominalPnl), tAllFirst = tStat(allFirstOnlyPnl);
  console.log(`Pooled t-stat, ALL trades treated independent: n=${tAllNominal.n} mean=${tAllNominal.mean.toFixed(4)}% t=${tAllNominal.t.toFixed(2)}`);
  console.log(`Pooled t-stat, ONE trade per session-event:    n=${tAllFirst.n} mean=${tAllFirst.mean.toFixed(4)}% t=${tAllFirst.t.toFixed(2)}`);
}

main();
