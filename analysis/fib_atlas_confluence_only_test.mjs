/**
 * Tests the `confluenceOnly` gate in js/asiaFibAtlasVoteReview.js's
 * `buildBarrierTrades` (default false) -- the owner's own original framing
 * for Fib Atlas ("grab the line with confluence": Asia today vs previous
 * Asia, levels within ~2 pips = strong, within ~1 pip = stronger) -- which
 * no caller in the codebase has ever turned on. The live bot and every
 * backtest to date (including the post-look-ahead-fix $25k/6yr baseline,
 * commit 34d3438) trade the RAW, unfiltered ladder instead.
 *
 * ASIA ONLY: `asiaConfPips` (continuous pip distance to the nearest
 * previous-Asia level) is carried onto the stored trade record, so this
 * can filter already-regenerated votetrades.json data with no re-walk.
 * Monday's equivalent (`mondayConfluenceGrade`, categorical only) is NOT
 * carried onto its stored trade record -- testing Monday's own confluence
 * gate needs a raw re-walk from touches, not done here.
 *
 * 2026-09-29 result (16-pair recommended set, "best config" toggles):
 *   margin=2, no filter:         Sharpe 0.74, PF 1.16, DD  -6.5%, 639 trades,  final $124.7k (current live)
 *   margin=2, confluence<=2p:    Sharpe 0.56, PF 1.17, DD  -6.1%, 299 trades,  final $112.7k
 *   margin=2, confluence<=1p:    Sharpe 0.69, PF 1.33, DD  -4.5%, 151 trades,  final $112.4k
 *   margin=1, confluence<=2p:    Sharpe 1.38, PF 1.10, DD -25.5%, 5895 trades, final $247.4k
 *   margin=1, confluence<=1p:    Sharpe 1.43, PF 1.13, DD -25.4%, 3419 trades, final $213.4k
 *
 * Margin=2 (requiring BOTH prevOutcomeSameDay and sessionHandoff to agree)
 * was, until the look-ahead fix, an accidental proxy for restrictiveness --
 * stacking it with the REAL confluence filter over-restricts (small,
 * noisier samples, worse Sharpe). Margin=1 + confluence<=2p is the
 * standout: large sample (5895 trades, not a small-N fluke), Sharpe roughly
 * double the current live setup, at the cost of a deeper (though still
 * moderate) drawdown than margin=2's current -6.5%.
 */
const REPO = 'C:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel';
const { buildFibAtlasVotePortfolio } = await import(`file:///${REPO}/js/fibAtlasVotePortfolio.js`);
const { getJSON } = await import(`file:///${REPO}/js/r2Store.js`);

const RECOMMENDED_16 = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurgbp', 'euraud', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'];

async function build(pairs, minMargin, confPipMax) {
  const constituentKeys = pairs.map(p => `${p}|asia`);
  const rawCache = new Map();
  await Promise.all(constituentKeys.map(async key => {
    const [pair] = key.split('|');
    rawCache.set(key, await getJSON(`asia-fib-atlas/${pair}-votetrades.json`));
  }));
  const cachedLoader = async (constituentKey) => {
    const stored = rawCache.get(constituentKey);
    if (!stored) return null;
    const [pair] = constituentKey.split('|');
    let trades = stored.trades;
    if (confPipMax != null) trades = trades.filter(t => t.asiaConfPips != null && t.asiaConfPips <= confPipMax);
    return { ...stored, trades, groupKey: `${stored.instrument} (asia)`, ladder: 'asia' };
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
  console.log(`${label}: trades=${s.tradesTaken} sharpe=${s.sharpe} PF=${s.profitFactor} winRate=${s.winRate}% maxDD=${s.maxDDPct}% final=$${s.finalBalance?.toLocaleString()}`);
}
report('ASIA-ONLY baseline (margin=2, no confluence filter)', await build(RECOMMENDED_16, 2, null));
report('ASIA-ONLY margin=2 + confluence<=2p (strong)      ', await build(RECOMMENDED_16, 2, 2));
report('ASIA-ONLY margin=2 + confluence<=1p (stronger)    ', await build(RECOMMENDED_16, 2, 1));
report('ASIA-ONLY margin=1 + confluence<=2p (strong)      ', await build(RECOMMENDED_16, 1, 2));
report('ASIA-ONLY margin=1 + confluence<=1p (stronger)    ', await build(RECOMMENDED_16, 1, 1));
process.exit(0);
