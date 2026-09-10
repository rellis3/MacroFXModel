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

// Budgets by CADENCE, which override the per-dimension ones above whenever the
// engine tells us how often its series actually publishes.
//
// The per-dimension table cannot be right on its own, because most dimensions mix
// cadences ACROSS currencies: retail sales is monthly for the US and quarterly for
// the other seven; labour mixes monthly unemployment with quarterly wages; business
// confidence is quarterly for AUD/NZD and monthly for the rest. A single number per
// dimension has to be either too tight for the quarterly members or too loose for
// the monthly ones, and it was set from the monthly assumption -- so on 2026-09-10
// the live board flagged 25 currency-dimensions stale, of which roughly half were
// healthy quarterly prints being judged against a ~150-day budget. GBP retail sales
// published for Q2 on 2026-04-01 is 162 days old in September and completely
// normal; it was being struck through and dropped from the composite.
//
// A quarterly series read late in the following quarter is legitimately ~250 days
// old, so 300 is the first threshold that clears the slowest honest case. It still
// catches the genuinely dead: CAD retail sales stopped in 2022 (56 months) and JPY
// CPI in 2021 (63 months) are nowhere near it.
export const MAX_AGE_BY_CADENCE = {
  daily: 10,
  weekly: 30,
  monthly: 130,
  quarterly: 300,
};

// ── Factors: what the dimensions are actually MEASURING ─────────────────────
// The equal-weight average over dimensions has a flaw that is easy to miss and
// hard to defend once seen: it weights each FACTOR by how many series happen to
// measure it, not by any decision.
//
// `rateDiff`, `realYield` and `yieldCurve` are three views of rates. `cpi` and
// `ppi` are two views of inflation. So a flat mean over 12 dimensions silently
// hands rates ~25% of the score and inflation ~17% — and adding a fourth rates
// series tomorrow would quietly push rates to a third, with nobody having chosen
// that. An accidental weighting scheme is worse than a stated one you disagree
// with, because there is nothing to argue with.
//
// Grouping first, then weighting the groups, makes the weighting a decision.
export const FACTORS = {
  rates:       { label: 'Rates & policy',   dims: ['rateDiff', 'realYield', 'yieldCurve'] },
  inflation:   { label: 'Inflation',        dims: ['cpi', 'ppi'] },
  growth:      { label: 'Growth',           dims: ['gdp', 'ism'] },
  labour:      { label: 'Labour market',    dims: ['laborMarket'] },
  demand:      { label: 'Domestic demand',  dims: ['retailSales', 'consumerConfidence'] },
  external:    { label: 'External balance', dims: ['tradeBalance'] },
};

// Equal weights, and that IS the considered choice rather than a lazy one.
//
// Any other weighting is a claim about what drives FX, and this repo has banked
// macro-as-signal as a null five times over. A composite that cannot predict has
// one honest job — EXPLAIN why the market is where it is — and for explanation
// the least-assumption weighting is the right one. If a weighting is ever changed
// here it should carry the evidence for it in this comment, not a hunch.
//
// `cbSentiment` is deliberately absent from every factor: hawkish-score momentum
// was pre-registered, tested against forward price and banked null
// (MD files/CB_SENTIMENT_PRICE_TEST.md). It stays available as a descriptive
// dimension and never enters a score.
export const FACTOR_WEIGHTS = {
  rates: 1, inflation: 1, growth: 1, labour: 1, demand: 1, external: 1,
};
export const DIM_TO_FACTOR = Object.fromEntries(
  Object.entries(FACTORS).flatMap(([f, { dims }]) => dims.map(d => [d, f])));

/**
 * Roll per-dimension reads up into factors, then into one composite.
 *
 * `reads` = { dimKey: {score, stale, ...} } as produced by readDim. A dimension
 * that is null or stale is EXCLUDED — never averaged in as a zero — so a factor
 * scores on whatever it genuinely has, and a factor with nothing usable returns
 * null rather than a confident zero.
 */
export function rollUpFactors(reads = {}) {
  const factors = {};
  for (const [key, { label, dims }] of Object.entries(FACTORS)) {
    const used = dims
      .map(d => ({ dim: d, r: reads[d] }))
      .filter(x => x.r && x.r.score != null && !x.r.stale);
    const excluded = dims
      .map(d => ({ dim: d, r: reads[d] }))
      .filter(x => x.r && x.r.score != null && x.r.stale)
      .map(x => x.dim);
    factors[key] = {
      label,
      score: used.length ? round2(used.reduce((a, x) => a + x.r.score, 0) / used.length) : null,
      dims: used.map(x => x.dim),
      excludedStale: excluded,
      // How much of this factor is actually backed by data — a factor resting on
      // one of three possible series is a weaker statement than one on all three.
      coverage: dims.length ? +(used.length / dims.length).toFixed(2) : 0,
      of: dims.length,
    };
  }
  const scored = Object.entries(factors).filter(([, f]) => f.score != null);
  const wSum = scored.reduce((a, [k]) => a + (FACTOR_WEIGHTS[k] ?? 1), 0);
  const composite = wSum > 0
    ? round2(scored.reduce((a, [k, f]) => a + f.score * (FACTOR_WEIGHTS[k] ?? 1), 0) / wSum)
    : null;
  return { factors, composite, factorsScored: scored.length, factorsTotal: Object.keys(FACTORS).length };
}

