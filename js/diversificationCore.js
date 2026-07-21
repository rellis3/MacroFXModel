/**
 * Diversification Core — portfolio-level "how many bets do I actually have?"
 * metrics. Pure & offline-testable (no network, no DOM); unit-tested in
 * `diversificationCore.test.mjs`.
 *
 * WHY THIS EXISTS: a book of N strategies is not N independent bets if the
 * strategies are correlated. `SYSTEM_ASSESSMENT.md` §2.4 flags exactly this
 * ("diversification may be partly illusory — [the strategies] are, at the factor
 * level, substantially long the same risk-on regime") and punch-list item #6
 * asks for the **effective number of independent bets**. This brick computes it
 * from the same monthly-return correlation matrix `diversification.html` already
 * builds — turning "we might be less diversified than we think" into one number.
 *
 * Three complementary definitions (report them together — they answer slightly
 * different questions):
 *   • effectiveBetsPCA      — inverse participation ratio of the correlation
 *                             eigenvalues, (Σλ)²/Σλ². Rewards spreading variance
 *                             evenly across principal components.
 *   • effectiveBetsEntropy  — Meucci's entropy version, exp(−Σ pᵢ ln pᵢ) with
 *                             pᵢ = λᵢ/Σλ. Same spirit, entropy-weighted.
 *   • effectiveBetsWeighted — allocation-aware, (Σw)²/(wᵀ C w). Answers "given
 *                             MY weights, how many independent bets is this?"
 *
 * Sanity anchors (all verified in the test): N identical strategies (ρ=1) → 1
 * effective bet; N mutually-uncorrelated strategies (ρ=0) → N effective bets.
 *
 * Reuses nothing heavier than arithmetic on purpose — the correlation matrix is
 * passed in (or built here from return columns) so both the page and tests feed
 * it the same way.
 */

// ── Pearson r over finite-aligned pairs ──────────────────────────────────────
// Mirrors the inline `pearson` on diversification.html (NaN entries skipped
// pairwise) so the brick and the page agree bit-for-bit on the matrix.
export function pearson(a, b) {
  const m = Math.min(a.length, b.length);
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < m; i++) {
    const x = a[i], y = b[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
  }
  if (n < 2) return NaN;
  const cov = sxy - (sx * sy) / n;
  const vx = sxx - (sx * sx) / n;
  const vy = syy - (sy * sy) / n;
  const d = Math.sqrt(vx * vy);
  return d > 0 ? cov / d : NaN;
}

// ── Correlation matrix from an array of return columns ───────────────────────
// `cols` : Array<number[]> — one column per strategy, NaN allowed (skipped
// pairwise). Returns an n×n symmetric matrix with 1.0 on the diagonal.
export function correlationMatrix(cols) {
  const n = cols.length;
  const C = Array.from({ length: n }, () => new Array(n).fill(NaN));
  for (let i = 0; i < n; i++) {
    C[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const r = pearson(cols[i], cols[j]);
      C[i][j] = C[j][i] = r;
    }
  }
  return C;
}

// ── Eigenvalues of a symmetric matrix (cyclic Jacobi rotation) ───────────────
// Robust for the small matrices we use (a handful of strategies). Returns
// eigenvalues in descending order. Eigenvalues are rotation-invariant, so the
// exact rotation sign convention doesn't affect the result.
export function symmetricEigenvalues(mat, { maxSweeps = 100, tol = 1e-14 } = {}) {
  const n = mat.length;
  if (n === 0) return [];
  // Work on a copy; bail out to NaN if any entry is non-finite.
  const A = mat.map(row => row.slice());
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (!Number.isFinite(A[i][j])) return new Array(n).fill(NaN);
    }
  }
  const offSq = () => {
    let s = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) s += A[p][q] * A[p][q];
    return s;
  };
  for (let sweep = 0; sweep < maxSweeps && offSq() > tol; sweep++) {
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p][q];
        if (Math.abs(apq) < 1e-300) continue;
        const app = A[p][p], aqq = A[q][q];
        // Angle that zeroes A[p][q] for the 2×2 sub-problem.
        const theta = (aqq - app) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        // Rotate columns p,q then rows p,q (Givens rotation, both sides).
        for (let k = 0; k < n; k++) {
          const akp = A[k][p], akq = A[k][q];
          A[k][p] = c * akp - s * akq;
          A[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k], aqk = A[q][k];
          A[p][k] = c * apk - s * aqk;
          A[q][k] = s * apk + c * aqk;
        }
      }
    }
  }
  const ev = [];
  for (let i = 0; i < n; i++) ev.push(A[i][i]);
  ev.sort((x, y) => y - x);
  return ev;
}

