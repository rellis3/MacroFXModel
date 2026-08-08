// js/beigeBookCalendar.js — Beige Book release calendar + window math.
//
// The simplest of the five release-calendar modules built so far: ONE
// document, no delayed minutes/opinions/accounts equivalent, no press
// conference. Its whole calendar is DERIVABLE from js/fomcCalendar.js's
// FOMC_MEETINGS rather than needing its own hardcoded date list — verified
// via web search against 6 real confirmed 2025/2026 release dates (plus 8
// more from 2024) that the Beige Book publishes EXACTLY 14 days before each
// FOMC decision day, every single time, no exceptions found:
//   FOMC 2026-01-28 decision -> Beige Book 2026-01-14 (confirmed: beigebook202601.htm)
//   FOMC 2026-03-18 decision -> Beige Book 2026-03-04 (confirmed: beigebook202602.htm)
//   FOMC 2026-04-29 decision -> Beige Book 2026-04-15 (confirmed: beigebook202604.htm)
//   FOMC 2026-06-17 decision -> Beige Book 2026-06-03 (confirmed: beigebook202605.htm)
//   FOMC 2026-07-29 decision -> Beige Book 2026-07-15 (confirmed: beigebook202607.htm)
//   FOMC 2026-09-16 decision -> Beige Book 2026-09-02 (confirmed scheduled: beigebook202608.htm)
// Oct/Dec 2026 editions aren't independently confirmed yet (too far out at
// research time) but follow the same -14-day arithmetic below.
//
// The URL suffix is NOT the release month — it's a fixed 8-slot sequence
// per year (01,02,04,05,07,08,10,11 — skipping 03,06,09,12) indexed by the
// meeting's position within its year (0-7), confirmed against every real
// example above (e.g. the 5th meeting of the year -> suffix "07"). Computed
// here rather than hardcoded per date, same DRY reasoning as reusing
// FOMC_MEETINGS instead of a parallel hardcoded release-date list.
import { FOMC_MEETINGS } from './fomcCalendar.js';

const DAY_MS = 86_400_000;
const URL_SUFFIX_SEQUENCE = ['01', '02', '04', '05', '07', '08', '10', '11'];

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function urlSuffixFor(meetingDate) {
  const year = meetingDate.slice(0, 4);
  const sameYear = FOMC_MEETINGS.filter(m => m.date.startsWith(year));
  const idx = sameYear.findIndex(m => m.date === meetingDate);
  return `${year}${URL_SUFFIX_SEQUENCE[idx]}`;
}

// One entry per FOMC meeting, keyed by the Beige Book's OWN release date
// (not the FOMC date) — `date` here is what the rest of this engine treats
// as "meetingDate" everywhere else (KV keys, route params, prev-release
// diffing), since the Beige Book is the primary chronological entity a
// trader browses, not a sub-release of an FOMC meeting. `fomcMeetingDate` is
// kept alongside as context for the analysis prompt.
export const BEIGE_BOOK_RELEASES = FOMC_MEETINGS.map(m => ({
  date: addDays(m.date, -14),
  fomcMeetingDate: m.date,
  urlSuffix: urlSuffixFor(m.date),
}));

// 2:00pm ET, same release time as FOMC statements — reuses the same
// EST/EDT-by-month approximation as js/fomcCalendar.js (not exported from
// there, so duplicated here; same "3 strikes before extracting a shared
// helper" call made for every bank's own tz helper in this codebase).
function etOffsetHours(monthIndex) {
  return (monthIndex >= 2 && monthIndex <= 10) ? 4 : 5;
}
function etTimeToUTC(dateStr, hour, minute = 0) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const offset = etOffsetHours(m - 1);
  return Date.UTC(y, m - 1, d, hour + offset, minute);
}

export function releasesForMeeting(release) {
  return [{ kind: 'beigebook', meetingDate: release.date, fomcMeetingDate: release.fomcMeetingDate, urlSuffix: release.urlSuffix, expectedAt: etTimeToUTC(release.date, 14, 5) }];
}

export function allReleases() {
  return BEIGE_BOOK_RELEASES.flatMap(releasesForMeeting).sort((a, b) => a.expectedAt - b.expectedAt);
}

export function pendingAsOf(now = Date.now(), lookbackDays = 120) {
  const floor = now - lookbackDays * DAY_MS;
  return allReleases().filter(r => r.expectedAt <= now && r.expectedAt >= floor);
}

export function latestAndPrevious(now = Date.now()) {
  const past = BEIGE_BOOK_RELEASES.filter(r => etTimeToUTC(r.date, 14, 5) <= now).sort((a, b) => a.date.localeCompare(b.date));
  return { latest: past.at(-1) ?? null, previous: past.at(-2) ?? null };
}
