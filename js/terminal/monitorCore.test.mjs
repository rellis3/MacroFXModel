// node --test js/terminal/monitorCore.test.mjs: the Monitor's pure rules (list cleaning, change, age, next release, rows, sort, export table).
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanItems, sanitizeStore, lastAndChange, ageOf, nextEventFor, dawnOf, buildRows, sortRows, rowsToTable, fmtPrice, fmtPct, COLUMNS, inWords, eventCcys, STARTERS, isKnown } from './monitorCore.js';

test('starters are all known markets; cleanItems keeps known, upper-cased, de-duplicated', () => {
  for (const s of STARTERS) assert.ok(s.items.every(isKnown), s.name);
  assert.deepEqual(cleanItems(['eurusd', ' nq ', 'EURUSD', 'zzz', '']).items, ['EURUSD', 'NQ']);
  assert.deepEqual(cleanItems(['eurusd', 'zzz']).dropped, ['ZZZ']);
  assert.deepEqual(cleanItems('nope').items, []);
});
test('sanitizeStore drops bad names, starter names, empty lists and repeats', () => {
  const r = sanitizeStore({ lists: [{ name: 'A', items: ['NQ'] }, { name: 'a', items: ['GOLD'] }, { name: 'FX majors', items: ['NQ'] }, { name: 'E', items: ['zzz'] }, { name: '', items: ['NQ'] }] });
  assert.deepEqual(r.lists.map(l => l.name), ['A']);
});
test('change is against the close 24h before the latest bar; a forming last bar is used as the last price', () => {
  const bars = [{ time: 0, close: 100 }, { time: 43200, close: 101 }, { time: 86400, close: 102 }, { time: 90000, close: 105, forming: true }];
  const r = lastAndChange(bars);
  assert.equal(r.last, 105); assert.equal(r.at, 90000 * 1000);
  assert.ok(Math.abs(r.chgPct - 5) < 1e-9, 'reference = last bar at or before last.time - 86400 (the time-0 bar, 100)');
  assert.equal(lastAndChange([]).last, null);
  assert.equal(lastAndChange([{ time: 5, close: 1 }]).chgPct, null, 'no bar 24h back = no change, not zero');
});
test('age states: shut when closed, fresh under 10 minutes, amber under an hour, red after', () => {
  const now = 1e12;
  assert.equal(ageOf(now - 5 * 6e4, now, false).state, 'fresh');
  assert.equal(ageOf(now - 30 * 6e4, now, false).state, 'amber');
  assert.equal(ageOf(now - 120 * 6e4, now, false).state, 'red');
  assert.equal(ageOf(now - 120 * 6e4, now, true).state, 'shut');
  assert.equal(ageOf(null, now, false).state, 'none');
});
test('next release: both legs of a pair, USD for indices, high impact only, past ones skipped', () => {
  const now = Date.parse('2026-11-16T09:00:00Z');
  const ev = [{ country: 'JP', event: 'BoJ minutes', impact: 'High', ms: now + 36e5 }, { country: 'US', event: 'CPI', impact: 'High', ms: now + 5 * 36e5 }, { country: 'GB', event: 'GDP', impact: 'Low', ms: now + 60000 }, { country: 'GB', event: 'old', impact: 'High', ms: now - 36e5 }];
  assert.equal(nextEventFor('USDJPY', ev, now).label, 'BoJ minutes');
  assert.equal(nextEventFor('NQ', ev, now).label, 'CPI');
  assert.equal(nextEventFor('GBPAUD', ev, now), null);
  assert.deepEqual(eventCcys('EURUSD'), ['EUR', 'USD']); assert.deepEqual(eventCcys('GOLD'), ['USD']);
  assert.equal(inWords(now + 90 * 6e4, now), 'in 2h'); assert.equal(inWords(now + 10 * 6e4, now), 'in 10m');
});
test('the morning read is a word and a share, two-way near 50%, null with no live inputs', () => {
  assert.deepEqual(dawnOf({ direction: { story: { nLive: 3, pUp: 0.62 } } }), { word: 'Up', pct: 62, sign: 1 });
  assert.equal(dawnOf({ direction: { story: { nLive: 3, pUp: 0.4 } } }).word, 'Down');
  assert.equal(dawnOf({ direction: { story: { nLive: 3, pUp: 0.51 } } }).word, 'Two-way');
  assert.equal(dawnOf({ direction: { story: { nLive: 0, pUp: 0.9 } } }), null);
  assert.equal(dawnOf(null), null);
});
const bars = t => ({ bars: [{ time: 0, close: 1.1 }, { time: 86400, close: 1.11 }], asOf: t });
test('buildRows joins the sources, shows nothing invented for a market a source does not cover', () => {
  const now = 86400 * 1000 + 5 * 6e4;
  const vc = { tiles: [{ sym: 'EURUSD', ratio: 1.2, tag: 'continue', clock: { mode: 'live', used: 0.73 } }] };
  const rows = buildRows({ items: ['EURUSD', 'GBPUSD'], bars: { EURUSD: bars(now), GBPUSD: bars(now) }, vc, global: { cards: {} }, events: [], now, closed: false });
  assert.equal(rows[0].used, 0.73); assert.equal(rows[0].ratio, 1.2); assert.equal(rows[0].tag, 'continue');
  assert.equal(rows[1].used, null); assert.equal(rows[1].ratio, null); assert.match(rows[1].why.used, /does not cover/);
  assert.ok(rows[0].chgPct > 0.9 && rows[0].chgPct < 0.92);
  assert.equal(buildRows({ items: ['NQ'], now: 1 })[0].last, null, 'no bars = no price');
});
test('sort puts empty values last in both directions and sorts text and numbers', () => {
  const rows = [{ inst: 'B', chgPct: 1, last: 2, used: null, ratio: null, age: { min: 3 } }, { inst: 'A', chgPct: -1, last: 1, used: 0.5, ratio: 1, age: { min: 1 } }, { inst: 'C', chgPct: null, last: 3, used: 0.9, ratio: 2, age: { min: 2 } }];
  assert.deepEqual(sortRows(rows, 'chg', 1).map(r => r.inst), ['A', 'B', 'C']);
  assert.deepEqual(sortRows(rows, 'chg', -1).map(r => r.inst), ['B', 'A', 'C']);
  assert.deepEqual(sortRows(rows, 'used', -1).map(r => r.inst), ['C', 'A', 'B']);
  assert.deepEqual(sortRows(rows, 'inst', 1).map(r => r.inst), ['A', 'B', 'C']);
  assert.equal(sortRows(rows, 'nope', 1).length, 3);
});
test('formatting and the export table carry the same columns as the screen', () => {
  assert.equal(fmtPrice(1.10216), '1.10216'); assert.equal(fmtPrice(25123.45), '25,123.5'); assert.equal(fmtPrice(null), '–');
  assert.equal(fmtPct(0.456), '+0.46%'); assert.equal(fmtPct(-1), '−1.00%');
  const rows = buildRows({ items: ['EURUSD'], bars: { EURUSD: bars(0) }, now: 86400000, closed: true });
  const t = rowsToTable(rows);
  assert.equal(t.head.length, COLUMNS.length); assert.equal(t.body[0].length, COLUMNS.length);
});
test('every column has help words (the header tooltips and the command line read them)', () => { for (const c of COLUMNS) assert.ok(c.label && c.help.length > 20, c.id); });
