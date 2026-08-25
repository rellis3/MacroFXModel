/**
 * Tests for vwapFixedSigmaEngine — synthetic data only, no network.
 *
 * Covers the playbook's non-negotiables (REFERENCE_ENGINE_PLAYBOOK.md §6):
 *   1. RMS-from-VWAP correctness on constructed bars.
 *   2. FIXED sigma: today's own volatility must NOT widen today's bands.
 *   3. Perturb-the-future: rows dated before a future-only perturbation are
 *      byte-identical between a clean run and a perturbed run.
 *   4. Session isolation: touch ordinals and band state reset each day.
 *   5. Race outcome correctness on a crafted path (out vs back vs neither).
 *
 * Run: node js/vwapFixedSigmaEngine.test.mjs
 */

import { fixedSigmaWalk, sessionRmsFromVwap, DEFAULT_CFG } from './vwapFixedSigmaEngine.js';
import { computeSessionVwap } from './vwapReversionEngine.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`); }
  else { failures++; console.error(`  ✗ FAIL: ${msg}`); }
}
function approx(a, b, tol, msg) { assert(Math.abs(a - b) <= tol, `${msg} (${a} ≈ ${b} ±${tol})`); }

const DAY = 86400;
const BASE_T = Date.UTC(2024, 0, 1) / 1000;   // Mon 2024-01-01 00:00 UTC

// ── Synthetic packed-M1 builder ──────────────────────────────────────────────
// days = array of arrays of closes (one per minute); OHLC built as flat bars
// (o=h=l=c) unless a shaper widens them. Volume constant 1 → VWAP = running
// mean of hlc3 = running mean of closes for flat bars.
function packDays(days, { shape = null } = {}) {
  const times = [], opens = [], highs = [], lows = [], closes = [], volumes = [];
  days.forEach((closesArr, d) => {
    closesArr.forEach((c, m) => {
      let o = c, h = c, l = c;
      if (shape) ({ o = c, h = c, l = c, c } = { ...{ o: c, h: c, l: c, c }, ...shape(d, m, c) });
      times.push(BASE_T + d * DAY + m * 60);
      opens.push(o); highs.push(h); lows.push(l); closes.push(c); volumes.push(1);
    });
  });
  const n = times.length;
  return { n, times: Int32Array.from(times), opens: Float32Array.from(opens),
           highs: Float32Array.from(highs), lows: Float32Array.from(lows),
           closes: Float32Array.from(closes), volumes: Float32Array.from(volumes) };
}

// A flat day at `base` with a deterministic ±amp square-wave wiggle so RMS>0.
function wiggleDay(base, amp, nBars = 400) {
  return Array.from({ length: nBars }, (_, m) => base + (m % 2 === 0 ? amp : -amp));
}

// ── 1. sessionRmsFromVwap correctness ────────────────────────────────────────
console.log('1. RMS-from-running-VWAP correctness');
{
  // Alternating ±1 around 100 with equal weights: running VWAP converges to
  // ~100; deviations are ≈ ±1 → RMS ≈ 1. Verify against a direct recompute.
  const bars = wiggleDay(100, 1, 400).map((c, m) => ({ time: BASE_T + m * 60, open: c, high: c, low: c, close: c, volume: 1 }));
  const { vwap } = computeSessionVwap(bars);
  const rms = sessionRmsFromVwap(bars, vwap);
  let s = 0; for (let k = 0; k < bars.length; k++) { const d = bars[k].close - vwap[k]; s += d * d; }
  approx(rms, Math.sqrt(s / bars.length), 1e-9, 'RMS matches direct recompute');
  approx(rms, 1, 0.05, 'alternating ±1 wiggle → RMS ≈ 1');
}

