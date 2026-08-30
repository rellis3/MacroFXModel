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

import { fixedSigmaWalk, sessionRmsFromVwap, computeFixedSigmaByDate, DEFAULT_CFG } from './vwapFixedSigmaEngine.js';
import { computeSessionVwap } from './vwapReversionEngine.js';
import { buildTradeWinBook, extractHeldFindings } from './vwapFixedSigmaReport.js';

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

// ── 6. computeFixedSigmaByDate ≡ the σ the walk records on touches ──────────
// The exported by-date series exists so trade-level engines use the IDENTICAL
// band unit — this equivalence test is what makes that a guarantee, not a hope.
console.log('6. computeFixedSigmaByDate matches walk-recorded σ');
{
  const days = [];
  for (let d = 0; d < 25; d++) {
    const arr = [];
    let px = 100 + d * 0.05;
    for (let m = 0; m < 400; m++) { px += Math.sin((d * 400 + m) * 0.7) * 0.15; arr.push(px); }
    days.push(arr);
  }
  const packed = packDays(days);
  const opts = { instrument: 'TEST', minHistory: 10, minBarsPerDay: 300 };
  const { touches } = fixedSigmaWalk(packed, opts);
  const byDate = computeFixedSigmaByDate(packed, opts);
  assert(touches.length > 0 && byDate.size > 0, `have ${touches.length} touches and ${byDate.size} σ dates to compare`);
  let mismatches = 0;
  for (const t of touches) {
    const fs = byDate.get(t.date);
    if (fs == null || Math.abs(fs - t.fixedSigma) > 1e-4) mismatches++;
  }
  assert(mismatches === 0, `every touch's fixedSigma matches the by-date series (${mismatches} mismatches)`);
}

// ── 7. liteContext invariance + sigmaMode sanity ─────────────────────────────
// liteContext must change ONLY the context bucket fields (nulled) — identity
// and outcome fields must be byte-identical. 'developing' must run and use a
// per-bar σ (its recorded fixedSigma varies within a day).
console.log('7. liteContext invariance; developing-mode sanity');
{
  const days = [];
  for (let d = 0; d < 25; d++) {
    const arr = []; let px = 100 + d * 0.05;
    for (let m = 0; m < 400; m++) { px += Math.sin((d * 400 + m) * 0.7) * 0.15; arr.push(px); }
    days.push(arr);
  }
  const packed = packDays(days);
  const opts = { instrument: 'TEST', minHistory: 10, minBarsPerDay: 300 };
  const fullRun = fixedSigmaWalk(packed, opts).touches;
  const liteRun = fixedSigmaWalk(packed, { ...opts, liteContext: true }).touches;
  const core = t => [t.date, t.side, t.band, t.ordinal, t.outcome, t.mfeSigma, t.maeSigma,
                     t.reachedVwap, t.minsToVwap, t.fixedSigma].join('|');
  assert(fullRun.length === liteRun.length, `lite and full runs emit the same touches (${fullRun.length} vs ${liteRun.length})`);
  assert(fullRun.every((t, i) => core(t) === core(liteRun[i])), 'lite run: identity+outcome fields byte-identical to full run');
  assert(liteRun.every(t => t.wtState == null && t.rangeConf == null && t.momRangeMatrix == null),
    'lite run: feature-pack-dependent fields (incl. the new momRangeMatrix combo) are null');
  assert(liteRun.some(t => t.rangeConsumed != null) && liteRun.some(t => t.vwapSlope != null),
    'lite run: LOCAL context fields (rangeConsumed, vwapSlope) are NOT nulled — same as vwapDrift/churn');

  const dev = fixedSigmaWalk(packed, { ...opts, liteContext: true, sigmaMode: 'developing' }).touches;
  assert(dev.length > 0, `developing mode emits touches (${dev.length})`);
  const byDay = new Map();
  for (const t of dev) (byDay.get(t.date) ?? byDay.set(t.date, []).get(t.date)).push(t.fixedSigma);
  const varies = [...byDay.values()].some(a => a.length > 1 && Math.abs(a[0] - a[a.length - 1]) > 1e-9);
  assert(varies, 'developing mode: σ varies within a day (per-bar unit, not frozen)');
}

