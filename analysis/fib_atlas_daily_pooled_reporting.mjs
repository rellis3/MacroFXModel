/**
 * Daily-pooled Sharpe/drawdown fix (2026-09-26) — re-reports today's key
 * findings (FX+gold honest vs leaky, indices comparison) with the
 * methodology fix flagged earlier: `summarizeTrades` is fine as a metrics
 * ENGINE, but every script run today (including this investigation's own)
 * fed it PER-TRADE pnl arrays directly, so its `tradesPerYr = n/yrs`
 * annualizes off raw trade COUNT. With thousands of trades/year pooled
 * across correlated pairs (EURUSD/EURGBP/EURJPY share EUR exposure), that's
 * the exact mechanism behind Sharpe 15-33 and multi-hundred-percent CAGR
 * figures being definitionally not real.
 *
 * The fix needs no change to summarizeTrades itself: pool trades into ONE
 * return per CALENDAR DAY first (summing same-day pnl — this is what
 * naturally captures cross-pair correlation, since correlated pairs' same-
 * day trades combine before variance is computed), then feed summarizeTrades
 * one row per trading DAY instead of one row per trade. `tradesPerYr`
 * becomes "trading days per year" and the whole Sharpe/skew/kurtosis stack
 * operates on the honest daily distribution -- standard portfolio-Sharpe
 * practice, not a new invention.
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

// Pools raw per-trade rows into one return per calendar day, THEN hands that
// to summarizeTrades -- this is the entire fix. Also reports the naive
// per-trade number alongside, so the gap between them is visible directly
// rather than asserted.
function dailyPooledSummary(trades) {
  const byDate = new Map();
  for (const t of trades) byDate.set(t.date, (byDate.get(t.date) ?? 0) + t.pnlPct);
  const dates = [...byDate.keys()].sort();
  const dailyReturns = dates.map(d => byDate.get(d));
  const daily = summarizeTrades(dailyReturns, dates);
  const naive = summarizeTrades(trades.map(t => t.pnlPct), trades.map(t => t.date));
  let equity = 0, peak = 0, maxDD = 0;
  for (const r of dailyReturns) { equity += r; if (equity > peak) peak = equity; maxDD = Math.min(maxDD, equity - peak); }
  return {
    tradeCount: trades.length, tradingDays: dates.length,
    dailySharpe: daily.sharpe, dailyWinRate: daily.winRate, dailyMaxDD: +maxDD.toFixed(2), totalReturnPct: +equity.toFixed(2),
    naivePerTradeSharpe: naive.sharpe,
    profitFactor: naive.profitFactor, expectancy: naive.expectancy, // unaffected by pooling -- ratios/means over the trade population, not annualized
  };
}

async function honestTradesFor(pairs) {
  const trades = [];
  for (const pair of pairs) {
    let packed;
    try { packed = await loadM1ForPair(pair); } catch (e) { console.warn(`${pair}: load failed - ${e.message}`); continue; }
    if (!packed?.n) continue;
    const assetClass = assetClassFor(pair);
    const cost = costForPair(pair, assetClass);
    for (const ladder of LADDERS) {
      const walkFn = ladder === 'asia' ? asiaFibAtlasWalk : mondayFibAtlasWalk;
      let touches;
      try { ({ touches } = walkFn(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [REARM], pendingRearmFrac: REARM })); }
      catch (e) { continue; }
      const atRearm = touches.filter(t => t.rearmFrac === REARM);
      if (atRearm.length < 200) continue;
      const { is: isOnly, oos: trueOOS } = splitAt(atRearm);
      if (!isOnly.length || !trueOOS.length) continue;
      const honestBook = buildAsiaFibAtlasBook(isOnly, { rearmFrac: REARM });
      if (!honestBook) continue;
      for (const t of trueOOS) {
        const vd = voteDecision(honestBook, t);
        if (!vd || vd.margin < MIN_MARGIN) continue;
        if (t.clearancePips == null || t.clearancePips < MIN_CLEARANCE_PIPS) continue;
        const priced = priceBarrierTrade(t, vd.decision, cost);
        if (!priced) continue;
        trades.push({ pair, ladder, date: t.date, pnlPct: priced.pnlPct });
      }
    }
    console.log(`  ${pair} done`);
  }
  return trades;
}

console.log('Building FX+gold honest trade list...');
const fxGold = await honestTradesFor(FX_GOLD_PAIRS);
console.log('Building indices honest trade list...');
const indices = await honestTradesFor(INDEX_PAIRS);

function report(label, trades) {
  const r = dailyPooledSummary(trades);
  console.log(`\n=== ${label} ===`);
  console.log(`trades=${r.tradeCount}, trading days=${r.tradingDays}`);
  console.log(`DAILY-POOLED Sharpe (headline, honest): ${r.dailySharpe}`);
  console.log(`naive per-trade Sharpe (what every script today actually reported): ${r.naivePerTradeSharpe}`);
  console.log(`pooled max drawdown: ${r.dailyMaxDD}%,  total return (fixed-risk, non-reinvested): ${r.totalReturnPct}%`);
  console.log(`profit factor: ${r.profitFactor}, expectancy/trade: ${r.expectancy}%  (unaffected by pooling)`);
}

report('FX+GOLD (honest, clearance-filtered)', fxGold);
report('INDICES (honest, clearance-filtered)', indices);
report('FX+GOLD+INDICES COMBINED', [...fxGold, ...indices]);
process.exit(0);
