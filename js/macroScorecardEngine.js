// js/macroScorecardEngine.js — Cross-Engine Macro Scorecard.
//
// Every other engine in this file family (cpiEngine/gdpEngine/ismEngine/
// laborMarketEngine/retailSalesEngine/tradeBalanceEngine/realYieldEngine/
// ppiEngine, plus the FOMC/ECB/BoE/BoJ text-sentiment engines) scores ONE
// dimension per currency and writes it to its own KV/page. None of them
// talk to each other — this file is the one place that does: it takes the
// already-computed composite score from each engine (all deliberately
// scaled -1..+1 by their own zToScore/clip conventions, so no re-scaling
// is needed here) and averages whichever dimensions are actually
// available for a currency into ONE ranked cross-currency read.
//
// Deliberately a pure, dependency-free aggregator — it does no fetching of
// its own. server.js is responsible for reading each engine's KV (data
// that's already being refreshed on its own daily-gated schedule) and
// handing this file plain {ccy: {dim: score}} objects. This keeps the
// scorecard cheap to serve (no new FRED/network calls, no new refresh
// loop to maintain) and keeps this file trivially testable with synthetic
// inputs, same as every other engine here.
//
// Equal-weight average, deliberately simple: every dimension already
// arrives on the same -1..+1 scale via each engine's own zToScore/clip
// convention, so there's no principled reason to weight one more than
// another without real backtested evidence for a specific weighting — an
// unweighted average is the honest default until/unless that evidence
// exists. `cbSentiment` (central-bank text sentiment) is only available
// for the 4 currencies with a built sentiment engine (USD/EUR/GBP/JPY) —
// AUD/CAD/CHF/NZD simply score on their remaining dimensions, same
// "average whatever's available" pattern every per-engine composite here
// already uses for partial coverage.
export const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];

const round2 = v => (v == null ? null : +v.toFixed(2));

// One currency's composite: `dims` = plain object of {dimKey: score|null},
// score already on the -1..+1 scale. Skips null/non-finite entries rather
// than treating "no data" as "score 0" — a currency with 3 of 9
// dimensions covered is NOT the same as one reading dead-neutral on all 9.
export function scorecardForCcy(ccy, dims = {}) {
  const entries = Object.entries(dims).filter(([, v]) => v != null && Number.isFinite(v));
  const composite = entries.length ? round2(entries.reduce((s, [, v]) => s + v, 0) / entries.length) : null;
  return { ccy, composite, coverage: entries.map(([k]) => k), dims };
}

// byCcyDims = { USD: {cbSentiment, cpi, gdp, ...}, EUR: {...}, ... }.
// Ranked descending (strongest composite first); currencies with zero
// covered dimensions are reported separately rather than silently dropped
// or sorted arbitrarily among themselves.
export function buildScorecard(byCcyDims = {}) {
  const rows = CCYS.map(ccy => scorecardForCcy(ccy, byCcyDims[ccy] || {}));
  const ranked = rows.filter(r => r.composite != null).sort((a, b) => b.composite - a.composite);
  const uncovered = rows.filter(r => r.composite == null).map(r => r.ccy);
  return { ranked, uncovered };
}

// The single most direct "usable trade view" read: pair the strongest and
// weakest composite as a long/short idea. Requires the gap to clear a
// small floor (0.15) so two currencies both reading near-neutral don't
// get presented as a confident pair — "everything's roughly flat" is a
// real, valid answer this should be able to give instead of forcing a
// pair every time.
export function topBottomPair(ranked = []) {
  if (ranked.length < 2) return null;
  const top = ranked[0], bottom = ranked.at(-1);
  const gap = round2(top.composite - bottom.composite);
  if (gap < 0.15) return null;
  return { long: top.ccy, short: bottom.ccy, gap };
}
