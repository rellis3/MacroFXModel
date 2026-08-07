// js/boeCalendar.js — Bank of England MPC meeting calendar + release-window
// math. Structurally the simplest of the three central banks built so far:
// the "Monetary Policy Summary and Minutes" is ONE combined document
// published SAME DAY as the decision (BoE reformed to same-day minutes years
// ago) — there is no delayed minutes-equivalent release to poll for at all,
// unlike the Fed's +21-day minutes or the ECB's 5-6-week Accounts. 4 of the
// 8 meetings/year (Feb/Apr/Jul/Nov) additionally publish a quarterly
// Monetary Policy Report + a press-conference transcript. 2026 AND 2027
// dates verified against the Bank of England's own published schedule
// (unlike FOMC/ECB, both years were confirmed from this environment).
export const BOE_MEETINGS = [
  { date: '2026-02-05', report: true },
  { date: '2026-03-19' },
  { date: '2026-04-30', report: true },
  { date: '2026-06-18' },
  { date: '2026-07-30', report: true },
  { date: '2026-09-17' },
  { date: '2026-11-05', report: true },
  { date: '2026-12-17' },
  { date: '2027-02-04', report: true },
  { date: '2027-03-18' },
  { date: '2027-04-29', report: true },
  { date: '2027-06-17' },
  { date: '2027-07-29', report: true },
  { date: '2027-09-16' },
  { date: '2027-11-04', report: true },
  { date: '2027-12-16' },
];

const DAY_MS = 86_400_000;

// UK time: GMT (UTC+0) in winter, BST (UTC+1) late March to late October —
// same rough by-month approximation as the ET/CET helpers in
// js/fomcCalendar.js and js/ecbCalendar.js.
function ukOffsetHours(monthIndex) {
  return (monthIndex >= 2 && monthIndex <= 9) ? 1 : 0;
}
function ukTimeToUTC(dateStr, hour, minute = 0) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const offset = ukOffsetHours(m - 1);
  return Date.UTC(y, m - 1, d, hour - offset, minute);
}

// All releases publish SAME DAY — the calendar entry's `date` IS the
// publication date for every kind here, unlike FOMC minutes / ECB Accounts.
export function releasesForMeeting(meeting) {
  const { date, report } = meeting;
  const out = [
    { kind: 'summary', meetingDate: date, expectedAt: ukTimeToUTC(date, 12, 15) }, // published noon UK time
  ];
  if (report) {
    out.push({ kind: 'report', meetingDate: date, expectedAt: ukTimeToUTC(date, 12, 15) });
    out.push({ kind: 'transcript', meetingDate: date, expectedAt: ukTimeToUTC(date, 14, 30) }); // presser follows noon release; give it time to post
  }
  return out;
}

export function allReleases() {
  return BOE_MEETINGS.flatMap(releasesForMeeting).sort((a, b) => a.expectedAt - b.expectedAt);
}

export function pendingAsOf(now = Date.now(), lookbackDays = 120) {
  const floor = now - lookbackDays * DAY_MS;
  return allReleases().filter(r => r.expectedAt <= now && r.expectedAt >= floor);
}

export function latestAndPrevious(now = Date.now()) {
  const past = BOE_MEETINGS.filter(m => ukTimeToUTC(m.date, 12, 15) <= now).sort((a, b) => a.date.localeCompare(b.date));
  return { latest: past.at(-1) ?? null, previous: past.at(-2) ?? null };
}
