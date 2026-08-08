// js/consumerConfidenceEngine.js — Consumer Confidence Numeric-Composition Engine.
//
// Same shape and philosophy as js/ismEngine.js: a pure numeric score from
// FRED series, not a text-reading engine. The demand-side mirror of
// ismEngine.js's business confidence — that file covers what BUSINESSES
// think is coming, this covers what CONSUMERS think, a genuinely distinct
// dimension (a currency can score confident businesses + nervous
// households at once, and that divergence is itself informative).
//
// Confirmed via research (this sandbox can't reach fred.stlouisfed.org
// directly, same constraint as every other fetch module here — re-verify
// the first time this actually runs against FRED):
//
// USD: UMCSENT (University of Michigan Consumer Sentiment) — the real,
// desk-referenced series (Conference Board's index is NOT on FRED, it's a
// paywalled Conference Board product; searches for it only surface the
// OECD family below or Conference Board's own subscription page).
//
// EUR/GBP/JPY/AUD/CHF/NZD: OECD's Consumer Confidence Indicator
// (`CSCICP02` family) — CONFIRMED LIVE with real 2025/2026 observations
// for 6 of 7 non-USD currencies (unlike PPI's OECD family, which turned
// out frozen since Dec 2022 — this one genuinely isn't). EUR uses Germany,
// consistent with this codebase's existing EUR-via-Germany convention
// (an EA-wide alternative, `CSCICP02EZM460S`, was also confirmed live and
// is noted here as a real option if the project ever wants to switch).
//
// CAD: NO LIVE SERIES EXISTS. Every OECD consumer-confidence ID for
// Canada found during research (`CSCICP02CAM661N`, `CSCICP02CAQ661N`,
// `CSCICP03CAM665S`) is explicitly labeled DISCONTINUED on its own FRED
// page, last observation 2014-2017 — worse than PPI's "frozen but not
// labeled as such" gap, this one is confirmed dead at the source. Same
// "scope down rather than guess" discipline as every other confirmed gap
// in this codebase: CAD is simply not covered, not silently defaulted to
// a stale ID.
//
// Units: every series here — UMCSENT (an index level, historically
// ~50-110, mean-reverting rather than secularly trending) and the OECD
// `CSCICP02` percentage-balance readings (~-20 to +20) — gets the SAME
// treatment: z-score the raw level directly against its own trailing
// history, no YoY/index transform needed. This mirrors ismEngine.js's
// diffusionIndexScore, which already generalizes to "any range-bound
// survey statistic," regardless of whether the underlying number is
// centered on zero or on ~85-100 — the z-score only cares about deviation
// from the series' OWN mean, not the absolute scale.
import { fetchFredObservations } from './zscoreSpreadEngine.js';

export const CONFIDENCE_UNIVERSE = {
  USD: 'UMCSENT',
  EUR: 'CSCICP02DEM460S',
  GBP: 'CSCICP02GBM460S',
  JPY: 'CSCICP02JPM460S',
  AUD: 'CSCICP02AUM460S',
  CHF: 'CSCICP02CHQ460S',
  NZD: 'NZLCSCICP02STSAQ',
  // CAD deliberately absent — see file header.
};

// CHF and NZD's confirmed series are genuinely quarterly at the source
// (no monthly variant found for either during research) — a DIFFERENT set
// than ismEngine.js's QUARTERLY_CONFIDENCE (JPY/CAD/AUD/NZD for business
// confidence); do not copy that set here, the two surveys have different
// per-country cadences.
const QUARTERLY_CCY = new Set(['CHF', 'NZD']);

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

// Confidence vs. its OWN trailing history — is this currency's household
// sentiment unusually upbeat or downbeat relative to its own recent norm.
// Quarterly-cadence currencies (CHF, NZD per their confirmed series) get a
// shorter lookback, same reasoning as every other quarterly-aware engine
// here.
export function confidenceScore(obsMap, quarterly = false) {
  const series = toSeries(obsMap);
  const latest = series.at(-1);
  if (series.length < 8) return { latestValue: round2(latest?.value), latestDate: latest?.date ?? null, z: null, score: null };
  const z = latestZScore(series.map(p => p.value), quarterly ? 12 : 24);
  return { latestValue: round2(latest?.value), latestDate: latest?.date ?? null, z, score: zToScore(z) };
}

// Composite read for one currency — a single dimension (no core/headline
// split the way CPI has), so the composite IS the confidence score
// directly.
export function consumerConfidenceCompositeScore(ccy, obsMap) {
  if (!obsMap) return { confidence: null, coverage: [] };
  const r = confidenceScore(obsMap, QUARTERLY_CCY.has(ccy));
  return { ...r, confidence: r.score, coverage: ['confidence'] };
}

// Fetch the one configured series for one currency. Never throws — a
// failed fetch just reports via availability, same pattern as every other
// engine here.
export async function fetchConsumerConfidenceData(ccy, fredKey, fromDate = '2000-01-01') {
  const seriesId = CONFIDENCE_UNIVERSE[ccy];
  if (!seriesId) throw new Error(`No consumer confidence series configured for ${ccy}`);
  try {
    const obs = await fetchFredObservations(seriesId, fromDate, fredKey);
    return { data: obs, availability: [{ series: seriesId, n: obs.size }] };
  } catch (e) {
    return { data: null, availability: [{ series: seriesId, n: 0, error: e.message }] };
  }
}
