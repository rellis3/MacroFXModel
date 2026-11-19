// js/terminal/netCore.test.mjs: the NETWORK maths (layout, links, clusters, script) and that the view registers its module, view and SHOW scene.
import test from 'node:test';
import assert from 'node:assert/strict';
import { forceLayout, layoutFit, pickLinks, clusterTightness, partners, buildNet, netScript, sharesCurrency, rng } from './netCore.js';
import { EXTRA, viewsOf } from './jarvisModules.js';
import { SHOW_HOOKS, buildScenes } from './showCore.js';
await import('./jarvisViewNet.js');

// a synthetic panel: two groups driven by two factors, one market anti-correlated with the first factor
function panel(n = 200) {
  const r = rng(11), f1 = Array.from({ length: n }, () => r() - 0.5), f2 = Array.from({ length: n }, () => r() - 0.5), noise = () => (r() - 0.5) * 0.2;
  const mk = fn => { let p = 100; return [p, ...Array.from({ length: n - 1 }, (_, i) => (p *= Math.exp(fn(i) * 0.01)))]; };
  const spec = { NAS100_USD: i => f1[i] + noise(), SPX500_USD: i => f1[i] + noise(), US30_USD: i => f1[i] + noise(), US2000_USD: i => f1[i] + noise(), XAUUSD: i => f2[i] + noise(), XAGUSD: i => f2[i] + noise(), XPTUSD: i => f2[i] + noise(), USDZAR: i => -f1[i] + noise(), EURUSD: i => noise(), GBPUSD: i => noise() };
  const syms = Object.keys(spec), closes = {}; for (const s of syms) closes[s] = mk(spec[s]);
  return { syms, dates: Array.from({ length: n }, (_, i) => `d${i}`), closes };
}

test('the layout is deterministic for a seed and pulls correlated markets together, pushes opposed ones apart', () => {
  const net = buildNet({ ok: true, panel: panel() }), net2 = buildNet({ ok: true, panel: panel() });
  assert.deepEqual(Array.from(net.P), Array.from(net2.P));
  assert.ok(net.fit > 0.8, `layout fit ${net.fit}`);
  const d = (a, b) => { const i = net.ids.indexOf(a), j = net.ids.indexOf(b); return Math.hypot(net.P[i * 3] - net.P[j * 3], net.P[i * 3 + 1] - net.P[j * 3 + 1], net.P[i * 3 + 2] - net.P[j * 3 + 2]); };
  assert.ok(d('NQ', 'SPX500') < d('NQ', 'GOLD'), 'index pair closer than index-metal');
  assert.ok(d('NQ', 'USDZAR') > d('NQ', 'SPX500') * 2, 'anti-correlated pushed far apart');
  assert.notDeepEqual(Array.from(forceLayout(net.m, { seed: 1 })), Array.from(forceLayout(net.m, { seed: 2 })));
});

test('links respect the threshold and the cap; sign and strength are kept', () => {
  const m = [[1, 0.9, -0.6, 0.2], [0.9, 1, 0.1, null], [-0.6, 0.1, 1, 0.55], [0.2, null, 0.55, 1]];
  const l = pickLinks(m, 0.5, 10); assert.deepEqual(l.map(x => [x.a, x.b]), [[0, 1], [0, 2], [2, 3]]); assert.equal(l[1].r, -0.6);
  assert.equal(pickLinks(m, 0.5, 2).length, 2); assert.equal(pickLinks(m, 0.95).length, 0);
});

test('cluster tightness, partners, shared-currency flag', () => {
  const net = buildNet({ ok: true, panel: panel() }), eq = net.tight.find(c => c.id === 'eq');
  assert.ok(eq && eq.mean > 0.9); assert.ok(net.tight[0].mean >= net.tight[1].mean);
  const p = partners(net.ids, net.m, net.ids.indexOf('NQ')); assert.ok(p.pos[0].r > 0.9); assert.equal(p.neg[0].k, 'USDZAR');
  assert.ok(sharesCurrency('EURUSD', 'GBPUSD') && !sharesCurrency('EURJPY', 'GBPCHF') && !sharesCurrency('NQ', 'GOLD'));
  assert.deepEqual(clusterTightness(['NQ'], [[1]]), []);
});

test('fails soft: no panel, a short panel, a bad body', () => {
  assert.equal(buildNet(null), null); assert.equal(buildNet({ ok: false }), null); assert.equal(buildNet({ panel: { syms: ['A'], dates: ['d'], closes: { A: [1] } } }), null);
  assert.equal(netScript(null), null); assert.equal(layoutFit(new Float32Array(3), [[1]]), null);
});

test('the spoken script names the real pairs, states the window, and says it is not a forecast', () => {
  const t = netScript(buildNet({ ok: true, panel: panel() }));
  assert.match(t, /last 60 trading days/); assert.match(t, /tightest pair/); assert.match(t, /most opposed pair/); assert.match(t, /not a forecast/); assert.match(t, /tightly bound group is (metals|equity indices)/);
});

test('registers the NETWORK panel, the net view (accent up, clean chrome) and a SHOW scene after the lean', () => {
  assert.ok(EXTRA.some(m => m.id === 'net' && m.label === 'NETWORK'));
  const v = viewsOf().find(x => x.id === 'net'); assert.ok(v && v.env.accent === 'up' && v.env.chrome === 'clean' && typeof v.draw === 'function');
  const h = SHOW_HOOKS.find(x => x.id === 'net'); assert.ok(h && h.after === 'lean');
  assert.equal(h.build({}, null), null);
  assert.ok(buildScenes({ now: new Date() }).length >= 2);
});
