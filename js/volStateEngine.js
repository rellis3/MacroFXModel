/**
 * volStateEngine — Tier 1 primitive: derived volatility-STATE metrics layered
 * on top of the existing forecaster output. Every function here is pure (no
 * I/O, no DOM, no network) and consumes fields the forecaster/scheduler
 * already compute — it never re-derives σ, never touches `_buildOutput`,
 * `computeBands`, or anything in `volBacktestEngine.js`/`forecastCore.js`.
 *
 * ADDITIVE CONTRACT (read before extending):
 *   - This module MUST NOT be imported by anything on the live bot's
 *     plan-building path (`volatilityBotPlan.js` / `volatilityBotProducer.js`).
 *     Those read raw `open`/`sigma` and call `computeBands` directly; this
 *     engine is downstream research/UI state, not a trading input.
 *   - Every exported function takes plain numbers/arrays and returns a plain
 *     object. No function here fetches data or mutates its inputs.
 *   - Nothing here is a validated predictive signal. `touchProbability` is a
 *     closed-form Brownian (reflection-principle) approximation, not an
 *     empirical fit — label it as such wherever it's surfaced. Anything
 *     claiming persistence/transition PROBABILITIES from historical data
 *     needs a pre-registered IS/OOS tier study first (see
 *     `volatilityExhaustion/README.md`), not a live payload field.
 *
 * Consumers (additive, do not modify the base object in place):
 *   - `js/volForecast.js` `computeForecast()` — Object.assign's
 *     `volAcceleration`/`termStructureState`/`rangeEfficiencyRatio`/
 *     `realisedSkew` onto its existing return, same pattern already used
 *     for the `ladder` fields.
 *   - `js/volForecastScheduler.js` `getSessionStatus()` — Object.assign's
 *     `pathEfficiency`/`touchProbability`/`amihudIlliquidity` onto
 *     `computeSessionMetrics()`'s return at the call site (function body
 *     untouched).
 *   - `medianTimeToTouch` and `costRatio` are called at the /api/vol-forecast/
 *     intelligence aggregation layer (server.js), not per-instrument, since
 *     they combine forecast fields with a caller-supplied distance/spread.
 */

// ── 1. Volatility acceleration (ΔVol, Δ²Vol) ────────────────────────────────
// First/second differences of the daily σ series, expressed as % change so
// they're scale-free across pairs. Descriptive only — "is vol's own rate of
// change speeding up or slowing down", not a claim about what happens next.
export function volAcceleration(volSeries) {
  const n = volSeries?.length ?? 0;
  if (n < 3) return { d1: null, d2: null, label: 'insufficient_data' };

  const last  = volSeries[n - 1];
  const prev  = volSeries[n - 2];
  const prev2 = volSeries[n - 3];
  if (!(prev > 0) || !(prev2 > 0)) return { d1: null, d2: null, label: 'insufficient_data' };

  const d1prev = (prev - prev2) / prev2;
  const d1     = (last - prev) / prev;
  const d2     = d1 - d1prev;

  const r4 = x => Math.round(x * 10000) / 10000;
  let label = 'stable';
  if      (d1 >  0.03 && d2 >  0.01) label = 'accelerating';
  else if (d1 >  0.03)               label = 'rising';
  else if (d1 < -0.03 && d2 < -0.01) label = 'decelerating';
  else if (d1 < -0.03)               label = 'falling';

  return { d1: r4(d1), d2: r4(d2), label };
}

// ── 2. Term-structure state ─────────────────────────────────────────────────
// Reads the cone percentiles the forecaster ALREADY computes (`vol_pct`,
// `cone_5d`, `cone_21d`, `cone_63d` — see `volForecast.js` `_buildOutput`).
// Does not touch sigma; just labels the shape those numbers already imply.
export function termStructureState({ vol_pct, cone_5d, cone_21d, cone_63d } = {}) {
  if (cone_5d == null || cone_63d == null) return { slope: null, label: 'insufficient_data' };

  const anchor = vol_pct ?? cone_63d;
  const slope  = cone_5d - anchor;   // >0: short-term vol hotter than long-term (expanding)

  let label = 'stable';
  if      (slope >  15) label = 'expanding';    // short-dated vol running hot vs the long window
  else if (slope < -15) label = 'compressing';  // short-dated vol running cold vs the long window

  // Inflection: short AND medium both leaning the same way vs long, an early
  // signal the state may be turning rather than just noisy day-to-day.
  let inflection = false;
  if (cone_21d != null) {
    const midSlope = cone_21d - anchor;
    inflection = (slope > 8 && midSlope > 4) || (slope < -8 && midSlope < -4);
  }

  return { slope: Math.round(slope), label, inflection };
}

