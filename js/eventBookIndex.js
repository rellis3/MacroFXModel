// js/eventBookIndex.js — matching the CALENDAR's wording to the BOOK's families.
//
// WHY THIS EXISTS. The Event Response Book and the economic calendar came from different
// vendors and name the same release differently:
//
//   calendar                      book
//   Core PCE Price Index m/m      US Core PCE Price Index Month-over-Month
//   Non-Farm Employment Change    US Payroll Jobs Growth
//   Unemployment Rate             US Headline Unemployment Rate
//   Official Bank Rate            GB BoE Interest Rate Decision
//
// Nothing mapped one to the other, so the release picker listed 76 long-form names a
// reader had never seen on the calendar, in an order driven by historic spike size, with
// no sign of which ones were actually due. Checked against the live feed on 2026-10-01,
// ZERO of the ten high-impact events that week resolved to a book family by name.
//
// The page did have a bridge, but a lossy one: EVENT_IMPACT_MAP collapses the 76 families
// into 16 country|category buckets, each pointing at ONE representative family. So
// Unemployment Rate rendered PAYROLLS' figures -- both bucket to US|employment, whose
// representative is us|payroll-jobs-growth -- while us|headline-unemployment-rate sat in
// the book unused. Core PCE was in the book and unreachable for the same reason.
//
// This resolves a release to its OWN family. Where there is genuinely no family, it says
// so and the caller shows nothing, which is the honest answer and the one the book's own
// method section demands: 8 of those 10 events really are outside the book (it holds one
// AU family and no US GDP at all).
//
// Pure: strings and plain objects in, plain objects out. No DOM, no fetch.

/**
 * Calendar shorthand the book spells out. Applied before slugging, longest first so
 * "m/m" inside a longer token cannot half-match.
 */
const EXPANSIONS = [
  [/\bq\/q\b/gi, ' quarter-over-quarter '],
  [/\bm\/m\b/gi, ' month-over-month '],
  [/\by\/y\b/gi, ' year-over-year '],
  [/\bmom\b/gi, ' month-over-month '],
  [/\byoy\b/gi, ' year-over-year '],
  [/\bqoq\b/gi, ' quarter-over-quarter '],
  [/\bprelim\b/gi, ' prel '],
  [/\bpreliminary\b/gi, ' prel '],
];

