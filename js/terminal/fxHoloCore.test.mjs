// Tests for js/terminal/fxHoloCore.js (the FX MATRIX hologram's maths). Run: node js/terminal/fxHoloCore.test.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { holoModel, windowState, heightOf, blendInto, ccyCard, placeLabels, fxgridScript, defaultWindow, shortestWindow, PER_SIGMA, CAP_SIGMA, sg } from './fxHoloCore.js';

const C = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
const hz = vals => { const m = vals.reduce((a, b) => a + b, 0) / 8; const s = vals.map((x, i) => ({ ccy: C[i], score: Math.round((x - m) * 100) / 100 })).sort((a, b) => b.score - a.score).map((x, i) => ({ ...x, rank: i + 1 }));
  return { available: true, flat: false, from: '2026-11-20T13:00:00Z', to: '2026-11-20T14:00:00Z', pairs: 28, unitPct: 0.08, scores: s, leader: s[0].ccy, laggard: s[7].ccy, spread: s[0].score - s[7].score }; };
// the real /api/ccy-strength shape (js/ccyStrengthCore.js buildStrength)
const P = { ok: true, asOf: '2026-11-20T14:00:00Z', closed: false, closeLabel: null, unit: 'σ', horizons: {
  '1H': hz([0.4, -0.2, 0.1, -1.3, 0.9, 0.2, -0.3, 0.2]), '4H': hz([0.8, -0.5, 0.3, -1.9, 1.2, 0.1, -0.2, 0.2]), '1D': hz([1.1, -0.6, 0.4, -2.1, 0.9, 0.3, 0.6, -0.6]),
  '1W': { available: false, reason: 'only 9 of 28 pairs had prices and a normal move for 1W', pairs: 9 } } };

