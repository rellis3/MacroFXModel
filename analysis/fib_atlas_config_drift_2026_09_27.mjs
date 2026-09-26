/**
 * 2026-09-27: user manually reconfigured asia-fib-atlas-vote-portfolio.html
 * away from "Load best config" (max concurrent 1, recommended-16 pairs, no
 * indices, stopTightenFrac=0.9 ON, whiplash gap filter ON) to max concurrent
 * 3 + all 26 FX/gold pairs (+ 6 indices in one variant), with BOTH
 * stopTightenFrac and the whiplash gap filter turned OFF, and asked whether
 * the resulting higher Sharpe (15.38 vs the validated config's own number)
 * meant "best config" needed updating. This isolates each changed variable
 * to answer that. Verified against the user's own screenshots: the "all-26
 * + indices" run below reproduces 15.37 against their on-screen 15.38.
 *
 * Findings (see each run's own printed numbers for the actual figures):
 *  1. Max concurrent 1 vs 3 barely moves Sharpe either way (confirms the
 *     2026-08-31 hedge-only re-test's own finding that concurrency beyond 1
 *     adds negligible real edge once perDirection=true blocks same-
 *     direction pyramiding) -- NOT what's driving the higher number.
 *  2. stopTightenFrac and the whiplash gap filter are BOTH already enforced
 *     by the LIVE zone pricer unconditionally (FIB_ATLAS_STOP_TIGHTEN_FRAC=
 *     0.9 has no config off-switch at all; the gap filter defaults to ON
 *     via fib_atlas_bot_config's own live `gap_filter:{asia:true,
 *     monday:true}`, confirmed in KV 2026-09-26) -- turning them OFF here
 *     doesn't just change the number, it makes THIS BACKTEST stop
 *     representing what the live bot actually does. On recommended-16 pairs
 *     this costs ~3 Sharpe points on its own (16.04 with both ON vs 12.85
 *     with both OFF) -- i.e. the "best config" preset was already the
 *     BETTER number before any pair-set change.
 *  3. Adding the 10 previously-excluded correlated pairs back in is real
 *     (recommended-16 -> all-26 raises Sharpe under either toggle state),
 *     but it's the SAME lever the 2026-08-30 leave-one-out OOS study
 *     explicitly tested and rejected (Asia OOS maxDD -39.2% -> -98.6% under
 *     that study's own NAV-split methodology). The newer real-account sim
 *     does NOT show that same catastrophic drawdown for the same lever
 *     (~-2% either way) -- genuinely unreconciled discrepancy between the
 *     two measurement frameworks, not something this script resolves.
 *  4. Indices add another real bump on top, but every index pair's real
 *     $/point-per-lot is still an UNVERIFIED assumption (pylego/
 *     point_values.json, no live index trade exists yet to check it
 *     against) -- see pylego/broker/mt5.py's verify_point_values(), wired
 *     2026-09-26 into the 4 live bots' own startup logs.
 */
const REPO = 'C:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel';
const { buildFibAtlasVotePortfolio } = await import(`file:///${REPO}/js/fibAtlasVotePortfolio.js`);
const { getJSON } = await import(`file:///${REPO}/js/r2Store.js`);

const RECOMMENDED_16 = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurgbp', 'euraud', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'];
const EXCLUDED_10 = ['gbpcad', 'gbpchf', 'eurcad', 'gbpnzd', 'eurchf', 'audchf', 'chfjpy', 'eurnzd', 'gbpjpy', 'eurjpy'];
const ALL_26 = [...RECOMMENDED_16, ...EXCLUDED_10];
const INDICES = ['nq', 'spx', 'de30', 'uk100', 'us2000', 'dow'];
const LADDERS = ['asia', 'monday'];
const LADDER_PREFIX = { asia: 'asia-fib-atlas', monday: 'monday-fib-atlas' };

async function build(pairs, opts) {
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
    pairs: constituentKeys, minMargin: 2, perDirection: true,
    sizing: 'fixed-risk', riskPct: 0.5, minCostRatio: 3, continuationExit: 'chandelier',
    startingCapital: 100000, realAccountRiskPct: 0.5, maxOpen: 20,
    loadPairVoteTrades: cachedLoader, ...opts,
  });
}

function report(label, r) {
  const s = r?.realAccountSim;
  if (!s) { console.log(`${label}: NO realAccountSim (error=${r?.error})`); return; }
  console.log(`${label}: sharpe=${s.sharpe} PF=${s.profitFactor} maxDD=${s.maxDDPct}% final=$${s.finalBalance?.toLocaleString()} skippedExposure=${s.skippedExposure} skippedMargin=${s.skippedMargin}`);
}

const mode = process.argv[2] || 'help';
const BEST_CONFIG = { maxConcurrent: 1, stopTightenFrac: 0.9, maxGapMin: 30 };
const SCREENSHOT_TOGGLES = { maxConcurrent: 3 }; // stopTightenFrac/maxGapMin left off, matching the screenshots

const RUNS = {
  concurrency: async () => {
    report('recommended-16, maxConcurrent=1 (best config)', await build(RECOMMENDED_16, { ...BEST_CONFIG, maxConcurrent: 1 }));
    report('recommended-16, maxConcurrent=3 (best config filters, higher cap)', await build(RECOMMENDED_16, { ...BEST_CONFIG, maxConcurrent: 3 }));
  },
  filters: async () => {
    report('recommended-16, filters ON (best config)', await build(RECOMMENDED_16, { ...BEST_CONFIG, maxConcurrent: 1 }));
    report('recommended-16, filters OFF (screenshot toggles)', await build(RECOMMENDED_16, SCREENSHOT_TOGGLES));
  },
  pairset: async () => {
    report('recommended-16, screenshot toggles', await build(RECOMMENDED_16, SCREENSHOT_TOGGLES));
    report('all-26, screenshot toggles', await build(ALL_26, SCREENSHOT_TOGGLES));
    report('all-26 + indices, screenshot toggles', await build([...ALL_26, ...INDICES], SCREENSHOT_TOGGLES));
  },
};
if (RUNS[mode]) await RUNS[mode]();
else console.log('usage: node fib_atlas_config_drift_2026_09_27.mjs <concurrency|filters|pairset>');
process.exit(0);
