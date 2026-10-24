// Tests for js/cotFreshness.js.   node js/cotFreshness.test.mjs
import { expectedReportDate, cotCacheIsStale } from './cotFreshness.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
const t = s => Date.parse(s);

ok('on the weekend after a Friday release the expected report is that week\'s Tuesday', expectedReportDate(t('2026-10-24T08:00:00Z')) === '2026-10-20');
ok('on Friday before the release the previous Tuesday is still the newest', expectedReportDate(t('2026-10-23T18:00:00Z')) === '2026-10-13');
ok('on Friday after the release the new Tuesday is expected', expectedReportDate(t('2026-10-23T21:30:00Z')) === '2026-10-20');
ok('midweek it is still the Tuesday of last Friday\'s release', expectedReportDate(t('2026-10-21T12:00:00Z')) === '2026-10-13' && expectedReportDate(t('2026-10-27T12:00:00Z')) === '2026-10-20');
ok('across a winter-time Friday the release hour still holds', expectedReportDate(t('2026-11-06T20:45:00Z')) === '2026-10-27' && expectedReportDate(t('2026-11-06T21:05:00Z')) === '2026-11-03');
const stale = { cachedReportDate: '2026-10-13', cachedAtMs: t('2026-10-20T10:00:00Z'), nowMs: t('2026-10-24T08:00:00Z') };
ok('a cache holding last week\'s report is stale once the new one is out', cotCacheIsStale(stale) === true);
ok('a cache holding the newest report is not stale', cotCacheIsStale({ ...stale, cachedReportDate: '2026-10-20' }) === false);
ok('a cache refreshed minutes ago is left alone even if the new report is late (holiday)', cotCacheIsStale({ ...stale, cachedAtMs: t('2026-10-24T07:30:00Z') }) === false);
ok('with no report date cached the old rule applies', cotCacheIsStale({ ...stale, cachedReportDate: null }) === false);
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