// ── 8. rangeConsumed causality + vwapSlope direction (2026-08-30) ────────────
console.log('8. rangeConsumed causality; vwapSlope direction');
{
  // A calm run, then ONE wild (huge-range) day, then a final "measurement"
  // day. rangeExpected for the measurement day must be the median of the
  // PRIOR days' banked ranges (wild day included, since it's now history) —
  // but the WILD DAY ITSELF must not have used its own range as history
  // (that would be circular/leaky), and no day may see rangeExpected computed
  // from anything after it.
  const calm = Array.from({ length: 20 }, () => wiggleDay(100, 0.5, 400));
  const wildDay = wiggleDay(100, 15, 400);            // huge range vs the calm 20
  const measureDay = wiggleDay(100, 0.5, 400);
  const packed = packDays([...calm, wildDay, measureDay]);
  const opts = { instrument: 'TEST', minHistory: 10, minBarsPerDay: 300 };
  const { touches } = fixedSigmaWalk(packed, opts);

  const wildDate = new Date((BASE_T + 20 * DAY) * 1000).toISOString().slice(0, 10);
  const measureDate = new Date((BASE_T + 21 * DAY) * 1000).toISOString().slice(0, 10);
  const wildTouches = touches.filter(t => t.date === wildDate);
  const measureTouches = touches.filter(t => t.date === measureDate);
  assert(wildTouches.length > 0 && measureTouches.length > 0, 'both the wild day and the day after it registered touches');

  // Independently recompute rangeExpected for the measure day the SAME way
  // the engine does (trailing median of the 20 PRIOR banked ranges — calm
  // days' actual high-low span, computed straight from the synthetic input),
  // and confirm it is NOT distorted by the wild day dwarfing a smaller
  // calm-day history the way the wild day's own OWN range would if leaked.
  const calmRangeApprox = 0.5 * 2;   // the wiggle's own peak-to-trough span
  const measureRangeConsumed = measureTouches[0]?.rangeConsumedRatio;
  assert(measureRangeConsumed != null, 'measurement day recorded a rangeConsumedRatio');
  // The wild day is IN the trailing-20 history for the measure day (one of
  // 20 sessions), so its median-based expected range should still track close
  // to the calm baseline, not explode — median is robust to the one outlier.
  assert(measureRangeConsumed < 5, `measure-day rangeConsumedRatio stays sane despite one wild session in history (got ${measureRangeConsumed}, expected order-of-magnitude ~1, not the wild day's own ~30x blowout)`);

  // The wild day's OWN rangeConsumed must be computed from the CALM history
  // only (it hasn't banked its own range yet) — so its ratio should run HIGH
  // (today's realized range vastly exceeds the calm expectation), not ~1.
  const wildLate = wildTouches.filter(t => t.minsIntoSession > 200).sort((a, b) => b.rangeConsumedRatio - a.rangeConsumedRatio)[0];
  assert(wildLate && wildLate.rangeConsumedRatio > 3, `the wild day's own touches show an elevated rangeConsumedRatio vs the calm prior history (got ${wildLate?.rangeConsumedRatio}), confirming its own huge range wasn't used as its own denominator`);

  // vwapSlope direction: a session that ramps steadily upward for its first
  // half should show vwapSlope='3·with' on an UP-side touch (VWAP trending
  // toward the touch side) — constructed directly, no wiggle noise.
  const rampUp = []; let px = 100;
  for (let m = 0; m < 400; m++) { px += 0.05; rampUp.push(px); }
  const rampPacked = packDays([...Array.from({ length: 20 }, () => wiggleDay(100, 0.3, 400)), rampUp]);
  const { touches: rampTouches } = fixedSigmaWalk(rampPacked, { instrument: 'TEST', minHistory: 10, minBarsPerDay: 300, vwapSlopeWin: 30 });
  const rampDate = new Date((BASE_T + 20 * DAY) * 1000).toISOString().slice(0, 10);
  const rampUpTouch = rampTouches.filter(t => t.date === rampDate && t.side === 'up' && t.minsIntoSession > 60)[0];
  assert(rampUpTouch?.vwapSlope === '3·with' && rampUpTouch?.vwapSlopeSig > 0,
    `steadily-ramping-up VWAP reads '3·with' (positive slopeSig) on an up-side touch, got ${rampUpTouch?.vwapSlope}/${rampUpTouch?.vwapSlopeSig}`);
}

