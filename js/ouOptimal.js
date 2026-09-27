/**
 * Ornstein–Uhlenbeck optimal mean-reversion bands (Tier 1, pure).
 * Leung & Li (2015), "Optimal Mean Reversion Trading with Transaction Costs and
 * Stop-Loss Exit" — the method behind QuantConnect's "Optimal Pairs Trading"
 * (education/quantconnect_strategies.md §4.12). Replaces ad-hoc ±kσ entry/exit
 * thresholds with levels derived from the fitted OU parameters, the round-trip
 * cost `c` and a discount rate `r`.
 *
 * Model: dX = μ(θ − X)dt + σ dW   (μ = speed, θ = mean, σ = vol).
 *   F(x) = ∫₀^∞ u^{r/μ−1} exp(√(2μ/σ²)(x−θ)u − u²/2) du
 *   G(x) = ∫₀^∞ u^{r/μ−1} exp(√(2μ/σ²)(θ−x)u − u²/2) du
 *   exit  b*: F(b) = (b − c)F′(b)
 *   V(x)  = (b*−c)F(x)/F(b*) for x < b*, else x − c
 *   entry d*: G(d)(V′(d) − 1) = G′(d)(V(d) − d − c),  d* < b*
 * Enter long X at X ≤ d*, exit at X ≥ b*.
 *
 * Derivatives are analytic (F′ = k·∫u^{r/μ}…), not finite differences.
 */

// ── MLE (closed form, exact discretisation) ──────────────────────────────────
// x: equally spaced observations, dt in years. Returns { theta, mu, sigma, ll }
// where ll is the AVERAGE log-likelihood (Leung–Li eq. 2.2). mu ≤ 0 ⇒ not mean
// reverting over this window (returned with ll = −Infinity).
export function ouMle(x, dt = 1 / 252) {
  const n = x.length - 1;
  if (n < 10) return { theta: NaN, mu: NaN, sigma: NaN, ll: -Infinity };
  let Sx = 0, Sy = 0, Sxx = 0, Syy = 0, Sxy = 0;
  for (let i = 1; i <= n; i++) {
    const a = x[i - 1], b = x[i];
    Sx += a; Sy += b; Sxx += a * a; Syy += b * b; Sxy += a * b;
  }
  const den = n * (Sxx - Sxy) - (Sx * Sx - Sx * Sy);
  if (!(Math.abs(den) > 0)) return { theta: NaN, mu: NaN, sigma: NaN, ll: -Infinity };
  const theta = (Sy * Sxx - Sx * Sxy) / den;
  const ratio = (Sxy - theta * Sx - theta * Sy + n * theta * theta) / (Sxx - 2 * theta * Sx + n * theta * theta);
  if (!(ratio > 0 && ratio < 1)) return { theta, mu: NaN, sigma: NaN, ll: -Infinity };
  const mu = -Math.log(ratio) / dt;
  const a = Math.exp(-mu * dt);
  const s2 = (2 * mu / (n * (1 - a * a))) * (Syy - 2 * a * Sxy + a * a * Sxx
    - 2 * theta * (1 - a) * (Sy - a * Sx) + n * theta * theta * (1 - a) * (1 - a));
  if (!(s2 > 0)) return { theta, mu, sigma: NaN, ll: -Infinity };
  const st2 = s2 * (1 - Math.exp(-2 * mu * dt)) / (2 * mu);
  let ss = 0;
  for (let i = 1; i <= n; i++) { const e = x[i] - x[i - 1] * a - theta * (1 - a); ss += e * e; }
  const ll = -0.5 * Math.log(2 * Math.PI) - 0.5 * Math.log(st2) - ss / (2 * n * st2);
  return { theta, mu, sigma: Math.sqrt(s2), ll };
}

// Portfolio of $1 of A minus $β of B, both normalised to the window start.
export function spreadSeries(a, b, beta) {
  return a.map((v, i) => v / a[0] - beta * b[i] / b[0]);
}

// Leung–Li β search: the β maximising the OU average log-likelihood.
export function bestBeta(a, b, { lo = 0.05, hi = 2.0, step = 0.01, dt = 1 / 252 } = {}) {
  let best = null;
  for (let beta = lo; beta <= hi + 1e-12; beta += step) {
    const fit = ouMle(spreadSeries(a, b, beta), dt);
    if (fit.mu > 0 && Number.isFinite(fit.ll) && (!best || fit.ll > best.ll)) best = { beta: +beta.toFixed(6), ...fit };
  }
  return best;
}

