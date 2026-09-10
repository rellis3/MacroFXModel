// Kelly Ceiling & Sizing Sweep — 2026-09-10
//
// C.OG's question, answered with real numbers on the CORRECTED (2026-09-09
// fix) trade population: how close is current sizing to the theoretical
// (Kelly) ceiling, and does moving toward it ever SHRINK max drawdown, or
// does it only ever grow it (as Kelly math predicts -- bigger bets, bigger
// swings, always, under fixed-fractional compounding).
//
// Part 1: Kelly fraction from real trade R-multiples. R = pnlPct (BEFORE
// riskAdjustTrades rescaling, i.e. priceBarrierTrade's raw output) divided by
// the trade's own 1R risk unit in % terms (stopPips*pip/entry*100) -- so a
// full stop-out is exactly -1R, a full target hit is +targetPips/stopPips R,
// and (new, post-fix) a timed-out trade lands somewhere continuous in
// between, not just the old binary +/-fixed outcome.
//   continuous Kelly: f* = mean(R) / var(R)
//   binary-approx Kelly: f* = winRate/avgLossR(mag) - (1-winRate)/avgWinR  [standard form]
//
// Part 2: real position-size sweep. Same trade list, riskAdjustTrades at
// risk_pct = 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, then at the computed Kelly%
// itself and a fraction past it -- reports Sharpe/CAGR/maxDD BOTH compounded
// and non-compounded (additive) at every level, since the two disagreed on
// the earlier timeout-filter test and non-compounded is the one not
// distorted by equity-curve-scale effects.
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
import { maxDrawdownFromPnls } from '../js/metricsCore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');
const DEFAULT_REARM = 0.3;

const ALL_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const PAIRS = process.env.LA_PAIRS ? process.env.LA_PAIRS.split(',') : ALL_PAIRS;

// perPair[pair] = concurrency-capped, UN-risk-adjusted trades (raw pnlPct
// from priceBarrierTrade, i.e. gross-minus-cost at whatever the underlying
// price move was -- riskAdjustTrades hasn't touched these yet).
const perPairCapped = {};

for (const pair of PAIRS) {
  console.log(`${pair.toUpperCase()}: loading M1...`);
  const packed = await loadM1ForPair(pair);
  const assetClass = assetClassFor(pair);
  const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [DEFAULT_REARM], pendingRearmFrac: DEFAULT_REARM });
  const book = buildAtlasBook(touches, { rearmFrac: DEFAULT_REARM });
  if (!book) { console.log('  no book -- skipping'); continue; }
  const cost = costForPair(pair, assetClass);
  const trades = buildBarrierTrades(touches, book, { rearmFrac: DEFAULT_REARM, cost, minMargin: 3 });
  const capped = applyConcurrencyCap(trades, { maxConcurrent: 1 }).kept.map(t => ({ ...t, pair: pair.toUpperCase() }));
  perPairCapped[pair.toUpperCase()] = capped;
  console.log(`  ${capped.length} concurrency-capped margin>=3 trades`);
}

const allTrades = Object.values(perPairCapped).flat();
console.log(`\nTotal trades for Kelly calc: ${allTrades.length}`);

// ── Part 1: Kelly from real R-multiples ─────────────────────────────────
const rMultiples = allTrades.map(t => {
  const riskUnitPct = (t.stopPips * t.pip / t.entry) * 100; // the trade's own 1R, in the SAME % units pnlPct is in
  return riskUnitPct > 0 ? t.pnlPct / riskUnitPct : null;
}).filter(r => r != null);

const n = rMultiples.length;
const meanR = rMultiples.reduce((a, r) => a + r, 0) / n;
const varR = rMultiples.reduce((a, r) => a + (r - meanR) ** 2, 0) / n;
const kellyContinuous = meanR / varR; // as a fraction, e.g. 0.08 = 8%

