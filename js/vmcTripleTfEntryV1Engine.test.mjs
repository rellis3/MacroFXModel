/**
 * Tests for vmcTripleTfEntryV1Engine — synthetic data, no network.
 *
 * WaveTrend is scale-free and nonlinear, so crafting a price path that fires
 * circles on three TFs inside one 15-min window is brittle. The machinery is
 * therefore tested in its exported pieces:
 *
 *   1. circleTimes — a noisy V-bottom produces buy circles on every TF, each
 *      stamped at its bar's CLOSE (causality by construction), and no sell
 *      circles; the inverted path mirrors.
 *   2. alignmentEpisodes — hand-built circle lists: overlapping lists produce
 *      exactly one rising-edge episode at the correct minute; disjoint lists
 *      produce none; a refreshed circle does NOT re-trigger while alignment
 *      stays continuously true.
 *   3. Full run on the seeded random walk — structural invariants: episodes
 *      exist for both sides, every entry follows all three TFs' latest
 *      circles (re-derived independently), trades never overlap, and the run
 *      is deterministic.
 *
 * Run: node js/vmcTripleTfEntryV1Engine.test.mjs
 */

import { runVmcTripleTf, circleTimes, alignmentEpisodes, DEFAULT_CFG } from './vmcTripleTfEntryV1Engine.js';
import { syntheticRandomWalkPacked } from './syntheticWalk.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`); }
  else { failures++; console.error(`  ✗ FAIL: ${msg}`); }
}

const BASE_T = Date.UTC(2024, 0, 2) / 1000;

function pack(closes) {
  const times = [], opens = [], highs = [], lows = [], cs = [], volumes = [];
  let prev = closes[0];
  closes.forEach((c, m) => {
    const o = m === 0 ? c : prev;
    times.push(BASE_T + m * 60);
    opens.push(o); highs.push(Math.max(o, c)); lows.push(Math.min(o, c)); cs.push(c); volumes.push(1);
    prev = c;
  });
  return { n: times.length, times: Int32Array.from(times), opens: Float32Array.from(opens),
           highs: Float32Array.from(highs), lows: Float32Array.from(lows),
           closes: Float32Array.from(cs), volumes: Float32Array.from(volumes) };
}

function vPath({ flip = false } = {}) {
  const out = []; let px = 100;
  const push = v => out.push(flip ? 200 - v : v);
  for (let m = 0; m < 180; m++) { px += 0.03 * Math.sin(m / 5); push(px); }
  for (let m = 0; m < 90; m++) { px -= 0.06; push(px + 0.025 * Math.sin(m / 3)); }
  for (let m = 0; m < 60; m++) { px += 0.06; push(px + 0.02 * Math.sin(m / 3)); }
  for (let m = 0; m < 120; m++) push(px + 0.02 * Math.sin(m / 7));
  return out;
}

console.log('1. circleTimes — noisy V fires causal buy circles on every TF, no sells at the low');
{
  const packed = pack(vPath());
  for (const tf of [1, 3, 5]) {
    const { buy, sell } = circleTimes(packed, tf);
    assert(buy.length >= 1, `${tf}m: at least one buy circle (got ${buy.length})`);
    assert(buy.every(t => (t - BASE_T) % (tf * 60) === 0), `${tf}m: every circle stamped at a bar CLOSE boundary`);
    // Sells may legitimately fire once the rally tops out (settle phase, WT
    // overbought) — but never DURING the oversold decline itself.
    const declineStart = BASE_T + 185 * 60, vLow = BASE_T + 275 * 60;
    const inDecline = sell.filter(t => t >= declineStart && t <= vLow).length;
    assert(inDecline === 0, `${tf}m: no sell circles during the oversold decline (got ${inDecline})`);
  }
  const flipped = pack(vPath({ flip: true }));
  assert(circleTimes(flipped, 3).sell.length >= 1, 'inverted V: 3m sell circles fire (mirror symmetry)');
}

console.log('2. alignmentEpisodes — hand-built lists');
{
  const times = Array.from({ length: 120 }, (_, m) => BASE_T + m * 60);
  const min = m => BASE_T + m * 60;
  // Overlap: circles at 10/14/18 min, each active 15min → all active from 18.
  const ep = alignmentEpisodes([[min(10)], [min(14)], [min(18)]], times, 15);
  assert(ep.length === 1 && ep[0] === 18, `overlapping lists → one episode at minute 18 (got ${JSON.stringify(ep)})`);
  // Disjoint: first circle expired before the last fires.
  const none = alignmentEpisodes([[min(0)], [min(20)], [min(40)]], times, 15);
  assert(none.length === 0, `disjoint lists → no episode (got ${none.length})`);
  // Refresh during continuous alignment must NOT re-trigger (rising edge only)…
  const refresh = alignmentEpisodes([[min(10), min(20)], [min(12)], [min(14)]], times, 15);
  assert(refresh.length === 1 && refresh[0] === 14, `refresh mid-alignment → still one episode (got ${JSON.stringify(refresh)})`);
  // …but a SECOND alignment after a gap does.
  const two = alignmentEpisodes([[min(10), min(60)], [min(12), min(62)], [min(14), min(64)]], times, 15);
  assert(two.length === 2 && two[1] === 64, `re-alignment after a gap → second episode (got ${JSON.stringify(two)})`);
}

console.log('3. Full run on the seeded random walk — structural invariants');
{
  const packed = syntheticRandomWalkPacked({ seed: 11, days: 30 });
  const r1 = runVmcTripleTf(packed);
  const r2 = runVmcTripleTf(packed);
  assert(JSON.stringify(r1.events) === JSON.stringify(r2.events), 'deterministic across runs');
  for (const side of ['buy', 'sell']) {
    const evs = r1.events[side];
    assert(evs.length >= 1, `${side}: episodes occur on a random walk (got ${evs.length}) — the pattern is not vacuous`);
    // Causality re-derived independently: at each entry, every TF must have a
    // circle closed within the prior activeMins.
    const circles = [1, 3, 5].map(tf => circleTimes(packed, tf)[side]);
    const causal = evs.every(e => circles.every(L => L.some(ct => ct <= e.entryT && e.entryT - ct <= (DEFAULT_CFG.activeMins + 1) * 60)));
    assert(causal, `${side}: every entry follows a recent CLOSED circle on all three TFs`);
    const tr = r1.trades[side];
    const nonOverlap = tr.every((t, i) => i === 0 || t.fillTime >= tr[i - 1].exitTime);
    assert(nonOverlap, `${side}: trades never overlap (${tr.length} trades)`);
  }
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
