// Tests for js/quickTest.js on synthetic series: a planted lead must be found, pure noise must come back NULL.
//   node js/quickTest.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { runQuickTest, normaliseSpec, specId, quality, transformValues, storeResult, listOf, suggestSpec, CATALOGUE, LOCKBOX_END, LABEL } from './quickTest.js';
import { mulberry32 } from './statsCore.js';

/** N business days ending 2026-10-30 (so the tail runs past the lockbox and must be dropped). */
const days = N => { const out = []; let d = Date.parse('2026-10-30'); while (out.length < N) { const w = new Date(d).getUTCDay(); if (w > 0 && w < 6) out.unshift(new Date(d).toISOString().slice(0, 10)); d -= 864e5; } return out; };
function world(N, seed, f) {
  const rng = mulberry32(seed), g = () => { const u = Math.max(1e-12, rng()), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const D = days(N), xs = [], cs = [], rets = [];
  for (let i = 0; i < N; i++) { xs.push(g()); cs.push(g()); rets.push(0.01 * g()); }
  f?.({ xs, cs, rets, g });
  let p = 100; const y = D.map((date, i) => { p *= Math.exp(rets[i]); return { date, value: p }; });
  return { x: D.map((date, i) => ({ date, value: xs[i] })), c: D.map((date, i) => ({ date, value: cs[i] })), y };
}
const spec = (o = {}) => normaliseSpec({ x: 'fred:VIXCLS', y: 'oanda:EURUSD', horizons: [1, 2], xTransform: 'level', ...o });

test('a planted lead (X today moves Y two days on, after the one-day skip) is found: VALIDATED, exploratory', () => {
  const W = world(5000, 11, ({ xs, rets }) => { for (let i = 0; i + 2 < xs.length; i++) rets[i + 2] += 0.0035 * xs[i]; });
  const r = runQuickTest({ spec: spec({ horizons: [1, 5] }), x: W.x, y: W.y, kinds: { x: 'rate', y: 'price' }, today: '2026-11-04' });
  assert.equal(r.verdict, 'VALIDATED', r.why); assert.equal(r.exploratory, true); assert.equal(r.label, LABEL);
  const h1 = r.horizons.find(c => c.h === 1); assert.ok(h1.pass && h1.oos.d > 0.2 && h1.is.d > 0.2, JSON.stringify(h1.oos));
  assert.equal(r.leadLag.peak.k, 2, 'the cross-correlation peaks at the planted lag');
  assert.ok(r.lockboxDropped.y > 0 && r.quality.y.to <= LOCKBOX_END, 'nothing after the lockbox is used');
});
test('pure noise comes back NULL (every horizon powered, none passes)', () => {
  const W = world(7000, 12);
  const r = runQuickTest({ spec: spec(), x: W.x, y: W.y, kinds: { x: 'rate', y: 'price' } });
  assert.equal(r.verdict, 'NULL', r.why);
  assert.ok(r.horizons.every(c => !c.pass && c.powered && c.oos.mde <= 0.2));
});
test('noise on a short sample at long horizons is UNDERPOWERED, not NULL', () => {
  const W = world(1600, 13);
  const r = runQuickTest({ spec: spec({ horizons: [20, 60] }), x: W.x, y: W.y, kinds: { x: 'rate', y: 'price' } });
  assert.equal(r.verdict, 'UNDERPOWERED', r.why);
});
test('same-day co-movement without a lead is CONTEXT', () => {
  const W = world(5000, 14, ({ xs, rets }) => { for (let i = 0; i < xs.length; i++) rets[i] += 0.006 * xs[i]; });
  const r = runQuickTest({ spec: spec({ xTransform: 'level' }), x: W.x, y: W.y, kinds: { x: 'rate', y: 'price' } });
  assert.equal(r.verdict, 'CONTEXT', r.why); assert.ok(r.leadLag.sameDay.significant);
});
test('a condition: the lead planted only when C is high is found under C above its median, not under C below', () => {
  const W = world(7000, 15, ({ xs, cs, rets }) => { for (let i = 0; i + 2 < xs.length; i++) if (cs[i] > 0) rets[i + 2] += 0.005 * xs[i]; });
  const up = runQuickTest({ spec: spec({ horizons: [1], condition: { series: 'fred:NFCI', op: 'above', pct: 50 } }), x: W.x, y: W.y, cData: W.c, kinds: { x: 'rate', y: 'price', c: 'rate' } });
  const dn = runQuickTest({ spec: spec({ horizons: [1], condition: { series: 'fred:NFCI', op: 'below', pct: 50 } }), x: W.x, y: W.y, cData: W.c, kinds: { x: 'rate', y: 'price', c: 'rate' } });
  assert.equal(up.verdict, 'VALIDATED', up.why); assert.notEqual(dn.verdict, 'VALIDATED', dn.why);
});
test('too little overlap is UNDERPOWERED with the reason', () => {
  const W = world(500, 16);
  const r = runQuickTest({ spec: spec(), x: W.x, y: W.y });
  assert.equal(r.verdict, 'UNDERPOWERED'); assert.match(r.why, /need 750/);
});
test('quality: gaps, stale runs, coverage, staleness', () => {
  const s = [{ date: '2026-01-01', value: 1 }, { date: '2026-01-02', value: 1 }, { date: '2026-01-05', value: 1 }, { date: '2026-01-06', value: 1 }, { date: '2026-01-07', value: 1 }, { date: '2026-02-02', value: 2 }];
  const q = quality(s, { today: '2026-02-12' });
  assert.equal(q.n, 6); assert.equal(q.staleRuns, 1); assert.equal(q.gapsOver7d, 1); assert.equal(q.maxGapDays, 26); assert.equal(q.daysSinceLast, 10);
  assert.equal(quality([]).ok, false);
});
test('transforms: log changes for prices, differences for rates, z-score', () => {
  const v = [100, 110, 121]; assert.ok(Math.abs(transformValues(v, 'chg1', 'price')[2] - Math.log(1.1)) < 1e-12);
  assert.equal(transformValues([1, 2, 4], 'chg1', 'rate')[2], 2); assert.ok(Number.isNaN(transformValues([1, 2], 'chg5', 'rate')[1]));
  const z = transformValues(Array.from({ length: 80 }, (_, i) => i % 2), 'z60', 'rate'); assert.ok(Number.isFinite(z[70]));
});
test('spec: whitelist, bounded horizons, stable id', () => {
  assert.throws(() => normaliseSpec({ x: 'fred:NOPE', y: 'oanda:EURUSD' }), /unknown series/);
  assert.throws(() => normaliseSpec({ x: 'oanda:EURUSD', y: 'oanda:EURUSD' }), /same series/);
  const s = normaliseSpec({ x: 'fred:DGS2', y: 'oanda:USDJPY', horizons: [60, 1, 1, 7, 5, 2, 10] });
  assert.deepEqual(s.horizons, [1, 2, 5, 10]); assert.equal(s.xTransform, 'chg5');
  assert.equal(specId(s), specId(normaliseSpec({ x: 'fred:DGS2', y: 'oanda:USDJPY', horizons: [10, 5, 2, 1] })));
  assert.notEqual(specId(s), specId({ ...s, xTransform: 'level' }));
  assert.ok(CATALOGUE['oanda:EURUSD'] && CATALOGUE['oanda:GOLD'] && CATALOGUE['fred:VIXCLS'] && CATALOGUE['yield:DE2Y']);
});
test('store: newest first, capped, a rerun keeps every proposal link, list filters by proposal', () => {
  let s = storeResult({}, 'a', { verdict: 'NULL', spec: { x: 'fred:DGS2', y: 'oanda:EURUSD' } }, { proposalId: 'p1' });
  s = storeResult(s, 'b', { verdict: 'CONTEXT', spec: {} }, { cap: 2 });
  s = storeResult(s, 'a', { verdict: 'NULL', spec: {} }, { proposalId: 'p2', cap: 2 });
  assert.deepEqual(s.order, ['a', 'b']); assert.deepEqual(s.tests.a.proposalIds, ['p1', 'p2']);
  s = storeResult(s, 'c', { verdict: 'NULL', spec: {} }, { cap: 2 }); assert.deepEqual(s.order, ['c', 'a']); assert.equal(s.tests.b, undefined);
  assert.deepEqual(listOf(s, { proposalId: 'p1' }).map(t => t.id), ['a']); assert.ok(listOf(s).every(t => t.exploratory));
});
test('suggest: Y from the universe, X from the signal words, horizons from the horizon text', () => {
  const g = suggestSpec({ rules: { universe: ['USD/JPY'], signal: 'a 2-year yield spike when the VIX is calm', horizon: '5 days to 2 weeks' } });
  assert.equal(g.y, 'oanda:USDJPY'); assert.equal(g.x, 'fred:VIXCLS'); assert.deepEqual(g.horizons, [5, 10]);
  assert.deepEqual(suggestSpec({}).horizons, [1, 5, 20]);
});
