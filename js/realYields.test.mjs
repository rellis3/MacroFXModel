// node --test js/realYields.test.mjs: the real-yield layer (js/realYields.js): series normalised, changes in bp over prints, the
// nominal = real + breakeven split, the derived AU breakeven labelled as derived, UK shown as not available, nothing invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toRows, seriesRow, diffSeries, splitMove, splitText, buildRealYields, realLayerLines, RY_EVIDENCE, RY_NOTE } from './realYields.js';

const NOW = Date.parse('2026-11-28T12:00:00Z');
const dates = n => Array.from({ length: n }, (_, i) => new Date(Date.parse('2026-06-01T00:00:00Z') + i * 864e5).toISOString().slice(0, 10));
const D = dates(181);   // to 2026-11-28
const ser = f => D.map((d, i) => ({ date: d, value: f(i) }));

test('toRows: both shapes, junk dropped, sorted, one per date', () => {
  assert.deepEqual(toRows([['2026-01-02', 1.5, 1.4], { date: '2026-01-01', value: 1 }, { date: '2026-01-01', value: 1.1 }, ['bad', 2], { date: '2026-01-03', value: null }, { date: '2026-01-04', value: 'x' }]),
    [{ date: '2026-01-01', value: 1.1 }, { date: '2026-01-02', value: 1.5 }]);
  assert.deepEqual(toRows(null), []);
});

test('seriesRow: last value, bp changes over prints, percentile, staleness, missing', () => {
  const r = seriesRow(ser(i => 2 + i * 0.01), { id: 'X' }, NOW);
  assert.equal(r.value, 3.8); assert.equal(r.chg1dBp, 1); assert.equal(r.chg5dBp, 5); assert.equal(r.chg20dBp, 20);
  assert.equal(r.pct1y, 99); assert.equal(r.stale, false); assert.equal(r.spark.length, 60); assert.equal(r.id, 'X');
  const old = seriesRow([{ date: '2026-11-01', value: 1 }], { id: 'Y' }, NOW);
  assert.equal(old.stale, true); assert.equal(old.chg1dBp, null); assert.equal(old.pct1y, null);
  assert.deepEqual(seriesRow([], { id: 'Z' }, NOW), { id: 'Z', value: null, date: null, missing: true });
});

test('split: nominal = real + breakeven over 20 prints, the lead leg, a residual when FRED does not add up', () => {
  const real = ser(i => 2 + i * 0.002), bei = ser(i => 2.2 + i * 0.0005), nom = ser(i => 4.2 + i * 0.0025);
  const s = splitMove(nom, real, bei, 20);
  assert.equal(s.nominalBp, 5); assert.equal(s.realBp, 4); assert.equal(s.breakevenBp, 1); assert.equal(s.residualBp, 0); assert.equal(s.lead, 'real');
  assert.equal(splitText('US', '10y', s), 'US 10y: nominal +5bp over 20 prints = real +4bp + breakeven +1bp; most of the move was in the real yield.');
  const off = splitMove(ser(i => 4.2 + i * 0.0035), real, bei, 20); assert.equal(off.residualBp, 2);
  assert.equal(splitMove(ser(() => 4), ser(() => 2), ser(() => 2), 20).lead, null);
  assert.equal(splitMove(nom.slice(0, 10), real, bei, 20), null);
  assert.equal(splitText('US', '5y', null), null);
});

test('derived series only on shared dates', () => {
  assert.deepEqual(diffSeries([['2026-01-01', 4], ['2026-01-02', 4.1]], [['2026-01-02', 2]]), [{ date: '2026-01-02', value: 2.0999999999999996 }]);
});

