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

// ── Staleness gate ──────────────────────────────────────────────────────────
// A dimension whose newest OBSERVATION is years old still produced a number, and
// until now that number was averaged in as though it described today. Audited
// 2026-09-07: the OECD series family on FRED (CPALTT01*, CPGRLE01*, IRLTLT01*,
// SLRTTO01*, CSCICP02*) is discontinued or frozen, so JPY CPI was scoring -0.48
// off a June 2021 print, and EUR/GBP/CAD off March 2025. Those series return a
// full observation history with NO error -- they simply stop -- so nothing
// upstream can catch it. The gate has to live here, where the number is used.
//
// The job of these budgets is to catch a series that has STOPPED, not to enforce
// recency -- so each is set past the worst legitimate publication lag and no
// tighter. The OECD mirrors on FRED run 1-3 months behind by design, and a first
// calibration at ~100 days flagged 25 currency-dimensions, most of them merely
// lagging rather than dead. At these budgets a live-but-slow series passes and a
// stopped one (which is invariably a year or more behind) is still caught within
// a cycle or two.
//
// Deliberately NOT tighter for yieldCurve/realYield: those mix a daily US series
// (GS2/GS10, current to the day) with monthly OECD ones for the other currencies,
// so a single budget has to clear the slowest member.
export const MAX_AGE_DAYS = {
  cbSentiment: 130,        // 8 meetings/yr, ~45d apart, but the summer gap runs long
  cpi: 130,                // monthly, up to ~6wk lag
  ppi: 130,                // monthly
  gdp: 300,                // quarterly, released ~1 quarter in arrears
  ism: 130,                // monthly survey
  laborMarket: 130,        // monthly
  retailSales: 150,        // monthly, ~6wk lag, OECD mirrors slower still
  tradeBalance: 150,       // monthly, ~2 month lag -- the slowest legitimate one
  realYield: 130,          // daily (US) mixed with monthly (OECD)
  yieldCurve: 130,         // same mix; 70 flagged normal 3-month OECD lags
  consumerConfidence: 130, // monthly
  rateDiff: 130,           // monthly
};
export const DEFAULT_MAX_AGE_DAYS = 120;

const DAY_MS = 864e5;
const round2 = v => (v == null ? null : +v.toFixed(2));

// A dimension arrives either as a bare score (caller knows no date -- the old
// shape, still accepted so nothing breaks) or as {score, asOf}. Only the second
// form can be age-checked; a bare number is trusted, as it was before.
export function readDim(key, v, now = Date.now()) {
  if (v == null) return { score: null, asOf: null, ageDays: null, stale: false };
  if (typeof v === 'number') {
    return { score: Number.isFinite(v) ? v : null, asOf: null, ageDays: null, stale: false };
  }
  const score = Number.isFinite(v.score) ? v.score : null;
  const t = v.asOf ? Date.parse(v.asOf) : NaN;
  if (!Number.isFinite(t)) return { score, asOf: v.asOf ?? null, ageDays: null, stale: false };
  const ageDays = Math.floor((now - t) / DAY_MS);
  const maxAgeDays = MAX_AGE_DAYS[key] ?? DEFAULT_MAX_AGE_DAYS;
  return { score, asOf: v.asOf, ageDays, maxAgeDays, stale: ageDays > maxAgeDays };
}

// One currency's composite: `dims` = plain object of {dimKey: score|null},
// score already on the -1..+1 scale. Skips null/non-finite entries rather
// than treating "no data" as "score 0" — a currency with 3 of 9
// dimensions covered is NOT the same as one reading dead-neutral on all 9.
// A stale dimension is EXCLUDED from the composite and from `coverage`, and
// reported in `stale` instead -- the same treatment missing data already gets,
// because a five-year-old inflation print is missing data wearing a number. The
// score itself stays in `dims` so the page can still show it, greyed, rather
// than silently vanishing and looking like a rendering bug.
export function scorecardForCcy(ccy, dims = {}, now = Date.now()) {
  const read = Object.entries(dims).map(([k, v]) => [k, readDim(k, v, now)]);
  const used = read.filter(([, d]) => d.score != null && !d.stale);
  const composite = used.length
    ? round2(used.reduce((s, [, d]) => s + d.score, 0) / used.length) : null;
  const flat = {}, asOf = {}, ageDays = {};
  for (const [k, d] of read) { flat[k] = d.score; asOf[k] = d.asOf; ageDays[k] = d.ageDays; }
  return {
    ccy, composite,
    coverage: used.map(([k]) => k),
    dims: flat, asOf, ageDays,
    stale: read.filter(([, d]) => d.stale)
      .map(([k, d]) => ({ dim: k, asOf: d.asOf, ageDays: d.ageDays, maxAgeDays: d.maxAgeDays, score: d.score })),
  };
}

// byCcyDims = { USD: {cbSentiment, cpi, gdp, ...}, EUR: {...}, ... }.
// Ranked descending (strongest composite first); currencies with zero
// covered dimensions are reported separately rather than silently dropped
// or sorted arbitrarily among themselves.
export function buildScorecard(byCcyDims = {}, now = Date.now()) {
  const rows = CCYS.map(ccy => scorecardForCcy(ccy, byCcyDims[ccy] || {}, now));
  const ranked = rows.filter(r => r.composite != null).sort((a, b) => b.composite - a.composite);
  const uncovered = rows.filter(r => r.composite == null).map(r => r.ccy);
  // Board-wide roll-up of what was dropped, so a caller can surface "5 dimensions
  // excluded as stale" without walking every row to discover it.
  const staleDims = {};
  for (const r of rows) for (const st of r.stale) {
    (staleDims[st.dim] ||= []).push({ ccy: r.ccy, asOf: st.asOf, ageDays: st.ageDays });
  }
  return { ranked, uncovered, staleDims, staleCount: rows.reduce((n, r) => n + r.stale.length, 0) };
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
