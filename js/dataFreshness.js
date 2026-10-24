/**
 * Where an issue's data comes from, and whether each feed is as current as it should be.
 *
 * The newsletter's footer lists its sources with an "as of" date, and a one-line check sits under the masthead only when something is old or missing.
 * "Old" is judged by each feed's own rhythm, never by a made-up age limit:
 *   daily  : should hold the last business day before the issue (Friday for a weekend or Monday issue).
 *   cftc   : the weekly Commitments of Traders report, published Friday evening for the Tuesday before (js/cotFreshness.js).
 *   live   : fetched when the issue is built, so its date is the fetch; shown, never flagged.
 *   hourly : the hourly volatility log only moves while markets trade, so its date is shown and never flagged.
 *   irregular : central-bank tone and the like have no fixed rhythm; shown, never flagged.
 * A feed that did not load at all is "missing" whatever its rhythm.
 *
 * Pure: the caller passes the issue date 'YYYY-MM-DD'. Tested in js/dataFreshness.test.mjs.
 */
import { expectedReportDate } from './cotFreshness.js';

const DAY = 864e5;
/** 'YYYY-MM-DD' from an ISO string, a date string, or a millisecond timestamp. null when it is not a date. */
export function dayOf(x) {
  if (x == null || x === '') return null;
  if (typeof x === 'number' && Number.isFinite(x)) return new Date(x).toISOString().slice(0, 10);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(x)); return m ? m[1] : null;
}
/** The last business day strictly before `iso`. */
export function lastBusinessDayBefore(iso) {
  let t = Date.parse(iso + 'T00:00:00Z') - DAY;
  while ([0, 6].includes(new Date(t).getUTCDay())) t -= DAY;
  return new Date(t).toISOString().slice(0, 10);
}
const nice = d => { const t = Date.parse(d + 'T00:00:00Z'); return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : d; };

/** sources: [{ label, source, asOf, cadence }]. Returns rows with a status of 'ok' | 'stale' | 'missing' and a plain note for the ones that are not ok. */
export function freshness(sources, isoDate) {
  const iso = dayOf(isoDate);
  return (sources ?? []).map(s => {
    const asOf = dayOf(s.asOf), row = { label: s.label, source: s.source, asOf, cadence: s.cadence ?? 'live', status: 'ok', note: '' };
    if (!asOf) { row.status = 'missing'; row.note = `${s.label} did not load`; return row; }
    if (!iso) return row;
    if (s.cadence === 'daily') {
      const want = lastBusinessDayBefore(iso);
      if (asOf < want) { row.status = 'stale'; row.note = `${s.label} stops at ${nice(asOf)}, ${nice(want)} was expected`; }
    } else if (s.cadence === 'cftc') {
      const want = expectedReportDate(Date.parse(iso + 'T12:00:00Z'));
      if (asOf < want) { row.status = 'stale'; row.note = `${s.label} is the report for ${nice(asOf)}, but the one for ${nice(want)} is out`; }
    }
    return row;
  });
}

/** One sentence for the top of the issue. Empty when everything is current. */
export function healthLine(rows) {
  const bad = (rows ?? []).filter(r => r.status !== 'ok');
  if (!bad.length) return '';
  return `Data check: ${bad.map(r => r.note).join('; ')}. Everything else is current.`;
}
