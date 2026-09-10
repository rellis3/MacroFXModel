// js/retailSalesEngine.js — Retail Sales Numeric-Composition Engine.
//
// Same shape and philosophy as js/cpiEngine.js/js/gdpEngine.js: a pure
// numeric score from FRED series, not a text-reading engine.
//
// USD gets two real confirmed levels: `RSAFS` (Advance Retail Sales: Retail
// Trade and Food Services, includes autos) as headline, `RSFSXMV` (same but
// excluding motor vehicle & parts dealers) as the ex-autos variant — both
// are $-level series (isIndex:true, YoY% computed downstream), same
// treatment CPI gives USD's index-level CPIAUCSL/CPILFESL.
//
// The other 7 currencies deliberately go UNIFORM QUARTERLY via OECD's
// `SLRTTO01{cc}Q659S` ("Sales: Retail Trade: Total Retail Trade: Volume,
// growth rate same period previous year, SA") — a real judgment call, not
// the only option. Research turned up a second, MONTHLY family
// (`{ISO3}SARTMISMEI`) that's confirmed real for DE/GB/JP/CA/CH, but it's
// definitionally ex-autos-only AND has no monthly variant at all for AU
// (genuinely quarterly-only at the ABS chain-volume level) or NZ (the
// monthly series was discontinued in 2012). Rather than mixing
// ex-autos-monthly for 5 currencies with total-quarterly for 2, this uses
// one family/cadence/definition for all 7 non-US currencies — same
// "genuine comparability over resolution" tradeoff GDP already makes, and
// `SLRTTO01` already reports pre-computed YoY% growth directly (isIndex:
// false), so no index-level transform is needed for any of the 7.
//
// EUR uses Germany (`SLRTTO01DEQ659S`), consistent with this codebase's
// existing EUR-via-Germany convention.
//
// Series verified via web search (this sandbox can't reach
// api.stlouisfed.org directly, same constraint as every other fetch module
// here) — re-verify the first time this actually runs against FRED.
import { fetchFredObservations } from './zscoreSpreadEngine.js';

export const RETAIL_SALES_UNIVERSE = {
  USD: { headline: { series: 'RSAFS', isIndex: true }, exAutos: { series: 'RSFSXMV', isIndex: true } },
  EUR: { headline: { series: 'SLRTTO01DEQ659S', isIndex: false, quarterly: true } },
  GBP: { headline: { series: 'SLRTTO01GBQ659S', isIndex: false, quarterly: true } },
  JPY: { headline: { series: 'SLRTTO01JPQ659S', isIndex: false, quarterly: true } },
  // No live source. SLRTTO01AUQ659S stopped 2025-04. Searched: the AUSSART*
  // family is dead too (2023-11 / 2010-10), and AUSSLRTCR03GPSAM -- which IS
  // current -- is passenger CAR REGISTRATIONS, not retail trade. Using it would
  // have shipped car sales labelled as retail sales.
  AUD: { discontinued: { since: '2025-04', was: 'SLRTTO01AUQ659S', reason: 'OECD MEI mirror discontinued; no live total-retail-trade series on FRED' } },
  // No live source. SLRTTO01CAQ659S stopped 2022-01 -- the longest-dead series in
  // the whole macro section. CANSART* is dead too; CANSLRTCR03GPSAM is car
  // registrations, same trap as AUD above.
  CAD: { discontinued: { since: '2022-01', was: 'SLRTTO01CAQ659S', reason: 'OECD MEI mirror discontinued; no live total-retail-trade series on FRED' } },
  CHF: { headline: { series: 'SLRTTO01CHQ659S', isIndex: false, quarterly: true } },
  NZD: { headline: { series: 'SLRTTO01NZQ659S', isIndex: false, quarterly: true } },
};

// ── Pure stats helpers (identical shape to cpiEngine.js's / gdpEngine.js's) ─

