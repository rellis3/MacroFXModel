// js/terminal/chainFlyCore.test.mjs: the pure half of the chain fly-through (layout, rail, camera, script).
import test from 'node:test';
import assert from 'node:assert/strict';
import { flowLevels, flyLayout, flyRoute, defaultTimes, camAt, railParam, makeProjector, fogAlpha, flyScript, buildFly, spokenMove, labelAlpha } from './chainFlyCore.js';
import { buildGraph } from './jarvisCore.js';
import { CHAIN_NODES, evaluateChain } from '../macroChain.js';

const names = Object.fromEntries(Object.entries(CHAIN_NODES).map(([k, n]) => [k, n.label]));
function graph() {
  const vals = {}; let i = 0;
  for (const [k, n] of Object.entries(CHAIN_NODES)) { i++; vals[k] = { delta: (i % 5 === 0 ? -1 : 1) * (i % 3 === 0 ? n.floor * 2.4 : n.floor * 0.3), last: 100 }; }
  return buildGraph(evaluateChain(vals));
}
const tiny = () => ({
  nodes: [['oil', 'pct', -3.2], ['bei', 'bp', 9], ['us10y', 'bp', 12], ['eurusd', 'pct', 1.1]].map(([key, unit, delta]) => ({ key, pos: [0, 0, 0], style: { tone: 'up', size: 0.6 }, end: { key, unit, delta, moved: true, text: String(delta) } })),
  edges: [{ id: 'a', from: 'oil', to: 'bei', verdict: 'holding', short: 'oil to inflation' }, { id: 'b', from: 'bei', to: 'us10y', verdict: 'holding', short: 'inflation to yields' }, { id: 'c', from: 'us10y', to: 'eurusd', verdict: 'broken', short: 'yields to euro' }],
});

test('flowLevels: causes are shallower than effects, a cycle terminates', () => {
  const lv = flowLevels(['a', 'b', 'c'], [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]);
  assert.deepEqual(lv, { a: 0, b: 1, c: 2 });
  assert.ok(Object.values(flowLevels(['a', 'b'], [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }])).every(Number.isFinite));
});

test('flyLayout: the flow axis is depth, every edge runs forward, every node is placed', () => {
  const g = graph(), L = flyLayout(g);
  for (const n of g.nodes) assert.ok(L.pos[n.key].every(Number.isFinite));
  const t = flyLayout(tiny());
  assert.ok(t.pos.oil[2] < t.pos.bei[2] && t.pos.bei[2] < t.pos.us10y[2] && t.pos.us10y[2] < t.pos.eurusd[2]);
});

test('flyRoute: stops run shallow to deep, broken ends are kept, times start at 0 and end at 1 and slow at a broken stop', () => {
  const g = tiny(), L = flyLayout(g), r = flyRoute(g, L, names);
  assert.equal(r.stops.length, 4);
  for (let i = 1; i < r.stops.length; i++) assert.ok(r.stops[i].cam[2] >= r.stops[i - 1].cam[2]);
  assert.equal(r.times[0], 0); assert.equal(r.times.at(-1), 1); assert.equal(r.times.length, r.stops.length + 2);
  for (let i = 1; i < r.times.length; i++) assert.ok(r.times[i] > r.times[i - 1]);
  const t = defaultTimes([{ kind: 'holding' }, { kind: 'broken' }, { kind: 'holding' }]);
  assert.ok(t[2] - t[1] > t[1] - t[0], 'the segment into a broken stop takes longer');
  const big = graph(), R = flyRoute(big, flyLayout(big), names, 5);
  assert.ok(R.stops.length <= 5 && R.stops.length > 0);
});

