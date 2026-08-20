// Does VuManChu-style confirmation (WaveTrend hidden divergence, Money Flow
// fading toward zero, VWAP oscillator agreeing) predict whether a detected
// impulse CONTINUES vs INVALIDATES? Reuses the existing bricks — no re-inlined
// math — js/vumanchuCore.js + js/divergenceCore.js, the same ones
// js/poiReactionV1Engine.js's Stage-3 gate already uses on a FADE geometry;
// this applies the same 3-signal idea to the CONTINUATION geometry
// run_geometry.mjs/impulseRetracementGeometry.js already characterised.
//
// This script runs BOTH a naive and a corrected version, and reports both —
// the naive version looked like a huge finding (48% baseline -> 88.7% with
// the VWAP signal) and IS WRONG, the same class of bug
// education/coleztrades_poi_backtest/STAGE3_VUMANCHU_GATE.md already caught
// and documented once before in this repo. Diagnosis:
//
//   `turnIdx` (the retracement's extreme bar) is chosen by SCANNING FORWARD
//   to find the bar that, with the benefit of already knowing the future
//   path, turns out to be the final extreme before resolution. A live trader
//   can never know in real time "this bar IS the exact bottom" — only
//   afterward, once some bars pass with no new extreme. Scoring the
//   indicator AT that retrospectively-chosen bar isn't a same-candle leak
//   (confirmed: only 1.8% of 'continued' cases have the resolution on the
//   SAME bar as the turn) but it IS a hindsight-selection effect: reading
//   VWAP right at the exact, later-confirmed bottom is a fundamentally
//   easier condition to satisfy than reading it at a bar a live trader could
//   actually have flagged as "the low, probably" in real time.
//
//   The corrected version re-scores CONFIRM_BARS after the retrospective
//   extreme (still fully causal — only uses bars <= evalIdx) and DROPS any
//   occurrence whose outcome was already decided within that window (can't
//   fairly test "predicts the still-future outcome" if the future already
//   happened). Once corrected, the baseline itself jumps to ~86-90%
//   (surviving a few bars without flipping is itself hugely informative —
//   whipsaws get filtered out either way) and the VuManChu signals add only
//   a few points of lift on top, inconsistently, sometimes negative — nowhere
//   near the naive "88.7%" read. Robust across CONFIRM_BARS = 1/3/5 (checked).
import { loadM1ForPair } from '/home/user/MacroFXModel/js/volBacktestM1Engine.js';
import { resampleBars } from '/home/user/MacroFXModel/js/patternEngine.js';
import { findImpulseRetracements } from '/home/user/MacroFXModel/js/impulseRetracementGeometry.js';
import { computeWaveTrend, computeMoneyFlowVMC, computeVWAP } from '/home/user/MacroFXModel/js/vumanchuCore.js';
import { findDivergences } from '/home/user/MacroFXModel/js/divergenceCore.js';
import fs from 'fs';

const pair = process.argv[2];
const m1Dir = process.argv[3] || undefined;
const outDir = process.argv[4];
const RESAMPLE_MIN = 5;
const LOOKBACK = 80;        // bars of context for the WT/MF/VWAP compute itself
const RECENCY = 8;          // a hidden-divergence pivot must be within this many bars of the eval point to count
const TREND_BARS = 4;       // MF/VWAP "fading toward zero" = compare now vs this many bars back
const CONFIRM_BARS = 3;     // corrected version's confirmation delay past the retrospective extreme

const packed = m1Dir ? await loadM1ForPair(pair, m1Dir) : await loadM1ForPair(pair);
if (!packed) { process.stderr.write(`${pair}: no data\n`); process.exit(2); }
const bars = resampleBars(packed, RESAMPLE_MIN);
const occ = findImpulseRetracements(bars, {});
process.stderr.write(`${pair}: ${occ.length} legs\n`);

function scoreAt(evalIdx, dir) {
  const win = bars.slice(evalIdx - LOOKBACK, evalIdx + 1);
  const lastIdx = win.length - 1;
  const { wt2 } = computeWaveTrend(win);
  const mf = computeMoneyFlowVMC(win);
  const vw = computeVWAP(win);
  const hi = win.map(b => b.high), lo = win.map(b => b.low);
  const hiddenBias = dir === 'up' ? 'bull' : 'bear';
  const divs = findDivergences(hi, lo, wt2, { reach: 2 });
  const hiddenHit = divs.some(d => d.kind === 'hidden' && d.bias === hiddenBias && (lastIdx - d.iRec) <= RECENCY);
  const mfNow = mf[lastIdx], mfPrev = mf[Math.max(0, lastIdx - TREND_BARS)];
  const wantNeg = dir === 'up';
  const mfHit = Number.isFinite(mfNow) && Number.isFinite(mfPrev) && (wantNeg ? (mfNow < 0 && mfNow > mfPrev) : (mfNow > 0 && mfNow < mfPrev));
  const vNow = vw.osc[lastIdx], vPrev = vw.osc[Math.max(0, lastIdx - TREND_BARS)];
  const vwapHit = dir === 'up' ? vNow > vPrev : vNow < vPrev;
  return { hiddenHit, mfHit, vwapHit, nSignals: [hiddenHit, mfHit, vwapHit].filter(Boolean).length };
}

