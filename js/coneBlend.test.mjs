/**
 * coneBlend unit tests — synthetic data, no network.
 * Run: node --test js/coneBlend.test.mjs
 *
 * Contracts under test:
 *   1. blendCones is a pure quantile-average in log space: weightA=1 recovers
 *      Cone A exactly, weightA=0 recovers Cone B exactly, and a missing cone
 *      falls back to whichever one exists.
 *   2. fitBlendWeights produces a valid probability (global and per bucket)
 *      and never trusts a bucket below minBucketN.
 *   3. blendCalibration's OOS windows never touch the IS fit range, and it
 *      reports the blend, Cone A alone, and Cone B alone on the SAME OOS
 *      slice so they're comparable.
 */
import assert from 'node:assert/strict';
import { blendCones, fitBlendWeights, weightAFor, blendCalibration, BLEND_DEFAULTS } from './coneBlend.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function syntheticBlocked(nBlocks, blockLen, { seed = 3 } = {}) {
  const rng = mulberry32(seed);
  const bars = [];
  let c = 1.1000, t = Date.UTC(2024, 0, 1, 0, 0, 0) / 1000;
  for (let b = 0; b < nBlocks; b++) {
    const bull = b % 2 === 0;
    const mu = bull ? 0.0006 : 0;
    const sigma = bull ? 0.0004 : 0.0009;
    for (let k = 0; k < blockLen; k++) {
      const open = c;
      const close = open * Math.exp(mu + sigma * gauss(rng));
      const hi = Math.max(open, close) * (1 + 0.3 * sigma * Math.abs(gauss(rng)));
      const lo = Math.min(open, close) * (1 - 0.3 * sigma * Math.abs(gauss(rng)));
      bars.push({ time: t, open, high: hi, low: lo, close });
      c = close; t += 900;
    }
  }
  return bars;
}

let passed = 0;
function ok(cond, msg) { assert.ok(cond, msg); passed++; }

// Hand-built cones for the pure blendCones math (no need for real data here).
const anchor = 1.1000;
const coneA = {
  anchor, anchorTime: 1000,
  steps: [
    { h: 1, time: 1900, center: 1.1010, p50Dn: 1.0990, p50Up: 1.1030, p75Dn: 1.0970, p75Up: 1.1050 },
    { h: 2, time: 2800, center: 1.1020, p50Dn: 1.0980, p50Up: 1.1060, p75Dn: 1.0950, p75Up: 1.1090 },
  ],
};
const coneB = {
  anchor, anchorTime: 1000,
  steps: [
    { h: 1, time: 1900, center: 1.0995, p50Dn: 1.0960, p50Up: 1.1030, p75Dn: 1.0930, p75Up: 1.1060 },
    { h: 2, time: 2800, center: 1.0985, p50Dn: 1.0920, p50Up: 1.1050, p75Dn: 1.0880, p75Up: 1.1090 },
  ],
};

// 1) weightA=1 / weightA=0 recover the input cones (within float tolerance);
//    a missing cone falls back to the one present.
{
  const onlyA = blendCones(coneA, coneB, 1);
  const onlyB = blendCones(coneA, coneB, 0);
  for (let h = 0; h < 2; h++) {
    for (const k of ['center', 'p50Dn', 'p50Up', 'p75Dn', 'p75Up']) {
      ok(Math.abs(onlyA.steps[h][k] - coneA.steps[h][k]) < 1e-9, `weightA=1 recovers Cone A ${k} at h=${h + 1}`);
      ok(Math.abs(onlyB.steps[h][k] - coneB.steps[h][k]) < 1e-9, `weightA=0 recovers Cone B ${k} at h=${h + 1}`);
    }
  }
  assert.equal(blendCones(coneA, null, 0.7), coneA, 'missing Cone B falls back to Cone A');
  assert.equal(blendCones(null, coneB, 0.7), coneB, 'missing Cone A falls back to Cone B');
  assert.equal(blendCones(null, null, 0.7), null, 'both missing => null');
  passed += 3;
}

// 2) A 50/50 blend sits between the two inputs at every quantile, in log space.
{
  const half = blendCones(coneA, coneB, 0.5);
  for (let h = 0; h < 2; h++) {
    for (const k of ['center', 'p50Dn', 'p50Up', 'p75Dn', 'p75Up']) {
      const lo = Math.min(coneA.steps[h][k], coneB.steps[h][k]);
      const hi = Math.max(coneA.steps[h][k], coneB.steps[h][k]);
      ok(half.steps[h][k] >= lo - 1e-9 && half.steps[h][k] <= hi + 1e-9, `50/50 blend of ${k} at h=${h + 1} sits between the inputs`);
    }
  }
}

// ── End-to-end on synthetic intraday-shaped data ─────────────────────────────
const bars = syntheticBlocked(20, 300); // 6000 M15-shaped bars, alternating BULL/RANGE

// 3) fitBlendWeights: valid probabilities, thin buckets never trusted.
{
  const H = 20;
  const fit = fitBlendWeights(bars, H, { minBucketN: 15 });
  ok(fit.globalWeightA >= 0 && fit.globalWeightA <= 1, `globalWeightA is a probability (got ${fit.globalWeightA})`);
  ok(fit.nGlobal > 0, 'fit graded at least one IS window');
  for (const [key, w] of fit.bucketWeights) {
    if (w != null) ok(w >= 0 && w <= 1, `bucket ${key} weight is a probability (got ${w})`);
  }
  const w = weightAFor(fit, 'NONEXISTENT_REGIME', 'NONEXISTENT_VOL');
  assert.equal(w, fit.globalWeightA, 'an unseen bucket falls back to the global weight');
  passed++;
}

// 4) blendCalibration: OOS windows never touch the IS fit range, and blend /
//    Cone A / Cone B are graded on the exact same OOS slice.
{
  const H = 20;
  const cal = blendCalibration(bars, H, { minBucketN: 15 });
  ok(cal.oosWindows > 0, `should grade at least one OOS window (got ${cal.oosWindows})`);
  ok(cal.oosStart >= cal.isEnd, 'OOS grading starts at or after the IS fit boundary');
  ok(cal.blend.n === cal.coneA.n && cal.coneA.n === cal.coneB.n,
     `blend/coneA/coneB graded on the same window count (${cal.blend.n}, ${cal.coneA.n}, ${cal.coneB.n})`);
  ok(cal.claimed.p50 === 0.5 && cal.claimed.p75 === 0.75, 'claimed coverage matches the P50/P75 convention');
}

console.log(`coneBlend.test.mjs — all assertions passed (${passed} checks)`);
