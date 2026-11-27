// Tests for js/calendarAhead.js.   node --test js/calendarAhead.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { impactIndex, rateRow, forwardEvents } from './calendarAhead.js';

// ForexFactory's names and ratings as the surprise store keeps them (EUR prints filed under EU, member state in the title)
const ff = [
  ['US', 'Non-Farm Employment Change', 'high'], ['US', 'Unemployment Rate', 'high'], ['US', 'ADP Non-Farm Employment Change', 'medium'],
  ['US', 'ISM Manufacturing PMI', 'high'], ['US', 'ISM Services PMI', 'high'], ['US', 'Average Hourly Earnings m/m', 'high'],
  ['EU', 'German Prelim CPI m/m', 'high'], ['EU', 'German Retail Sales m/m', 'low'], ['JP', 'Retail Sales y/y', 'low'],
  ['AU', 'GDP q/q', 'high'], ['AU', 'Cash Rate', 'high'], ['CA', 'Employment Change', 'high'], ['CA', 'Unemployment Rate', 'high'],
].map(([country, event, impact], i) => ({ country, event, impact, ms: Date.parse('2026-06-01T00:00:00Z') + i }));
// a Nasdaq-sourced row with Nasdaq's name and a guessed rating: not an index entry
const store = [...ff, { country: 'JP', event: 'Large Scale Retail Sales YoY', impact: 'high', ms: Date.parse('2026-06-02T00:00:00Z'), src: 'nasdaq' },
  { country: 'US', event: 'Unemployment Rate', impact: 'high', ms: Date.parse('2024-01-01T00:00:00Z') }];
const idx = impactIndex(store, { since: Date.parse('2025-04-05T00:00:00Z') });

test('the index keeps ForexFactory rows from `since`, not Nasdaq-named ones', () => {
  assert.ok(idx.US.some(x => x.name === 'Non-Farm Employment Change'));
  assert.ok(!idx.JP.some(x => /large scale/i.test(x.name)));
});

test('rateRow: vendor names map, qualifiers and regional prints do not pass as the headline release', () => {
  const r = (country, event) => rateRow({ country, event }, idx);
  assert.equal(r('United States', 'Nonfarm Payrolls').name, 'Non-Farm Employment Change');
  assert.equal(r('United States', 'Nonfarm Payrolls').impact, 'high');
  assert.equal(r('United States', 'ADP Nonfarm Employment Change').name, 'ADP Non-Farm Employment Change', 'ADP is not payrolls');
  assert.equal(r('United States', 'ISM Non-Manufacturing PMI').name, 'ISM Services PMI');
  assert.equal(r('United States', 'U6 Unemployment Rate'), null);
  assert.equal(r('United States', 'Private Nonfarm Payrolls'), null);
  assert.equal(r('Germany', 'German CPI').name, 'German Prelim CPI m/m');
  assert.equal(r('Germany', 'Bavaria CPI'), null, 'a state CPI is not the German print');
  assert.equal(r('Germany', 'Retail Sales').name, 'German Retail Sales m/m', 'the member state is put in front, as ForexFactory names it');
  assert.equal(r('Japan', 'Large Scale Retail Sales YoY'), null);
  assert.equal(r('Australia', 'RBA Interest Rate Decision').name, 'Cash Rate');
  assert.equal(r('Brazil', 'CPI'), null, 'not a gate country');
});

test('forwardEvents: the /api/events shape, rated, one row per release and time, future only', () => {
  const now = Date.parse('2026-11-27T20:00:00Z'), T = Date.parse('2026-12-04T13:30:00Z');
  const row = (country, event, consensus = '', ms = T, released = false) => ({ ms, country, event, released, raw: { consensus, previous: '60K' } });
  const out = forwardEvents([row('United States', 'Nonfarm Payrolls', '50K'), row('United States', 'Nonfarm Payrolls', ''), row('United States', 'U6 Unemployment Rate'),
    row('Canada', 'Employment Change', '10K'), row('United States', 'Nonfarm Payrolls', '50K', now - 864e5), row('Germany', 'Bavaria CPI')], idx, { now });
  assert.equal(out.length, 2);
  assert.deepEqual(out.map(e => [e.country, e.event, e.impact, e.estimate]), [['US', 'Nonfarm Payrolls', 'high', '50K'], ['CA', 'Employment Change', 'high', '10K']]);
  assert.equal(out[0].time, '2026-12-04 13:30:00'); assert.equal(out[0].actual, null); assert.equal(out[0].source, 'nasdaq');
});
