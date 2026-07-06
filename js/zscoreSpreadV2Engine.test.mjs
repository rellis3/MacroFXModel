// Unit tests for the V2 confidence-scoring bricks. Pure math, no network — this
// validates CORRECTNESS of the scoring logic, NOT strategy edge (that needs a live
// FRED_KEY on Railway; local synthetic FRED is unreliable for the A/B — see the
// engine header). Run: node js/zscoreSpreadV2Engine.test.mjs
import assert from 'node:assert';
import {
  zAlignScore, approachVelRangeScaled, velToScore, structScore,
  riskOffScore, compositeConfidence, confBucketOf,
  buildSingleRollingZByDate, buildRiskOffByDate, splitTradesByDate,
} from './zscoreConfidenceCore.js';

let passed = 0;
function t(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

console.log('zscoreSpreadV2Engine — confidence bricks');

// ── zAlignScore: macro confirms/vetoes the fade ────────────────────────────────
t('zAlign neutral at z=0', () => assert(approx(zAlignScore(0, 'LONG'), 0.5)));
t('zAlign → 1 when carry (z>0→LONG bias) agrees with a LONG fade at |z|=cap', () =>
  assert(approx(zAlignScore(3, 'LONG', { zCap: 3 }), 1.0)));
t('zAlign → 0 when carry opposes the fade at |z|=cap', () =>
  assert(approx(zAlignScore(3, 'SHORT', { zCap: 3 }), 0.0)));
t('zAlign is monotonic in |z| for an agreeing fade', () =>
  assert(zAlignScore(1, 'LONG') < zAlignScore(2, 'LONG') && zAlignScore(2, 'LONG') < zAlignScore(3, 'LONG')));
t('zAlign saturates at zCap (|z|>cap does not exceed 1)', () =>
  assert(approx(zAlignScore(9, 'LONG', { zCap: 3 }), 1.0)));
t('zAlign inverted flips the bias direction', () =>
  assert(approx(zAlignScore(3, 'SHORT', { inverted: true, zCap: 3 }), 1.0)));
t('zAlign neutral on non-finite z', () => assert(approx(zAlignScore(NaN, 'LONG'), 0.5)));

// ── approach velocity ──────────────────────────────────────────────────────────
t('approachVel = travel / range over the window', () => {
  const closes = [1.0, 1.0, 1.0, 1.05];   // moved 0.05 over 3 bars
  assert(approx(approachVelRangeScaled(closes, 3, 3, 0.10), 0.5));
});
t('approachVel 0 when window exceeds history', () =>
  assert(approx(approachVelRangeScaled([1, 2], 1, 5, 0.1), 0)));
t('velToScore saturates at velRef', () => {
  assert(approx(velToScore(0.25, 0.5), 0.5));
  assert(approx(velToScore(0.5, 0.5), 1.0));
  assert(approx(velToScore(2.0, 0.5), 1.0));
});

// ── structScore ────────────────────────────────────────────────────────────────
t('structScore rises with fib depth, saturates at 2×', () => {
  assert(structScore(0.5) < structScore(1.5));
  assert(approx(structScore(2.0), 1.0));
  assert(approx(structScore(4.0), 1.0));
});

// ── riskOffScore: the carry-crash gate ──────────────────────────────────────────
t('riskOff 1.0 when calm (z at/below mean)', () => assert(approx(riskOffScore(0, 0), 1.0)));
t('riskOff 0.0 when stressed (either z >= stressCap)', () =>
  assert(approx(riskOffScore(2, 0, { stressCap: 2 }), 0.0)));
t('riskOff takes the MAX stress source (either vetoes)', () =>
  assert(approx(riskOffScore(-1, 1, { stressCap: 2 }), 0.5)));
t('riskOff neutral (0.5) when both series missing — never a free veto', () =>
  assert(approx(riskOffScore(null, null), 0.5)));
t('riskOff ignores below-mean (negative) z as non-stress', () =>
  assert(approx(riskOffScore(-3, -3), 1.0)));

// ── compositeConfidence ──────────────────────────────────────────────────────────
t('composite is the normalised weighted blend', () => {
  const w = { z: 0.5, riskOff: 0.5, vel: 0, struct: 0 };
  assert(approx(compositeConfidence({ zAlign01: 1, riskOff: 0, velScore: 0, struct: 0 }, w), 0.5));
});
t('ablating a factor (weight 0) removes it cleanly', () => {
  const w = { z: 1, riskOff: 0, vel: 0, struct: 0 };
  assert(approx(compositeConfidence({ zAlign01: 0.8, riskOff: 0, velScore: 0, struct: 0 }, w), 0.8));
});
t('composite 0 when all weights ablated', () =>
  assert(approx(compositeConfidence({ zAlign01: 1, riskOff: 1, velScore: 1, struct: 1 }, { z: 0, riskOff: 0, vel: 0, struct: 0 }), 0)));
t('a stressed regime pulls a strong-carry setup below a 0.5 bar', () => {
  const w = { z: 0.35, riskOff: 0.20, vel: 0.30, struct: 0.15 };
  const calm     = compositeConfidence({ zAlign01: 1, riskOff: 1, velScore: 0.4, struct: 0.5 }, w);
  const stressed = compositeConfidence({ zAlign01: 1, riskOff: 0, velScore: 0.4, struct: 0.5 }, w);
  assert(stressed < calm, 'risk-off must reduce confidence');
});

// ── confBucketOf ─────────────────────────────────────────────────────────────────
t('confBucket edges', () => {
  assert.equal(confBucketOf(0.72), '0.70+');
  assert.equal(confBucketOf(0.65), '0.60-0.70');
  assert.equal(confBucketOf(0.55), '0.50-0.60');
  assert.equal(confBucketOf(0.40), '<0.50');
});

// ── rolling single-series z + risk map ───────────────────────────────────────────
t('buildSingleRollingZByDate: constant series → no dispersion → no z emitted', () => {
  const obs = new Map();
  for (let d = 1; d <= 60; d++) obs.set(`2020-01-${String(d).padStart(2, '0')}`, 20);
  const z = buildSingleRollingZByDate(obs, 30, '2020-01-01', '2020-02-28');
  assert.equal(z.size, 0);   // std ~ 0 → guarded out
});
t('buildRiskOffByDate merges vix+hy keys with nullable legs', () => {
  const vix = new Map(); const hy = new Map();
  for (let d = 1; d <= 60; d++) {
    const k = `2020-03-${String(d).padStart(2, '0')}`;
    vix.set(k, 15 + (d % 7)); hy.set(k, 300 + d * 2);
  }
  const risk = buildRiskOffByDate(vix, hy, 30, '2020-03-01', '2020-04-30');
  assert(risk.size > 0);
  for (const v of risk.values()) assert('vixZ' in v && 'hyZ' in v);
});

// ── OOS split ────────────────────────────────────────────────────────────────────
t('splitTradesByDate splits by unique date at splitFrac', () => {
  const trades = ['2020-01-01', '2020-01-02', '2020-01-03', '2020-01-04', '2020-01-05']
    .map(date => ({ date }));
  const { splitDate, is, oos } = splitTradesByDate(trades, 0.6);
  assert.equal(splitDate, '2020-01-04');
  assert.equal(is.length, 3);   // 01,02,03
  assert.equal(oos.length, 2);  // 04,05
});
t('splitTradesByDate empty → empty', () => {
  const { is, oos } = splitTradesByDate([], 0.6);
  assert.equal(is.length, 0); assert.equal(oos.length, 0);
});

console.log(`\n${passed} passed`);
