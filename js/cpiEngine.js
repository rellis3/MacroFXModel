// js/cpiEngine.js — CPI / Inflation Numeric-Composition Engine.
//
// Same shape and philosophy as js/laborMarketEngine.js: a pure numeric
// score built from FRED series, NOT a text-reading engine — CPI releases
// are numbers, the edge is scoring them well. Independent named dimensions
// (level-vs-target, trend, core) rather than one blended number, same
// reasoning as every other engine in this codebase: "is inflation running
// hot relative to the 2% target" and "is it accelerating or decelerating"
// are two different questions a trader asks separately.
//
// Series verified via web search (this sandbox can't reach
// api.stlouisfed.org/fred.stlouisfed.org directly, same constraint as every
// other fetch module here — re-verify the first time this actually runs
// against FRED). Two IMPORTANT unit differences from labor market's series:
//
// 1. USD (CPIAUCSL/CPILFESL) are raw INDEX LEVELS — YoY% must be computed
//    (same as labor market's payrolls/wages). The other 7 currencies' OECD
//    series (CPALTT01{cc}{freq}659N / CPGRLE01{cc}{freq}659N) are ALREADY
//    published as YoY % change (FRED/OECD's "659N" suffix = "growth rate
//    same period previous year") — do NOT re-derive YoY on those, the raw
//    values already ARE the YoY print. `CPI_UNIVERSE` marks this per entry
//    via `isIndex`.
// 2. AUD and NZD's headline series are QUARTERLY (`CPALTT01AUQ659N`,
//    `CPALTT01NZQ659N`) — Australia's and New Zealand's CPI is genuinely
//    quarterly at the source (ABS / Stats NZ), not a FRED limitation. The
//    z-score/lookback math doesn't care about frequency, but a much shorter
//    trailing-24-point window covers ~6 years of quarterly data vs 2 years
//    of monthly — fine for "relative to own recent history," just noted so
//    the UI can label the cadence correctly rather than implying monthly.
//
// Core CPI (ex food & energy) is confirmed for 5 of 8 currencies (USD, EUR
// via Germany, CHF, CAD, AUD) — GBP and NZD's YoY-core FRED IDs were NOT
// independently confirmed during research (only their MoM variants were),
// so core is deliberately left uncovered for those two rather than guessing
// an unverified ID, same "verify before build" discipline as every other
// module here (e.g. NZD wage/participation deferred in labor market).
//
// EUR uses Germany throughout (headline + core), consistent with
// ECON_UNIVERSE's existing EUR-via-Germany convention for rate/y10/unemp.
import { fetchFredObservations } from './zscoreSpreadEngine.js';

export const CPI_UNIVERSE = {
  USD: { headline: { series: 'CPIAUCSL', isIndex: true }, core: { series: 'CPILFESL', isIndex: true } },
  EUR: { headline: { series: 'CPALTT01DEM659N', isIndex: false }, core: { series: 'CPGRLE01DEM659N', isIndex: false } },
  GBP: { headline: { series: 'CPALTT01GBM659N', isIndex: false } },
  JPY: { headline: { series: 'CPALTT01JPM659N', isIndex: false }, core: { series: 'CPGRLE01JPM659N', isIndex: false } },
  AUD: { headline: { series: 'CPALTT01AUQ659N', isIndex: false, quarterly: true }, core: { series: 'CPGRLE01AUQ659N', isIndex: false, quarterly: true } },
  CAD: { headline: { series: 'CPALTT01CAM659N', isIndex: false }, core: { series: 'CPGRLE01CAM659N', isIndex: false } },
  CHF: { headline: { series: 'CPALTT01CHM659N', isIndex: false }, core: { series: 'CPGRLE01CHM659N', isIndex: false } },
  NZD: { headline: { series: 'CPALTT01NZQ659N', isIndex: false, quarterly: true } },
};

// Every central bank in this universe targets inflation at (or very near)
// 2% — Fed, ECB, BoE, RBA, BoC, SNB, RBNZ all publish a ~2% target. Using
// one constant across all 8 currencies is a deliberate simplification, not
// an oversight: the small target-band differences that exist in practice
// (RBNZ's 1-3% band, midpoint 2%) don't change the read enough to justify
// per-currency tuning.
const INFLATION_TARGET = 2.0;