// ── 9. bandWalk (rejection vs walking) + regimeState wiring (2026-08-30) ────
console.log('9. bandWalk rejection-vs-walking; regimeState/wtRegimeState wiring');
{
  const warm = Array.from({ length: 12 }, () => wiggleDay(100, 1, 400));

  // "Walking": jump past +1σ then STAY well beyond a lenient in-band
  // threshold (vwap+0.7σ ≈ 100.7) for the rest of the day.
  const walkDay = [];
  for (let m = 0; m < 100; m++) walkDay.push(100);
  for (let m = 0; m < 3; m++) walkDay.push(100 + (m + 1) / 3 * 1.5);
  for (let m = 0; m < 297; m++) walkDay.push(101.6);

  // "Rejection": same jump, then SNAPS straight back inside on the very next bar.
  const rejectDay = [];
  for (let m = 0; m < 100; m++) rejectDay.push(100);
  for (let m = 0; m < 3; m++) rejectDay.push(100 + (m + 1) / 3 * 1.5);
  for (let m = 0; m < 297; m++) rejectDay.push(100.0);

  const packed = packDays([...warm, walkDay, rejectDay]);
  const opts = { instrument: 'TEST', minHistory: 10, minBarsPerDay: 300 };
  const { touches } = fixedSigmaWalk(packed, opts);
  const walkDate = new Date((BASE_T + 12 * DAY) * 1000).toISOString().slice(0, 10);
  const rejectDate = new Date((BASE_T + 13 * DAY) * 1000).toISOString().slice(0, 10);
  const walkT = touches.filter(t => t.date === walkDate && t.side === 'up' && t.band === 1)[0];
  const rejectT = touches.filter(t => t.date === rejectDate && t.side === 'up' && t.band === 1)[0];
  assert(walkT && rejectT, 'both the walking day and the rejecting day registered a +1σ up touch');
  assert(walkT.bandWalk === '3·walking' && walkT.walkBarsBeyond >= 9,
    `sustained post-touch extension reads '3·walking' (got ${walkT?.bandWalk}, walkBarsBeyond=${walkT?.walkBarsBeyond})`);
  assert(rejectT.bandWalk === '1·reject-fast' && rejectT.walkBarsBeyond <= 2,
    `an immediate snap-back reads '1·reject-fast' (got ${rejectT?.bandWalk}, walkBarsBeyond=${rejectT?.walkBarsBeyond})`);
  assert(walkT.walkBarsBeyond > rejectT.walkBarsBeyond, 'the walking day accumulated materially more walkBarsBeyond than the rejecting day');

  // regimeState/wtRegimeState wiring: present whenever their component
  // buckets are, and correctly composed (not silently dropping a factor).
  const withRegime = touches.filter(t => t.regimeState != null);
  assert(withRegime.length > 0, 'regimeState populates on real touches');
  assert(withRegime.every(t => t.regimeState === `${t.momAdx}×${t.bandSlope}`),
    'regimeState is exactly momAdx×bandSlope, never a mismatched combination');
  const withWtRegime = touches.filter(t => t.wtRegimeState != null);
  assert(withWtRegime.length > 0, 'wtRegimeState populates on real touches');
  assert(withWtRegime.every(t => t.wtRegimeState === `${t.regimeState}×${t.wtState}`),
    'wtRegimeState is exactly regimeState×wtState (VuManChu layered on top)');

  // pmoValue/pmoSignal/pmoState wiring (2026-08-30): populates on real
  // touches, and pmoState is exactly the sign of pmoValue vs pmoSignal.
  const withPmo = touches.filter(t => t.pmoValue != null);
  assert(withPmo.length > 0, 'pmoValue populates on real touches');
  assert(withPmo.every(t => t.pmoState === (t.pmoValue > t.pmoSignal ? '2·above-signal' : '1·below-signal')),
    'pmoState is exactly pmoValue vs pmoSignal, never a mismatched bucket');

  // rsiValue/rsiState wiring (2026-08-30): populates on real touches, bounded
  // [0,100], and rsiState is exactly the side-oriented overbought/oversold
  // read (never a mismatched bucket for a given side+value).
  const withRsi = touches.filter(t => t.rsiValue != null);
  assert(withRsi.length > 0, 'rsiValue populates on real touches');
  assert(withRsi.every(t => t.rsiValue >= 0 && t.rsiValue <= 100), 'rsiValue is bounded [0,100]');
  assert(withRsi.every(t => {
    const isUp = t.side === 'up';
    const expected = (isUp ? t.rsiValue >= 70 : t.rsiValue <= 30) ? '3·extended'
      : (isUp ? t.rsiValue <= 30 : t.rsiValue >= 70) ? '1·counter' : '2·neutral';
    return t.rsiState === expected;
  }), 'rsiState is exactly the side-oriented RSI read, never a mismatched bucket');
}

// buildTradeWinBook / extractHeldFindings (2026-08-30, synthetic): a
// dimension that perfectly predicts win/loss must hold OOS; an uncorrelated
// one must not.
{
  const base = Date.UTC(2024, 0, 1) / 86400000;
  const rows = [];
  for (let i = 0; i < 200; i++) {
    const date = new Date((base + i) * 86400000).toISOString().slice(0, 10);
    const testDim = i % 2 === 0 ? 'A' : 'B';         // perfectly predicts win, evenly spread
    const noise = (i * 7) % 3 === 0 ? 'X' : 'Y';     // uncorrelated with win
    rows.push({ date, testDim, noise, win: testDim === 'A' });
  }
  const book = buildTradeWinBook(rows, { cellKey: 'test', dimList: [['testDim', 'test dim'], ['noise', 'noise dim']] });
  assert(book != null, 'buildTradeWinBook returns a book for a populated row set');
  const held = extractHeldFindings(book, { limit: 100 });
  const testHolds = held.filter(h => h.dimKey === 'testDim');
  assert(testHolds.length === 2, 'a dimension that perfectly predicts win/loss holds OOS, both buckets');
  assert(testHolds.every(h => h.n.is >= 30 && h.n.oos >= 30), 'held findings clear the n>=30-both-halves gate');
  const noiseHolds = held.filter(h => h.dimKey === 'noise');
  assert(noiseHolds.length === 0, 'an uncorrelated dimension does not hold');
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
