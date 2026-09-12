// Asymmetric Margin-Scaled Sizing + Drawdown Throttle — 2026-09-10
//
// Refines the 2026-09-10 MARGIN_SCALED finding (sizing by vote-margin
// conviction beat flat sizing on every metric, confirmed 17/17 pairs).
// Two changes tested here, on the CORRECTED (2026-09-09 fix) trade
// population:
//
//   ASYMMETRIC   -- the original scheme (min(margin/3,2), i.e. 1x-2x) mostly
//                   boosted the top. This version cuts the bottom harder
//                   instead: weight(margin) = clamp(0.5 + 0.25*(margin-3),
//                   0.5, 1.5) -- margin=3 (bare minimum) gets HALF size,
//                   margin>=7 caps at 1.5x (gentler upside than before).
//                   Hypothesis: most of the drawdown benefit comes from
//                   shrinking the weakest trades, not growing the strongest
//                   (which just adds fresh tail-risk exposure).
//   +THROTTLE    -- layers the ALREADY-VALIDATED drawdown throttle
//                   (js/levelAtlasVoteReview.js's applyDrawdownThrottle,
//                   trigger=-8/restore=-2/mult=0.2, same params discussed
//                   this session) on top -- re-tested here because all its
//                   earlier validation was on the OLD, pre-fix population.
//   +HEAT_CAP    -- included for comparison only. applyPortfolioHeatCap's
//                   OWN doc says it barely dented the real worst drawdown
//                   historically, because that drawdown was a sustained
//                   losing STRETCH across days, not simultaneous position
//                   pile-up -- a concurrency cap can't fix a sequential-
//                   losses problem. Expect this one to underperform
//                   throttle, not treated as the primary second lever.
//
// All schemes normalized so mean risk_pct = 1% (apples-to-apples vs
// baseline and the earlier MARGIN_SCALED result).
//
// PURE ANALYSIS. Does not touch buildBarrierTrades, voteDecision, the live
// bot, or level-atlas-vote-portfolio.html.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook } from '../js/levelAtlasReport.js';
import { buildBarrierTrades, applyConcurrencyCap, buildPortfolioDailySeries, applyPortfolioHeatCap, applyDrawdownThrottle } from '../js/levelAtlasVoteReview.js';
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

// ── weight functions ──
const symmetricWeight = t => Math.min(t.margin / 3, 2);                                  // original MARGIN_SCALED
const asymmetricWeight = t => Math.min(Math.max(0.5 + 0.25 * (t.margin - 3), 0.5), 1.5);  // new: cut bottom harder, cap upside gentler

function normalize(weightFn) {
  const weights = allTrades.map(weightFn);
  const avg = weights.reduce((a, w) => a + w, 0) / weights.length;
  return t => BASE_RISK * (weightFn(t) / avg);
}
const flatRisk = () => BASE_RISK;
const symmetricRisk = normalize(symmetricWeight);
const asymmetricRisk = normalize(asymmetricWeight);

function riskAdjustCustom(trades, riskPctFn) {
  return trades.map(t => {
    const sizingPips = t.sizingStopPips ?? t.stopPips;
    const stopRiskPct = sizingPips * t.pip / t.entry * 100;
    const r = stopRiskPct > 1e-9 ? t.pnlPct / stopRiskPct : 0;
    const riskPct = riskPctFn(t);
    return { ...t, pnlPct: +(r * riskPct).toFixed(4), rMultiple: +r.toFixed(3), riskPctUsed: riskPct };
  });
}

function statsFromDaily(dailyReturns) {
  const s = portfolioStats(dailyReturns, { mc: false });
  const years = dailyReturns.length / 252;
  const totalNC = +dailyReturns.reduce((a, r) => a + r, 0).toFixed(2);
  const cagrNC = years > 0 ? +(totalNC / years).toFixed(2) : 0;
  const maxDDNC = +maxDrawdownFromPnls(dailyReturns).toFixed(2);
  const calmarNC = maxDDNC < 0 ? +(cagrNC / Math.abs(maxDDNC)).toFixed(2) : 0;
  return { sharpe: s.sharpe, cagr: s.cagr, maxDD: s.maxDD, calmar: s.calmar, cagrNC, maxDDNC, calmarNC };
}

function buildCombinedDaily(riskPctFn) {
  const riskAdjusted = {};
  for (const [p, trades] of Object.entries(perPairCapped)) riskAdjusted[p] = riskAdjustCustom(trades, riskPctFn);
  const weights = Object.fromEntries(Object.keys(riskAdjusted).map(p => [p, 1]));
  return { combined: buildPortfolioDailySeries(riskAdjusted, { weights }), riskAdjusted };
}

