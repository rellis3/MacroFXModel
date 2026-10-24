// js/rbnzCalendar.js — Reserve Bank of New Zealand Monetary Policy Committee
// OCR decision calendar + release timing. `date` is the NZ-local
// announcement day (2pm NZ time).
//
// SOURCE (fetched live 2026-10-24): "OCR decision dates and Financial
// Stability Report dates to February 2028", published 19 Feb 2026, updated
// 18 Sep 2026:
//   https://www.rbnz.govt.nz/news-and-events/how-we-release-information/ocr-decision-dates-and-financial-stability-report-dates-to-feb-2028
// 2026 is a 7-decision year; 2027 moves to 8 (the page says so). The
// 18 Feb 2026 date is from the RBNZ's own "Past monetary policy decisions"
// table (https://www.rbnz.govt.nz/monetary-policy/monetary-policy-decisions),
// which the schedule page no longer lists because it had already passed.
// The 28 Oct 2026 time (2pm NZDT) is confirmed by the RBNZ news release
// "Updates to the October Monetary Policy Review and November Financial
// Stability Report" (6 Oct 2026): "The October MPR will continue to be
// published on 28 October 2026 at 2pm." 2pm NZDT on Wed 28 Oct is 01:00 UTC
// on 28 Oct, which is 21:00 ET on TUESDAY 27 Oct — not Wed 28 Oct ET.
//
// `mps: true` = a Monetary Policy Statement meeting (full forecast round);
// the others are Monetary Policy Reviews. Both publish the same two things,
// same day, on one web page: the OCR media release and the MPC's "Summary
// record of meeting". That page is captured as the single `statement` kind.
// There is no delayed minutes document — the record IS the minutes, and it
// lands with the decision (like the BoE, unlike the Fed/RBA/BoC).
//
// Top up from the same source page when the RBNZ publishes dates past Feb 2028.
export const RBNZ_MEETINGS = [
  { date: '2026-02-18', mps: true },
  { date: '2026-04-08' },
  { date: '2026-05-27', mps: true },
  { date: '2026-07-08' },
  { date: '2026-09-02', mps: true },
  { date: '2026-10-28' },
  { date: '2026-12-09', mps: true },
  { date: '2027-02-10' },
  { date: '2027-03-17', mps: true },
  { date: '2027-05-05' },
  { date: '2027-06-16', mps: true },
  { date: '2027-08-04' },
  { date: '2027-09-15', mps: true },
  { date: '2027-10-27' },
  { date: '2027-12-08', mps: true },
  { date: '2028-02-09' },
];

const DAY_MS = 86_400_000;

// Day-of-month of the n-th (1-based) Sunday, or the last Sunday when n = -1.
function sundayOf(y, monthIndex, n) {
  if (n === -1) {
    const last = new Date(Date.UTC(y, monthIndex + 1, 0));
    return last.getUTCDate() - last.getUTCDay();
  }
  const first = new Date(Date.UTC(y, monthIndex, 1)).getUTCDay();
  return 1 + ((7 - first) % 7) + (n - 1) * 7;
}

// NZ time: NZDT (UTC+13) from the last Sunday of September to the first
// Sunday of April, otherwise NZST (UTC+12). Exact rule, not a by-month
// approximation — the changeover weeks matter because the RBNZ decides in
// early April and late September.
export function nzOffsetHours(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const mi = m - 1;
  if (mi > 3 && mi < 8) return 12;                              // May-Aug
  if (mi < 3 || mi > 8) return 13;                              // Oct-Mar
  if (mi === 3) return d < sundayOf(y, 3, 1) ? 13 : 12;         // April
  return d >= sundayOf(y, 8, -1) ? 13 : 12;                     // September
}
export function nzTimeToUTC(dateStr, hour, minute = 0) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d, hour - nzOffsetHours(dateStr), minute);
}

// Announcement 2:00pm NZ; the record of meeting is on the same page. Give it
// 15 minutes before treating it as due.
export function releasesForMeeting(meeting) {
  return [{ kind: 'statement', meetingDate: meeting.date, expectedAt: nzTimeToUTC(meeting.date, 14, 15) }];
}

export function allReleases() {
  return RBNZ_MEETINGS.flatMap(releasesForMeeting).sort((a, b) => a.expectedAt - b.expectedAt);
}

export function pendingAsOf(now = Date.now(), lookbackDays = 120) {
  const floor = now - lookbackDays * DAY_MS;
  return allReleases().filter(r => r.expectedAt <= now && r.expectedAt >= floor);
}

export function latestAndPrevious(now = Date.now()) {
  const past = RBNZ_MEETINGS.filter(m => nzTimeToUTC(m.date, 14, 0) <= now).sort((a, b) => a.date.localeCompare(b.date));
  return { latest: past.at(-1) ?? null, previous: past.at(-2) ?? null };
}
