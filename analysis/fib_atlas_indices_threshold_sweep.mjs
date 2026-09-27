/**
 * Fib Atlas indices — per-index clearance-threshold sweep (2026-09-26).
 *
 * The last remaining gap from the original indices validation plan
 * (project_fib_atlas_indices_exploration memory): thresholds have always
 * been FX-tuned defaults reused blindly for indices, never swept. FX's own
 * clearance threshold (1 pip) was chosen because Sharpe/PF/CAGR collapse
 * sharply below it even though win rate barely moves (analysis/
 * fib_atlas_limit_order_clearance_test.mjs) -- this repeats that same
 * sweep, per index, on the now-honest (look-ahead-fixed) pipeline.
 *
 * Margin isn't swept -- VOTE_DIMS has exactly 2 members, so it's only ever
 * 1 or 2 (asiaFibAtlasVoteReview.js's own doc); both are reported.
 */
const REPO = 'C:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel';
const { loadM1ForPair } = await import(`file:///${REPO}/js/volBacktestM1Engine.js`);
const { asiaFibAtlasWalk } = await import(`file:///${REPO}/js/asiaFibAtlasEngine.js`);
const { mondayFibAtlasWalk } = await import(`file:///${REPO}/js/mondayFibAtlasEngine.js`);
const { buildAsiaFibAtlasBook } = await import(`file:///${REPO}/js/asiaFibAtlasReport.js`);
const { splitAt } = await import(`file:///${REPO}/js/levelAtlasReport.js`);
const { voteDecision, priceBarrierTrade } = await import(`file:///${REPO}/js/asiaFibAtlasVoteReview.js`);
const { assetClassFor } = await import(`file:///${REPO}/js/forecastAnalyserStore.js`);
const { costForPair } = await import(`file:///${REPO}/js/perLineStrategy.js`);
const { summarizeTrades } = await import(`file:///${REPO}/js/metricsCore.js`);

const INDEX_PAIRS = ['nq', 'spx', 'de30', 'uk100', 'us2000', 'dow'];
const LADDERS = ['asia', 'monday'];
const REARM = 0.3;
const CLEARANCE_GRID = [0, 0.5, 1, 2, 3, 5, 10, 20];

async function honestTouchesFor(pair) {
  let packed;
  try { packed = await loadM1ForPair(pair); } catch (e) { console.warn(`${pair}: load failed - ${e.message}`); return []; }
  if (!packed?.n) return [];
  const assetClass = assetClassFor(pair);
  const cost = costForPair(pair, assetClass);
  const out = [];
  for (const ladder of LADDERS) {
    const walkFn = ladder === 'asia' ? asiaFibAtlasWalk : mondayFibAtlasWalk;
    let touches;
    try { ({ touches } = walkFn(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [REARM], pendingRearmFrac: REARM })); }
    catch (e) { console.warn(`${pair}/${ladder}: walk failed - ${e.message}`); continue; }
    const atRearm = touches.filter(t => t.rearmFrac === REARM);
    if (atRearm.length < 200) continue;
    const { split: realSplit, is: isOnly, oos: trueOOS } = splitAt(atRearm);
    if (!isOnly.length || !trueOOS.length) continue;
    const honestBook = buildAsiaFibAtlasBook(isOnly, { rearmFrac: REARM });
    if (!honestBook) continue;
    for (const t of trueOOS) {
      const vd = voteDecision(honestBook, t);
      if (!vd) continue;
      out.push({ pair, ladder, t, vd, cost });
    }
  }
  return out;
}

for (const pair of INDEX_PAIRS) {
  const rows = await honestTouchesFor(pair);
  console.log(`\n### ${pair.toUpperCase()} ###`);
  for (const minMargin of [1, 2]) {
    console.log(` -- minMargin=${minMargin} --`);
    console.log('  clearance | n     | winRate | PF     | expectancy | sharpe');
    for (const clearance of CLEARANCE_GRID) {
      const trades = [];
      for (const { t, vd, cost } of rows) {
        if (vd.margin < minMargin) continue;
        if (clearance > 0 && (t.clearancePips == null || t.clearancePips < clearance)) continue;
        const priced = priceBarrierTrade(t, vd.decision, cost);
        if (!priced) continue;
        trades.push({ date: t.date, pnlPct: priced.pnlPct });
      }
      if (!trades.length) { console.log(`  ${String(clearance).padStart(9)} | 0`); continue; }
      const s = summarizeTrades(trades.map(x => x.pnlPct), trades.map(x => x.date));
      console.log(`  ${String(clearance).padStart(9)} | ${String(s.trades).padStart(5)} | ${String(s.winRate).padStart(6)}% | ${String(s.profitFactor).padStart(6)} | ${String(s.expectancy).padStart(9)} | ${s.sharpe}`);
    }
  }
}
process.exit(0);
