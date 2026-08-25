/**
 * MAE-timing / dynamic-stop test for the pinned continuation-trade hypothesis
 * (js/impulse4hRangeLevelsEngine.js's simulateContinuationTrade — buy/sell
 * the impulse's own continuation, structural stop beyond the candle's
 * opposite extreme, target the targetFib ladder rung). Adapted from the same
 * methodology already run against a different engine, see
 * education/jordan_impulse_range_backtest/MAE_DYNAMIC_STOP.md — reused here,
 * not reinvented.
 *
 * Owner's question: "if the trade is bad, the SL needs to be small to get out
 * fast" — do LOSING instances of this trade show a fast, deep adverse
 * excursion (MAE) early, while WINNING instances don't? If so, a small/tight
 * stop active only for the first K bars (reverting to the full structural
 * stop after) could cut losers early without cutting winners short.
 *
 * Two phases, both off the REAL M1 archive (loadM1ForPair):
 *   1. Adverse-excursion-by-bar-count profile, split win vs loss.
 *   2. Dynamic-stop re-simulation grid (fracEarly x kBars) — re-walks every
 *      trade's real path with a tightened early stop, bounded to the SAME
 *      per-impulse horizon window the main analysis used (next impulse's
 *      start, or the 40-day cap), recomputes win rate / mean R / total R.
 *
 * Usage: node mae_dynamic_stop.mjs <pairKey> <outDir> [m1Dir]
 */
import { loadM1ForPair } from '../../../js/volBacktestM1Engine.js';
import { runImpulse4hRangeLevels, splitByDateFrac } from '../../../js/impulse4hRangeLevelsEngine.js';
import { summarizeTrades } from '../../../js/metricsCore.js';
import fs from 'fs';

const pair = process.argv[2];
const outDir = process.argv[3];
const m1Dir = process.argv[4] || undefined;
if (!pair || !outDir) { console.error('usage: mae_dynamic_stop.mjs <pairKey> <outDir> [m1Dir]'); process.exit(1); }

const THRESHOLDS = [0.25, 0.5, 0.75, 1.0];

const packed = m1Dir ? await loadM1ForPair(pair, m1Dir) : await loadM1ForPair(pair);
if (!packed) { console.error(`${pair}: no data`); process.exit(2); }

const { impulses, meta } = runImpulse4hRangeLevels(packed, {}, pair);
const withTrade = impulses.filter(r => r.trade);
console.error(`${pair}: ${withTrade.length} continuation-trade instances (of ${impulses.length} impulses)`);

// ── Phase 1: adverse-R-by-bar-count profile, bounded to each trade's own
// (already-known) exit — describes what happened, no stop change yet.
function adverseProfile(packed, imp) {
  const { highs, lows } = packed;
  const t = imp.trade;
  const isBuy = t.side === 'BUY';
  const out = { barsToR: {} };
  let worst = 0;
  for (let i = t.fillIdx, count = 0; i <= t.exitIdx; i++, count++) {
    const adverse = isBuy ? (t.entry - lows[i]) : (highs[i] - t.entry);
    if (adverse > worst) worst = adverse;
    const rSoFar = worst / t.stopDist;
    for (const th of THRESHOLDS) if (out.barsToR[th] === undefined && rSoFar >= th) out.barsToR[th] = count;
  }
  return out;
}

const profiles = withTrade.map(r => ({ r, p: adverseProfile(packed, r) }));
const wins = profiles.filter(x => x.r.trade.outcome === 'win');
const losses = profiles.filter(x => x.r.trade.outcome === 'loss');

function median(xs) { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }
function thresholdStats(group, th) {
  const reached = group.map(x => x.p.barsToR[th]).filter(v => v !== undefined);
  return { pctReached: group.length ? +(reached.length / group.length * 100).toFixed(1) : null, medianBars: median(reached), n: reached.length };
}
const phase1 = { thresholds: {}, winnersN: wins.length, lossesN: losses.length };
for (const th of THRESHOLDS) phase1.thresholds[th] = { winners: thresholdStats(wins, th), losers: thresholdStats(losses, th) };

