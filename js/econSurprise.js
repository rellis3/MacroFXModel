/**
 * Econ Surprise Core — Tier-1 brick: a real economic-surprise index per currency.
 *
 * Why this exists. today.html's "Growth surprise by currency" bars did not measure
 * surprise. They plotted `ismEngine`'s `activity` score — a composite LEVEL
 * (industrial production plus regional Fed surveys for USD; an OECD
 * business-confidence proxy for the other seven, which that engine's own header is
 * explicit is not official PMI). A surprise is the distance between a release and
 * what was expected, and the two routinely point opposite ways for months: an economy
 * can be objectively weak and still beating a weaker consensus, which is the state FX
 * actually trades on.
 *
 * `/api/surprise` was supposed to carry the real thing and never could — it calls
 * Finnhub's `/calendar/economic`, a PREMIUM endpoint that 403s on a free or standard
 * key, and the handler swallows the failure and returns `[]`. Not broken loudly;
 * empty quietly. Meanwhile js/econCalendar.js already normalises every ForexFactory
 * row to { country, event, impact, time, ms, estimate, prev, actual } — every
 * ingredient, already flowing, already free.
 *
 * Construction (the standard economic-surprise-index shape):
 *   1. surprise_raw = actual − consensus, per release, in the release's own units.
 *   2. Standardise by THAT SERIES' own historical surprise dispersion, so a payrolls
 *      miss of 40k and a CPI miss of 0.1pp are comparable.
 *   3. Exponentially decay by age (default 60-day half-life) and average per
 *      currency, so the index fades as a surprise gets priced rather than dropping
 *      off a cliff at an arbitrary window edge.
 *
 * Honesty rules baked in, not bolted on:
 *   • A series with fewer than MIN_SERIES_OBS historical surprises has no usable
 *     dispersion, so it is EXCLUDED rather than standardised against a guess.
 *   • A currency below MIN_CCY_OBS scored releases reports `null`, with `n`, so the
 *     page can say "still collecting" instead of drawing a confident bar off two
 *     data points.
 *   • Direction is NOT inferred. Higher-is-stronger is true for growth and payrolls
 *     and false for unemployment and jobless claims, so the sign convention is an
 *     explicit table (INVERTED_HINTS) and anything unmatched is scored on its raw
 *     sign with `polarity: 'assumed'` reported alongside.
 *
 * Pure — no fetch, no KV, no globals. The server owns the store and the schedule.
 * Tested on synthetic releases in js/econSurprise.test.mjs (no network).
 */

export const DEFAULTS = {
  halfLifeDays: 60,      // a surprise is worth half as much after two months
  // Deep, because the store serves TWO consumers with opposite needs. The surprise
  // INDEX only cares about recent releases (the half-life makes anything older
  // weightless anyway), but the event-day study wants every occurrence it can get —
  // "how much does this pair move on CPI" is a question about sample size, not
  // recency. A 240-day cap silently threw away the history that question needs.
  maxAgeDays: 4000,      // ~11 years; decay, not truncation, is what ages the index
  minSeriesObs: 6,       // historical surprises needed before a series' sigma is trusted
  minCcyObs: 4,          // scored releases needed before a currency gets a number
  // A currency also needs RECENT releases before it gets a score. Without this, a
  // store full of backfilled history and nothing current produces a confident-looking
  // 0.00 — every release in it decayed to near-zero weight, so the weighted mean
  // collapses toward nothing and reports a large `n` behind it. That is a null
  // wearing a number, which is the exact failure this whole engine exists to avoid.
  recencyDays: 120,
  minRecentObs: 3,
  impacts: ['high', 'medium'],
};

// Releases where a HIGHER number is economically WEAKER. Matched case-insensitively
// as substrings against the event title, longest-first so "continuing claims" wins
// over "claims". Anything unmatched is scored higher-is-stronger and flagged.
export const INVERTED_HINTS = [
  'unemployment rate', 'unemployment change', 'unemployment claims',
  'continuing claims', 'initial jobless claims', 'jobless claims',
  'inventories', 'trade deficit',
];

const DAY_MS = 864e5;
const round2 = v => (v == null || !Number.isFinite(v) ? null : +v.toFixed(2));

/**
 * Parse a calendar value string into a number.
 *
 * Calendar feeds print "225K", "1.2M", "-0.1%", "3.2", "1.05B", "<0.1". Units are
 * consistent WITHIN a series (payrolls are always K, CPI always %), which is all
 * that matters here: everything is standardised per-series afterwards, so a scale
 * factor common to a series cancels out. Returns null for anything unparseable —
 * never 0, which would read as "came in exactly at consensus".
 */
export function parseCalNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let t = String(v).trim();
  if (!t) return null;
  t = t.replace(/[<>~]/g, '').replace(/,/g, '').trim();
  const m = /^(-?\d*\.?\d+)\s*([KMBT%])?/i.exec(t);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const suffix = (m[2] || '').toUpperCase();
  if (suffix === 'K') n *= 1e3;
  else if (suffix === 'M') n *= 1e6;
  else if (suffix === 'B') n *= 1e9;
  else if (suffix === 'T') n *= 1e12;
  return n;
}

