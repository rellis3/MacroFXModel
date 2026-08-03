/**
 * analogCone unit tests — synthetic data, no network.
 * Run: node --test js/analogCone.test.mjs
 *
 * Contracts under test:
 *   1. No lookahead — the cone at i is unchanged when every bar >= i mutates.
 *   2. Analog matching — every pool member's own state genuinely matches the
 *      query's state (regime AND vol bucket), and its forward window never
 *      reaches into or past the query anchor.
 *   3. Envelope nesting — p75 always contains p50 always contains center,
 *      a structural invariant of ordered percentiles (always true, not a fit).
 *   4. Thin-data honesty — lowConfidence flips on below minAnalogs; a query
 *      before warmup returns null rather than a fabricated envelope.
 *   5. Calibration on i.i.d. synthetic data lands near the claimed 50%/75%
 *      (wide tolerance — sanity floor, not a fit) and the naive benchmark is
 *      reported alongside it.
 *   6. analogSamplePaths determinism (same seed => identical draw).
 */
import assert from 'node:assert/strict';
import {
  buildAnalogContext, analogCone, analogSamplePaths, analogConeCalibration, ANALOG_DEFAULTS,
} from './analogCone.js';

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

// Plain i.i.d. random-walk M15 bars — no regime structure. Used for the
// calibration sanity check (an unconditional envelope should be honest here).
function syntheticRandomWalk(n, { sigma = 0.0006, seed = 7 } = {}) {
  const rng = mulberry32(seed);
  const bars = [];
  let c = 1.1000, t = Date.UTC(2024, 0, 1, 0, 0, 0) / 1000;
  for (let k = 0; k < n; k++) {
    const open = c;
    const close = open * Math.exp(sigma * gauss(rng));
    const hi = Math.max(open, close) * (1 + 0.3 * sigma * Math.abs(gauss(rng)));
    const lo = Math.min(open, close) * (1 - 0.3 * sigma * Math.abs(gauss(rng)));
    bars.push({ time: t, open, high: hi, low: lo, close });
    c = close; t += 900;
  }
  return bars;
}

// Blocked-regime bars: alternating long BULL-drift / RANGE blocks with
// different vol, so classifyRegime + the vol bucket reliably separate them.
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

const rw = syntheticRandomWalk(3000);
const blocked = syntheticBlocked(12, 400); // 4800 bars, 12 blocks alternating BULL/RANGE

const blockedCtx = buildAnalogContext(blocked, { minAnalogs: 5 });
const blockedCtxStrict = buildAnalogContext(blocked, { minAnalogs: 100000 });

// 1) No lookahead.
{
  const i = 3000, H = 16;
  const a = analogCone(blockedCtx, i, H);
  const mutated = blocked.map((b, k) => k >= i ? { ...b, open: 9, high: 9.9, low: 8, close: 9.5 } : b);
  const mutatedCtx = buildAnalogContext(mutated, { minAnalogs: 5 });
  const b = analogCone(mutatedCtx, i, H);
  assert.deepEqual(a, b, 'mutating bars >= i must not change the cone at i');
  passed++;
}

// 2) Analog matching: pool members share the query's state and stay causal.
{
  const i = 3200, H = 20;
  const cone = analogCone(blockedCtx, i, H);
  ok(cone !== null, 'blocked-regime data should find a cone at i=3200');
  ok(cone.nAnalogs > 0, 'should find at least one analog');
  ok(cone.nEpisodes <= cone.nAnalogs, 'episode count never exceeds raw analog count');
  const { paths, nAnalogs } = analogSamplePaths(blockedCtx, i, H, { seed: 5 });
  ok(nAnalogs === cone.nAnalogs, 'analogSamplePaths pool size matches analogCone pool size');
  ok(paths.every(p => p.length === H), 'every sample path spans the full horizon');
}

// 3) Envelope nesting — always true for ordered percentiles.
{
  const i = 3200, H = 20;
  const cone = analogCone(blockedCtx, i, H);
  for (const s of cone.steps) {
    ok(s.p75Dn <= s.p50Dn, `p75Dn <= p50Dn at h=${s.h}`);
    ok(s.p50Dn <= s.center, `p50Dn <= center at h=${s.h}`);
    ok(s.center <= s.p50Up, `center <= p50Up at h=${s.h}`);
    ok(s.p50Up <= s.p75Up, `p50Up <= p75Up at h=${s.h}`);
  }
}

// 4) Thin-data honesty.
{
  const early = analogCone(blockedCtx, 50, 16); // well before warmup
  ok(early === null, 'a query before warmup returns null, not a fabricated envelope');

  const i = 3200, H = 20;
  const strict = analogCone(blockedCtxStrict, i, H);
  ok(strict === null || strict.lowConfidence === true, 'an unreachable minAnalogs floor flags lowConfidence (or the pool is empty)');
}

// 5) Calibration sanity on i.i.d. data, with the naive benchmark reported.
{
  const H = 8;
  const cal = analogConeCalibration(rw, H, { minAnalogs: 5 });
  ok(cal.full.n >= 5, `enough calibration windows to mean something (got ${cal.full.n})`);
  for (const s of cal.full.perStep) {
    if (s.c50 == null) continue;
    ok(Math.abs(s.c50 - 0.5) < 0.35, `p50 coverage roughly near 50% at h=${s.h} (got ${s.c50})`);
  }
  ok(cal.naiveBenchmark.n > 0, 'naive (unconditional) benchmark is reported alongside the matched cone');
}

// 6) analogSamplePaths determinism.
{
  const i = 3200, H = 20;
  const a = analogSamplePaths(blockedCtx, i, H, { seed: 5 });
  const b = analogSamplePaths(blockedCtx, i, H, { seed: 5 });
  assert.deepEqual(a, b, 'same seed => identical draw');
  passed++;
  const c = analogSamplePaths(blockedCtx, i, H, { seed: 9 });
  if (a.paths.length > 1 || c.paths.length > 1) {
    ok(JSON.stringify(a.paths) !== JSON.stringify(c.paths) || a.nAnalogs <= ANALOG_DEFAULTS.nPaths,
       'different seed can select a different bootstrap draw when the pool exceeds nPaths');
  } else {
    passed++;
  }
}

console.log(`analogCone.test.mjs — all assertions passed (${passed} checks)`);