console.error(`\n${pair} — adverse-excursion-by-bar-count (winners n=${wins.length}, losers n=${losses.length})`);
for (const th of THRESHOLDS) {
  const w = phase1.thresholds[th].winners, l = phase1.thresholds[th].losers;
  console.error(`  reach ${th}R adverse: winners ${w.pctReached}% (median bar ${w.medianBars})  |  losers ${l.pctReached}% (median bar ${l.medianBars})`);
}

// ── Phase 2: dynamic-stop grid ─────────────────────────────────────────────
// Re-walk the real M1 path with a tightened stop active for the first kBars
// bars after fill (fracEarly x the original stop distance), full structural
// stop after — bounded to the SAME m1EndIdx (next impulse / 40-day cap) the
// main engine used for this trade, so a "win" here can't quietly run past
// where the original analysis stopped looking.
function simulateDynamicStop(packed, imp, fracEarly, kBars, cost) {
  const { highs, lows, closes } = packed;
  const t = imp.trade;
  const isBuy = t.side === 'BUY';
  const slEarly = isBuy ? t.entry - fracEarly * t.stopDist : t.entry + fracEarly * t.stopDist;
  const end = imp.m1EndIdx;
  for (let i = t.fillIdx, count = 0; i < end; i++, count++) {
    const activeSl = count < kBars ? slEarly : t.sl;
    if (isBuy) {
      if (lows[i] <= activeSl) return finish(activeSl, count, count < kBars);
      if (highs[i] >= t.tp) return finish(t.tp, count, false, 'win');
    } else {
      if (highs[i] >= activeSl) return finish(activeSl, count, count < kBars);
      if (lows[i] <= t.tp) return finish(t.tp, count, false, 'win');
    }
  }
  const lastIdx = end - 1;
  return finish(closes[lastIdx], lastIdx - t.fillIdx, false, null);

  function finish(exitPrice, barsHeld, early, forcedOutcome) {
    const grossPct = isBuy ? (exitPrice - t.entry) / t.entry * 100 : (t.entry - exitPrice) / t.entry * 100;
    const netPct = grossPct - cost;
    const riskPctPrice = t.stopDist / t.entry * 100;
    const rMult = riskPctPrice > 0 ? netPct / riskPctPrice : 0;
    const outcome = forcedOutcome ?? (rMult > 0 ? 'win' : 'loss');
    return { outcome, netPct, rMult, barsHeld, earlyStop: !!early };
  }
}

const FRAC_GRID = [0.25, 0.35, 0.5, 0.65, 0.8, 1.0];
const KBARS_GRID = [30, 60, 120, 240, 480]; // M1 bars: 30min, 1h, 2h, 4h, 8h after fill
const cost = meta.costPct;

const baselineDates = withTrade.map(r => r.date);
const baselinePnls = withTrade.map(r => r.trade.netPct);
const baselineSummary = summarizeTrades(baselinePnls, baselineDates);
const totalRBaseline = withTrade.reduce((s, r) => s + r.trade.rMult, 0);

