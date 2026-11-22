// Tests for js/terminal/ivSurfaceCore.js (the VOL SURFACE view's pure half). Run: node js/terminal/ivSurfaceCore.test.mjs
import assert from 'node:assert/strict';
import { toPct, interpAt, fromCboeFrame, fromOiEntry, oiHasIV, pickRange, pickScale, wing25, buildSurface, lerpSurface, surfaceFacts, ivScript, recentDays, rampPos, dteText, dayLabel, volTicks, NC, MAX_ROWS } from './ivSurfaceCore.js';

let n = 0; const t = (name, fn) => { fn(); n++; };
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);

// a Cboe replay frame in the route's real shape (js/smileCore.js reduceChain)
const smile = (atm, put, call, lo = -10, hi = 6) => { const p = []; for (let m = lo; m <= hi + 1e-9; m += 0.5) p.push([m, +(atm + (m < 0 ? -m * put : m * call) + 0.02 * m * m).toFixed(2)]); return p; };
const frame = { t: '2026-11-19', spot: 6650, curves: [
  { exp: '2026-11-20', dte: 1, n: 80, pts: smile(14, 2.4, 0.6), atm: 14, skew5: 9 },
  { exp: '2026-11-19', dte: 0, n: 60, pts: smile(12, 3, 0.8, -6, 4), atm: 12, skew5: 11 },
  { exp: '2026-11-24', dte: 5, n: 90, pts: smile(15, 1.8, 0.3), atm: 15, skew5: 7 },
  { exp: 'bad', dte: 7, n: 2, pts: [[0, 15]] },
] };

t('toPct: decimals become percent, percent stays, junk is null', () => {
  assert.deepEqual(toPct([0.071, 0.065, null, NaN, -1]), [7.1, 6.5, null, null, null]);
  assert.deepEqual(toPct([18.8, 19.2]), [18.8, 19.2]);
  assert.deepEqual(toPct(undefined), []);
});

t('interpAt: inside, ends, outside -> null', () => {
  const p = [[-1, 10], [0, 8], [2, 12]];
  near(interpAt(p, -0.5), 9); near(interpAt(p, 1), 10); near(interpAt(p, 2), 12);
  assert.equal(interpAt(p, 2.1), null); assert.equal(interpAt([], 0), null); assert.equal(interpAt(p, NaN), null);
});

t('fromCboeFrame: sorts by expiry, drops thin curves, keeps ATM', () => {
  const s = fromCboeFrame(frame, 'Thu 19 Nov');
  assert.equal(s.rows.length, 3); assert.deepEqual(s.rows.map(r => r.dte), [0, 1, 5]); assert.equal(s.rows[0].atm, 12); assert.equal(s.src, 'cboe');
  assert.equal(fromCboeFrame(null).rows.length, 0); assert.equal(fromCboeFrame({ curves: 'x' }).rows.length, 0);
});

// a CME store entry in the real shape (js/oi.js analyse output): ivSmile decimals with ivPrior, ivSmiles, ivTermStructure points in percent
const strikes = [], iv = [], ivPrior = []; for (let k = 1.13; k <= 1.20001; k += 0.0025) { const m = (k / 1.165 - 1) * 100; strikes.push(+k.toFixed(4)); iv.push(0.068 + 0.004 * m * m / 4 - 0.001 * m); ivPrior.push(0.066 + 0.004 * m * m / 4 - 0.001 * m); }
const cme = { spot: 1.165, dte: 15, ivSmile: { strikes, iv, ivPrior },
  ivSmiles: [{ code: 'EUU1', dte: 1, strikes: strikes.slice(8, 22), iv: iv.slice(8, 22).map(v => v - 0.01) }, { code: 'EUU2', dte: 2, strikes: strikes.slice(6, 24), iv: iv.slice(6, 24).map(v => v - 0.005) }, { code: 'dup', dte: 15, strikes, iv }],
  ivTermStructure: { points: [{ dte: 1, iv: 5.9, ivChg: 0.1 }, { dte: 15, iv: 6.8, ivChg: 0.2 }, { dte: 43, iv: 7.1, ivChg: -0.1 }, { dte: 71, iv: 7.3, ivChg: null }, { dte: 106, iv: 7.4, ivChg: 0 }] } };

t('fromOiEntry: chains + main smile + ATM-only term rows, prior matched by expiry', () => {
  const { now, prior } = fromOiEntry(cme);
  assert.deepEqual(now.rows.map(r => r.dte), [1, 2, 15, 43, 71, 106]);
  assert.deepEqual(now.rows.map(r => r.atmOnly), [false, false, false, true, true, true]);
  near(now.rows[2].atm, 6.8, 0.05);                                     // decimals became percent
  assert.equal(prior.rows.length, now.rows.length);
  assert.equal(prior.rows[0].atm, null);                                  // no prior for the near chains
  near(prior.rows[2].atm, 6.6, 0.05);                                     // ivPrior of the main smile
  near(prior.rows[3].atm, 7.2, 1e-9); assert.equal(prior.rows[4].atm, null);  // 7.1 - (-0.1); ivChg null -> no prior
});

t('fromOiEntry: missing spot / empty entry / no IV fail soft', () => {
  assert.deepEqual(fromOiEntry(null), { now: null, prior: null });
  assert.equal(fromOiEntry({ spot: 1.1 }).now, null); assert.equal(oiHasIV({ spot: 1.1 }), false); assert.equal(oiHasIV(cme), true);
  const onlyTerm = fromOiEntry({ spot: 100, ivTermStructure: { points: [{ dte: 5, iv: 20 }, { dte: 30, iv: 18 }] } });
  assert.equal(onlyTerm.now.rows.length, 2); assert.ok(onlyTerm.now.rows.every(r => r.atmOnly)); assert.equal(onlyTerm.prior, null);
});

