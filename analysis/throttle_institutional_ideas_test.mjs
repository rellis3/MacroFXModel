// Institutional throttle ideas #2/#3/#4, tested against the real baseline — 2026-09-14
//
// Pure research, nothing deployed. Reuses the EXACT equity/peak/mult
// mechanics applyDrawdownThrottle already uses in production (same
// percent-return convention, same causal "day i sized off days 0..i-1"
// discipline) -- these are variants of that function, not a new model.
//
// #2 Graded ramp: trigger tiers (mild -> current-baseline-severity) instead
//    of one on/off cliff, so less time is spent at the harshest cut.
// #3 Rolling peak: drawdown measured off a trailing N-day peak instead of
//    the all-time peak, so recovery isn't held hostage to a high reached
//    long ago.
// #4 Asset-class-aware: blends a mild and a strict threshold based on
//    whether the CURRENT drawdown is more attributable to the correlated
//    index cluster (NQ/SPX/DOW/US2000/DE30/UK100) or the more-diversified
//    FX/gold book -- directly testing the real prior finding in
//    applyDrawdownThrottle's own doc comment: the worst historical
//    drawdown was "a 19-day correlated losing STRETCH across pairs."
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook, splitAt } from '../js/levelAtlasReport.js';
import { buildBarrierTrades, applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries, applyDrawdownThrottle } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { maxDrawdownFromPnls } from '../js/metricsCore.js';
import { costForPair } from '../js/perLineStrategy.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { boundPacked, LOOKBACK_DAYS, DEFAULT_REARM } from '../js/levelAtlasRoutes.js';

const MIN_MARGIN = 3, MAX_CONCURRENT = 3, RISK_PCT = 0.5;
const INDEX_CLUSTER = new Set(['nq', 'spx', 'dow', 'us2000', 'de30', 'uk100']);
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

const perPairTrades = {};
for (const pair of PAIRS) {
  console.log(`${pair.toUpperCase()}: loading M1...`);
  const packed0 = await loadM1ForPair(pair);
  const packed = boundPacked(packed0, LOOKBACK_DAYS);
  const assetClass = assetClassFor(pair);
  const cost = costForPair(pair, assetClass);
  const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [DEFAULT_REARM], pendingRearmFrac: DEFAULT_REARM });
  const atRearm = touches.filter(t => t.rearmFrac === DEFAULT_REARM);
  const { split: realSplit } = splitAt(atRearm);
  const isOnly = atRearm.filter(t => t.date < realSplit);
  const honestBook = buildAtlasBook(isOnly, { rearmFrac: DEFAULT_REARM });
  const trades = buildBarrierTrades(touches, honestBook, { rearmFrac: DEFAULT_REARM, cost, oosStartDate: realSplit }).filter(t => t.margin >= MIN_MARGIN);
  const capped = applyConcurrencyCap(trades, { maxConcurrent: MAX_CONCURRENT }).kept ?? [];
  const adjusted = riskAdjustTrades(capped, RISK_PCT).map(t => ({ ...t, pair: pair.toUpperCase() }));
  perPairTrades[pair.toUpperCase()] = adjusted;
  console.log(`  ${adjusted.length} trades`);
}

const weights = Object.fromEntries(Object.keys(perPairTrades).map(p => [p, 1]));
const combined = buildPortfolioDailySeries(perPairTrades, { weights });
const { dailyReturns, dates } = combined;
console.log(`\nCombined series: ${dates.length} trading days, ${dates[0]} -> ${dates.at(-1)}`);