// ── 2 + 5. Fixed sigma + race outcome on crafted paths ──────────────────────
// A smooth ramp barely stretches price from its own trailing VWAP (the VWAP
// follows it) — so the crafted paths use JUMPS, which is also exactly the
// mechanism that makes fixed-σ bands differ from self-widening ones.
console.log('2. Fixed σ is frozen from history; 5. race outcomes');
{
  const warm = Array.from({ length: 15 }, () => wiggleDay(100, 1, 400));

  // Day A (out-day): flat 100 → fast jump to 104 (deviation ≈ +3.8σ) → hold →
  // collapse to 98 (deviation swings ≈ −4σ). +1σ/+2σ touches on the jump must
  // race 'out'; a down-side touch must appear on the collapse.
  const dayA = [];
  for (let m = 0; m < 100; m++) dayA.push(100);
  for (let m = 0; m < 20; m++) dayA.push(100 + (m + 1) / 20 * 4);
  for (let m = 0; m < 150; m++) dayA.push(104);
  for (let m = 0; m < 50; m++) dayA.push(104 - (m + 1) / 50 * 6);
  for (let m = 0; m < 80; m++) dayA.push(98);

  // Day B (back-day): flat 100 → small jump to 101.3 (deviation ≈ +1.25σ, so
  // only the +1σ band is tagged) → full return to 100 and hold → the +1σ touch
  // must resolve 'back' (VWAP reached before +2σ) and tag VWAP.
  const dayB = [];
  for (let m = 0; m < 100; m++) dayB.push(100);
  for (let m = 0; m < 5; m++) dayB.push(100 + (m + 1) / 5 * 1.3);
  for (let m = 0; m < 20; m++) dayB.push(101.3);
  for (let m = 0; m < 10; m++) dayB.push(101.3 - (m + 1) / 10 * 1.3);
  for (let m = 0; m < 265; m++) dayB.push(100);

  const packed = packDays([...warm, dayA, dayB]);
  const { touches, coverage } = fixedSigmaWalk(packed, {
    instrument: 'TEST', minHistory: 10, minBarsPerDay: 300, measureBars: 30,
  });
  assert(coverage.daysWalked >= 2, `walked ${coverage.daysWalked} day(s) after warm-up`);
  const dateA = new Date((BASE_T + 15 * DAY) * 1000).toISOString().slice(0, 10);
  const dateB = new Date((BASE_T + 16 * DAY) * 1000).toISOString().slice(0, 10);
  const tA = touches.filter(t => t.date === dateA);
  const a1 = tA.find(t => t.side === 'up' && t.band === 1);
  const a2 = tA.find(t => t.side === 'up' && t.band === 2);
  const aDn = tA.find(t => t.side === 'dn' && t.band === 1);
  assert(!!a1 && !!a2, 'jump day produced +1σ and +2σ touches');
  if (a1) approx(a1.fixedSigma, 1, 0.1, 'fixed σ ≈ historical RMS (≈1), not the wild day\'s own');
  if (a1) assert(a1.outcome === 'out', `+1σ touch on the jump resolves 'out' (got ${a1?.outcome})`);
  if (a2) assert(a2.outcome === 'out', `+2σ touch on the jump resolves 'out' (got ${a2?.outcome})`);
  assert(!!aDn, 'the collapse produced a down-side touch (two-way day tracked)');
  if (aDn) assert(a1 && aDn.otherSideMaxBand !== '0·none', 'down touch sees the earlier up-side progression');
  const b1 = touches.find(t => t.date === dateB && t.side === 'up' && t.band === 1);
  assert(!!b1, 'small-jump day produced a +1σ touch');
  if (b1) assert(b1.outcome === 'back', `+1σ touch with full retrace resolves 'back' (got ${b1?.outcome})`);
  if (b1) assert(b1.reachedVwap === true, 'the retrace tags VWAP (reachedVwap)');
  if (b1) assert(b1.mfeSigma > 0.5, `fade MFE in σ units is materially > 0 (got ${b1?.mfeSigma})`);
  assert(!touches.some(t => t.date === dateB && t.band >= 2), 'no +2σ touch on the small-jump day (bands did not shrink)');
  // Fixed-σ property, stated directly: day A's own RMS is far above the
  // warm-up RMS, yet every touch that day carries the HISTORICAL σ.
  const barsA = dayA.map(c => ({ high: c, low: c, close: c, volume: 1 }));
  const wildRms = sessionRmsFromVwap(barsA, computeSessionVwap(barsA).vwap);
  assert(wildRms > 1.5 * (a1?.fixedSigma ?? 1), `wild day RMS (${wildRms?.toFixed(2)}) ≫ the frozen σ used (${a1?.fixedSigma})`);
}