// ── 3. Implied − realised premium ───────────────────────────────────────────
// Pure diff. Caller supplies ivAnnual (from the existing CVOL/FRED IV plumbing
// in `volForecastBench.js`/`cvolLoader.js`) — this function does no fetching.
export function ivPremium(ivAnnual, realizedVolAnnual) {
  if (!(ivAnnual > 0) || !(realizedVolAnnual > 0)) return { premium: null, premium_pct: null };
  const premium     = ivAnnual - realizedVolAnnual;
  const premium_pct = premium / realizedVolAnnual * 100;
  const r2 = x => Math.round(x * 100) / 100;
  return { premium: r2(premium), premium_pct: r2(premium_pct) };
}

// ── 4. Path efficiency ──────────────────────────────────────────────────────
// Two sessions can share the same H-L range but very different STRUCTURE:
// a straight trend vs. a two-sided chop. `dir` in `computeSessionMetrics`
// (volForecastScheduler.js) already approximates this from O/H/L/C alone
// (|O-C| / (H-L)); this is the genuinely finer version using the ACTUAL bar
// path, which a 4-point OHLC sample can't distinguish (same range, wildly
// different path length).
//   efficiency = |net displacement| / total path length walked
// 1.0 = straight line to the close; near 0 = pure back-and-forth chop.
export function pathEfficiency(bars, openPrice) {
  if (!Array.isArray(bars) || bars.length < 2 || !(openPrice > 0)) {
    return { path_length: null, net_move: null, efficiency: null };
  }
  const closes = bars.map(b => parseFloat(b?.mid?.c)).filter(Number.isFinite);
  if (closes.length < 2) return { path_length: null, net_move: null, efficiency: null };

  let pathLength = Math.abs(closes[0] - openPrice);
  for (let i = 1; i < closes.length; i++) pathLength += Math.abs(closes[i] - closes[i - 1]);

  const netMove   = Math.abs(closes.at(-1) - openPrice);
  const efficiency = pathLength > 0 ? netMove / pathLength : null;

  const r4 = x => Math.round(x * 10000) / 10000;
  return {
    path_length: r4(pathLength / openPrice * 100),   // as % of open, comparable to hl/oc fields
    net_move:    r4(netMove    / openPrice * 100),
    efficiency:  efficiency == null ? null : r4(efficiency),
  };
}

