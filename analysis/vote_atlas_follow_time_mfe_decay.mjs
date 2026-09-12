// Follow-side "thesis decay" — time-without-progress, not adverse-excursion — 2026-09-12
//
// The MAE-based early exit (vote_atlas_follow_early_exit_backtest.mjs) tested
// "how far has this trade moved AGAINST me" for follow, and it failed
// catastrophically -- follow trades that dip deep still recover into wins
// often enough that cutting them is expensive. That's a DIFFERENT signal
// from "how much favourable progress has this trade made after N bars,"
// which the MFE/giveback analysis suggests carries real information for
// follow specifically (a voted follow trade with real conviction that still
// hasn't moved is a much stronger red flag than a naive one -- confirmed by
// the Thread 2 cross-check). This builds and tests THAT signal directly,
// requiring a genuine bar-by-bar path reconstruction (running MFE at fixed
// bar offsets), not a repricing of the existing terminal mfePips field.
//
// Stage A: pure description -- among follow trades still short of 0.25R MFE
// at bar checkpoints 5/10/20/30, what's the EVENTUAL outcome, and what would
// exiting AT that bar have realized? No fitting yet.
// Stage B: IS-fit which checkpoint (if any) makes a real exit rule, freeze,
// test unchanged on real OOS via the full portfolio pipeline, against the
// TRUE current live baseline (fade already early-exited at 0.4, matching
// the real config, per the prior test's own discipline).
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook, splitAt } from '../js/levelAtlasReport.js';
import { buildBarrierTrades, applyConcurrencyCap, riskAdjustTrades, buildPortfolioDailySeries } from '../js/levelAtlasVoteReview.js';
import { bucketM1IntoSessions } from '../js/forecastAnalyser.js';
import { portfolioStats } from '../js/backtestStats.js';
import { sharpeStdError } from '../js/metricsCore.js';
import { costForPair } from '../js/perLineStrategy.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { boundPacked, LOOKBACK_DAYS, DEFAULT_REARM } from '../js/levelAtlasRoutes.js';
import { bisect } from '../js/barUtils.js';

const MIN_MARGIN = 3, MAX_CONCURRENT = 3, RISK_PCT = 0.5;
const LIVE_FADE_THRESHOLD = 0.4;
const CHECKPOINTS = [5, 10, 20, 30];
const MFE_STALL_THRESHOLD = 0.25;

