/**
 * Fib Atlas indices — re-run on the HONEST (look-ahead-fixed) pipeline, with
 * the clearance filter applied (2026-09-26).
 *
 * The original indices pilot (2026-09-17, project_fib_atlas_indices_
 * exploration memory) found 12/12 positive combos, but flagged two real
 * gaps: no minimum-clearance filter, and thresholds reused FX defaults never
 * swept for indices. A LATER comparison (FX+gold baseline vs +indices, both
 * under the clearance filter) found a real diversification benefit -- but
 * that comparison used the production runOne/buildAsiaFibAtlasBook pipeline,
 * which this same investigation (analysis/fib_atlas_lookahead_bias_check.mjs)
 * found has a real, if modest, look-ahead leak. This script redoes that
 * comparison honestly: book built from in-sample touches only, scored
 * against a genuinely separate held-out window, clearance filter at 1 pip
 * (FX's own validated choice, not yet swept for indices specifically).
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

const FX_GOLD_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf',
  'eurgbp', 'euraud', 'gbpaud', 'audjpy', 'audnzd', 'audcad', 'cadjpy', 'nzdjpy', 'gold'];
const INDEX_PAIRS = ['nq', 'spx', 'de30', 'uk100', 'us2000', 'dow'];
const LADDERS = ['asia', 'monday'];
const REARM = 0.3;
const MIN_MARGIN = 2;
const MIN_CLEARANCE_PIPS = 1;

async function honestTradesFor(pairs, label) {
  const trades = [];
  for (const pair of pairs) {
    let packed;
    try { packed = await loadM1ForPair(pair); } catch (e) { console.warn(`${pair}: load failed - ${e.message}`); continue; }
    if (!packed?.n) { console.warn(`${pair}: no M1 data`); continue; }
    const assetClass = assetClassFor(pair);
    const cost = costForPair(pair, assetClass);

    for (const ladder of LADDERS) {
      const walkFn = ladder === 'asia' ? asiaFibAtlasWalk : mondayFibAtlasWalk;
      let touches;
      try { ({ touches } = walkFn(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [REARM], pendingRearmFrac: REARM })); }
      catch (e) { console.warn(`${pair}/${ladder}: walk failed - ${e.message}`); continue; }
      const atRearm = touches.filter(t => t.rearmFrac === REARM);
      if (atRearm.length < 200) { console.warn(`${pair}/${ladder}: too few touches (${atRearm.length})`); continue; }

      const { split: realSplit, is: isOnly, oos: trueOOS } = splitAt(atRearm);
      if (!isOnly.length || !trueOOS.length) continue;
      const honestBook = buildAsiaFibAtlasBook(isOnly, { rearmFrac: REARM });
      if (!honestBook) continue;

      let kept = 0, clearanceDropped = 0;
      for (const t of trueOOS) {
        const vd = voteDecision(honestBook, t);
        if (!vd || vd.margin < MIN_MARGIN) continue;
        if (t.clearancePips == null || t.clearancePips < MIN_CLEARANCE_PIPS) { clearanceDropped++; continue; }
        const priced = priceBarrierTrade(t, vd.decision, cost);
        if (!priced) continue;
        trades.push({ group: label, pair, ladder, date: t.date, decision: vd.decision, pnlPct: priced.pnlPct });
        kept++;
      }
      console.log(`${label}/${pair}/${ladder}: trueOOS ${trueOOS.length}, kept ${kept} (clearance-dropped ${clearanceDropped}), split ${realSplit}`);
    }
  }
  return trades;
}

function report(label, trades) {
  console.log(`\n=== ${label} (n=${trades.length}) ===`);
  if (!trades.length) { console.log('no trades'); return; }
  const byDate = new Map();
  for (const t of trades) byDate.set(t.date, (byDate.get(t.date) ?? 0) + t.pnlPct);
  const dates = [...byDate.keys()].sort();
  let equity = 0, peak = 0, maxDD = 0;
  for (const d of dates) { equity += byDate.get(d); if (equity > peak) peak = equity; maxDD = Math.min(maxDD, equity - peak); }
  console.log(JSON.stringify(summarizeTrades(trades.map(t => t.pnlPct), trades.map(t => t.date))));
  console.log(`pooled daily-return maxDD: ${maxDD.toFixed(2)}%, final: ${equity.toFixed(2)}%, trading days: ${dates.length}`);
}

const fxGoldTrades = await honestTradesFor(FX_GOLD_PAIRS, 'fxgold');
const indexTrades = await honestTradesFor(INDEX_PAIRS, 'index');

report('FX+GOLD BASELINE (honest, clearance-filtered)', fxGoldTrades);
report('INDICES ONLY (honest, clearance-filtered)', indexTrades);
report('FX+GOLD+INDICES COMBINED (honest, clearance-filtered)', [...fxGoldTrades, ...indexTrades]);

// Per-index breakdown -- the original pilot's "12/12 positive" claim was
// per-instrument, not just pooled; check whether that survives too.
console.log('\n--- per-index breakdown ---');
for (const pair of INDEX_PAIRS) {
  const t = indexTrades.filter(x => x.pair === pair);
  if (!t.length) { console.log(pair, 'no trades'); continue; }
  const s = summarizeTrades(t.map(x => x.pnlPct), t.map(x => x.date));
  console.log(pair, `n=${t.length} winRate=${s.winRate}% PF=${s.profitFactor} expectancy=${s.expectancy}`);
}
process.exit(0);