// Reindex a subset's own daily series onto the COMBINED date axis (0 on any
// day that subset had no trade) -- required for #4's per-day comparison to
// be valid; buildPortfolioDailySeries on its own only returns dates where
// THAT subset traded, which would silently misalign against `dates` above.
function dailySeriesFor(trades) {
  const m = new Map();
  for (const t of trades ?? []) m.set(t.date, (m.get(t.date) ?? 0) + t.pnlPct);
  return m;
}
function reindexed(pairSubset) {
  const m = new Map();
  for (const pair of pairSubset) {
    const sub = dailySeriesFor(perPairTrades[pair] ?? []);
    for (const [d, v] of sub) m.set(d, (m.get(d) ?? 0) + v);
  }
  return dates.map(d => m.get(d) ?? 0);
}
const indexPairs = Object.keys(perPairTrades).filter(p => INDEX_CLUSTER.has(p.toLowerCase()));
const fxGoldPairs = Object.keys(perPairTrades).filter(p => !INDEX_CLUSTER.has(p.toLowerCase()));
const indexReturns = reindexed(indexPairs);
const fxGoldReturns = reindexed(fxGoldPairs);
console.log(`Index cluster: ${indexPairs.join(',')}  |  FX/gold: ${fxGoldPairs.join(',')}`);

// ── #2: graded ramp ──────────────────────────────────────────────────────
function applyGradedDrawdownThrottle(returns, tiers, restoreDD) {
  let equity = 1, peak = 1, throttled = false;
  const scaled = []; let daysThrottled = 0;
  for (let i = 0; i < returns.length; i++) {
    const ddNow = (equity - peak) / peak * 100;
    if (!throttled && ddNow <= tiers[0].trigger) throttled = true;
    else if (throttled && ddNow >= restoreDD) throttled = false;
    let mult = 1;
    if (throttled) { mult = tiers[0].mult; for (const t of tiers) if (ddNow <= t.trigger) mult = t.mult; daysThrottled++; }
    const r = returns[i] * mult;
    scaled.push(+r.toFixed(4));
    equity *= (1 + r / 100);
    if (equity > peak) peak = equity;
  }
  return { dailyReturns: scaled, daysThrottled };
}

// ── #3: rolling peak ─────────────────────────────────────────────────────
function applyRollingPeakThrottle(returns, { triggerDD, restoreDD, throttleMult, windowDays }) {
  let equity = 1, throttled = false;
  const equityHistory = [1];
  const scaled = []; let daysThrottled = 0;
  for (let i = 0; i < returns.length; i++) {
    const windowStart = Math.max(0, equityHistory.length - windowDays);
    let peak = -Infinity;
    for (let j = windowStart; j < equityHistory.length; j++) if (equityHistory[j] > peak) peak = equityHistory[j];
    const ddNow = (equity - peak) / peak * 100;
    if (!throttled && ddNow <= triggerDD) throttled = true;
    else if (throttled && ddNow >= restoreDD) throttled = false;
    const mult = throttled ? throttleMult : 1;
    if (throttled) daysThrottled++;
    const r = returns[i] * mult;
    scaled.push(+r.toFixed(4));
    equity *= (1 + r / 100);
    equityHistory.push(equity);
  }
  return { dailyReturns: scaled, daysThrottled };
}

// ── #4: asset-class-aware (blends mild<->strict by which segment is
// currently worse) ──────────────────────────────────────────────────────
function applyAssetClassAwareThrottle(returns, idxReturns, fxReturns, cfg) {
  let eqIdx = 1, peakIdx = 1, eqFx = 1, peakFx = 1;
  let equity = 1, peak = 1, throttled = false;
  const scaled = []; let daysThrottled = 0, sumSegWeight = 0;
  for (let i = 0; i < returns.length; i++) {
    const ddIdx = (eqIdx - peakIdx) / peakIdx * 100;
    const ddFx = (eqFx - peakFx) / peakFx * 100;
    const badIdx = Math.abs(Math.min(0, ddIdx)), badFx = Math.abs(Math.min(0, ddFx));
    const segWeight = (badIdx + badFx) > 0 ? badIdx / (badIdx + badFx) : 0.5; // 1 = fully index-driven, 0 = fully fx/gold-driven
    sumSegWeight += segWeight;
    const trigger = cfg.mildTrigger + segWeight * (cfg.strictTrigger - cfg.mildTrigger);
    const mult0 = cfg.mildMult + segWeight * (cfg.strictMult - cfg.mildMult);
    const restore = cfg.mildRestore + segWeight * (cfg.strictRestore - cfg.mildRestore);

    const ddNow = (equity - peak) / peak * 100;
    if (!throttled && ddNow <= trigger) throttled = true;
    else if (throttled && ddNow >= restore) throttled = false;
    const mult = throttled ? mult0 : 1;
    if (throttled) daysThrottled++;
    const r = returns[i] * mult;
    scaled.push(+r.toFixed(4));
    equity *= (1 + r / 100);
    if (equity > peak) peak = equity;

    eqIdx *= (1 + (idxReturns[i] || 0) / 100); if (eqIdx > peakIdx) peakIdx = eqIdx;
    eqFx *= (1 + (fxReturns[i] || 0) / 100); if (eqFx > peakFx) peakFx = eqFx;
  }
  return { dailyReturns: scaled, daysThrottled, avgSegWeight: sumSegWeight / returns.length };
}