/** A release name reduced to the book's slug shape. */
export function slugify(name) {
  let s = ` ${String(name ?? '')} `;
  for (const [re, to] of EXPANSIONS) s = s.replace(re, to);
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Releases the two vendors genuinely call different things, keyed country -> slug.
 *
 * Deliberately NOT a fuzzy matcher. A near-miss here puts one release's measured figures
 * under another release's name, which is the exact bug this file was written to fix, so
 * every entry is a judgement someone made once and can be read back.
 *
 * Note what is absent: headline CPI is NOT aliased to the book's core-inflation family.
 * They are different series and pretending otherwise would be the same error again.
 */
export const EVENT_ALIASES = {
  us: {
    'non-farm-employment-change': 'payroll-jobs-growth',
    'non-farm-payrolls': 'payroll-jobs-growth',
    'unemployment-rate': 'headline-unemployment-rate',
    'federal-funds-rate': 'fed-interest-rate-decision',
    'fomc-statement': 'fed-interest-rate-decision',
    'fomc-economic-projections': 'fed-interest-rate-decision',
    'core-cpi-month-over-month': 'core-inflation-rate-month-over-month',
    'ppi-month-over-month': 'producer-price-index-month-over-month',
    'core-ppi-month-over-month': 'producer-price-index-month-over-month',
    'ism-services-pmi': 'ism-non-manufacturing-pmi',
    'ism-manufacturing-prices': 'ism-manufacturing-pmi',
    'jolts-job-openings': 'jolts-job-openings',
    'prelim-um-consumer-sentiment': 'michigan-consumer-sentiment-prel',
    'revised-um-consumer-sentiment': 'michigan-consumer-sentiment-prel',
    'crude-oil-inventories': 'eia-weekly-crude-oil-inventory',
    'natural-gas-storage': 'weekly-natural-gas-storage-report',
    'core-retail-sales-month-over-month': 'retail-sales-excluding-autos-month-over-month',
    'hpi-month-over-month': 's-p-case-shiller-home-price-year-over-year',
  },
  gb: {
    'official-bank-rate': 'boe-interest-rate-decision',
    'bank-rate': 'boe-interest-rate-decision',
    'monetary-policy-summary': 'boe-interest-rate-decision',
    'cpi-year-over-year': 'inflation-rate-year-over-year',
    'claimant-count-change': 'claimant-count-change',
    'gdp-month-over-month': 'gdp-month-over-month',
    'retail-sales-month-over-month': 'retail-sales-month-over-month',
  },
  eu: {
    'main-refinancing-rate': 'ecb-interest-rate-decision',
    'minimum-bid-rate': 'ecb-interest-rate-decision',
    'deposit-facility-rate': 'deposit-facility-rate',
    'core-cpi-flash-estimate-year-over-year': 'core-inflation-rate-year-over-year-final',
    'cpi-flash-estimate-year-over-year': 'inflation-rate-year-over-year-flash-estimate',
    'german-zew-economic-sentiment': 'zew-economic-sentiment-index',
  },
  ca: { 'overnight-rate': 'overnight-rate', 'boc-rate-statement': 'overnight-rate', 'unemployment-rate': 'unemployment-rate' },
  nz: { 'official-cash-rate': 'official-cash-rate', 'rbnz-rate-statement': 'official-cash-rate' },
  au: { 'employment-change': 'employment-change' },
};

/**
 * The book family for one calendar event, or null when the book does not hold it.
 *
 * @param {string} country  the calendar's country code ("US", "AU", ...)
 * @param {string} event    the calendar's own wording
 * @param {object} families BOOK.families, keyed "country|slug"
 */
export function familyFor(country, event, families) {
  if (!families || !country || !event) return null;
  const c = String(country).toLowerCase();
  const slug = slugify(event);
  const alias = EVENT_ALIASES[c]?.[slug];
  for (const s of [alias, slug].filter(Boolean)) {
    const key = `${c}|${s}`;
    if (families[key]) return key;
    // Two families are stored WITHOUT a country prefix -- "fomc" and "beige-book" -- so
    // a country|slug lookup alone can never reach them. (They are ordinary families with
    // real labels and eight instruments each; only their keys are shaped differently.)
    if (families[s]) return s;
  }
  return null;
}

/** A family with no label and no measured instruments is not a choice, it is a hole. */
export function isRealFamily(key, families, book) {
  const f = families?.[key];
  if (!f || !f.label || /undefined/i.test(String(f.label))) return false;
  return Object.keys(book?.[key]?.instruments ?? {}).length > 0;
}

/**
 * Order the release picker: what is DUE first, then what actually moves, then the rest.
 *
 * The old order was spike size alone, so a reader checking tomorrow's payrolls had to know
 * the book's name for it and hunt. `due` carries the calendar's own wording and when it
 * lands, so the option reads the way the calendar reads.
 *
 * @param {object} families BOOK.families
 * @param {object} book     BOOK.book (for the instrument check)
 * @param {Array}  events   calendar rows: { country, event, ms, impact }
 * @param {number} [now]
 * @returns {{due:Array, movers:Array, rest:Array, dueByKey:Map}}
 */
export function orderFamilies(families, book, events, now = Date.now()) {
  const keys = Object.keys(families ?? {}).filter(k => isRealFamily(k, families, book));
  const spike = k => families[k]?.joinProof?.medianSpikeR0 ?? 0;

  // soonest first, and an event already out still counts for the rest of its day
  const dueByKey = new Map();
  for (const e of (events ?? []).slice().sort((a, b) => (a.ms ?? 0) - (b.ms ?? 0))) {
    if ((e.impact ?? '').toLowerCase() !== 'high') continue;
    if (!(e.ms > now - 864e5)) continue;
    const key = familyFor(e.country, e.event, families);
    if (!key || !keys.includes(key) || dueByKey.has(key)) continue;
    dueByKey.set(key, { country: e.country, event: e.event, ms: e.ms, past: e.ms < now });
  }

  const due = [...dueByKey.keys()].sort((a, b) => dueByKey.get(a).ms - dueByKey.get(b).ms);
  const dueSet = new Set(due);
  const left = keys.filter(k => !dueSet.has(k)).sort((a, b) => spike(b) - spike(a));
  // 2x is the bar the book itself uses to call a reaction real
  const movers = left.filter(k => spike(k) >= 2);
  const rest = left.filter(k => spike(k) < 2);
  return { due, movers, rest, dueByKey };
}
