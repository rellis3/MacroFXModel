// js/rateDiffEngine.js — Short-Rate ("Carry") Differential Numeric-Composition Engine.
//
// Same shape and philosophy as js/realYieldEngine.js: a pure numeric score,
// entirely DERIVED from series this codebase already pulls elsewhere. The
// short leg is YIELD_CURVE_UNIVERSE's own `.short` series (single source of
// truth — de_short/gb_short/jp_short/au_short/ca_short/ch_short/nz_short in
// all but name, already confirmed and in production use via the `yieldCurve`
// dimension and js/macro.js's per-pair Rate Differential tier, which
// compares `us2y` against each of those same series).
//
// This is the FX carry signal itself (Lustig-Verdelhan: currencies paying a
// higher short rate earn a carry premium), not a proxy for it. `latestRate`
// is the primary cross-currency-comparable read — nominal short-term rate
// level, deliberately NOT inflation-adjusted (carry is earned/paid in
// nominal terms, unlike real yield). `score` is the secondary "vs own
// history" trend read: a currency whose short rate is unusually high, or
// rising, relative to ITS OWN recent history is one where the rate
// differential is WIDENING in that currency's favor right now — same
// "report the level AND the trend" two-field pattern realYieldEngine.js /
// yieldCurveEngine.js use, and `score` is the field
// macroScorecardEngine.js's byCcyDims average actually consumes
// (cross-currency ranking falls out of comparing each currency's
// own-history-relative score, same as every other dimension in this
// family — not a second vs-USD subtraction here).
import { toSeries, latestZScore, YIELD_CURVE_UNIVERSE } from './yieldCurveEngine.js';
import { fetchFredObservations } from './zscoreSpreadEngine.js';

export const RATE_DIFF_UNIVERSE = Object.fromEntries(
  Object.entries(YIELD_CURVE_UNIVERSE).map(([ccy, cfg]) => [ccy, cfg.short])
);

const clip = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));
const zToScore = z => (z == null ? null : round2(clip(z / 2.5)));
const round2 = v => (v == null ? null : +v.toFixed(2));

// Short rate vs. its OWN trailing history — is this currency's policy rate
// unusually high/rising relative to its own recent norm (differential
// widening in its favor) or low/falling (narrowing). `latestRate` is the
// primary cross-currency-comparable read; `score` is the secondary trend
// read macroScorecardEngine.js averages into the composite.
export function rateDiffScore(rateObsMap) {
  const series = toSeries(rateObsMap);
  const latest = series.at(-1);
  if (series.length < 8) {
    return { latestRate: round2(latest?.value), latestDate: latest?.date ?? null, z: null, score: null };
  }
  const z = latestZScore(series.map(p => p.value));
  return { latestRate: round2(latest.value), latestDate: latest.date, z, score: zToScore(z) };
}

// Fetch the one series this currency needs. Never throws for the caller to
// treat as a hard failure across currencies — availability is reported
// alongside, same pattern as every other engine here.
export async function fetchRateDiffData(ccy, fredKey, fromDate = '2000-01-01') {
  const seriesId = RATE_DIFF_UNIVERSE[ccy];
  if (!seriesId) throw new Error(`No rate-differential series configured for ${ccy}`);
  const obs = await fetchFredObservations(seriesId, fromDate, fredKey);
  return { obs, series: seriesId };
}
