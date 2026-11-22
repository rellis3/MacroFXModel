// Tests for globeCore.js (the hologram GLOBE's camera, facing test, beacons, land grid). Run: node js/terminal/globeCore.test.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { llToVec } from './jarvisCore.js';
import { angGap, northAt, globeCam, facing, beacon, moveLine, landGrid, seeded, edgeShow, baseRadius } from './globeCore.js';

const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

test('angGap: zero for the same place, 90 for equator a quarter round, 180 for antipodes', () => {
  assert.ok(near(angGap(10, 20, 10, 20), 0, 1e-6)); assert.ok(near(angGap(0, 0, 0, 90), 90)); assert.ok(near(angGap(0, 0, 0, 180), 180));
});

test('northAt is a unit vector perpendicular to the surface normal and points to higher latitude', () => {
  for (const [la, lo] of [[0, 0], [45, 120], [-30, -70]]) {
    const n = northAt(la, lo), c = llToVec(la, lo);
    assert.ok(near(Math.hypot(...n), 1)); assert.ok(near(n[0] * c[0] + n[1] * c[1] + n[2] * c[2], 0));
    const up = llToVec(la + 0.01, lo); assert.ok(up[1] > c[1]);
  }
});

test('globeCam at zoom 1: no tilt, camera straight above the centre, globe on screen at the base radius', () => {
  const W = 1280, H = 720, c = globeCam({ lat: 20, lon: 15, zoom: 1, tlat: 20, tlon: 15 }, { W, H });
  assert.equal(c.tilt, 0); const v = llToVec(20, 15);
  for (let i = 0; i < 3; i++) assert.ok(near(c.pos[i] / c.D, v[i], 1e-9));
  // apparent radius in px from the distance: (H/2) / tan(fov/2) / sqrt(D^2 - 1)
  const r = (H / 2) / Math.tan(c.fov * Math.PI / 360) / Math.sqrt(c.D * c.D - 1);
  assert.ok(near(r, baseRadius(W, H), 1e-6));
});

test('globeCam: zooming in brings the camera closer and tilts it smoothly, never under the surface', () => {
  let prev = null;
  for (let z = 0.8; z <= 5; z += 0.05) {
    const c = globeCam({ lat: 50, lon: 12, zoom: z, tlat: 50, tlon: 12 }, { W: 1280, H: 720 });
    assert.ok(Math.hypot(...c.pos) > 1.05, `camera inside the globe at zoom ${z}`);
    if (prev) { assert.ok(c.D <= prev.D + 1e-12); assert.ok(c.tilt >= prev.tilt - 1e-12); for (let i = 0; i < 3; i++) assert.ok(Math.abs(c.pos[i] - prev.pos[i]) < 0.08 * prev.D, 'camera jumps'); }
    prev = c;
  }
  assert.ok(prev.tilt > 0.8);
});

test('globeCam hops: far from its target the camera pulls back', () => {
  const a = globeCam({ lat: 50, lon: 12, zoom: 2.2, tlat: 50, tlon: 12 }), b = globeCam({ lat: 50, lon: 12, zoom: 2.2, tlat: -30, tlon: 150 });
  assert.ok(b.D > a.D); assert.ok(b.zEff < a.zEff);
});

test('facing: 1 under the camera, 0 at the horizon, negative round the back', () => {
  const c = globeCam({ lat: 0, lon: 0, zoom: 1 }), v = llToVec(0, 0);
  assert.ok(near(facing(v, c.pos), 1, 1e-9)); assert.ok(facing(llToVec(0, 180), c.pos) < 0);
  const hz = Math.acos(1 / c.D) * 180 / Math.PI; assert.ok(Math.abs(facing(llToVec(0, hz), c.pos)) < 1e-9);
});

test('beacon: height linear in size, capped flag at 3x, direction and missing data', () => {
  const n = (delta, floor, tone, dir) => ({ end: { delta, floor, dir, text: `${delta}` }, style: { tone, size: 0.5 } });
  assert.ok(near(beacon(n(1, 1, 'up', 'up'), 0).h, 0.04)); assert.ok(near(beacon(n(1, 1, 'up', 'up'), 1).h, 0.3));
  assert.ok(beacon(n(1, 1, 'up', 'up'), 0.6).h > beacon(n(1, 1, 'up', 'up'), 0.5).h);
  assert.equal(beacon(n(3.2, 1, 'up', 'up'), 1).capped, true); assert.equal(beacon(n(2.9, 1, 'dn', 'down'), 1).capped, false);
  assert.equal(beacon(n(-2, 1, 'dn', 'down'), 0.6).dir, 'down');
  assert.equal(moveLine(beacon(n(3.2, 1, 'up', 'up'), 1)), '3.2 · >3× noise'); assert.equal(moveLine(beacon(n(1.5, 1, 'up', 'up'), 1)), '1.5 · 1.5× noise');
  assert.equal(beacon({ end: null, style: { tone: 'none', size: 0.15 } }).missing, true); assert.equal(moveLine(beacon(null)), 'no data');
});

test('landGrid keeps only land and spaces rows evenly', () => {
  const all = landGrid(() => true, 3), north = landGrid(lat => lat > 0, 3);
  assert.ok(north.length > 0 && north.every(([la]) => la > 0)); assert.ok(all.length > 2 * north.length - 200);
  // equal-area-ish: a row near the pole holds far fewer points than the equator
  const row = la => all.filter(p => Math.abs(p[0] - la) < 1.4).length; assert.ok(row(79.5) < row(1.5) / 3);
});

test('seeded is repeatable and in [0, 1)', () => { const a = seeded(7), b = seeded(7); for (let i = 0; i < 50; i++) { const x = a(); assert.equal(x, b()); assert.ok(x >= 0 && x < 1); } });

test('edgeShow: holding and broken show, quiet only when it touches the selection', () => {
  assert.equal(edgeShow({ verdict: 'broken', from: 'a', to: 'b' }, null).show, true); assert.equal(edgeShow({ verdict: 'quiet', from: 'a', to: 'b' }, null).show, false);
  assert.equal(edgeShow({ verdict: 'quiet', from: 'a', to: 'b' }, 'b').show, true); assert.equal(edgeShow({ verdict: 'unmeasured', from: 'a', to: 'b' }, 'c').kind, 'quiet');
});
