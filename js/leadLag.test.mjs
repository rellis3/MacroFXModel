import test from 'node:test';
import assert from 'node:assert/strict';
import { xcorr, alignReturns, leadLagGrid, pairLine } from './leadLag.js';

function rng(seed) { let a = seed >>> 0; const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; return () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u()); }
const day = i => new Date(Date.UTC(2014, 0, 6) + (Math.floor(i / 5) * 7 + (i % 5)) * 864e5).toISOString().slice(0, 10);
const closesOf = rets => { let p = 100; return [{ date: day(0), value: p }, ...rets.map((r, i) => ({ date: day(i + 1), value: (p *= Math.exp(r)) }))]; };

test('xcorr finds a planted lag and its robust se', () => {
  const g = rng(1), a = Float64Array.from({ length: 3000 }, () => g()), b = new Float64Array(3000);
  for (let t = 0; t < 3000; t++) b[t] = (t >= 2 ? 0.3 * a[t - 2] : 0) + g();
  const c2 = xcorr(a, b, 2), c1 = xcorr(a, b, 1);
  assert.ok(c2.r > 0.2 && c2.se > 0 && c2.se < 0.03); assert.ok(Math.abs(c1.r) < 0.06);
  assert.equal(xcorr(a.slice(0, 10), b.slice(0, 10), 1).r, null, 'too short');
});

test('align: common dates, NaN where a market has no bar, lockbox cut', () => {
  const { dates, R } = alignReturns({ A: [{ date: '2026-08-19', value: 1 }, { date: '2026-08-20', value: 2 }, { date: '2026-08-21', value: 3 }, { date: '2026-08-24', value: 4 }], B: [{ date: '2026-08-20', value: 1 }, { date: '2026-08-21', value: 1.1 }] });
  assert.deepEqual(dates, ['2026-08-20', '2026-08-21']); assert.ok(Number.isNaN(R.B[0])); assert.ok(Math.abs(R.B[1] - Math.log(1.1)) < 1e-12);
});

test('false leads in pure noise stay near the 10% rate the correction allows', () => {
  let any = 0;
  for (let seed = 1; seed <= 30; seed++) { const g = rng(seed), X = {}; for (const k of 'ABCDEF') X[k] = { closes: closesOf(Array.from({ length: 2500 }, () => 0.006 * g())) }; any += leadLagGrid(X).leads.length > 0; }
  assert.ok(any <= 6, `${any} of 30 noise runs had a lead`);
});

test('grid: a planted one-day lead survives; same-day co-movement and noise do not; direction matters', () => {
  const N = 3000, g = rng(7), A = [], B = [], C = [], D = [], E = [];
  for (let t = 0; t < N; t++) { A.push(0.006 * g()); C.push(0.006 * g()); D.push(0.006 * g()); E.push(A[t] + 0.006 * g()); B.push((t ? 0.15 * A[t - 1] : 0) + 0.006 * g()); }
  const s = Object.fromEntries(Object.entries({ A, B, C, D, E }).map(([k, v]) => [k, { label: k, closes: closesOf(v) }]));
  const G = leadLagGrid(s);
  assert.equal(G.tested, 20);
  const keys = G.leads.map(x => `${x.lead}>${x.follow}@${x.k}`);
  assert.equal(keys[0], 'A>B@1', keys.join());
  assert.ok(keys.includes('E>B@1'), 'E carries A, so it leads B too (a proxy lead, named as such in the view)');
  assert.ok(!G.leads.some(x => ['C', 'D'].includes(x.lead) && ['C', 'D'].includes(x.follow)), 'noise against noise: no lead');
  assert.ok(!G.leads.some(x => x.lead === 'B' && x.follow === 'A'), 'the follower does not lead');
  const ae = G.near.find(x => x.lead === 'A' && x.follow === 'E'); assert.ok(ae && ae.sameDay > 0.5 && !ae.isLead, 'same day is not a lead');
  assert.ok(G.matrix.A.B > 0.1 && G.matrix.B.A != null);
  assert.equal(G.byMarket.B.ledBy[0].lead, 'A');
  assert.match(pairLine(G.leads[0], G.labels), /A today → B 1 day later, the same way.*a lead/);
  assert.match(G.label, /not a signal/);
});
