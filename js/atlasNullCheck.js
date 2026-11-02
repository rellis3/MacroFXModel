/**
 * Atlas null check — runs the Vote Atlas (Level Atlas) and Fib Atlas (Asia and
 * Monday) backtest pipelines on SYNTHETIC random-walk 1-minute prices.
 *
 * A driftless random walk has no edge by construction, so on this data every
 * honest pipeline must report roughly zero mean R. A clear positive number means
 * the backtest is reading information a real-time trader could not have.
 *
 * Why this exists (2026-11-01): a blind audit found that older versions of both
 * systems reported 60-80% win rates on random prices, from two leaks (an input
 * that read the outcome of a still-open earlier touch, and vote inputs picked on
 * the same period they were scored on), and that four opt-in exits/filters still
 * did so. `js/atlasNullCheck.test.mjs` runs this in CI so a new leak fails the
 * build. Research scripts can use the same functions as their random-walk null.
 *
 * The pipelines mirror the production routes (js/levelAtlasRoutes.js runOne,
 * js/asiaFibAtlasRoutes.js / js/mondayFibAtlasRoutes.js runOne): the vote book is
 * built from touches before the real split only, and trades are scored from the
 * real split on. If a route changes how it builds or scores trades, change the
 * matching runner here too.
 *
 * R is gross P&L in pips divided by the trade's own stop in pips (cost 0), so the
 * expected value on a random walk is about zero for any target/stop geometry.
 */
import { atlasWalk } from './levelAtlasEngine.js';
import { asiaFibAtlasWalk } from './asiaFibAtlasEngine.js';
import { mondayFibAtlasWalk } from './mondayFibAtlasEngine.js';
import { buildAtlasBook, splitAt } from './levelAtlasReport.js';
import { buildAsiaFibAtlasBook } from './asiaFibAtlasReport.js';
import { buildBarrierTrades as buildLevelTrades, applyMaeStopGate, applyTrailingContinuation, applyStoredContinuationExit } from './levelAtlasVoteReview.js';
import { buildBarrierTrades as buildFibTrades, applyClearanceFilter } from './asiaFibAtlasVoteReview.js';

const REARM = 0.3;

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Driftless random-walk M1 bars in the engines' packed format, Monday-Friday,
 * 24h, with an intraday activity profile and slow day-to-day volatility regimes
 * (volatility clusters, the mean does not move). `subSteps` price steps per bar
 * set each bar's high/low. Keep it fine (default 30): with 6 steps prices jump
 * about 0.9 pip at a time, past targets and stops, and an exit credited exactly at
 * its level then shows a fake gain (+0.12R per trailed winner at 6 steps, +0.02R
 * at 60). That artifact is also a warning for real data: fills at the exact level
 * flatter any exit price gaps through.
 *
 *   randomWalkPacked({ seed, years, start, price, dailyVol, subSteps }) -> { n, times, opens, highs, lows, closes, volumes }
 */
