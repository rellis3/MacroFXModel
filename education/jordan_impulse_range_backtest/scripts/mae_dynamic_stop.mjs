/**
 * MAE-timing / dynamic-stop test for the impulse/EMA/range engine
 * (js/impulseEmaRangeV1Engine.js — already tested null on its baseline fixed
 * structural stop, Sharpe -5.99 gold / -2.49 NQ, see RESULTS.md).
 *
 * Owner's question: "if it's going to lose it will lose fast" — do LOSING
 * trades show a fast, deep adverse excursion (MAE) early in the trade, while
 * WINNING trades don't? If so, a small/tight stop active only for the first
 * K bars (reverting to the full structural stop after) could cut losers
 * early without cutting winners short — same idea as `maeFromPath` already
 * used for reporting MAE, but here applied FORWARD as an actual stop rule
 * and re-simulated against the real M1 path (never approximated).
 *
 * Two phases, both off the REAL M1 archive (loadM1ForPair, same source as
 * the baseline engine and maeFromPath):
 *   1. Adverse-excursion-by-bar-count profile, split win vs loss — tests the
 *      hypothesis itself before touching the stop rule.
 *   2. Dynamic-stop re-simulation grid (fracEarly x kBars) — re-walks every
 *      trade's real path with a tightened early stop, recomputes win rate /
 *      Sharpe / total R, and reports how many original WINNERS got cut short
 *      (the cost of this idea) vs how many original LOSERS got a smaller
 *      loss (the benefit) — so a "Sharpe went up" number is never reported
 *      without also showing what it cost.
 *
 * Usage: node mae_dynamic_stop.mjs <gold|nq> <outDir> [m1Dir]
 */
import { loadM1ForPair } from '/home/user/MacroFXModel/js/volBacktestM1Engine.js';
import { runImpulseEmaRange } from '/home/user/MacroFXModel/js/impulseEmaRangeV1Engine.js';
import { summarizeTrades } from '/home/user/MacroFXModel/js/metricsCore.js';
import fs from 'fs';

const pair = process.argv[2];
const outDir = process.argv[3];
const m1Dir = process.argv[4] || undefined;
if (!pair || !outDir) { console.error('usage: mae_dynamic_stop.mjs <gold|nq> <outDir> [m1Dir]'); process.exit(1); }

const HORIZON_BARS = 2000;       // ~1.4 days of M1 — original engine is bounded to ~1 trading day itself
const THRESHOLDS = [0.25, 0.5, 0.75, 1.0];

function bsearch(times, t) {
  let lo = 0, hi = times.length;
  while (lo < hi) { const m = (lo + hi) >>> 1; if (times[m] < t) lo = m + 1; else hi = m; }
  return lo;
}

// Phase 1: adverse-R-by-bar-count profile for one trade, bounded to its own
// (already-known) exitTime — describes what actually happened, no stop change.
function adverseProfile(packed, trade) {
  const { times, highs, lows } = packed;
  const start = bsearch(times, trade.fillTime);
  const isBuy = trade.side === 'BUY';
  const stopDist = Math.abs(trade.entry - trade.sl);
  const out = { barsToR: {}, barsHeld: null };
  let worst = 0, i = start, count = 0;
  for (; i < times.length && times[i] <= trade.exitTime; i++, count++) {
    const adverse = isBuy ? (trade.entry - lows[i]) : (highs[i] - trade.entry);
    if (adverse > worst) worst = adverse;
    const rSoFar = worst / stopDist;
    for (const th of THRESHOLDS) {
      if (out.barsToR[th] === undefined && rSoFar >= th) out.barsToR[th] = count;
    }
  }
  out.barsHeld = count;
  return out;
}

// Phase 2: re-walk the real M1 path with a tightened stop active for the
// first kBars bars after fill, full structural stop after. Independent
// re-simulation (not reusing walkBars) so the raw M1 path is authoritative,
// same discipline as maeFromPath — but bounded to the SAME same-day cutoff
// the original engine uses (ctxBars ends at dStart+DAY, one trade/day), with
// the same EOD-fallback rule (mark at the last bar's close, not an infinite
// walk) if neither stop fires by day-end. Confirmed necessary by a direct
// trade-by-trade check against the baseline (control run, fracEarly=1.0):
// an earlier unbounded-horizon version of this walk continued past midnight
// and silently re-labeled ~1-3% of EOD-marked "wins" that never actually
// touched TP within the trading day (verified live via `/tmp/debug_*.mjs`,
// not committed) — small in count but a real same-day-boundary bug, not
// noise, per this repo's bug-hunting-first discipline.
function simulateDynamicStop(packed, trade, fracEarly, kBars, cost) {
  const { times, highs, lows, closes } = packed;
  const start = bsearch(times, trade.fillTime);
  const isBuy = trade.side === 'BUY';
  const stopDist = Math.abs(trade.entry - trade.sl);
  const slEarly = isBuy ? trade.entry - fracEarly * stopDist : trade.entry + fracEarly * stopDist;
  const dayStart = Date.parse(trade.date + 'T00:00:00Z') / 1000;
  const dEnd = dayStart + 86400;
  const dEndIdx = bsearch(times, dEnd);   // first bar at/after next day — exclusive bound, matches ctxBars' dEnd cutoff
  const end = Math.min(times.length, start + HORIZON_BARS, dEndIdx);
  for (let i = start, count = 0; i < end; i++, count++) {
    const activeSl = count < kBars ? slEarly : trade.sl;
    if (isBuy) {
      if (lows[i] <= activeSl) return finish(activeSl, count, times[i], count < kBars);
      if (highs[i] >= trade.tp) return finish(trade.tp, count, times[i], false, 'win');
    } else {
      if (highs[i] >= activeSl) return finish(activeSl, count, times[i], count < kBars);
      if (lows[i] <= trade.tp) return finish(trade.tp, count, times[i], false, 'win');
    }
  }
  // Timeout inside the horizon (rare) — mark at last bar's close, like the
  // original engine's own EOD fallback.
  const lastIdx = end - 1;
  return finish(closes[lastIdx], lastIdx - start, times[lastIdx], false, null);

  function finish(exitPrice, barsHeld, exitTime, early, forcedOutcome) {
    const grossPct = isBuy ? (exitPrice - trade.entry) / trade.entry * 100 : (trade.entry - exitPrice) / trade.entry * 100;
    const netPct = grossPct - cost;
    const riskPctPrice = stopDist / trade.entry * 100;
    const rMult = netPct / riskPctPrice;
    const outcome = forcedOutcome ?? (rMult > 0 ? 'win' : 'loss');
    return { outcome, netPct, rMult, barsHeld, exitTime, earlyStop: !!early };
  }
}

