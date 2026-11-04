import test from 'node:test';
import assert from 'node:assert/strict';
import { normCdf, normInv, logReturns, acf, varianceRatio, bh, profile, board } from './autocorr.js';

// seeded normal draws (mulberry32 + Box-Muller)
function rng(seed) { let a = seed >>> 0; const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; return () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u()); }
// weekdays only, as the server's daily bars are (2014-01-06 is a Monday)
const day = i => new Date(Date.UTC(2014, 0, 6) + (Math.floor(i / 5) * 7 + (i % 5)) * 864e5).toISOString().slice(0, 10);
/** closes from returns built by step(prev return, prev sigma, z) → [r, sigma] */
function closes(n, seed, step) {
  const z = rng(seed), out = [{ date: day(0), value: 100 }]; let r = 0, s = 0.006;
  for (let i = 1; i < n; i++) { [r, s] = step(r, s, z()); out.push({ date: day(i), value: out[i - 1].value * Math.exp(r) }); }
  return out;
}
const N = 3000;   // ~11.5 years: the last ~170 fall after the lockbox and are cut
const iid = s => closes(N, s, (_r, _s, z) => [0.006 * z, 0.006]);
const ar = (phi, s) => closes(N, s, (r, _s, z) => [phi * r + 0.006 * z, 0.006]);
const garch = s => closes(N, s, (r, sig, z) => { const v = Math.sqrt(0.000002 + 0.1 * r * r + 0.85 * sig * sig); return [v * z, v]; });

test('normal helpers', () => {
  assert.ok(Math.abs(normCdf(1.96) - 0.975) < 1e-4);
  assert.ok(Math.abs(normInv(0.975) - 1.96) < 1e-3);
  assert.ok(Math.abs(normInv(1 - 0.05 / 20) - 2.807) < 1e-3);
});

test('acf and variance ratio see AR(1) memory in the right direction', () => {
  const pos = logReturns(ar(0.2, 1)).map(p => p.r), neg = logReturns(ar(-0.2, 2)).map(p => p.r);
  assert.ok(Math.abs(acf(pos, 1)[0].r - 0.2) < 0.05);
  assert.ok(Math.abs(acf(neg, 1)[0].r + 0.2) < 0.05);
  assert.ok(varianceRatio(pos, 5).vr > 1.2 && varianceRatio(pos, 5).z > 3);
  assert.ok(varianceRatio(neg, 5).vr < 0.8 && varianceRatio(neg, 5).z < -3);
  assert.equal(varianceRatio(pos.slice(0, 30), 5), null, 'too short for the horizon');
});

test('robust se is wider than 1/sqrt(n) when volatility clusters', () => {
  const x = logReturns(garch(3)).map(p => p.r), a = acf(x, 1)[0];
  assert.ok(a.se > 1.1 / Math.sqrt(x.length));
});

test('bh', () => {
  assert.deepEqual(bh([0.001, 0.5, 0.02, null], 0.1), [true, false, true, false]);
  assert.deepEqual(bh([0.2, 0.3], 0.1), [false, false]);
});

test('weekend-dated stubs are skipped, their move rolls into the next weekday', () => {
  const r = logReturns([{ date: '2026-10-30', value: 100 }, { date: '2026-11-01', value: 101 }, { date: '2026-11-02', value: 102 }]);
  assert.equal(r.length, 1); assert.equal(r[0].date, '2026-11-02'); assert.ok(Math.abs(r[0].r - Math.log(1.02)) < 1e-12);
});

test('profile: lockbox cut, halves, vol clustering', () => {
  const p = profile(garch(4));
  assert.ok(p.ok); assert.ok(p.to <= '2026-08-21'); assert.equal(p.ret.length, 10); assert.equal(p.halves.length, 2);
  assert.ok(p.volLags >= 3, `GARCH should show vol memory, got ${p.volLags}`);
  assert.equal(profile(iid(5).slice(0, 100)).ok, false);
});

test('board: trends, reverts and no memory; corrected across markets', () => {
  const b = board({ UP: { label: 'up', closes: ar(0.15, 6) }, DN: { label: 'down', closes: ar(-0.15, 7) }, RW1: { closes: iid(8) }, RW2: { closes: iid(9) }, RW3: { closes: iid(10) } });
  const w = Object.fromEntries(b.rows.map(r => [r.id, r.reading.word]));
  assert.equal(w.UP, 'trends'); assert.equal(w.DN, 'reverts');
  assert.ok(['RW1', 'RW2', 'RW3'].every(k => w[k] === 'no memory'));
  assert.equal(b.rows[0].reading.word, 'trends', 'sorted: findings first');
  assert.equal(b.summary.markets, 5); assert.match(b.label, /not a signal/);
  assert.match(b.rows.find(r => r.id === 'RW1').reading.line, /random walk/);
});
