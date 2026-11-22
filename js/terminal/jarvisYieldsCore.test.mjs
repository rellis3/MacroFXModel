import test from 'node:test'; import assert from 'node:assert/strict';
import { TENORS, buildGrid, slopeBp, slopeMix, ribbonOn, curveStats, yieldsScript, xOfYears, dayWord, bpText } from './jarvisYieldsCore.js';

const day = i => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
const mk = (n, f) => ({ series: Object.fromEntries(TENORS.map((t, ti) => [t.key, Array.from({ length: n }, (_, i) => ({ date: day(i), value: f(i, ti) }))])) });

test('buildGrid keeps the last rows where every tenor printed', () => {
  const p = mk(150, (i, ti) => 4 + ti * 0.1); p.series.y5.splice(140, 1);
  const G = buildGrid(p, 120); assert.equal(G.n, 120); assert.equal(G.T, 9); assert.ok(!G.dates.includes(day(140))); assert.equal(G.dates[119], day(149));
  assert.equal(buildGrid({ series: {} }), null); assert.equal(buildGrid(null), null); assert.equal(buildGrid(mk(12, () => 4)), null);
});
test('slope and mix: inverted is red, flat is gold, steep is cool', () => {
  const G = buildGrid(mk(40, (i, ti) => (ti === 2 ? 4.8 : ti === 6 ? 5.1 : 4)), 40); assert.equal(slopeBp(G, 0), 30);
  assert.deepEqual(slopeMix(-60), { cool: 0, gold: 0, red: 1 }); assert.equal(slopeMix(0).gold, 1); assert.equal(slopeMix(100).cool, 1); assert.equal(slopeMix(100).gold, 0);
  const m = slopeMix(-20); assert.ok(m.red > 0 && m.gold > 0 && m.cool === 0);
});
test('stats and script say what the numbers are', () => {
  const G = buildGrid(mk(60, (i, ti) => (ti === 2 ? 4 + i * 0.01 : ti === 6 ? 4.6 : 4)), 60), st = curveStats(G);
  assert.equal(st.sessions, 20); assert.ok(st.s < 100 && st.ds < 0); assert.equal(st.y10, Math.fround(4.6));
  const txt = yieldsScript(st); assert.match(txt, /flattened by/); assert.match(txt, /not a forecast/); assert.match(txt, /ten year yield is 4\.60 percent/);
  const inv = curveStats(buildGrid(mk(40, (i, ti) => (ti === 2 ? 5 : ti === 6 ? 4.5 : 4)), 40)); assert.equal(inv.inverted, true); assert.match(yieldsScript(inv), /inverted, 50 basis points below zero/); assert.equal(inv.invDays, 40);
  assert.equal(yieldsScript(null), null); assert.equal(curveStats(null), null);
});
test('ribbons carry values forward, never far, and fail soft', () => {
  const G = buildGrid(mk(40, () => 4), 40), r = ribbonOn(G, G.dates.filter((_, i) => i % 2 === 0).map(d => ({ date: d, value: 3 })));
  assert.equal(r.length, 40); assert.ok(r.every(v => v === 3)); assert.equal(ribbonOn(G, []), null); assert.equal(ribbonOn(G, [{ date: '2000-01-01', value: 1 }]), null);
});
test('helpers', () => { assert.equal(xOfYears(0.25), 0); assert.ok(Math.abs(xOfYears(30) - 1) < 1e-9); assert.equal(dayWord('2026-11-17'), '17 November'); assert.equal(bpText(-12.4), '-12bp'); });
test('monoCurve passes through the points and never overshoots them', async () => {
  const { monoCurve } = await import('./jarvisYieldsCore.js');
  const xs = [0, 1, 2, 3, 4], ys = [3.6, 3.5, 3.5, 3.9, 4.6], pts = monoCurve(xs, ys, 5);
  assert.equal(pts.length, 21); assert.deepEqual(pts[0], [0, 3.6]); assert.deepEqual(pts[20], [4, 4.6]); assert.ok(Math.abs(pts[15][1] - 3.9) < 1e-9);
  for (let i = 0; i < 4; i++) for (let s = 0; s <= 5; s++) { const y = pts[i * 5 + s][1]; assert.ok(y >= Math.min(ys[i], ys[i + 1]) - 1e-9 && y <= Math.max(ys[i], ys[i + 1]) + 1e-9); }
  const out = new Float32Array(42); assert.equal(monoCurve(xs, ys, 5, out), 21); assert.ok(Math.abs(out[41] - 4.6) < 1e-6); assert.deepEqual(monoCurve([1], [2]), []);
});
test('yieldsShowAct: over, front, rewind back to the oldest row, then return', async () => {
  const { yieldsShowAct } = await import('./jarvisYieldsCore.js');
  assert.equal(yieldsShowAct(0, 120).act, 'over'); assert.equal(yieldsShowAct(0.2, 120).act, 'front'); assert.equal(yieldsShowAct(0.2, 120).slice, 119);
  const r = yieldsShowAct(0.62, 120); assert.equal(r.act, 'rewind'); assert.ok(r.slice > 0 && r.slice < 119); assert.equal(yieldsShowAct(0.859, 120).slice, 0);
  assert.equal(yieldsShowAct(1, 120).act, 'return'); assert.equal(yieldsShowAct(1, 120).slice, 119); assert.equal(yieldsShowAct(NaN, 0).act, 'over');
});