const wins = rMultiples.filter(r => r > 0);
const losses = rMultiples.filter(r => r <= 0);
const winRate = wins.length / n;
const avgWinR = wins.reduce((a, r) => a + r, 0) / wins.length;
const avgLossR = Math.abs(losses.reduce((a, r) => a + r, 0) / losses.length);
const kellyBinary = (winRate / avgLossR) - ((1 - winRate) / avgWinR);

console.log(`\n=== KELLY (corrected trade population) ===`);
console.log(`n=${n}  winRate=${(winRate * 100).toFixed(1)}%  avgWinR=${avgWinR.toFixed(3)}R  avgLossR=${avgLossR.toFixed(3)}R  meanR=${meanR.toFixed(4)}  varR=${varR.toFixed(4)}`);
console.log(`Continuous Kelly f* = ${(kellyContinuous * 100).toFixed(2)}%  |  Binary-approx Kelly f* = ${(kellyBinary * 100).toFixed(2)}%`);

// ── Part 2: real sizing sweep ─────────────────────────────────────────────
function statsAtRisk(riskPct) {
  const riskAdjusted = {};
  for (const [p, trades] of Object.entries(perPairCapped)) riskAdjusted[p] = riskAdjustTrades(trades, riskPct).map(t => ({ ...t, pair: p }));
  const weights = Object.fromEntries(Object.keys(riskAdjusted).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(riskAdjusted, { weights });
  const s = portfolioStats(combined.dailyReturns, { mc: false });
  const years = combined.dailyReturns.length / 252;
  const totalNonCompoundedReturn = +combined.dailyReturns.reduce((a, r) => a + r, 0).toFixed(2);
  const cagrNonCompounded = years > 0 ? +(totalNonCompoundedReturn / years).toFixed(2) : 0;
  const maxDDNonCompounded = +maxDrawdownFromPnls(combined.dailyReturns).toFixed(2);
  return {
    riskPct, sharpe: s.sharpe, cagr: s.cagr, maxDD: s.maxDD, calmar: s.calmar,
    cagrNonCompounded, maxDDNonCompounded,
    calmarNonCompounded: maxDDNonCompounded < 0 ? +(cagrNonCompounded / Math.abs(maxDDNonCompounded)).toFixed(2) : 0,
  };
}

const kellyPct = kellyContinuous * 100;
const sweepLevels = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, +kellyPct.toFixed(2), +(kellyPct * 1.25).toFixed(2), +(kellyPct * 1.5).toFixed(2)]
  .filter((v, i, a) => v > 0 && a.indexOf(v) === i)
  .sort((a, b) => a - b);

console.log(`\n=== SIZING SWEEP (Kelly f*=${kellyPct.toFixed(2)}% marked) ===`);
console.log('risk%'.padEnd(8), 'sharpe'.padEnd(8), 'cagr%'.padEnd(10), 'maxDD%'.padEnd(9), 'calmar'.padEnd(8), 'cagrNC%'.padEnd(10), 'maxDDNC%'.padEnd(10), 'calmarNC');
const sweepResults = [];
for (const riskPct of sweepLevels) {
  const r = statsAtRisk(riskPct);
  sweepResults.push(r);
  const marker = Math.abs(riskPct - kellyPct) < 0.01 ? ' <-- KELLY' : '';
  console.log(String(riskPct).padEnd(8), String(r.sharpe).padEnd(8), String(r.cagr).padEnd(10), String(r.maxDD).padEnd(9), String(r.calmar).padEnd(8), String(r.cagrNonCompounded).padEnd(10), String(r.maxDDNonCompounded).padEnd(10), r.calmarNonCompounded + marker);
}

fs.writeFileSync(path.join(OUT_DIR, 'kelly_ceiling_and_sizing_sweep.json'), JSON.stringify({
  n, winRate, avgWinR, avgLossR, meanR, varR, kellyContinuous, kellyBinary, sweepResults,
}, null, 1));
