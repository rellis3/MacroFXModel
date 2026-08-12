/**
 * expectedMoveCore unit tests — synthetic data, no network.
 * Run: node --test js/expectedMoveCore.test.mjs
 *
 * Contracts under test:
 *   1. computeExpectedMove degrades honestly (ok:false + reason) below MIN_BARS,
 *      rather than returning a thin/misleading read.
 *   2. On enough synthetic history it returns a well-formed record: direction
 *      call is one of the defined labels, pip conversions are anchor-relative,
 *      p75 band is wider than p50 (sanity on the underlying cone quantiles).
 *   3. wallModifier is inert (null) without OI data, and correctly classifies
 *      near-call-wall vs near-put-wall vs neither.
 */
import assert from 'node:assert/strict';
import { computeExpectedMove, wallModifier, MIN_BARS } from './expectedMoveCore.js';

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

// 1) Below MIN_BARS: honest degrade, not a thin read.
{
  const shortBars = syntheticBlocked(4, 60);   // well under MIN_BARS
  const r = computeExpectedMove({ pair: 'EURUSD', bars: shortBars, H: 8, pip: 0.0001 });
  ok(r.ok === false, 'too-few bars returns ok:false');
  ok(/bars/i.test(r.error), 'error message explains why');
}

// 2) Enough history: well-formed record.
const bars = syntheticBlocked(Math.ceil((MIN_BARS + 400) / 60), 60, { seed: 7 });
{
  const r = computeExpectedMove({ pair: 'EURUSD', bars, H: 8, pip: 0.0001 });
  ok(r.ok === true, `enough bars (${bars.length} >= ${MIN_BARS}) returns ok:true`);
  ok(['FADE', 'CONTINUE_UP', 'CONTINUE_DOWN', 'CONTINUE', 'MIXED'].includes(r.direction.call),
    `direction.call is a defined label (got ${r.direction.call})`);
  ok(r.direction.T >= 0 && r.direction.T <= 1, 'T is in [0,1]');
  ok(Number.isFinite(r.expected.anchor) && r.expected.anchor > 0, 'anchor is a positive price');
  ok(r.expected.p75.up >= r.expected.p50.up && r.expected.p50.down >= r.expected.p75.down,
    'p75 band is at least as wide as p50 (Z75 > Z50)');
  ok(r.expected.pipsCenter === +(((r.expected.center - r.expected.anchor) / 0.0001).toFixed(1)),
    'pipsCenter is anchor-relative in the given pip size');
  ok(r.wall === null, 'no oiInst supplied => wall modifier inert');
  ok(Array.isArray(r.warnings), 'warnings is always an array (possibly empty)');
}

// 3) wallModifier: inert / near-call / near-put / neither.
{
  const spot = 1.1000, pip = 0.0001;
  ok(wallModifier(null, spot, pip) === null, 'no inst => null');
  ok(wallModifier({ callWall: 1.1005, putWall: 1.0950 }, spot, 0) === null, 'no pip => null');

  const nearCall = wallModifier({ callWall: 1.1005, putWall: 1.0900, gexProfile: [] }, spot, pip);
  ok(nearCall.near?.level === 'call_wall', 'within tolPips of call wall => classified call_wall');

  const nearPut = wallModifier({ callWall: 1.1200, putWall: 1.0995, gexProfile: [] }, spot, pip);
  ok(nearPut.near?.level === 'put_wall', 'within tolPips of put wall => classified put_wall');

  const neither = wallModifier({ callWall: 1.1500, putWall: 1.0500, gexProfile: [] }, spot, pip);
  ok(neither.near === null, 'far from both walls => near is null, but maxPain/walls still reported');
  ok(neither.callWall === 1.1500 && neither.putWall === 1.0500, 'wall levels passed through even when not near');
}

console.log(`expectedMoveCore.test.mjs: ${passed} assertions passed`);
