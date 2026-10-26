// Synthetic test for the SNB calendar/release-time math. No network.
//   node js/snbCalendar.test.mjs
import { SNB_MEETINGS, zurichOffsetHours, zurichTimeToUTC, releasesForMeeting, pendingAsOf, latestAndPrevious, allReleases } from './snbCalendar.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[Zurich DST — exact EU rule]');
{
  ok('24 Sep 2026 CEST (+2)', zurichOffsetHours('2026-09-24') === 2);
  ok('25 Oct 2026 is the change day -> CET (+1); 24 Oct still CEST', zurichOffsetHours('2026-10-25') === 1 && zurichOffsetHours('2026-10-24') === 2);
  ok('10 Dec 2026 CET (+1)', zurichOffsetHours('2026-12-10') === 1);
  ok('18 Mar 2027 CET; 28 Mar 2027 CEST (last Sunday)', zurichOffsetHours('2027-03-18') === 1 && zurichOffsetHours('2027-03-28') === 2 && zurichOffsetHours('2027-03-27') === 1);
  ok('09:30 Zurich 24 Sep 2026 = 07:30 UTC', new Date(zurichTimeToUTC('2026-09-24', 9, 30)).toISOString() === '2026-09-24T07:30:00.000Z');
  ok('09:30 Zurich 10 Dec 2026 = 08:30 UTC', new Date(zurichTimeToUTC('2026-12-10', 9, 30)).toISOString() === '2026-12-10T08:30:00.000Z');
}

console.log('[calendar — verified live 2026-10-26]');
{
  const dates = SNB_MEETINGS.map(m => m.date);
  ok('sorted, unique', dates.every((d, i) => i === 0 || d > dates[i - 1]) && new Set(dates).size === dates.length);
  ok('2026: 19 Mar, 18 Jun, 24 Sep, 10 Dec', ['2026-03-19', '2026-06-18', '2026-09-24', '2026-12-10'].every(d => dates.includes(d)));
  ok('2027 from the SNB time schedule: 18 Mar, 24 Jun, 23 Sep, 16 Dec', ['2027-03-18', '2027-06-24', '2027-09-23', '2027-12-16'].every(d => dates.includes(d)));
  ok('all announcements on a Thursday', SNB_MEETINGS.every(m => new Date(m.date + 'T12:00:00Z').getUTCDay() === 4));
  ok('no summary before Sep 2025', SNB_MEETINGS.filter(m => m.date < '2025-09-01').every(m => !m.summaryOn));
  ok('summaries exactly 4 weeks on (all verified dates)', SNB_MEETINGS.filter(m => m.summaryOn).every(m => (Date.parse(m.summaryOn) - Date.parse(m.date)) / 86_400_000 === 28));
}

console.log('[releases]');
{
  const r = releasesForMeeting({ date: '2026-09-24', summaryOn: '2026-10-22' });
  ok('statement 09:30, remarks 10:00, summary 09:30 four weeks on', r.length === 3 &&
    new Date(r[0].expectedAt).toISOString() === '2026-09-24T07:30:00.000Z' &&
    new Date(r[1].expectedAt).toISOString() === '2026-09-24T08:00:00.000Z' &&
    r[2].kind === 'summary' && new Date(r[2].expectedAt).toISOString() === '2026-10-22T07:30:00.000Z');
  ok('pre-Sep-2025 meeting has no summary kind', releasesForMeeting({ date: '2025-06-19' }).every(x => x.kind !== 'summary'));
  const all = allReleases();
  ok('allReleases sorted', all.every((x, i) => i === 0 || x.expectedAt >= all[i - 1].expectedAt));
  const now = Date.parse('2026-10-26T12:00:00Z');
  const p = pendingAsOf(now, 120).map(x => `${x.kind}:${x.meetingDate}`);
  ok('pending at 26 Oct 2026 = Jul summary, Sep statement/remarks/summary', JSON.stringify(p) === JSON.stringify(['summary:2026-06-18', 'statement:2026-09-24', 'remarks:2026-09-24', 'summary:2026-09-24']), JSON.stringify(p));
  const lp = latestAndPrevious(now);
  ok('latest 24 Sep, previous 18 Jun', lp.latest?.date === '2026-09-24' && lp.previous?.date === '2026-06-18');
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll snbCalendar tests passed.');
