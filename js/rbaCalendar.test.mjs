// Synthetic test for the RBA calendar/release-window math. No network.
//   node js/rbaCalendar.test.mjs
import { RBA_MEETINGS, sydneyOffsetHours, sydneyTimeToUTC, releasesForMeeting, minutesWindow, pendingAsOf, latestAndPrevious } from './rbaCalendar.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[Sydney DST — matched to the releases\' own <time datetime> offsets]');
{
  // Live: the 29 Sep 2026 release carries datetime="2026-09-29T14:30+10:00".
  ok('29 Sep 2026 AEST (+10)', sydneyOffsetHours('2026-09-29') === 10);
  ok('3 Nov 2026 AEDT (+11)', sydneyOffsetHours('2026-11-03') === 11);
  ok('3 Feb 2026 AEDT (+11)', sydneyOffsetHours('2026-02-03') === 11);
  // 2026: AEDT ends Sun 5 Apr, starts Sun 4 Oct.
  ok('4 Apr 2026 AEDT, 6 Apr AEST', sydneyOffsetHours('2026-04-04') === 11 && sydneyOffsetHours('2026-04-06') === 10);
  ok('3 Oct 2026 AEST, 4 Oct AEDT', sydneyOffsetHours('2026-10-03') === 10 && sydneyOffsetHours('2026-10-04') === 11);
  ok('2:30pm 29 Sep 2026 = 04:30 UTC', new Date(sydneyTimeToUTC('2026-09-29', 14, 30)).toISOString() === '2026-09-29T04:30:00.000Z');
}

console.log('[minutesWindow — verified real example]');
{
  const w = minutesWindow('2026-09-29');
  // Live: the 29 Sep 2026 minutes page carries dc.date 2026-10-13.
  ok('the REAL publish date (2026-10-13) falls inside the window', '2026-10-13' >= w.from && '2026-10-13' <= w.to, JSON.stringify(w));
  ok('window opens 12 days out', w.from === '2026-10-11', w.from);
}

console.log('[releasesForMeeting]');
{
  ok('non-SMP meeting: statement only', releasesForMeeting({ date: '2026-09-29' }).map(r => r.kind).join() === 'statement');
  ok('SMP meeting adds smp', releasesForMeeting({ date: '2026-08-11', smp: true }).map(r => r.kind).join() === 'statement,smp');
}

console.log('[pendingAsOf]');
{
  const p = pendingAsOf(Date.parse('2026-10-24T00:00:00Z'), 120);
  ok('Sep statement due', p.some(r => r.kind === 'statement' && r.meetingDate === '2026-09-29'));
  ok('Sep minutes due (window opened 11 Oct)', p.some(r => r.kind === 'minutes' && r.meetingDate === '2026-09-29'));
  ok('Aug SMP due', p.some(r => r.kind === 'smp' && r.meetingDate === '2026-08-11'));
  ok('Nov statement not due yet', !p.some(r => r.meetingDate === '2026-11-03'));
}

console.log('[latestAndPrevious]');
{
  const { latest, previous } = latestAndPrevious(Date.parse('2026-10-24T00:00:00Z'));
  ok('latest 29 Sep, previous 11 Aug', latest?.date === '2026-09-29' && previous?.date === '2026-08-11', `${latest?.date} ${previous?.date}`);
}

console.log('[calendar sanity — RBA Board Meeting Schedules page]');
{
  ok('8 meetings in 2026 and 2027', RBA_MEETINGS.filter(m => m.date.startsWith('2026')).length === 8 && RBA_MEETINGS.filter(m => m.date.startsWith('2027')).length === 8);
  ok('SMP at Feb/May/Aug/Nov only', RBA_MEETINGS.filter(m => m.smp).every(m => ['02', '05', '08', '11'].includes(m.date.slice(5, 7))) && RBA_MEETINGS.filter(m => m.smp).length === 8);
  ok('every decision day is a Tuesday', RBA_MEETINGS.every(m => new Date(m.date + 'T12:00:00Z').getUTCDay() === 2));
  ok('dates strictly increasing', RBA_MEETINGS.every((m, i) => i === 0 || m.date > RBA_MEETINGS[i - 1].date));
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll rbaCalendar tests passed.');