const PAIRS = process.env.LA_PAIRS ? process.env.LA_PAIRS.split(',') : ['eurusd', 'gbpusd', 'usdjpy', 'audusd',
  'usdchf', 'euraud', 'eurchf', 'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

// Same fade-only live exit as the prior test, unchanged (establishes the TRUE baseline).
function findEarlyExitBar(trade, packed, thresholds) {
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
  for (const th of thresholds) crossingBar[th] = null;
  let runningMaxAdverse = 0;
  for (let j = startIdx; j < endIdx && j < packed.n; j++) {
    const adverse = stopDir > 0 ? (packed.highs[j] - trade.entry) : (trade.entry - packed.lows[j]);
    if (adverse > runningMaxAdverse) runningMaxAdverse = adverse;
    const frac = runningMaxAdverse / stopDist;
    for (const th of thresholds) if (crossingBar[th] == null && frac >= th) crossingBar[th] = packed.times[j];
  }
  return crossingBar;
}
function repriceWithEarlyExit(trade, crossTime, threshold, cost) {
  if (crossTime == null) return trade;
  const denom = trade.entry > 0 ? trade.entry : null;
  if (denom == null) return trade;
  const pnlPips = -threshold * trade.stopPips;
  const pnlPct = +((pnlPips * trade.pip / denom * 100) - cost).toFixed(4);
  return { ...trade, win: false, pnlPct, resolveTime: crossTime };
}

// Bar-by-bar running MFE (favourable direction, opposite of the stop side)
// at fixed BAR OFFSETS from touch -- genuinely different from findEarlyExitBar,
// which tracks the ADVERSE side against a threshold-crossing TIME, not the
// favourable side against a bar COUNT.
function trackMfeProgress(trade, sessions) {
  const bars = sessions.get(trade.date);
  if (!bars?.length) return null;
  const touchIdx = bars.findIndex(b => b.time === trade.time);
  if (touchIdx < 0) return null;
  const isUp = trade.side === 'up';
  const sgn = isUp ? 1 : -1;
  const stopSign = trade.decision === 'fade' ? 1 : -1;
  const stopPrice = trade.entry + stopSign * sgn * trade.stopPips * trade.pip;
  const stopDir = Math.sign(stopPrice - trade.entry) || 1;
  const favorDir = -stopDir;
  const stopDist = trade.stopPips * trade.pip;
  if (!(stopDist > 0)) return null;
  const atCheckpoint = {};
  let runningMaxFavor = 0;
  for (let k = 0; k < CHECKPOINTS.length; k++) {
    const targetBarIdx = touchIdx + CHECKPOINTS[k];
    // Walk up to (and including) this checkpoint's bar, carrying the running max forward.
    const prevIdx = k === 0 ? touchIdx : touchIdx + CHECKPOINTS[k - 1];
    for (let j = Math.max(touchIdx, prevIdx + (k === 0 ? 0 : 1)); j <= targetBarIdx && j < bars.length; j++) {
      const favor = favorDir > 0 ? (bars[j].high - trade.entry) : (trade.entry - bars[j].low);
      if (favor > runningMaxFavor) runningMaxFavor = favor;
    }
    if (targetBarIdx >= bars.length) { atCheckpoint[CHECKPOINTS[k]] = null; continue; }
    const closePx = bars[targetBarIdx].close;
    const currentFavor = favorDir > 0 ? (closePx - trade.entry) : (trade.entry - closePx);
    atCheckpoint[CHECKPOINTS[k]] = { mfeR: runningMaxFavor / trade.stopPips, currentR: (currentFavor / trade.pip) / trade.stopPips };
  }
  return atCheckpoint;
}

const allBase = [], followWithProgress = [];
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

  // Fade's own live exit, fixed threshold, applied once here (baseline).
  for (const t of trades) {
    if (t.decision !== 'fade') { allBase.push({ trade: t }); continue; }
    const crossing = findEarlyExitBar(t, packed, [LIVE_FADE_THRESHOLD]);
    const crossTime = crossing ? crossing[LIVE_FADE_THRESHOLD] : null;
    allBase.push({ trade: repriceWithEarlyExit(t, crossTime, LIVE_FADE_THRESHOLD, t.cost) });
  }

  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  for (const t of trades) {
    if (t.decision !== 'follow') continue;
    const progress = trackMfeProgress(t, sessions);
    if (progress) followWithProgress.push({ trade: t, progress });
  }
  console.log(`  ${trades.length} trades, ${trades.filter(t => t.decision === 'follow').length} follow tracked`);
}
console.log(`\n${allBase.length} baseline trades, ${followWithProgress.length} follow trades with bar-tracked progress.\n`);

// ── Stage A: descriptive, EV(continue) at each checkpoint for STALLED follow trades ──
console.log('='.repeat(90));
console.log('STAGE A: FOLLOW trades still <0.25R MFE at checkpoint N -- eventual outcome vs exiting now');
console.log('='.repeat(90));
console.log('bars'.padEnd(8), 'n'.padStart(7), 'stalled%'.padStart(10), 'eventualWin%'.padStart(13), 'EV(continue)R'.padStart(15), 'currentR(exit now)'.padStart(20));
for (const cp of CHECKPOINTS) {
  const withCp = followWithProgress.filter(x => x.progress[cp] != null);
  const stalled = withCp.filter(x => x.progress[cp].mfeR < MFE_STALL_THRESHOLD);
  if (!stalled.length) { console.log(`${String(cp).padEnd(8)}  [none reached this checkpoint]`); continue; }
  const riskUnitPct = t => t.stopPips * t.pip / t.entry * 100;
  const eventualR = x => riskUnitPct(x.trade) > 0 ? x.trade.pnlPct / riskUnitPct(x.trade) : null;
  const evs = stalled.map(x => eventualR(x)).filter(v => v != null);
  const avgEV = evs.reduce((a, b) => a + b, 0) / evs.length;
  const avgCurrentR = stalled.reduce((a, x) => a + x.progress[cp].currentR, 0) / stalled.length;
  const winPct = stalled.filter(x => x.trade.win).length / stalled.length * 100;
  console.log(String(cp).padEnd(8), String(stalled.length).padStart(7), (stalled.length / withCp.length * 100).toFixed(1).padStart(9) + '%', winPct.toFixed(1).padStart(12) + '%', avgEV.toFixed(3).padStart(15), avgCurrentR.toFixed(3).padStart(20));
}

