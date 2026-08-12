// Synthetic test for the Beige Book calendar/release-window math. No network.
//   node js/beigeBookCalendar.test.mjs
import { BEIGE_BOOK_RELEASES, releasesForMeeting, pendingAsOf, latestAndPrevious } from './beigeBookCalendar.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[BEIGE_BOOK_RELEASES — derived dates + URL suffixes match real confirmed 2026 examples]');
{
  const byMeeting = Object.fromEntries(BEIGE_BOOK_RELEASES.map(r => [r.fomcMeetingDate, r]));
  ok('Jan 28 2026 meeting -> Jan 14 2026 release', byMeeting['2026-01-28']?.date === '2026-01-14', byMeeting['2026-01-28']?.date);
  ok('Jan 2026 -> url suffix 202601', byMeeting['2026-01-28']?.urlSuffix === '202601', byMeeting['2026-01-28']?.urlSuffix);
  ok('Mar 18 2026 meeting -> Mar 4 2026 release', byMeeting['2026-03-18']?.date === '2026-03-04');
  ok('Mar 2026 -> url suffix 202602', byMeeting['2026-03-18']?.urlSuffix === '202602');
  ok('Apr 29 2026 meeting -> Apr 15 2026 release', byMeeting['2026-04-29']?.date === '2026-04-15');
  ok('Apr 2026 -> url suffix 202604', byMeeting['2026-04-29']?.urlSuffix === '202604');
  ok('Jun 17 2026 meeting -> Jun 3 2026 release', byMeeting['2026-06-17']?.date === '2026-06-03');
  ok('Jun 2026 -> url suffix 202605', byMeeting['2026-06-17']?.urlSuffix === '202605');
  ok('Jul 29 2026 meeting -> Jul 15 2026 release', byMeeting['2026-07-29']?.date === '2026-07-15');
  ok('Jul 2026 -> url suffix 202607', byMeeting['2026-07-29']?.urlSuffix === '202607');
  ok('Sep 16 2026 meeting -> Sep 2 2026 release (confirmed scheduled)', byMeeting['2026-09-16']?.date === '2026-09-02');
  ok('Sep 2026 -> url suffix 202608', byMeeting['2026-09-16']?.urlSuffix === '202608');
  ok('Oct 28 2026 meeting -> Oct 14 2026 release (extrapolated, unconfirmed)', byMeeting['2026-10-28']?.date === '2026-10-14');
  ok('Oct 2026 -> url suffix 202610', byMeeting['2026-10-28']?.urlSuffix === '202610');
  ok('Dec 9 2026 meeting -> Nov 25 2026 release (extrapolated, unconfirmed)', byMeeting['2026-12-09']?.date === '2026-11-25');
  ok('Dec 2026 -> url suffix 202611', byMeeting['2026-12-09']?.urlSuffix === '202611');
}

console.log('[releasesForMeeting]');
{
  const rels = releasesForMeeting(BEIGE_BOOK_RELEASES[0]);
  ok('exactly one release: beigebook', rels.length === 1 && rels[0].kind === 'beigebook');
  ok('carries the FOMC meeting date as context', rels[0].fomcMeetingDate === '2026-01-28');
}

console.log('[pendingAsOf — replay case]');
{
  // "Now" = the afternoon of the Jan 14 2026 release itself.
  const now = Date.parse('2026-01-14T20:00:00Z');
  const pending = pendingAsOf(now, 120);
  ok('Jan 2026 beigebook is due', pending.some(r => r.kind === 'beigebook' && r.meetingDate === '2026-01-14'));
  ok('Mar 2026 beigebook NOT due yet', !pending.some(r => r.kind === 'beigebook' && r.meetingDate === '2026-03-04'));
}

console.log('[latestAndPrevious]');
{
  const { latest, previous } = latestAndPrevious(Date.parse('2026-08-08T00:00:00Z'));
  ok('latest is Jul 15 2026', latest?.date === '2026-07-15', latest?.date);
  ok('previous is Jun 3 2026', previous?.date === '2026-06-03', previous?.date);
}

console.log('[calendar sanity]');
{
  ok('8 releases per year for 2026 and 2027', BEIGE_BOOK_RELEASES.filter(r => r.fomcMeetingDate.startsWith('2026')).length === 8 && BEIGE_BOOK_RELEASES.filter(r => r.fomcMeetingDate.startsWith('2027')).length === 8);
  ok('dates strictly increasing', BEIGE_BOOK_RELEASES.every((r, i) => i === 0 || r.date > BEIGE_BOOK_RELEASES[i - 1].date));
  ok('every release lands exactly 14 days before its FOMC meeting', BEIGE_BOOK_RELEASES.every(r => {
    const rel = new Date(r.date + 'T00:00:00Z'), fomc = new Date(r.fomcMeetingDate + 'T00:00:00Z');
    return Math.round((fomc - rel) / 86_400_000) === 14;
  }));
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll beigeBookCalendar tests passed.');
