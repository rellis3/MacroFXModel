// Sizing Scheme Comparison — 2026-09-10
//
// Tests real alternatives to flat 1%-risk-per-trade sizing, independently
// and combined, on the CORRECTED (2026-09-09 fix) trade population. All
// schemes are normalized so the TRADE-WEIGHTED AVERAGE risk_pct equals
// exactly 1% (matching the baseline) -- this isolates "does smarter
// ALLOCATION help" from "does using more total risk help" (a different,
// already-answered question from the Kelly sweep).
//
//   BASELINE      -- flat 1% every trade (current behavior)
//   EDGE-WEIGHTED -- risk scaled by the trade's OWN decision-type's Kelly
//                    fraction (fade and follow have different edges --
//                    confirmed 2026-09-10: fade 56.2% win, follow 58.4%)
//   MARGIN-SCALED -- risk scaled by vote margin (min(margin/3, 2), i.e.
//                    margin=3 -> baseline, margin>=6 -> capped at 2x)
//   COMBINED      -- both multiplied together, re-normalized to the same
//                    1% average
//
// PURE ANALYSIS. Does not touch buildBarrierTrades, voteDecision, the live
// bot, or level-atlas-vote-portfolio.html.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook } from '../js/levelAtlasReport.js';
import { buildBarrierTrades, applyConcurrencyCap, buildPortfolioDailySeries } from '../js/levelAtlasVoteReview.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { costForPair } from '../js/perLineStrategy.js';
import { portfolioStats } from '../js/backtestStats.js';
import { maxDrawdownFromPnls } from '../js/metricsCore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');
const DEFAULT_REARM = 0.3;
const BASE_RISK = 1;

const ALL_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const PAIRS = process.env.LA_PAIRS ? process.env.LA_PAIRS.split(',') : ALL_PAIRS;

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
  console.log(`  ${capped.length} trades`);
}
const allTrades = Object.values(perPairCapped).flat();
console.log(`\nTotal trades: ${allTrades.length}`);

// ── R-multiple per trade (same definition the Kelly script used) ──
function rMultiple(t) {
  const riskUnitPct = (t.stopPips * t.pip / t.entry) * 100;
  return riskUnitPct > 0 ? t.pnlPct / riskUnitPct : null;
}
function kellyOf(trades) {
  const rs = trades.map(rMultiple).filter(r => r != null);
  const mean = rs.reduce((a, r) => a + r, 0) / rs.length;
  const v = rs.reduce((a, r) => a + (r - mean) ** 2, 0) / rs.length;
  return mean / v;
}
const kellyFade = kellyOf(allTrades.filter(t => t.decision === 'fade'));
const kellyFollow = kellyOf(allTrades.filter(t => t.decision === 'follow'));
console.log(`\nFADE Kelly f* = ${(kellyFade * 100).toFixed(2)}%   FOLLOW Kelly f* = ${(kellyFollow * 100).toFixed(2)}%`);

// ── weight functions (raw, pre-normalization) ──
const edgeWeight = t => t.decision === 'fade' ? kellyFade : kellyFollow;
const marginWeight = t => Math.min(t.margin / 3, 2);
const combinedWeight = t => edgeWeight(t) * marginWeight(t);

function normalize(weightFn) {
  const weights = allTrades.map(weightFn);
  const avg = weights.reduce((a, w) => a + w, 0) / weights.length;
  return t => BASE_RISK * (weightFn(t) / avg); // mean risk_pct across all trades == BASE_RISK
}
const schemes = {
  BASELINE: () => BASE_RISK,
  EDGE_WEIGHTED: normalize(edgeWeight),
  MARGIN_SCALED: normalize(marginWeight),
  COMBINED: normalize(combinedWeight),
};

// ── custom per-trade riskAdjustTrades (same formula, per-trade riskPct) ──
function riskAdjustCustom(trades, riskPctFn) {
  return trades.map(t => {
    const sizingPips = t.sizingStopPips ?? t.stopPips;
    const stopRiskPct = sizingPips * t.pip / t.entry * 100;
    const r = stopRiskPct > 1e-9 ? t.pnlPct / stopRiskPct : 0;
    const riskPct = riskPctFn(t);
    return { ...t, pnlPct: +(r * riskPct).toFixed(4), rMultiple: +r.toFixed(3), riskPctUsed: riskPct };
  });
}

function combinedStats(riskPctFn) {
  const riskAdjusted = {};
  for (const [p, trades] of Object.entries(perPairCapped)) riskAdjusted[p] = riskAdjustCustom(trades, riskPctFn);
  const weights = Object.fromEntries(Object.keys(riskAdjusted).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(riskAdjusted, { weights });
  const s = portfolioStats(combined.dailyReturns, { mc: false });
  const years = combined.dailyReturns.length / 252;
  const totalNC = +combined.dailyReturns.reduce((a, r) => a + r, 0).toFixed(2);
  const cagrNC = years > 0 ? +(totalNC / years).toFixed(2) : 0;
  const maxDDNC = +maxDrawdownFromPnls(combined.dailyReturns).toFixed(2);
  const calmarNC = maxDDNC < 0 ? +(cagrNC / Math.abs(maxDDNC)).toFixed(2) : 0;
  const avgRisk = +(Object.values(riskAdjusted).flat().reduce((a, t) => a + t.riskPctUsed, 0) / Object.values(riskAdjusted).flat().length).toFixed(4);
  return { sharpe: s.sharpe, cagr: s.cagr, maxDD: s.maxDD, calmar: s.calmar, cagrNC, maxDDNC, calmarNC, avgRiskPctUsed: avgRisk };
}

console.log('\n=== RESULTS (mean risk_pct held at 1% across all schemes) ===');
const results = {};
for (const [name, fn] of Object.entries(schemes)) {
  const r = combinedStats(fn);
  results[name] = r;
  console.log(`${name.padEnd(15)} sharpe=${r.sharpe}  cagr=${r.cagr}%  maxDD=${r.maxDD}%  calmar=${r.calmar}  |  cagrNC=${r.cagrNC}%  maxDDNC=${r.maxDDNC}%  calmarNC=${r.calmarNC}  (avgRisk check: ${r.avgRiskPctUsed}%)`);
}

fs.writeFileSync(path.join(OUT_DIR, 'sizing_scheme_comparison.json'), JSON.stringify({
  kellyFade, kellyFollow, results,
}, null, 1));
