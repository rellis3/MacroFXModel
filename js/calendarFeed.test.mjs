import assert from 'node:assert/strict';
import { parseForexFactory, parseNasdaq, upcoming, printed, calendarHealth, num } from './calendarFeed.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const NOW = Date.UTC(2026, 8, 23, 12, 0);

t('ForexFactory rows keep their impact rating, which is the only reason to use it', () => {
  const rows = parseForexFactory([
    { title: 'Employment Change', country: 'AUD', date: '2026-09-24T01:30:00+00:00', impact: 'High', forecast: '20K', previous: '15K' },
    { title: 'Flash PMI', country: 'EUR', date: '2026-09-24T08:00:00+00:00', impact: 'Medium' },
    { title: 'Bank Holiday', country: 'JPY', date: '2026-09-25T00:00:00+00:00', impact: 'Holiday' },
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].rank, 3); assert.equal(rows[1].rank, 2); assert.equal(rows[2].rank, 0);
  assert.equal(rows[0].ccy, 'AUD');
  assert.equal(rows[0].forecast, '20K');
});

t('a row with an unreadable date is dropped, not defaulted to now', () => {
  const rows = parseForexFactory([
    { title: 'Good', country: 'USD', date: '2026-09-24T12:00:00+00:00', impact: 'High' },
    { title: 'Bad', country: 'USD', date: 'sometime tuesday', impact: 'High' },
    { title: 'Missing', country: 'USD', impact: 'High' },
  ]);
  assert.deepEqual(rows.map(r => r.event), ['Good'],
    'a release at the wrong time is worse than a missing one, because it gets trusted');
});

t('Nasdaq rows carry actual vs consensus, and the surprise is their difference', () => {
  const rows = parseNasdaq({ data: { rows: [
    { gmt: '01:00', country: 'Singapore', eventName: 'Core CPI', actual: '2.20%', consensus: '2.00%', previous: '1.90%' },
    { gmt: '13:30', country: 'United States', eventName: 'Jobless Claims', actual: '206K', consensus: '210K', previous: '203K' },
  ] } }, '2026-09-24');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].actual, 2.2); assert.equal(rows[0].consensus, 2.0);
  assert.ok(Math.abs(rows[0].surprise - 0.2) < 1e-9);
  // 206K is not a bare number: it is left unscored rather than mangled into 206
  assert.equal(rows[1].actual, null);
  assert.equal(rows[1].surprise, null);
  assert.equal(rows[1].raw.actual, '206K', 'but the raw string is kept for display');
});

t('numbers parse with their unit, and anything ambiguous returns null', () => {
  assert.equal(num('2.20%'), 2.2); assert.equal(num('-0.20%'), -0.2);
  assert.equal(num('55.7'), 55.7); assert.equal(num('1,234'), 1234);
  for (const bad of ['', null, undefined, '206K', '1.2-3.4', 'n/a', '—']) assert.equal(num(bad), null, `${bad} should not parse`);
});

t('upcoming keeps high impact only, drops the past, and groups by day', () => {
  const ff = parseForexFactory([
    { title: 'Past', country: 'USD', date: '2026-09-20T12:00:00+00:00', impact: 'High' },
    { title: 'Soon', country: 'CHF', date: '2026-09-24T07:30:00+00:00', impact: 'High' },
    { title: 'Soon', country: 'CHF', date: '2026-09-24T07:30:00+00:00', impact: 'High' },   // the feed does this
    { title: 'Low impact', country: 'EUR', date: '2026-09-24T09:00:00+00:00', impact: 'Low' },
    { title: 'Later', country: 'USD', date: '2026-09-28T12:30:00+00:00', impact: 'High' },
    { title: 'Too far', country: 'USD', date: '2026-11-01T12:30:00+00:00', impact: 'High' },
  ]);
  const days = upcoming(ff, NOW, { days: 7, minRank: 3 });
  assert.deepEqual(days.map(d => d.date), ['2026-09-24', '2026-09-28']);
  assert.equal(days[0].n, 1, 'the duplicate is collapsed');
  assert.equal(days[0].imminent, true);
  assert.equal(days[1].imminent, false);
});

t('printed ranks by the size of the surprise, and keeps the unscored', () => {
  const rows = parseNasdaq({ data: { rows: [
    { gmt: '09:00', country: 'US', eventName: 'Small miss', actual: '1.1', consensus: '1.0' },
    { gmt: '10:00', country: 'US', eventName: 'Big miss', actual: '3.0', consensus: '1.0' },
    { gmt: '11:00', country: 'US', eventName: 'No consensus', actual: '5.0', consensus: '' },
    { gmt: '12:00', country: 'US', eventName: 'Not out yet', actual: '', consensus: '2.0' },
  ] } }, '2026-09-23');
  const p = printed(rows);
  assert.equal(p.n, 3, 'only released rows count');
  assert.equal(p.scored, 2);
  assert.deepEqual(p.rows.map(r => r.event), ['Big miss', 'Small miss', 'No consensus'],
    'biggest surprise first, unscored last rather than dropped');
});

t('both feeds silent is BAD, and says UNKNOWN rather than clear', () => {
  assert.equal(calendarHealth(null, null).state, 'bad');
  assert.match(calendarHealth(null, null).detail, /UNKNOWN, not clear/);
  assert.equal(calendarHealth([], []).state, 'bad');
  assert.match(calendarHealth([], []).detail, /UNKNOWN, not clear/);
  // one working is a warning, both working is fine
  assert.equal(calendarHealth([{}], []).state, 'warn');
  assert.equal(calendarHealth([], [{}]).state, 'warn');
  assert.equal(calendarHealth([{}, {}], [{}]).state, 'ok');
});

t('garbage in never throws', () => {
  for (const bad of [null, undefined, {}, 'nope', 42]) {
    assert.doesNotThrow(() => parseForexFactory(bad));
    assert.doesNotThrow(() => parseNasdaq(bad, '2026-09-23'));
    assert.doesNotThrow(() => upcoming(bad, NOW));
    assert.doesNotThrow(() => printed(bad));
  }
  assert.deepEqual(parseForexFactory(null), []);
  assert.deepEqual(parseNasdaq(null, null), []);
});

console.log(`calendarFeed: ${n} groups, all passed`);
