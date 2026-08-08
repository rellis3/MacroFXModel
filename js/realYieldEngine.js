// js/realYieldEngine.js — Real Yield Differential Numeric-Composition Engine.
//
// Same shape and philosophy as js/cpiEngine.js/js/gdpEngine.js: a pure
// numeric score from FRED series, not a text-reading engine. UNLIKE every
// other engine in this file family, this one is entirely DERIVED — it
// fetches no new data source, it combines two series this codebase already
// pulls elsewhere: the 10Y government bond yield (same series IDs already
// confirmed and in production use via ECON_UNIVERSE in
// js/econTrendEngine.js) and CPI headline YoY% (imported directly from
// js/cpiEngine.js's CPI_UNIVERSE, so this engine automatically tracks
// whichever series CPI engine itself considers "headline" — a single
// source of truth for what counts as inflation, rather than a second,
// potentially-drifting copy of the same 8 series IDs).
//
// Real yield = nominal 10Y yield − CPI YoY%. This is, deliberately, the ONE
// metric across this whole numeric-engine family where the RAW LEVEL
// itself is genuinely cross-currency comparable — unlike trade balance's
// raw level (dominated by economy size) or GDP/CPI/retail sales' YoY%
// (each already normalized within its own currency, but real yield goes a
// step further: it's the actual expected real return a carry trade earns,
// directly comparable in percentage-point terms across all 8 currencies).
// So this engine reports the raw level AS THE PRIMARY READ (`latestReal`),
// with a z-vs-own-history trend score alongside it, same "report the level
// AND the trend" pattern CPI's levelVsTargetScore/trendScore pair uses.
//
// 10Y yield and CPI observations don't share a release calendar (yield is
// a market-based monthly print, CPI YoY updates monthly for 6 currencies
// but quarterly for AUD/NZD) — `mergeRealYield` forward-fills the latest
// KNOWN CPI reading onto each yield observation date, which is the
// economically correct join: "what real yield existed as of this date"
// depends on the most recent inflation print available at that time, not
// a reading from the future. This also means AUD/NZD's real-yield series
// repeats the same CPI figure across ~3 consecutive monthly yield points
// between quarterly CPI releases — a true representation of what the real
// yield actually was during those months, not an artifact.
import { fetchFredObservations } from './zscoreSpreadEngine.js';
import { CPI_UNIVERSE, toSeries, yoyPct } from './cpiEngine.js';

// Same 10Y series IDs already confirmed and in production use via
// js/econTrendEngine.js's ECON_UNIVERSE — re-declared here (not imported)
// since that file's `rate`/`unemp` fields and publication-lag machinery are
// specific to its own backtest use case and not needed here.
export const REAL_YIELD_UNIVERSE = {
  USD: 'GS10',
  EUR: 'IRLTLT01DEM156N',
  GBP: 'IRLTLT01GBM156N',
  JPY: 'IRLTLT01JPM156N',
  AUD: 'IRLTLT01AUM156N',
  CAD: 'IRLTLT01CAM156N',
  CHF: 'IRLTLT01CHM156N',
  NZD: 'IRLTLT01NZM156N',
};

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
// Raw OECD/FRED values arrive with long floating-point tails — round to 2dp
// for anything surfaced as a headline "latest" reading.
const round2 = v => (v == null ? null : +v.toFixed(2));

// CPI YoY%, same isIndex-aware treatment cpiEngine.js's (unexported)
// toYoySeries gives it — duplicated here rather than exported from that
// file since it's a 2-line glue function, same "small pure-function
// duplication over cross-file plumbing" convention every engine here uses.
function cpiYoySeries(cpiObsMap, meta) {
  const series = toSeries(cpiObsMap);
  return meta?.isIndex ? yoyPct(series) : series.map(pt => ({ ...pt, yoy: pt.value == null ? null : round2(pt.value) }));
}

// Forward-fill join: for each yield observation, attach the most recent
// CPI YoY% known AS OF that date (never a future reading) — see file
// header for why this is the economically correct join, not an
// approximation.
export function mergeRealYield(y10Series, cpiYoy) {
  const out = [];
  let ci = -1;
  for (const y of y10Series) {
    while (ci + 1 < cpiYoy.length && cpiYoy[ci + 1].date <= y.date) ci++;
    const cpi = ci >= 0 ? cpiYoy[ci] : null;
    if (cpi?.yoy == null || y.value == null) continue;
    out.push({ date: y.date, y10: y.value, cpiYoy: cpi.yoy, real: y.value - cpi.yoy });
  }
  return out;
}

// Real yield vs. its OWN trailing history — is the carry-adjusted return
// this currency offers unusually rich or cheap relative to its own recent
// norm. `latestReal` (the raw level) is the primary cross-currency-
// comparable read; `score` is the secondary "is this level unusual" trend
// read, same two-dimension pattern CPI's level+trend pair uses.
export function realYieldScore(y10ObsMap, cpiObsMap, cpiMeta) {
  const y10Series = toSeries(y10ObsMap);
  const cpiYoy = cpiYoySeries(cpiObsMap, cpiMeta);
  const merged = mergeRealYield(y10Series, cpiYoy);
  const latest = merged.at(-1);
  if (merged.length < 8) {
    return { latestReal: round2(latest?.real), latestY10: round2(latest?.y10), latestCpiYoy: round2(latest?.cpiYoy), latestDate: latest?.date ?? null, z: null, score: null };
  }
  const z = latestZScore(merged.map(p => p.real));
  return { latestReal: round2(latest.real), latestY10: round2(latest.y10), latestCpiYoy: round2(latest.cpiYoy), latestDate: latest.date, z, score: zToScore(z) };
}

// Fetch the two series this currency needs (10Y yield + CPI headline).
// Never throws on a single missing/failed series — availability is
// reported alongside, same pattern as every other engine here.
export async function fetchRealYieldData(ccy, fredKey, fromDate = '2000-01-01') {
  const y10Series = REAL_YIELD_UNIVERSE[ccy];
  const cpiMeta = CPI_UNIVERSE[ccy]?.headline;
  if (!y10Series || !cpiMeta) throw new Error(`No real-yield series configured for ${ccy}`);
  const data = {}, availability = [];
  await Promise.all([
    ['y10', y10Series],
    ['cpi', cpiMeta.series],
  ].map(async ([factor, seriesId]) => {
    try {
      const obs = await fetchFredObservations(seriesId, fromDate, fredKey);
      data[factor] = obs;
      availability.push({ factor, series: seriesId, n: obs.size });
    } catch (e) {
      availability.push({ factor, series: seriesId, n: 0, error: e.message });
    }
  }));
  return { data, cpiMeta, availability };
}
