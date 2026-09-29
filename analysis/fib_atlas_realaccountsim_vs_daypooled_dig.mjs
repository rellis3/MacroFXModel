/**
 * ROOT CAUSE of fib_atlas_confluence_dd_taming_test.mjs's realAccountSim
 * (Sharpe 1.38, DD -25.5%) vs day-pooled (Sharpe 0.66, DD -45.0%)
 * disagreement, for margin=1+confluence<=2p, 16-pair, Asia only:
 *
 * NOT a bug in either metric -- they answer different questions, and this
 * config's signal density is the actual problem:
 *
 *   - `buildPortfolioDailySeries` (feeds the day-pooled view) sums every
 *     pair's OWN daily pnlPct at weight=1 EACH (fixed-risk sizing does not
 *     normalize weights to 1/n) -- i.e. it models 16 pairs each
 *     independently risking their own full 0.5%/trade, with NO shared
 *     capital constraint. That's equivalent to assuming ~16x a real
 *     account's capital, all deployable simultaneously.
 *   - `simulateSharedAccount` (realAccountSim) is a real ONE-account
 *     simulation: shared margin, leverage cap, net-exposure cap, hedge
 *     cap. Confirmed here it REJECTS 4,352 of 10,247 offered trades
 *     (42.5%) -- 2,880 on net-exposure (too many correlated same-currency
 *     legs already open), 1,357 on margin, 115 on hedge -- while
 *     maxConcurrentOpenSeen never exceeds 4.
 *   - 1,073 of 1,162 days (92%) have MORE THAN ONE trade resolving. Worst
 *     single day-pooled sum: -8.90% (2026-04-22, raw sum of that day's
 *     trades' pnlPct across pairs) -- a swing only possible because the
 *     day-pooled view assumes every pair could fire simultaneously at
 *     full risk with no shared constraint.
 *
 * Conclusion: this margin=1+confluence<=2p config generates ~2.4x more
 * candidate signal (10,247) than one $100k account can actually service
 * (5,895 taken) -- the 42.5% that get skipped are decided incidentally by
 * time-order + whichever margin/exposure slot happens to be free, not by
 * deliberate trade selection. realAccountSim's 1.38 Sharpe is therefore
 * NOT "this strategy's edge" cleanly -- it's "this strategy's edge, after
 * an unplanned, order-dependent rejection of 4 in 10 signals."
 *
 * CHECKED before trusting it as a fix: confluence<=1p is NOT meaningfully
 * cleaner -- still 40.1% rejected (5712 offered, 3419 taken), day-pooled
 * DD -30.7% vs realAccountSim's -25.4% (a smaller gap than <=2p's
 * 45.0%-vs-25.5%, but not a different regime). Tightening the pip
 * threshold alone doesn't fix this -- margin=1 floods the account with
 * more signal than it can hold regardless. Before calling any margin=1
 * config deployable: either build deliberate trade prioritization
 * (instead of relying on incidental time-ordering + whichever margin/
 * exposure slot is free) or accept a materially smaller pair/signal set
 * sized to what one account can actually carry.
 */
const REPO = 'C:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel';
const { buildFibAtlasVotePortfolio } = await import(`file:///${REPO}/js/fibAtlasVotePortfolio.js`);
const { getJSON } = await import(`file:///${REPO}/js/r2Store.js`);

const RECOMMENDED_16 = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurgbp', 'euraud', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'];

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
const r = await buildFibAtlasVotePortfolio({
  pairs: constituentKeys, minMargin: 1, maxConcurrent: 1, perDirection: true,
  sizing: 'fixed-risk', riskPct: 0.5, stopTightenFrac: 0.9, minCostRatio: 3,
  maxGapMin: 30, continuationExit: 'chandelier',
  startingCapital: 100000, realAccountRiskPct: 0.5, maxOpen: 20,
  loadPairVoteTrades: cachedLoader,
});
const s = r.realAccountSim;
console.log('realAccountSim:', JSON.stringify({
  tradesOffered: s.tradesOffered, tradesTaken: s.tradesTaken,
  skippedConcurrency: s.skippedConcurrency, skippedHedge: s.skippedHedge,
  skippedMargin: s.skippedMargin, skippedExposure: s.skippedExposure,
  maxConcurrentOpenSeen: s.maxConcurrentOpenSeen, maxMarginUsedPctSeen: s.maxMarginUsedPctSeen,
}, null, 2));

// How many days have >=2, >=3, >=5 trades resolving, and what's the worst single-day
// day-pooled return look like, vs how much of that got rejected by realAccountSim's caps?
const trades = r.trades;
const byDate = new Map();
for (const t of trades) (byDate.get(t.date) ?? byDate.set(t.date, []).get(t.date)).push(t);
let multi = 0, worstDay = null, worstSum = 0;
for (const [date, list] of byDate) {
  if (list.length > 1) multi++;
  const sum = list.reduce((a, t) => a + t.pnlPct, 0);
  if (sum < worstSum) { worstSum = sum; worstDay = date; }
}
console.log(`days with >1 trade: ${multi} / ${byDate.size} total days`);
console.log(`worst single day-pooled sum: ${worstDay} = ${worstSum.toFixed(2)}% (raw sum of that day's trades' pnlPct, weight=1 each pair)`);

// day-pooled stats for comparison
console.log('day-pooled stats:', JSON.stringify(r.stats, null, 2).slice(0, 400));
process.exit(0);
