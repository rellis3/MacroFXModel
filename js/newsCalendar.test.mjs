import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseCalendarCsv, newsForWindow, pairCurrencies } from './newsCalendar.js';

const CSV = new URL('../calendar_events.csv', import.meta.url).pathname;
const hasCsv = existsSync(CSV);

test('parseCalendarCsv: parses the real calendar into sorted events', { skip: !hasCsv && 'calendar_events.csv absent' }, () => {
  const events = parseCalendarCsv(readFileSync(CSV, 'utf8'));
  assert.ok(events.length > 90000, `parsed ${events.length} events`);
  for (let i = 1; i < events.length; i++) assert.ok(events[i].ms >= events[i - 1].ms, 'sorted by ms');
  const majors = events.filter(e => e.rank === 3).length;
  assert.ok(majors > 4000 && majors < 7000, `~5189 Major events, got ${majors}`);
  assert.ok(events.some(e => e.surprise != null), 'some events carry a surprise');
});

test('newsForWindow: flags a Major USD session (payroll day) and a quiet one', { skip: !hasCsv && 'calendar_events.csv absent' }, () => {
  const events = parseCalendarCsv(readFileSync(CSV, 'utf8'));
  const usd = pairCurrencies('EURUSD');
  // 2023-06-02 payroll day (Major USD @ 12:30 UTC) — window the whole UTC day
  const day = Date.parse('2023-06-02T00:00:00Z');
  const hit = newsForWindow(events, usd, day, day + 864e5);
  assert.equal(hit.hasMajor, true, 'payroll day flagged Major');
  assert.equal(hit.bucket, 'major');
  // a Saturday with no scheduled data → none
  const quiet = newsForWindow(events, usd, Date.parse('2023-06-03T00:00:00Z'), Date.parse('2023-06-03T23:59:00Z'));
  assert.equal(quiet.hasMajor, false, 'weekend quiet');
});

test('pairCurrencies: FX legs, index/gold home currency', () => {
  assert.deepEqual([...pairCurrencies('GBPJPY')].sort(), ['GBP', 'JPY']);
  assert.deepEqual([...pairCurrencies('NQ')], ['USD']);
  assert.deepEqual([...pairCurrencies('DE30')], ['EUR']);
});

test('parseCalendarCsv: tolerates quoted junk fields without throwing', () => {
  const csv = 'date,datetime_raw,country,ccy,impact,event,actual,previous,consensus\n'
    + '2023-01-05,2023-01-05 13:30:00,United States,USD,Major,CPI,"""""",,\n'
    + '2023-01-05,2023-01-05 15:00:00,United States,USD,Standard,ISM,53.5,52.5,53\n';
  const ev = parseCalendarCsv(csv);
  assert.equal(ev.length, 2);
  assert.equal(ev[1].surprise, 0.5);   // 53.5 - 53
});
