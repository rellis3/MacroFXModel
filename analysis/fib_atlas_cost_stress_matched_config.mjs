/**
 * Re-runs the cost-stress check with the EXACT "Load best config" toggle
 * state the live asia-fib-atlas-vote-portfolio.html page's own button sets
 * (minMargin=2, maxConcurrent=1, perDirection=true, sizing=fixed-risk,
 * riskPct=0.5, stopTightenFrac=0.9, minCostRatio=3 (Asia's own, reused for
 * combined mode per js/asiaFibAtlasRoutes.js's own precedent),
 * maxGapMin=30, continuationExit='chandelier') -- the page's raw on-load
 * default is actually everything OFF (verified: none of stopTightenChk/
 * costEfficiencyChk/gapFilterChk/continuationExitSel carry an HTML
 * `checked`/`selected` default, and loadData() runs unconditionally at the
 * bottom of the script, not gated behind the best-config button), so an
 * earlier ad-hoc cost-stress test that used bare defaults was measuring a
 * DIFFERENT, harsher config than what the user was actually looking at on
 * screen after clicking that button. This script closes that gap.
 *
 * Combined-ladder mode (asia+monday both open at once per pair) -- the
 * route this maps to is /api/asia-fib-atlas/vote-portfolio-combined, which
 * is what "the page" most plausibly means for a full-bot comparison.
 */
const REPO = 'C:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel';
const { buildFibAtlasVotePortfolio } = await import(`file:///${REPO}/js/fibAtlasVotePortfolio.js`);
const { getJSON } = await import(`file:///${REPO}/js/r2Store.js`);

const FX_GOLD_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurgbp', 'euraud', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'];
const INDEX_PAIRS = ['nq', 'spx', 'de30', 'uk100', 'us2000', 'dow'];
const LADDERS = ['asia', 'monday'];
const LADDER_PREFIX = { asia: 'asia-fib-atlas', monday: 'monday-fib-atlas' };

async function run(label, pairs) {
  const constituentKeys = pairs.flatMap(pair => LADDERS.map(ladder => `${pair}|${ladder}`));
  const rawCache = new Map();
  await Promise.all(constituentKeys.map(async key => {
    const [pair, ladder] = key.split('|');
    rawCache.set(key, await getJSON(`${LADDER_PREFIX[ladder]}/${pair}-votetrades.json`));
  }));
  const cachedLoader = async (constituentKey) => {
    const stored = rawCache.get(constituentKey);
    if (!stored) return null;
    const [, ladder] = constituentKey.split('|');
    return { ...stored, groupKey: `${stored.instrument} (${ladder})`, ladder };
  };

  const t0 = Date.now();
  const result = await buildFibAtlasVotePortfolio({
    pairs: constituentKeys,
    minMargin: 2, maxConcurrent: 1, perDirection: true,
    sizing: 'fixed-risk', riskPct: 0.5,
    stopTightenFrac: 0.9, minCostRatio: 3, maxGapMin: 30,
    continuationExit: 'chandelier',
    startingCapital: 100000, realAccountRiskPct: 0.5, maxOpen: 20,
    loadPairVoteTrades: cachedLoader,
  });
  console.log(`\n=== ${label} (${pairs.length} pairs) — compute ${Date.now() - t0}ms ===`);
  if (result.error) { console.log('  ERROR:', result.error, result.missing); return; }
  console.log(`  trades=${result.trades?.length ?? 'n/a'}`);
  console.log('  realAccountCostStress:');
  for (const row of result.realAccountCostStress || []) {
    const s = row.sim;
    console.log(`    ${row.multiplier}x (extraCost +${row.extraCostPct}%): final=$${s.finalBalance?.toLocaleString()}, sharpe=${s.sharpe}, PF=${s.profitFactor}, winRate=${s.winRate}%, maxDD=${s.maxDrawdownPct}%`);
  }
}

await run('FX + gold only', FX_GOLD_PAIRS);
await run('FX + gold + 6 indices', [...FX_GOLD_PAIRS, ...INDEX_PAIRS]);
process.exit(0);
