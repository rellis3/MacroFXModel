/**
 * Re-validates FIB_ATLAS_MIN_MARGIN against the POST-look-ahead-fix data
 * (2026-09-29). Margin can only be 0 (no decision), 1, or 2 (both VOTE_DIMS
 * agree) for this engine -- min_margin=2 measured at ~0.7% of all touches
 * across the full 22-pair portfolio on a sample day, post-fix, so this
 * checks whether min_margin=1 is now the viable threshold, using the exact
 * same real-account-sim methodology (js/fibAtlasVotePortfolio.js) and
 * "Load best config" toggle state (stopTightenFrac=0.9, minCostRatio=3,
 * maxGapMin=30, continuationExit='chandelier') this session already
 * established as the defensible baseline -- only minMargin varies here.
 */
const REPO = 'C:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel';
const { buildFibAtlasVotePortfolio } = await import(`file:///${REPO}/js/fibAtlasVotePortfolio.js`);
const { getJSON } = await import(`file:///${REPO}/js/r2Store.js`);

const RECOMMENDED_16 = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurgbp', 'euraud', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'];
const LADDERS = ['asia', 'monday'];
const LADDER_PREFIX = { asia: 'asia-fib-atlas', monday: 'monday-fib-atlas' };

async function build(pairs, minMargin) {
  const constituentKeys = pairs.flatMap(pair => LADDERS.map(ladder => `${pair}|${ladder}`));
  const rawCache = new Map();
  const settled = await Promise.allSettled(constituentKeys.map(async key => {
    const [pair, ladder] = key.split('|');
    rawCache.set(key, await getJSON(`${LADDER_PREFIX[ladder]}/${pair}-votetrades.json`));
  }));
  settled.forEach((r, i) => { if (r.status === 'rejected') console.error('FETCH FAILED:', constituentKeys[i], r.reason?.message || r.reason); });
  const cachedLoader = async (constituentKey) => {
    const stored = rawCache.get(constituentKey);
    if (!stored) return null;
    const [, ladder] = constituentKey.split('|');
    return { ...stored, groupKey: `${stored.instrument} (${ladder})`, ladder };
  };
  return buildFibAtlasVotePortfolio({
    pairs: constituentKeys, minMargin, maxConcurrent: 1, perDirection: true,
    sizing: 'fixed-risk', riskPct: 0.5, stopTightenFrac: 0.9, minCostRatio: 3,
    maxGapMin: 30, continuationExit: 'chandelier',
    startingCapital: 100000, realAccountRiskPct: 0.5, maxOpen: 20,
    loadPairVoteTrades: cachedLoader,
  });
}

function report(label, r) {
  const s = r?.realAccountSim;
  if (!s) { console.log(`${label}: NO realAccountSim (error=${r?.error})`); return; }
  console.log(`${label}: trades=${s.trades} sharpe=${s.sharpe} PF=${s.profitFactor} winRate=${s.winRate}% maxDD=${s.maxDDPct}% final=$${s.finalBalance?.toLocaleString()}`);
}

const which = process.argv[2];
if (which === 'm1') report('minMargin=1', await build(RECOMMENDED_16, 1));
else if (which === 'm2') report('minMargin=2 (current threshold)', await build(RECOMMENDED_16, 2));
else console.log('usage: node fib_atlas_min_margin_revalidation_postfix.mjs <m1|m2>');
process.exit(0);
