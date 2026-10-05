/**
 * Reverting weekly / monthly ladder — the HORIZON-REVERSION arm that passed its
 * pre-registration (forge/HORIZON_REVERSION_PREREG.md, 2026-10-05).
 *
 * The incumbent multi-day ladder scales today's σ by √h, as if today's vol lasts the
 * whole week. Volatility mean-reverts (Forecaster Portfolio Lesson 03 §02, half-life),
 * so this one lets σ drift back to its own long-run level across the horizon:
 *
 *   σ_h² = Σ_{k<h} [ V̄ + φ^k (σ_t² − V̄) ],   φ = 0.5^(1/HL),
 *   V̄    = mean of the forecast-ready daily σ² over the last 250 bars.
 *
 * After a vol spike the bands come in; after a quiet spell they widen. Widths are its
 * OWN fit (js/forecastLadderRevertingParams.js) — never the √h ladder's widths, which
 * were fitted against a different σ and would mis-scale every rung.
 *
 * Additive and research-grade: nothing else reads these fields; the incumbent
 * ladder_weekly / ladder_monthly are untouched.
 */
import { SIGMA_ESTIMATORS } from './forecastSigma.js';
import { eventMultiplier, paramsFor, RUNGS } from './forecastLadder.js';
import { REVERTING_PARAMS } from './forecastLadderRevertingParams.js';

const SQRT252 = Math.sqrt(252);
const SPAN = { weekly: 5, monthly: 20 };
const _r2 = x => Math.round(x * 100) / 100;

/** σ_h (daily fraction) from σ_t, V̄ (daily variance, fraction²), span and half-life. HL=Infinity → σ_t·√h. */
export function revertingHorizonSigma(sigmaT, vbar, span, halfLife) {
  if (!(sigmaT > 0) || !(span > 0)) return null;
  if (!Number.isFinite(halfLife) || !(vbar > 0)) return sigmaT * Math.sqrt(span);
  const phi = Math.pow(0.5, 1 / halfLife);
  let geo = 0;
  for (let k = 0; k < span; k++) geo += Math.pow(phi, k);
  const tot = span * vbar + (sigmaT * sigmaT - vbar) * geo;
  return Math.sqrt(Math.max(tot, 1e-18));
}

/**
 * σ_t (daily fraction, forecast for the next bar) and V̄ from one estimator series, the
 * same convention as forge: the estimator's as-of-close value at bar i is the forecast
 * for bar i+1, and V̄ averages the last `window` of those (min half a window).
 */
export function sigmaAndVbar(bars, estimator, window = REVERTING_PARAMS.vbar_window) {
  const fn = SIGMA_ESTIMATORS[estimator];
  if (!fn || !Array.isArray(bars) || bars.length < 2) return null;
  const s = fn(bars).map(v => (Number.isFinite(v) ? v / 100 / SQRT252 : NaN));
  const sigmaT = s[s.length - 1];
  const tail = s.slice(-window).filter(Number.isFinite);
  if (!(sigmaT > 0) || tail.length < window / 2) return null;
  const vbar = tail.reduce((a, x) => a + x * x, 0) / tail.length;
  return { sigmaT, vbar };
}

/**
 * Build one reverting ladder ('weekly' | 'monthly'), same object shape as
 * buildLadder() so the export formatter reads it unchanged. Null when the
 * instrument has no fitted reverting widths or too little history.
 */
export function buildRevertingLadder(bars, { instrument = '', assetClass = 'fx', eventTag = null,
                                             horizon = 'weekly', params = REVERTING_PARAMS } = {}) {
  const span = SPAN[horizon];
  const p = params.pairs?.[String(instrument).toUpperCase()];
  const width = p?.[horizon]?.width;
  if (!span || !width) return null;
  const sv = sigmaAndVbar(bars, p.estimator, params.vbar_window);
  if (!sv) return null;
  const hl = params.half_life_days?.[horizon];
  const sh = revertingHorizonSigma(sv.sigmaT, sv.vbar, span, hl);
  // Same event convention as the incumbent multi-day ladder (the day's multiplier),
  // so the only difference between the two exports is σ_h and its fitted widths.
  const evMult = eventMultiplier(paramsFor(instrument, assetClass), eventTag);
  const sPct = sh * evMult * 100;
  const out = {
    sigma_daily_pct: _r2(sv.sigmaT * 100),
    sigma_longrun_pct: _r2(Math.sqrt(sv.vbar) * 100),
    sigma_used_pct: _r2(sPct),
    sigma_sqrt_h_pct: _r2(sv.sigmaT * Math.sqrt(span) * 100),   // what the √h ladder would use — for comparison
    vol_annual: _r2(sv.sigmaT * SQRT252 * 100),
    event_tag: eventTag ?? null,
    event_mult: Math.round(evMult * 1000) / 1000,
    horizon,
    half_life_days: hl,
    params_source: 'fitted-reverting',
    width_source: `fitted-${horizon}-reverting`,
    estimator: p.estimator,
  };
  for (const q of ['hl', 'oc', 'oh', 'ol']) {
    if (!Array.isArray(width[q])) continue;
    out[q] = {};
    RUNGS.forEach((rung, i) => { if (Number.isFinite(width[q][i])) out[q][rung] = _r2(width[q][i] * sPct); });
  }
  return out;
}
