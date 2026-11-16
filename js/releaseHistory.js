// js/releaseHistory.js: the last N prints of ONE release from the surprise store (13,100 stored releases back to about 2015, ForexFactory and Nasdaq consensus plus
// statistics-office and FRED actuals), for the Calendar drill's "past prints" drawer. Pure: no fetch, no clock unless passed. Route: GET /api/release-history (server.js).
//
// What a row carries: forecast (the calendar's consensus), actual, previous as printed with the release, the raw surprise (actual minus forecast, in the release's own
// units), its z (the surprise against THIS series' own typical surprise, the same robust scale the surprise index uses: js/econSurprise.js scoreReleases), and a revision
// where the store has one (US through ALFRED vintages; elsewhere only when a later print restates `previous`).
//
// What it does NOT carry, and says so: a forecast range (no free source gives one), non-US revisions before the next print, and a z for a series with fewer than 6
// scored prints. Evidence: the SIZE of a surprise is validated (surprise-size); which way the next one lands is not predictable from the series alone.
import { seriesKey, parseCalNumber, scoreReleases, polarityFor, DEFAULTS } from './econSurprise.js';

const norm = s => String(s ?? '').trim().toLowerCase();
const stripPeriod = t => norm(t).replace(/\s*\((?:[a-z]{3,9}|q[1-4]|\d{1,2}\/\d{4})\)\s*$/i, '');
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
const r2 = v => (v == null || !Number.isFinite(v) ? null : +v.toFixed(2));
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** The rows of one series: exact title first, then the same title without a trailing period tag ("(Oct)"). { rows, matched: 'exact' | 'normalised' | null }. */
export function seriesRows(all, { country, event }) {
  const key = seriesKey({ country, event });
  let rows = (all ?? []).filter(e => e && e.ms != null && seriesKey(e) === key);
  if (rows.length) return { rows, matched: 'exact' };
  const c = String(country ?? '').toUpperCase(), t = stripPeriod(event);
  rows = (all ?? []).filter(e => e && e.ms != null && String(e.country ?? '').toUpperCase() === c && stripPeriod(e.event) === t);
  return { rows, matched: rows.length ? 'normalised' : null };
}

/**
 * The drawer's data. rows = the surprise store rows. Returns { ok, found, ... }.
 *   n          how many past prints to return (newest first), at most 40
 *   now        only prints before this moment count as past (the calendar row being drilled may already be in the store with no actual)
 */
export function releaseHistory(all, { country, event, n = 12, now = Date.now() } = {}) {
  const want = Math.max(1, Math.min(40, Math.round(n) || 12));
  if (!country || !event) return { ok: false, error: 'country and event are needed' };
  const { rows: series, matched } = seriesRows(all, { country, event });
  const printed = series.filter(e => e.actual != null && e.actual !== '' && e.ms < now).sort((a, b) => b.ms - a.ms);
  if (!printed.length) return { ok: true, found: false, country: String(country).toUpperCase(), event, stored: series.length, matched, note: 'No past print of this release is held in the surprise store.' };
  // z on the SAME robust scale the surprise index uses, over this series alone (every impact, the whole stored history)
  const scored = scoreReleases(series, { ...DEFAULTS, impacts: [], now, maxAgeDays: 100000 });
  const zBy = new Map(scored.scored.map(r => [r.ms, r.z]));
  const skipped = scored.skipped[0] ?? null;
  const out = printed.slice(0, want).map(e => {
    const est = parseCalNumber(e.estimate), act = parseCalNumber(e.actual), prev = parseCalNumber(e.prev ?? e.previous);
    const raw = act != null && est != null ? r2(act - est) : null;
    return {
      date: isoDay(e.ms), ms: e.ms, time: e.time ?? null,
      forecast: e.estimate ?? null, actual: e.actual, previous: e.prev ?? e.previous ?? null,
      surprise: raw, z: zBy.get(e.ms) ?? null,
      beat: act != null && est != null ? (act > est ? 'above' : act < est ? 'below' : 'inline') : null,
      moved: act != null && prev != null ? (act > prev ? 'up' : act < prev ? 'down' : 'flat') : null,
      ...(e.revised != null ? { revised: e.revised, revisedAt: e.revisedAt ?? null, revisedDelta: e.revisedDelta ?? null } : {}),
      ...(e.revision ? { revision: e.revision } : {}),
    };
  });
  const zs = printed.map(e => zBy.get(e.ms)).filter(z => z != null);
  const withEst = printed.filter(e => parseCalNumber(e.estimate) != null && parseCalNumber(e.actual) != null);
  const cnt = k => withEst.filter(e => { const a = parseCalNumber(e.actual), f = parseCalNumber(e.estimate); return k === 'above' ? a > f : k === 'below' ? a < f : a === f; }).length;
  const us = String(country).toUpperCase() === 'US';
  const revisions = out.filter(r => r.revised != null || r.revision).length;
  const pol = polarityFor(event);
  return {
    ok: true, found: true, country: String(country).toUpperCase(), event, matched, stored: series.length, printed: printed.length,
    first: isoDay(printed.at(-1).ms), last: isoDay(printed[0].ms),
    rows: out,
    summary: {
      withForecast: withEst.length, above: cnt('above'), inline: cnt('inline'), below: cnt('below'),
      scored: zs.length, medianAbsZ: zs.length ? r2(median(zs.map(Math.abs))) : null, maxAbsZ: zs.length ? r2(Math.max(...zs.map(Math.abs))) : null,
      polarity: pol.matched ? 'known' : 'assumed', zNote: zs.length ? null : (skipped?.reason ?? 'too few scored prints to standardise a surprise'),
    },
    missing: [
      'a forecast range (no free source gives one)',
      us ? 'revisions come from ALFRED vintages where the store has them' : 'revisions for this country appear only when a later print restates the previous value',
      ...(revisions ? [] : ['no revision is stored for the prints shown']),
      ...(zs.length ? [] : ['a surprise z (the series has too few scored prints)']),
    ],
    evidence: { id: 'surprise-size', say: 'The size of a surprise is validated (it widens the range); which way the next one lands cannot be predicted from the series.' },
  };
}
