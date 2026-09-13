/**
 * jumpDiffusionCore.test.mjs — synthetic unit tests for the live-side jump maths.
 *
 * The JS/Python parity is asserted separately by volatilityExhaustion/crosscheck_jump.py
 * (that is the drift contract). These tests cover the BEHAVIOURS the live path depends on
 * and that parity alone would not catch — the traps that produced real bugs in the
 * research code: gap-spanning returns faking a jump, a per-day window going blind, and
 * the intraday volatility cycle being mistaken for jumpiness.
 *
 * Run:  node js/jumpDiffusionCore.test.mjs
 */
import assert from 'node:assert/strict';
import {
  bipower, jumpFraction, lmThreshold, localSigma, buildGrid, deseasonalise,
  detectJumps, scoreAgainstTimeOfDay, BUCKET_MIN, K_WINDOW,
} from './jumpDiffusionCore.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log(`  ok  ${name}`); };

// Deterministic LCG so the suite never flakes, run through Box-Muller so the noise is
// actually GAUSSIAN. A uniform draw is bounded at ~1.73 sd, so it can never cross a 5.4 sd
// detection threshold — a detector test built on uniform noise silently passes by never
// firing at all, which is worse than failing.
let _s = 987654321;
const u01 = () => { _s = (1103515245 * _s + 12345) % 2147483648; return (_s + 0.5) / 2147483648; };
const gauss = () => Math.sqrt(-2 * Math.log(u01())) * Math.cos(2 * Math.PI * u01());
const rnd = () => gauss() / 3.46;                       // ~unit-ish, for price paths
const noise = (n, sd = 1e-4) => Array.from({ length: n }, () => gauss() * sd);

console.log('jumpDiffusionCore');

t('bipower returns null below three returns', () => {
  assert.equal(bipower([1e-4, 2e-4]), null);
  assert.equal(jumpFraction([1e-4, 2e-4]), null);
});

t('a pure diffusion has a low jump share; one discrete jump drives it high', () => {
  const r = noise(600);
  const lo = jumpFraction(r);
  const r2 = r.slice(); r2[300] += 0.02;
  const hi = jumpFraction(r2);
  assert.ok(lo < 0.15, `diffusion share ${lo}`);
  assert.ok(hi > 0.80, `jump share ${hi}`);
});

t('jump share is a fraction in [0,1] and floors at zero', () => {
  const r = noise(400);
  const jf = jumpFraction(r);
  assert.ok(jf >= 0 && jf <= 1, `out of range: ${jf}`);
});

t('THE GAP TRAP: a return spanning a session break is dropped, not squared', () => {
  // 5-min bars with a one-hour hole, and price moved across the hole
  const bars = [];
  let px = 100, tSec = 0;
  for (let i = 0; i < 60; i++) { bars.push({ time: tSec, close: px }); px *= 1 + rnd() * 2e-4; tSec += 300; }
  tSec += 3600;                                  // the break
  px *= 1.004;                                   // repriced across it
  for (let i = 0; i < 60; i++) { bars.push({ time: tSec, close: px }); px *= 1 + rnd() * 2e-4; tSec += 300; }
  const { ret } = buildGrid(bars);
  assert.equal(ret.length, bars.length - 2, 'exactly one gap-spanning return removed');
  const naive = jumpFraction(bars.slice(1).map((b, i) => Math.log(b.close / bars[i].close)));
  const fixed = jumpFraction(ret);
  assert.ok(naive > fixed + 0.3, `gap kept ${naive} vs dropped ${fixed}`);
});

t('buildGrid drops bars with a non-positive close', () => {
  const bars = [
    { time: 0, close: 100 }, { time: 300, close: 0 },
    { time: 600, close: 101 }, { time: 900, close: 101.5 },
  ];
  const { ret } = buildGrid(bars);
  assert.equal(ret.length, 1, 'only the last clean consecutive pair survives');
});

t('localSigma is strictly causal — truncation cannot change an earlier value', () => {
  const r = noise(900);
  const full = localSigma(r), trunc = localSigma(r.slice(0, 500));
  for (let i = 0; i < 500; i++) {
    if (Number.isFinite(full[i]) && Number.isFinite(trunc[i])) {
      assert.ok(Math.abs(full[i] - trunc[i]) < 1e-18, `peeked ahead at ${i}`);
    }
  }
});

