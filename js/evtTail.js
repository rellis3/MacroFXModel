/**
 * Extreme Value Theory — Peaks-Over-Threshold tail fit. Pure math, no DOM/
 * network: give it a return series, get back a fitted Generalized Pareto
 * Distribution for the LOSS tail (left tail of returns), plus the empirical
 * exceedance points to plot the fit against.
 *
 * Why POT/GPD, not a normal/parametric VaR: the whole point is to say
 * something about losses WORSE than any observed so far (VaR99.5/99.9 when
 * you might only have ~1,000 days of data) — the empirical historical VaR
 * literally cannot answer that (your worst day IS your empirical ceiling).
 * The Pickands–Balkema–de Haan theorem is the reason a GPD is the right
 * shape to extrapolate with: for a wide class of underlying distributions,
 * exceedances over a high-enough threshold converge to a GPD regardless of
 * what the BULK of the distribution looks like — the threshold choice below
 * is exactly "high enough that this convergence has kicked in, low enough
 * that there's still a usable sample of exceedances."
 *
 * Estimator: probability-weighted moments (Hosking & Wallis 1987), not MLE —
 * closed-form, numerically stable on the small-to-moderate exceedance counts
 * a single strategy's daily-return tail actually has (tens to low hundreds),
 * where iterative MLE can be fragile. Sign convention: this module works in
 * LOSS units throughout (a bigger positive number = a worse day) — callers
 * pass `daily` returns (%, positive = gain) and everything here negates
 * internally, so a caller never has to reason about the sign flip.
 */

// Probability-weighted-moments GPD fit on exceedances y_i = loss_i - threshold
// (all y_i > 0 by construction). Returns { shape, scale } for
//   P(Y > y) = (1 + shape*y/scale)^(-1/shape)   (shape ≈ 0 → exp(-y/scale))
// shape > 0: unbounded/fat tail. shape ≈ 0: exponential decay. shape < 0:
// bounded tail — there's a hard ceiling at threshold + scale/|shape| beyond
// which the fitted model assigns zero probability.
export function fitGPD(exceedances) {
  const y = [...exceedances].sort((a, b) => a - b);
  const n = y.length;
  if (n < 8) return null; // too few exceedances for a PWM fit to mean anything
  const b0 = y.reduce((s, v) => s + v, 0) / n;
  let b1 = 0;
  for (let i = 1; i <= n; i++) b1 += ((n - i) / (n - 1)) * y[i - 1];
  b1 /= n;
  const denom = b0 - 2 * b1;
  if (Math.abs(denom) < 1e-12) return null;
  const shape = 2 - b0 / denom;
  const scale = (2 * b0 * b1) / denom;
  if (!(scale > 0) || !Number.isFinite(shape)) return null;
  return { shape: +shape.toFixed(4), scale: +scale.toFixed(6), n };
}

// Fitted survival probability P(Y > y) for y ≥ 0 exceedance magnitude, given
// a fitted {shape, scale}. shape < 0 has a hard ceiling at scale/|shape| —
// returns 0 beyond it (the model's actual claim: impossible, not just rare).
export function gpdSurvival(y, { shape, scale }) {
  if (y < 0) return 1;
  if (Math.abs(shape) < 1e-6) return Math.exp(-y / scale);
  const base = 1 + (shape * y) / scale;
  if (base <= 0) return 0; // beyond the bounded tail's ceiling
  return Math.pow(base, -1 / shape);
}

// POT VaR/CVaR at confidence p (e.g. 0.995) via the standard McNeil–Frey
// formula, using the EMPIRICAL exceedance rate (nExceed/n) to anchor the
// fitted tail to the real threshold-crossing frequency. CVaR requires
// shape < 1 for a finite mean beyond VaR; returns null otherwise (an
// honest "the fit says this tail has no finite expectation," not a
// silently wrong number).
export function potVarCvar(p, { threshold, shape, scale, nExceed, n }) {
  const freq = nExceed / n;
  // q = (1-p)/freq, NOT freq*(1-p) — the model says
  // P(X>u)·P(X>x|X>u) = 1-p, i.e. freq·survival(y) = 1-p, so
  // survival(y) = (1-p)/freq is what the GPD quantile is solved against.
  const q = (1 - p) / freq;
  let varLoss;
  if (Math.abs(shape) < 1e-6) {
    varLoss = threshold + scale * Math.log(1 / q);
  } else {
    varLoss = threshold + (scale / shape) * (Math.pow(q, -shape) - 1);
  }
  let cvarLoss = null;
  if (shape < 1) {
    cvarLoss = (varLoss + scale - shape * threshold) / (1 - shape);
  }
  return { var: varLoss, cvar: cvarLoss };
}

