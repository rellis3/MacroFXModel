// Synthetic test for the BoE calendar/release-window math. No network.
//   node js/boeCalendar.test.mjs
import { BOE_MEETINGS, releasesForMeeting, pendingAsOf, latestAndPrevious } from './boeCalendar.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[releasesForMeeting]');
{
  const plain = releasesForMeeting({ date: '2026-03-19' });
  ok('non-report meeting: summary only', plain.length === 1 && plain[0].kind === 'summary', JSON.stringify(plain));
  const withReport = releasesForMeeting({ date: '2026-02-05', report: true });
  ok('report meeting adds report + transcript (3 total)', withReport.length === 3
    && withReport.some(r => r.kind === 'report') && withReport.some(r => r.kind === 'transcript'));
  ok('all releases for one meeting share the same meetingDate', withReport.every(r => r.meetingDate === '2026-02-05'));
}

console.log('[pendingAsOf — everything publishes SAME DAY, unlike FOMC/ECB]');
{
  const now = Date.parse('2026-02-05T18:00:00Z'); // afternoon of the Feb 5 2026 decision
  const pending = pendingAsOf(now, 120);
  ok('summary is due same day', pending.some(r => r.kind === 'summary' && r.meetingDate === '2026-02-05'));
  ok('report is ALSO due same day (no multi-week lag like FOMC minutes/ECB accounts)', pending.some(r => r.kind === 'report' && r.meetingDate === '2026-02-05'));
  ok('transcript also due same day', pending.some(r => r.kind === 'transcript' && r.meetingDate === '2026-02-05'));
}

console.log('[latestAndPrevious]');
{
  const { latest, previous } = latestAndPrevious(Date.parse('2026-08-07T00:00:00Z'));
  ok('latest is Jul 30 2026', latest?.date === '2026-07-30', latest?.date);
  ok('previous is Jun 18 2026', previous?.date === '2026-06-18', previous?.date);
}

console.log('[calendar sanity]');
{
  ok('8 meetings per year for 2026 and 2027', BOE_MEETINGS.filter(m => m.date.startsWith('2026')).length === 8
    && BOE_MEETINGS.filter(m => m.date.startsWith('2027')).length === 8);
  ok('4 report meetings per year (Feb/Apr/Jul/Nov)', BOE_MEETINGS.filter(m => m.date.startsWith('2026') && m.report).length === 4);
  ok('dates strictly increasing', BOE_MEETINGS.every((m, i) => i === 0 || m.date > BOE_MEETINGS[i - 1].date));
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll boeCalendar tests passed.');
