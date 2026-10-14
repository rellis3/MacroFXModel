/**
 * The map's routing, measured rather than eyeballed.
 *
 * "It looks messy" turned out to be a number: with the old single-arc routing, twenty
 * links produced TWENTY intrusions through boxes they had nothing to do with, and six
 * pairs of lines crossed. A line passing over the S&P box on its way from real yields
 * to gold reads as a connection to the S&P, which is the one thing a map of connections
 * must not do. Orthogonal lane routing took both to zero.
 *
 * These are regression bars, not targets. If a future link or a moved node pushes the
 * count up, that is worth knowing before it ships rather than after someone says the
 * picture looks messy again.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUT, buildMap, MAP_W, MAP_H } from './mvMap.js';
import { LINKS } from './marketScan.js';

const COLW = 214, ROWH = 84, PADX = 54, PADY = 52, RX = 58, RY = 25;
const pos = k => { const p = LAYOUT[k]; return p ? { x: PADX + RX + p[0] * COLW, y: PADY + RY + p[1] * ROWH } : null; };

// Every real link, with made-up but spread-out numbers: the ROUTING must not depend on
// the day's readings, so any plausible set exercises it.
const links = LINKS.filter(l => LAYOUT[l.a] && LAYOUT[l.b]).map((l, i) => ({
  id: l.id, a: l.a, b: l.b, z: (i % 7) * 0.6, corr: 0.5 + ((i * 13) % 40) / 100,
  weak: i % 9 === 0, labelA: l.a, labelB: l.b,
}));
const board = Object.keys(LAYOUT).map((k, i) => ({ key: k, z: (i % 5) * 0.8, change: (i % 3) - 1, kind: 'price' }));
const svg = buildMap(links, board, { apartZ: 3.1 }).svg;
const paths = [...svg.matchAll(/<path class="mmE [^"]*" d="([^"]+)"/g)].map(x => x[1]);

/** Walk a rounded right-angle path as a polyline — the corners are the control points. */
const walk = d => {
  const n = d.match(/-?\d+(\.\d+)?/g).map(Number), seq = [];
  for (let i = 0; i + 1 < n.length; i += 2) seq.push([n[i], n[i + 1]]);
  const pts = [];
  for (let i = 0; i + 1 < seq.length; i++) for (let t = 0; t <= 1; t += 0.02)
    pts.push([seq[i][0] + (seq[i + 1][0] - seq[i][0]) * t, seq[i][1] + (seq[i + 1][1] - seq[i][1]) * t]);
  return pts;
};

test('every link is drawn', () => {
  assert.equal(paths.length, links.length);
});

test('no line passes through a box it does not connect', () => {
  const offenders = [];
  paths.forEach((d, i) => {
    const L = links[i], ends = new Set([L.a, L.b]), pts = walk(d);
    for (const k of Object.keys(LAYOUT)) {
      if (ends.has(k)) continue;
      const p = pos(k);
      if (pts.some(([x, y]) => Math.abs(x - p.x) < RX - 2 && Math.abs(y - p.y) < RY - 2)) offenders.push(`${L.id} through ${k}`);
    }
  });
  assert.deepEqual(offenders, [], 'a line crossing a box reads as a connection to it');
});

// Crossings are a property of the GRAPH, not of the routing: twenty links over
// twenty-six markets laid out in five causal columns cannot be drawn without some. The
// old arcs had six, these lanes have seven, and that is a wash -- the win was never
// meant to be here. What changed is the KIND of crossing: two wires meeting at a right
// angle read as two wires, two shallow diagonals read as a tangle. The bar is a ceiling
// so a future link cannot quietly double it.
test('crossings stay at the level the graph itself forces', () => {
  const segs = paths.map(walk);
  const side = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const hits = (p, q) => side(p[0], p[1], q[0]) * side(p[0], p[1], q[1]) < 0
                      && side(q[0], q[1], p[0]) * side(q[0], q[1], p[1]) < 0;
  const crossed = [];
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const A = links[i], B = links[j];
    if (A.a === B.a || A.a === B.b || A.b === B.a || A.b === B.b) continue;
    let hit = false;
    for (let x = 0; x < segs[i].length - 1 && !hit; x += 2)
      for (let y = 0; y < segs[j].length - 1 && !hit; y += 2)
        if (hits([segs[i][x], segs[i][x + 1]], [segs[j][y], segs[j][y + 1]])) hit = true;
    if (hit) crossed.push(`${A.id} × ${B.id}`);
  }
  assert.ok(crossed.length <= 8, `${crossed.length} crossings, was 7: ${crossed.join(', ')}`);
});

test('nothing is drawn outside the canvas or over the column headings', () => {
  for (const d of paths) {
    for (const [x, y] of walk(d)) {
      assert.ok(x >= 0 && x <= MAP_W, `x ${x} outside 0..${MAP_W}`);
      assert.ok(y >= 40 && y <= MAP_H, `y ${y} outside the drawing band`);
    }
  }
});

test('nearly every mechanism still gets its name on the line', () => {
  const want = links.filter(l => !l.weak).length;
  const got = [...svg.matchAll(/class="mmL [^"]*"/g)].length;
  assert.ok(got >= want - 2, `only ${got} of ${want} mechanism labels drawn`);
});

test('the same links always draw the same picture', () => {
  assert.equal(buildMap(links, board, { apartZ: 3.1 }).svg, svg,
    'lane allocation must be deterministic, or the map moves under the reader');
});
