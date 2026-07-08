/**
 * Tests for the forecast feature scan (Phase 2). Synthetic engine-shaped rows with
 * a PLANTED relationship (high vol-of-vol → bigger forecast miss) the scan must
 * recover, a NULL predictor it must not over-claim, and day-type clustering
 * invariants. Deterministic (seeded), no network.
 *
 *   node --test js/forecastFeatureScan.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanFeatures } from './forecastFeatureScan.js';

function mulberry32(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// Build rows where the day's miss size is DRIVEN by vov (planted), and volAnnual
// is pure noise (null relationship). med≈1.0; actual = med × (1 + noise scaled by vov).
function plantedRows(n, seed = 3) {
  const rnd = mulberry32(seed); const rows = [];
  for (let i = 0; i < n; i++) {
    const vov = rnd();                                   // 0..1 driver
    const noiseVol = rnd();                              // unrelated
    const med = 1.0;
    const shock = (rnd() - 0.5) * 2 * (0.1 + 0.9 * vov); // bigger spread when vov high
    const actual = Math.max(0.05, med * (1 + shock));
    rows.push({
      date: `2020-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`,
      regime: (i % 3 === 0) ? 'RANGE' : (i % 3 === 1 ? 'BULL' : 'BEAR'),
      volAnnual: 5 + noiseVol * 10, vov,
      efficiency: 0.3 + rnd() * 0.5, climHl: 1.0,
      comp: { daily: { hl: { actual: +actual.toFixed(4), med, exMed: actual > med ? 1 : 0, ex75: 0 } } },
    });
  }
  return rows;
}

test('scan: insufficient rows returns a flag, not a throw', () => {
  const r = scanFeatures(plantedRows(50));
  assert.equal(r.insufficient, true);
});

test('scan: recovers the planted vov→miss relationship, ranks it above noise', () => {
  const r = scanFeatures(plantedRows(600));
  assert.ok(!r.insufficient, 'enough days');
  const vov = r.correlations.find(c => c.key === 'vov');
  const vol = r.correlations.find(c => c.key === 'volAnnual');
  assert.ok(vov.rhoAbsErr > 0.15, `vov correlates with miss size (rho ${vov.rhoAbsErr})`);
  assert.ok(Math.abs(vol.rhoAbsErr) < vov.rhoAbsErr, 'noise predictor is weaker than the real driver');
  // Importance ranking puts vov at or near the top.
  assert.equal(r.importance[0].key, 'vov', 'vov is the top feature by |rho|');
});

test('scan: miss profile shows higher vov on big-miss days', () => {
  const r = scanFeatures(plantedRows(600));
  const f = r.missProfile.features.find(x => x.key === 'vov');
  assert.ok(f.onMiss > f.onNormal, `vov higher on misses (${f.onMiss} vs ${f.onNormal})`);
  assert.ok(r.missProfile.bigMissRatePct >= 0 && r.missProfile.bigMissRatePct <= 100);
});

test('scan: day-type clusters partition the days and are labelled', () => {
  const r = scanFeatures(plantedRows(600));
  assert.ok(r.dayTypes.k >= 2, 'clustered');
  const total = r.dayTypes.clusters.reduce((s, c) => s + c.n, 0);
  assert.equal(total, r.dayTypes.n, 'every clustered day is assigned exactly once');
  const shareSum = r.dayTypes.clusters.reduce((s, c) => s + c.sharePct, 0);
  assert.ok(Math.abs(shareSum - 100) < 1.0, 'shares sum to ~100%');
  for (const c of r.dayTypes.clusters) assert.ok(typeof c.label === 'string' && c.label.length);
});

test('scan: deterministic — same rows give identical clusters', () => {
  const a = scanFeatures(plantedRows(600, 9));
  const b = scanFeatures(plantedRows(600, 9));
  assert.deepEqual(a.dayTypes.clusters, b.dayTypes.clusters, 'seeded k-means is reproducible');
});

// Sequential unique dates + a planted "big Asia share → bigger miss" relationship.
function sessionRows(n, seed = 4) {
  const rnd = mulberry32(seed); const rows = []; const sessionByDate = {};
  const base = Date.UTC(2018, 0, 1);
  for (let i = 0; i < n; i++) {
    const asiaShare = 10 + rnd() * 60;                     // 10..70% driver
    const med = 1.0;
    const shock = (rnd() - 0.5) * 2 * (0.05 + 0.012 * asiaShare); // bigger miss when Asia share high
    const actual = Math.max(0.05, med * (1 + shock));
    const date = new Date(base + i * 86400_000).toISOString().slice(0, 10);
    rows.push({ date, regime: 'BULL', volAnnual: 8, vov: 0.5, efficiency: 0.4, climHl: 1.0,
      comp: { daily: { hl: { actual: +actual.toFixed(4), med, exMed: actual > med ? 1 : 0, ex75: 0 } } } });
    const london = (100 - asiaShare) * (0.5 + rnd() * 0.3);
    sessionByDate[date] = { asia: { hlPct: +asiaShare.toFixed(2) }, london: { hlPct: +london.toFixed(2) }, ny: { hlPct: +(100 - asiaShare - london).toFixed(2) } };
  }
  return { rows, sessionByDate };
}

test('scan: no session block when session data not supplied', () => {
  const r = scanFeatures(plantedRows(400));
  assert.equal(r.sessionRelationships, null, 'session block absent without join');
});

test('scan: session join recovers the planted Asia-share → miss relationship', () => {
  const { rows, sessionByDate } = sessionRows(600);
  const r = scanFeatures(rows, { sessionByDate });
  assert.ok(r.sessionRelationships, 'session block present when joined');
  assert.match(r.sessionRelationships.note, /within-day/);
  const asia = r.sessionRelationships.correlations.find(c => c.key === 'asiaPct');
  assert.ok(asia.rhoAbsErr > 0.15, `Asia share correlates with miss size (rho ${asia.rhoAbsErr})`);
});
