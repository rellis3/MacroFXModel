// hedge-method-comparison: the maths. Pure functions, no I/O. Prereg: forge/HEDGE_METHOD_COMPARISON_PREREG.md.
// Every weight for day t is built from returns at indices < t (the caller passes t and the arrays; nothing at or after t is read).

/** Solve A x = b for a small dense system (k <= 3) by Gauss-Jordan with partial pivoting; returns null when singular. */
export function solve(A, b) {
  const k = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < k; c++) {
    let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-18) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < k; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let j = c; j <= k; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map((r, i) => r[k] / r[i]);
}

/** Weighted least-squares hedge weights over the day indices idx (array of day numbers), with per-day weights om (or null). ridge is added to the covariance diagonal as a multiple of its mean. */
export function wls(rA, RH, idx, om = null, ridge = 0) {
  const k = RH.length; let sw = 0; const mA = [0], mH = new Array(k).fill(0); let ma = 0;
  for (let q = 0; q < idx.length; q++) { const i = idx[q], w = om ? om[q] : 1; sw += w; ma += w * rA[i]; for (let j = 0; j < k; j++) mH[j] += w * RH[j][i]; }
  if (sw <= 0) return null;
  ma /= sw; for (let j = 0; j < k; j++) mH[j] /= sw;
  const C = Array.from({ length: k }, () => new Array(k).fill(0)), c = new Array(k).fill(0);
  for (let q = 0; q < idx.length; q++) {
    const i = idx[q], w = om ? om[q] : 1, da = rA[i] - ma;
    for (let a = 0; a < k; a++) { const xa = RH[a][i] - mH[a]; c[a] += w * xa * da; for (let b = a; b < k; b++) C[a][b] += w * xa * (RH[b][i] - mH[b]); }
  }
  let tr = 0; for (let a = 0; a < k; a++) { for (let b = a; b < k; b++) { C[a][b] /= sw; C[b][a] = C[a][b]; } c[a] /= sw; tr += C[a][a]; }
  if (ridge) for (let a = 0; a < k; a++) C[a][a] += ridge * (tr / k);
  return solve(C, c);
}

const range = (a, b) => { const o = []; for (let i = a; i < b; i++) o.push(i); return o; };
const sgn = x => (x > 0 ? 1 : x < 0 ? -1 : 0);

function corr(rA, rH, a, b) {
  let sa = 0, sh = 0, n = b - a; for (let i = a; i < b; i++) { sa += rA[i]; sh += rH[i]; } sa /= n; sh /= n;
  let saa = 0, shh = 0, sah = 0; for (let i = a; i < b; i++) { const x = rA[i] - sa, y = rH[i] - sh; saa += x * x; shh += y * y; sah += x * y; }
  return saa > 0 && shh > 0 ? sah / Math.sqrt(saa * shh) : 0;
}

/** mean of the worst 5% of a window of hedged returns h = rA - sum w_j rH_j over [a, b) */
function es5(rA, RH, w, a, b) {
  const n = b - a, m = Math.max(1, Math.round(n * 0.05)), worst = [];
  for (let i = a; i < b; i++) {
    let h = rA[i]; for (let j = 0; j < RH.length; j++) h -= w[j] * RH[j][i];
    if (worst.length < m) { worst.push(h); if (worst.length === m) worst.sort((x, y) => x - y); }
    else if (h < worst[m - 1]) { let p = m - 1; while (p > 0 && worst[p - 1] > h) { worst[p] = worst[p - 1]; p--; } worst[p] = h; }
  }
  let s = 0; for (const v of worst) s += v; return s / worst.length;
}

/** Minimum-ES weights by coordinate descent on a grid, on the window [a, b). */
export function minEs(rA, RH, a, b, start) {
  const k = RH.length, w = [...start], grid = []; for (let g = -10; g <= 30; g++) grid.push(g / 10);
  for (let sweep = 0; sweep < 2; sweep++) for (let j = 0; j < k; j++) {
    let best = w[j], bv = Infinity;
    for (const g of grid) { w[j] = g; const v = -es5(rA, RH, w, a, b); if (v < bv) { bv = v; best = g; } }   // ES is negative (a loss); minimise the loss magnitude = maximise ES
    w[j] = best;
  }
  return w;
}

export const WIN0 = 250;

/**
 * The weight path for one method on one problem: w[t] (array of k) for t in [WIN0, n), using only returns < t.
 * Methods: naive, ols60, ols120, ols250, ewma, blend, ridge, downside, minES, kalman.
 */
