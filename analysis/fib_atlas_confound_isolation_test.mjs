/**
 * Resolves a false alarm: a same-day re-verification of
 * fib_atlas_confluence_only_test.mjs's Asia finding (dropped chandelier
 * trailing for simplicity, kept everything else) showed the confluence
 * edge collapsing (margin=2 Sharpe +0.74->-1.23, margin=1+confluence
 * +1.38->0.15) right after two more real bugs were fixed in the same
 * engine (this session's own lastVisit-cap fix, commit c01c6ed, plus a
 * concurrent session's "atlas" fix for a 'neither'-outcome resolveTime
 * gap). Before concluding the confluence idea was undone by the extra
 * fixes, isolated the confound: this script holds the exit method FIXED
 * at chandelier (matching the ORIGINAL test) and only varies base-vs-
 * chandelier, with the current (triply-fixed) engine throughout.
 *
 * Result: with chandelier held constant, the numbers come back in line
 * with the original finding -- margin=2 Sharpe 0.74->0.86 (slightly
 * BETTER), margin=1+confluence Sharpe 1.38->1.07 (a modest, believable
 * haircut, not a collapse). The earlier "reversal" was overwhelmingly
 * the exit-method change I introduced myself when simplifying the
 * re-verification, not the two additional bug fixes undoing the
 * confluence edge. The real, legitimate effect of the two extra fixes on
 * this finding is small (1.38->1.07), not a refutation.
 */
const REPO = 'C:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel';
const { loadM1ForPair } = await import(`file:///${REPO}/js/volBacktestM1Engine.js`);
const { asiaFibAtlasWalk } = await import(`file:///${REPO}/js/asiaFibAtlasEngine.js`);
const { buildAsiaFibAtlasBook } = await import(`file:///${REPO}/js/asiaFibAtlasReport.js`);
const { splitAt } = await import(`file:///${REPO}/js/levelAtlasReport.js`);
const { runBarrierWalkForward } = await import(`file:///${REPO}/js/asiaFibAtlasVoteReview.js`);
const { applyTrailingContinuation } = await import(`file:///${REPO}/js/levelAtlasVoteReview.js`);
const { assetClassFor } = await import(`file:///${REPO}/js/forecastAnalyserStore.js`);
const { costForPair } = await import(`file:///${REPO}/js/perLineStrategy.js`);
const { buildFibAtlasVotePortfolio } = await import(`file:///${REPO}/js/fibAtlasVotePortfolio.js`);

const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurgbp', 'euraud', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'];
const DEFAULT_REARM = 0.3;
const ASIA_CHANDELIER_MULT = 3, CHANDELIER_PERIOD = 60;

async function walkPair(pair) {
  const sym = pair.toUpperCase();
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) return null;
  const assetClass = assetClassFor(pair);
  const cost = costForPair(pair, assetClass);
  const res = asiaFibAtlasWalk(packed, { instrument: sym, assetClass, rearmFracs: [DEFAULT_REARM] });
  const atRearm = res.touches.filter(t => t.rearmFrac === DEFAULT_REARM);
  const { split } = splitAt(atRearm);
  const isOnly = atRearm.filter(t => t.date < split);
  const honestBook = buildAsiaFibAtlasBook(isOnly, { rearmFrac: DEFAULT_REARM });
  if (!honestBook) return null;

  const wfAll = runBarrierWalkForward(atRearm, honestBook, { rearmFrac: DEFAULT_REARM, cost, minMargin: 1, oosStartDate: split });
  const confTouches = atRearm.filter(t => t.asiaConfPips != null && t.asiaConfPips <= 2);
  const wfConf = runBarrierWalkForward(confTouches, honestBook, { rearmFrac: DEFAULT_REARM, cost, minMargin: 1, oosStartDate: split });

  // Chandelier trail on top of the SAME (triply-fixed) trades -- matching
  // asiaFibAtlasRoutes.js's own generation call exactly (trailMode
  // chandelier, decisions fade+follow, applied to the baseline walk's own
  // trades using the same packed M1).
  const chandAll = applyTrailingContinuation(wfAll?.trades ?? [], packed, { cost, decisions: ['fade', 'follow'], trailMode: 'chandelier', chandelierMult: ASIA_CHANDELIER_MULT, chandelierPeriod: CHANDELIER_PERIOD })
    .map(t => t.trailedPnlPct == null ? t : { ...t, pnlPct: t.trailedPnlPct, pnlPips: t.trailedPnlPips, resolveTime: t.trailedResolveTime });
  const chandConf = applyTrailingContinuation(wfConf?.trades ?? [], packed, { cost, decisions: ['fade', 'follow'], trailMode: 'chandelier', chandelierMult: ASIA_CHANDELIER_MULT, chandelierPeriod: CHANDELIER_PERIOD })
    .map(t => t.trailedPnlPct == null ? t : { ...t, pnlPct: t.trailedPnlPct, pnlPips: t.trailedPnlPips, resolveTime: t.trailedResolveTime });

  return { sym, baseAll: wfAll?.trades ?? [], baseConf: wfConf?.trades ?? [], chandAll, chandConf };
}

const results = [];
for (const pair of PAIRS) {
  try { const r = await walkPair(pair); if (r) results.push(r); console.log(`${pair.toUpperCase()} done`); }
  catch (e) { console.error(`${pair.toUpperCase()}: FAILED (${e.message})`); }
}

async function build(field, minMargin) {
  const constituentKeys = results.map(r => `${r.sym}|asia`);
  const cachedLoader = async (key) => {
    const sym = key.split('|')[0];
    const r = results.find(x => x.sym === sym);
    if (!r) return null;
    return { trades: r[field], instrument: sym, groupKey: `${sym} (asia)`, ladder: 'asia' };
  };
  return buildFibAtlasVotePortfolio({
    pairs: constituentKeys, minMargin, maxConcurrent: 1, perDirection: true,
    sizing: 'fixed-risk', riskPct: 0.5, stopTightenFrac: 0.9, minCostRatio: 3, maxGapMin: 30,
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
console.log('=== isolating the chandelier-exit confound (triply-fixed engine throughout) ===');
report('margin=2, base exit,      no confluence', await build('baseAll', 2));
report('margin=2, CHANDELIER exit, no confluence', await build('chandAll', 2));
report('margin=1, base exit,      confluence<=2p', await build('baseConf', 1));
report('margin=1, CHANDELIER exit, confluence<=2p', await build('chandConf', 1));
process.exit(0);
