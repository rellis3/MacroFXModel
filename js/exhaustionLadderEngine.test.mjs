/**
 * Tests for the Exhaustion Ladder.
 *
 * The load-bearing one is `hazard is ~0.50 on a driftless walk`. That measurement has an EXACT
 * analytic null — symmetric barriers around the current price are 50/50 for a martingale under
 * optional stopping — so a synthetic random walk is a real falsification, not a smoke test. If
 * the harness leaks lookahead, anchors barriers on the extreme instead of the current price, or
 * drops resolved races asymmetrically, this test goes off. It caught exactly that bug once.
 *
 *   node --test js/exhaustionLadderEngine.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exhaustionLadder, projectLadder, hazardAt } from './exhaustionLadderEngine.js';

function mulberry32(s) {
  return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/** Box-Muller normal from a uniform source. */
function normal(rnd) {
  let u = 0, v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Synthetic 5-minute bars: a DRIFTLESS geometric random walk, 288 bars/day.
 * Each bar's OHLC comes from 12 finer sub-steps, so highs/lows are genuine path extremes
 * rather than fabricated spans — which is what makes the barrier race meaningful.
 * Timestamps start on a UTC midnight in January (GMT, so London date == UTC date).
 */
function synthBars(nDays, seed = 11, stepVol = 0.00022) {
  const rnd = mulberry32(seed);
  const out = [];
  let px = 1.1000;
  const t0 = Date.UTC(2018, 0, 1, 0, 0, 0);
  const SUB = 12;
  for (let d = 0; d < nDays; d++) {
    for (let b = 0; b < 288; b++) {
      const o = px;
      let hi = px, lo = px;
      for (let s = 0; s < SUB; s++) {
        px *= Math.exp(stepVol * normal(rnd));
        if (px > hi) hi = px;
        if (px < lo) lo = px;
      }
      out.push({ time: t0 + (d * 288 + b) * 5 * 60_000, open: o, high: hi, low: lo, close: px });
    }
  }
  return out;
}

// One shared fit — the walk is 400 days, enough for both halves to populate.
const bars = synthBars(400, 11);
const res = exhaustionLadder(bars, { pair: 'TEST' });

test('returns a fit on sufficient data', () => {
  assert.equal(res.insufficient, undefined);
  assert.ok(res.daysUsed > 250, `daysUsed=${res.daysUsed}`);
  assert.ok(res.nTurnsIs > 100 && res.nTurnsOos > 100);
});

test('resolves MULTIPLE turns per day (the whole point of the layering)', () => {
  // If this collapses to ~1 the ordinal/session layers have nothing to layer and the engine
  // degenerates into the single-constant model it exists to replace.
  assert.ok(res.turnsPerDay > 2, `turnsPerDay=${res.turnsPerDay}`);
  assert.ok(res.ladder.byOrdinal['1'].is.n > 0);
  assert.ok(!res.ladder.byOrdinal['2'].is.insufficient, 'turn 2 must be populated');
});

test('ladder rungs are monotonic and positive', () => {
  for (const seg of ['is', 'oos']) {
    const l = res.ladder.all[seg];
    assert.ok(!l.insufficient);
    assert.ok(l.p25 > 0, `${seg} p25=${l.p25}`);
    assert.ok(l.p25 < l.p50 && l.p50 < l.p75 && l.p75 < l.p90, `${seg} not monotonic: ${JSON.stringify(l)}`);
  }
});

test('dominant ladder sits above the pooled ladder (max-of-N vs pooled)', () => {
  // This is the relationship the old engine conflated: a per-day maximum MUST exceed a pooled
  // median. Asserting it here documents that the two are different statistics by construction.
  assert.ok(res.ladder.dominant.is.p50 > res.ladder.all.is.p50);
});

test('IS rungs hold their coverage OOS on a stationary series', () => {
  // The walk is stationary, so an IS-fitted p50 should cover ~50% of OOS turns. Wide tolerance:
  // this guards against gross drift/lookahead, not against sampling noise.
  for (const k of ['p25', 'p50', 'p75']) {
    const c = res.coverage[k];
    assert.ok(c, `no coverage for ${k}`);
    assert.ok(Math.abs(c.drift) < 0.10, `${k} coverage drifted: ${JSON.stringify(c)}`);
  }
});

test('hazard is ~0.50 on a driftless walk (the analytic null)', () => {
  const rows = [...res.hazard.is, ...res.hazard.oos].filter(r => !r.insufficient && r.n >= 200);
  assert.ok(rows.length >= 3, `too few populated hazard buckets: ${rows.length}`);
  for (const r of rows) {
    // |z| against the exact 0.50 null. A driftless walk has no exhaustion at ANY distance, so a
    // bucket drifting past ~4σ means the harness is manufacturing signal.
    assert.ok(Math.abs(r.z) < 4, `bucket [${r.lo},${r.hi}) p=${r.pReversal} n=${r.n} z=${r.z} — null violated`);
  }
  // And no systematic tilt across buckets: the mean hazard must sit on the null.
  const mean = rows.reduce((s, r) => s + r.pReversal, 0) / rows.length;
  assert.ok(Math.abs(mean - 0.5) < 0.03, `mean hazard ${mean.toFixed(4)} is not ~0.50`);
});

test('hazard shows no drift when the walk is reseeded', () => {
  const r2 = exhaustionLadder(synthBars(400, 77), { pair: 'TEST2' });
  const rows = [...r2.hazard.is, ...r2.hazard.oos].filter(r => !r.insufficient && r.n >= 200);
  const mean = rows.reduce((s, r) => s + r.pReversal, 0) / rows.length;
  assert.ok(Math.abs(mean - 0.5) < 0.03, `seed 77 mean hazard ${mean.toFixed(4)}`);
});

test('projectLadder converts rungs to prices correctly', () => {
  const p = projectLadder({ p25: 0.5, p50: 1.0, p75: 1.5, p90: 2.0 }, 1.2000, 0.004);
  assert.ok(Math.abs(p.up.p50 - 1.2000 * 1.004) < 1e-9);
  assert.ok(Math.abs(p.dn.p50 - 1.2000 * 0.996) < 1e-9);
  assert.ok(p.up.p90 > p.up.p75 && p.dn.p90 < p.dn.p75);
  assert.equal(projectLadder(null, 1, 0.01), null);
  assert.equal(projectLadder({ p50: 1 }, 0, 0.01), null);
});

test('hazardAt selects the bucket covering an extension', () => {
  const curve = [
    { lo: 0, hi: 0.5, n: 10, insufficient: true },
    { lo: 0.5, hi: 1.0, n: 500, pReversal: 0.52 },
    { lo: 1.0, hi: null, n: 500, pReversal: 0.55 },
  ];
  assert.equal(hazardAt(curve, 0.7).pReversal, 0.52);
  assert.equal(hazardAt(curve, 9.9).pReversal, 0.55);
  assert.equal(hazardAt(curve, 0.2), null, 'insufficient buckets must not be returned');
  assert.equal(hazardAt(null, 1), null);
});

test('insufficient data is flagged, not thrown', () => {
  const r = exhaustionLadder(synthBars(20, 5), { pair: 'TINY' });
  assert.equal(r.insufficient, true);
});
