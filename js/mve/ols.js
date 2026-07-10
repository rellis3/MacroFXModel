// mve/ols.js — multi-factor Ordinary Least Squares with an honest prediction
// interval. This is the workhorse behind every regression fair-value emitter:
// generalises the single-driver rolling regression in js/compass.js
// (compassDivergence) to an arbitrary factor matrix (BEER-lite: real-rate diff,
// DXY, curve, …). Pure — feed it aligned arrays, get back β, residual σ, and a
// predictSigma that folds in β-estimation error.
//
//   y ≈ Xβ ,  X rows already include a leading 1 for the intercept (or use fit()
//   which prepends it for you).

import { transpose, matMul, matVec, inv, dot, quad } from './linalg.js';

// Fit y (length n) on factor rows F (n × k, NO intercept — added here).
// Returns { beta, intercept, sigma, XtXinv, r2, n, k, resid }.
export function olsFit(F, y) {
  const n = y.length;
  if (!n || F.length !== n) return null;
  const k = F[0].length;
  const X = F.map(row => [1, ...row]);          // prepend intercept column
  const Xt = transpose(X);
  const XtX = matMul(Xt, X);
  const XtXinv = inv(XtX);
  if (!XtXinv) return null;                       // collinear / singular
  const Xty = matVec(Xt, y);
  const b = matVec(XtXinv, Xty);                  // [intercept, β1..βk]
  const yhat = X.map(row => dot(row, b));
  const resid = y.map((v, i) => v - yhat[i]);
  const dof = Math.max(1, n - (k + 1));
  const rss = resid.reduce((s, e) => s + e * e, 0);
  const sigma = Math.sqrt(rss / dof);             // residual std (in-sample fit)
  const ym = y.reduce((s, v) => s + v, 0) / n;
  const tss = y.reduce((s, v) => s + (v - ym) ** 2, 0) || 1e-12;
  const r2 = 1 - rss / tss;
  return { beta: b.slice(1), intercept: b[0], coef: b, sigma, XtXinv, r2, n, k, resid };
}

// Point prediction for a new factor row x (length k, NO intercept).
export function olsPredict(fit, x) {
  return dot([1, ...x], fit.coef);
}

// Prediction std at x that ACCOUNTS FOR PARAMETER UNCERTAINTY:
//   σ_pred = σ · sqrt(1 + xᵀ(XᵀX)⁻¹x)
// This is the Phase-2 refinement — the honest band is wider than the raw
// residual σ because the fair value α+β'x is itself estimated. Use THIS σ as the
// mispricing denominator, not fit.sigma.
export function predictSigma(fit, x) {
  const xi = [1, ...x];
  const lev = quad(xi, fit.XtXinv);               // leverage term
  return fit.sigma * Math.sqrt(1 + Math.max(0, lev));
}

// Convenience: fit on the trailing `window` rows and predict the latest row.
// aligned = { y:[...], F:[[...],...] } newest-last. Returns an estimate-shaped
// partial { fairValue, sigma, r2, beta, n } or null.
export function rollingFitLatest(aligned, window) {
  const { y, F } = aligned;
  const n = y.length;
  if (n < 8) return null;
  const w = Math.min(window || n, n);
  const yTr = y.slice(n - w, n - 0);
  const FTr = F.slice(n - w, n - 0);
  const fit = olsFit(FTr.slice(0, w - 0), yTr);   // include latest in-fit for level
  if (!fit) return null;
  const xLatest = F[n - 1];
  const fairValue = olsPredict(fit, xLatest);
  const sigma = predictSigma(fit, xLatest);
  return { fairValue, sigma, r2: fit.r2, beta: fit.beta, intercept: fit.intercept, n: w, fit };
}