// ── 5. Theoretical touch probability (reflection principle) ────────────────
// P(a driftless Brownian motion with daily vol `sigmaPct` touches a level
// `remainingPct` away at some point in the remaining time `remainingFrac` of
// the session) = 2 * (1 - Φ(remainingPct / (sigmaPct * sqrt(remainingFrac)))).
// This is CLOSED-FORM MATH, not a fitted/backtested claim — the harness in
// `volatilityExhaustion/README.md` already validated this scaling is
// approximately right (median max-travel 1.01σ vs. Feller HL median 1.572σ),
// but treat this as a theoretical reference line, not a proven edge, until a
// tier-style study checks it against realised touch rates.
function stdNormalCdf(z) {
  // Abramowitz-Stegun 7.1.26 approximation, good to ~1e-7 — no external dep.
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

export function touchProbability(remainingPct, sigmaPct, remainingFrac) {
  if (!(sigmaPct > 0) || !(remainingFrac > 0)) return null;
  if (remainingPct <= 0) return 1;   // already touched/through it
  const z = remainingPct / (sigmaPct * Math.sqrt(remainingFrac));
  const p = 2 * (1 - stdNormalCdf(z));
  return Math.round(Math.min(1, Math.max(0, p)) * 1000) / 1000;
}

// ── 6. Cost ratio (spread as a fraction of the daily budget) ───────────────
// Pure diff — caller supplies spreadPct (already computed elsewhere, e.g.
// `/api/spreads`) and the daily σ in the same %-of-price units as hl_median.
export function costRatio(spreadPct, sigmaPct) {
  if (!(spreadPct >= 0) || !(sigmaPct > 0)) return null;
  return Math.round((spreadPct / sigmaPct) * 10000) / 10000;
}

// ── 7. Median / P75 first-passage TIME (the inverse of touchProbability) ───
// touchProbability asks "what's P(touch) by a given time" — this asks the
// dual question, "how long, typically, UNTIL touch". For a DRIFTLESS
// Brownian motion the first-passage time has NO finite mean (a known,
// slightly counterintuitive fact — the distribution's tail is too fat), but
// the MEDIAN and other quantiles are perfectly well-defined, so that's what
// this returns, not a mean.
//   P(touch by time-fraction t) = 2*(1-Φ(a/(σ√t)))  [same formula as
//   touchProbability]. Setting that to a target probability p and solving
//   for t gives t = (a / (σ·Φ⁻¹(1 - p/2)))². Below, p=0.5 → Φ⁻¹(0.75); p=0.75
//   → Φ⁻¹(0.625) — both are fixed constants, so no general inverse-CDF
//   solver is needed (matches the no-external-dep style of stdNormalCdf).
// Use: compare the elapsed time-fraction of the session against medianFrac —
// if price hasn't reached a level by the time half of all driftless paths
// would have, the thesis is stale on schedule grounds, independent of P&L
// (the "time stop" idea). Reference line only, same caveat as touchProbability.
const Z_MEDIAN_TOUCH = 0.6744897501960817;   // Φ⁻¹(0.75)
const Z_P75_TOUCH     = 0.31863936396437514; // Φ⁻¹(0.625)

export function medianTimeToTouch(remainingPct, sigmaPct) {
  if (!(sigmaPct > 0) || !(remainingPct > 0)) return { medianFrac: null, p75Frac: null };
  const r3 = x => Math.round(x * 1000) / 1000;
  return {
    medianFrac: r3(Math.pow(remainingPct / (sigmaPct * Z_MEDIAN_TOUCH), 2)),
    p75Frac:    r3(Math.pow(remainingPct / (sigmaPct * Z_P75_TOUCH), 2)),
  };
}

// ── 8. Range efficiency (close-to-close vol vs range-based vol) ────────────
// Parkinson (range-based) vol only sees each day's OWN high-low — it never
// sees the gap BETWEEN one day's close and the next day's open. Close-to-
// close vol sees exactly that gap. So the two estimators diverge in a
// specific, mechanical way:
//   ratio = close-to-close σ / Parkinson σ
//   ratio > 1 → day-to-day moves are happening AT THE GAP, not contained
//               within any single session's observed range ("trending" in
//               the loose sense that the move isn't given back intraday)
//   ratio < 1 → big intraday ranges, but closes keep reverting near the
//               prior close — choppy/mean-reverting, little net progress
//   ~1        → neutral, the two estimators roughly agree
// NOTE: a razor-smooth CONSTANT daily return (a perfect ramp) has ZERO
// close-to-close variance by definition — dispersion needs varying return
// SIZE day to day, not just a persistent direction. See the test file for
// a worked, previously-wrong synthetic case and why it was wrong.
// Parkinson: σ² = mean[(ln(H/L))²] / (4·ln2) — the standard range estimator,
// independent of the Yang-Zhang σ the forecaster uses elsewhere (deliberately
// NOT reusing YZ here — YZ already blends overnight+range+CC, which would
// make this ratio circular against itself).
export function rangeEfficiencyRatio(ohlc, lookback = 20) {
  const bad = { ccVol: null, rangeVol: null, ratio: null, label: 'insufficient_data' };
  const n = ohlc?.length ?? 0;
  if (n < lookback + 1) return bad;

  const closes = ohlc.slice(-(lookback + 1)).map(b => b.close);
  const ccReturns = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) ccReturns.push(Math.log(closes[i] / closes[i - 1]));
  }
  if (ccReturns.length < 5) return bad;
  const ccMean = ccReturns.reduce((a, b) => a + b, 0) / ccReturns.length;
  const ccVar  = ccReturns.reduce((a, b) => a + (b - ccMean) ** 2, 0) / (ccReturns.length - 1);
  const ccVol  = Math.sqrt(ccVar);

  const window  = ohlc.slice(-lookback);
  const pkTerms = window
    .filter(b => b.high > 0 && b.low > 0 && b.high >= b.low)
    .map(b => Math.log(b.high / b.low) ** 2);
  if (pkTerms.length < 5) return bad;
  const rangeVol = Math.sqrt(pkTerms.reduce((a, b) => a + b, 0) / pkTerms.length / (4 * Math.LN2));

  const ratio = rangeVol > 0 ? ccVol / rangeVol : null;
  // ±15% band, deliberately the same margin termStructureState uses to
  // separate signal from day-to-day noise — a judgment call, not a fitted
  // threshold; revisit if a calibration study finds a sharper cut.
  let label = 'neutral';
  if (ratio != null) {
    if (ratio > 1.15) label = 'trending';
    else if (ratio < 0.85) label = 'choppy';
  }
  const r3 = x => x == null ? null : Math.round(x * 1000) / 1000;
  return { ccVol: r3(ccVol), rangeVol: r3(rangeVol), ratio: r3(ratio), label };
}