test('the layer: six rows, the AU breakeven marked derived, UK not available, no trade words, the evidence ids', () => {
  const out = buildRealYields({ us: { real5: ser(() => 2.5), real10: ser(() => 2.7), bei5: ser(() => 2.1), bei10: ser(() => 2.2), nom5: ser(() => 4.6), nom10: ser(() => 4.9) },
    au: { real10: D.map(d => [d, 1.9]), nom10: D.map(d => [d, 4.4]) } }, { now: NOW });
  assert.equal(out.ok, true); assert.equal(out.asOf, '2026-11-28'); assert.equal(out.rows.length, 6); assert.deepEqual(out.missing, []);
  const au = out.rows.find(r => r.id === 'AU_BEI_10Y'); assert.equal(au.derived, true); assert.equal(au.value, 2.5); assert.match(au.source, /derived here/);
  assert.equal(out.uk.available, false);
  assert.equal(out.splits.length, 2); assert.ok(out.splits.every(s => s.text));
  assert.deepEqual(RY_EVIDENCE, ['broken-link-resolution', 'which-gold', 'cog-spread-direction', 'yield-ladder-nq']);
  for (const s of [RY_NOTE, ...out.splits.map(x => x.text)]) assert.doesNotMatch(s, /\b(buy|sell|long|short|signal to|will rise|will fall)\b/i);
  const none = buildRealYields({}, { now: NOW });
  assert.equal(none.ok, false); assert.equal(none.missing.length, 6); assert.ok(none.splits.every(s => s.missing && s.text === null));
});

test('the route: one build cached, AU from the R2 archive, a failed R2 read is a missing row, not an error', async () => {
  const { mountRealYields } = await import('./realYieldsRoutes.js');
  const routes = {}; let builds = 0, t = NOW;
  const us = { real5: ser(() => 2.5), real10: ser(() => 2.7), bei5: ser(() => 2.1), bei10: ser(() => 2.2), y5: ser(() => 4.6), y10: ser(() => 4.9) };
  const h = mountRealYields({ get: (p, f) => { routes[p] = f; } }, { now: () => t, chapters: async () => { builds++; return us; }, r2Ok: () => true,
    r2GetJSON: async k => { if (k.endsWith('AU_10Y_REAL.json')) return { points: D.map(d => [d, 1.9]) }; throw new Error('no such key'); } });
  let out; await routes['/api/real-yields']({}, { set() {}, json: j => { out = j; }, status() { return this; } });
  assert.equal(out.ok, true); assert.equal(out.rows.find(r => r.id === 'AU_REAL_10Y').value, 1.9); assert.deepEqual(out.missing, ['AU_BEI_10Y']);
  await h.get(); t += 30 * 60e3; await h.get(); assert.equal(builds, 1);
  t += 61 * 60e3; await h.get(); assert.equal(builds, 2);
});

test('the terminal card: folded behind a toggle, derived and stale marked, escaped, nothing when not landed', async () => {
  const { boardHtml, sparkSvg } = await import('./terminal/realYieldsView.js');
  assert.equal(boardHtml(undefined), '');
  assert.match(boardHtml({ ok: false, error: 'down <x>' }), /down &lt;x&gt;/);
  const ry = buildRealYields({ us: { real10: ser(() => 2.7), bei10: ser(() => 2.2), nom10: ser(i => 4.9 + i * 0.001) }, au: { real10: [['2026-11-01', 1.9]], nom10: [['2026-11-01', 4.4]] } }, { now: NOW });
  const h = boardHtml(ry);
  assert.match(h, /^<div class="card"><details>/); assert.doesNotMatch(h, /<details open/);
  assert.ok(h.includes('derived') && h.includes('27d old') && h.includes('not loaded') && h.includes('Nominal = real + breakeven'));
  assert.match(boardHtml(ry, { open: true }), /<details open>/);
  assert.equal(sparkSvg([1]), ''); assert.match(sparkSvg([1, 2, 3]), /<polyline/);
});

test('the Helix Yields panel lines: one per row, the splits, UK not captured, nothing when not ok', () => {
  assert.deepEqual(realLayerLines(null), []); assert.deepEqual(realLayerLines({ ok: false }), []);
  const ry = buildRealYields({ us: { real10: ser(i => 2 + i * 0.001), bei10: ser(() => 2.2), nom10: ser(i => 4.2 + i * 0.001) } }, { now: NOW });
  const L = realLayerLines(ry);
  assert.equal(L.length, 1 + 6 + 1 + 1);
  assert.match(L[2].text, /^US 10y TIPS real yield 2\.18% · 20 prints \+2bp · 1y pct 99$/);
  assert.match(L[1].text, /not loaded/); assert.match(L.at(-1).text, /UK linkers: not captured/);
  for (const l of L) assert.doesNotMatch(l.text, /\b(buy|sell|long|short)\b/i);
});
