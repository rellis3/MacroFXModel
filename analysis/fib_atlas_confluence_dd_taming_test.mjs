/**
 * Attempts to tame the -25.5% realAccountSim drawdown found in
 * fib_atlas_confluence_only_test.mjs's standout config (margin=1,
 * confluence<=2p, Asia only, 16-pair set) -- and finds it ISN'T a quick
 * win, which matters more than a fix would have:
 *
 * 1. `realAccountSim` (the per-trade shared-account sim) and the "day-
 *    pooled" portfolio stats are TWO SEPARATE metric tracks in
 *    fibAtlasVotePortfolio.js -- `throttleOn` (applyDrawdownThrottle) only
 *    scales the day-pooled series, never touches realAccountSim's own
 *    trade list. Blindly enabling it would have made the number LOOK
 *    fixed while the one actually quoted stayed identical -- checked
 *    before running anything, per the owner's own "be wary of the bias
 *    you unpacked multiple times being added back in" instruction
 *    (2026-09-29).
 * 2. The two tracks materially DISAGREE here: realAccountSim shows
 *    Sharpe 1.38 / DD -25.5%; the day-pooled view (same trades, same
 *    config) shows Sharpe 0.66 / DD -45.0%. Matches this codebase's own
 *    documented pattern of the two views disagreeing for a trade-count-
 *    changing lever -- not a bug, but means neither number alone should
 *    be trusted as "the" answer for this config.
 * 3. `applyPortfolioHeatCap` (maxHeatPct 10 or 5) skips 0/10247 trades --
 *    confirms, on Fib Atlas data, the SAME finding levelAtlasVoteReview.js
 *    already documented for Vote Atlas: this isn't a pile-up-of-
 *    concurrent-positions problem, so a concurrency/heat cap can't touch
 *    it either way.
 * 4. `applyDrawdownThrottle` (day-pooled track only) can pull that track's
 *    DD from -45.0% down to roughly -25 to -28%, but only by throttling
 *    ~86-89% of ALL days and giving back real Sharpe (0.66 -> 0.33-0.6) --
 *    not a free improvement, closer to "give back most of the edge to
 *    match the other metric's already-lower number."
 *
 * Conclusion: no cheap fix found. The honest range for this config's real
 * drawdown risk is -25% to -45% depending on methodology, and closing that
 * gap needs understanding WHY the two views disagree this much for this
 * specific lever -- not picking whichever number is more flattering.
 */
const REPO = 'C:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel';
const { buildFibAtlasVotePortfolio } = await import(`file:///${REPO}/js/fibAtlasVotePortfolio.js`);
const { getJSON } = await import(`file:///${REPO}/js/r2Store.js`);

const RECOMMENDED_16 = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurgbp', 'euraud', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'];

async function build(opts) {
  const constituentKeys = RECOMMENDED_16.map(p => `${p}|asia`);
  const rawCache = new Map();
  await Promise.all(constituentKeys.map(async key => {
    const [pair] = key.split('|');
    rawCache.set(key, await getJSON(`asia-fib-atlas/${pair}-votetrades.json`));
  }));
  const cachedLoader = async (constituentKey) => {
    const stored = rawCache.get(constituentKey);
    if (!stored) return null;
    const trades = stored.trades.filter(t => t.asiaConfPips != null && t.asiaConfPips <= 2);
    return { ...stored, trades, groupKey: `${stored.instrument} (asia)`, ladder: 'asia' };
  };
  return buildFibAtlasVotePortfolio({
    pairs: constituentKeys, minMargin: 1, maxConcurrent: 1, perDirection: true,
    sizing: 'fixed-risk', riskPct: 0.5, stopTightenFrac: 0.9, minCostRatio: 3,
    maxGapMin: 30, continuationExit: 'chandelier',
    startingCapital: 100000, realAccountRiskPct: 0.5, maxOpen: 20,
    loadPairVoteTrades: cachedLoader,
    ...opts,
  });
}
function report(label, r) {
  const s = r?.realAccountSim;
  console.log(`${label}`);
  if (s) console.log(`  realAccountSim (untouched by throttle): trades=${s.tradesTaken} sharpe=${s.sharpe} DD=${s.maxDDPct}% final=$${s.finalBalance?.toLocaleString()}`);
  if (r?.stats) console.log(`  day-pooled ${r.throttle ? 'THROTTLED' : 'no-throttle'}: sharpe=${r.stats.sharpe} maxDD=${r.stats.maxDD}% (${r.throttle?.daysThrottled ?? 0}/${r.throttle?.totalDays ?? r.days} days throttled)`);
  if (r?.heatCap) console.log(`  heatCap: skipped ${r.heatCap.skippedCount}/${r.heatCap.totalCount} trades`);
}
report('baseline (no throttle, no heat cap)', await build({}));
report('day-pooled throttle (trigger -5%, restore 0%, 0.5x)', await build({ throttleOn: true, triggerDD: -5, restoreDD: 0, throttleMult: 0.5 }));
report('day-pooled throttle (trigger -8%, restore -2%, 0.4x)', await build({ throttleOn: true, triggerDD: -8, restoreDD: -2, throttleMult: 0.4 }));
report('heat cap maxHeatPct=10', await build({ maxHeatPct: 10 }));
report('heat cap maxHeatPct=5', await build({ maxHeatPct: 5 }));
process.exit(0);
