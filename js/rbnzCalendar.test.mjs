// Synthetic test for the RBNZ calendar/release math. No network.
//   node js/rbnzCalendar.test.mjs
import { RBNZ_MEETINGS, nzOffsetHours, nzTimeToUTC, releasesForMeeting, pendingAsOf, latestAndPrevious } from './rbnzCalendar.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[NZ DST — exact changeover rule]');
{
  // 2026: NZDT ends Sun 5 Apr, starts Sun 27 Sep.
  ok('4 Apr 2026 still NZDT (+13)', nzOffsetHours('2026-04-04') === 13);
  ok('8 Apr 2026 NZST (+12)', nzOffsetHours('2026-04-08') === 12);
  ok('2 Sep 2026 NZST (+12)', nzOffsetHours('2026-09-02') === 12);
  ok('27 Sep 2026 NZDT (+13)', nzOffsetHours('2026-09-27') === 13);
  ok('28 Oct 2026 NZDT (+13)', nzOffsetHours('2026-10-28') === 13);
}

console.log('[announcement instant — the Oct 2026 MPR]');
{
  // RBNZ: "The October MPR will ... be published on 28 October 2026 at 2pm."
  const t = nzTimeToUTC('2026-10-28', 14, 0);
  ok('2pm NZDT 28 Oct = 01:00 UTC 28 Oct', new Date(t).toISOString() === '2026-10-28T01:00:00.000Z', new Date(t).toISOString());
  // 01:00 UTC is 21:00 EDT the previous evening (US DST ends 1 Nov 2026).
  ok('which is 21:00 ET on Tue 27 Oct', new Date(t - 4 * 3600_000).toISOString().startsWith('2026-10-27T21:00'));
  const sep = nzTimeToUTC('2026-09-02', 14, 0);
  ok('2pm NZST 2 Sep = 02:00 UTC 2 Sep', new Date(sep).toISOString() === '2026-09-02T02:00:00.000Z');
}

console.log('[releases + pending]');
{
  const rels = releasesForMeeting({ date: '2026-09-02', mps: true });
  ok('one same-day kind (release + record on one page)', rels.length === 1 && rels[0].kind === 'statement');
  const before = pendingAsOf(Date.parse('2026-10-28T01:00:00Z'), 120);
  ok('Oct MPR not due at the announcement minute', !before.some(r => r.meetingDate === '2026-10-28'));
  const after = pendingAsOf(Date.parse('2026-10-28T02:00:00Z'), 120);
  ok('Oct MPR due an hour later', after.some(r => r.meetingDate === '2026-10-28'));
  ok('Sep + Jul in the 120-day lookback (prior docs for the word diff)', after.some(r => r.meetingDate === '2026-09-02') && after.some(r => r.meetingDate === '2026-07-08'));
}

console.log('[latestAndPrevious]');
{
  const { latest, previous } = latestAndPrevious(Date.parse('2026-10-24T00:00:00Z'));
  ok('latest is 2 Sep 2026', latest?.date === '2026-09-02', latest?.date);
  ok('previous is 8 Jul 2026', previous?.date === '2026-07-08', previous?.date);
}

console.log('[calendar sanity — RBNZ schedule page]');
{
  ok('2026: 7 decisions', RBNZ_MEETINGS.filter(m => m.date.startsWith('2026')).length === 7);
  ok('2027: 8 decisions (schedule moves 7 -> 8)', RBNZ_MEETINGS.filter(m => m.date.startsWith('2027')).length === 8);
  ok('every date is a Wednesday', RBNZ_MEETINGS.every(m => new Date(m.date + 'T12:00:00Z').getUTCDay() === 3));
  ok('dates strictly increasing', RBNZ_MEETINGS.every((m, i) => i === 0 || m.date > RBNZ_MEETINGS[i - 1].date));
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll rbnzCalendar tests passed.');
