// Tests whether the portfolio heat cap -- already-built, validated
// machinery (js/levelAtlasVoteReview.js's applyPortfolioHeatCap) -- pulls
// the combined Asia+Monday portfolio's suspiciously clean numbers (Sharpe
// 15-18, win rate 85-97%, PF 100-210) toward something more standard, by
// capping simultaneous correlated exposure (shared currency legs across
// nominally-separate pairs) that equal-weight fixed-risk sizing ignores.
// Never tested on the COMBINED portfolio before -- only on single-ladder
// portfolios, and before this session's data fixes.
//
// ALSO corrects the known-wrong pair exclusion found earlier: EURUSD and
// GOLD were both confirmed net-positive (+121%, +67%) during the exact
// drawdown window the greedy exclusion algorithm optimizes against -- kept
// in, not excluded. Uses the "Select recommended" pair list from the
// screenshot as the base (17 pairs, already excludes the real crisis-driver
// GBPCAD along with the other genuine losers).
import { buildFibAtlasVotePortfolio } from '../js/fibAtlasVotePortfolio.js';

const BASE = process.env.BASE || 'https://macrofxmodel-production.up.railway.app';
// "Select recommended" pairs from the screenshot (already excludes gbpcad,
// gbpchf, eurcad... wait, eurcad IS checked in that screenshot -- using
// exactly what was shown checked: eurusd, gbpusd, usdjpy, audusd, nzdusd,
// usdcad, usdchf, eurgbp, euraud, eurcad, gbpaud, audjpy, audnzd, audcad,
// cadjpy, nzdjpy, gold -- 17 pairs, EURUSD/GOLD correctly included.
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurgbp', 'euraud', 'eurcad', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'];
const LADDERS = ['asia', 'monday'];
const BASE_CONFIG = { minMargin: 2, maxConcurrent: 1, perDirection: true, riskPct: 0.5,
  sizing: 'fixed-risk', weighting: 'equal', minCostRatio: 3, maxGapMin: 30,
  continuationExit: 'chandelier', stopTightenFrac: 0.9 };
const HEAT_CAPS = [null, 5, 3, 2, 1, 0.5];

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

const rawCache = new Map();
async function primeCache() {
  await Promise.all(PAIRS.flatMap(pair => LADDERS.map(async ladder => {
    const routePrefix = ladder === 'asia' ? 'asia-fib-atlas' : 'monday-fib-atlas';
    const resp = await fetchWithRetry(`${BASE}/api/${routePrefix}/vote-trades/${pair.toUpperCase()}?minMargin=1`);
    rawCache.set(`${pair}|${ladder}`, resp && resp.ok ? await resp.json() : null);
  })));
}

async function loaderAsShipped(constituentKey) {
  const [pair, ladder] = constituentKey.split('|');
  const stored = rawCache.get(constituentKey);
  if (!stored) return null;
  const label = ladder === 'asia' ? 'Asia' : 'Monday';
  return { ...stored, groupKey: `${stored.instrument} (${label})`, ladder };
}

function winRateStats(result) {
  const all = result.trades ?? [];
  const wins = all.filter(t => t.win), losses = all.filter(t => !t.win);
  const gp = wins.reduce((a, t) => a + t.pnlPct, 0), gl = -losses.reduce((a, t) => a + t.pnlPct, 0);
  return {
    trades: all.length,
    winRate: all.length ? +(100 * wins.length / all.length).toFixed(1) : null,
    pf: gl > 1e-9 ? +(gp / gl).toFixed(2) : null,
    sharpe: result.stats?.sharpe, sharpeHAC: result.stats?.sharpeHAC?.sharpeNW,
    maxDD: result.stats?.maxDDNonCompounded,
    skippedByHeat: result.heatCap ? `${result.heatCap.skippedCount}/${result.heatCap.totalCount}` : '—',
  };
}

async function main() {
  console.log('Priming cache (34 fetches)...');
  await primeCache();
  const constituentKeys = PAIRS.flatMap(pair => LADDERS.map(l => `${pair}|${l}`));

  console.log(['heatCap%', 'trades', 'winRate%', 'PF', 'sharpe', 'sharpeHAC', 'maxDD%', 'skipped/total'].join('\t'));
  for (const cap of HEAT_CAPS) {
    const result = await buildFibAtlasVotePortfolio({
      pairs: constituentKeys, ...BASE_CONFIG, maxHeatPct: cap, loadPairVoteTrades: loaderAsShipped,
    });
    if (result.error) { console.log(`${cap}\tERROR ${result.error}`); continue; }
    const s = winRateStats(result);
    const label = cap == null ? 'off' : `${cap}%`;
    console.log([label, s.trades, s.winRate + '%', s.pf, s.sharpe, typeof s.sharpeHAC === 'number' ? s.sharpeHAC.toFixed(2) : String(s.sharpeHAC), s.maxDD + '%', s.skippedByHeat].join('\t'));
  }
}

main();
