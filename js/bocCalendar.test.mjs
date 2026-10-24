// Synthetic test for the BoC calendar/release-window math. No network.
//   node js/bocCalendar.test.mjs
import { BOC_MEETINGS, etOffsetHours, etTimeToUTC, releasesForMeeting, deliberationsWindow, pendingAsOf, latestAndPrevious } from './bocCalendar.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[ET DST — exact rule]');
{
  ok('28 Oct 2026 EDT (-4)', etOffsetHours('2026-10-28') === -4);
  ok('1 Nov 2026 EST (-5; DST ends that Sunday)', etOffsetHours('2026-11-01') === -5);
  ok('3 Mar 2027 EST, 14 Mar 2027 EDT', etOffsetHours('2027-03-03') === -5 && etOffsetHours('2027-03-14') === -4);
  ok('09:45 ET 28 Oct 2026 = 13:45 UTC', new Date(etTimeToUTC('2026-10-28', 9, 45)).toISOString() === '2026-10-28T13:45:00.000Z');
  ok('09:45 ET 9 Dec 2026 = 14:45 UTC', new Date(etTimeToUTC('2026-12-09', 9, 45)).toISOString() === '2026-12-09T14:45:00.000Z');
}

console.log('[deliberationsWindow — verified real examples]');
{
  // Live: Sep 2 2026 summary dated September 16, 2026; Apr 29 summary dated May 13, 2026.
  const s = deliberationsWindow('2026-09-02'), a = deliberationsWindow('2026-04-29');
  ok('Sep 16 inside the Sep 2 window', '2026-09-16' >= s.from && '2026-09-16' <= s.to, JSON.stringify(s));
  ok('May 13 inside the Apr 29 window', '2026-05-13' >= a.from && '2026-05-13' <= a.to, JSON.stringify(a));
}

console.log('[releases + pending]');
{
  ok('MPR meeting: statement + mpr', releasesForMeeting({ date: '2026-10-28', mpr: true }).map(r => r.kind).join() === 'statement,mpr');
  ok('non-MPR meeting: statement only', releasesForMeeting({ date: '2026-09-02' }).map(r => r.kind).join() === 'statement');
  const p = pendingAsOf(Date.parse('2026-10-24T00:00:00Z'), 120);
  ok('Sep statement + deliberations due', p.some(r => r.kind === 'statement' && r.meetingDate === '2026-09-02') && p.some(r => r.kind === 'deliberations' && r.meetingDate === '2026-09-02'));
  ok('Jul MPR due (prior doc for the Oct MPR diff)', p.some(r => r.kind === 'mpr' && r.meetingDate === '2026-07-15'));
  ok('Oct 28 not due yet', !p.some(r => r.meetingDate === '2026-10-28'));
  const onDay = pendingAsOf(Date.parse('2026-10-28T14:05:00Z'), 120);
  ok('Oct 28 statement + MPR due by 10:05 ET', onDay.some(r => r.kind === 'statement' && r.meetingDate === '2026-10-28') && onDay.some(r => r.kind === 'mpr' && r.meetingDate === '2026-10-28'));
}

console.log('[latestAndPrevious]');
{
  const { latest, previous } = latestAndPrevious(Date.parse('2026-10-24T00:00:00Z'));
  ok('latest Sep 2, previous Jul 15', latest?.date === '2026-09-02' && previous?.date === '2026-07-15', `${latest?.date} ${previous?.date}`);
}

console.log('[calendar sanity — BoC 2027 schedule release]');
{
  ok('8 FADs in 2026 and 2027', BOC_MEETINGS.filter(m => m.date.startsWith('2026')).length === 8 && BOC_MEETINGS.filter(m => m.date.startsWith('2027')).length === 8);
  ok('every FAD is a Wednesday', BOC_MEETINGS.every(m => new Date(m.date + 'T12:00:00Z').getUTCDay() === 3));
  ok('MPR in Jan/Apr/Jul/Oct only', BOC_MEETINGS.filter(m => m.mpr).every(m => ['01', '04', '07', '10'].includes(m.date.slice(5, 7))) && BOC_MEETINGS.filter(m => m.mpr).length === 8);
  ok('dates strictly increasing', BOC_MEETINGS.every((m, i) => i === 0 || m.date > BOC_MEETINGS[i - 1].date));
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll bocCalendar tests passed.');