/** Stable per-series key. Titles carry the period ("CPI m/m") but not the date. */
export function seriesKey(ev) {
  return `${String(ev?.country ?? '').toUpperCase()}|${String(ev?.event ?? '').trim().toLowerCase()}`;
}

/** +1 if higher is economically stronger, −1 if inverted. `matched` says which. */
export function polarityFor(eventTitle) {
  const t = String(eventTitle ?? '').toLowerCase();
  for (const hint of [...INVERTED_HINTS].sort((a, b) => b.length - a.length)) {
    if (t.includes(hint)) return { sign: -1, matched: true };
  }
  return { sign: 1, matched: false };
}

/**
 * Releases → per-release standardised surprises.
 *
 * `events` = the normalized calendar shape (js/econCalendar.js). Only rows with BOTH
 * an actual and a consensus are scorable — a release with no published consensus has
 * no surprise, by definition, and is skipped rather than compared to `prev`.
 */
export function scoreReleases(events = [], opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const now = o.now ?? Date.now();
  const wanted = new Set(o.impacts.map(x => x.toLowerCase()));

  // Group by series so each gets its own dispersion.
  const bySeries = new Map();
  for (const ev of events) {
    if (!ev || ev.ms == null) continue;
    if (wanted.size && !wanted.has(String(ev.impact ?? '').toLowerCase())) continue;
    const ageDays = (now - ev.ms) / DAY_MS;
    if (!(ageDays >= 0) || ageDays > o.maxAgeDays) continue;
    const actual = parseCalNumber(ev.actual);
    const est = parseCalNumber(ev.estimate);
    if (actual == null || est == null) continue;
    const k = seriesKey(ev);
    if (!bySeries.has(k)) bySeries.set(k, []);
    bySeries.get(k).push({ ev, ageDays, raw: actual - est });
  }

  const scored = [], skipped = [];
  for (const [key, rows] of bySeries) {
    if (rows.length < o.minSeriesObs) {
      skipped.push({ series: key, n: rows.length, reason: 'too few historical surprises to standardise' });
      continue;
    }
    const raws = rows.map(r => r.raw);
    const mean = raws.reduce((a, x) => a + x, 0) / raws.length;
    const sd = Math.sqrt(raws.reduce((a, x) => a + (x - mean) ** 2, 0) / Math.max(1, raws.length - 1));
    if (!(sd > 0)) {
      skipped.push({ series: key, n: rows.length, reason: 'series never surprises — zero dispersion' });
      continue;
    }
    for (const r of rows) {
      const pol = polarityFor(r.ev.event);
      const z = ((r.raw - mean) / sd) * pol.sign;
      scored.push({
        series: key, country: String(r.ev.country ?? '').toUpperCase(), event: r.ev.event,
        time: r.ev.time ?? null, ms: r.ev.ms, impact: r.ev.impact ?? null,
        actual: r.ev.actual, estimate: r.ev.estimate,
        raw: round2(r.raw), z: round2(z), ageDays: Math.round(r.ageDays),
        weight: round2(Math.pow(0.5, r.ageDays / o.halfLifeDays)),
        polarity: pol.matched ? 'known' : 'assumed',
      });
    }
  }
  scored.sort((a, b) => b.ms - a.ms);
  return { scored, skipped, seriesCount: bySeries.size };
}

/** Finnhub-style country code → currency. Mirrors econCalendar's CCY_TO_COUNTRY. */
export const COUNTRY_TO_CCY = {
  US: 'USD', EU: 'EUR', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR',
  GB: 'GBP', UK: 'GBP', JP: 'JPY', AU: 'AUD', NZ: 'NZD', CA: 'CAD', CH: 'CHF', CN: 'CNY',
};

/**
 * Per-currency decayed surprise index.
 *
 * Returns { byCcy: { CCY: { score, n, nSeries, lastAsOf, assumedPolarity, top } },
 *           skipped, generatedFrom }. `score` is a weighted mean of standardised
 *   surprises, so it reads directly in sigma: +1.0 = this economy has been beating
 *   consensus by about one typical surprise, decay-weighted. null when a currency
 *   has too few scored releases to say anything.
 */
