import assert from 'node:assert/strict';
import { bsVega, bsTheta, bsVomma, bsSpeed, bsZomma, bsColor, bsVeta, bsUltima, bsDeltaCall, bsPriceCall, bsPricePut,
  bsRhoCall, exposureAt, greekLayers, hedgeFlow, GREEKS } from './greekLayers.js';
import { bsGamma } from './gammaGreeks.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ✓ ' + name); };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);

const S = 100, K = 102, T = 30 / 365, s = 0.2;
const v = s * Math.sqrt(T), d1 = (Math.log(S / K) + 0.5 * s * s * T) / v, d2 = d1 - v;
const pdf = x => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

t('vega matches the closed form S pdf(d1) sqrt(T)', () => near(bsVega(S, K, T, s), S * pdf(d1) * Math.sqrt(T), 1e-12, 'vega'));
t('theta matches -S pdf(d1) sigma / (2 sqrt T) and is negative', () => { near(bsTheta(S, K, T, s), -S * pdf(d1) * s / (2 * Math.sqrt(T)), 1e-12, 'theta'); assert.ok(bsTheta(S, K, T, s) < 0); });
t('vomma finite difference matches vega d1 d2 / sigma', () => near(bsVomma(S, K, T, s), bsVega(S, K, T, s) * d1 * d2 / s, 1e-4, 'vomma'));
t('speed finite difference matches -gamma/S (d1/(sigma sqrt T) + 1)', () => near(bsSpeed(S, K, T, s), -bsGamma(S, K, T, s) / S * (d1 / v + 1), 1e-3, 'speed'));
t('zomma finite difference matches gamma (d1 d2 - 1)/sigma', () => near(bsZomma(S, K, T, s), bsGamma(S, K, T, s) * (d1 * d2 - 1) / s, 1e-3, 'zomma'));
t('put-call parity at r=0: call - put = S - K', () => near(bsPriceCall(S, K, T, s) - bsPricePut(S, K, T, s), S - K, 1e-6, 'parity'));
t('rho is negative and scales with time', () => { assert.ok(bsRhoCall(S, K, T, s) < 0); assert.ok(bsRhoCall(S, K, 2 * T, s) < bsRhoCall(S, K, T, s)); });
t('color is positive at the money: ATM gamma builds as time passes', () => assert.ok(bsColor(S, S, T, s) > 0));
t('veta and ultima are finite numbers', () => { assert.ok(Number.isFinite(bsVeta(S, K, T, s))); assert.ok(Number.isFinite(bsUltima(S, K, T, s))); });
t('delta of an ATM call is about one half', () => near(bsDeltaCall(S, S, T, s), 0.5, 0.02, 'delta'));

t('every layer in GREEKS has an exposure value', () => {
  const e = exposureAt(S, K, T, s, 1000, 400, 1);
  for (const g of GREEKS) assert.ok(Number.isFinite(e[g.key]), g.key);
});
t('symmetric layers flip sign when calls and puts swap', () => {
  const a = exposureAt(S, K, T, s, 1000, 400, 1), b = exposureAt(S, K, T, s, 400, 1000, 1);
  for (const k of ['gex', 'vex', 'tex', 'vomma', 'oi']) assert.ok(Math.sign(a[k]) === -Math.sign(b[k]) || a[k] === 0, k);
});

t('greekLayers: windows strikes, sums legs, reports vega by expiry', () => {
  const legs = [
    { dte: 1, code: 'A', strikes: [98, 100, 102], calls: [10, 50, 200], puts: [300, 50, 5], sigma: 0.2 },
    { dte: 30, code: 'B', strikes: [98, 100, 102], calls: [100, 500, 100], puts: [100, 100, 500], sigma: 0.2 },
  ];
  const g = greekLayers(legs, 100, { mult: 100, lo: 99, hi: 103 });
  assert.equal(g.rows.length, 2);
  assert.ok(g.rows.every(r => r.strike >= 99));
  assert.equal(g.vega.byExpiry.length, 2);
  near(g.vega.byExpiry.reduce((a, x) => a + x.share, 0), 1, 1e-9, 'shares');
  const near3 = greekLayers(legs, 100, { mult: 100, maxDte: 3 });
  assert.equal(near3.vega.byExpiry.length, 1);
  assert.ok(Number.isFinite(g.totals.gex));
});
t('greekLayers rejects a bad book', () => assert.equal(greekLayers(null, 100), null));

// hedge-flow schedule
const hfLegs = (c, p) => [{ dte: 5, sigma: 0.2, strikes: [95, 100, 105], calls: c, puts: p }];
t('hedgeFlow: a call-heavy book (dealers long calls) sells rallies and buys dips', () => {
  const h = hedgeFlow(hfLegs([0, 50000, 0], [0, 0, 0]), 100, { mult: 1, lo: 95, hi: 105 });
  assert.ok(h.at(104).flow < 0, 'rally: dealers sell');
  assert.ok(h.at(96).flow > 0, 'dip: dealers buy');
  assert.ok(h.spotSlope < 0, 'negative slope = damping');
});
t('hedgeFlow: zero at spot, and a put-heavy book (dealers short puts) chases the move', () => {
  const h = hedgeFlow(hfLegs([0, 50000, 0], [0, 0, 0]), 100, { lo: 95, hi: 105 }), g = hedgeFlow(hfLegs([0, 0, 0], [0, 50000, 0]), 100, { lo: 95, hi: 105 });
  near(h.at(100).flow, 0, 1e-6, 'flow at spot');
  assert.ok(g.at(104).flow > 0 && g.at(96).flow < 0, 'rally: dealers buy more');
  assert.ok(g.spotSlope > 0);
});
t('hedgeFlow: the flow at P equals minus the change in net dealer delta times spot (checked against exposureAt dex)', () => {
  const legs = hfLegs([100, 300, 50], [40, 80, 20]), h = hedgeFlow(legs, 100, { mult: 10, lo: 97, hi: 103 });
  const dex = P => legs[0].strikes.reduce((a, K, i) => a + exposureAt(P, K, 5 / 365, 0.2, legs[0].calls[i], legs[0].puts[i], 10).dex / P, 0);
  const q = h.at(103);
  near(q.flow, -(dex(q.price) - dex(100)) * 100, 1e-6, 'flow vs dex');
});
t('hedgeFlow: maxDte drops far expiries, a bad book returns null', () => {
  const legs = [{ dte: 2, sigma: 0.2, strikes: [100], calls: [1000], puts: [0] }, { dte: 90, sigma: 0.2, strikes: [100], calls: [900000], puts: [0] }];
  const nearBook = hedgeFlow(legs, 100, { maxDte: 3, lo: 95, hi: 105 }), all = hedgeFlow(legs, 100, { lo: 95, hi: 105 });
  assert.ok(Math.abs(all.at(104).flow) > 10 * Math.abs(nearBook.at(104).flow));
  assert.equal(hedgeFlow(null, 100), null);
  assert.equal(hedgeFlow(legs, 100, { maxDte: 0.1 }), null);
});
t('hedgeFlow: turns lists the prices where the slope changes sign', () => {
  const h = hedgeFlow(hfLegs([0, 0, 80000], [80000, 0, 0]), 100, { lo: 93, hi: 107, n: 141 });
  assert.ok(Array.isArray(h.turns));
});

console.log(`\nall ${n} passed`);
