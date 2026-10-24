/**
 * When is a cached CFTC Commitments of Traders payload out of date?
 *
 * The CFTC measures positions on Tuesday and publishes them the following Friday at 15:30 US Eastern. /api/cot-extremes cached its payload for a flat
 * seven days from whenever it was computed, so a payload computed on, say, Wednesday kept being served through the next Friday release and the
 * weekend: the weekly newsletter then described a report that was a week old. This says which report date SHOULD be available, so the cache can be
 * refreshed the moment a newer one exists, and no sooner.
 *
 * Pure: the caller passes the clock. Tested in js/cotFreshness.test.mjs.
 */
const DAY = 864e5;
// Friday 15:30 Eastern is 19:30 UTC in summer time and 20:30 UTC in winter time. 21:00 UTC is after both, so a report is only expected once it is surely out.
const RELEASE_UTC_HOUR = 21;

/** The Tuesday (YYYY-MM-DD) of the newest report that should have been published by `nowMs`. */
export function expectedReportDate(nowMs) {
  const d = new Date(nowMs);
  // Walk back to the most recent Friday release that has already happened, then take the Tuesday three days before it.
  const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  let fri = dayStart - ((d.getUTCDay() - 5 + 7) % 7) * DAY;
  if (fri + RELEASE_UTC_HOUR * 3.6e6 > nowMs) fri -= 7 * DAY;     // it is Friday but before the release, or a weekday earlier in the week
  return new Date(fri - 3 * DAY).toISOString().slice(0, 10);
}

/**
 * Should the cached payload be recomputed? Yes when a newer report should exist than the one cached, but never more often than `minGapMs`:
 * after a US holiday the CFTC publishes on the Monday, and without the gap every request in between would hit the CFTC for nothing.
 */
export function cotCacheIsStale({ cachedReportDate, cachedAtMs, nowMs, minGapMs = 6 * 3.6e6 }) {
  if (!cachedReportDate) return false;                             // no date to compare: leave the old seven-day rule alone
  if (nowMs - cachedAtMs < minGapMs) return false;
  return expectedReportDate(nowMs) > cachedReportDate;
}