test('camAt: a pure function of p, moves forward along the flow, banks within limits', () => {
  const g = tiny(), r = flyRoute(g, flyLayout(g), names);
  const a = camAt(r, 0.1), b = camAt(r, 0.1), c = camAt(r, 0.9);
  assert.deepEqual(a, b);
  assert.ok(c.eye[2] > a.eye[2]);
  for (let p = 0; p <= 1; p += 0.05) { const k = camAt(r, p); assert.ok(k.eye.every(Number.isFinite) && k.target.every(Number.isFinite) && Math.abs(k.roll) <= 0.13, `bad camera at ${p}`); }
  // the camera passes close to every stop at the stop's time
  r.stops.forEach((s, i) => { const k = camAt(r, r.times[i + 1]); assert.ok(Math.hypot(k.eye[0] - s.cam[0], k.eye[1] - s.cam[1], k.eye[2] - s.cam[2]) < 0.05); });
  assert.ok(railParam(r.times, -1).s === 0 && railParam(r.times, 2).s <= 1);
});

test('makeProjector: ahead is in front and centred, behind is not, nearer is bigger', () => {
  const pr = makeProjector({ eye: [0, 0, 0], target: [0, 0, 5], roll: 0 });
  const o = pr([0, 0, 4]); assert.ok(o.z > 0 && Math.abs(o.x) < 1e-9 && Math.abs(o.y) < 1e-9);
  assert.ok(pr([0, 0, -3]).z < 0);
  assert.ok(Math.abs(pr([1, 0, 2]).x) > Math.abs(pr([1, 0, 6]).x));
  const right = pr([1, 0, 4]), up = pr([0, 1, 4]); assert.ok(right.x !== 0 && up.y < 0, 'up in the world is up on the screen (negative y)');
  const turned = makeProjector({ eye: [0, 0, 0], target: [0, 0, 5], roll: 0 }, 0.4, 0)([0, 0, 4]); assert.ok(Math.abs(turned.x) > 0.1, 'yaw moves the view');
});

test('fogAlpha: near is clear, far is faint, behind is nothing', () => {
  assert.ok(fogAlpha(2) > fogAlpha(8) && fogAlpha(8) > fogAlpha(30) && fogAlpha(-1) === 0 && fogAlpha(40) >= 0.05);
});

test('spokenMove words the real move', () => {
  assert.equal(spokenMove({ unit: 'pct', delta: -3.2 }), 'down 3.2 percent');
  assert.equal(spokenMove({ unit: 'bp', delta: 12.4 }), 'up 12 basis points');
  assert.equal(spokenMove(null), 'with no reading');
});

test('flyScript: walks the flight in order from the real nodes and edges, names the broken link, says it is not a signal', () => {
  const g = tiny(), r = flyRoute(g, flyLayout(g), names), s = flyScript(g, r, names);
  assert.match(s.text, /We start at oil.*down 3\.2 percent/);
  assert.ok(s.text.indexOf('start at') < s.text.indexOf('is feeding') && s.text.indexOf('is feeding') < s.text.indexOf('has broken'));
  assert.match(s.text, /link from the US 10Y yield to EUR USD has broken/);
  assert.match(s.text, /not a signal/);
  assert.match(s.text, /2 links are holding and 1 is broken/);
  assert.equal(s.marks.length, r.stops.length + 2); assert.equal(s.marks[0], 0); assert.equal(s.marks.at(-1), 1);
  for (let i = 1; i < s.marks.length; i++) assert.ok(s.marks[i] > s.marks[i - 1]);
  for (const sentence of s.sentences) assert.ok(sentence.split(/\s+/).length < 40, 'short plain sentences');
  assert.ok(!/will|forecast|buy|sell/i.test(s.text.replace('not a signal', '')));
});

test('buildFly: null without a graph, whole on the real chain shape', () => {
  assert.equal(buildFly(null), null); assert.equal(buildFly({ nodes: [], edges: [] }), null);
  const f = buildFly(graph(), names); assert.ok(f.route.stops.length && f.script.text.length > 40);
  assert.equal(labelAlpha(f.route.times, 0, f.route.times[1]), 1);
});
