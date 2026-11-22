// node js/terminal/jarvisGlobeHoloCore.test.mjs
import assert from 'node:assert/strict';
import { globeFrame, orthoBox, globeEuler, rotateXYZ, pillarH, labelPick } from './jarvisGlobeHoloCore.js';
import { llToVec, globeProject } from './jarvisCore.js';

// the frame: a phone fills ~88% of the width, centred between the bars; a desktop is generous; zoom scales the radius
{
  const p = globeFrame({ w: 412, h: 915, top: 130, bottom: 120, compact: true });
  assert.ok(p.Rg * 2 >= 412 * 0.85 && p.Rg * 2 <= 412 * 0.9, `phone diameter ${p.Rg * 2}`);
  assert.equal(p.Y, 130 + (915 - 130 - 120) / 2);
  assert.ok(p.Y + p.Rg <= 915 - 120 && p.Y - p.Rg >= 130, 'phone globe sits between the bars');
  const d = globeFrame({ w: 1280, h: 720, top: 110, bottom: 80 });
  assert.ok(d.Rg > 230 && d.Y - d.Rg >= 110 && d.Y + d.Rg <= 640, `desktop ${d.Rg}`);
  assert.equal(globeFrame({ w: 1280, h: 720, top: 110, bottom: 80, zoom: 2 }).Rg, d.Rg * 2);
  assert.equal(globeFrame({ w: 1280, h: 720, panel: true }).X, 640 - 128);
  const bad = globeFrame({ w: NaN, h: undefined, top: null, zoom: -3 });
  assert.ok(Number.isFinite(bad.X) && Number.isFinite(bad.Y) && bad.Rg > 0);
}

// the GL globe (ortho box + Euler turn) puts every point exactly where the 2D projection does
{
  const W = 1280, H = 720, X = 600, Y = 380, Rg = 250, box = orthoBox(W, H, X, Y, Rg);
  for (const [lat0, lon0] of [[20, 15], [50, 12], [-30, 170], [80, -120]]) {
    const e = globeEuler(lat0, lon0);
    for (const [la, lo, h] of [[51.5, -0.1, 0], [35.7, 139.7, 0.2], [-33.9, 151.2, 0.05], [0, 0, 0.3]]) {
      const v = llToVec(la, lo), k = 1 + h, r = rotateXYZ([v[0] * k, v[1] * k, v[2] * k], e), p = globeProject(v, { lat: lat0, lon: lon0 }, h);
      assert.ok(Math.abs(r[0] - p.x) < 1e-9 && Math.abs(r[1] - p.y) < 1e-9 && Math.abs(r[2] - p.z) < 1e-9, `turn ${lat0},${lon0}`);
      // ortho: world x maps to pixel (x - left) / (right - left) * W
      const sx = (r[0] - box.left) / (box.right - box.left) * W, sy = (box.top - r[1]) / (box.top - box.bottom) * H;
      assert.ok(Math.abs(sx - (X + p.x * Rg)) < 1e-6 && Math.abs(sy - (Y - p.y * Rg)) < 1e-6, 'pixel match');
    }
  }
}

// pillar height: smooth, linear, clamped, safe on junk
assert.equal(pillarH(0), 0.04); assert.equal(pillarH(1), 0.3); assert.equal(pillarH(2), 0.3); assert.equal(pillarH(NaN), 0.04);
assert.ok(Math.abs(pillarH(0.5) - 0.17) < 1e-12);

// labels: loudest few on a phone, selected always first
{
  const it = [{ key: 'a', size: 0.9, live: true }, { key: 'b', size: 0.5, live: true }, { key: 'c', size: 0.7, live: true }, { key: 'd', size: 0.2, live: false }, { key: 'e', size: 0.6, live: true, front: false }];
  assert.deepEqual(labelPick(it, { compact: true, phoneN: 2 }), ['a', 'c']);
  assert.deepEqual(labelPick(it, { compact: true, phoneN: 2, sel: 'd' }), ['d', 'a', 'c']);
  assert.deepEqual(labelPick(it, {}), ['a', 'c', 'b']);
  assert.deepEqual(labelPick(it, { sel: 'b' }), ['b', 'a', 'c']);
  assert.deepEqual(labelPick(it, { zoom: 2 }), ['a', 'c', 'b', 'd']);
  assert.deepEqual(labelPick(it, { sel: 'e' }), ['a', 'c', 'b'], 'a far-side selection is not labelled');
  assert.deepEqual(labelPick(null), []);
}
console.log('jarvisGlobeHoloCore: all tests passed');
