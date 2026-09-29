/**
 * Tests Monday's own confluence gate (`mondayConfluenceGrade`: this-Monday
 * vs previous-Monday range fibs within threshold, '0·none'/'1·match'/
 * '2·tight') -- the sibling of Asia's `asiaConfPips`/`confluenceOnly`
 * tested in fib_atlas_confluence_only_test.mjs. Needs a RAW RE-WALK from
 * touches (unlike Asia's continuous asiaConfPips, mondayConfluenceGrade is
 * never carried onto the stored trade record) -- no gap-fill, cached M1 is
 * fine for a historical test. Uses Monday's OWN validated best-config
 * filters (FIB_ATLAS_MONDAY_MIN_COST_RATIO=4, STOP_TIGHTEN_FRAC=0.9,
 * MAX_GAP_MIN=180 from mondayFibAtlasZonePricer.js) -- an earlier run with
 * these left null produced an obviously-broken -642% DD, NOT a real
 * finding about Monday's edge (individual trade pnlPct all sane, -0.57%
 * to +0.67% -- confirmed via a direct check before trusting anything).
 * continuationExit is left off (no chandelier trailing) for a simpler,
 * consistent A/B across every filter/margin combo tested here -- this
 * means the ABSOLUTE numbers below should NOT be read as "what Monday's
 * live book returns" (that uses chandelier trailing, a different exit
 * rule) -- only the RELATIVE effect of turning confluence on/off is valid.
 *
 * 2026-09-29 result (16-pair set, real-account sim):
 *   margin=2 (Monday's own default), no confluence: Sharpe -0.24, DD -3.6%,  final $97.1k, 149/163 taken
 *   margin=1, no confluence:                        Sharpe  0.34, DD -247%*, final -$147.6k, 5641/6564 taken
 *   margin=2, confluence!=none (match+tight):       Sharpe -0.76, DD -4.3%,  final $96.0k, 39/40 taken
 *   margin=1, confluence!=none (match+tight):       Sharpe -1.70, DD -71.9%, final $29.5k, 1257/1412 taken
 *   margin=1, confluence=tight only:                 Sharpe -0.92, DD -19.4%, final $83.8k, 267/312 taken
 *   (* -247% DD is the non-compounding fixed-fraction sim genuinely
 *   running past zero under a dense, serially-correlated losing stretch,
 *   not a data bug -- confirmed via per-trade pnlPct check.)
 *
 * CONCLUSION: unlike Asia, Monday's confluence gate does NOT help -- in
 * every apples-to-apples comparison tested (margin=2 vs margin=2+conf,
 * margin=1 vs margin=1+conf, conf vs tight-only), adding the filter makes
 * Sharpe WORSE, not better. The owner's original "grab the line with
 * confluence" design, while real and validated on Asia, doesn't transfer
 * to Monday's weekly ladder as-is.
 */
const REPO = 'C:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel';
const { loadM1ForPair } = await import(`file:///${REPO}/js/volBacktestM1Engine.js`);
const { mondayFibAtlasWalk } = await import(`file:///${REPO}/js/mondayFibAtlasEngine.js`);
const { buildAsiaFibAtlasBook } = await import(`file:///${REPO}/js/asiaFibAtlasReport.js`);
const { splitAt } = await import(`file:///${REPO}/js/levelAtlasReport.js`);
const { runBarrierWalkForward } = await import(`file:///${REPO}/js/asiaFibAtlasVoteReview.js`);
const { assetClassFor } = await import(`file:///${REPO}/js/forecastAnalyserStore.js`);
const { costForPair } = await import(`file:///${REPO}/js/perLineStrategy.js`);
const { buildFibAtlasVotePortfolio } = await import(`file:///${REPO}/js/fibAtlasVotePortfolio.js`);

const RECOMMENDED_16 = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurgbp', 'euraud', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'];
const DEFAULT_REARM = 0.3;

