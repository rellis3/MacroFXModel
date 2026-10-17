// js/nasdaqReleases.js — non-US economic releases (actual + consensus) from Nasdaq's calendar, shaped for the
// surprise store (js/econSurprise.js). Pure: no I/O.
//
// WHY: the surprise index needs actual MINUS consensus. ForexFactory supplies the consensus but no actuals, and
// the statistics-office fills (ONS, StatCan, Eurostat in js/fredActuals.js) supply actuals for a handful of
// releases only, so six of eight currencies had no live prints for months (EUR since 2025-04). Nasdaq's calendar
// carries actual AND consensus for every country, with years of history. Its list for ?date=D is New York date
// D-1 (js/calendarFeed.js parseNasdaq handles that), so rows arrive with correct instants.
//
// Nasdaq names releases differently from ForexFactory, so its rows form their OWN series (own dispersion
// history). To never count one release twice, a Nasdaq row is dropped when the store already holds a row for
// the same country within DEDUPE_MS that came from another source (ForexFactory / a statistics office).

export const NASDAQ_COUNTRY = {
  'Euro Zone': 'EU', Germany: 'DE', France: 'FR', Italy: 'IT', Spain: 'ES',
  'United Kingdom': 'GB', Japan: 'JP', Australia: 'AU', 'New Zealand': 'NZ', Canada: 'CA', Switzerland: 'CH',
};
export const DEDUPE_MS = 10 * 60_000;
export const SRC = 'nasdaq';

// Nasdaq has no impact rating. The surprise engine keeps 'high' and 'medium' only, so: high = the releases that
// move a currency on the day; medium = the rest of the macro calendar worth a surprise; everything else (speeches,
// auctions, minor sub-indices) is 'low' and ignored.
const HIGH = /rate decision|interest rate|cash rate|bank rate|policy rate|\bcpi\b|consumer price|inflation rate|hicp|nonfarm|employment change|unemployment rate|\bgdp\b|retail sales/i;
const MEDIUM = /\bpmi\b|\bppi\b|producer price|sentiment|confidence|business climate|\bifo\b|\bzew\b|tankan|trade balance|current account|industrial production|manufacturing production|wage|earnings|labour cost|labor cost|claimant|jobless|unemployment change|housing|building|construction output|household spending|machinery orders/i;
const SKIP = /speaks|speech|auction|holiday|meeting minutes|press conference|testifies|bond purchase|\bbill\b/i;

export function impactOf(name) {
  const n = String(name ?? '');
  if (!n || SKIP.test(n)) return 'low';
  if (HIGH.test(n)) return 'high';
  if (MEDIUM.test(n)) return 'medium';
  return 'low';
}

const clean = v => { const s = String(v ?? '').replace(/&nbsp;/gi, ' ').trim(); return s ? s : null; };
const utcStr = ms => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);

/**
 * Parsed Nasdaq rows (calendarFeed.parseNasdaq output) -> surprise-store releases.
 * Only countries in NASDAQ_COUNTRY (US is left to ForexFactory + FRED), only released rows with an actual.
 */
export function toSurpriseRows(parsed = []) {
  const out = [];
  // Nasdaq sometimes lists two releases under ONE name at one instant ('German CPI' = the y/y AND the m/m print).
  // They would collide in the store (series + instant is the row id) and mix two dispersions into one series, and
  // nothing in the row says which is which -- so an ambiguous name at an instant is dropped, both copies.
  const seen = new Map();
  for (const r of Array.isArray(parsed) ? parsed : []) { const k = `${r?.country}|${String(r?.event ?? '').trim()}|${r?.ms}`; seen.set(k, (seen.get(k) ?? 0) + 1); }
  for (const r of Array.isArray(parsed) ? parsed : []) {
    if ((seen.get(`${r?.country}|${String(r?.event ?? '').trim()}|${r?.ms}`) ?? 0) > 1) continue;
    const country = NASDAQ_COUNTRY[r?.country];
    if (!country || !Number.isFinite(r?.ms)) continue;
    const actual = clean(r.raw?.actual), estimate = clean(r.raw?.consensus);
    if (!actual) continue;
    const impact = impactOf(r.event);
    if (impact === 'low') continue;
    out.push({ country, event: String(r.event).trim(), impact, time: utcStr(r.ms), ms: r.ms,
      estimate, prev: clean(r.raw?.previous), actual, src: SRC });
  }
  return out;
}

// A release family + period, vendor-neutral: ForexFactory's "Core CPI y/y" and Nasdaq's "Core CPI (YoY)" map to
// the same key; UK CPI and UK PPI printed at the same 07:00 do not.
const FAMILIES = [
  ['corecpi', /core (cpi|consumer price|inflation|hicp)/i], ['cpi', /\bcpi\b|consumer price|hicp|inflation rate/i],
  ['ppi', /\bppi\b|producer price/i], ['unrate', /unemployment rate|jobless rate/i], ['claimant', /claimant|unemployment change|jobless claims/i],
  ['jobs', /employment change|nonfarm|payroll/i], ['gdp', /\bgdp\b/i], ['retail', /retail sales/i], ['pmi', /\bpmi\b/i],
  ['trade', /trade balance/i], ['rate', /rate decision|interest rate|cash rate|bank rate|policy rate|refinancing rate/i],
  ['wages', /wage|earnings|labou?r cost/i], ['indprod', /industrial production|manufacturing production/i],
  ['survey', /sentiment|confidence|business climate|\bifo\b|\bzew\b|tankan/i],
];
export function familyKey(name) {
  const n = String(name ?? '');
  const fam = FAMILIES.find(([, re]) => re.test(n))?.[0] ?? n.toLowerCase().replace(/[^a-z]+/g, '');
  const per = /y\/y|\byoy\b|year/i.test(n) ? 'y' : /m\/m|\bmom\b|month/i.test(n) ? 'm' : /q\/q|\bqoq\b|quarter/i.test(n) ? 'q' : '';
  return fam + ':' + per;
}

/**
 * Drop Nasdaq rows that duplicate a release the store already has from another source: same country, same
 * release family + period, within DEDUPE_MS. Rows from Nasdaq itself are not a duplicate signal (re-merges are
 * keyed by series+ms downstream).
 */
export function dedupeAgainst(rows = [], existing = []) {
  const seen = [];
  for (const e of Array.isArray(existing) ? existing : []) {
    if (!e || e.src === SRC || !Number.isFinite(e.ms) || e.actual == null || e.actual === '') continue;
    seen.push({ c: String(e.country ?? '').toUpperCase(), f: familyKey(e.event), ms: e.ms });
  }
  return rows.filter(r => { const f = familyKey(r.event); return !seen.some(x => x.c === r.country && x.f === f && Math.abs(x.ms - r.ms) <= DEDUPE_MS); });
}
