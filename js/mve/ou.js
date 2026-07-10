// mve/ou.js — Phase 2. The convergence engine. Fits an Ornstein-Uhlenbeck
// (mean-reverting) process to a deviation series and turns "price is cheap" into
// a distribution: probability of reversion, expected magnitude, expected time
// (half-life) and a confidence interval — all closed-form (see
// MARKET_VALUATION_ENGINE.md Part 6). This is the macro-fair-value cousin of the
// pair-spread OU in js/hedgeSignalV2Engine.js; pure and re-pointable.
//
// Discrete OU:  Δz_t = a + b·z_{t-1} + ε ,  κ = −b (speed), half-life = ln2/κ.

import { mean, stdev } from '../statsCore.js';

// Standard normal CDF (Abramowitz-Stegun 7.1.26 via erf).
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-x * x / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

// Fit OU to a deviation/residual series (should be roughly zero-mean & stationary).
// Returns { kappa, mu, sigma, halfLife, tStat, ok, n }. ok=false if not reverting.
export function ouFit(series) {
  if (!series || series.length < 20) return null;
  const z = series.slice();
  const y = [], x = [];
  for (let i = 1; i < z.length; i++) { y.push(z[i] - z[i - 1]); x.push(z[i - 1]); }
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < x.length; i++) { const dx = x[i] - mx; sxy += dx * (y[i] - my); sxx += dx * dx; }
  if (sxx <= 0) return null;
  const b = sxy / sxx;                       // slope of Δz on z_{t-1}
  const a = my - b * mx;
  const kappa = -b;                          // reversion speed (per bar)
  const resid = y.map((v, i) => v - (a + b * x[i]));
  const sigma = stdev(resid, 2) || 1e-9;     // diffusion (per bar)
  // t-stat on b (H0: b=0, i.e. random walk). More negative b ⇒ stronger reversion.
  const seB = sigma / Math.sqrt(sxx);
  const tStat = b / (seB || 1e-12);
  const mu = kappa !== 0 ? -a / b : mean(z);  // long-run mean = a/κ ... = -a/b
  const halfLife = kappa > 0 ? Math.log(2) / kappa : Infinity;
  return { kappa, mu, sigma, halfLife, tStat, ok: kappa > 0 && Number.isFinite(halfLife), n: x.length };
}

// Convergence distribution for a current deviation z0 over `horizon` bars.
//   E[z_T]   = μ + (z0−μ)·e^(−κT)
//   Var[z_T] = σ²/(2κ)·(1 − e^(−2κT))
// Returns probability of ending inside ±band (in z units, default 1σ_stationary),
// expected magnitude of gap closed, and 68/95 CIs on the terminal deviation.
export function ouConvergence(z0, ou, horizon = 10, band = null) {
  if (!ou || !ou.ok) return null;
  const { kappa, mu, sigma } = ou;
  const decay = Math.exp(-kappa * horizon);
  const expZ = mu + (z0 - mu) * decay;
  const varZ = (sigma * sigma) / (2 * kappa) * (1 - Math.exp(-2 * kappa * horizon));
  const sd = Math.sqrt(Math.max(0, varZ));
  const stationarySd = sigma / Math.sqrt(2 * kappa);        // long-run σ of the deviation
  const b = band ?? stationarySd;                            // "converged" = inside ±b
  // P(|z_T| < b) under N(expZ, sd)
  const pInside = sd > 0 ? normCdf((b - expZ) / sd) - normCdf((-b - expZ) / sd) : (Math.abs(expZ) < b ? 1 : 0);
  const closedFraction = 1 - decay;                          // expected fraction of gap closed
  const expectedMagnitude = (z0 - mu) * closedFraction;      // expected move toward mean, z units
  return {
    horizon,
    expectedZ: expZ,
    expectedMagnitude,                 // in the SAME units as z0 (σ if z0 is a z-score)
    closedFraction,
    pRevert: pInside,                  // prob of being inside the band by horizon
    halfLife: ou.halfLife,
    ci68: [expZ - 0.9945 * sd, expZ + 0.9945 * sd],
    ci95: [expZ - 1.9600 * sd, expZ + 1.9600 * sd],
    sd, stationarySd,
  };
}

// Empirical snap-back base rate — the benchmark the OU probability must beat.
// Over history, when |z| first exceeded `entry`, how often did it fall back
// inside `band` within `horizon` bars? Model-free counterweight to the OU math.
export function empiricalSnapback(zSeries, { entry = 1.5, band = 0.5, horizon = 10 } = {}) {
  if (!zSeries || zSeries.length < horizon + 5) return null;
  let events = 0, reverts = 0;
  for (let i = 1; i < zSeries.length - horizon; i++) {
    const crossed = Math.abs(zSeries[i]) >= entry && Math.abs(zSeries[i - 1]) < entry;
    if (!crossed) continue;
    events++;
    for (let h = 1; h <= horizon; h++) {
      if (Math.abs(zSeries[i + h]) <= band) { reverts++; break; }
    }
  }
  return { events, baseRate: events ? reverts / events : null, entry, band, horizon };
}

export { normCdf };
