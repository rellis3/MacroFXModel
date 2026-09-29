/**
 * The gap flagged 2026-09-29: every Monday number reported earlier today
 * (fib_atlas_monday_confluence_test.mjs) used a SIMPLIFIED methodology
 * (base exit, no chandelier trailing) to isolate the confluence-filter
 * question cleanly -- it was never meant to represent Monday's own REAL
 * live config, but got read that way. This runs Monday's actual config:
 * margin=2 (FIB_ATLAS_MONDAY_MIN_MARGIN), chandelier trail
 * (MONDAY_CHANDELIER_MULT=1.5, matching mondayFibAtlasRoutes.js exactly),
 * Monday's own filter thresholds, current (triply-fixed) engine, no
 * confluence filter -- i.e. what the live bot is actually running.
 */
const REPO = 'C:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel';
const { loadM1ForPair } = await import(`file:///${REPO}/js/volBacktestM1Engine.js`);
const { mondayFibAtlasWalk } = await import(`file:///${REPO}/js/mondayFibAtlasEngine.js`);
const { buildAsiaFibAtlasBook } = await import(`file:///${REPO}/js/asiaFibAtlasReport.js`);
const { splitAt } = await import(`file:///${REPO}/js/levelAtlasReport.js`);
const { runBarrierWalkForward } = await import(`file:///${REPO}/js/asiaFibAtlasVoteReview.js`);
const { applyTrailingContinuation } = await import(`file:///${REPO}/js/levelAtlasVoteReview.js`);
const { assetClassFor } = await import(`file:///${REPO}/js/forecastAnalyserStore.js`);
const { costForPair } = await import(`file:///${REPO}/js/perLineStrategy.js`);
const { buildFibAtlasVotePortfolio } = await import(`file:///${REPO}/js/fibAtlasVotePortfolio.js`);
const { FIB_ATLAS_MONDAY_MIN_MARGIN, FIB_ATLAS_MONDAY_MIN_COST_RATIO, FIB_ATLAS_MONDAY_STOP_TIGHTEN_FRAC, FIB_ATLAS_MONDAY_MAX_GAP_MIN } = await import(`file:///${REPO}/js/mondayFibAtlasZonePricer.js`);

const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurgbp', 'euraud', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'];
const DEFAULT_REARM = 0.3;
const MONDAY_CHANDELIER_MULT = 1.5, CHANDELIER_PERIOD = 60;

async function walkPair(pair) {
  const sym = pair.toUpperCase();
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) return null;
  const assetClass = assetClassFor(pair);
  const cost = costForPair(pair, assetClass);
  const res = mondayFibAtlasWalk(packed, { instrument: sym, assetClass, rearmFracs: [DEFAULT_REARM] });
  const atRearm = res.touches.filter(t => t.rearmFrac === DEFAULT_REARM);
  const { split } = splitAt(atRearm);
  const isOnly = atRearm.filter(t => t.date < split);
  const honestBook = buildAsiaFibAtlasBook(isOnly, { rearmFrac: DEFAULT_REARM });
  if (!honestBook) return null;
  const wf = runBarrierWalkForward(atRearm, honestBook, { rearmFrac: DEFAULT_REARM, cost, minMargin: 1, oosStartDate: split });
  const chand = applyTrailingContinuation(wf?.trades ?? [], packed, { cost, decisions: ['fade', 'follow'], trailMode: 'chandelier', chandelierMult: MONDAY_CHANDELIER_MULT, chandelierPeriod: CHANDELIER_PERIOD })
    .map(t => t.trailedPnlPct == null ? t : { ...t, pnlPct: t.trailedPnlPct, pnlPips: t.trailedPnlPips, resolveTime: t.trailedResolveTime });
  return { sym, chand };
}

const results = [];
for (const pair of PAIRS) {
  try { const r = await walkPair(pair); if (r) results.push(r); console.log(`${r?.sym ?? pair.toUpperCase()} done`); }
  catch (e) { console.error(`${pair.toUpperCase()}: FAILED (${e.message})`); }
}

async function build(minMargin) {
  const constituentKeys = results.map(r => `${r.sym}|monday`);
  const cachedLoader = async (key) => {
    const sym = key.split('|')[0];
    const r = results.find(x => x.sym === sym);
    if (!r) return null;
    return { trades: r.chand, instrument: sym, groupKey: `${sym} (monday)`, ladder: 'monday' };
  };
  return buildFibAtlasVotePortfolio({
    pairs: constituentKeys, minMargin, maxConcurrent: 1, perDirection: true,
    sizing: 'fixed-risk', riskPct: 0.5,
    stopTightenFrac: FIB_ATLAS_MONDAY_STOP_TIGHTEN_FRAC, minCostRatio: FIB_ATLAS_MONDAY_MIN_COST_RATIO, maxGapMin: FIB_ATLAS_MONDAY_MAX_GAP_MIN,
    continuationExit: false,   // pnlPct already swapped to chandelier where applicable, above
    startingCapital: 100000, realAccountRiskPct: 0.5, maxOpen: 20,
    loadPairVoteTrades: cachedLoader,
  });
}
function report(label, r) {
  const s = r?.realAccountSim;
  if (!s) { console.log(`${label}: NO realAccountSim (error=${r?.error})`); return; }
  console.log(`${label}: taken=${s.tradesTaken}/${s.tradesOffered} sharpe=${s.sharpe} DD=${s.maxDDPct}% final=$${s.finalBalance?.toLocaleString()}`);
}
console.log(`=== Monday's REAL live config: margin=${FIB_ATLAS_MONDAY_MIN_MARGIN}, chandelier (mult=${MONDAY_CHANDELIER_MULT}), own filters ===`);
report('Monday live config', await build(FIB_ATLAS_MONDAY_MIN_MARGIN));
process.exit(0);
