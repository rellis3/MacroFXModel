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
/**
 * The field is called `gmt` and it is NOT GMT. It is US Eastern.
 *
 * Verified against a known release: the US flash PMI prints at 09:45 New York / 13:45
 * UTC, and this feed reports `gmt: "09:45"`. Reading it as UTC put every printed row
 * four or five hours early, silently, on both pages that show it.
 *
 * The row's DATE is the UTC date, though, while the clock is Eastern — an Australian
 * release at 01:30 UTC is filed under that UTC date with `gmt: "21:30"`, which is the
 * previous evening in New York. So the wall clock is converted from Eastern and then
 * pulled onto the row's own date: whichever of the day before, the day, or the day
 * after lands on the stated UTC date is the right instant. Getting this wrong by a day
 * is worse than getting it wrong by hours, because the release drops off the panel
 * entirely.
 */
const _ET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
/** How far New York's wall clock is from UTC at this instant, in ms (negative). */
function etOffsetMs(ms) {
  const p = Object.fromEntries(_ET.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second) - ms;
}
export function etClockToUtcMs(isoDate, hh, mm) {
  const guess = Date.parse(`${isoDate}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
  if (!Number.isFinite(guess)) return null;
  let ms = guess - etOffsetMs(guess);
  ms = guess - etOffsetMs(ms);                       // one refinement, for the DST edges
  // pull it onto the row's stated UTC date
  for (const shift of [0, -864e5, 864e5]) {
    if (new Date(ms + shift).toISOString().slice(0, 10) === isoDate) return ms + shift;
  }
  return ms;
}

export function parseNasdaq(json, isoDate) {
  const rows = json?.data?.rows ?? [];
  const out = [];
  for (const r of rows) {
    const t = String(r?.gmt ?? '').match(/^(\d{1,2}):(\d{2})/);
    if (!t || !isoDate) continue;
    const ms = etClockToUtcMs(isoDate, t[1], t[2]);
    if (!Number.isFinite(ms)) continue;
    const actual = num(r.actual), consensus = num(r.consensus), previous = num(r.previous);
    out.push({
      ms, country: String(r.country ?? '').trim(),
      event: String(r.eventName ?? '').trim(),
      actual, consensus, previous,
      raw: { actual: r.actual ?? null, consensus: r.consensus ?? null, previous: r.previous ?? null },
      surprise: (actual != null && consensus != null) ? +(actual - consensus).toFixed(4) : null,
      // A release HAPPENED if the feed carries any actual at all. Deriving this from the
      // PARSED number meant "39.5K" — which num() deliberately leaves alone, because a
      // headcount surprise is not comparable with a percentage one — read as not yet
      // printed, and Australia's employment report vanished from the panel. Printed and
      // scorable are two different things and this is the first of them.
      released: String(r.actual ?? '').trim() !== '',
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

/**
 * WHAT TO WATCH WHEN IT PRINTS — the release, the tiles it lands on, and why.
 *
 * A diary that says "US CPI, 13:30" tells you when to look and nothing about where.
 * This maps a release family onto the board keys it transmits through, with the
 * mechanism named, so the panel can say *watch breakevens and the real 10-year*
 * rather than *high impact*.
 *
 * TWO HONEST LIMITS, BOTH DELIBERATE.
 *
 * The `keys` are a TRANSMISSION CHANNEL, not a prediction: they say which tiles
 * carry the news, never which way any of them goes. The sign genuinely depends on
 * what was already priced, and this desk's own tests are blunt about that — the
 * "priced-in" claim came back null, and surprise size validated for RANGE only, not
 * for direction. Nothing here says up or down.
 *
 * The match is on the event NAME, and names drift. An unmatched release is returned
 * with `family: null` and is still shown — a diary that quietly drops what it cannot
 * classify is worse than one that admits the gap, because the release still happens.
 */
export const FAMILIES = [
  { family: 'CPI', re: /\b(cpi|consumer price|inflation rate|harmonised index|hicp)\b/i,
    keys: ['bei', 'tips', 'us2y', 'realshare', 'gold'],
    why: 'Inflation data splits a yield move into its two halves: breakevens carry the inflation part, the real 10-year the policy part. Watch which one takes it — that is what "real vs inflation" on this board is for.' },
  { family: 'Payrolls', re: /\b(non[- ]?farm|nfp|employment change|unemployment rate|payroll|jobless|claims|average (hourly )?earnings)\b/i,
    keys: ['us2y', 'curve', 'r2k', 'breadth', 'dxy'],
    why: 'Labour data is the front end\'s data. The 2-year moves first, the curve re-shapes around it, and the Russell answers before the Nasdaq because small caps borrow at floating rates.' },
  { family: 'Central bank', re: /\b(fomc|rate (decision|statement)|monetary policy|interest rate decision|policy (rate|assessment)|press conference|bank rate)\b/i,
    keys: ['us2y', 'curve', 'dxy', 'vixterm', 'eurusd'],
    why: 'A decision is priced long before it lands; what re-prices is the path. The front end and the curve carry that, and the VIX term structure tells you whether the market thought the risk was this meeting or the next.' },
  { family: 'Speech', re: /\b(speaks|speech|testimony|testifies|remarks)\b/i,
    keys: ['us2y', 'dxy'],
    why: 'Unscheduled in content even when scheduled in time. The front end and the dollar are where a changed tone shows up first; nothing else is worth watching for it.' },
  { family: 'Growth', re: /\b(gdp|pmi|ism|manufacturing|industrial (production|trends)|retail sales|factory orders|durable goods|trade balance|business climate|ifo|zew|tankan|sentiment|confidence)\b/i,
    keys: ['copper', 'r2k', 'curve', 'audusd', 'oil'],
    why: 'Growth data lands on the growth assets, not on the safe ones. Copper and the Russell carry it; if the curve steepens with them the market read it as real growth rather than as a rate story.' },
  { family: 'Energy', re: /\b(crude oil inventories|eia|natural gas storage|opec|rig count)\b/i,
    keys: ['oil', 'brent', 'crack', 'ovx', 'natgas'],
    why: 'Supply data, so it moves crude without moving the growth complex — and the crack spread says whether the pump price follows. A crude move that does not reach copper was about barrels.' },
  { family: 'Housing', re: /\b(housing starts|building permits|home sales|house price|mortgage)\b/i,
    keys: ['us10y', 'r2k', 'tips'],
    why: 'Housing is the long end\'s economy: it responds to the 30-year mortgage, which follows the 10-year. It is the slowest transmission on this board and the one that confirms rather than leads.' },
];

/** The family for one event name, or null when nothing matches. */
export function familyOf(event) {
  const s = String(event ?? '');
  return FAMILIES.find(f => f.re.test(s)) ?? null;
}

/**
 * Attach the family to every row of a day group or a printed list.
 *
 * Returns a NEW array; the input is untouched, so the same feed can be annotated by
 * two panels without one seeing the other's additions.
 */
export function annotate(rows = []) {
  return (Array.isArray(rows) ? rows : []).map(r => {
    const f = familyOf(r.event);
    return { ...r, family: f?.family ?? null, keys: f?.keys ?? [], why: f?.why ?? null };
  });
}

/**
 * The board keys worth watching over a set of upcoming days, most-cited first.
 *
 * Counts how many scheduled releases transmit through each tile, so a week with three
 * inflation prints and one speech points at breakevens rather than at the dollar. A
 * count is all it is — it says where the news lands, never what it will do there.
 */
export function watchKeys(groups = [], { limit = 6 } = {}) {
  const n = new Map();
  for (const g of (Array.isArray(groups) ? groups : []))
    for (const e of (g.events ?? []))
      for (const k of (familyOf(e.event)?.keys ?? [])) n.set(k, (n.get(k) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([key, count]) => ({ key, count }));
}

/**
 * A printed release in words.
 *
 * Deliberately says BIGGER or SMALLER than expected, not better or worse: whether a
 * hot CPI is good news depends on what you own, and a diary that decides that for you
 * is editorialising. The size is the raw gap in the release's own units — this desk's
 * surprise store (econ_surprise_v1) is what standardises against history, and pretending
 * a 0.1 miss on CPI and a 0.1 miss on a PMI are the same size would be wrong.
 */
export function surpriseWords(row) {
  if (!row?.released) return 'has not printed';
  if (row.surprise == null) return row.consensus == null ? 'printed, with no consensus to score it against' : 'printed';
  if (row.surprise === 0) return 'printed exactly on consensus';
  return `printed ${Math.abs(row.surprise)} ${row.surprise > 0 ? 'above' : 'below'} the ${row.raw?.consensus ?? row.consensus} expected`;
}
