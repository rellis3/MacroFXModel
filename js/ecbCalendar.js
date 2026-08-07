// js/ecbCalendar.js — ECB Governing Council meeting calendar + release-window
// math. Same shape as js/fomcCalendar.js (`date` is the decision day of the
// meeting — always a Thursday since 2026), but ECB's release timing differs
// from the Fed's in one important way: the "Accounts" (ECB's minutes
// equivalent) publish 5+ weeks after the meeting on a date that is NOT
// derivable the way the Fed's fixed +21-days minutes date is — see
// accountsWindow() below. 2026 dates verified against the ECB's own
// published calendar; 2027 dates are known to exist (ECB publishes ~2yr
// ahead) but weren't confirmed from this environment — top up annually,
// same maintenance note as js/fomcCalendar.js.
export const ECB_MEETINGS = [
  { date: '2026-02-05' },
  { date: '2026-03-19', projections: true }, // ECB's own name for the FOMC-SEP equivalent: new staff macroeconomic projections (Mar/Jun/Sep/Dec)
  { date: '2026-04-30' },
  { date: '2026-06-11', projections: true },
  { date: '2026-07-23' },
  { date: '2026-09-10', projections: true },
  { date: '2026-10-29' },
  { date: '2026-12-17', projections: true },
];

const DAY_MS = 86_400_000;

// CET = UTC+1, CEST (DST) = UTC+2, roughly late March to late October.
// Approximated by month — fine for a "has this landed yet" poll checked
// every 20-30 min, same tolerance as js/fomcCalendar.js's ET helper.
function cetOffsetHours(monthIndex) {
  return (monthIndex >= 2 && monthIndex <= 9) ? 2 : 1;
}
function cetTimeToUTC(dateStr, hour, minute = 0) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const offset = cetOffsetHours(m - 1);
  return Date.UTC(y, m - 1, d, hour - offset, minute);
}

// Only `statement` here — the ECB's "introductory statement (with Q&A)" is
// ONE combined document (scripted remarks + the full press-conference
// transcript together), unlike the Fed's separate statement/transcript
// releases. `projections` at quarterly meetings mirrors the FOMC SEP.
export function releasesForMeeting(meeting) {
  const { date, projections } = meeting;
  const out = [
    { kind: 'statement', meetingDate: date, expectedAt: cetTimeToUTC(date, 15, 30) }, // decision ~14:15 CET, presser 14:45 CET + Q&A — give the full afternoon
  ];
  if (projections) out.push({ kind: 'projections', meetingDate: date, expectedAt: cetTimeToUTC(date, 14, 20) });
  return out;
}

// Accounts: 5-6 weeks out, exact day not derivable from the meeting date —
// unlike releasesForMeeting's single `expectedAt` instant, this returns a
// WIDE window; callers poll across the whole thing (same idempotent
// "not captured yet, try again next tick" loop the FOMC engine already
// uses — the window just needs to start early enough and stay open long
// enough to catch it, not pinpoint the exact day).
export function accountsWindow(meetingDateStr) {
  const [y, m, d] = meetingDateStr.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d)); start.setUTCDate(start.getUTCDate() + 28);
  const end = new Date(Date.UTC(y, m - 1, d)); end.setUTCDate(end.getUTCDate() + 49);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export function allReleases() {
  const stmts = ECB_MEETINGS.flatMap(releasesForMeeting);
  const accounts = ECB_MEETINGS.map(m => ({
    kind: 'accounts', meetingDate: m.date,
    expectedAt: Date.parse(accountsWindow(m.date).from + 'T14:00:00Z'),
  }));
  return [...stmts, ...accounts].sort((a, b) => a.expectedAt - b.expectedAt);
}

export function pendingAsOf(now = Date.now(), lookbackDays = 120) {
  const floor = now - lookbackDays * DAY_MS;
  return allReleases().filter(r => r.expectedAt <= now && r.expectedAt >= floor);
}

export function latestAndPrevious(now = Date.now()) {
  const past = ECB_MEETINGS.filter(m => cetTimeToUTC(m.date, 14, 20) <= now).sort((a, b) => a.date.localeCompare(b.date));
  return { latest: past.at(-1) ?? null, previous: past.at(-2) ?? null };
}