// ── 9. Realised skew (downside σ vs upside σ) ───────────────────────────────
// A symmetric cone is wrong for a pair that falls faster than it rises (JPY
// crosses, AUD) or vice versa. Splits daily log-returns by sign and measures
// each side's RMS magnitude around zero (semi-deviation, not each side's own
// mean — deliberate: this asks "how big are down days vs up days", the same
// framing `sortinoRatio` in metricsCore.js uses for downside deviation).
export function realisedSkew(ohlc, lookback = 60) {
  const bad = { downVol: null, upVol: null, ratio: null, label: 'insufficient_data' };
  const n = ohlc?.length ?? 0;
  if (n < lookback + 1) return bad;

  const closes = ohlc.slice(-(lookback + 1)).map(b => b.close);
  const rets = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  const downs = rets.filter(r => r < 0);
  const ups   = rets.filter(r => r > 0);
  if (downs.length < 5 || ups.length < 5) return bad;

  const rms = arr => Math.sqrt(arr.reduce((a, b) => a + b * b, 0) / arr.length);
  const downVol = rms(downs);
  const upVol   = rms(ups);
  const ratio   = upVol > 0 ? downVol / upVol : null;

  let label = 'symmetric';
  if (ratio != null) {
    if      (ratio > 1.15)        label = 'downside-heavy';   // falls faster than it rises
    else if (ratio < 1 / 1.15)    label = 'upside-heavy';     // symmetric band in log-ratio terms
  }
  const r3 = x => x == null ? null : Math.round(x * 1000) / 1000;
  return { downVol: r3(downVol), upVol: r3(upVol), ratio: r3(ratio), label };
}

// ── 10. Amihud-style illiquidity (range consumed per unit of tick volume) ──
// "Range per unit of participation" — a thin, low-volume session producing a
// big range is a different market than a heavy-volume session producing the
// same range. OANDA candles already carry a `volume` field (tick count, not
// real traded volume — same caveat `tier5_liquidity.py` documents: magnitude
// only, no direction). Only meaningful RELATIVELY (this pair today vs its
// own recent history, or vs other pairs right now) — the raw number has no
// absolute meaning since tick-count scale varies per instrument/session.
export function amihudIlliquidity(bars, rangePct) {
  if (!Array.isArray(bars) || bars.length === 0 || !(rangePct >= 0)) {
    return { totalVolume: null, illiquidity: null };
  }
  const totalVolume = bars.reduce((sum, b) => sum + (Number(b?.volume) || 0), 0);
  if (totalVolume <= 0) return { totalVolume: 0, illiquidity: null };
  return {
    totalVolume,
    illiquidity: Math.round((rangePct / totalVolume) * 1e6) / 1e6,
  };
}
