import assert from 'node:assert/strict';
import { normCdf, bsDelta, bookAt, hedgingScenario, hedgingRead } from './hedgingScenario.js';
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

const C = (K, oi, cp, { T = 7 / 365, iv = 0.16 } = {}) => ({ K, oi, cp, T, iv });

t('normCdf and delta are sane; put-call parity holds', () => {
  assert.ok(Math.abs(normCdf(0) - 0.5) < 1e-7); assert.ok(Math.abs(normCdf(1.96) - 0.975) < 1e-3);
  for (const K of [7600, 7800, 8000]) {
    const c = bsDelta(7800, K, 0.05, 0.18, 'C'), p = bsDelta(7800, K, 0.05, 0.18, 'P');
    assert.ok(Math.abs(c - p - 1) < 1e-9);
  }
});

t('gamma is the 1% derivative of delta', () => {
  const book = [C(7700, 900, 'P'), C(7800, 500, 'C'), C(7850, 700, 'C', { T: 30 / 365 }), C(7650, 400, 'P', { iv: 0.22 })];
  const S = 7790, h = 0.5;
  const num = (bookAt(book, S + h).delta - bookAt(book, S - h).delta) / (2 * h) * S * 0.01;
  assert.ok(Math.abs(num - bookAt(book, S).gamma) < 1e-3 * Math.max(1, Math.abs(num)), `${num} vs ${bookAt(book, S).gamma}`);
});

t('dealer long calls only: long gamma everywhere, hedging sells rallies and buys dips', () => {
  const sc = hedgingScenario([C(7800, 1000, 'C')], { spot: 7800 });
  assert.equal(sc.atSpot.regime, 'long');
  assert.ok(sc.atSpot.hedgeUp1pct < 0 && sc.atSpot.hedgeDown1pct > 0);
  assert.equal(sc.zeroGamma.length, 0);
  assert.ok(sc.curves.find(c => c.dv === 0).gamma.every(g => g >= 0));
});

t('puts below, calls above: zero gamma between them, short gamma below it (COG layout)', () => {
  const book = [C(7700, 3000, 'P'), C(7725, 2000, 'P'), C(7800, 3000, 'C'), C(7900, 2000, 'C')];
  const sc = hedgingScenario(book, { spot: 7811 });
  const z = sc.zeroGamma[0];
  assert.ok(z && z.price > 7700 && z.price < 7811, JSON.stringify(z));
  assert.equal(z.dir, 'short->long');
  assert.equal(sc.atSpot.regime, 'long');
  const below = bookAt(book, 7690);
  assert.ok(below.gamma < 0, 'short gamma under the put block');
  assert.equal(sc.levels.callWall, 7800); assert.equal(sc.levels.putWall, 7700);
  // the hedge line is zero at spot by construction
  const i = sc.grid.reduce((b, P, j) => (Math.abs(P - 7811) < Math.abs(sc.grid[b] - 7811) ? j : b), 0);
  assert.ok(Math.abs(sc.curves.find(c => c.dv === 0).hedge[i]) < Math.abs(sc.atSpot.hedgeUp1pct));
  // every IV shift gets its own curve and a vanna figure
  assert.deepEqual(sc.shifts, [-2, 0, 2, 4]);
  assert.ok(Number.isFinite(sc.atSpot.vanna[-2]) && Number.isFinite(sc.atSpot.charm));
});

t('multiplier ratio: SPX options (100) hedged in ES (50) doubles the futures count', () => {
  const book = [C(7800, 1000, 'C')];
  const a = hedgingScenario(book, { spot: 7800 }), b = hedgingScenario(book, { spot: 7800, optMult: 100, futMult: 50 });
  assert.ok(Math.abs(b.atSpot.gamma / a.atSpot.gamma - 2) < 1e-9);
});

t('expired-by-tomorrow contracts drop out of the charm day', () => {
  const book = [C(7800, 1000, 'C', { T: 0.5 / 365 })];
  assert.equal(bookAt(book, 7800, { dt: 1 / 365 }).delta, 0);
});

t('bad input returns null, and the read is sentences', () => {
  assert.equal(hedgingScenario([], { spot: 1 }), null);
  assert.equal(hedgingScenario([C(1, 1, 'C')], {}), null);
  const r = hedgingRead(hedgingScenario([C(7700, 3000, 'P'), C(7800, 3000, 'C')], { spot: 7790 }));
  assert.ok(r.length >= 3 && r.every(s => typeof s === 'string' && s.length > 20));
});

console.log(`hedgingScenario: ${n} tests passed`);