export function weightPath(method, rA, RH, opts = {}) {
  const n = rA.length, k = RH.length, out = new Array(n).fill(null);
  const win = L => t => range(t - L, t);
  if (method === 'kalman') {
    // random-walk betas; Q = 1e-5 * var(rA)/var(rH_j) per leg, R = var(rA) over the first WIN0 days; the state before day t has seen days < t
    const v = x => { let m = 0; for (let i = 0; i < WIN0; i++) m += x[i]; m /= WIN0; let s = 0; for (let i = 0; i < WIN0; i++) s += (x[i] - m) ** 2; return s / WIN0; };
    const vA = v(rA), vH = RH.map(v), R = vA;
    const beta = new Array(k).fill(0), P = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? 1 : 0)));
    for (let t = 0; t < n; t++) {
      if (t >= WIN0) out[t] = [...beta];
      for (let j = 0; j < k; j++) P[j][j] += 1e-5 * vA / vH[j];
      const x = RH.map(r => r[t]); let Px = new Array(k).fill(0); for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) Px[a] += P[a][b] * x[b];
      let S = R; for (let a = 0; a < k; a++) S += x[a] * Px[a];
      let pred = 0; for (let a = 0; a < k; a++) pred += beta[a] * x[a];
      const e = rA[t] - pred;
      for (let a = 0; a < k; a++) beta[a] += (Px[a] / S) * e;
      for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) P[a][b] -= (Px[a] * Px[b]) / S;
    }
    return out;
  }
  let last = null;
  for (let t = WIN0; t < n; t++) {
    let w = null;
    if (method === 'naive') w = RH.map(r => sgn(corr(rA, r, t - 250, t)) / k);
    else if (method === 'ols60') w = wls(rA, RH, win(60)(t));
    else if (method === 'ols120') w = wls(rA, RH, win(120)(t));
    else if (method === 'ols250') w = wls(rA, RH, win(250)(t));
    else if (method === 'ewma') { const idx = win(250)(t), om = idx.map(i => Math.pow(0.97, t - 1 - i)); w = wls(rA, RH, idx, om); }
    else if (method === 'blend') { const a = wls(rA, RH, win(60)(t)), b = wls(rA, RH, win(250)(t)); w = a && b ? a.map((x, j) => 0.5 * x + 0.5 * b[j]) : null; }
    else if (method === 'ridge') w = wls(rA, RH, win(120)(t), null, 0.10);
    else if (method === 'downside') {
      const idx = win(250)(t), s = idx.map(i => rA[i]).sort((x, y) => x - y), cut = s[Math.floor(s.length * 0.25)];
      w = wls(rA, RH, idx.filter(i => rA[i] <= cut), null, 1e-6);
    } else if (method === 'minES') {
      // refreshed every 5 days (prereg A1); between refreshes the last weights carry
      if (!last || (t - WIN0) % 5 === 0) last = minEs(rA, RH, t - 250, t, last ?? new Array(k).fill(0));
      w = last;
    } else throw new Error('method ' + method);
    out[t] = w && w.every(Number.isFinite) ? w : (out[t - 1] ?? new Array(k).fill(0));
  }
  return out;
}

/** Hedged return series for t in [WIN0, n) from a weight path. */
export function hedged(rA, RH, wp) {
  const n = rA.length, h = new Float64Array(n - WIN0);
  for (let t = WIN0; t < n; t++) { let v = rA[t]; const w = wp[t]; for (let j = 0; j < RH.length; j++) v -= w[j] * RH[j][t]; h[t - WIN0] = v; }
  return h;
}

export const varOf = x => { let m = 0; for (const v of x) m += v; m /= x.length; let s = 0; for (const v of x) s += (v - m) ** 2; return s / x.length; };
export function es5Of(x) { const s = [...x].sort((a, b) => a - b), m = Math.max(1, Math.round(s.length * 0.05)); let t = 0; for (let i = 0; i < m; i++) t += s[i]; return t / m; }
/** mean of x over the days where y is in its worst 10% */
export function worstDecileMean(x, y) { const idx = range(0, y.length).sort((a, b) => y[a] - y[b]).slice(0, Math.max(1, Math.round(y.length * 0.1))); let t = 0; for (const i of idx) t += x[i]; return t / idx.length; }

/** Seeded RNG (mulberry32) */
export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
