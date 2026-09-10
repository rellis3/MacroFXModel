// Timeout Filter P&L Impact — 2026-09-10
//
// Direct follow-up to timeout_predictability_study.mjs, which found
// sessionPos='3·late' predicts a timeout (outcome:'neither') with a massive,
// 17/17-pair-consistent effect (avg deltaOOS ~26.5pp, individual pairs
// 37-60pp). That proves timeout is predictable. It does NOT prove skipping
// those touches actually helps the REAL traded P&L -- a touch flagged
// "likely to time out" might still be a perfectly good trade when it DOES
// resolve, and removing a third of the session doesn't automatically help
// just because some of what's removed is lower-quality on average.
//
// This tests it directly, on the CORRECTED (2026-09-09 fix, schema-2 logic)
// trade population: build the real margin>=3 traded portfolio two ways --
// UNFILTERED (current, corrected behavior) vs FILTERED (sessionPos='3·late'
// touches never become entry candidates at all) -- same concurrency cap,
// same risk-adjust, same everything else. OOS only, real cost.
//
// PURE ANALYSIS. Does not touch buildBarrierTrades, voteDecision, the live
// bot, or level-atlas-vote-portfolio.html.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook } from '../js/levelAtlasReport.js';
import { buildBarrierTrades, applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries } from '../js/levelAtlasVoteReview.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { costForPair } from '../js/perLineStrategy.js';
import { portfolioStats } from '../js/backtestStats.js';
import { summarizeTrades, maxDrawdownFromPnls } from '../js/metricsCore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');
const DEFAULT_REARM = 0.3;

const ALL_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const PAIRS = process.env.LA_PAIRS ? process.env.LA_PAIRS.split(',') : ALL_PAIRS;

const unfilteredPerPair = {}, filteredPerPair = {};
let totalTouchesLate = 0, totalTouches = 0, tradesRemovedByFilter = 0;

for (const pair of PAIRS) {
  console.log(`${pair.toUpperCase()}: loading M1...`);
  const packed = await loadM1ForPair(pair);
  const assetClass = assetClassFor(pair);
  const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [DEFAULT_REARM], pendingRearmFrac: DEFAULT_REARM });
  const book = buildAtlasBook(touches, { rearmFrac: DEFAULT_REARM });
  if (!book) { console.log('  no book -- skipping'); continue; }
  const cost = costForPair(pair, assetClass);

  const lateCount = touches.filter(t => t.sessionPos === '3·late').length;
  totalTouchesLate += lateCount; totalTouches += touches.length;

  const unfilteredTrades = buildBarrierTrades(touches, book, { rearmFrac: DEFAULT_REARM, cost, minMargin: 3 });
  const filteredTouches = touches.filter(t => t.sessionPos !== '3·late');
  const filteredTrades = buildBarrierTrades(filteredTouches, book, { rearmFrac: DEFAULT_REARM, cost, minMargin: 3 });

  unfilteredPerPair[pair.toUpperCase()] = unfilteredTrades;
  filteredPerPair[pair.toUpperCase()] = filteredTrades;
  tradesRemovedByFilter += (unfilteredTrades.length - filteredTrades.length);
  console.log(`  touches: ${touches.length} (${lateCount} late-session) | margin>=3 trades: unfiltered=${unfilteredTrades.length} filtered=${filteredTrades.length}`);
}

console.log(`\nTOTAL: ${totalTouches} touches, ${totalTouchesLate} (${(100 * totalTouchesLate / totalTouches).toFixed(1)}%) are late-session`);
console.log(`Trades removed by the filter: ${tradesRemovedByFilter}\n`);

function combinedStats(perPair) {
  const weights = Object.fromEntries(Object.keys(perPair).map(p => [p, 1]));
  const capped = {};
  for (const [p, trades] of Object.entries(perPair)) {
    capped[p] = applyConcurrencyCap(trades, { maxConcurrent: 1 }).kept.map(t => ({ ...t, pair: p }));
  }
  const riskAdjusted = {};
  for (const [p, trades] of Object.entries(capped)) riskAdjusted[p] = riskAdjustTrades(trades, 1).map(t => ({ ...t, pair: p }));
  const combined = buildPortfolioDailySeries(riskAdjusted, { weights });
  const s = portfolioStats(combined.dailyReturns, { mc: false });
  const allTrades = Object.values(capped).flat();
  const st = summarizeTrades(allTrades.map(t => t.pnlPct), allTrades.map(t => t.date));
  const years = combined.dailyReturns.length / 252;
  const maxDDNonCompounded = +maxDrawdownFromPnls(combined.dailyReturns).toFixed(2);
  return {
    ...s, tradeCount: allTrades.length, perTradeWinRate: st.winRate, perTradeSharpe: st.sharpe,
    years: +years.toFixed(2), maxDDNonCompounded,
  };
}

const unfilteredStats = combinedStats(unfilteredPerPair);
const filteredStats = combinedStats(filteredPerPair);
console.log('UNFILTERED (current, corrected behavior):', JSON.stringify({
  sharpe: unfilteredStats.sharpe, cagr: unfilteredStats.cagr, maxDD: unfilteredStats.maxDD,
  maxDDNonCompounded: unfilteredStats.maxDDNonCompounded, profitFactor: unfilteredStats.profitFactor,
  winRate: unfilteredStats.winRate, tradeCount: unfilteredStats.tradeCount, perTradeWinRate: unfilteredStats.perTradeWinRate,
}));
console.log('FILTERED (sessionPos=late never entered):', JSON.stringify({
  sharpe: filteredStats.sharpe, cagr: filteredStats.cagr, maxDD: filteredStats.maxDD,
  maxDDNonCompounded: filteredStats.maxDDNonCompounded, profitFactor: filteredStats.profitFactor,
  winRate: filteredStats.winRate, tradeCount: filteredStats.tradeCount, perTradeWinRate: filteredStats.perTradeWinRate,
}));

fs.writeFileSync(path.join(OUT_DIR, 'timeout_filter_pnl_impact.json'), JSON.stringify({
  totalTouches, totalTouchesLate, tradesRemovedByFilter, unfilteredStats, filteredStats,
}, null, 1));