test('model reads the real payload shape and keeps unavailable windows with their reason', () => {
  const m = holoModel(P); assert.equal(m.ok, true); assert.deepEqual(m.windows.map(w => w.key), ['1H', '4H', '1D', '1W']);
  assert.equal(m.windows[3].available, false); assert.match(m.windows[3].reason, /9 of 28/);
  assert.equal(m.score['1H'].CHF, P.horizons['1H'].scores[0].score); assert.equal(m.rank['1D'].USD, 1);
  assert.equal(defaultWindow(m), '1D'); assert.equal(shortestWindow(m), '1H');
});
test('bad payloads fail soft, never throw', () => {
  for (const p of [null, undefined, {}, { ok: false, error: 'no bars yet' }, { ok: true }, { ok: true, horizons: null }, { ok: true, horizons: { '1H': { available: true, scores: 'x' } } }]) {
    const m = holoModel(p); assert.equal(typeof m.ok, 'boolean');
    if (m.ok) { assert.equal(windowState(m, '1H'), null); assert.equal(fxgridScript(m), null); } else assert.ok(m.error);
  }
  assert.equal(holoModel({ ok: false, error: 'no bars yet' }).error, 'no bars yet');
  assert.equal(windowState(null, '1H'), null); assert.equal(ccyCard(null, '1H', 'USD'), null); assert.equal(defaultWindow(null), null);
});
test('window state: strength order, biggest gap = leader over laggard = spread, antisymmetric cells', () => {
  const m = holoModel(P), w = windowState(m, '1D');
  assert.equal(w.order[0], 'USD'); assert.equal(w.order[7], 'JPY'); assert.equal(w.idx.USD, 0);
  assert.equal(w.biggest.a, 'USD'); assert.equal(w.biggest.b, 'JPY'); assert.ok(Math.abs(w.biggest.v - P.horizons['1D'].spread) < 1e-9);
  for (const a of C) for (const b of C) assert.ok(Math.abs((w.score[a] - w.score[b]) + (w.score[b] - w.score[a])) < 1e-12);
  assert.equal(windowState(m, '1W'), null);
});
test('missing and NaN scores sit at zero at the end and are listed as missing', () => {
  const p = JSON.parse(JSON.stringify(P)); p.horizons['1H'].scores = p.horizons['1H'].scores.filter(s => s.ccy !== 'NZD'); p.horizons['1H'].scores[2].score = NaN;
  const m = holoModel(p), w = windowState(m, '1H'); assert.ok(w.missing.includes('NZD')); assert.equal(w.score.NZD, 0); assert.equal(w.order.at(-1) === 'NZD' || w.missing.includes(w.order.at(-1)), true);
  const card = ccyCard(m, '1H', 'NZD'); assert.equal(card.score, null);
});
test('flat window: no biggest gap, the script says flat', () => {
  const p = JSON.parse(JSON.stringify(P)); for (const k of ['1H', '4H', '1D']) { p.horizons[k].flat = true; p.horizons[k].scores.forEach(s => { s.score = 0; }); }
  const m = holoModel(p); assert.equal(windowState(m, '1H').biggest, null); assert.match(fxgridScript(m), /barely moved/); assert.match(fxgridScript(m), /not a forecast/);
});
test('heights are linear in sigma, signed, and capped with a flag', () => {
  assert.equal(heightOf(1).h, PER_SIGMA); assert.equal(heightOf(-2).h, -2 * PER_SIGMA); assert.equal(heightOf(2).h, 2 * heightOf(1).h);
  assert.deepEqual(heightOf(CAP_SIGMA + 3), { h: CAP_SIGMA * PER_SIGMA, capped: true }); assert.equal(heightOf(-(CAP_SIGMA + 1)).capped, true); assert.equal(heightOf(CAP_SIGMA).capped, false);
  assert.deepEqual(heightOf(NaN), { h: 0, capped: false }); assert.deepEqual(heightOf(null), { h: 0, capped: false });
  // smooth: no jump just under / over 1 sigma
  assert.ok(Math.abs(heightOf(1.0001).h - heightOf(0.9999).h) < 1e-3);
});
test('blend moves slots and scores linearly between windows', () => {
  const m = holoModel(P), a = windowState(m, '1H'), b = windowState(m, '1D'), out = { idx: {}, score: {} };
  blendInto(out, a, b, 0, C); assert.equal(out.idx.CHF, a.idx.CHF); blendInto(out, a, b, 1, C); assert.equal(out.score.USD, b.score.USD);
  blendInto(out, a, b, 0.5, C); assert.ok(Math.abs(out.score.JPY - (a.score.JPY + b.score.JPY) / 2) < 1e-12);
  blendInto(out, null, b, 0.3, C); assert.equal(out.score.USD, b.score.USD);
});
test('card: strongest and weakest pairs for a currency', () => {
  const m = holoModel(P), c = ccyCard(m, '1D', 'CHF');
  assert.equal(c.rank, 2); assert.equal(c.outran[0].ccy, 'JPY'); assert.equal(c.lagged[0].ccy, 'USD'); assert.ok(c.outran[0].v > c.outran[1].v); assert.ok(c.lagged.every(x => x.v < 0));
  const top = ccyCard(m, '1D', 'USD'); assert.equal(top.lagged.length, 0); assert.equal(top.outran.length, 2);
  assert.equal(ccyCard(m, '1D', 'XYZ'), null);
});
test('labels never overlap; higher priority wins; out-of-bounds dropped', () => {
  const it = [{ x: 10, y: 10, w: 60, h: 14, pri: 1 }, { x: 20, y: 12, w: 60, h: 14, pri: 5 }, { x: 15, y: 11, w: 60, h: 14, pri: 3 }, { x: 15, y: 11, w: 60, h: 14, pri: 0 }, { x: 990, y: 5, w: 60, h: 14, pri: 9 }];
  placeLabels(it, { W: 1000, H: 200, tries: 1 });
  const shown = it.filter(x => x.show); assert.equal(it[1].show, true); assert.equal(it[1].y, 12); assert.equal(it[4].show, false);
  for (const a of shown) for (const b of shown) if (a !== b) assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));
});
test('script: plain words, rounded, no forecast wording', () => {
  const t = fxgridScript(holoModel(P));
  assert.match(t, /^Over the last hour, the Swiss franc is the strongest/); assert.match(t, /the yen the weakest/); assert.match(t, /2\.2 times a usual move/); assert.match(t, /not a forecast/);
  assert.doesNotMatch(t, /\bwill\b|expect|target|signal/i); assert.ok(t.split(/\s+/).length < 75);
  assert.equal(sg(1.234), '+1.2'); assert.equal(sg(-0.01), '0.0'); assert.equal(sg(undefined), 'n/a');
});
