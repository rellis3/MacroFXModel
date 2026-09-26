/**
 * Fib Atlas look-ahead bias check (2026-09-26).
 *
 * Vote Atlas had TWO confirmed look-ahead leaks (project_vote_atlas_lookahead_
 * fix memory): (1) dropping unresolved touches (fixed, 5d5966f), and (2) a
 * DEEPER one -- annotateHolds/matchLiveContext (js/levelAtlasReport.js) select
 * which dimension-bucket combos "count" toward a vote by checking whether they
 * hold in the OOS half of the SAME pool the book was built from, then that
 * SAME OOS half gets scored as the backtest's trade list. Features chosen
 * because they worked in the test period, scored on that test period. Fixed
 * for Vote Atlas at the CALLER level (js/levelAtlasRoutes.js:208-211): build
 * the book from an in-sample-ONLY pool, score trades against a genuinely
 * separate, later held-out slice the book never saw.
 *
 * Fib Atlas's own book (js/asiaFibAtlasReport.js's buildAsiaFibAtlasBook)
 * imports annotateHolds/matchLiveContext DIRECTLY from levelAtlasReport.js --
 * same mechanism, same vulnerability. Checked every caller
 * (js/asiaFibAtlasRoutes.js, js/mondayFibAtlasRoutes.js): all of them call
 * buildAsiaFibAtlasBook(touches, ...) with the FULL pool, then
 * runBarrierWalkForward(touches, book, ...) scores that SAME full pool's OOS
 * slice -- the caller-side fix Vote Atlas got was never ported here. This
 * script measures whether that unfixed leak is real and how large it is,
 * mirroring analysis/vote_atlas_decomposition.mjs's method: score the exact
 * SAME genuinely-held-out touches against a LEAKY book (built on the full
 * pool, current production behavior) vs an HONEST book (built ONLY on the
 * in-sample half, never seeing the touches being scored).
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

const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurgbp', 'euraud', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'];
const LADDERS = ['asia', 'monday'];
const REARM = 0.3;
const MIN_MARGIN = 2;

const leakyTrades = [], honestTrades = [];
let processed = 0;

for (const pair of PAIRS) {
  let packed;
  try { packed = await loadM1ForPair(pair); } catch (e) { console.warn(`${pair}: load failed - ${e.message}`); continue; }
  if (!packed?.n) continue;
  const assetClass = assetClassFor(pair);
  const cost = costForPair(pair, assetClass);

  for (const ladder of LADDERS) {
    const walkFn = ladder === 'asia' ? asiaFibAtlasWalk : mondayFibAtlasWalk;
    let touches;
    try { ({ touches } = walkFn(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [REARM], pendingRearmFrac: REARM })); }
    catch (e) { console.warn(`${pair}/${ladder}: walk failed - ${e.message}`); continue; }
    const atRearm = touches.filter(t => t.rearmFrac === REARM);
    if (atRearm.length < 200) continue;

    // The TRUE held-out slice -- genuinely never touched by the honest book.
    const { split: trueSplit, is: isHalf, oos: trueOOS } = splitAt(atRearm, 0.6);
    if (!isHalf.length || !trueOOS.length) continue;

    const leakyBook = buildAsiaFibAtlasBook(atRearm, { rearmFrac: REARM });   // current production: full pool
    const honestBook = buildAsiaFibAtlasBook(isHalf, { rearmFrac: REARM });   // fixed pattern: in-sample only
    if (!leakyBook || !honestBook) continue;

    for (const t of trueOOS) {
      const row = { pair, ladder, date: t.date };
      const vdLeaky = voteDecision(leakyBook, t);
      if (vdLeaky && vdLeaky.margin >= MIN_MARGIN) {
        const priced = priceBarrierTrade(t, vdLeaky.decision, cost);
        if (priced) leakyTrades.push({ ...row, decision: vdLeaky.decision, margin: vdLeaky.margin, pnlPct: priced.pnlPct });
      }
      const vdHonest = voteDecision(honestBook, t);
      if (vdHonest && vdHonest.margin >= MIN_MARGIN) {
        const priced = priceBarrierTrade(t, vdHonest.decision, cost);
        if (priced) honestTrades.push({ ...row, decision: vdHonest.decision, margin: vdHonest.margin, pnlPct: priced.pnlPct });
      }
    }
    processed++;
    console.log(`${pair}/${ladder}: trueOOS ${trueOOS.length} (split ${trueSplit}), leaky book splitDate ${leakyBook.splitDate}, honest book splitDate ${honestBook.splitDate}`);
  }
}

console.log(`\nprocessed ${processed} pair/ladder combos`);
console.log(`\n=== LEAKY (current production: book built on FULL pool incl. the scored touches) n=${leakyTrades.length} ===`);
console.log(JSON.stringify(summarizeTrades(leakyTrades.map(t => t.pnlPct), leakyTrades.map(t => t.date))));
console.log(`\n=== HONEST (book built ONLY on the in-sample half, never seeing trueOOS) n=${honestTrades.length} ===`);
console.log(JSON.stringify(summarizeTrades(honestTrades.map(t => t.pnlPct), honestTrades.map(t => t.date))));

// Same-trade-population comparison isn't possible directly (different vote
// decisions/margins select different subsets from trueOOS) -- report per
// decision-type split too, since that's usually where a look-ahead leak
// concentrates (mirrors vote_atlas_decomposition.mjs's own breakdown).
for (const decision of ['fade', 'follow']) {
  const lk = leakyTrades.filter(t => t.decision === decision);
  const hn = honestTrades.filter(t => t.decision === decision);
  console.log(`\n-- decision=${decision} -- leaky n=${lk.length}, honest n=${hn.length}`);
  console.log('leaky :', JSON.stringify(summarizeTrades(lk.map(t => t.pnlPct), lk.map(t => t.date))));
  console.log('honest:', JSON.stringify(summarizeTrades(hn.map(t => t.pnlPct), hn.map(t => t.date))));
}
process.exit(0);