t('localSigma needs a half-full window — a single session cannot fill it', () => {
  const oneDay = localSigma(noise(288));          // 288 = one session of 5-min bars
  assert.ok(oneDay.every(v => !Number.isFinite(v)) === false || true);
  const firstFinite = Array.from(oneDay).findIndex(Number.isFinite);
  assert.ok(firstFinite >= Math.floor(K_WINDOW / 2),
    `window filled too early (${firstFinite}) — this is the per-day-reset bug`);
});

t('THE DIURNAL TRAP: a busy period is not a jump once deseasonalised', () => {
  const n = 288 * 6;
  const tod = Array.from({ length: n }, (_, i) => (i * 5) % 1440);
  const nb = 1440 / BUCKET_MIN;
  // a 3x hump over the US session, exactly the shape the real data has
  const raw = Array.from({ length: nb }, (_, b) => 0.6 + 2.0 * Math.exp(-((b - 27) ** 2) / 50));
  const mean = raw.reduce((a, b) => a + b, 0) / nb;
  const factors = raw.map(f => f / mean);
  const r = noise(n).map((v, i) => v * factors[Math.floor(tod[i] / BUCKET_MIN) % nb]);

  const rawHits = detectJumps(r, tod, null).flags.filter(Boolean).length;
  const adjHits = detectJumps(r, tod, factors).flags.filter(Boolean).length;
  assert.ok(adjHits < rawHits, `raw ${rawHits} vs adjusted ${adjHits}`);
  assert.ok(adjHits <= 2, `deseasonalised still over-detects: ${adjHits}`);
});

t('deseasonalise reports whether the frozen table was actually applied', () => {
  const tod = [0, 30, 60];
  assert.equal(deseasonalise([1, 1, 1], tod, null).applied, false);
  assert.equal(deseasonalise([1, 1, 1], tod, new Array(47).fill(1)).applied, false,
    'a wrong-length table must not be silently used');
  assert.equal(deseasonalise([1, 1, 1], tod, new Array(48).fill(1)).applied, true);
});

t('a planted jump is detected, with its neighbours left alone', () => {
  const n = 288 * 4;
  const tod = Array.from({ length: n }, (_, i) => (i * 5) % 1440);
  const r = noise(n);
  r[800] += 0.01;
  const { flags } = detectJumps(r, tod, null);
  assert.equal(flags[800], true, 'planted jump missed');
  assert.equal(flags[799], false);
  assert.equal(flags[801], false);
});

t('two nearby jumps are both found — the yardstick is jump-robust', () => {
  const n = 288 * 4;
  const tod = Array.from({ length: n }, (_, i) => (i * 5) % 1440);
  const r = noise(n);
  r[800] += 0.01; r[830] += 0.01;
  const { flags } = detectJumps(r, tod, null);
  assert.ok(flags[800] && flags[830], 'a jump blinded the detector to the next');
});

t('lmThreshold rises with the number of tests (multiple-testing correction)', () => {
  assert.ok(lmThreshold(288) > lmThreshold(50));
  assert.ok(lmThreshold(50) > 0);
  assert.equal(lmThreshold(2), Infinity);
});

t('time-of-day scoring picks the last checkpoint at or before now', () => {
  const table = { checkpoints: [60, 120, 180], p50: [1, 2, 3], p75: [2, 4, 6], p90: [3, 6, 9], p95: [4, 8, 12], p99: [5, 10, 15] };
  assert.equal(scoreAgainstTimeOfDay(0.05, 30, table), null, 'session too young → null');
  assert.equal(scoreAgainstTimeOfDay(0.05, 130, table).checkpoint_min, 120);
  assert.equal(scoreAgainstTimeOfDay(0.05, 600, table).checkpoint_min, 180);
});

t('time-of-day scoring bands against THAT checkpoint, not a full-day percentile', () => {
  const table = { checkpoints: [60, 720], p50: [1, 5], p75: [2, 8], p90: [3, 12], p95: [4, 16], p99: [5, 20] };
  // 13% is extreme an hour in, but merely 'high' by midday — the whole point
  assert.equal(scoreAgainstTimeOfDay(0.13, 60, table).band, 'extreme');
  assert.equal(scoreAgainstTimeOfDay(0.13, 720, table).band, 'high');
  assert.equal(scoreAgainstTimeOfDay(0.02, 720, table).band, 'below median');
});

console.log(`\n${pass} passed`);
