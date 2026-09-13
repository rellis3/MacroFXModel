// Traces exactly which lever(s) in the "Select recommended"/"Load best
// config" stack push per-trade win rate from each pair's own honest ~70-75%
// base rate up to the 85.7% shown on the combined portfolio page. Adds ONE
// lever at a time (via the REAL buildFibAtlasVotePortfolio, unmodified) so
// the inflation source is visible step by step, not just asserted.
import { buildFibAtlasVotePortfolio } from '../js/fibAtlasVotePortfolio.js';

const BASE = process.env.BASE || 'https://macrofxmodel-production.up.railway.app';
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurgbp', 'euraud', 'eurcad', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'];
const LADDERS = ['asia', 'monday'];

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
  if (!all.length) return { trades: 0, winRate: null, pf: null };
  const wins = all.filter(t => t.win);
  const losses = all.filter(t => !t.win);
  const gp = wins.reduce((a, t) => a + t.pnlPct, 0), gl = -losses.reduce((a, t) => a + t.pnlPct, 0);
  return {
    trades: all.length,
    winRate: +(100 * wins.length / all.length).toFixed(1),
    pf: gl > 1e-9 ? +(gp / gl).toFixed(2) : null,
    sharpe: result.stats?.sharpe,
    maxDD: result.stats?.maxDDNonCompounded,
  };
}

async function main() {
  console.log('Priming cache (34 fetches)...');
  await primeCache();
  const constituentKeys = PAIRS.flatMap(pair => LADDERS.map(l => `${pair}|${l}`));

  const steps = [
    { label: 'margin>=1, nothing else', opts: { minMargin: 1 } },
    { label: 'margin>=2 only', opts: { minMargin: 2 } },
    { label: '+ cost-efficiency >=3x', opts: { minMargin: 2, minCostRatio: 3 } },
    { label: '+ gap filter (30min)', opts: { minMargin: 2, minCostRatio: 3, maxGapMin: 30 } },
    { label: '+ chandelier exit', opts: { minMargin: 2, minCostRatio: 3, maxGapMin: 30, continuationExit: 'chandelier' } },
    { label: '+ fade-stop tighten 0.9x', opts: { minMargin: 2, minCostRatio: 3, maxGapMin: 30, continuationExit: 'chandelier', stopTightenFrac: 0.9 } },
    { label: '+ per-direction (hedge-only)', opts: { minMargin: 2, minCostRatio: 3, maxGapMin: 30, continuationExit: 'chandelier', stopTightenFrac: 0.9, perDirection: true } },
  ];

  console.log(['step', 'trades', 'winRate%', 'PF', 'sharpe', 'maxDD%'].join('\t'));
  for (const step of steps) {
    const result = await buildFibAtlasVotePortfolio({
      pairs: constituentKeys, maxConcurrent: 1, perDirection: false, riskPct: 0.5,
      sizing: 'fixed-risk', weighting: 'equal', ...step.opts, loadPairVoteTrades: loaderAsShipped,
    });
    if (result.error) { console.log(`${step.label}\tERROR ${result.error}`); continue; }
    const s = winRateStats(result);
    console.log([step.label, s.trades, s.winRate + '%', s.pf, s.sharpe, s.maxDD + '%'].join('\t'));
  }
}

main();
