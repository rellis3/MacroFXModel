/**
 * Macro engines board (Desk Terminal, Macro tab): the shaping behind the currency x indicator heatmap.
 *
 * Why it exists. The terminal showed one composite per currency (the Macro scorecard); the per-currency engines that make it
 * up (labour, CPI, PPI, GDP, PMI/ISM, retail sales, trade, confidence) reached the AI analysts only. Each engine stores a
 * score, the latest level and its date, but no consensus and no history, so a cell built from the engines alone could not
 * say "this print beat expectations". The surprise store (/api/econ-surprise) holds every release with consensus and
 * prior for all eight currencies, so the cell is built from that: the family's headline release, what it printed against
 * what was expected, sized by that release's own history (z, js/econSurprise.js scoreReleases, polarity-adjusted so
 * positive = stronger economy than expected; unemployment, claims and trade deficits are inverted there).
 * The engine reading is carried beside it (score, as-of date, age, stale/discontinued) and shown in the drawer, so the
 * composite on the row is visibly the sum of its parts.
 *
 * It describes. Surprise size is tested for the release session's RANGE (deskEvidence 'surprise-size'); no direction is
 * claimed here, and a cell's colour is the sign of the surprise in economic-strength terms, never a market direction.
 * Pure: no fetch, no KV, no DOM. Tested in js/terminal/macroEngines.test.mjs.
 */
import { scoreReleases, parseCalNumber, polarityFor, COUNTRY_TO_CCY } from '../econSurprise.js';

export const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];

/** key, column label, the scorecard dimension that is the same family, and the engine page. */
export const FAMILIES = [
  { key: 'labour', label: 'Labour', dim: 'laborMarket', page: 'labor-market.html' },
  { key: 'cpi', label: 'Inflation', dim: 'cpi', page: 'cpi.html' },
  { key: 'ppi', label: 'PPI', dim: 'ppi', page: 'ppi.html' },
  { key: 'gdp', label: 'Growth', dim: 'gdp', page: 'gdp.html' },
  { key: 'pmi', label: 'PMI / ISM', dim: 'ism', page: 'ism.html' },
  { key: 'retail', label: 'Retail sales', dim: 'retailSales', page: 'retail-sales.html' },
  { key: 'trade', label: 'Trade', dim: 'tradeBalance', page: 'trade-balance.html' },
  { key: 'confidence', label: 'Confidence', dim: 'consumerConfidence', page: 'consumer-confidence.html' },
];
export const FAMILY_BY_KEY = Object.fromEntries(FAMILIES.map(f => [f.key, f]));

/**
 * Which releases are a family's headline. Titles are the vendors' own (lower-cased, anchored): the regional euro-area
 * releases ("German ...", "French ...") do not match, so the EUR cell is the euro-area print. Lower rank = preferred
 * when two series printed within a few days of each other; otherwise the most recent print is the cell.
 */
const RULES = {
  labour: [[/^non-farm employment change$/, 1], [/^unemployment rate$/, 2], [/^employment change( q\/q)?$/, 3], [/^claimant count change$/, 4], [/^(average hourly earnings m\/m|average earnings index 3m\/y|wage price index q\/q|average cash earnings y\/y)$/, 5]],
  cpi: [[/^(cpi y\/y|cpi flash estimate y\/y|final cpi y\/y)$/, 1], [/^cpi q\/q$/, 2], [/^cpi m\/m$/, 3], [/^(core cpi( flash estimate)? y\/y|final core cpi y\/y|core cpi m\/m|trimmed mean cpi q\/q)$/, 4], [/^tokyo core cpi y\/y$/, 5]],
  ppi: [[/^ppi( input| output)? (m\/m|y\/y|q\/q)$/, 1], [/^core ppi m\/m$/, 3]],
  gdp: [[/^(advance |prelim |flash |second estimate |final )?gdp (q\/q|m\/m|y\/y)$/, 1]],
  pmi: [[/^(ism manufacturing pmi|(flash |final )?manufacturing pmi|ivey pmi)$/, 1], [/^(ism services pmi|(flash |final )?services pmi|tankan manufacturing index)$/, 2], [/^(kof economic barometer|philly fed manufacturing index|empire state manufacturing index)$/, 3]],
  retail: [[/^retail sales (m\/m|y\/y|q\/q)$/, 1], [/^core retail sales m\/m$/, 2]],
  trade: [[/^(goods )?trade balance$/, 1]],
  confidence: [[/^(cb consumer confidence|(gfk|westpac|nationwide) consumer confidence)$/, 1], [/^(prelim|revised) uom consumer sentiment$/, 2], [/consumer (confidence|sentiment)/, 3]],
};

