// js/bocCalendar.js — Bank of Canada fixed-announcement-date (FAD) calendar
// + release-window math. `date` is the announcement day, 09:45 ET.
//
// SOURCES (fetched live 2026-10-24):
//   - 2027 dates, and Sep-Dec 2026 reconfirmed: "Bank of Canada publishes
//     2027 schedule for policy interest rate announcements and other major
//     publications" (July 2026),
//     https://www.bankofcanada.ca/2026/07/bank-canada-publishes-2027-schedule-policy-interest-rate-announcements-other-major-publications/
//     "All interest rate announcements will take place at 09:45 (ET), and the
//     Monetary Policy Report will be published concurrently with the
//     January, April, July and October rate announcements."
//   - Jan-Jul 2026 dates: the press releases themselves, linked from
//     https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/
//     (/2026/01/fad-press-release-2026-01-28/ ... /2026/07/fad-press-release-2026-07-15/).
// The next decision is WEDNESDAY 28 Oct 2026, 09:45 ET (not Thu 29 Oct).
//
// Release kinds:
//   - `statement`: the rate-announcement press release — same day, 09:45.
//   - `mpr`: the Monetary Policy Report overview — same day, MPR meetings
//     only (`mpr: true`).
//   - `deliberations`: "Summary of Governing Council deliberations" — about
//     two weeks later (verified: Sep 2 2026 -> published in /2026/09/;
//     Apr 29 -> /2026/05/; Jan 28 -> /2026/02/). Polled over a window.
export const BOC_MEETINGS = [
  { date: '2026-01-28', mpr: true },
  { date: '2026-03-18' },
  { date: '2026-04-29', mpr: true },
  { date: '2026-06-10' },
  { date: '2026-07-15', mpr: true },
  { date: '2026-09-02' },
  { date: '2026-10-28', mpr: true },
  { date: '2026-12-09' },
  { date: '2027-01-27', mpr: true },
  { date: '2027-03-03' },
  { date: '2027-04-28', mpr: true },
  { date: '2027-06-02' },
  { date: '2027-07-21', mpr: true },
  { date: '2027-09-08' },
  { date: '2027-10-27', mpr: true },
  { date: '2027-12-08' },
];

const DAY_MS = 86_400_000;

function nthSunday(y, monthIndex, n) {
  const first = new Date(Date.UTC(y, monthIndex, 1)).getUTCDay();
  return 1 + ((7 - first) % 7) + (n - 1) * 7;
}
// Ottawa (ET): EDT (UTC-4) from the 2nd Sunday of March to the 1st Sunday of
// November, otherwise EST (UTC-5). Exact rule: the BoC's late-October and
// early-March dates sit right next to the changeovers.
export function etOffsetHours(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const mi = m - 1;
  if (mi > 2 && mi < 10) return -4;                                  // Apr-Oct
  if (mi < 2 || mi > 10) return -5;                                  // Dec-Feb
  if (mi === 2) return d >= nthSunday(y, 2, 2) ? -4 : -5;            // March
  return d < nthSunday(y, 10, 1) ? -4 : -5;                          // November
}
export function etTimeToUTC(dateStr, hour, minute = 0) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d, hour - etOffsetHours(dateStr), minute);
}

export function releasesForMeeting(meeting) {
  const { date, mpr } = meeting;
  const out = [{ kind: 'statement', meetingDate: date, expectedAt: etTimeToUTC(date, 10, 0) }];
  if (mpr) out.push({ kind: 'mpr', meetingDate: date, expectedAt: etTimeToUTC(date, 10, 0) });
  return out;
}

// Summary of deliberations: ~14 days later at 13:30 ET. Window 12-30 days.
export function deliberationsWindow(meetingDateStr) {
  const [y, m, d] = meetingDateStr.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d)); start.setUTCDate(start.getUTCDate() + 12);
  const end = new Date(Date.UTC(y, m - 1, d)); end.setUTCDate(end.getUTCDate() + 30);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export function allReleases() {
  const same = BOC_MEETINGS.flatMap(releasesForMeeting);
  const delib = BOC_MEETINGS.map(m => ({
    kind: 'deliberations', meetingDate: m.date,
    expectedAt: etTimeToUTC(deliberationsWindow(m.date).from, 13, 30),
  }));
  return [...same, ...delib].sort((a, b) => a.expectedAt - b.expectedAt);
}

export function pendingAsOf(now = Date.now(), lookbackDays = 120) {
  const floor = now - lookbackDays * DAY_MS;
  return allReleases().filter(r => r.expectedAt <= now && r.expectedAt >= floor);
}

export function latestAndPrevious(now = Date.now()) {
  const past = BOC_MEETINGS.filter(m => etTimeToUTC(m.date, 9, 45) <= now).sort((a, b) => a.date.localeCompare(b.date));
  return { latest: past.at(-1) ?? null, previous: past.at(-2) ?? null };
}
