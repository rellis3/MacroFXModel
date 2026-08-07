// Synthetic test for the BoJ calendar/release-window math. No network.
//   node js/bojCalendar.test.mjs
import { BOJ_MEETINGS, releasesForMeeting, opinionsWindow, minutesWindow, pendingAsOf, latestAndPrevious } from './bojCalendar.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[opinionsWindow — verified real example]');
{
  const w = opinionsWindow('2026-01-23');
  ok('window starts 5 days out', w.from === '2026-01-28', w.from);
  ok('window ends 16 days out', w.to === '2026-02-08', w.to);
  // Real example verified via search: the Jan 22-23 2026 meeting's Summary
  // of Opinions actually published 2026-02-02 — must fall inside the window.
  ok('the REAL published date (2026-02-02) falls inside the window', '2026-02-02' >= w.from && '2026-02-02' <= w.to);
}

console.log('[minutesWindow — day-count sanity (real examples are 2025-dated, before this calendar starts)]');
{
  const w = minutesWindow('2026-01-23');
  ok('window starts 35 days out', w.from === '2026-02-27', w.from);
  ok('window ends 70 days out', w.to === '2026-04-03', w.to);
}

console.log('[releasesForMeeting]');
{
  const rels = releasesForMeeting({ date: '2026-03-19' });
  ok('non-outlook meeting: statement only', rels.length === 1 && rels[0].kind === 'statement');
  const outlookRels = releasesForMeeting({ date: '2026-01-23', outlook: true });
  ok('outlook meeting adds a 2nd release', outlookRels.length === 2 && outlookRels.some(r => r.kind === 'outlook'));
}

console.log('[pendingAsOf — replay case]');
{
  // "Now" = the afternoon of the Jan 23 2026 decision itself.
  const now = Date.parse('2026-01-23T18:00:00Z');
  const pending = pendingAsOf(now, 120);
  ok('Jan statement is due', pending.some(r => r.kind === 'statement' && r.meetingDate === '2026-01-23'));
  ok('Jan outlook is due (Jan is an outlook meeting)', pending.some(r => r.kind === 'outlook' && r.meetingDate === '2026-01-23'));
  ok('Jan opinions NOT due yet (published ~6 business days later)', !pending.some(r => r.kind === 'opinions' && r.meetingDate === '2026-01-23'));
  ok('Jan minutes NOT due yet (published ~40-60 days later)', !pending.some(r => r.kind === 'minutes' && r.meetingDate === '2026-01-23'));
}
{
  // "Now" = well after Jan's opinions window has opened but before minutes.
  const now = Date.parse('2026-02-05T00:00:00Z');
  const pending = pendingAsOf(now, 120);
  ok('Jan opinions window has opened by Feb 5', pending.some(r => r.kind === 'opinions' && r.meetingDate === '2026-01-23'));
  ok('Jan minutes window has NOT opened by Feb 5', !pending.some(r => r.kind === 'minutes' && r.meetingDate === '2026-01-23'));
}

console.log('[latestAndPrevious]');
{
  const { latest, previous } = latestAndPrevious(Date.parse('2026-08-07T00:00:00Z'));
  ok('latest is Jul 31 2026', latest?.date === '2026-07-31', latest?.date);
  ok('previous is Jun 16 2026', previous?.date === '2026-06-16', previous?.date);
}

console.log('[calendar sanity]');
{
  ok('8 meetings per year for 2026 and 2027', BOJ_MEETINGS.filter(m => m.date.startsWith('2026')).length === 8 && BOJ_MEETINGS.filter(m => m.date.startsWith('2027')).length === 8);
  ok('4 outlook meetings per year (Jan/Apr/Jul/Oct)', BOJ_MEETINGS.filter(m => m.outlook && m.date.startsWith('2026')).length === 4);
  ok('dates strictly increasing', BOJ_MEETINGS.every((m, i) => i === 0 || m.date > BOJ_MEETINGS[i - 1].date));
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll bojCalendar tests passed.');