const packed = m1Dir ? await loadM1ForPair(pair, m1Dir) : await loadM1ForPair(pair);
if (!packed) { console.error(`${pair}: no data`); process.exit(2); }

const { trades, meta } = runImpulseEmaRange(packed, { instrument: pair });
console.error(`${pair}: ${trades.length} baseline trades loaded (cost=${meta.cost})`);

// ── Phase 1: does a loser reveal itself fast? ──────────────────────────────
const profiles = trades.map(t => ({ t, p: adverseProfile(packed, t) }));
const wins = profiles.filter(x => x.t.outcome === 'win');
const losses = profiles.filter(x => x.t.outcome === 'loss');

function thresholdStats(group, th) {
  const reached = group.map(x => x.p.barsToR[th]).filter(v => v !== undefined);
  const pctReached = group.length ? +(reached.length / group.length * 100).toFixed(1) : null;
  reached.sort((a, b) => a - b);
  const median = reached.length ? reached[Math.floor(reached.length / 2)] : null;
  return { pctReached, medianBars: median, n: reached.length };
}

const phase1 = { thresholds: {} };
for (const th of THRESHOLDS) {
  phase1.thresholds[th] = {
    winners: thresholdStats(wins, th),
    losers: thresholdStats(losses, th),
  };
}
phase1.winnersN = wins.length;
phase1.lossesN = losses.length;

console.error(`\n${pair} — adverse-excursion-by-bar-count (winners n=${wins.length}, losers n=${losses.length})`);
for (const th of THRESHOLDS) {
  const w = phase1.thresholds[th].winners, l = phase1.thresholds[th].losers;
  console.error(`  reach ${th}R adverse: winners ${w.pctReached}% (median bar ${w.medianBars})  |  losers ${l.pctReached}% (median bar ${l.medianBars})`);
}

// ── Phase 2: dynamic-stop grid ─────────────────────────────────────────────
const FRAC_GRID = [0.25, 0.35, 0.5, 0.65, 0.8, 1.0];   // 1.0 = no tightening (control)
const KBARS_GRID = [5, 10, 20, 30, 60];
const cost = meta.cost;

const baselineSummary = summarizeTrades(trades.map(t => t.netPct), trades.map(t => t.date));

const grid = [];
for (const fracEarly of FRAC_GRID) {
  for (const kBars of KBARS_GRID) {
    if (fracEarly === 1.0 && kBars !== KBARS_GRID[0]) continue;   // control is frac-only, dedupe over kBars
    const sims = trades.map(t => ({ t, s: simulateDynamicStop(packed, t, fracEarly, kBars, cost) }));
    const netPcts = sims.map(x => x.s.netPct);
    const dates = sims.map(x => x.t.date);
    const summary = summarizeTrades(netPcts, dates);
    const winnersCutShort = sims.filter(x => x.t.outcome === 'win' && x.s.outcome === 'loss' && x.s.earlyStop).length;
    const losersSaved = sims.filter(x => x.t.outcome === 'loss' && x.s.earlyStop && x.s.rMult > x.t.rMult).length;
    const totalRBaseline = trades.reduce((s, t) => s + t.rMult, 0);
    const totalRNew = sims.reduce((s, x) => s + x.s.rMult, 0);
    grid.push({
      fracEarly, kBars,
      winRate: summary.winRate, sharpe: summary.sharpe, profitFactor: summary.profitFactor,
      totalR: +totalRNew.toFixed(2), totalRBaseline: +totalRBaseline.toFixed(2),
      winnersCutShort, losersSaved,
    });
  }
}

grid.sort((a, b) => b.sharpe - a.sharpe);
console.error(`\n${pair} — dynamic-stop grid (baseline sharpe=${baselineSummary.sharpe}, winRate=${baselineSummary.winRate}%, totalR=${trades.reduce((s, t) => s + t.rMult, 0).toFixed(2)})`);
console.error('fracEarly  kBars  sharpe   winRate  PF      totalR   winnersCutShort  losersSaved');
for (const g of grid.slice(0, 15)) {
  console.error(`${String(g.fracEarly).padEnd(9)}  ${String(g.kBars).padEnd(5)}  ${String(g.sharpe).padEnd(7)}  ${String(g.winRate).padEnd(7)}  ${String(g.profitFactor).padEnd(6)}  ${String(g.totalR).padEnd(7)}  ${String(g.winnersCutShort).padEnd(15)}  ${g.losersSaved}`);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${outDir}/${pair}.mae_dynamic_stop.json`, JSON.stringify({
  pair, baseline: { ...baselineSummary, totalR: +trades.reduce((s, t) => s + t.rMult, 0).toFixed(2) },
  phase1, grid,
}, null, 2));
console.error(`\nwrote ${outDir}/${pair}.mae_dynamic_stop.json`);
