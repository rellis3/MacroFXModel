// Synthetic checks only: no real outcome data is read before the prereg's sample sizes are reached.
import test from 'node:test';
import assert from 'node:assert/strict';
import { aligned, score, gate, rule, N_FUTILITY, N_JUDGE } from './lib.mjs';

function rng(seed) { let a = seed >>> 0; const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; return () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u()); }
const day = i => new Date(Date.UTC(2023, 0, 2) + (Math.floor(i / 5) * 7 + (i % 5)) * 864e5).toISOString().slice(0, 10);
function world(n, phi, seed) {
  const g = rng(seed), a = [], b = []; for (let i = 0; i < n; i++) { a.push(0.01 * g()); b.push((i ? phi * 0.5 * a[i - 1] : 0) + 0.005 * g()); }
  let s = 4000, c = 0.9; const spx = [{ date: day(0), close: s }], chf = [{ date: day(0), close: c }];
  for (let i = 0; i < n; i++) { s *= Math.exp(a[i]); c *= Math.exp(b[i]); spx.push({ date: day(i + 1), close: s }); chf.push({ date: day(i + 1), close: c }); }
  return aligned(spx, chf);
}

test('the lead is measured on the next common session, inside the window only', () => {
  const rows = world(1300, -1, 1), s = score(rows, day(300));
  assert.ok(s.n > 900 && s.r < -0.3 && s.pOneSided < 0.001, JSON.stringify(s));
  assert.ok(Math.abs(s.controls.lag2) < 0.1 && Math.abs(s.controls.lag0) < 0.1);
  assert.equal(s.from, day(300));
});

test('gate: waits, then a futility stop on the wrong sign, then the judgement', () => {
  assert.equal(gate({ n: 120 }).stage, 'waiting');
  assert.equal(gate({ n: N_FUTILITY + 1, r: 0.02 }).verdict, 'NULL');
  assert.equal(gate({ n: N_FUTILITY + 1, r: -0.02 }).stage, 'continue');
  assert.equal(gate({ n: N_JUDGE, r: -0.09, pOneSided: 0.006, controls: { lag2: 0.01 } }).verdict, 'VALIDATED');
  assert.equal(gate({ n: N_JUDGE, r: -0.09, pOneSided: 0.006, controls: { lag2: 0.08 } }).verdict, 'NULL', 'the time-shift control must be clean');
  assert.notEqual(gate({ n: N_JUDGE, r: -0.03, pOneSided: 0.2, controls: { lag2: 0 } }).verdict, 'VALIDATED');
});

test('rule: trades both sides on walk-forward thresholds; noise is near zero net of cost', () => {
  const rows = world(1500, 0, 3), r = rule(rows, { from: day(400), B: 300 });
  assert.ok(r.n > 300 && r.ci95Pct[0] < 0 && r.hit > 0.35 && r.hit < 0.6, JSON.stringify(r));
  const lead = rule(world(1500, -1, 4), { from: day(400), B: 300 }); assert.ok(lead.meanPct > 0.1 && lead.ci95Pct[0] > 0);
});