async function walkOne(pair) {
  const sym = pair.toUpperCase();
  const packed = await loadM1ForPair(pair);   // no gap-fill -- historical confluence test, cached M1 is fine
  if (!packed?.n) { console.error(`${sym}: no M1 data, skipping`); return null; }
  const assetClass = assetClassFor(pair);
  const { touches } = mondayFibAtlasWalk(packed, { instrument: sym, assetClass, rearmFracs: [DEFAULT_REARM] });
  const atRearm = touches.filter(t => t.rearmFrac === DEFAULT_REARM);
  const { split: realSplit } = splitAt(atRearm);
  const isOnly = atRearm.filter(t => t.date < realSplit);
  const honestBook = buildAsiaFibAtlasBook(isOnly, { rearmFrac: DEFAULT_REARM });
  if (!honestBook) { console.error(`${sym}: too few touches for a book, skipping`); return null; }
  const cost = costForPair(pair, assetClass);
  const wfAll = runBarrierWalkForward(atRearm, honestBook, { rearmFrac: DEFAULT_REARM, cost, minMargin: 1, oosStartDate: realSplit });
  const confTouches = atRearm.filter(t => t.mondayConfluenceGrade !== '0·none');
  const wfConf = runBarrierWalkForward(confTouches, honestBook, { rearmFrac: DEFAULT_REARM, cost, minMargin: 1, oosStartDate: realSplit });
  const confTightTouches = atRearm.filter(t => t.mondayConfluenceGrade === '2·tight');
  const wfConfTight = runBarrierWalkForward(confTightTouches, honestBook, { rearmFrac: DEFAULT_REARM, cost, minMargin: 1, oosStartDate: realSplit });
  console.log(`${sym}: touches=${touches.length} tradesUsed all/conf/tight = ${wfAll?.tradesUsed}/${wfConf?.tradesUsed}/${wfConfTight?.tradesUsed}`);
  return { sym, all: wfAll?.trades ?? [], conf: wfConf?.trades ?? [], tight: wfConfTight?.trades ?? [] };
}

const results = [];
for (const pair of RECOMMENDED_16) {
  try { const r = await walkOne(pair); if (r) results.push(r); }
  catch (e) { console.error(`${pair.toUpperCase()}: FAILED (${e.message})`); }
}

async function buildPortfolio(field, minMargin) {
  const constituentKeys = results.map(r => `${r.sym}|monday`);
  const cachedLoader = async (key) => {
    const sym = key.split('|')[0];
    const r = results.find(x => x.sym === sym);
    if (!r) return null;
    return { trades: r[field], instrument: sym, groupKey: `${sym} (monday)`, ladder: 'monday' };
  };
  return buildFibAtlasVotePortfolio({
    pairs: constituentKeys, minMargin, maxConcurrent: 1, perDirection: true,
    sizing: 'fixed-risk', riskPct: 0.5, stopTightenFrac: 0.9, minCostRatio: 4,
    maxGapMin: 180, continuationExit: false,
    startingCapital: 100000, realAccountRiskPct: 0.5, maxOpen: 20,
    loadPairVoteTrades: cachedLoader,
  });
}
function report(label, r) {
  const s = r?.realAccountSim;
  if (!s) { console.log(`${label}: NO realAccountSim (error=${r?.error})`); return; }
  console.log(`${label}: taken=${s.tradesTaken}/${s.tradesOffered} sharpe=${s.sharpe} DD=${s.maxDDPct}% final=$${s.finalBalance?.toLocaleString()} | day-pooled sharpe=${r.stats.sharpe} DD=${r.stats.maxDD}%`);
}
console.log('---');
report('MONDAY-ONLY margin=2 (own default), no confluence filter', await buildPortfolio('all', 2));
report('MONDAY-ONLY margin=1, no confluence filter               ', await buildPortfolio('all', 1));
report('MONDAY-ONLY margin=2, confluence!=none (match+tight)     ', await buildPortfolio('conf', 2));
report('MONDAY-ONLY margin=1, confluence!=none (match+tight)     ', await buildPortfolio('conf', 1));
report('MONDAY-ONLY margin=1, confluence=tight only               ', await buildPortfolio('tight', 1));
process.exit(0);