// ── Stage B: build the actual rule if Stage A shows a real, exploitable gap ──
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
  const gp = winners.reduce((a, t) => a + t.pnlPct, 0), gl = -losers.reduce((a, t) => a + t.pnlPct, 0);
  const se = ps.days > 1 ? sharpeStdError(ps.sharpe, ps.days, 252) : Infinity;
  const sharpeCI95 = isFinite(se) ? [+(ps.sharpe - 1.96 * se).toFixed(2), +(ps.sharpe + 1.96 * se).toFixed(2)] : null;
  return { trades: all.length, winRate: +(winners.length / all.length * 100).toFixed(1), sharpe: ps.sharpe, sharpeCI95, cagr: ps.cagr, maxDD: ps.maxDD, pf: gl > 1e-9 ? +(gp / gl).toFixed(2) : null };
}
function ciStr(s) { return s.sharpeCI95 ? `[${s.sharpeCI95[0]}, ${s.sharpeCI95[1]}]` : '—'; }
function printRow(label, s) {
  console.log([label.padEnd(16), String(s.trades).padStart(6), (s.winRate + '%').padStart(7), String(s.sharpe).padStart(7), ciStr(s).padStart(14), (s.cagr + '%').padStart(9), (s.maxDD + '%').padStart(8), String(s.pf).padStart(6)].join('  '));
}
function header() {
  console.log(['variant'.padEnd(16), 'trades'.padStart(6), 'winRate'.padStart(7), 'sharpe'.padStart(7), 'sharpeCI95'.padStart(14), 'CAGR'.padStart(9), 'maxDD'.padStart(8), 'PF'.padStart(6)].join('  '));
}

const followMap = new Map(followWithProgress.map(x => [x.trade.time + '|' + x.trade.pair, x]));
function buildVariant(checkpoint) {
  return allBase.map(x => {
    if (checkpoint == null || x.trade.decision !== 'follow') return x.trade;
    const fp = followMap.get(x.trade.time + '|' + x.trade.pair);
    const cp = fp?.progress[checkpoint];
    if (!cp || cp.mfeR >= MFE_STALL_THRESHOLD) return x.trade;
    // Exit AT this checkpoint's close -- realized pnl = currentR (in R), converted back to pnlPct.
    const riskUnitPct = x.trade.stopPips * x.trade.pip / x.trade.entry * 100;
    const pnlPct = +(cp.currentR * riskUnitPct - x.trade.cost).toFixed(4);
    return { ...x.trade, win: pnlPct > 0, pnlPct };
  });
}

const uniqueDates = [...new Set(allBase.map(x => x.trade.date))].sort();
const cutoff = uniqueDates[Math.floor(uniqueDates.length * 0.7)];
console.log(`\nIS/OOS split: ${cutoff}\n`);
const isBase = allBase.filter(x => x.trade.date <= cutoff);
const oosBase = allBase.filter(x => x.trade.date > cutoff);

function filterByDate(trades, pred) { return trades.filter(t => pred(t.date)); }

console.log('──── IN-SAMPLE (fit) ────');
header();
const isBaseline = statsFor(filterByDate(buildVariant(null), d => d <= cutoff));
printRow('baseline', isBaseline);
const isRows = [];
for (const cp of CHECKPOINTS) {
  const s = statsFor(filterByDate(buildVariant(cp), d => d <= cutoff));
  isRows.push({ cp, ...s });
  printRow(`exit@bar${cp}`, s);
}
const sharpeFloor = isBaseline.sharpe * 0.9;
const eligible = isRows.filter(r => r.sharpe >= sharpeFloor && r.maxDD > isBaseline.maxDD).sort((a, b) => b.sharpe - a.sharpe);
const chosen = eligible[0] ?? null;
console.log(chosen ? `\nChosen (best IS Sharpe among those clearing the 90%-of-baseline + shallower-maxDD bar): bar=${chosen.cp}\n` : '\nNo checkpoint cleared the pre-stated bar -- none frozen for OOS.\n');

console.log('──── OUT-OF-SAMPLE (checkpoint frozen from IS, applied unchanged) ────');
header();
printRow('baseline (live)', statsFor(filterByDate(buildVariant(null), d => d > cutoff)));
if (chosen) printRow(`exit@bar${chosen.cp}`, statsFor(filterByDate(buildVariant(chosen.cp), d => d > cutoff)));
console.log('\n(full OOS grid, for context:)');
for (const cp of CHECKPOINTS) printRow(`exit@bar${cp}`, statsFor(filterByDate(buildVariant(cp), d => d > cutoff)));
