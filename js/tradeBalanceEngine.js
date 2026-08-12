// js/tradeBalanceEngine.js — Trade Balance Numeric-Composition Engine.
//
// Same shape and philosophy as js/gdpEngine.js/js/cpiEngine.js: a pure
// numeric score from FRED series, not a text-reading engine.
//
// USD: `BOPGSTB` (Trade Balance: Goods and Services, Balance of Payments
// Basis) — confirmed real, Millions of $, SA. This is a goods+services
// LEVEL; the other 7 currencies' OECD series below are goods-only, a real
// definitional mismatch flagged here rather than papered over (a
// goods-only USD alternative, `BOPGTB`, exists and would be the closer
// methodological match, but BOPGSTB is the figure actually headlined as
// "the US trade balance" and is what a reader expects on this page).
//
// The other 7 currencies use OECD's `XTNTVA01{cc}M667S` ("International
// Merchandise Trade Statistics: Trade Balance: Commodities", US Dollars
// exchange-rate-converted, SA) — confirmed monthly for all 7, including
// AUD/CAD/NZD (this module's highest-relevance currencies, given trade
// balance's outsized weight in commodity-currency FX). Goods-only, not
// goods+services — see USD note above.
//
// Deliberately NOT %-change-scored. Trade balance can cross zero
// (surplus <-> deficit) and Germany/Switzerland run persistent large
// surpluses while UK/Australia/NZ often run persistent deficits — a raw
// %-change calc on a value near zero, or one that flips sign, produces
// explosive or meaningless percentages (e.g. -$50M -> +$50M is technically
// -200% but says nothing useful). Instead this z-scores the RAW LEVEL
// directly against its own trailing history — the same treatment
// ismEngine.js's diffusionIndexScore gives Philly Fed/Empire State (already
// a directly-interpretable, roughly-zero-centered read) — which sidesteps
// the div-by-near-zero blowup entirely while still answering the useful
// question: is this economy's trade position unusually strong or weak
// relative to ITS OWN recent norm (the cross-currency comparison is on the
// resulting -1..1 score, never on the raw $ level, so the large difference
// in absolute trade-flow size between e.g. Switzerland and New Zealand
// never enters the comparison).
//
// EUR uses Germany (`XTNTVA01DEM667S`), consistent with this codebase's
// existing EUR-via-Germany convention.
//
// Series verified via web search (this sandbox can't reach
// api.stlouisfed.org directly, same constraint as every other fetch module
// here) — re-verify the first time this actually runs against FRED.
import { fetchFredObservations } from './zscoreSpreadEngine.js';

export const TRADE_BALANCE_UNIVERSE = {
  USD: 'BOPGSTB',
  EUR: 'XTNTVA01DEM667S',
  GBP: 'XTNTVA01GBM667S',
  JPY: 'XTNTVA01JPM667S',
  AUD: 'XTNTVA01AUM667S',
  CAD: 'XTNTVA01CAM667S',
  CHF: 'XTNTVA01CHM667S',
  NZD: 'XTNTVA01NZM667S',
};

// ── Pure stats helpers (identical shape to gdpEngine.js's) ─────────────────

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
const zToScore = z => (z == null ? null : round2(clip(z / 2.5)));
// Raw OECD/FRED values arrive with long floating-point tails — round to 2dp
// for anything surfaced as a headline "latest" reading; the underlying
// z-score math still runs on the raw value.
const round2 = v => (v == null ? null : +v.toFixed(2));

// Trade position vs. its OWN trailing history — is this month's balance
// unusually strong (widening surplus / narrowing deficit) or weak
// (widening deficit / narrowing surplus) relative to this economy's own
// recent norm. `surplus` reports the raw sign directly alongside the
// z-score, same "binary flag alongside the z-score" pattern GDP's
// recessionFlag and ISM's `expanding` use.
export function tradeBalanceScore(obsMap) {
  const series = toSeries(obsMap);
  const latest = series.at(-1);
  if (series.length < 8) return { latestValue: round2(latest?.value), latestDate: latest?.date ?? null, z: null, score: null, surplus: null };
  const z = latestZScore(series.map(p => p.value));
  return { latestValue: round2(latest?.value), latestDate: latest?.date ?? null, z, score: zToScore(z), surplus: latest?.value >= 0 };
}

// Fetch the one configured series for one currency. Never throws — a
// failed fetch just reports via availability, same pattern as every other
// engine here.
export async function fetchTradeBalanceData(ccy, fredKey, fromDate = '2000-01-01') {
  const seriesId = TRADE_BALANCE_UNIVERSE[ccy];
  if (!seriesId) throw new Error(`No trade balance series configured for ${ccy}`);
  try {
    const obs = await fetchFredObservations(seriesId, fromDate, fredKey);
    return { data: obs, availability: [{ series: seriesId, n: obs.size }] };
  } catch (e) {
    return { data: null, availability: [{ series: seriesId, n: 0, error: e.message }] };
  }
}
