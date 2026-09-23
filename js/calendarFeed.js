/**
 * The economic calendar, from two free feeds that do different jobs.
 *
 * WHY THIS REPLACES WHAT WAS THERE. `/api/calendar-events` parses a ForexFactory CSV
 * that stopped on 2026-07-02 and tops it up from Finnhub. Finnhub's free tier dropped
 * the economic calendar — the key is set and the endpoint answers
 * `{"error":"You don't have access to this resource."}` — so the top-up returns
 * nothing, forever, and the terminal reported an EMPTY DIARY on a day when both
 * sources were simply silent. Absence of data rendered as absence of risk.
 *
 * TWO FEEDS, NOT ONE MERGED FEED. They answer different questions and merging them
 * would mean fuzzy-matching event names across two naming conventions, which fails
 * quietly and in a way nobody notices:
 *
 *   AHEAD    ForexFactory's own JSON. Free, no key, carries the IMPACT rating, which
 *            is the only field that matters for "what could move the board this week".
 *            One week only — there is no next-week URL.
 *   PRINTED  Nasdaq's calendar. Free, no key, per-day, and carries ACTUAL, CONSENSUS
 *            and PREVIOUS — so a release can be scored as a surprise rather than just
 *            noted as having happened.
 *
 * Pure: no fetch, no DOM. The caller supplies the raw payloads. Tested in
 * js/calendarFeed.test.mjs.
 */

/** ForexFactory impact strings → the 1-3 rank the rest of this codebase uses. */
const FF_RANK = { High: 3, Medium: 2, Low: 1, Holiday: 0 };

/** Their country codes are already ISO currency codes, bar a couple. */
const FF_CCY = { EUR: 'EUR', USD: 'USD', GBP: 'GBP', JPY: 'JPY', AUD: 'AUD',
                 NZD: 'NZD', CAD: 'CAD', CHF: 'CHF', CNY: 'CNY', ALL: 'ALL' };

/**
 * Normalise ForexFactory's weekly JSON.
 *
 * `date` is ISO with an offset; Date.parse handles it. Rows with an unparseable date
 * are dropped rather than defaulted to now — a release with the wrong time is worse
 * than a release that is missing, because it will be trusted.
 */
export function parseForexFactory(json) {
  const rows = Array.isArray(json) ? json : [];
  const out = [];
  for (const r of rows) {
    const ms = Date.parse(r?.date ?? '');
    if (!Number.isFinite(ms)) continue;
    const rank = FF_RANK[r.impact] ?? 0;
    out.push({
      ms, ccy: FF_CCY[r.country] ?? String(r.country ?? '').toUpperCase(),
      rank, impact: r.impact ?? null,
      event: String(r.title ?? '').trim(),
      forecast: r.forecast || null, previous: r.previous || null,
      source: 'forexfactory',
    });
  }
  return out.sort((a, b) => a.ms - b.ms);
}

/** "2.20%" / "-0.20%" / "55.7" / "" → a number, or null. */
export function num(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  // strip the unit but keep the sign and decimal; K/M/B are left alone because a
  // surprise on a headcount is not comparable with one on a percentage anyway
  const m = s.replace(/,/g, '').match(/^(-?\d+(?:\.\d+)?)\s*%?$/);
  return m ? Number(m[1]) : null;
}

/**
 * Normalise one day of Nasdaq's calendar, and score the surprise where it can be.
 *
 * `surprise` is actual minus consensus in the release's own units. Deliberately NOT
 * standardised: a 0.1 miss on CPI and a 0.1 miss on a PMI are not the same size, and
 * this desk has a surprise store (econ_surprise_v1) that does that job properly with
 * historical dispersion. This is the raw gap, labelled as such.
 */
export function parseNasdaq(json, isoDate) {
  const rows = json?.data?.rows ?? [];
  const out = [];
  for (const r of rows) {
    const t = String(r?.gmt ?? '').match(/^(\d{1,2}):(\d{2})/);
    if (!t || !isoDate) continue;
    const ms = Date.parse(`${isoDate}T${String(t[1]).padStart(2, '0')}:${t[2]}:00Z`);
    if (!Number.isFinite(ms)) continue;
    const actual = num(r.actual), consensus = num(r.consensus), previous = num(r.previous);
    out.push({
      ms, country: String(r.country ?? '').trim(),
      event: String(r.eventName ?? '').trim(),
      actual, consensus, previous,
      raw: { actual: r.actual ?? null, consensus: r.consensus ?? null, previous: r.previous ?? null },
      surprise: (actual != null && consensus != null) ? +(actual - consensus).toFixed(4) : null,
      released: actual != null,
      source: 'nasdaq',
    });
  }
  return out.sort((a, b) => a.ms - b.ms);
}

/**
 * What is ahead, grouped by day.
 *
 * `minRank` 3 keeps only the releases that actually move a board. Anything already in
 * the past is dropped with an hour of slack, so a release that has just printed does
 * not vanish from the panel mid-session.
 */
export function upcoming(events = [], nowMs = Date.now(), { days = 7, minRank = 3 } = {}) {
  const end = nowMs + days * 864e5;
  const keep = (Array.isArray(events) ? events : []).filter(e => e.rank >= minRank && e.ms >= nowMs - 36e5 && e.ms <= end);
  const byDay = new Map();
  for (const e of keep) {
    const d = new Date(e.ms).toISOString().slice(0, 10);
    if (!byDay.has(d)) byDay.set(d, []);
    const list = byDay.get(d);
    // the feed ships exact duplicates; one line per event per time
    if (!list.some(x => x.event === e.event && x.ms === e.ms)) list.push(e);
  }
  return [...byDay.entries()]
    .map(([date, list]) => ({ date, n: list.length, imminent: Date.parse(date + 'T23:59:59Z') <= nowMs + 2 * 864e5, events: list }))
    .sort((a, b) => a.date < b.date ? -1 : 1);
}

/**
 * What printed, biggest surprise first.
 *
 * A release with no consensus cannot be scored and is reported as released with a null
 * surprise rather than silently dropped — "it came out and nobody had a number" is
 * itself worth seeing.
 */
export function printed(rows = [], { limit = 12 } = {}) {
  const done = (Array.isArray(rows) ? rows : []).filter(r => r.released);
  const scored = done.filter(r => r.surprise != null);
  const unscored = done.filter(r => r.surprise == null);
  return {
    n: done.length, scored: scored.length,
    rows: [...scored.sort((a, b) => Math.abs(b.surprise) - Math.abs(a.surprise)), ...unscored].slice(0, limit),
  };
}

/**
 * Is the calendar readable at all?
 *
 * The state that had to exist: both feeds silent must never render as a clear diary.
 */
export function calendarHealth(ff = null, nas = null) {
  const ffN = Array.isArray(ff) ? ff.length : null;
  const nasN = Array.isArray(nas) ? nas.length : null;
  if (ffN == null && nasN == null) return { state: 'bad', detail: 'both calendar feeds failed — event risk is UNKNOWN, not clear' };
  if (!ffN && !nasN) return { state: 'bad', detail: 'both calendar feeds answered with nothing — treat as UNKNOWN, not clear' };
  if (!ffN) return { state: 'warn', detail: `the schedule feed returned nothing; ${nasN} released rows only` };
  if (nasN == null || !nasN) return { state: 'warn', detail: `${ffN} scheduled, but no released data to score against` };
  return { state: 'ok', detail: `${ffN} scheduled this week, ${nasN} rows released today` };
}