/** The factor pulling a currency hardest, for the one-line read. */
export function dominantFactor(factors = {}) {
  let best = null;
  for (const [key, f] of Object.entries(factors)) {
    if (f?.score == null) continue;
    if (!best || Math.abs(f.score) > Math.abs(best.score)) best = { key, ...f };
  }
  return best;
}

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
  // Cadence wins when the engine reports it, because it describes THIS currency's
  // series rather than the dimension's most common cadence across currencies.
  const maxAgeDays = (v.cadence && MAX_AGE_BY_CADENCE[v.cadence])
    ?? MAX_AGE_DAYS[key] ?? DEFAULT_MAX_AGE_DAYS;
  return {
    score, asOf: v.asOf, ageDays, maxAgeDays, cadence: v.cadence ?? null,
    stale: ageDays > maxAgeDays,
  };
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
  // Factor roll-up is now the PRIMARY read; `composite` below is derived from it
  // rather than from a flat mean over dimensions, so rates no longer gets triple
  // weight for having three series pointed at it.
  const reads = Object.fromEntries(read);
  const { factors, composite: factorComposite, factorsScored, factorsTotal } = rollUpFactors(reads);
  return {
    ccy,
    // The flat-dimension mean is kept as `dimMeanComposite` for continuity with
    // anything still reading the old number, but `composite` is the factor-weighted
    // one — that is the field consumers should use, and the two differing is
    // informative rather than a bug.
    composite: factorComposite, dimMeanComposite: composite,
    factors, factorsScored, factorsTotal,
    dominant: dominantFactor(factors),
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

/**
 * The board seen one factor at a time — which factor is actually SEPARATING
 * currencies right now.
 *
 * The composite answers "who is strong". This answers the more useful question for
 * a reader trying to understand the day: WHY. If every currency reads about the
 * same on inflation but rates run from +0.9 to -0.8, then rates is what the FX
 * board is trading on today and the inflation column is noise, however interesting
 * the individual prints were.
 *
 * `spread` (max - min) is the honest measure of that: a factor everyone agrees on
 * cannot drive relative value between currencies no matter how extreme its level.
 * That is a statement about DISPERSION, not about prediction — nothing here claims
 * the widest factor will move price, only that it is where the macro disagreement
 * currently sits.
 *
 * A factor scored by fewer than two currencies has no spread to speak of and is
 * returned with `spread: null` rather than a zero, which would rank it as the
 * calmest factor on the board when in truth it is simply unmeasured.
 */
export function factorBoard(ranked = []) {
  const out = {};
  for (const [key, { label }] of Object.entries(FACTORS)) {
    const scored = ranked
      .map(r => ({ ccy: r.ccy, score: r.factors?.[key]?.score ?? null, coverage: r.factors?.[key]?.coverage ?? 0 }))
      .filter(x => x.score != null)
      .sort((a, b) => b.score - a.score);
    out[key] = {
      label,
      ranked: scored,
      spread: scored.length >= 2 ? round2(scored[0].score - scored.at(-1).score) : null,
      high: scored[0]?.ccy ?? null,
      low: scored.length >= 2 ? scored.at(-1).ccy : null,
      n: scored.length,
      of: ranked.length,
    };
  }
  // The widest-spread factor, i.e. the axis the board is currently sorted on.
  const driver = Object.entries(out)
    .filter(([, f]) => f.spread != null)
    .sort((a, b) => b[1].spread - a[1].spread)[0] ?? null;
  return { factors: out, driver: driver ? { key: driver[0], ...driver[1] } : null };
}

// The single most direct "usable trade view" read: pair the strongest and
// weakest composite as a long/short idea. Requires the gap to clear a
// small floor (0.15) so two currencies both reading near-neutral don't
// get presented as a confident pair — "everything's roughly flat" is a
// real, valid answer this should be able to give instead of forcing a
// pair every time.
// A currency scored on one or two factors is not comparable to one scored on six:
// with fewer factors each surviving one dominates, so a thin read swings further from
// neutral for no reason other than having less behind it. Ranking them together is
// fine -- calling the extremes of a mixed-depth list "the clearest read today" is not,
// because the extremes are exactly where the thin rows land.
export const MIN_FACTORS_FOR_PAIR = 3;

export function topBottomPair(ranked = [], { minFactors = MIN_FACTORS_FOR_PAIR } = {}) {
  const eligible = ranked.filter(r => (r.factorsScored ?? 0) >= minFactors);
  const setAside = ranked.filter(r => (r.factorsScored ?? 0) < minFactors).map(r => r.ccy);
  if (eligible.length < 2) return null;
  const top = eligible[0], bottom = eligible.at(-1);
  const gap = round2(top.composite - bottom.composite);
  if (gap < 0.15) return null;
  return {
    long: top.ccy, short: bottom.ccy, gap,
    longFactors: top.factorsScored, shortFactors: bottom.factorsScored,
    minFactors,
    // Named rather than silently dropped -- a currency missing from this read for
    // thin coverage is a fact about the data, not about the currency.
    setAside,
  };
}