export function randomWalkPacked({ seed = 1, years = 2, start = Date.UTC(2020, 0, 6), price = 1.10, dailyVol = 0.006, subSteps = 30 } = {}) {
  const rnd = mulberry32(seed);
  const gauss = () => { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
  const days = Math.round(years * 365);
  const weekdays = Array.from({ length: days }, (_, d) => new Date(start + d * 86400000).getUTCDay()).filter(w => w !== 0 && w !== 6).length;
  const n = weekdays * 1440;
  const out = { n, times: new Int32Array(n), opens: new Float32Array(n), highs: new Float32Array(n), lows: new Float32Array(n), closes: new Float32Array(n), volumes: new Float32Array(n) };
  // Per-minute sigma so the activity profile averages to dailyVol over 1,440 minutes.
  const prof = m => { const h = m / 60; return (h >= 7 && h < 16) ? 1.6 : (h < 6) ? 0.7 : 1.0; };
  let ss = 0; for (let m = 0; m < 1440; m++) ss += prof(m) ** 2;
  const base = dailyVol / Math.sqrt(ss);
  let p = price, vol = 1, i = 0;
  for (let d = 0; d < days; d++) {
    const t0 = start / 1000 + d * 86400;
    const dow = new Date(t0 * 1000).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    vol = Math.exp(0.9 * Math.log(vol) + 0.25 * gauss());
    for (let m = 0; m < 1440; m++, i++) {
      const sig = base * prof(m) * vol / Math.sqrt(subSteps);
      const o = p; let hi = p, lo = p;
      for (let k = 0; k < subSteps; k++) { p *= Math.exp(sig * gauss() - sig * sig / 2); if (p > hi) hi = p; if (p < lo) lo = p; }
      out.times[i] = t0 + m * 60; out.opens[i] = o; out.highs[i] = hi; out.lows[i] = lo; out.closes[i] = p; out.volumes[i] = 100;
    }
  }
  return out;
}

const rOf = t => {
  const pips = t.pnlPct / 100 * t.entry / t.pip;   // cost 0, so pnlPct is gross
  return pips / t.stopPips;
};

/** Summary of a trade list in R: n, mean R, win rate. */
export function summarizeR(trades) {
  const rs = trades.filter(t => t.stopPips > 0 && t.entry > 0 && t.pip > 0).map(rOf);
  const n = rs.length;
  const meanR = n ? rs.reduce((a, b) => a + b, 0) / n : null;
  const winPct = n ? 100 * rs.filter(r => r > 0).length / n : null;
  return { n, meanR, winPct };
}

/**
 * How often a touch's `prevOutcomeSameDay` equals its own outcome, against what
 * independence would give (sum over outcomes of P(prev = k) x P(cur = k)). An
 * input that reads the outcome of a still-open earlier touch pushes the first
 * number far above the second.
 */
export function prevOutcomeAgreement(touches) {
  const rows = touches.filter(t => t.prevOutcomeSameDay != null && (t.outcome === 'out' || t.outcome === 'back'));
  if (!rows.length) return { n: 0, agree: null, chance: null };
  const agree = rows.filter(t => t.prevOutcomeSameDay === t.outcome).length / rows.length;
  const p = k => rows.filter(t => t.prevOutcomeSameDay === k).length / rows.length;
  const q = k => rows.filter(t => t.outcome === k).length / rows.length;
  return { n: rows.length, agree, chance: p('out') * q('out') + p('back') * q('back') };
}

function honestSplit(touches) {
  const atRearm = touches.filter(t => t.rearmFrac === REARM);
  const { split } = splitAt(atRearm);
  return { split, isOnly: atRearm.filter(t => t.date < split) };
}

/**
 * Vote Atlas on one random walk: production default trades (in-sample book,
 * scored from the real split, p90 excluded), plus the opt-in MAE stop gate and the
 * chandelier continuation exit applied to them.
 */
export function voteAtlasNull(packed, { instrument = 'EURUSD', maeGate = [0.8, 0.5] } = {}) {
  const { touches } = atlasWalk(packed, { instrument, assetClass: 'fx', rearmFracs: [REARM] });
  const { split, isOnly } = honestSplit(touches);
  const book = buildAtlasBook(isOnly, { rearmFrac: REARM });
  const trades = book ? buildLevelTrades(touches, book, { rearmFrac: REARM, cost: 0, oosStartDate: split }) : [];
  const chand = applyTrailingContinuation(trades, packed, { decisions: ['fade', 'follow'], trailMode: 'chandelier', chandelierMult: 3, chandelierPeriod: 60 });
  const chandRows = chand.map(t => t.trailedPnlPct == null ? t : { ...t, chandTrailedPnlPct: t.trailedPnlPct, chandTrailedPnlPips: t.trailedPnlPips, chandTrailedResolveTime: t.trailedResolveTime });
  return {
    touches,
    base: trades,
    maeGate: applyMaeStopGate(trades, maeGate[0], maeGate[1], 0),
    chandelier: applyStoredContinuationExit(chandRows, 'chandelier'),
  };
}

/**
 * Fib Atlas (ladder 'asia' or 'monday') on one random walk: production default
 * trades, plus the opt-in clearance filter (1 pip) and the chandelier exit, with
 * each ladder's production chandelier multiple.
 */
export function fibAtlasNull(packed, { ladder = 'asia', instrument = 'EURUSD', minClearancePips = 1 } = {}) {
  const walk = ladder === 'asia' ? asiaFibAtlasWalk : mondayFibAtlasWalk;
  const { touches } = walk(packed, { instrument, assetClass: 'fx', rearmFracs: [REARM], pendingRearmFrac: REARM });
  const { split, isOnly } = honestSplit(touches);
  const book = buildAsiaFibAtlasBook(isOnly, { rearmFrac: REARM });
  const trades = book ? buildFibTrades(touches, book, { rearmFrac: REARM, cost: 0, minMargin: 1, oosStartDate: split }) : [];
  const mult = ladder === 'asia' ? 3 : 1.5;
  const chand = applyTrailingContinuation(trades, packed, { decisions: ['fade', 'follow'], trailMode: 'chandelier', chandelierMult: mult, chandelierPeriod: 60 });
  const chandRows = chand.map(t => t.trailedPnlPct == null ? t : { ...t, chandTrailedPnlPct: t.trailedPnlPct, chandTrailedPnlPips: t.trailedPnlPips, chandTrailedResolveTime: t.trailedResolveTime });
  return {
    touches,
    base: trades,
    clearance: applyClearanceFilter(trades, minClearancePips),
    chandelier: applyStoredContinuationExit(chandRows, 'chandelier'),
  };
}
