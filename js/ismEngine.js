// js/ismEngine.js — Business Activity Numeric-Composition Engine.
//
// Same shape and philosophy as js/cpiEngine.js/js/gdpEngine.js: a pure
// numeric score from FRED series, not a text-reading engine. Named
// "ismEngine" for the backlog item that spawned it, but the actual ISM
// (Institute for Supply Management) Manufacturing/Services PMI is
// CONFIRMED NOT AVAILABLE on FRED — ISM had all 22 of its series pulled
// from FRED in June 2016 at its own request (independently corroborated by
// this codebase's own js/globalLiquidityEngine.js:204 comment, "ISM/NAPM
// is discontinued so it's not used client-side"). No ID, old or new, gets
// you ISM data through FRED. Scoping down rather than guessing:
//
// USD gets real, confirmed FRED proxies for business activity instead:
//   - INDPRO: Industrial Production Index (Fed Board) — an index level,
//     YoY% computed same as CPI's index-level series.
//   - GACDFSA066MSFRBPHI: Philadelphia Fed Manufacturing Business Outlook
//     Survey, "Current General Activity" — a diffusion-style index,
//     ALREADY centered near zero (positive=expansion), no transform needed.
//   - GACDISA066MSFRBNY: NY Fed Empire State Manufacturing Survey, same
//     shape as Philly Fed.
//
// The other 7 currencies get a DIFFERENT, explicitly-labeled dimension —
// "business confidence", NOT "PMI" — from OECD's Business Tendency Survey
// composite indicator (`BSCICP02` family). This is real, free, and
// genuinely updating, but it is NOT a PMI/ISM equivalent (different survey
// design, different scale, unsynchronized release calendar) — presenting
// it as one would mislead a reader who knows what PMI numbers usually look
// like, hence the distinct dimension name throughout this file and its UI.
// Naming convention is NOT uniform across countries (most are
// `BSCICP02{cc}{freq}460S`, but Japan and Canada are prefixed
// `{CCC}BSCICP02STSA{freq}`) — every ID below was individually confirmed
// during research, not derived from a template. EUR uses Germany's
// national indicator (no confirmed Euro-Area-wide composite was found),
// consistent with ECON_UNIVERSE's existing EUR-via-Germany convention.
//
// Series verified via web search (this sandbox can't reach
// api.stlouisfed.org directly, same constraint as every other fetch
// module here) — re-verify the first time this actually runs against FRED.
import { fetchFredObservations } from './zscoreSpreadEngine.js';

export const ISM_UNIVERSE = {
  USD: { industrialProduction: 'INDPRO', philFed: 'GACDFSA066MSFRBPHI', empireState: 'GACDISA066MSFRBNY' },
  EUR: { businessConfidence: 'BSCICP02DEM460S' },
  GBP: { businessConfidence: 'BSCICP02GBM460S' },
  JPY: { businessConfidence: 'JPNBSCICP02STSAQ' },
  AUD: { businessConfidence: 'BSCICP02AUQ460S' },
  CAD: { businessConfidence: 'CANBSCICP02STSAQ' },
  CHF: { businessConfidence: 'BSCICP02CHM460S' },
  NZD: { businessConfidence: 'BSCICP02NZQ460S' },
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
const zToScore = z => (z == null ? null : clip(z / 2.5));

// ── Named dimensions ─────────────────────────────────────────────────────

// Industrial production: index level -> YoY% -> z-scored vs its own
// trailing history, same "trend relative to own norm" framing as CPI/GDP.
export function industrialProductionScore(obsMap) {
  const series = yoyPct(toSeries(obsMap));
  const yoys = series.map(p => p.yoy);
  const z = latestZScore(yoys);
  const latest = series.at(-1);
  return { latestYoy: latest?.yoy ?? null, latestDate: latest?.date ?? null, z, score: zToScore(z) };
}

// Diffusion-style regional Fed surveys (Philly Fed, Empire State) — the
// raw value is ALREADY a directly-interpretable expansion/contraction
// read (positive=expansion, roughly zero-centered), so no YoY/index
// transform is needed, just z-score it against its own history for
// magnitude context. `expanding` reports the raw sign directly, same
// "binary flag alongside the z-score" pattern GDP's recessionFlag uses.
export function diffusionIndexScore(obsMap, lookback = 24) {
  const series = toSeries(obsMap);
  const latest = series.at(-1);
  if (series.length < 8) return { latestValue: latest?.value ?? null, latestDate: latest?.date ?? null, z: null, score: null, expanding: null };
  const z = latestZScore(series.map(p => p.value), lookback);
  return { latestValue: latest?.value ?? null, latestDate: latest?.date ?? null, z, score: zToScore(z), expanding: latest?.value > 0 };
}

// Business confidence (non-USD currencies) — same diffusion-style
// treatment as the regional Fed surveys; NOT a PMI equivalent, see file
// header. Quarterly-cadence currencies (JPY, CAD, AUD, NZD per their
// confirmed series) get a shorter lookback, same reasoning as GDP's.
export function businessConfidenceScore(obsMap, quarterly = false) {
  return diffusionIndexScore(obsMap, quarterly ? 12 : 24);
}

const QUARTERLY_CONFIDENCE = new Set(['JPY', 'CAD', 'AUD', 'NZD']);

// Composite read for one currency. USD averages its three dimensions;
// every other currency's composite IS its single businessConfidence score
// directly (no averaging needed, and no cross-contamination with USD's
// differently-sourced/differently-scaled dimensions).
export function ismScore(ccy, data = {}) {
  const dims = {};
  if (ccy === 'USD') {
    if (data.industrialProduction) dims.industrialProduction = industrialProductionScore(data.industrialProduction);
    if (data.philFed) dims.philFed = diffusionIndexScore(data.philFed);
    if (data.empireState) dims.empireState = diffusionIndexScore(data.empireState);
    const inputs = [dims.industrialProduction?.score, dims.philFed?.score, dims.empireState?.score].filter(s => s != null);
    const activity = inputs.length ? +(inputs.reduce((s, v) => s + v, 0) / inputs.length).toFixed(2) : null;
    return { dims, activity, coverage: Object.keys(dims) };
  }
  if (data.businessConfidence) dims.businessConfidence = businessConfidenceScore(data.businessConfidence, QUARTERLY_CONFIDENCE.has(ccy));
  return { dims, activity: dims.businessConfidence?.score ?? null, coverage: Object.keys(dims) };
}

// Fetch every configured series for one currency. Never throws on a
// single missing/failed series, same availability-reporting pattern as
// every other engine here.
export async function fetchIsmData(ccy, fredKey, fromDate = '2000-01-01') {
  const cfg = ISM_UNIVERSE[ccy];
  if (!cfg) throw new Error(`No business-activity series configured for ${ccy}`);
  const data = {}, availability = [];
  await Promise.all(Object.entries(cfg).map(async ([factor, seriesId]) => {
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
