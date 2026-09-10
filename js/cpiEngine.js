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

// ── The OECD CPI catalogue on FRED is dead (verified 2026-09-10) ────────────
//
// Every CPALTT01*/CPGRLE01* series this engine was built on has stopped. Checked
// directly against fredgraph, last observation per series:
//
//     CPALTT01DEM659N  2025-03      CPALTT01GBM659N  2025-03
//     CPALTT01CAM659N  2025-03      CPALTT01CHM659N  2025-04
//     CPALTT01AUQ659N  2025-01      CPALTT01NZQ659N  2023-07
//     CPALTT01JPM659N  2021-06
//
// This is not a fetch bug or a lag. OECD's Main Economic Indicators mirror on FRED
// was discontinued in spring 2025, and the whole family froze together. The index
// variants (DEUCPIALLMINMEI etc.), the COICOP 1999 family (JPNCP010000GYM), and the
// all-items variants (JPNCPALTT01IXNBM) are all frozen on the same dates -- so
// there is no live OECD-sourced CPI on FRED at any cadence.
//
// Searched for replacements per currency. What exists:
//
//   EUR, CHF  ->  Eurostat HICP, a DIFFERENT provider that is still publishing
//                 (both current to 2026-07). Now used below.
//   GBP       ->  Eurostat dropped the UK after Brexit (CP0000GBM086NEST stops
//                 2020-11). No live FRED source found.
//   JPY, CAD, ->  Eurostat is Europe-only (CP0000CAM086NEST / CP0000JPM086NEST do
//   AUD, NZD      not exist). World Bank FPCPITOTLZG* is ANNUAL and a year stale.
//                 No live FRED source found.
//
// So five currencies have no CPI at all on FRED right now. They are listed below
// with `discontinued` rather than deleted: the score they used to produce was being
// computed off prints up to 63 months old, and the honest state is "we do not have
// this", not "here is a number from 2021". Getting these back means going outside
// FRED -- ONS, StatCan, ABS, Stats NZ and e-Stat all publish CPI APIs -- which is a
// separate build, not a series-ID swap.
//
// `discontinued` entries are skipped by fetchCpiData and reported so the UI can say
// WHY a currency has no inflation read, instead of showing a struck-through number
// that implies the data is merely late and will come back.
export const CPI_UNIVERSE = {
  // Live: BLS, index levels, YoY computed downstream.
  USD: { headline: { series: 'CPIAUCSL', isIndex: true }, core: { series: 'CPILFESL', isIndex: true } },

  // Live: Eurostat HICP, index 2015=100 (so isIndex, same treatment as USD -- these
  // are NOT the OECD "659N" pre-computed YoY prints the old entries were).
  //
  // Euro-area aggregate rather than Germany, deliberately departing from this repo's
  // usual EUR-via-Germany convention: the ECB targets euro-area HICP, so for CPI
  // specifically the aggregate is the number that actually moves the currency. The
  // Germany-only series (CP0000DEM086NEST) is equally live if that consistency is
  // ever preferred over correctness here.
  EUR: { headline: { series: 'CP0000EZ19M086NEST', isIndex: true } },
  CHF: { headline: { series: 'CP0000CHM086NEST', isIndex: true } },

  // No live FRED source. See the note above.
  GBP: { discontinued: { since: '2025-03', was: 'CPALTT01GBM659N', reason: 'OECD MEI mirror discontinued; Eurostat dropped the UK post-Brexit' } },
  CAD: { discontinued: { since: '2025-03', was: 'CPALTT01CAM659N', reason: 'OECD MEI mirror discontinued; Eurostat is Europe-only' } },
  AUD: { discontinued: { since: '2025-01', was: 'CPALTT01AUQ659N', reason: 'OECD MEI mirror discontinued; Eurostat is Europe-only' } },
  NZD: { discontinued: { since: '2023-07', was: 'CPALTT01NZQ659N', reason: 'OECD MEI mirror discontinued; Eurostat is Europe-only' } },
  JPY: { discontinued: { since: '2021-06', was: 'CPALTT01JPM659N', reason: 'OECD MEI mirror discontinued; Eurostat is Europe-only' } },
};

// Core CPI is now USD-only. The EUR/CHF core series (CPGRLE01*) died with the rest
// of the OECD family, and the Eurostat core IDs were NOT independently verified --
// one candidate that appeared to resolve turned out to be fredgraph silently
// falling back to the headline series when handed an unknown ID, which would have
// shipped headline inflation mislabelled as core. Left uncovered rather than
// guessed, the same discipline the rest of this module already follows. Core does
// not enter `pressure` in any case; it is reported standalone.

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
// z/2.5 division reintroduces floating-point tails even when z itself is
// already rounded (e.g. 2.39/2.5 -> 0.9560000000000001) — round the
// composite score at its one shared chokepoint so every dims/composite
// field downstream is clean, not just the "latest value" fields PR #1143
// fixed. Surfaced live by the Macro Scorecard's per-dimension breakdown,
// which is the first place these .score/.pressure/etc fields were ever
// displayed raw instead of just driving a chip/gauge width.
const round2 = v => (v == null ? null : +v.toFixed(2));
const zToScore = z => (z == null ? null : round2(clip(z / 2.5)));

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
  return { latestYoy: latest.yoy, latestDate: latest.date, target, score: round2(clip((latest.yoy - target) / band)) };
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
  // A currency whose source series has stopped reports WHY it has no score. Without
  // this it would be indistinguishable from a fetch that merely failed today, and
  // the page would keep implying the number is late rather than gone.
  if (universe.discontinued) {
    return {
      dims: {}, pressure: null, coverage: [], cadence: null,
      discontinued: universe.discontinued,
    };
  }
  const dims = {};
  if (data.headline) dims.headlineLevel = levelVsTargetScore(data.headline, universe.headline);
  if (data.headline) dims.headlineTrend = trendScore(data.headline, universe.headline);
  if (data.core) dims.coreLevel = levelVsTargetScore(data.core, universe.core, INFLATION_TARGET, 3.0);

  const pressureInputs = [dims.headlineLevel?.score, dims.headlineTrend?.score].filter(s => s != null);
  const pressure = pressureInputs.length ? +(pressureInputs.reduce((s, v) => s + v, 0) / pressureInputs.length).toFixed(2) : null;

  return { dims, pressure, coverage: Object.keys(dims),
    // AUD and NZD headline CPI is quarterly at source (ABS / Stats NZ).
    cadence: universe.headline?.quarterly ? 'quarterly' : 'monthly' };
}

// Fetch every configured series for one currency. Never throws on a single
// missing/failed series — availability is reported alongside so a caller
// can tell "GBP has no core coverage by design" from "a fetch broke".
export async function fetchCpiData(ccy, fredKey, fromDate = '2000-01-01') {
  const cfg = CPI_UNIVERSE[ccy];
  if (!cfg) throw new Error(`No CPI series configured for ${ccy}`);
  // Nothing to fetch for a discontinued currency -- and requesting the dead series
  // anyway would spend one of this project's scarce FRED calls to re-download a
  // print from 2021 (synchronised FRED bursts already get 403-throttled here).
  if (cfg.discontinued) {
    return { data: {}, availability: [{ discontinued: cfg.discontinued }] };
  }
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