// ── 3. Perturb-the-future no-lookahead test ─────────────────────────────────
console.log('3. Perturb-the-future: earlier rows byte-identical');
{
  // 30 deterministic pseudo-random-ish days (seeded arithmetic, no Math.random).
  const mk = (seedShift) => {
    const days = [];
    for (let d = 0; d < 30; d++) {
      const arr = [];
      let px = 100 + d * 0.1;
      for (let m = 0; m < 400; m++) {
        px += Math.sin((d * 400 + m) * 0.7) * 0.15 + Math.cos(m * 0.13) * 0.05;
        // Perturb ONLY the last 8 days for the alternate run.
        arr.push(px + (seedShift && d >= 22 ? Math.sin(m * 1.7) * 2.5 : 0));
      }
      days.push(arr);
    }
    return packDays(days);
  };
  const clean = fixedSigmaWalk(mk(false), { instrument: 'TEST', minHistory: 10, minBarsPerDay: 300 });
  const pert = fixedSigmaWalk(mk(true), { instrument: 'TEST', minHistory: 10, minBarsPerDay: 300 });
  const cutDate = new Date((BASE_T + 22 * DAY) * 1000).toISOString().slice(0, 10);
  // A row's OUTCOME may legitimately read the rest of its own day — but day 21's
  // rows can see nothing of day 22+. Compare all rows strictly before the cut.
  const cleanBefore = JSON.stringify(clean.touches.filter(t => t.date < cutDate));
  const pertBefore = JSON.stringify(pert.touches.filter(t => t.date < cutDate));
  assert(clean.touches.filter(t => t.date < cutDate).length > 0, 'pre-cut rows exist to compare');
  assert(cleanBefore === pertBefore, 'rows before the perturbed region are byte-identical');
  assert(JSON.stringify(clean.touches) !== JSON.stringify(pert.touches),
         'perturbation actually changed post-cut rows (test has teeth)');
}

// ── 4. Session isolation ─────────────────────────────────────────────────────
console.log('4. Session isolation: ordinals/state reset daily');
{
  const warm = Array.from({ length: 12 }, () => wiggleDay(100, 1, 400));
  // Two identical jump days — each should produce its own ordinal-1 first touch.
  const ramp = [];
  for (let m = 0; m < 100; m++) ramp.push(100);
  for (let m = 0; m < 5; m++) ramp.push(100 + (m + 1) / 5 * 1.5);
  for (let m = 0; m < 295; m++) ramp.push(101.5);
  const packed = packDays([...warm, ramp, ramp]);
  const { touches } = fixedSigmaWalk(packed, { instrument: 'TEST', minHistory: 10, minBarsPerDay: 300 });
  const d1 = new Date((BASE_T + 12 * DAY) * 1000).toISOString().slice(0, 10);
  const d2 = new Date((BASE_T + 13 * DAY) * 1000).toISOString().slice(0, 10);
  const f1 = touches.filter(t => t.date === d1 && t.side === 'up' && t.band === 1);
  const f2 = touches.filter(t => t.date === d2 && t.side === 'up' && t.band === 1);
  assert(f1.length >= 1 && f2.length >= 1, 'both ramp days registered a +1σ touch');
  assert(f1[0]?.ordinal === 1 && f2[0]?.ordinal === 1, 'ordinal resets to 1 on the new session');
  assert(f2[0]?.ladderStep === '2·step', 'day-2 first +1σ touch is a fresh step (state not carried over)');
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