export function buildSurpriseIndex(events = [], opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const { scored, skipped, seriesCount } = scoreReleases(events, o);
  const byCcy = {};
  for (const r of scored) {
    const ccy = COUNTRY_TO_CCY[r.country];
    if (!ccy) continue;
    (byCcy[ccy] ??= { rows: [] }).rows.push(r);
  }
  const out = {};
  for (const [ccy, v] of Object.entries(byCcy)) {
    const rows = v.rows;
    const wSum = rows.reduce((a, r) => a + r.weight, 0);
    // Recent enough to say anything? See DEFAULTS.recencyDays.
    const recent = rows.filter(r => r.ageDays != null && r.ageDays <= o.recencyDays).length;
    const enoughRecent = recent >= o.minRecentObs;
    const score = (rows.length >= o.minCcyObs && enoughRecent && wSum > 0)
      ? round2(rows.reduce((a, r) => a + r.z * r.weight, 0) / wSum)
      : null;
    out[ccy] = {
      score, n: rows.length,
      nRecent: recent, recencyDays: o.recencyDays,
      // Distinguishes "not enough history yet" from "plenty of history, none of it
      // recent" — different problems with different fixes, and the page says which.
      staleOnly: rows.length >= o.minCcyObs && !enoughRecent,
      nSeries: new Set(rows.map(r => r.series)).size,
      lastAsOf: rows[0]?.time ?? null,
      // How much of this currency's reading rests on a polarity we inferred rather
      // than one we know. High = read the sign with suspicion.
      assumedPolarity: rows.length ? round2(rows.filter(r => r.polarity === 'assumed').length / rows.length) : null,
      // The releases actually moving the number — biggest weighted contribution first.
      top: rows.slice()
        .sort((a, b) => Math.abs(b.z * b.weight) - Math.abs(a.z * a.weight))
        .slice(0, 5)
        .map(r => ({ event: r.event, time: r.time, z: r.z, actual: r.actual, estimate: r.estimate, polarity: r.polarity })),
      pending: rows.length < o.minCcyObs ? o.minCcyObs - rows.length
             : (!enoughRecent ? o.minRecentObs - recent : 0),
    };
  }
  return {
    byCcy: out, skipped, seriesCount,
    scoredCount: scored.length,
    halfLifeDays: o.halfLifeDays, minSeriesObs: o.minSeriesObs, minCcyObs: o.minCcyObs,
  };
}

/**
 * Per-series recent history: the last N printed releases of each series, newest first.
 *
 * A daily brief that can say "CPI is due Thursday" but not "and the last three came in
 * hot, hot, in line" is missing the half that makes the event readable. The store
 * already holds this; it was only ever aggregated into a per-currency score.
 *
 * `z` is present only where the series cleared the standardisation bar — a raw beat
 * with no dispersion behind it is reported as a beat, not as a sigma.
 */
export function seriesHistory(events = [], opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const n = o.perSeries ?? 4;
  const { scored } = scoreReleases(events, o);
  const zBy = new Map();
  for (const r of scored) zBy.set(`${r.series}|${r.ms}`, r.z);

  const bySeries = new Map();
  for (const ev of events) {
    if (!ev || ev.ms == null || ev.actual == null || ev.actual === '') continue;
    const k = seriesKey(ev);
    if (!bySeries.has(k)) bySeries.set(k, []);
    const est = parseCalNumber(ev.estimate), act = parseCalNumber(ev.actual);
    bySeries.get(k).push({
      time: ev.time ?? null, ms: ev.ms, actual: ev.actual, estimate: ev.estimate,
      beat: (act != null && est != null) ? (act > est ? 'above' : act < est ? 'below' : 'inline') : null,
      z: zBy.get(`${k}|${ev.ms}`) ?? null,
    });
  }
  const out = {};
  for (const [k, rows] of bySeries) {
    rows.sort((a, b) => b.ms - a.ms);
    out[k] = rows.slice(0, n);
  }
  return out;
}

/**
 * Merge freshly-fetched calendar rows into a stored release history, de-duplicated.
 *
 * The calendar feed only ever exposes ONE WEEK, so a surprise index has to be
 * accumulated: this is called on a schedule, and only rows that have actually
 * printed (`actual` present) are worth keeping. A row already stored is UPDATED
 * rather than duplicated, because a release's actual is often revised, and its
 * estimate can be filled in late.
 */
export function mergeReleases(stored = [], incoming = [], opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const now = o.now ?? Date.now();
  const idOf = e => `${seriesKey(e)}|${e.ms}`;
  const map = new Map();
  for (const e of Array.isArray(stored) ? stored : []) {
    if (e?.ms == null) continue;
    map.set(idOf(e), e);
  }
  let added = 0, updated = 0;
  for (const e of Array.isArray(incoming) ? incoming : []) {
    if (!e || e.ms == null) continue;
    if (e.actual == null || e.actual === '') continue;      // not out yet — nothing to score
    const id = idOf(e);
    const keep = {
      country: String(e.country ?? '').toUpperCase(), event: e.event ?? '',
      impact: String(e.impact ?? '').toLowerCase(), time: e.time ?? null, ms: e.ms,
      estimate: e.estimate ?? null, prev: e.prev ?? null, actual: e.actual ?? null,
    };
    if (map.has(id)) {
      const prevRow = map.get(id);
      if (prevRow.actual !== keep.actual || prevRow.estimate !== keep.estimate) updated++;
    } else added++;
    map.set(id, keep);
  }
  // Drop what has aged out of the index window entirely, so the store is bounded.
  const cutoff = now - o.maxAgeDays * DAY_MS;
  const rows = [...map.values()].filter(e => e.ms >= cutoff).sort((a, b) => a.ms - b.ms);
  return { rows, added, updated, dropped: map.size - rows.length };
}