function resolveFrom(startIdx, aPrice, bPrice, dirUp, maxK) {
  for (let k = startIdx; k <= maxK; k++) {
    const bar = bars[k];
    if (dirUp ? bar.high > bPrice : bar.low < bPrice) return 'continued';
    if (dirUp ? bar.low < aPrice : bar.high > aPrice) return 'invalidated';
  }
  return 'timeout';
}

function bucketStats(subset) {
  const n = subset.length;
  if (!n) return { n: 0, continuedFrac: null };
  return { n, continuedFrac: +(subset.filter(o => o.outcome === 'continued').length / n).toFixed(4) };
}
function report(scored) {
  const baseline = bucketStats(scored);
  const byNSignals = [0, 1, 2, 3].map(k => ({ nSignals: k, ...bucketStats(scored.filter(o => o.nSignals === k)) }));
  const byIndividualSignal = {
    hiddenDivergence: bucketStats(scored.filter(o => o.hiddenHit)),
    moneyFlowFading: bucketStats(scored.filter(o => o.mfHit)),
    vwapAgrees: bucketStats(scored.filter(o => o.vwapHit)),
  };
  return { baseline, byNSignals, byIndividualSignal };
}

// ── Naive (retrospective-extreme, the WRONG-but-instructive version) ────────
const naiveScored = [];
for (const o of occ) {
  if (o.turnIdx < LOOKBACK) continue;
  const s = scoreAt(o.turnIdx, o.dir);
  naiveScored.push({ ...s, outcome: o.outcome });
}
const naive = report(naiveScored);

// ── Corrected (confirmation-delayed, drops early-resolved occurrences) ──────
let dropped = 0;
const correctedScored = [];
for (const o of occ) {
  const evalIdx = o.turnIdx + CONFIRM_BARS;
  if (evalIdx < LOOKBACK || evalIdx >= bars.length) continue;
  const dirUp = o.dir === 'up';
  const early = resolveFrom(o.turnIdx + 1, o.aPrice, o.bPrice, dirUp, evalIdx);
  if (early !== 'timeout') { dropped++; continue; }
  const s = scoreAt(evalIdx, o.dir);
  const outcome = resolveFrom(evalIdx + 1, o.aPrice, o.bPrice, dirUp, Math.min(bars.length - 1, evalIdx + 3000));
  correctedScored.push({ ...s, outcome });
}
const corrected = report(correctedScored);

const summary = { pair, resampleMin: RESAMPLE_MIN, lookbackBars: LOOKBACK, confirmBars: CONFIRM_BARS, naive, corrected, correctedDroppedForEarlyResolution: dropped };
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${outDir}/${pair}.vumanchu_gate.json`, JSON.stringify(summary, null, 2));

process.stderr.write(`\n${pair} — NAIVE (retrospective-extreme, WRONG, kept for the comparison):\n`);
process.stderr.write(`  baseline continuedFrac=${naive.baseline.continuedFrac} (n=${naive.baseline.n})\n`);
for (const b of naive.byNSignals) process.stderr.write(`  nSignals=${b.nSignals}  n=${String(b.n).padStart(6)}  continuedFrac=${b.continuedFrac ?? '—'}\n`);

process.stderr.write(`\n${pair} — CORRECTED (confirmation-delayed ${CONFIRM_BARS} bars, dropped ${dropped} early-resolved):\n`);
process.stderr.write(`  baseline continuedFrac=${corrected.baseline.continuedFrac} (n=${corrected.baseline.n})\n`);
for (const b of corrected.byNSignals) process.stderr.write(`  nSignals=${b.nSignals}  n=${String(b.n).padStart(6)}  continuedFrac=${b.continuedFrac ?? '—'}\n`);
for (const [name, b] of Object.entries(corrected.byIndividualSignal)) process.stderr.write(`  ${name.padEnd(16)} n=${String(b.n).padStart(6)}  continuedFrac=${b.continuedFrac ?? '—'}\n`);