t('fromOiEntry: thins ATM-only rows to MAX_ROWS, keeps first and last', () => {
  const pts = Array.from({ length: 30 }, (_, i) => ({ dte: 10 + i * 10, iv: 7 + i * 0.05 }));
  const s = fromOiEntry({ spot: 1.1, ivTermStructure: { points: pts } }).now;
  assert.equal(s.rows.length, MAX_ROWS); assert.equal(s.rows[0].dte, 10); assert.equal(s.rows.at(-1).dte, 300);
});

t('pickRange / pickScale: tidy, bounded, shared', () => {
  const s = fromCboeFrame(frame); const R = pickRange([s]);
  assert.equal(R, 6);                                                     // median of min(both sides): 4, 6, 6 -> 6
  assert.equal(pickRange([]), 5); assert.ok(pickRange([fromOiEntry(cme).now]) <= 3);
  const top = pickScale([s], R); assert.ok(top >= 20 && top % 5 === 0, String(top)); assert.equal(pickScale([], 5), 20);
});

t('wing25: symmetric-ish, widens with vol and time, null on junk', () => {
  const a = wing25(15, 30), b = wing25(15, 90), c = wing25(30, 30);
  assert.ok(a.put < 0 && a.call > 0); assert.ok(b.call > a.call && c.call > a.call);
  near(a.call, (Math.exp(0.6745 * 0.15 * Math.sqrt(30 / 365) + 0.5 * 0.15 * 0.15 * 30 / 365) - 1) * 100);
  assert.ok(wing25(15, 0).call > 0); assert.equal(wing25(null, 5), null); assert.equal(wing25(15, -1), null);
});

t('buildSurface: nulls outside the quote, wings read off the smile', () => {
  const S = buildSurface(fromCboeFrame(frame), 6);
  assert.equal(S.cols.length, NC); near(S.cols[0], -6); near(S.cols[NC - 1], 6); near(S.cols[20], 0);
  assert.equal(S.rows[0].iv[NC - 1], null);                                 // same-day chain only quoted to +4%
  assert.ok(S.rows[1].iv.every(v => v != null));
  assert.ok(S.rows[1].put25.iv > S.rows[1].call25.iv);                      // put skew
  const T = buildSurface(fromOiEntry(cme).now, 3);
  assert.ok(T.rows[3].atmOnly && T.rows[3].iv.every(v => v === null) && T.rows[3].put25 === null);
  assert.deepEqual(buildSurface(null, 5).rows, []);
});

t('lerpSurface: blends shared cells, one-sided cells switch at half-way, reuses out', () => {
  const A = buildSurface(fromCboeFrame(frame), 6), f2 = structuredClone(frame); f2.curves.forEach(c => { c.pts = c.pts.map(p => [p[0], p[1] + 2]); c.atm += 2; });
  const B = buildSurface(fromCboeFrame(f2), 6), o = lerpSurface(A, B, 0.5);
  near(o.rows[1].iv[20], A.rows[1].iv[20] + 1); near(o.rows[1].atm, A.rows[1].atm + 1);
  const P = buildSurface(fromOiEntry(cme).prior, 3), N = buildSurface(fromOiEntry(cme).now, 3);
  assert.equal(lerpSurface(P, N, 0.2).rows[0].atm, null); near(lerpSurface(P, N, 0.8).rows[0].atm, N.rows[0].atm);
  assert.equal(lerpSurface(A, B, 1, o), o); near(o.rows[0].iv[20], B.rows[0].iv[20]);
  assert.equal(lerpSurface(A, null, 0).rows.length, 3);
});

t('surfaceFacts + ivScript: plain words, no forecast words', () => {
  const f = surfaceFacts(buildSurface(fromCboeFrame(frame), 6));
  assert.equal(f.near.dte, 0); assert.equal(f.far.atm, 15); assert.equal(f.shape, 'upward'); assert.ok(f.skew > 0); assert.equal(f.skewWord, 'puts richer than calls'); assert.equal(f.skewDte, 1);
  const s = ivScript(f, 'S&P 500', 'the Cboe chain');
  assert.match(s, /upward/); assert.match(s, /puts are .* richer/); assert.match(s, /not a forecast/); assert.doesNotMatch(s, /\b(will|expect|target)\b/i);
  const inv = surfaceFacts({ rows: [{ dte: 1, atm: 30 }, { dte: 60, atm: 22 }] }); assert.equal(inv.shape, 'inverted'); assert.equal(inv.skew, null); assert.match(ivScript(inv, 'X'), /inverted/);
  assert.equal(surfaceFacts({ rows: [] }), null); assert.equal(ivScript(null, 'X'), null);
});

t('small helpers', () => {
  assert.deepEqual(recentDays(['2026-11-03', 'junk', '2026-10-20', '2026-11-19'], 2), ['2026-11-03', '2026-11-19']); assert.deepEqual(recentDays(null), []);
  assert.equal(rampPos(30, 20), 1); assert.equal(rampPos(10, 20), 0.5); assert.equal(rampPos(NaN, 20), 0);
  assert.equal(dteText(0), 'same day'); assert.equal(dteText(43), '43d');
});

t('dayLabel / volTicks', () => {
  assert.equal(dayLabel('2026-11-19'), 'Thu 19 Nov'); assert.equal(dayLabel('x'), 'x');
assert.deepEqual(volTicks(20), [5, 10, 15, 20]); assert.deepEqual(volTicks(8), [2, 4, 6, 8]); assert.deepEqual(volTicks(0), []);
});
console.log(`ivSurfaceCore: ${n} tests passed`);
