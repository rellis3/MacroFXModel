/**
 * Main per-instrument analysis for the Impulse 4H Range-Levels study.
 * Runs js/impulse4hRangeLevelsEngine.js over the real local M1 archive and
 * writes two files per instrument:
 *   data/<pair>.impulses.json  — raw per-impulse feature/outcome rows
 *   data/<pair>.summary.json   — aggregates: level hit-rate table, impulse-size
 *                                 vs exhaustion-level correlation (IS/OOS),
 *                                 reversal-magnitude stats + its correlation
 *                                 with impulse size (IS/OOS), VWAP stats,
 *                                 direction/day-of-week breakdowns.
 *
 * Usage: node run_analysis.mjs <pairKey> <outDir> [m1Dir]
 */
import { loadM1ForPair } from '../../../js/volBacktestM1Engine.js';
import {
  runImpulse4hRangeLevels, FIB, pearsonCorr, splitByDateFrac,
} from '../../../js/impulse4hRangeLevelsEngine.js';
import fs from 'fs';

const pair = process.argv[2];
const outDir = process.argv[3];
const m1Dir = process.argv[4] || undefined;
if (!pair || !outDir) { console.error('usage: run_analysis.mjs <pairKey> <outDir> [m1Dir]'); process.exit(1); }

const t0 = Date.now();
const packed = m1Dir ? await loadM1ForPair(pair, m1Dir) : await loadM1ForPair(pair);
if (!packed) { console.error(`${pair}: no data — cannot run`); process.exit(2); }
console.error(`${pair}: loaded ${packed.n} M1 bars in ${Date.now() - t0}ms`);

const { impulses, meta } = runImpulse4hRangeLevels(packed, {}, pair);
console.error(`${pair}: ${impulses.length} impulses detected in ${Date.now() - t0}ms total`);

function median(xs) {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }

// ── 1. Level hit-rate table (full sample + IS/OOS for robustness) ─────────
function levelHitRate(group) {
  const n = group.length;
  const out = {};
  for (const f of FIB) {
    const hits = group.filter(r => r.levelsTouched[f]).length;
    out[f] = n ? +(hits / n * 100).toFixed(2) : null;
  }
  return { n, rates: out };
}
const { is: isImp, oos: oosImp, splitDate } = splitByDateFrac(impulses, 0.4);
const levelHitTable = {
  full: levelHitRate(impulses),
  is: levelHitRate(isImp),
  oos: levelHitRate(oosImp),
  bullish: levelHitRate(impulses.filter(r => r.bullish)),
  bearish: levelHitRate(impulses.filter(r => !r.bullish)),
};

// ── 2. Impulse size vs exhaustion-level correlation ────────────────────────
// extensionMagnitude: how many range-widths beyond the impulse's own anchor
// price travelled, in the continuation direction, sign-normalised so bullish
// and bearish impulses are on the same (positive) scale.
function extMag(r) { return r.bullish ? r.maxExtFib - 1 : -r.maxExtFib; }
function sizeExhaustionCorr(group) {
  const xs = group.map(r => r.rangeAtrMult);
  const ys = group.map(extMag);
  return pearsonCorr(xs, ys);
}
const sizeExhaustionCorrelation = {
  full: sizeExhaustionCorr(impulses),
  is: sizeExhaustionCorr(isImp),
  oos: sizeExhaustionCorr(oosImp),
  note: 'x = impulse range/ATR multiple, y = extension magnitude beyond the impulse candle\'s own edge, in range-widths (0 = no continuation at all)',
};

// ── 3. Reversal-after-exhaustion stats + correlation with impulse size ─────
// Exclude impulses whose reversal window was truncated by the horizon cap —
// their reversal figure is an incomplete read, not a real "small reversal".
const withReversal = impulses.filter(r => !r.reversalWindowTruncated && r.reversalAtr != null);
const truncatedCount = impulses.length - withReversal.length;
function reversalStats(group) {
  const atrs = group.map(r => r.reversalAtr);
  return { n: group.length, meanAtr: mean(atrs), medianAtr: median(atrs) };
}
function reversalSizeCorr(group) {
  return pearsonCorr(group.map(r => r.rangeAtrMult), group.map(r => r.reversalAtr));
}
function reversalExtCorr(group) {
  return pearsonCorr(group.map(extMag), group.map(r => r.reversalAtr));
}
const { is: isRev, oos: oosRev } = splitByDateFrac(withReversal, 0.4);
const reversalAnalysis = {
  truncatedExcluded: truncatedCount,
  stats: { full: reversalStats(withReversal), is: reversalStats(isRev), oos: reversalStats(oosRev) },
  corrVsImpulseSize: { full: reversalSizeCorr(withReversal), is: reversalSizeCorr(isRev), oos: reversalSizeCorr(oosRev) },
  corrVsExtensionMagnitude: { full: reversalExtCorr(withReversal), is: reversalExtCorr(isRev), oos: reversalExtCorr(oosRev) },
};