console.log(`\nTrade count is IDENTICAL across baseline/margin-scaled/asymmetric/throttle (${allTrades.length}) -- none of those remove a single trade, they only resize/rescale. Only heat cap actually drops trades.\n`);
console.log('=== RESULTS (mean risk_pct held at 1% across all schemes) ===');
const results = {};

// BASELINE, symmetric MARGIN_SCALED (reference), ASYMMETRIC
for (const [name, fn] of [['BASELINE', flatRisk], ['MARGIN_SCALED (prior)', symmetricRisk], ['ASYMMETRIC', asymmetricRisk]]) {
  const { combined } = buildCombinedDaily(fn);
  const r = statsFromDaily(combined.dailyReturns);
  r.tradeCount = allTrades.length;
  results[name] = r;
  console.log(`${name.padEnd(24)} sharpe=${r.sharpe}  cagr=${r.cagr}%  maxDD=${r.maxDD}%  calmar=${r.calmar}  |  cagrNC=${r.cagrNC}%  maxDDNC=${r.maxDDNC}%  calmarNC=${r.calmarNC}  trades=${r.tradeCount}`);
}
console.log(`  -> Calmar (return per unit of drawdown): BASELINE=${results['BASELINE'].calmar}, worth comparing every other scheme against THIS number, not just against 0.`);

// ASYMMETRIC + THROTTLE
{
  const { combined } = buildCombinedDaily(asymmetricRisk);
  const throttled = applyDrawdownThrottle(combined.dailyReturns, combined.dates, { triggerDD: -8, restoreDD: -2, throttleMult: 0.2 });
  const dr = throttled ? throttled.dailyReturns : combined.dailyReturns;
  const r = statsFromDaily(dr);
  r.tradeCount = allTrades.length;
  if (throttled) {
    const throttledDays = throttled.state.filter(s => s.throttled).length;
    console.log(`  Throttle diagnostics: throttled on ${throttledDays} of ${throttled.state.length} days (${(100 * throttledDays / throttled.state.length).toFixed(1)}%)`);
    // How much of the UN-throttled cumulative return got given up, purely from the days that WERE throttled being cut to 20%?
    const unthrottledSum = combined.dailyReturns.reduce((a, r) => a + r, 0);
    const throttledSum = dr.reduce((a, r) => a + r, 0);
    console.log(`  Sum of daily returns: un-throttled=${unthrottledSum.toFixed(1)}%, throttled=${throttledSum.toFixed(1)}% (non-compounded, so this isolates the throttle's own effect from compounding)`);
  }
  results['ASYMMETRIC + THROTTLE'] = r;
  console.log(`${'ASYMMETRIC + THROTTLE'.padEnd(24)} sharpe=${r.sharpe}  cagr=${r.cagr}%  maxDD=${r.maxDD}%  calmar=${r.calmar}  |  cagrNC=${r.cagrNC}%  maxDDNC=${r.maxDDNC}%  calmarNC=${r.calmarNC}`);
}

// ASYMMETRIC + HEAT_CAP (comparison only, expect it to underperform throttle)
{
  const { riskAdjusted } = buildCombinedDaily(asymmetricRisk);
  const capped = applyPortfolioHeatCap(riskAdjusted, { maxHeatPct: 1 });
  if (capped) {
    const byPair = {};
    for (const t of capped.kept) (byPair[t.pair] ??= []).push(t);
    const weights = Object.fromEntries(Object.keys(byPair).map(p => [p, 1]));
    const combined2 = buildPortfolioDailySeries(byPair, { weights });
    const r = statsFromDaily(combined2.dailyReturns);
    r.tradeCount = capped.kept.length;
    results['ASYMMETRIC + HEAT_CAP(1%)'] = r;
    console.log(`${'ASYMMETRIC + HEAT_CAP(1%)'.padEnd(24)} sharpe=${r.sharpe}  cagr=${r.cagr}%  maxDD=${r.maxDD}%  calmar=${r.calmar}  |  cagrNC=${r.cagrNC}%  maxDDNC=${r.maxDDNC}%  calmarNC=${r.calmarNC}  trades=${r.tradeCount} (${allTrades.length - r.tradeCount} dropped by the heat budget)`);
  }
}

fs.writeFileSync(path.join(OUT_DIR, 'asymmetric_sizing_plus_throttle.json'), JSON.stringify(results, null, 1));
