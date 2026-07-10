// mve/linalg.js — minimal, pure, dependency-free linear algebra for the Market
// Valuation Engine. Just enough to do multi-factor OLS, prediction variance,
// Mahalanobis distance, min-variance ensemble weights and a 1-D Kalman filter.
// No network, no DOM — unit-testable on synthetic data (see mve.test.mjs).
//
// Matrices are arrays-of-rows: A[i][j]. Vectors are plain arrays.

export function zeros(r, c) {
  return Array.from({ length: r }, () => new Array(c).fill(0));
}

export function identity(n) {
  const I = zeros(n, n);
  for (let i = 0; i < n; i++) I[i][i] = 1;
  return I;
}

export function transpose(A) {
  const r = A.length, c = A[0].length;
  const T = zeros(c, r);
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) T[j][i] = A[i][j];
  return T;
}

export function matMul(A, B) {
  const r = A.length, k = B.length, c = B[0].length;
  const C = zeros(r, c);
  for (let i = 0; i < r; i++) {
    for (let t = 0; t < k; t++) {
      const a = A[i][t];
      if (a === 0) continue;
      for (let j = 0; j < c; j++) C[i][j] += a * B[t][j];
    }
  }
  return C;
}

export function matVec(A, x) {
  return A.map(row => row.reduce((s, v, j) => s + v * x[j], 0));
}

export const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

// Solve A·x = b for square A via Gaussian elimination with partial pivoting.
// Returns null if singular.
export function solve(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col];
    for (let j = col; j <= n; j++) M[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let j = col; j <= n; j++) M[r][j] -= f * M[col][j];
    }
  }
  return M.map(row => row[n]);
}

// Inverse of a square matrix via solving against identity columns. null if singular.
export function inv(A) {
  const n = A.length;
  const I = identity(n);
  const cols = [];
  for (let c = 0; c < n; c++) {
    const x = solve(A, I.map(row => row[c]));
    if (x == null) return null;
    cols.push(x);
  }
  // cols[c] is the c-th column of the inverse
  const out = zeros(n, n);
  for (let i = 0; i < n; i++) for (let c = 0; c < n; c++) out[i][c] = cols[c][i];
  return out;
}

// Quadratic form xᵀ M x.
export function quad(x, M) {
  return dot(x, matVec(M, x));
}