// ── Numerics ─────────────────────────────────────────────────────────────────
function simpson(f, a, b, tol = 1e-10, depth = 40) {
  const c = (a + b) / 2, fa = f(a), fb = f(b), fc = f(c);
  const whole = (b - a) / 6 * (fa + 4 * fc + fb);
  const rec = (a, b, fa, fb, fc, whole, depth) => {
    const c = (a + b) / 2, d = (a + c) / 2, e = (c + b) / 2, fd = f(d), fe = f(e);
    const left = (c - a) / 6 * (fa + 4 * fd + fc), right = (b - c) / 6 * (fc + 4 * fe + fb);
    if (depth <= 0 || Math.abs(left + right - whole) <= 15 * tol) return left + right + (left + right - whole) / 15;
    return rec(a, c, fa, fc, fd, left, depth - 1) + rec(c, b, fc, fb, fe, right, depth - 1);
  };
  return rec(a, b, fa, fb, fc, whole, depth);
}

// I(p, s) = ∫₀^∞ u^p exp(s·u − u²/2) du, p > −1. The u→0 singularity (p < 0)
// is handled by subtracting the u^p·1 term on [0,1] and adding it analytically.
export function ouIntegral(p, s) {
  const f = u => Math.exp(s * u - u * u / 2);
  const near = simpson(u => (u === 0 ? 0 : Math.pow(u, p) * (f(u) - 1)), 0, 1, 1e-10) + 1 / (p + 1);
  const upper = Math.max(1, s) + 12;
  const far = simpson(u => Math.pow(u, p) * f(u), 1, upper, 1e-10);
  return near + far;
}

function brent(fn, a, b, tol = 1e-10, maxIter = 200) {
  let fa = fn(a), fb = fn(b);
  if (!(fa * fb <= 0)) return NaN;
  for (let k = 0; k < maxIter; k++) {
    const m = (a + b) / 2, fm = fn(m);
    if (Math.abs(b - a) < tol || fm === 0) return m;
    if (fa * fm <= 0) { b = m; fb = fm; } else { a = m; fa = fm; }
  }
  return (a + b) / 2;
}

// Scan [lo, hi] for sign changes of fn and return every bracketed root.
function roots(fn, lo, hi, steps = 60) {
  const out = [];
  let x0 = lo, f0 = fn(lo);
  for (let k = 1; k <= steps; k++) {
    const x1 = lo + (hi - lo) * k / steps, f1 = fn(x1);
    if (Number.isFinite(f0) && Number.isFinite(f1) && f0 * f1 <= 0) out.push(brent(fn, x0, x1));
    x0 = x1; f0 = f1;
  }
  return out.filter(Number.isFinite);
}

// ── Optimal levels ───────────────────────────────────────────────────────────
// Returns { entry: d*, exit: b*, stationarySd } or null when no valid pair of
// levels exists (e.g. cost too large relative to the stationary spread).
export function ouOptimalLevels({ theta, mu, sigma }, { c = 0.001, r = 0.05 } = {}) {
  if (!(mu > 0 && sigma > 0 && Number.isFinite(theta))) return null;
  const k = Math.sqrt(2 * mu / (sigma * sigma)), a = r / mu;
  const sd = sigma / Math.sqrt(2 * mu);
  const F = x => ouIntegral(a - 1, k * (x - theta));
  const dF = x => k * ouIntegral(a, k * (x - theta));
  const G = x => ouIntegral(a - 1, k * (theta - x));
  const dG = x => -k * ouIntegral(a, k * (theta - x));
  // Work in units scaled so the integrals stay in range: search within θ ± 6 sd.
  const bRoots = roots(x => F(x) - (x - c) * dF(x), theta - 6 * sd, theta + 6 * sd + c);
  if (!bRoots.length) return null;
  const b = bRoots[bRoots.length - 1];
  const Fb = F(b);
  const V = x => (x < b ? (b - c) * F(x) / Fb : x - c);
  const dV = x => (x < b ? (b - c) * dF(x) / Fb : 1);
  const dRoots = roots(x => G(x) * (dV(x) - 1) - dG(x) * (V(x) - x - c), theta - 6 * sd, b - 1e-9);
  if (!dRoots.length) return null;
  const d = dRoots.reduce((best, x) => (Math.abs(x - theta) < Math.abs(best - theta) ? x : best), dRoots[0]);
  if (!(d < b)) return null;
  return { entry: d, exit: b, stationarySd: sd };
}
