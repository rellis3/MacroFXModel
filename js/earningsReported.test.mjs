// node --test js/earningsReported.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { dueRows, parseSurprise, reportedItem, verdictOf, reportAtMs, reportedHtml } from './earningsReported.js';
import { etToMs } from './marketCalendars.js';

// the real shape of api.nasdaq.com/api/company/NVDA/earnings-surprise (fetched 2026-11-18)
const NVDA = { data: { symbol: 'nvda', earningsSurpriseTable: { rows: [
  { fiscalQtrEnd: 'Jul 2026', dateReported: '8/26/2026', eps: 2.22, consensusForecast: '2.09', percentageSurprise: '6.22' },
  { fiscalQtrEnd: 'Apr 2026', dateReported: '5/20/2026', eps: 1.87, consensusForecast: '1.7', percentageSurprise: '10' }] } } };

test('parseSurprise finds the row reported on the date, and nothing when the table has not got it yet', () => {
  assert.deepEqual(parseSurprise(NVDA, '2026-08-26'), { fiscalQtrEnd: 'Jul 2026', eps: 2.22, consensus: 2.09, pct: 6.22 });
  assert.equal(parseSurprise(NVDA, '2026-11-19'), null);
  assert.equal(parseSurprise(null, '2026-11-19'), null);
});
test('a missing percentage is worked out from eps and consensus, never invented', () => {
  const j = { data: { earningsSurpriseTable: { rows: [{ dateReported: '11/18/2026', eps: 1.1, consensusForecast: '1.0', percentageSurprise: '' }] } } };
  assert.equal(parseSurprise(j, '2026-11-18').pct, 10);
});
test('verdict: within +/-1% is in line', () => {
  assert.equal(verdictOf(6.2), 'beat'); assert.equal(verdictOf(-3), 'miss'); assert.equal(verdictOf(0.4), 'in line'); assert.equal(verdictOf(null), null);
});
test('dueRows: a before-the-open company is due after 09:10 ET, an after-the-close one after 16:15 ET, and not two days later', () => {
  const rows = [{ symbol: 'WMT', date: '2026-11-18', when: 'before the open', capB: 700 }, { symbol: 'NVDA', date: '2026-11-18', when: 'after the close', capB: 4000 }];
  const at = (h, m) => etToMs('2026-11-18', h, m);
  assert.deepEqual(dueRows(rows, at(9, 5)).map(r => r.symbol), []);
  assert.deepEqual(dueRows(rows, at(10, 0)).map(r => r.symbol), ['WMT']);
  assert.deepEqual(dueRows(rows, at(16, 10)).map(r => r.symbol), ['WMT']);
  assert.deepEqual(dueRows(rows, at(17, 0)).map(r => r.symbol), ['NVDA', 'WMT']);      // biggest first
  assert.deepEqual(dueRows(rows, etToMs('2026-11-20', 12, 0)).map(r => r.symbol), []);  // outside the 40 hours
});
test('html says beat or miss without a direction call, and escapes names', () => {
  const it = reportedItem({ symbol: 'X', name: '<b>X</b>', capB: 200, date: '2026-11-18', when: 'after the close' }, { eps: 1.1, consensus: 1, pct: 10 });
  const h = reportedHtml([it]);
  assert.match(h, /X \+10\.0%/); assert.match(h, /beat/); assert.ok(!h.includes('<b>X</b>')); assert.match(h, /no call on the index/);
  assert.match(reportedHtml([]), /No big company has reported/);
  assert.ok(reportAtMs({ date: '2026-11-18', when: 'time not given' }) > 0);
});
