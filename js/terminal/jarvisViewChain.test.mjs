// js/terminal/jarvisViewChain.test.mjs: the FLY view registers its module, its view and its SHOW scene; the scene is built from the real graph and fails soft without one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EXTRA, viewsOf } from './jarvisModules.js';
import { buildScenes, SHOW_HOOKS } from './showCore.js';
import { buildGraph } from './jarvisCore.js';
import { buildFly } from './chainFlyCore.js';
import { CHAIN_NODES, evaluateChain } from '../macroChain.js';
await import('./jarvisViewChain.js');

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
  const all = buildScenes({ now: new Date(), chain: { holding: 1, broken: 1, quiet: 1, headline: 'x' }, extra: { chainfly: data } }), ids = all.map(s => s.id);
  assert.equal(ids[ids.indexOf('chain') + 1], 'chainfly');
  const api = { st: { yaw: 1, pitch: 1 } }; sc.enter(api); sc.motion(api, 0.5); assert.equal(api.st.yaw, 0);
  assert.equal(buildScenes({ now: new Date(), extra: {} }).some(s => s.id === 'chainfly'), false);
});

test('the view draws without throwing: a message with no graph, a frame with one (stub canvas)', () => {
  const calls = []; const ctx = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 50 }) : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...a) => calls.push(k)), set: () => true });
  const C = { up: 'g', dn: 'r', gold: 'o', blue: 'b', tx: 'w', tx2: 'x', cy: 'c' }, v = viewsOf().find(x => x.id === 'chainfly');
  const g = { t: 1, dt: 0.016, fade: 1, W: 1000, H: 700, cx: 500, cy: 350, C, hit() {} };
  const doc = { getElementById: () => ({ style: { getPropertyValue: () => '70px' } }) };
  const st = { graph: null, yaw: 0, pitch: 0, zoom: 1 };
  v.draw(ctx, g, { st, names, ID: 'jarvis', doc }); assert.ok(calls.includes('fillText'));
  st.graph = graph; calls.length = 0; v.draw(ctx, g, { st, names, ID: 'jarvis', doc }); assert.ok(calls.filter(c => c === 'stroke').length > 20);
  assert.ok(buildFly(graph, names).route.stops.length > 0);
});