function statsRow(label, returns, daysThrottled) {
  const ps = portfolioStats(returns, { mc: false, targetVol: 10 });
  const maxDDNonComp = maxDrawdownFromPnls(returns);
  const years = returns.length / 252;
  const cagrNonComp = returns.reduce((a, b) => a + b, 0) / years;
  const calmarNonComp = maxDDNonComp < 0 ? cagrNonComp / Math.abs(maxDDNonComp) : 0;
  const pctThrottled = daysThrottled != null ? (daysThrottled / returns.length * 100).toFixed(1) + '%' : '—';
  console.log(
    label.padEnd(28) +
    String(ps.sharpe?.toFixed(2)).padStart(8) +
    (ps.cagr?.toFixed(1) + '%').padStart(10) +
    (ps.maxDD?.toFixed(1) + '%').padStart(9) +
    (ps.calmar?.toFixed(2) ?? '—').padStart(8) +
    (cagrNonComp.toFixed(1) + '%').padStart(11) +
    (maxDDNonComp.toFixed(1) + '%').padStart(10) +
    calmarNonComp.toFixed(2).padStart(8) +
    pctThrottled.padStart(11)
  );
}

console.log('\n' + '='.repeat(110));
console.log('policy'.padEnd(28) + 'Sharpe'.padStart(8) + 'CAGR(c)'.padStart(10) + 'DD(c)'.padStart(9) + 'Cal(c)'.padStart(8) + 'CAGR(nc)'.padStart(11) + 'DD(nc)'.padStart(10) + 'Cal(nc)'.padStart(8) + '%throttled'.padStart(11));
console.log('='.repeat(110));

statsRow('No throttle (baseline)', dailyReturns, 0);

const current = applyDrawdownThrottle(dailyReturns, dates, { triggerDD: -8, restoreDD: -2, throttleMult: 0.25 });
statsRow('CURRENT (-8/0.25x/-2, cliff)', current.dailyReturns, current.state.filter(s => s.throttled).length);

const graded = applyGradedDrawdownThrottle(dailyReturns, [{ trigger: -4, mult: 0.65 }, { trigger: -6, mult: 0.40 }, { trigger: -8, mult: 0.25 }], -2);
statsRow('#2 Graded ramp (-4/-6/-8)', graded.dailyReturns, graded.daysThrottled);

for (const windowDays of [252, 126]) {
  const rolling = applyRollingPeakThrottle(dailyReturns, { triggerDD: -8, restoreDD: -2, throttleMult: 0.25, windowDays });
  statsRow(`#3 Rolling peak (${windowDays}d)`, rolling.dailyReturns, rolling.daysThrottled);
}

const assetAware = applyAssetClassAwareThrottle(dailyReturns, indexReturns, fxGoldReturns, {
  mildTrigger: -12, mildMult: 0.5, mildRestore: -4,
  strictTrigger: -8, strictMult: 0.25, strictRestore: -2,
});
statsRow('#4 Asset-class-aware', assetAware.dailyReturns, assetAware.daysThrottled);
console.log(`   (avg segment weight toward "index-driven": ${(assetAware.avgSegWeight * 100).toFixed(0)}% -- 100%=always index-cluster-driven, 0%=always FX/gold-driven)`);
