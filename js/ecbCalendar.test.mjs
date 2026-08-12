// Synthetic test for the ECB calendar/release-window math. No network.
//   node js/ecbCalendar.test.mjs
import { ECB_MEETINGS, releasesForMeeting, accountsWindow, pendingAsOf, latestAndPrevious } from './ecbCalendar.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[accountsWindow — 4-7 weeks out, NOT a fixed exact date]');
{
  const w = accountsWindow('2025-12-18');
  ok('window starts 4 weeks out', w.from === '2026-01-15', w.from);
  ok('window ends 7 weeks out', w.to === '2026-02-05', w.to);
  // Real example verified via search: the Dec 17-18 2025 meeting's account
  // actually published 2026-01-22 — must fall inside the computed window.
  ok('the REAL published date (2026-01-22) falls inside the window', '2026-01-22' >= w.from && '2026-01-22' <= w.to);
}

console.log('[releasesForMeeting]');
{
  const rels = releasesForMeeting({ date: '2026-04-30' });
  ok('non-projections meeting: statement only', rels.length === 1 && rels[0].kind === 'statement');
  const projRels = releasesForMeeting({ date: '2026-06-11', projections: true });
  ok('projections meeting adds a 2nd release', projRels.length === 2 && projRels.some(r => r.kind === 'projections'));
}

console.log('[pendingAsOf — replay case]');
{
  // "Now" = the afternoon of the Jun 11 2026 decision itself.
  const now = Date.parse('2026-06-11T18:00:00Z');
  const pending = pendingAsOf(now, 120);
  ok('Jun statement is due', pending.some(r => r.kind === 'statement' && r.meetingDate === '2026-06-11'));
  ok('Jun accounts NOT due yet (published weeks later)', !pending.some(r => r.kind === 'accounts' && r.meetingDate === '2026-06-11'));
  ok('Feb accounts window has opened by June (published ~Mar 5-26)', pending.some(r => r.kind === 'accounts' && r.meetingDate === '2026-02-05'));
}

console.log('[latestAndPrevious]');
{
  const { latest, previous } = latestAndPrevious(Date.parse('2026-08-07T00:00:00Z'));
  ok('latest is Jul 23 2026', latest?.date === '2026-07-23', latest?.date);
  ok('previous is Jun 11 2026', previous?.date === '2026-06-11', previous?.date);
}

console.log('[calendar sanity]');
{
  ok('8 meetings for 2026', ECB_MEETINGS.length === 8, ECB_MEETINGS.length);
  ok('dates strictly increasing', ECB_MEETINGS.every((m, i) => i === 0 || m.date > ECB_MEETINGS[i - 1].date));
  ok('4 projections meetings (Mar/Jun/Sep/Dec)', ECB_MEETINGS.filter(m => m.projections).length === 4);
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll ecbCalendar tests passed.');
