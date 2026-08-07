// js/fomcCalendar.js — FOMC meeting calendar + release-window math.
//
// Pure data + pure functions, no network/KV here (mirrors econCalendar.js /
// macroChange.js: fetch and compute stay separate bricks). The Fed publishes
// meeting dates 1-2 years ahead; this list needs a manual top-up once a year
// from https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm — same
// maintenance shape as the _FED_CHAIR_NAMES scrub in server.js.
//
// `date` is the SECOND (decision) day of the two-day meeting — the day the
// statement is released, 2:00pm ET. Every meeting since Jan 2019 holds a
// press conference (~2:30pm ET); SEP (dot plot) meetings are flagged `sep`.
export const FOMC_MEETINGS = [
  // 2026 — confirmed (federalreserve.gov)
  { date: '2026-01-28', sep: false },
  { date: '2026-03-18', sep: true },
  { date: '2026-04-29', sep: false },
  { date: '2026-06-17', sep: true },
  { date: '2026-07-29', sep: false },
  { date: '2026-09-16', sep: true },
  { date: '2026-10-28', sep: false },
  { date: '2026-12-09', sep: true },
  // 2027 — tentative per the Fed's advance calendar, confirmed meeting-by-meeting
  { date: '2027-01-27', sep: false },
  { date: '2027-03-17', sep: true },
  { date: '2027-04-28', sep: false },
  { date: '2027-06-09', sep: true },
  { date: '2027-07-28', sep: false },
  { date: '2027-09-15', sep: true },
  { date: '2027-10-27', sep: false },
  { date: '2027-12-08', sep: true },
];

const DAY_MS = 86_400_000;

// 2:00pm ET statement release, expressed as a UTC offset from midnight on the
// decision day. ET is UTC-4 (EDT, Mar-Nov) or UTC-5 (EST, Nov-Mar) — the Fed's
// calendar sits mostly in EDT (Mar/Apr/Jun/Jul/Sep meetings) with Jan/Oct/Dec
// in EST. Close enough for a "has this landed yet" poll (checked every 20-30
// min, not to the minute) to just use EST/EDT by month rather than a full tz db.
function etOffsetHours(monthIndex /* 0-11 */) {
  // Roughly mid-March to early November is EDT (UTC-4); the rest is EST (UTC-5).
  return (monthIndex >= 2 && monthIndex <= 10) ? 4 : 5;
}

function etTimeToUTC(dateStr, hour, minute = 0) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const offset = etOffsetHours(m - 1);
  return Date.UTC(y, m - 1, d, hour + offset, minute);
}

// Minutes are released "three weeks after the date of the policy decision" —
// in practice a Wednesday 2:00pm ET. +21 days lands on the right weekday
// (three full weeks preserves day-of-week) unless the Fed shifts it around a
// holiday; the fetcher polls rather than trusting this to the day, so a
// several-day miss here just delays the first successful check, it never
// breaks anything.
function minutesDate(meetingDateStr) {
  const [y, m, d] = meetingDateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 21);
  return dt.toISOString().slice(0, 10);
}

// Every release this engine tracks for one meeting, with its EXPECTED
// earliest-available instant (ms since epoch, UTC). Actual publication can
// run late (Fed IT hiccups, holiday shifts) — callers should keep polling
// past `expectedAt`, not treat it as exact.
export function releasesForMeeting(meeting) {
  const { date, sep } = meeting;
  const out = [
    { kind: 'statement', meetingDate: date, expectedAt: etTimeToUTC(date, 14, 5) },
    // Preliminary transcript typically posts same-day/next-morning; allow the
    // full afternoon before a fetch attempt is worth making.
    { kind: 'transcript', meetingDate: date, expectedAt: etTimeToUTC(date, 16, 0) },
    { kind: 'minutes', meetingDate: date, expectedAt: etTimeToUTC(minutesDate(date), 14, 5) },
  ];
  if (sep) out.push({ kind: 'sep', meetingDate: date, expectedAt: etTimeToUTC(date, 14, 5) });
  return out;
}

// All tracked releases across every known meeting, flattened + sorted.
export function allReleases() {
  return FOMC_MEETINGS.flatMap(releasesForMeeting).sort((a, b) => a.expectedAt - b.expectedAt);
}

// Releases that are due as of `now` (expectedAt <= now) and not older than
// `lookbackDays` — bounds the backlog a fresh deploy or a long outage would
// otherwise try to catch up on all at once. Callers cross-reference against
// KV to see which of these are already fetched; this function only knows the
// calendar, not what's been captured.
export function pendingAsOf(now = Date.now(), lookbackDays = 120) {
  const floor = now - lookbackDays * DAY_MS;
  return allReleases().filter(r => r.expectedAt <= now && r.expectedAt >= floor);
}

// The most recent meeting on/before `now`, and the one before that — the pair
// a statement-vs-previous-statement diff needs. Returns { latest, previous },
// either possibly null if the calendar doesn't reach back far enough.
export function latestAndPrevious(now = Date.now()) {
  const past = FOMC_MEETINGS
    .filter(m => etTimeToUTC(m.date, 14, 5) <= now)
    .sort((a, b) => a.date.localeCompare(b.date));
  return { latest: past.at(-1) ?? null, previous: past.at(-2) ?? null };
}

export { minutesDate };