/**
 * Full pipeline: daily % returns in, a plottable/reportable tail model out.
 *
 *   fitTailModel(dailyReturns, { thresholdPctile: 0.90, probeLevels: [0.95,0.99,0.995,0.999] })
 *     -> { ok, threshold, nExceed, n, shape, scale,
 *          empiricalPoints: [{ lossPct, survival }],   // for plotting dots
 *          fittedCurve:     [{ lossPct, survival }],   // for plotting the line
 *          probes: [{ p, varLossPct, cvarLossPct, varReturnPct, cvarReturnPct, empirical: bool }] }
 *     -> { ok: false, reason } if there isn't enough tail data to fit
 *
 * `empirical: true` on a probe means p fell BELOW the threshold's own
 * empirical quantile — that probe is really just the empirical VaR read off
 * the raw data, included so the comparison table has a like-for-like row;
 * `empirical: false` means it's a genuine extrapolation past anything observed.
 */
export function fitTailModel(dailyReturns, { thresholdPctile = 0.90, probeLevels = [0.95, 0.99, 0.995, 0.999] } = {}) {
  const losses = dailyReturns.map(r => -r).sort((a, b) => a - b); // ascending loss magnitude
  const n = losses.length;
  if (n < 30) return { ok: false, reason: 'not enough days to fit a tail (need 30+)' };

  const thIdx = Math.min(n - 1, Math.floor(thresholdPctile * n));
  const threshold = losses[thIdx];
  const exceedances = losses.filter(l => l > threshold).map(l => l - threshold);
  const nExceed = exceedances.length;
  const fit = fitGPD(exceedances);
  if (!fit) return { ok: false, reason: `only ${nExceed} exceedances above the ${(thresholdPctile * 100).toFixed(0)}th percentile — too few to fit` };
  const { shape, scale } = fit;

  // Empirical points: each exceedance's own rank-based survival probability
  // (i-th largest of nExceed has empirical P(Y>y) ≈ i/nExceed), scaled to an
  // unconditional P(loss > threshold+y) via the threshold's own crossing rate.
  const sortedExc = [...exceedances].sort((a, b) => a - b);
  const freq = nExceed / n;
  const empiricalPoints = sortedExc.map((y, i) => {
    const rank = nExceed - i; // i ascending -> rank descending (1 = largest)
    return { lossPct: +(threshold + y).toFixed(4), survival: +(freq * (rank / nExceed)).toFixed(6) };
  });

  // Fitted curve: sampled smoothly from the threshold out to a bit past the
  // largest observed exceedance, so the chart shows both the fitted region
  // AND a short honest extrapolation past the worst day actually seen.
  const maxY = sortedExc[sortedExc.length - 1];
  const curveSpan = maxY * 1.6;
  const STEPS = 60;
  const fittedCurve = [];
  for (let i = 0; i <= STEPS; i++) {
    const y = (curveSpan * i) / STEPS;
    const surv = gpdSurvival(y, { shape, scale });
    fittedCurve.push({ lossPct: +(threshold + y).toFixed(4), survival: +(freq * surv).toFixed(6) });
  }

  const probes = probeLevels.map(p => {
    if (p < 1 - freq) {
      // Below the threshold's own crossing rate — a plain empirical quantile
      // read (no extrapolation needed or trustworthy at this depth).
      const idx = Math.min(n - 1, Math.floor(p * n));
      const lossPct = losses[idx];
      const tailBeyond = losses.filter(l => l >= lossPct);
      const cvarLossPct = tailBeyond.length ? tailBeyond.reduce((s, v) => s + v, 0) / tailBeyond.length : lossPct;
      return { p, varLossPct: +lossPct.toFixed(3), cvarLossPct: +cvarLossPct.toFixed(3), empirical: true };
    }
    const { var: v, cvar: c } = potVarCvar(p, { threshold, shape, scale, nExceed, n });
    return { p, varLossPct: +v.toFixed(3), cvarLossPct: c != null ? +c.toFixed(3) : null, empirical: false };
  });

  return { ok: true, threshold: +threshold.toFixed(4), nExceed, n, shape, scale, freq: +freq.toFixed(4), empiricalPoints, fittedCurve, probes };
}
