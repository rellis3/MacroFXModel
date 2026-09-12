// Follow-side early exit — 2026-09-12
//
// The existing "early exit (no re-leverage)" live lever (scripts/build_early_exit_votetrades.mjs)
// is FADE-ONLY -- never tested on follow. The MFE/giveback analysis just
// found a real, 17-pair-consistent asymmetry: a FOLLOW trade that stalls at
// low MFE almost never recovers (0.5% eventual win rate at <0.25R MFE, vs
// fade's 10.4% at the same point) -- exactly the shape an early-exit rule is
// built to exploit, and follow currently has NO such protection at all.
//
// Reuses the ORIGINAL validated methodology (early_exit_no_releverage_backtest.mjs)
// unchanged: position sizing stays anchored to each trade's ORIGINAL stopPips
// (a winner's risk-adjusted pnlPct is untouched), only the exit trigger
// changes -- if real adverse excursion crosses a candidate fraction of the
// original stop before the trade would normally resolve, exit there instead.
// Same threshold grid, same pre-stated IS-fit/OOS-freeze selection rule.
//
// Built on FRESH honest-book real-OOS trades (not the stale local votetrades
// cache the original script reads -- that cache predates this session's two
// look-ahead fixes and the 10-year bound, same staleness already caught and
// corrected in vote_atlas_fade_stop_revalidate.mjs). The CURRENT live fade
// early-exit (threshold=0.4, unconditional) is applied first so "baseline"
// here means the REAL live config, and the new lever is scored as its
// incremental effect on top of that, not in isolation.
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook, splitAt } from '../js/levelAtlasReport.js';
import { buildBarrierTrades, applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';
import { sharpeStdError } from '../js/metricsCore.js';
import { costForPair } from '../js/perLineStrategy.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { boundPacked, LOOKBACK_DAYS, DEFAULT_REARM } from '../js/levelAtlasRoutes.js';
import { bisect } from '../js/barUtils.js';

const MIN_MARGIN = 3, MAX_CONCURRENT = 3, RISK_PCT = 0.5;
const THRESHOLDS = [0.9, 0.75, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];
const LIVE_FADE_THRESHOLD = 0.4;

const PAIRS = process.env.LA_PAIRS ? process.env.LA_PAIRS.split(',') : ['eurusd', 'gbpusd', 'usdjpy', 'audusd',
  'usdchf', 'euraud', 'eurchf', 'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

// Identical to early_exit_no_releverage_backtest.mjs -- decision-aware already.
function findEarlyExitBar(trade, packed) {
  const startIdx = bisect(packed.times, trade.time);
  const endIdx = bisect(packed.times, trade.resolveTime);
  if (startIdx >= packed.n || endIdx <= startIdx) return null;
  const isUp = trade.side === 'up';
  const sgn = isUp ? 1 : -1;
  const stopSign = trade.decision === 'fade' ? 1 : -1;
  const stopPrice = trade.entry + stopSign * sgn * trade.stopPips * trade.pip;
  const stopDir = Math.sign(stopPrice - trade.entry) || 1;
  const stopDist = trade.stopPips * trade.pip;
  if (!(stopDist > 0)) return null;
  const crossingBar = {};
  let runningMaxAdverse = 0;
  for (const th of THRESHOLDS) crossingBar[th] = null;
  if (!(THRESHOLDS.includes(LIVE_FADE_THRESHOLD))) crossingBar[LIVE_FADE_THRESHOLD] = null;
  for (let j = startIdx; j < endIdx && j < packed.n; j++) {
    const adverse = stopDir > 0 ? (packed.highs[j] - trade.entry) : (trade.entry - packed.lows[j]);
    if (adverse > runningMaxAdverse) runningMaxAdverse = adverse;
    const frac = runningMaxAdverse / stopDist;
    for (const th of Object.keys(crossingBar)) {
      if (crossingBar[th] == null && frac >= +th) crossingBar[th] = packed.times[j];
    }
  }
  return crossingBar;
}
function repriceWithEarlyExit(trade, crossingBar, threshold, cost) {
  const crossTime = crossingBar[threshold];
  if (crossTime == null) return trade;
  const denom = trade.entry > 0 ? trade.entry : null;
  if (denom == null) return trade;
  const pnlPips = -threshold * trade.stopPips;
  const pnlPct = +((pnlPips * trade.pip / denom * 100) - cost).toFixed(4);
  return { ...trade, win: false, pnlPct, resolveTime: crossTime };
}

function statsFor(trades) {
  const byPair = {};
  for (const t of trades) (byPair[t.pair] ??= []).push(t);
  const capped = {};
  for (const p of Object.keys(byPair)) {
    const c = applyConcurrencyCap(byPair[p], { maxConcurrent: MAX_CONCURRENT });
    capped[p] = riskAdjustTrades(c?.kept ?? [], RISK_PCT).map(t => ({ ...t, pair: p }));
  }
  const all = Object.values(capped).flat();
  const weights = Object.fromEntries(Object.keys(capped).map(p => [p, 1]));
  const combined = buildPortfolioDailySeries(capped, { weights });
  const ps = portfolioStats(combined.dailyReturns, { mc: false, targetVol: 10 });
  const losers = all.filter(t => !t.win), winners = all.filter(t => t.win);
  const avgLoss = losers.length ? losers.reduce((a, t) => a + t.pnlPct, 0) / losers.length : null;
  const avgWin = winners.length ? winners.reduce((a, t) => a + t.pnlPct, 0) / winners.length : null;
  const gp = winners.reduce((a, t) => a + t.pnlPct, 0), gl = -losers.reduce((a, t) => a + t.pnlPct, 0);
  const se = ps.days > 1 ? sharpeStdError(ps.sharpe, ps.days, 252) : Infinity;
  const sharpeCI95 = isFinite(se) ? [+(ps.sharpe - 1.96 * se).toFixed(2), +(ps.sharpe + 1.96 * se).toFixed(2)] : null;
  return {
    trades: all.length, winRate: +(winners.length / all.length * 100).toFixed(1),
    sharpe: ps.sharpe, sharpeCI95, cagr: ps.cagr, maxDD: ps.maxDD,
    pf: gl > 1e-9 ? +(gp / gl).toFixed(2) : null,
    avgLoss: avgLoss != null ? +avgLoss.toFixed(3) : null,
    avgWin: avgWin != null ? +avgWin.toFixed(3) : null,
  };
}
function ciStr(s) { return s.sharpeCI95 ? `[${s.sharpeCI95[0]}, ${s.sharpeCI95[1]}]` : '—'; }
function printRow(label, s) {
  console.log([label.padEnd(14), String(s.trades).padStart(6), (s.winRate + '%').padStart(7),
    String(s.sharpe).padStart(7), ciStr(s).padStart(14), (s.cagr + '%').padStart(9), (s.maxDD + '%').padStart(8),
    String(s.pf).padStart(6), (s.avgLoss + '%').padStart(9), (s.avgWin + '%').padStart(9)].join('  '));
}
function header() {
  console.log(['variant'.padEnd(14), 'trades'.padStart(6), 'winRate'.padStart(7), 'sharpe'.padStart(7),
    'sharpeCI95'.padStart(14), 'CAGR'.padStart(9), 'maxDD'.padStart(8), 'PF'.padStart(6), 'avgLoss'.padStart(9), 'avgWin'.padStart(9)].join('  '));
}

const allTradesWithBars = [];
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
  const trades = buildBarrierTrades(touches, honestBook, { rearmFrac: DEFAULT_REARM, cost, oosStartDate: realSplit })
    .filter(t => t.margin >= MIN_MARGIN)
    .map(t => ({ ...t, pair: pair.toUpperCase(), cost }));
  for (const t of trades) {
    const crossingBar = findEarlyExitBar(t, packed);
    if (crossingBar) allTradesWithBars.push({ trade: t, crossingBar });
  }
  console.log(`  ${trades.length} trades walked`);
}
console.log(`\n${allTradesWithBars.length} total trades with real M1 paths walked.\n`);

// Apply the CURRENT live fade early-exit (fixed threshold=0.4, unconditional) --
// this is "baseline" from here on, matching the real live config.
function applyLiveFadeExit(x) {
  return x.trade.decision === 'fade' ? repriceWithEarlyExit(x.trade, x.crossingBar, LIVE_FADE_THRESHOLD, x.trade.cost) : x.trade;
}
// Apply a candidate follow-only threshold ON TOP of the live fade exit.
function buildVariant(set, followThreshold) {
  return set.map(x => {
    const base = applyLiveFadeExit(x);
    if (x.trade.decision !== 'follow' || followThreshold == null) return base;
    return repriceWithEarlyExit(base, x.crossingBar, followThreshold, x.trade.cost);
  });
}

const uniqueDates = [...new Set(allTradesWithBars.map(x => x.trade.date))].sort();
const cutoff = uniqueDates[Math.floor(uniqueDates.length * 0.7)];
console.log(`IS/OOS split: ${cutoff}\n`);
const isSet = allTradesWithBars.filter(x => x.trade.date <= cutoff);
const oosSet = allTradesWithBars.filter(x => x.trade.date > cutoff);

console.log('──── IN-SAMPLE (fit) ────');
header();
const isBaseline = statsFor(buildVariant(isSet, null));
printRow('baseline', isBaseline);
const isRows = [];
for (const th of THRESHOLDS) {
  const s = statsFor(buildVariant(isSet, th));
  isRows.push({ th, ...s });
  printRow(`follow th=${th}`, s);
}

const sharpeFloor = isBaseline.sharpe * 0.9;
const eligible = isRows.filter(r => r.sharpe >= sharpeFloor && r.maxDD > isBaseline.maxDD).sort((a, b) => b.th - a.th);
const chosen = eligible[0] ?? null;
console.log(chosen
  ? `\nChosen (pre-stated rule: widest [most conservative] threshold with IS Sharpe >= 90% of baseline AND shallower maxDD): threshold=${chosen.th}\n`
  : `\nNo threshold cleared the pre-stated bar -- none frozen for OOS.\n`);

console.log('──── OUT-OF-SAMPLE (threshold frozen from IS, applied unchanged) ────');
header();
printRow('baseline (live)', statsFor(buildVariant(oosSet, null)));
if (chosen) printRow(`follow th=${chosen.th}`, statsFor(buildVariant(oosSet, chosen.th)));
console.log('\n(full OOS grid, for context:)');
for (const th of THRESHOLDS) printRow(`follow th=${th}`, statsFor(buildVariant(oosSet, th)));
