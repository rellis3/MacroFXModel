// js/yieldCurveEngine.js — Yield Curve Slope Numeric-Composition Engine.
//
// Same shape and philosophy as js/realYieldEngine.js: entirely DERIVED, no
// new data source — combines the short-term and 10Y government yield series
// already confirmed and in production use via js/econTrendEngine.js's
// ECON_UNIVERSE (`rate`/`y10` fields). No new research needed for this one:
// both legs are the exact same series IDs Real Yield's y10 leg and
// econTrendEngine's backtest already fetch live.
//
// Slope = long (10Y) minus short. Positive = normal upward-sloping curve
// (long pays more than short, the historical norm). Negative = inverted —
// the classic recession/rate-cut-expectation signal a trader watches for.
// Like Real Yield, the raw slope itself is genuinely cross-currency
// comparable (a percentage-point spread, already normalized for currency
// and economy size), so it's reported as the primary read (`latestSlope`),
// with a z-vs-own-history trend score alongside it (is the curve unusually
// flat/steep/inverted relative to THIS currency's own recent norm) — same
// "level + trend" two-dimension pattern Real Yield and CPI use.
//
// Short and long legs don't necessarily share a release date — mergeSlope
// forward-fills the latest KNOWN short-rate reading onto each long-yield
// observation date (never a future one), same economically-correct join
// realYieldEngine.js's mergeRealYield uses for its yield/CPI pairing.
import { fetchFredObservations } from './zscoreSpreadEngine.js';

// Re-declared here (not imported from econTrendEngine.js) since that file's
// `unemp` field and publication-lag machinery are specific to its own
// backtest use case and not needed here — same convention realYieldEngine.js
// already established for its y10 leg.
export const YIELD_CURVE_UNIVERSE = {
  USD: { short: 'GS2', long: 'GS10' },
  EUR: { short: 'IRSTCI01DEM156N', long: 'IRLTLT01DEM156N' },
  GBP: { short: 'IR3TIB01GBM156N', long: 'IRLTLT01GBM156N' },
  JPY: { short: 'IRSTCI01JPM156N', long: 'IRLTLT01JPM156N' },
  AUD: { short: 'IR3TIB01AUM156N', long: 'IRLTLT01AUM156N' },
  CAD: { short: 'IRSTCI01CAM156N', long: 'IRLTLT01CAM156N' },
  CHF: { short: 'IRSTCI01CHM156N', long: 'IRLTLT01CHM156N' },
  NZD: { short: 'IR3TIB01NZM156N', long: 'IRLTLT01NZM156N' },
};

export function toSeries(obsMap) {
  if (!obsMap) return [];
  return [...obsMap.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
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
const round2 = v => (v == null ? null : +v.toFixed(2));
const zToScore = z => (z == null ? null : round2(clip(z / 2.5)));

// Forward-fill join: for each long-yield observation, attach the most
// recent short-rate reading known AS OF that date (never a future one) —
// same reasoning as realYieldEngine.js's mergeRealYield.
export function mergeSlope(longSeries, shortSeries) {
  const out = [];
  let si = -1;
  for (const l of longSeries) {
    while (si + 1 < shortSeries.length && shortSeries[si + 1].date <= l.date) si++;
    const s = si >= 0 ? shortSeries[si] : null;
    if (s?.value == null || l.value == null) continue;
    out.push({ date: l.date, long: l.value, short: s.value, slope: round2(l.value - s.value) });
  }
  return out;
}

// Curve shape vs. its OWN trailing history — is the slope unusually flat,
// steep, or inverted relative to this currency's own recent norm.
// `inverted` reports the raw sign directly alongside the z-score, same
// "binary flag alongside the z-score" pattern GDP's recessionFlag and
// ISM's `expanding` use.
export function yieldCurveScore(longObsMap, shortObsMap) {
  const longSeries = toSeries(longObsMap);
  const shortSeries = toSeries(shortObsMap);
  const merged = mergeSlope(longSeries, shortSeries);
  const latest = merged.at(-1);
  if (merged.length < 8) {
    return { latestSlope: latest?.slope ?? null, latestLong: round2(latest?.long), latestShort: round2(latest?.short), latestDate: latest?.date ?? null, z: null, score: null, inverted: null };
  }
  const z = latestZScore(merged.map(p => p.slope));
  return { latestSlope: latest.slope, latestLong: round2(latest.long), latestShort: round2(latest.short), latestDate: latest.date, z, score: zToScore(z), inverted: latest.slope < 0 };
}

// Fetch the two series this currency needs (short rate + 10Y yield). Never
// throws on a single missing/failed series — availability is reported
// alongside, same pattern as every other engine here.
export async function fetchYieldCurveData(ccy, fredKey, fromDate = '2000-01-01') {
  const cfg = YIELD_CURVE_UNIVERSE[ccy];
  if (!cfg) throw new Error(`No yield curve series configured for ${ccy}`);
  const data = {}, availability = [];
  await Promise.all([
    ['short', cfg.short],
    ['long', cfg.long],
  ].map(async ([factor, seriesId]) => {
    try {
      const obs = await fetchFredObservations(seriesId, fromDate, fredKey);
      data[factor] = obs;
      availability.push({ factor, series: seriesId, n: obs.size });
    } catch (e) {
      availability.push({ factor, series: seriesId, n: 0, error: e.message });
    }
  }));
  return { data, availability };
}