// ── 4. VWAP analysis ────────────────────────────────────────────────────────
// "Touched VWAP ever within up to a 40-day horizon" is close to guaranteed
// and uninformative on its own — report the BAR-COUNT distribution instead
// (median bars to touch, and what fraction touch within the same H4 bar / 24h
// / 3 trading days) alongside the plain touch rate.
const vwapTouchRate = +(impulses.filter(r => r.vwapTouchedWithinHorizon).length / impulses.length * 100).toFixed(2);
const touchBars = impulses.filter(r => r.vwapTouchBars != null).map(r => r.vwapTouchBars);
const within = (mins) => +(touchBars.filter(b => b <= mins).length / impulses.length * 100).toFixed(2);
const withVwap = withReversal.filter(r => r.vwapDistAtrAtExhaustion != null);
function vwapReversalCorr(group) { return pearsonCorr(group.map(r => Math.abs(r.vwapDistAtrAtExhaustion)), group.map(r => r.reversalAtr)); }
const { is: isVwap, oos: oosVwap } = splitByDateFrac(withVwap, 0.4);
const vwapAnalysis = {
  vwapTouchRatePct: vwapTouchRate,
  medianBarsToTouch: median(touchBars),
  pctTouchedWithin4h: within(240),
  pctTouchedWithin24h: within(1440),
  pctTouchedWithin3days: within(4320),
  meanAbsDistAtrAtImpulse: mean(impulses.filter(r => r.vwapDistAtrAtImpulse != null).map(r => Math.abs(r.vwapDistAtrAtImpulse))),
  corrAbsDistAtExhaustionVsReversal: { full: vwapReversalCorr(withVwap), is: vwapReversalCorr(isVwap), oos: vwapReversalCorr(oosVwap) },
  note: '|distance from session VWAP at the exhaustion point|, in ATR units, vs the subsequent reversal size (also in ATR units). Bar counts are M1 bars from the impulse close to the first VWAP touch.',
};

// ── 5. Other breakdowns: direction, day-of-week, hour-of-day-of-impulse ───
const dirCounts = { bullish: impulses.filter(r => r.bullish).length, bearish: impulses.filter(r => !r.bullish).length };
const dowCounts = Array(7).fill(0);
const hourCounts = Array(24).fill(0);
for (const r of impulses) {
  const d = new Date(r.time * 1000);
  dowCounts[d.getUTCDay()]++;
  hourCounts[d.getUTCHours()]++;
}

// ── Continuation-trade outcome summary (feeds MAE/dynamic-stop script too) ─
const trades = impulses.filter(r => r.trade).map(r => r.trade);
const winRatePct = trades.length ? +(trades.filter(t => t.outcome === 'win').length / trades.length * 100).toFixed(2) : null;
const meanR = trades.length ? +(trades.reduce((s, t) => s + t.rMult, 0) / trades.length).toFixed(4) : null;

const summary = {
  pair, meta, splitDate,
  nImpulses: impulses.length,
  directionCounts: dirCounts,
  dayOfWeekUTC_0Sun: dowCounts,
  hourOfDayUTC: hourCounts,
  levelHitRate: levelHitTable,
  sizeExhaustionCorrelation,
  reversalAnalysis,
  vwapAnalysis,
  continuationTrade: {
    targetFib: meta.cfg.targetFib, slBufferAtrMult: meta.cfg.slBufferAtrMult,
    nTrades: trades.length, winRatePct, meanR,
  },
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${outDir}/${pair}.impulses.json`, JSON.stringify(impulses));
fs.writeFileSync(`${outDir}/${pair}.summary.json`, JSON.stringify(summary, null, 2));
console.error(`${pair}: wrote ${outDir}/${pair}.impulses.json and ${pair}.summary.json`);
console.error(`${pair}: nImpulses=${impulses.length} winRate=${winRatePct}% meanR=${meanR} vwapTouchRate=${vwapTouchRate}% sizeExhCorr(full)=${sizeExhaustionCorrelation.full.r} reversalCorr(full)=${reversalAnalysis.corrVsImpulseSize.full.r}`);
