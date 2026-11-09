/**
 * The freshness line in the Desk Atlas header: when the data this page (and the newsletter built from it) leans on was last refreshed, and whether any feed is behind.
 * It reuses the newsletter's own feed list and rules (js/dataFreshness.js), so the header and the newsletter's "Where this comes from" never disagree.
 *
 *   "Data refreshed 21:10 UK (1h 05m ago) · newest: option positions and dealer gamma · all feeds current"
 *   "Data refreshed 21:10 UK (1h 05m ago) · newest: ... · 2 feeds behind: Speculative positioning (as of 28 Oct), Release calendar did not load"
 *
 * "Refreshed" is the NEWEST timestamp among the feeds that carry a time (brief, forecast, implied vol, calendar, surprises ...): the evening run touches them
 * together, so the newest one is when the run finished. A feed with only a date (the daily price bundle, COT) cannot give a time; it is judged by its own rhythm.
 * Pure: callers pass `sources` ({label, source, asOf, cadence}), the clock and the issue date. Tested in js/atlasFreshness.test.mjs.
 */
import { freshness } from './dataFreshness.js';

const ukTime = ms => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
const ukDay = ms => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
const sameUkDay = (a, b) => ukDay(a) === ukDay(b);

export function ageText(ms, nowMs) {
  const m = Math.max(0, Math.round((nowMs - ms) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${String(m % 60).padStart(2, '0')}m ago` : `${Math.floor(h / 24)}d ago`;
}

export function atlasFreshness(sources, { nowMs = Date.now(), isoDate = null } = {}) {
  const list = Array.isArray(sources) ? sources : [];
  const rows = freshness(list, isoDate);
  const stamped = list
    .map(s => ({ label: s.label, ms: typeof s.asOf === 'string' && s.asOf.includes('T') ? Date.parse(s.asOf) : NaN }))
    .filter(x => Number.isFinite(x.ms) && x.ms <= nowMs + 5 * 60_000)   // a time in the future is a clock error, not freshness
    .sort((a, b) => b.ms - a.ms);
  const newest = stamped[0] ?? null;
  const behind = rows.filter(r => r.status !== 'ok').map(r => r.note || `${r.label} is behind`);
  const when = newest ? `${sameUkDay(newest.ms, nowMs) ? '' : ukDay(newest.ms) + ' '}${ukTime(newest.ms)} UK (${ageText(newest.ms, nowMs)})` : null;
  const parts = [when ? `Data refreshed ${when}` : 'No feed reported a refresh time'];
  if (newest) parts.push(`newest: ${newest.label}`);
  parts.push(behind.length ? `${behind.length} feed${behind.length === 1 ? '' : 's'} behind: ${behind.slice(0, 3).join('; ')}${behind.length > 3 ? `; +${behind.length - 3} more` : ''}` : 'all feeds current');
  const ageH = newest ? (nowMs - newest.ms) / 3.6e6 : Infinity;
  const tone = behind.length || ageH >= 6 ? 'amber' : 'green';
  return { text: parts.join(' · '), tone, newestMs: newest?.ms ?? null, newestLabel: newest?.label ?? null, behind };
}
