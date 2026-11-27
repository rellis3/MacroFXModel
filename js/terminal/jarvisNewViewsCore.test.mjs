import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flipRows, flipHeadline, flipScale, latestCapture, niceTicks, rangePoints, scatterFrame, rangeHeadline, londonClock, bucketDay, slotScale, placePylons, dayHeadline, SLOTS } from './jarvisNewViewsCore.js';

const prof = spot => [-3, -2, -1, 0, 1, 2, 3].map(k => ({ strike: spot * (1 + k / 100), callOI: k > 0 ? 100 : 20, putOI: k < 0 ? 100 : 20, netGex: k }));
const entry = (spot, flip, savedAt = '2026-11-26T22:00:00Z') => ({ spot, gammaFlip: flip, gexProfile: prof(spot), savedAt });

test('flipRows: distance in % of spot, above/below, sorted, usual-range units, no-flip counted', () => {
  const store = { 'NAS100_USD': entry(20000, 19800), 'EUR/USD': entry(1.10, 1.111), 'XAU/USD': { spot: 2600, gexProfile: prof(2600) } };
  const f = flipRows(store, { NQ: { forecast: { hl_median: 1.0 } } });
  assert.equal(f.rows.length, 2);
  assert.equal(f.rows[0].key, 'NQ'); assert.ok(Math.abs(f.rows[0].dist - 1) < 1e-9); assert.equal(f.rows[0].above, true); assert.ok(Math.abs(f.rows[0].units - 1) < 1e-9);
  assert.equal(f.rows[1].key, 'EURUSD'); assert.equal(f.rows[1].above, false); assert.equal(f.rows[1].units, null);
  assert.deepEqual(f.noFlip, ['GOLD']);
});

test('flipHeadline keeps the amplified wording and the capture date', () => {
  const h = flipHeadline({ rows: [{ above: true, savedAt: '2026-11-25' }, { above: false, savedAt: '2026-11-26T01:00Z' }] });
  assert.equal(h.hero, '1 of 2 above flip'); assert.match(h.sub, /amplified/); assert.equal(h.asOf, 'OI capture 2026-11-26');
  assert.equal(flipHeadline({ rows: [] }), null);
  assert.equal(latestCapture([{ savedAt: null }]), null);
});

test('flipScale rounds up to a nice step', () => {
  assert.equal(flipScale([]), 0.5); assert.equal(flipScale([{ dist: -1.4 }]), 2); assert.equal(flipScale([{ dist: 7 }]), 8); assert.equal(flipScale([{ dist: 70 }]), 70);
});

test('niceTicks: 0 to at least hi in nice steps', () => {
  const t = niceTicks(1.7, 5); assert.ok(t.max >= 1.7); assert.equal(t.ticks[0], 0); assert.equal(t.ticks.at(-1), t.max); assert.ok(t.ticks.length >= 3 && t.ticks.length <= 7);
  assert.deepEqual(niceTicks(0).ticks.length > 1, true);
  assert.equal(niceTicks(10, 5).step, 2);
});

test('rangePoints and frame: used = hl / hl_median, shared scale, sorted by used', () => {
  const p = rangePoints({ A: { hl: 0.5, forecast: { hl_median: 1 } }, B: { hl: 1.5, forecast: { hl_median: 1 } }, C: { error: 'x' }, D: { hl: 1, forecast: {} } });
  assert.deepEqual(p.map(x => x.key), ['B', 'A']); assert.equal(p[0].used, 1.5);
  const f = scatterFrame(p); assert.ok(f.max >= 1.5);
  const h = rangeHeadline(p, 'LAST SESSION'); assert.equal(h.hero, '1 of 2 past their usual range'); assert.equal(h.asOf, 'LAST SESSION');
  assert.equal(rangeHeadline([]), null);
});

test('londonClock handles GMT and BST', () => {
  assert.deepEqual(londonClock(Date.parse('2026-01-15T09:30:00Z')), { date: '2026-01-15', mins: 570 });
  assert.deepEqual(londonClock(Date.parse('2026-07-15T09:30:00Z')), { date: '2026-07-15', mins: 630 });
  assert.deepEqual(londonClock(Date.parse('2026-07-14T23:30:00Z')), { date: '2026-07-15', mins: 30 });
});

test('bucketDay: London slots, % of the first open, other days dropped, DST autumn hour merges', () => {
  const s = iso => Date.parse(iso) / 1000;
  const b = bucketDay([{ t: s('2026-07-14T23:00:00Z'), o: 100, c: 101 }, { t: s('2026-07-15T07:15:00Z'), o: 101, c: 100 }, { t: s('2026-07-14T10:00:00Z'), o: 50, c: 60 }]);
  assert.equal(b.date, '2026-07-15'); assert.equal(b.n, 2); assert.equal(b.move.length, SLOTS);
  assert.ok(Math.abs(b.move[0] - 1) < 1e-9);                       // 00:00 London (23:00 UTC in BST)
  assert.ok(Math.abs(b.move[33] + 1) < 1e-9);                      // 08:15 London
  assert.ok(Number.isNaN(b.move[1])); assert.equal(b.last, 33); assert.ok(Math.abs(b.total - 0) < 1e-9);
  // 25 Oct 2026: clocks go back at 02:00 BST -> 01:00 GMT, so 01:00-01:15 London happens twice
  const d = bucketDay([{ t: s('2026-10-25T00:00:00Z'), o: 100, c: 100.5 }, { t: s('2026-10-25T01:00:00Z'), o: 100.5, c: 101 }], '2026-10-25');
  assert.equal(d.n, 2); assert.ok(Math.abs(d.move[4] - 1) < 1e-9);
  assert.equal(bucketDay([]).n, 0);
  assert.equal(slotScale(b.move), 1); assert.equal(slotScale(new Float64Array(3).fill(NaN)), 0.02);
});

test('placePylons: positions, rank filter, label lanes never overlap', () => {
  const p = placePylons([{ mins: 810, rank: 3, ccy: 'usd', name: 'Non-Farm Employment Change' }, { mins: 815, rank: 3, ccy: 'cad', name: 'Jobs' }, { mins: 60, rank: 1, ccy: 'jpy', name: 'x' }, { mins: 1500, rank: 3 }], 0, 1440, { gap: 40 });
  assert.equal(p.length, 2); assert.equal(p[0].x, 810); assert.notEqual(p[0].lane, p[1].lane);
  assert.match(p[0].label, /^USD Non-Farm Emp/); assert.ok(p[0].label.endsWith('…'));
});

test('dayHeadline', () => {
  const b = { n: 2, date: '2026-11-27', total: -0.4, move: Float64Array.from([0.1, -0.5, NaN]) };
  const h = dayHeadline(b, 'NQ'); assert.equal(h.hero, 'NQ −0.40%'); assert.match(h.sub, /1 quarter-hours up, 1 down/); assert.equal(dayHeadline(null, 'NQ'), null);
});
