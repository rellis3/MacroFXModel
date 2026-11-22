// js/terminal/jarvisViewChain.test.mjs: the FLY view registers its module, its view and its SHOW scene; the scene is built from the real graph and fails soft without one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EXTRA, viewsOf } from './jarvisModules.js';
import { buildScenes, SHOW_HOOKS } from './showCore.js';
import { buildGraph } from './jarvisCore.js';
import { buildFly } from './chainFlyCore.js';
import { CHAIN_NODES, evaluateChain } from '../macroChain.js';
const { chainHud } = await import('./jarvisViewChain.js');

const names = Object.fromEntries(Object.entries(CHAIN_NODES).map(([k, n]) => [k, n.label]));
const vals = {}; let i = 0;
for (const [k, n] of Object.entries(CHAIN_NODES)) { i++; vals[k] = { delta: (i % 5 === 0 ? -1 : 1) * (i % 3 === 0 ? n.floor * 2.4 : n.floor * 0.3), last: 100 }; }
const graph = buildGraph(evaluateChain(vals));

test('registers the FLY panel, the chainfly view and the SHOW scene after the chain scene', () => {
  assert.ok(EXTRA.some(m => m.id === 'chainfly' && typeof m.render === 'function'));
  assert.ok(viewsOf().some(v => v.id === 'chainfly' && v.label === 'FLY' && typeof v.draw === 'function'));
  assert.ok(SHOW_HOOKS.some(h => h.id === 'chainfly' && h.after === 'chain'));
});

test('the SHOW scene: null without a graph, otherwise a spoken script on the chainfly view with a motion hook', () => {
  const h = SHOW_HOOKS.find(x => x.id === 'chainfly');
  assert.equal(h.build({}, null), null);
  assert.equal(h.prepare({ st: { graph: null }, names }), null);
  const data = h.prepare({ st: { graph }, names }), sc = h.build({}, data);
  assert.equal(sc.view, 'chainfly'); assert.match(sc.text, /not a signal/); assert.equal(typeof sc.motion, 'function');
  const all = buildScenes({ now: new Date(), mode: 'full', chain: { holding: 1, broken: 1, quiet: 1, headline: 'x' }, extra: { chainfly: data } }), ids = all.map(s => s.id);
  assert.equal(ids[ids.indexOf('chain') + 1], 'chainfly');
  const api = { st: { yaw: 1, pitch: 1 } }; sc.enter(api); sc.motion(api, 0.5); assert.equal(api.st.yaw, 0);
  assert.equal(buildScenes({ now: new Date(), extra: {} }).some(s => s.id === 'chainfly'), false);
});

test('the view: a message with no graph (no hologram is started); with one it is a hologram whose 2D layer draws names, the card, the route strip and the key (stub canvas, stub projector)', () => {
  const calls = []; const ctx = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 50 }) : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...a) => calls.push(k)), set: () => true });
  const C = { up: 'g', dn: 'r', gold: 'o', blue: 'b', tx: 'w', tx2: 'x', cy: 'c' }, v = viewsOf().find(x => x.id === 'chainfly');
  const g = { t: 1, dt: 0.016, fade: 1, W: 1000, H: 700, cx: 500, cy: 350, C, hit() {} };
  const st = { graph: null, yaw: 0, pitch: 0, zoom: 1 };
  v.draw(ctx, g, { st, names, ID: 'jarvis', doc: {} }); assert.ok(calls.includes('fillText'));
  assert.equal(v.gl, true);
  st.graph = graph; calls.length = 0; const fly = buildFly(graph, names), hits = [];
  assert.ok(fly.route.stops.length > 0);
  const proj = q => ({ x: 500 + q[0] * 60, y: 350 - q[1] * 60, vis: true, d: 3 });
  chainHud(ctx, { ...g, hit: k => hits.push(k) }, { st, names }, { fly, p: fly.route.times[1], times: fly.route.times, wrap: 1, proj });
  assert.ok(calls.filter(c => c === 'fillText').length > 8); assert.ok(calls.filter(c => c === 'stroke').length >= 5); assert.ok(hits.includes(fly.route.stops[0].key));
});
