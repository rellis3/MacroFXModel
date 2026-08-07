// js/bojCalendar.js — BoJ Monetary Policy Meeting (MPM) calendar + release-
// window math. `date` is the DECISION day (2nd day of each 2-day meeting).
// Verified via web search against the BoJ's own published schedule PDFs
// (mref250731a.pdf for 2026, mref260731a.pdf for 2027 — BoJ publishes each
// year's schedule the preceding July) — top up annually once the next
// schedule PDF is out, same maintenance note as fomcCalendar.js/ecbCalendar.js.
//
// BoJ is structurally the most complex of the four banks built so far:
//   - `statement`: same-day, like BoE (not delayed like Fed/ECB)
//   - `outlook`: quarterly "Outlook for Economic Activity and Prices" —
//     same-day, only at the Jan/Apr/Jul/Oct meetings (BoJ's SEP/projections
//     equivalent)
//   - `opinions`: "Summary of Opinions" — a faster, less-detailed readout,
//     published ~6 business days later (verified real lag: 8-10 calendar
//     days across 3 examples spanning a holiday period)
//   - `minutes`: full Minutes — the most delayed document, ~40-60 calendar
//     days later (verified across 5 real examples), typically landing
//     around the NEXT meeting, not a fixed offset like the Fed's +21 days
// No press-conference kind: research found no confirmed official English
// transcript (BoJ's press-conference PDF is Japanese-only at a /about/press/
// path with no /en/ counterpart found) — deliberately left out rather than
// guess at an unverified URL or read Japanese source text through the
// English-tuned prompt pipeline. Revisit if that changes.
export const BOJ_MEETINGS = [
  { date: '2026-01-23', outlook: true },
  { date: '2026-03-19' },
  { date: '2026-04-28', outlook: true },
  { date: '2026-06-16' },
  { date: '2026-07-31', outlook: true },
  { date: '2026-09-18' },
  { date: '2026-10-30', outlook: true },
  { date: '2026-12-18' },
  { date: '2027-01-22', outlook: true },
  { date: '2027-03-18' },
  { date: '2027-04-28', outlook: true },
  { date: '2027-06-11' },
  { date: '2027-07-22', outlook: true },
  { date: '2027-09-22' },
  { date: '2027-10-29', outlook: true },
  { date: '2027-12-17' },
];

const DAY_MS = 86_400_000;

// JST = UTC+9 year-round, no DST — simpler than the ET/CET helpers.
function jstTimeToUTC(dateStr, hour, minute = 0) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d, hour - 9, minute);
}

// Statement + (if applicable) Outlook both land same-day. The decision is
// typically announced around noon JST with the Outlook Report (on
// projections meetings) following shortly after, then the Governor's press
// conference mid-afternoon — give the whole afternoon before treating it as
// "due".
export function releasesForMeeting(meeting) {
  const { date, outlook } = meeting;
  const out = [
    { kind: 'statement', meetingDate: date, expectedAt: jstTimeToUTC(date, 15, 0) },
  ];
  if (outlook) out.push({ kind: 'outlook', meetingDate: date, expectedAt: jstTimeToUTC(date, 15, 0) });
  return out;
}

// Summary of Opinions — window, not a fixed offset (verified real lag
// spans 8-10 calendar days across examples, one of which crossed a holiday
// period). Widened slightly on both ends for safety margin.
export function opinionsWindow(meetingDateStr) {
  const [y, m, d] = meetingDateStr.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d)); start.setUTCDate(start.getUTCDate() + 5);
  const end = new Date(Date.UTC(y, m - 1, d)); end.setUTCDate(end.getUTCDate() + 16);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

// Minutes — verified real lag spans ~40-60 calendar days across 5 examples;
// window widened on both ends for safety margin.
export function minutesWindow(meetingDateStr) {
  const [y, m, d] = meetingDateStr.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d)); start.setUTCDate(start.getUTCDate() + 35);
  const end = new Date(Date.UTC(y, m - 1, d)); end.setUTCDate(end.getUTCDate() + 70);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export function allReleases() {
  const same = BOJ_MEETINGS.flatMap(releasesForMeeting);
  const opinions = BOJ_MEETINGS.map(m => ({
    kind: 'opinions', meetingDate: m.date,
    expectedAt: Date.parse(opinionsWindow(m.date).from + 'T08:50:00Z'),
  }));
  const minutes = BOJ_MEETINGS.map(m => ({
    kind: 'minutes', meetingDate: m.date,
    expectedAt: Date.parse(minutesWindow(m.date).from + 'T08:50:00Z'),
  }));
  return [...same, ...opinions, ...minutes].sort((a, b) => a.expectedAt - b.expectedAt);
}

export function pendingAsOf(now = Date.now(), lookbackDays = 120) {
  const floor = now - lookbackDays * DAY_MS;
  return allReleases().filter(r => r.expectedAt <= now && r.expectedAt >= floor);
}

export function latestAndPrevious(now = Date.now()) {
  const past = BOJ_MEETINGS.filter(m => jstTimeToUTC(m.date, 15, 0) <= now).sort((a, b) => a.date.localeCompare(b.date));
  return { latest: past.at(-1) ?? null, previous: past.at(-2) ?? null };
}