// ── Effective number of bets — PCA / inverse participation ratio ─────────────
// ENB = (Σλ)² / Σλ² on the correlation-matrix eigenvalues. Negative eigenvalues
// (numerical noise on a near-degenerate matrix) are clamped to 0.
export function effectiveBetsPCA(corr) {
  const ev = symmetricEigenvalues(corr).map(v => (v > 0 ? v : 0));
  const sum = ev.reduce((a, v) => a + v, 0);
  const sumSq = ev.reduce((a, v) => a + v * v, 0);
  if (!(sumSq > 0) || !Number.isFinite(sum)) return NaN;
  return (sum * sum) / sumSq;
}

// ── Effective number of bets — Meucci entropy ────────────────────────────────
// ENB = exp(−Σ pᵢ ln pᵢ), pᵢ = λᵢ/Σλ. Ranges 1 (one dominant factor) → N (flat).
export function effectiveBetsEntropy(corr) {
  const ev = symmetricEigenvalues(corr).map(v => (v > 0 ? v : 0));
  const sum = ev.reduce((a, v) => a + v, 0);
  if (!(sum > 0)) return NaN;
  let h = 0;
  for (const v of ev) {
    const p = v / sum;
    if (p > 0) h -= p * Math.log(p);
  }
  return Math.exp(h);
}

// ── Effective number of bets — allocation-aware ──────────────────────────────
// ENB = (Σw)² / (wᵀ C w). Uses the caller's weights (defaults to equal weight).
// Weights need not sum to 1 (the formula is scale-invariant).
export function effectiveBetsWeighted(corr, weights) {
  const n = corr.length;
  const w = weights && weights.length === n ? weights.slice() : new Array(n).fill(1 / n);
  let quad = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const c = corr[i][j];
      if (!Number.isFinite(c)) return NaN;
      quad += w[i] * w[j] * c;
    }
  }
  const sw = w.reduce((a, v) => a + v, 0);
  if (!(quad > 0)) return NaN;
  return (sw * sw) / quad;
}

// ── Effective number of bets — single-average-correlation approximation ──────
// ENB = n / (1 + (n−1)·ρ̄). The crude closed form that assumes every pair shares
// the SAME average correlation ρ̄. Cheap, no matrix needed — this is the formula
// already inlined in `perLineStrategy.js`'s `concentrationStats` (per-instrument
// daily-PnL concentration). Kept here so that inline copy has a single home to
// migrate to (Lego Principle 1); the eigenvalue/weighted versions above are the
// more faithful measures when the full correlation matrix is available.
export function effectiveBetsAvgCorr(n, avgRho) {
  if (!(n > 0) || !Number.isFinite(avgRho)) return NaN;
  const denom = 1 + (n - 1) * avgRho;
  return denom > 0 ? n / denom : NaN;
}

// ── Convenience: full summary from return columns ────────────────────────────
// `cols` : Array<number[]> (one per strategy). `weights` optional.
// Returns { n, corr, eigenvalues, pca, entropy, weighted, ratio } where
// `ratio` = weighted-ENB ÷ n (1.0 = fully independent, →0 = one bet in costumes).
// NOTE: `ratio` is anchored on the PCA-ENB, not the weighted ENB. Correlation
// matrices are positive semi-definite, so PCA-ENB is always in [1, n] and
// `ratio = pca/n` sits cleanly in (0,1] (1 = fully independent factors, →1/n =
// the same bet in different costumes). The allocation-aware weighted ENB can
// legitimately EXCEED n when strategies are net-hedged (strong negative
// correlation shrinks wᵀCw toward zero) — a true property, but it would make a
// "÷ n" ratio read as >100%, so we don't base the headline ratio on it.
export function diversificationSummary(cols, weights) {
  const corr = correlationMatrix(cols);
  const n = cols.length;
  const pca = effectiveBetsPCA(corr);
  return {
    n,
    corr,
    eigenvalues: symmetricEigenvalues(corr),
    pca,
    entropy: effectiveBetsEntropy(corr),
    weighted: effectiveBetsWeighted(corr, weights),
    ratio: Number.isFinite(pca) && n > 0 ? pca / n : NaN,
  };
}