export function toSeries(obsMap) {
  if (!obsMap) return [];
  return [...obsMap.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
}

export function yoyPct(series, periodsBack = 12) {
  return series.map((pt, i) => {
    const ref = series[i - periodsBack];
    if (!ref || ref.value === 0) return { ...pt, yoy: null };
    return { ...pt, yoy: +((pt.value / ref.value - 1) * 100).toFixed(2) };
  });
}

export function latestZScore(values, lookback = 24, minBaseline = 6) {
  const clean = values.filter(v => v != null && Number.isFinite(v));
  if (clean.length < minBaseline + 1) return null;
  const latest = clean.at(-1);
  const baseline = clean.slice(Math.max(0, clean.length - 1 - lookback), clean.length - 1);
  if (baseline.length < minBaseline) return null;
  const mean = baseline.reduce((s, v) => s + v, 0) / baseline.length;
  const variance = baseline.reduce((s, v) => s + (v - mean) ** 2, 0) / baseline.length;
  const sd = Math.sqrt(variance);
  const flatFloor = Math.max(1e-9, Math.abs(mean) * 1e-9);
  if (sd < flatFloor) return Math.abs(latest - mean) < flatFloor ? 0 : (latest > mean ? 4 : -4);
  return +((latest - mean) / sd).toFixed(2);
}

const clip = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));
const zToScore = z => (z == null ? null : round2(clip(z / 2.5)));
// Raw OECD/FRED values arrive with long floating-point tails — round to 2dp
// for anything surfaced as a headline "latest" reading.
const round2 = v => (v == null ? null : +v.toFixed(2));

// Turns a raw FRED obs map into a YoY-% series regardless of whether the
// underlying series is a $ level (USD) or already a YoY% print (everyone
// else) — same glue cpiEngine.js's toYoySeries provides.
function toYoySeries(obsMap, meta) {
  const series = toSeries(obsMap);
  return meta?.isIndex ? yoyPct(series) : series.map(pt => ({ ...pt, yoy: pt.value == null ? null : round2(pt.value) }));
}

// ── Named dimension ──────────────────────────────────────────────────────

// Growth trend: is the latest YoY print running hot or cold relative to its
// OWN trailing history — same "relative cycle strength" framing GDP gives
// growth directly, applied here to consumer spending instead of output.
export function retailSalesScore(obsMap, meta) {
  const series = toYoySeries(obsMap, meta);
  const yoys = series.map(p => p.yoy);
  const z = latestZScore(yoys, meta?.quarterly ? 12 : 24);
  const latest = series.at(-1);
  return { latestYoy: latest?.yoy ?? null, latestDate: latest?.date ?? null, z, score: zToScore(z) };
}

// Composite read for one currency. `data` = { headline?, exAutos? }, each a
// raw FRED Map. Composite IS the headline score directly (no averaging
// needed — there's only one primary dimension); exAutos (USD-only) is
// reported standalone, same "report it, don't blend it" treatment CPI
// gives core.
export function retailSalesCompositeScore(data = {}, universe = {}) {
  // A stopped source reports WHY it has no score, so the page can say "discontinued"
  // rather than implying the print is merely late. Same contract as cpiScore.
  if (universe.discontinued) {
    return { dims: {}, spending: null, coverage: [], cadence: null, discontinued: universe.discontinued };
  }
  const dims = {};
  if (data.headline) dims.headline = retailSalesScore(data.headline, universe.headline);
  if (data.exAutos) dims.exAutos = retailSalesScore(data.exAutos, universe.exAutos);
  return { dims, spending: dims.headline?.score ?? null, coverage: Object.keys(dims),
    // Cadence travels with the score so the scorecard can age it correctly: the
    // 7 non-US series are QUARTERLY, and judging them against a monthly budget
    // marked live data stale for 5 of 7 currencies.
    cadence: universe.headline?.quarterly ? 'quarterly' : 'monthly' };
}

// Fetch every configured series for one currency. Never throws on a single
// missing/failed series, same availability-reporting pattern as every
// other engine here.
export async function fetchRetailSalesData(ccy, fredKey, fromDate = '2000-01-01') {
  const cfg = RETAIL_SALES_UNIVERSE[ccy];
  if (!cfg) throw new Error(`No retail sales series configured for ${ccy}`);
  // Nothing to fetch for a discontinued currency, and asking anyway would spend a
  // FRED call re-downloading a print from 2022. Same treatment as js/cpiEngine.js.
  if (cfg.discontinued) return { data: {}, availability: [{ discontinued: cfg.discontinued }] };
  const data = {}, availability = [];
  await Promise.all(Object.entries(cfg).map(async ([factor, meta]) => {
    try {
      const obs = await fetchFredObservations(meta.series, fromDate, fredKey);
      data[factor] = obs;
      availability.push({ factor, series: meta.series, n: obs.size });
    } catch (e) {
      availability.push({ factor, series: meta.series, n: 0, error: e.message });
    }
  }));
  return { data, availability };
}