/** { family, rank } for a release title, or null. */
export function familyOf(event) {
  const t = String(event ?? '').trim().toLowerCase();
  if (!t) return null;
  for (const [family, list] of Object.entries(RULES)) for (const [re, rank] of list) if (re.test(t)) return { family, rank };
  return null;
}

/** A quarterly release is judged against a quarter, the rest against a month. */
export const cadenceOf = event => (/q\/q|tankan/i.test(String(event ?? '')) ? 'quarterly' : 'monthly');
export const STALE_AFTER_DAYS = { monthly: 45, quarterly: 110 };

/** Claimant-count change is "more = weaker" but is not in econSurprise's inverted list; flip it here. */
const extraSign = event => (/claimant count/i.test(String(event ?? '')) ? -1 : 1);

const DAY = 864e5;
const ccyOf = c => COUNTRY_TO_CCY[String(c ?? '').toUpperCase()] ?? (CCYS.includes(String(c ?? '').toUpperCase()) ? String(c).toUpperCase() : null);
const r2 = v => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);

/** The strength of a print against its expectation: +1 stronger economy than expected, -1 weaker, 0 inline, null unknown. */
function strengthOf(row, base) {
  const a = parseCalNumber(row.actual), b = parseCalNumber(base);
  if (a == null || b == null) return null;
  const sign = polarityFor(row.event).sign * extraSign(row.event);
  const d = (a - b) * sign;
  return d > 0 ? 1 : d < 0 ? -1 : 0;
}

/** Flatten the calendar's upcoming lists (day groups from calendarFeed.upcoming, or flat Nasdaq rows) to [{ms, ccy, event}]. */
export function flattenAhead(...lists) {
  const out = [];
  for (const l of lists) {
    for (const x of Array.isArray(l) ? l : []) {
      if (Array.isArray(x?.events)) { for (const e of x.events) out.push({ ms: Number(e.ms), ccy: ccyOf(e.country ?? e.ccy), event: e.event ?? e.title }); }
      else if (x) out.push({ ms: Number(x.ms), ccy: ccyOf(x.country ?? x.ccy), event: x.event ?? x.title });
    }
  }
  return out.filter(e => Number.isFinite(e.ms) && e.ccy && e.event);
}

/**
 * rows: the surprise store ({country, event, impact, ms, estimate, prev, actual}). scorecard: /api/macro-scorecard's
 * object (ranked, discontinued, ...). ahead: flattenAhead(...). Returns { cells, composite, coverage, families, ccys }.
 */
