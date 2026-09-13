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
 *     `volAcceleration`/`termStructureState` onto its existing return, same
 *     pattern already used for the `ladder` fields.
 *   - `js/volForecastScheduler.js` `getSessionStatus()` — Object.assign's
 *     `pathEfficiency`/`touchProbability` onto `computeSessionMetrics()`'s
 *     return at the call site (function body untouched).
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
