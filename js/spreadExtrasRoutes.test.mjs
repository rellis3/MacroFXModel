// js/spreadExtrasRoutes.test.mjs: the extra FRED series route's builder. node --test js/spreadExtras.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpreadExtras, mountSpreadExtras, EXTRA_FRED, TTL_MS } from './spreadExtrasRoutes.js';

const NOW = Date.parse('2026-11-16T12:00:00Z');
const pts = (n, v = 1, start = '2024-01-01') => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.parse(start) + i * 864e5).toISOString().slice(0, 10), value: v + i * 0.001 }));

test('every extra is built, scaled and dated, one FRED call each', async () => {
  const calls = [];
  const x = createSpreadExtras({ fredCsv: async id => { calls.push(id); return pts(60, id === 'WALCL' ? 6.6e6 : 4); }, now: () => NOW });
  const d = await x.get();
  assert.equal(d.ok, true); assert.deepEqual(calls, EXTRA_FRED.map(s => s.id)); assert.equal(d.missing.length, 0);
  assert.ok(d.series.walcl.values[0] < 1e4, 'the balance sheet is converted from $m to $bn');
  assert.equal(d.series.dtb3.dates.length, d.series.dtb3.values.length);
});
test('a series that fails is named in missing and the rest still serve; all failing is an error, not an empty answer', async () => {
  const a = await createSpreadExtras({ fredCsv: async id => { if (id === 'IORB') throw new Error('FRED IORB HTTP 503'); return pts(60); }, now: () => NOW }).get();
  assert.equal(a.ok, true); assert.deepEqual(a.missing.map(m => m.key), ['iorb']); assert.ok(!a.series.iorb && a.series.sofr);
  const b = await createSpreadExtras({ fredCsv: async () => { throw new Error('down'); }, now: () => NOW }).get();
  assert.equal(b.ok, false); assert.match(b.error, /none of the extra series/); assert.equal(b.missing.length, EXTRA_FRED.length);
});
test('too few observations count as missing, and old history before the window is dropped', async () => {
  const d = await createSpreadExtras({ fredCsv: async id => (id === 'DFF' ? pts(10) : pts(60, 1, '2010-01-01').concat(pts(60))), now: () => NOW }).get();
  assert.ok(d.missing.some(m => m.key === 'dff' && /only 10/.test(m.why)));
  assert.ok(d.series.dtb3.dates[0] >= '2020-05-01');
});
test('the answer is held for six hours, a failure is not held, and a second caller shares the call in flight', async () => {
  let n = 0, t = NOW; const x = createSpreadExtras({ fredCsv: async () => { n++; return pts(60); }, now: () => t });
  const [p, q] = await Promise.all([x.get(), x.get()]); assert.equal(p, q); const first = n;
  await x.get(); assert.equal(n, first, 'served from the held copy');
  t += TTL_MS + 1; await x.get(); assert.equal(n, first * 2, 'rebuilt after the TTL');
});
test('the route answers 200 with the series and 503 when nothing could be read', async () => {
  const routes = {}; const app = { get: (p, h) => { routes[p] = h; } };
  mountSpreadExtras(app, { fredCsv: async () => pts(60), now: () => NOW });
  const out = {}; const res = { set() {}, status(c) { out.code = c; return this; }, json(b) { out.body = b; } };
  await routes['/api/spread-extras']({}, res); assert.equal(out.code, 200); assert.equal(out.body.ok, true);
  const app2 = { get: (p, h) => { routes[p] = h; } }; mountSpreadExtras(app2, { fredCsv: async () => { throw new Error('x'); }, now: () => NOW });
  await routes['/api/spread-extras']({}, res); assert.equal(out.code, 503); assert.equal(out.body.ok, false);
});