export function buildMacroBoard({ rows = [], scorecard = null, ahead = [], now = Date.now() } = {}) {
  const store = (Array.isArray(rows) ? rows : []).filter(r => r && r.ms != null);
  // z for every release that has a consensus and enough history, scored once on the whole store (each series on its own scale)
  const scored = scoreReleases(store, { now }).scored;
  const zBy = new Map(scored.map(s => [`${s.series}|${s.ms}`, s.z]));

  // series -> printed rows, for the headline families on the eight currencies only
  const bySeries = new Map();
  for (const r of store) {
    if (r.actual == null || r.actual === '') continue;
    const ccy = ccyOf(r.country); if (!ccy || !CCYS.includes(ccy)) continue;
    const fam = familyOf(r.event); if (!fam) continue;
    const key = `${String(r.country).toUpperCase()}|${String(r.event).trim().toLowerCase()}`;
    if (!bySeries.has(key)) bySeries.set(key, { ccy, family: fam.family, rank: fam.rank, event: r.event, rows: [] });
    bySeries.get(key).rows.push(r);
  }
  const printOf = (s, r) => {
    const sign = polarityFor(r.event).sign * extraSign(r.event);
    const zRaw = zBy.get(`${String(r.country).toUpperCase()}|${String(r.event).trim().toLowerCase()}|${r.ms}`);
    // z is polarity-adjusted in econSurprise; the claimant-count flip is applied here
    const zScored = zRaw == null ? null : r2(zRaw * extraSign(r.event));
    const vsEst = strengthOf(r, r.estimate), vsPrev = strengthOf(r, r.prev);
    // z is the miss measured from this release's USUAL surprise (its median), so an in-line print can carry a z of its own
    // sign-opposite to the beat or miss. A number that contradicts the arrow beside it is dropped, not shown.
    const z = zScored != null && vsEst != null && vsEst !== 0 && Math.sign(zScored) === vsEst ? zScored : null;
    return {
      ms: r.ms, actual: r.actual, estimate: r.estimate ?? null, prev: r.prev ?? null, z,
      strength: vsEst ?? vsPrev, basis: vsEst != null ? 'consensus' : vsPrev != null ? 'prior' : 'none',
      value: parseCalNumber(r.actual), sign,
    };
  };
  const series = [];
  for (const [, s] of bySeries) {
    s.rows.sort((a, b) => b.ms - a.ms);
    series.push({ ccy: s.ccy, family: s.family, rank: s.rank, event: s.event, cadence: cadenceOf(s.event), latestMs: s.rows[0].ms, prints: s.rows.slice(0, 6).map(r => printOf(s, r)) });
  }

  const engineRow = ccy => (scorecard?.ranked ?? []).find(r => r.ccy === ccy) ?? null;
  const cells = {}, coverage = {}, composite = {};
  for (const ccy of CCYS) {
    cells[ccy] = {};
    const er = engineRow(ccy);
    composite[ccy] = er ? { composite: er.composite ?? null, factorsScored: er.factorsScored ?? null, factorsTotal: er.factorsTotal ?? null } : { composite: null, factorsScored: null, factorsTotal: null };
    for (const f of FAMILIES) {
      const cand = series.filter(s => s.ccy === ccy && s.family === f.key);
      let cell = { family: f.key, status: 'none' };
      if (cand.length) {
        const newest = Math.max(...cand.map(s => s.latestMs));
        // within four days of the newest print, the lower rank (the more headline release) wins
        const pick = cand.filter(s => newest - s.latestMs <= 4 * DAY).sort((a, b) => a.rank - b.rank || b.latestMs - a.latestMs)[0];
        const p = pick.prints[0];
        const ageDays = Math.max(0, Math.floor((now - p.ms) / DAY));
        const stale = ageDays > STALE_AFTER_DAYS[pick.cadence];
        cell = {
          family: f.key, status: p.basis === 'consensus' ? 'surprise' : p.basis === 'prior' ? 'prior' : 'print',
          event: pick.event, cadence: pick.cadence, ms: p.ms, ageDays, stale,
          actual: p.actual, estimate: p.estimate, prev: p.prev, z: p.z, strength: p.strength, basis: p.basis,
          prints: pick.prints.map(x => ({ ms: x.ms, actual: x.actual, estimate: x.estimate, prev: x.prev, z: x.z, value: x.value })),
          also: cand.filter(s => s !== pick).sort((a, b) => b.latestMs - a.latestMs).slice(0, 4).map(s => ({ event: s.event, ms: s.latestMs, actual: s.prints[0].actual, estimate: s.prints[0].estimate, z: s.prints[0].z })),
        };
      }
      // the engine's own reading of this family (a z-score of the latest level against its own history, scaled -1..+1)
      const dim = f.dim, score = er?.dims?.[dim] ?? null;
      const staleDim = (er?.stale ?? []).find(x => x.dim === dim);
      const disc = scorecard?.discontinued?.[dim]?.[ccy] ?? null;
      if (score != null || disc) {
        cell.engine = { score: score == null ? null : r2(score), asOf: er?.asOf?.[dim] ?? null, ageDays: er?.ageDays?.[dim] ?? null, stale: !!staleDim, discontinued: disc };
        if (cell.status === 'none' && score != null) cell.status = 'engine';
      }
      // next release in this family on this currency
      const nxt = ahead.filter(e => e.ccy === ccy && e.ms > now).map(e => ({ ...e, fam: familyOf(e.event) })).filter(e => e.fam?.family === f.key).sort((a, b) => a.ms - b.ms || a.fam.rank - b.fam.rank)[0];
      if (nxt) cell.next = { ms: nxt.ms, event: nxt.event };
      cells[ccy][f.key] = cell;
    }
    const mine = Object.values(cells[ccy]);
    coverage[ccy] = {
      surprise: mine.filter(c => c.status === 'surprise').length,
      prior: mine.filter(c => c.status === 'prior' || c.status === 'print').length,
      engineOnly: mine.filter(c => c.status === 'engine').length,
      none: mine.filter(c => c.status === 'none').length,
      missing: FAMILIES.filter(f => cells[ccy][f.key].status === 'none').map(f => f.label),
      stale: FAMILIES.filter(f => cells[ccy][f.key].stale).map(f => f.label),
    };
  }
  return { cells, composite, coverage, ccys: CCYS, families: FAMILIES.map(f => ({ key: f.key, label: f.label, page: f.page })), storeRows: store.length, scoredReleases: scored.length };
}
