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
// US releases are left to ForexFactory + FRED, which fills its own list of US actuals (js/fredActuals.js FRED_ACTUALS). These US releases are not
// on FRED at all, so without Nasdaq they never had an actual (review 2026-11-28: ISM and Conference Board confidence showed "feed stopped Apr
// 2025"). Only these are taken for the US, so nothing FRED fills is counted twice.
export const US_GAP = /\bISM\b|Conference Board|CB Consumer Confidence|Michigan|\bUoM\b|S&P Global.*PMI|Chicago PMI|Empire State|Philadelphia Fed|Philly Fed|Richmond (Fed )?Manufacturing|Dallas Fed|Kansas City Fed/i;
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

import { nameWords, plausibleActual, parseValue } from './surpriseReader.js';

const per = n => familyKey(n).split(':')[1], fam = n => familyKey(n).split(':')[0];
const near = (a, b) => { const x = parseValue(a), y = parseValue(b); return !!(x && y && x.unit === y.unit && Math.abs(x.v - y.v) <= (x.unit === '%' ? 0.0501 : Math.max(1e-9, Math.abs(y.v) * 0.01))); };
const sameWords = (a, b) => { const A = nameWords(a), B = new Set(nameWords(b)); return A.length > 0 && A.length === B.size && A.every(w => B.has(w)); };
const baseOf = n => String(n ?? '').replace(/\s*(m\/m|y\/y|q\/q)\s*$/i, '').trim();
/**
 * Names the rows of an AMBIGUOUS Nasdaq group (one name, one instant, two or more prints: "CPI" = the m/m and the y/y) from reference
 * calendar rows ({ country, event, ms, estimate, prev }: ForexFactory's week, or the store's own rows) that carry the period in their name.
 * A reference names a row when it is the same release (same words once period and print-stage tags are dropped) at the same time and its
 * consensus or previous agrees with the row's. With two rows and one named m/m or q/q, the other is the y/y of the same release.
 * Returns Map(row -> name); rows it cannot name are left out. Before 2026-11-28 the whole group was dropped, which is why Canada's
 * CPI y/y, New Zealand's CPI and Australia's GDP had no live prints.
 */
export function nameAmbiguous(group = [], reference = [], country) {
  const first = group[0], named = new Map(), used = new Set();
  if (!first) return named;
  const refs = (reference ?? []).filter(e => e && String(e.country ?? '').toUpperCase() === country && Math.abs(Number(e.ms) - first.ms) <= DEDUPE_MS
    && per(e.event) && fam(e.event) === fam(first.event) && sameWords(e.event, first.event));
  for (const r of group) {
    const score = e => (near(r.raw?.consensus, e.estimate) ? 2 : 0) + (near(r.raw?.previous, e.prev) ? 1 : 0);
    const hits = refs.filter(e => !used.has(e) && score(e) > 0).map(e => ({ e, s: score(e) })).sort((a, b) => b.s - a.s);
    if (hits[0] && (hits.length === 1 || hits[0].s > hits[1].s) && plausibleActual(hits[0].e, r.raw?.actual)) { named.set(r, String(hits[0].e.event).trim()); used.add(hits[0].e); }
  }
  if (group.length === 2 && named.size === 1) {
    const done = named.has(group[0]) ? group[0] : group[1], other = done === group[0] ? group[1] : group[0], p = per(named.get(done));
    if (p === 'm' || p === 'q') named.set(other, `${baseOf(named.get(done))} y/y`);
  }
  // No reference at that time (the months after ForexFactory stopped carrying actuals): a pair whose two prints are clearly of different
  // sizes is named by size, the larger the y/y, when the release already has a short-period series (m/m or q/q) in the reference to say
  // which. "Clearly": at least 3x on the actual AND on the previous (Canada CPI 3.1% vs 0.2%); Swiss CPI 0.2% vs 0.1% is too close, dropped.
  if (group.length === 2 && named.size === 0) {
    const pv = (r, k) => parseValue(r.raw?.[k]);
    const [x, y] = group, ax = pv(x, 'actual'), ay = pv(y, 'actual'), px = pv(x, 'previous'), py = pv(y, 'previous');
    const big = (a, b) => Math.abs(a.v) >= 3 * Math.abs(b.v) && Math.abs(a.v) >= 0.5;
    if ([ax, ay, px, py].every(v => v?.unit === '%')) {
      const long = big(ax, ay) && big(px, py) ? x : big(ay, ax) && big(py, px) ? y : null;
      const shortRef = (reference ?? []).filter(e => e && String(e.country ?? '').toUpperCase() === country && ['m', 'q'].includes(per(e.event)) && sameWords(e.event, first.event))
        .sort((a, b) => Number(b.ms) - Number(a.ms))[0];
      if (long && shortRef) { named.set(long === x ? y : x, String(shortRef.event).trim()); named.set(long, `${baseOf(shortRef.event)} y/y`); }
    }
  }
  return named;
}

const clean = v => { const s = String(v ?? '').replace(/&nbsp;/gi, ' ').trim(); return s ? s : null; };
const utcStr = ms => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);

/**
 * Parsed Nasdaq rows (calendarFeed.parseNasdaq output) -> surprise-store releases.
 * Countries in NASDAQ_COUNTRY, plus the US releases FRED does not fill (US_GAP); only released rows with an actual.
 * `reference`: calendar rows that carry the period in their names (ForexFactory's week, the store), used to name an ambiguous group.
 */
export function toSurpriseRows(parsed = [], { reference = [] } = {}) {
  const out = [];
  // Nasdaq sometimes lists two releases under ONE name at one instant ('German CPI' = the y/y AND the m/m print).
  // They would collide in the store (series + instant is the row id) and mix two dispersions into one series, and
  // nothing in the row says which is which -- so an ambiguous name at an instant is dropped, both copies.
  const seen = new Map();
  for (const r of Array.isArray(parsed) ? parsed : []) { const k = `${r?.country}|${String(r?.event ?? '').trim()}|${r?.ms}`; seen.set(k, (seen.get(k) ?? 0) + 1); }
  const groups = new Map();
  for (const r of Array.isArray(parsed) ? parsed : []) { const k = `${r?.country}|${String(r?.event ?? '').trim()}|${r?.ms}`; if (seen.get(k) > 1) groups.set(k, [...(groups.get(k) ?? []), r]); }
  const names = new Map();
  for (const g of groups.values()) { const cc = NASDAQ_COUNTRY[g[0]?.country] ?? (g[0]?.country === 'United States' ? 'US' : null); if (cc) for (const [r, n] of nameAmbiguous(g.filter(x => clean(x.raw?.actual)), reference, cc)) names.set(r, n); }
  for (const r of Array.isArray(parsed) ? parsed : []) {
    if ((seen.get(`${r?.country}|${String(r?.event ?? '').trim()}|${r?.ms}`) ?? 0) > 1 && !names.has(r)) continue;   // ambiguous and not nameable: both copies dropped, as before
    const country = NASDAQ_COUNTRY[r?.country] ?? (r?.country === 'United States' && US_GAP.test(String(r?.event ?? '')) ? 'US' : null);
    if (!country || !Number.isFinite(r?.ms)) continue;
    const actual = clean(r.raw?.actual), estimate = clean(r.raw?.consensus);
    if (!actual) continue;
    const event = names.get(r) ?? String(r.event).trim(), impact = impactOf(event);
    if (impact === 'low') continue;
    out.push({ country, event, impact, time: utcStr(r.ms), ms: r.ms,
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
