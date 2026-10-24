// js/rbaCalendar.js — Reserve Bank of Australia Monetary Policy Board
// calendar + release-window math. `date` is the DECISION day (the 2nd day of
// each 2-day meeting), announced 2:30pm Sydney time.
//
// SOURCE (fetched live 2026-10-24): "Board Meeting Schedules",
//   https://www.rba.gov.au/schedules-events/board-meeting-schedules.html
// which lists the Monetary Policy Board's 2026 and 2027 meetings as 2-day
// ranges ("2–3 February", ..., "13–14 December"). Cross-checked: the 2026
// minutes index (https://www.rba.gov.au/monetary-policy/rba-board-minutes/2026/)
// lists the same eight decision dates, and every past 2026 decision media
// release carries <time datetime="YYYY-MM-DDT14:30+10:00|+11:00"> on that
// same date.
//
// Release kinds:
//   - `statement`: "Statement by the Monetary Policy Board: Monetary Policy
//     Decision" media release — same day, 2:30pm.
//   - `smp`: the quarterly Statement on Monetary Policy "Overview" — same
//     day, 2:30pm, at the Feb/May/Aug/Nov meetings only (`smp: true`).
//   - `minutes`: "Minutes of the Monetary Policy Board Meeting" — two weeks
//     later (the RBA's own wording on the decision page: "published two
//     weeks after the decision"; verified: the 29 Sep 2026 minutes carry
//     dc.date 2026-10-13). Polled over a window, like the BoJ's opinions.
export const RBA_MEETINGS = [
  { date: '2026-02-03', smp: true },
  { date: '2026-03-17' },
  { date: '2026-05-05', smp: true },
  { date: '2026-06-16' },
  { date: '2026-08-11', smp: true },
  { date: '2026-09-29' },
  { date: '2026-11-03', smp: true },
  { date: '2026-12-08' },
  { date: '2027-02-09', smp: true },
  { date: '2027-03-23' },
  { date: '2027-05-04', smp: true },
  { date: '2027-06-22' },
  { date: '2027-08-10', smp: true },
  { date: '2027-09-28' },
  { date: '2027-11-02', smp: true },
  { date: '2027-12-14' },
];

const DAY_MS = 86_400_000;

function nthSunday(y, monthIndex, n) {
  const first = new Date(Date.UTC(y, monthIndex, 1)).getUTCDay();
  return 1 + ((7 - first) % 7) + (n - 1) * 7;
}

// Sydney time: AEDT (UTC+11) from the first Sunday of October to the first
// Sunday of April, otherwise AEST (UTC+10). Exact rule — the RBA meets in
// early April/October, right at the changeovers.
export function sydneyOffsetHours(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const mi = m - 1;
  if (mi > 3 && mi < 9) return 10;                               // May-Sep
  if (mi < 3 || mi > 9) return 11;                               // Nov-Mar
  if (mi === 3) return d < nthSunday(y, 3, 1) ? 11 : 10;         // April
  return d >= nthSunday(y, 9, 1) ? 11 : 10;                      // October
}
export function sydneyTimeToUTC(dateStr, hour, minute = 0) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d, hour - sydneyOffsetHours(dateStr), minute);
}

export function releasesForMeeting(meeting) {
  const { date, smp } = meeting;
  const out = [{ kind: 'statement', meetingDate: date, expectedAt: sydneyTimeToUTC(date, 14, 45) }];
  if (smp) out.push({ kind: 'smp', meetingDate: date, expectedAt: sydneyTimeToUTC(date, 14, 45) });
  return out;
}

// Minutes: published 14 days after the decision at 11:30am Sydney (2026
// examples). Window opens 12 days out, closes 30 out.
export function minutesWindow(meetingDateStr) {
  const [y, m, d] = meetingDateStr.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d)); start.setUTCDate(start.getUTCDate() + 12);
  const end = new Date(Date.UTC(y, m - 1, d)); end.setUTCDate(end.getUTCDate() + 30);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export function allReleases() {
  const same = RBA_MEETINGS.flatMap(releasesForMeeting);
  const minutes = RBA_MEETINGS.map(m => ({
    kind: 'minutes', meetingDate: m.date,
    expectedAt: Date.parse(minutesWindow(m.date).from + 'T00:30:00Z'),
  }));
  return [...same, ...minutes].sort((a, b) => a.expectedAt - b.expectedAt);
}

export function pendingAsOf(now = Date.now(), lookbackDays = 120) {
  const floor = now - lookbackDays * DAY_MS;
  return allReleases().filter(r => r.expectedAt <= now && r.expectedAt >= floor);
}

export function latestAndPrevious(now = Date.now()) {
  const past = RBA_MEETINGS.filter(m => sydneyTimeToUTC(m.date, 14, 30) <= now).sort((a, b) => a.date.localeCompare(b.date));
  return { latest: past.at(-1) ?? null, previous: past.at(-2) ?? null };
}
