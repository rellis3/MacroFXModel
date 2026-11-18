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

// ── Finnhub (the faster source) and the news item. Rows are the real ones fetched 2026-11-18 from finnhub.io/api/v1/calendar/earnings.
import { fromFinnhub, earningsNewsItem } from './earningsReported.js';
const FH = [
  { symbol: 'HD', date: '2026-11-17', hour: 'bmo', epsEstimate: 3.9542, epsActual: 3.86, revenueEstimate: 44075069385, revenueActual: 43398000000 },
  { symbol: 'NVDA', date: '2026-11-17', hour: 'amc', epsEstimate: 2.525, epsActual: 2.68, revenueEstimate: 111282164311, revenueActual: 115844000000 },
  { symbol: 'LOW', date: '2026-11-18', hour: 'bmo', epsEstimate: 2.9103, epsActual: null, revenueEstimate: 22631671212, revenueActual: null }];
test('fromFinnhub: actual against estimate with revenue; null while the actual is not in', () => {
  const n = fromFinnhub(FH, { symbol: 'NVDA', date: '2026-11-17' });
  assert.equal(n.eps, 2.68); assert.equal(n.consensus, 2.525); assert.equal(n.pct, 6.14); assert.equal(n.src, 'finnhub'); assert.equal(n.revPct, 4.1);
  assert.equal(fromFinnhub(FH, { symbol: 'LOW', date: '2026-11-18' }), null);
  assert.equal(fromFinnhub(FH, { symbol: 'XYZ', date: '2026-11-17' }), null);
  assert.equal(fromFinnhub(FH, { symbol: 'HD', date: '2026-11-17' }).pct, -2.38);
});
test('earningsNewsItem: tier 1 for the tracked nine, impact only on a real beat or miss, tier 2 needs +/-5%', () => {
  const nv = earningsNewsItem(reportedItem({ symbol: 'NVDA', name: 'NVIDIA', capB: 4800, when: 'after the close', date: '2026-11-17', tracked: true, at: 1 }, fromFinnhub(FH, { symbol: 'NVDA', date: '2026-11-17' })), 5);
  assert.equal(nv.earn.tier, 1); assert.deepEqual(nv.earn.read.impact, { EQUITIES: 2 }); assert.match(nv.title, /NVIDIA beats: EPS 2\.68 against 2\.525/); assert.match(nv.summary, /revenue \$115\.8bn/);
  const hd = earningsNewsItem(reportedItem({ symbol: 'HD', name: 'Home Depot', capB: 330, when: 'before the open', date: '2026-11-17', at: 1 }, fromFinnhub(FH, { symbol: 'HD', date: '2026-11-17' })), 5);
  assert.equal(hd.earn.tier, 2); assert.deepEqual(hd.earn.read.impact, {});          // -2.4% on a tier-2 name: shown in the News tab, no index push
  assert.match(hd.title, /Home Depot misses/);
  assert.equal(earningsNewsItem({ symbol: 'X' }), null);
});
