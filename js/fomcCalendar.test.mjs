// Synthetic test for the FOMC calendar/release-window math. No network.
//   node js/fomcCalendar.test.mjs
import { FOMC_MEETINGS, releasesForMeeting, pendingAsOf, latestAndPrevious, minutesDate } from './fomcCalendar.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[minutesDate — three weeks after the decision]');
{
  ok('Jun 17 2026 -> Jul 8 2026', minutesDate('2026-06-17') === '2026-07-08', minutesDate('2026-06-17'));
}

console.log('[releasesForMeeting]');
{
  const rels = releasesForMeeting({ date: '2026-07-29', sep: false });
  ok('statement + transcript + minutes, no sep', rels.map(r => r.kind).sort().join(',') === 'minutes,statement,transcript');
  const sepRels = releasesForMeeting({ date: '2026-06-17', sep: true });
  ok('sep meeting adds a 4th release', sepRels.length === 4 && sepRels.some(r => r.kind === 'sep'));
  const stmt = rels.find(r => r.kind === 'statement');
  ok('statement expectedAt is on decision day', new Date(stmt.expectedAt).toISOString().startsWith('2026-07-29'));
}

console.log('[pendingAsOf — the "pretend it was today" replay case]');
{
  // "Now" = the afternoon of the Jul 29 2026 decision itself.
  const now = Date.parse('2026-07-29T20:00:00Z');
  const pending = pendingAsOf(now, 120);
  ok('Jul statement is due', pending.some(r => r.kind === 'statement' && r.meetingDate === '2026-07-29'));
  ok('Jul minutes NOT due yet (3wk lag)', !pending.some(r => r.kind === 'minutes' && r.meetingDate === '2026-07-29'));
  ok('Jun minutes IS due (already 3+ weeks old)', pending.some(r => r.kind === 'minutes' && r.meetingDate === '2026-06-17'));
  // 120-day lookback from Jul 29 reaches back to ~Apr 1 — Apr 29/Jun 17/Jul 29
  // statements are in range, Jan 28/Mar 18 fall outside it (by design: bounds
  // the backlog a cold-start deploy tries to catch up on in one pass).
  ok('Apr/Jun/Jul statements are in the 120-day lookback window', pending.filter(r => r.kind === 'statement').length === 3,
    pending.filter(r => r.kind === 'statement').map(r => r.meetingDate).join(','));
}

console.log('[latestAndPrevious]');
{
  const { latest, previous } = latestAndPrevious(Date.parse('2026-08-07T00:00:00Z'));
  ok('latest is Jul 29 2026', latest?.date === '2026-07-29', latest?.date);
  ok('previous is Jun 17 2026', previous?.date === '2026-06-17', previous?.date);
}

console.log('[calendar sanity]');
{
  ok('8 meetings per year, 2026 + 2027 present', FOMC_MEETINGS.filter(m => m.date.startsWith('2026')).length === 8
    && FOMC_MEETINGS.filter(m => m.date.startsWith('2027')).length === 8);
  ok('dates strictly increasing', FOMC_MEETINGS.every((m, i) => i === 0 || m.date > FOMC_MEETINGS[i - 1].date));
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll fomcCalendar tests passed.');
