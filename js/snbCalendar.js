// js/snbCalendar.js — Swiss National Bank quarterly monetary policy
// assessment calendar + release times. `date` is the ANNOUNCEMENT day (the
// press release, 09:30 Zurich time; the Governing Board meets the two days
// before, e.g. "the monetary policy assessment of 22 and 23 September 2026 ...
// communicated to the public on 24 September 2026").
//
// SOURCES (fetched live 2026-10-26, official snb.ch only):
//   - Past dates (2025-03-20 ... 2026-09-24): the decisions page,
//     https://www.snb.ch/en/the-snb/mandates-goals/monetary-policy/decisions
//     (one press release + introductory remarks per quarter; "since September
//     2025, a summary of the discussion has been published four weeks after
//     each monetary policy decision").
//   - 2026-12-10 and all of 2027, plus every future summary date: the SNB's
//     "Time schedule", https://www.snb.ch/en/services-events/digital-services/event-schedule
//     ("10.12.2026 09:30 Monetary policy assessment of 10 December 2026 (press
//     release)", "10:00 ... (introductory remarks, news conference)",
//     "07.01.2027 09:30 Summary of monetary policy discussion", and so on to
//     "13.01.2028 09:30 Summary of monetary policy discussion").
//   - Past summary publication dates: the summaries listing,
//     https://www.snb.ch/en/news-publications/economy/summaries
//     (zus_20251023, zus_20260108, zus_20260416, zus_20260716, zus_20261022).
//
// Release kinds:
//   - `statement`: the monetary policy assessment press release — 09:30.
//   - `remarks`: the Governing Board's introductory remarks at the news
//     conference — 10:00 the same day (the SNB's fullest same-day text).
//   - `summary`: "Monetary policy assessment of <Month YYYY>: Summary of
//     discussion" — the SNB's minutes equivalent, four weeks later at 09:30,
//     on the date in `summaryOn` (September 2025 onwards only; the SNB
//     published none before). No vote is published: the three-member
//     Governing Board decides, and the summary names who took the decision
//     but not a split.
export const SNB_MEETINGS = [
  { date: '2025-03-20' },
  { date: '2025-06-19' },
  { date: '2025-09-25', summaryOn: '2025-10-23' },
  { date: '2025-12-11', summaryOn: '2026-01-08' },
  { date: '2026-03-19', summaryOn: '2026-04-16' },
  { date: '2026-06-18', summaryOn: '2026-07-16' },
  { date: '2026-09-24', summaryOn: '2026-10-22' },
  { date: '2026-12-10', summaryOn: '2027-01-07' },
  { date: '2027-03-18', summaryOn: '2027-04-15' },
  { date: '2027-06-24', summaryOn: '2027-07-22' },
  { date: '2027-09-23', summaryOn: '2027-10-21' },
  { date: '2027-12-16', summaryOn: '2028-01-13' },
];

const DAY_MS = 86_400_000;

function lastSunday(y, monthIndex) {
  const last = new Date(Date.UTC(y, monthIndex + 1, 0));
  return last.getUTCDate() - last.getUTCDay();
}
// Zurich: CEST (UTC+2) from the last Sunday of March to the last Sunday of
// October, otherwise CET (UTC+1). Exact EU rule (changeover at 01:00 UTC; a
// 09:30 release is never inside the changeover hour).
export function zurichOffsetHours(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const mi = m - 1;
  if (mi > 2 && mi < 9) return 2;                                   // Apr-Sep
  if (mi < 2 || mi > 9) return 1;                                   // Nov-Feb
  if (mi === 2) return d >= lastSunday(y, 2) ? 2 : 1;               // March
  return d < lastSunday(y, 9) ? 2 : 1;                              // October
}
export function zurichTimeToUTC(dateStr, hour, minute = 0) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d, hour - zurichOffsetHours(dateStr), minute);
}

export function releasesForMeeting(meeting) {
  const { date, summaryOn } = meeting;
  const out = [
    { kind: 'statement', meetingDate: date, expectedAt: zurichTimeToUTC(date, 9, 30) },
    { kind: 'remarks', meetingDate: date, expectedAt: zurichTimeToUTC(date, 10, 0) },
  ];
  if (summaryOn) out.push({ kind: 'summary', meetingDate: date, expectedAt: zurichTimeToUTC(summaryOn, 9, 30) });
  return out;
}

export function allReleases() {
  return SNB_MEETINGS.flatMap(releasesForMeeting).sort((a, b) => a.expectedAt - b.expectedAt);
}

export function pendingAsOf(now = Date.now(), lookbackDays = 120) {
  const floor = now - lookbackDays * DAY_MS;
  return allReleases().filter(r => r.expectedAt <= now && r.expectedAt >= floor);
}

export function latestAndPrevious(now = Date.now()) {
  const past = SNB_MEETINGS.filter(m => zurichTimeToUTC(m.date, 9, 30) <= now).sort((a, b) => a.date.localeCompare(b.date));
  return { latest: past.at(-1) ?? null, previous: past.at(-2) ?? null };
}