// ── Pure stats helpers (identical shape to laborMarketEngine.js's) ─────────

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
const zToScore = z => (z == null ? null : clip(z / 2.5));

// Turns a raw FRED obs map into a YoY-% series regardless of whether the
// underlying series is an index level (USD) or already a YoY% print
// (everyone else) — the one piece of glue every dimension below needs.
// Raw OECD pre-computed-YoY values arrive with long floating-point tails
// (e.g. 2.943827113) — round to 2dp same as yoyPct() already does for the
// index-derived path, so neither branch leaks unrounded precision.
function toYoySeries(obsMap, meta) {
  const series = toSeries(obsMap);
  return meta?.isIndex ? yoyPct(series) : series.map(pt => ({ ...pt, yoy: pt.value == null ? null : +pt.value.toFixed(2) }));
}

// ── Named dimensions ─────────────────────────────────────────────────────

// Level vs. the ~2% target — the direct "how hot/cold is inflation running
// right now" read. Positive = above target (hawkish pressure), negative =
// below target (dovish pressure). Clipped at +/-4pp from target (a print
// that far off target reads as maximally hot/cold rather than climbing
// further — matches labor market's saturation logic for blowout prints).
export function levelVsTargetScore(obsMap, meta, target = INFLATION_TARGET, band = 4.0) {
  const series = toYoySeries(obsMap, meta);
  const latest = series.at(-1);
  if (latest?.yoy == null) return { latestYoy: null, latestDate: null, target, score: null };
  return { latestYoy: latest.yoy, latestDate: latest.date, target, score: clip((latest.yoy - target) / band) };
}

// Trend vs. its OWN trailing history — catches "still above target but
// falling fast" (disinflation from a high base) as an improving/dovish
// signal even while levelVsTargetScore above still reads hot, and catches
// a fresh re-acceleration even from a currently-low level. Positive =
// running hotter than its own recent norm (hawkish), no sign flip needed
// (hot=positive is the natural direction here, unlike unemployment).
export function trendScore(obsMap, meta) {
  const series = toYoySeries(obsMap, meta);
  const yoys = series.map(p => p.yoy);
  const z = latestZScore(yoys, meta?.quarterly ? 12 : 24);
  const latest = series.at(-1);
  return { latestYoy: latest?.yoy ?? null, latestDate: latest?.date ?? null, z, score: zToScore(z) };
}

// Composite read for one currency. `data` = { headline?, core? }, each a raw
// FRED Map (or undefined if that factor isn't in CPI_UNIVERSE for this
// currency). Composite averages the two HEADLINE dimensions (level +
// trend); core is reported standalone, not folded in — same "report it,
// don't blend it" treatment labor market gives wages, since core answers a
// related-but-distinct question (is the underlying/persistent pressure
// hot, stripped of volatile food/energy swings) rather than adding
// information to "is headline hot."
export function cpiScore(data = {}, universe = {}) {
  const dims = {};
  if (data.headline) dims.headlineLevel = levelVsTargetScore(data.headline, universe.headline);
  if (data.headline) dims.headlineTrend = trendScore(data.headline, universe.headline);
  if (data.core) dims.coreLevel = levelVsTargetScore(data.core, universe.core, INFLATION_TARGET, 3.0);

  const pressureInputs = [dims.headlineLevel?.score, dims.headlineTrend?.score].filter(s => s != null);
  const pressure = pressureInputs.length ? +(pressureInputs.reduce((s, v) => s + v, 0) / pressureInputs.length).toFixed(2) : null;

  return { dims, pressure, coverage: Object.keys(dims) };
}

// Fetch every configured series for one currency. Never throws on a single
// missing/failed series — availability is reported alongside so a caller
// can tell "GBP has no core coverage by design" from "a fetch broke".
export async function fetchCpiData(ccy, fredKey, fromDate = '2000-01-01') {
  const cfg = CPI_UNIVERSE[ccy];
  if (!cfg) throw new Error(`No CPI series configured for ${ccy}`);
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