const grid = [];
for (const fracEarly of FRAC_GRID) {
  for (const kBars of KBARS_GRID) {
    if (fracEarly === 1.0 && kBars !== KBARS_GRID[0]) continue; // control dedupe
    const sims = withTrade.map(r => ({ r, s: simulateDynamicStop(packed, r, fracEarly, kBars, cost) }));
    const netPcts = sims.map(x => x.s.netPct);
    const dates = sims.map(x => x.r.date);
    const summary = summarizeTrades(netPcts, dates);
    const winnersCutShort = sims.filter(x => x.r.trade.outcome === 'win' && x.s.outcome === 'loss' && x.s.earlyStop).length;
    const losersSaved = sims.filter(x => x.r.trade.outcome === 'loss' && x.s.earlyStop && x.s.rMult > x.r.trade.rMult).length;
    const totalRNew = sims.reduce((s, x) => s + x.s.rMult, 0);
    // Also compute this cell's IS-only and OOS-only Sharpe up front, so cell
    // SELECTION can be done on IS alone (see below) rather than on the
    // full-sample number, which already contains the OOS data it's meant to
    // validate against.
    const cellRecords = sims.map(x => ({ date: x.r.date, netPct: x.s.netPct }));
    const { is: cIs, oos: cOos } = splitByDateFrac(cellRecords, 0.4);
    const isSummary = summarizeTrades(cIs.map(r => r.netPct), cIs.map(r => r.date));
    const oosSummary = summarizeTrades(cOos.map(r => r.netPct), cOos.map(r => r.date));
    grid.push({
      fracEarly, kBars,
      winRate: summary.winRate, sharpe: summary.sharpe, profitFactor: summary.profitFactor,
      totalR: +totalRNew.toFixed(2), totalRBaseline: +totalRBaseline.toFixed(2),
      winnersCutShort, losersSaved,
      isSharpe: isSummary.sharpe, isWinRate: isSummary.winRate, isN: cIs.length,
      oosSharpe: oosSummary.sharpe, oosWinRate: oosSummary.winRate, oosN: cOos.length,
    });
  }
}
grid.sort((a, b) => b.sharpe - a.sharpe);

// Honest test: pick the "best" cell using ONLY its IS Sharpe (never look at
// OOS to choose), then report how that IS-chosen cell performs OOS. Picking
// on the FULL-sample Sharpe (as a naive grid search would) already bakes the
// OOS window into the selection — exactly the leak this check exists to
// avoid. The full-sample ranking above is kept only for the console/JSON
// leaderboard, not for this claim.
const byIs = grid.slice().sort((a, b) => b.isSharpe - a.isSharpe);
const bestByIs = byIs[0];
const bestCellIsOos = {
  fracEarly: bestByIs.fracEarly, kBars: bestByIs.kBars,
  full: { sharpe: bestByIs.sharpe, winRate: bestByIs.winRate, n: withTrade.length },
  is: { sharpe: bestByIs.isSharpe, winRate: bestByIs.isWinRate, n: bestByIs.isN },
  oos: { sharpe: bestByIs.oosSharpe, winRate: bestByIs.oosWinRate, n: bestByIs.oosN },
  selection: 'chosen by IS Sharpe only, OOS reported for the same cell (not re-selected)',
};
console.error(`\n${pair} — cell chosen by IS Sharpe (fracEarly=${bestByIs.fracEarly}, kBars=${bestByIs.kBars}): IS sharpe=${bestByIs.isSharpe} (n=${bestByIs.isN}) | OOS sharpe=${bestByIs.oosSharpe} (n=${bestByIs.oosN}) | full-sample sharpe=${bestByIs.sharpe} | baseline full sharpe=${baselineSummary.sharpe}`);

console.error(`\n${pair} — dynamic-stop grid (baseline sharpe=${baselineSummary.sharpe}, winRate=${baselineSummary.winRate}%, totalR=${totalRBaseline.toFixed(2)})`);
console.error('fracEarly  kBars  sharpe   winRate  PF      totalR   winnersCutShort  losersSaved');
for (const g of grid.slice(0, 15)) {
  console.error(`${String(g.fracEarly).padEnd(9)}  ${String(g.kBars).padEnd(5)}  ${String(g.sharpe).padEnd(7)}  ${String(g.winRate).padEnd(7)}  ${String(g.profitFactor).padEnd(6)}  ${String(g.totalR).padEnd(7)}  ${String(g.winnersCutShort).padEnd(15)}  ${g.losersSaved}`);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${outDir}/${pair}.mae_dynamic_stop.json`, JSON.stringify({
  pair, baseline: { ...baselineSummary, totalR: +totalRBaseline.toFixed(2) },
  phase1, grid, bestCellIsOos,
}, null, 2));
console.error(`\nwrote ${outDir}/${pair}.mae_dynamic_stop.json`);
