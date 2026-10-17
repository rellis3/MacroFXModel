/**
 * Statistics the harness fixes for every study — so a p, a Sharpe or a "survives
 * FDR" means the same thing in every deskEvidence entry written from here on.
 *
 * What is here and why it is not in statsCore:
 *
 *   clusteredBlockBootstrap  statsCore.blockBootstrapIC resamples ROWS. A panel pooled
 *                            across instruments has several rows per date, and the COT
 *                            factor test showed what happens when a block of five rows
 *                            is five instruments on one week rather than five weeks: the
 *                            block preserved nothing it was meant to preserve. Here the
 *                            unit is the DATE CLUSTER (every row sharing a date moves as
 *                            one), and blocks are runs of consecutive dates. It bootstraps
 *                            the statistic (percentile interval, two-sided p), rather than
 *                            permuting x against a fixed y as the brick does — the brick's
 *                            null cannot be built when clusters differ in size.
 *   bhFdr                    Benjamini–Hochberg across a study's cells, or the registry.
 *   deflatedSharpe           Bailey & López de Prado: the probability that a Sharpe beats
 *                            the best of N unrelated trials, given skew, kurtosis and n.
 *   pbo                      Probability of backtest overfitting by CSCV (combinatorially
 *                            symmetric cross-validation): split time into S blocks, use
 *                            every half/half combination, pick the best in-sample cell,
 *                            ask how it ranks out-of-sample. PBO = share of combinations
 *                            where the IS winner is below the OOS median.
 *   pcaShare                 How much of a universe's variance is one factor (the dollar,
 *                            for seven USD pairs) — the effective-N haircut the prereg asks
 *                            to be reported beside any pooled result.
 */
import { mean, stdev, spearman, mulberry32 } from '../statsCore.js';

export { mean, stdev, spearman };

// ── Moments, Sharpe, drawdown ───────────────────────────────────────────────
export function skewKurt(a) {
  const x = a.filter(Number.isFinite);
  const n = x.length;
  if (n < 4) return { skew: NaN, kurt: NaN, n };
  const m = mean(x);
  let m2 = 0, m3 = 0, m4 = 0;
  for (const v of x) { const d = v - m; m2 += d * d; m3 += d * d * d; m4 += d * d * d * d; }
  m2 /= n; m3 /= n; m4 /= n;
  if (!(m2 > 0)) return { skew: 0, kurt: 3, n };
  return { skew: m3 / Math.pow(m2, 1.5), kurt: m4 / (m2 * m2), n };   // kurt is NON-excess (normal = 3)
}

/** Annualised Sharpe of a per-period return series, plus the per-period Sharpe DSR needs. */
export function sharpeAnn(rets, periodsPerYear = 252) {
  const x = rets.filter(Number.isFinite);
  const n = x.length;
  if (n < 2) return { sr: NaN, srPeriod: NaN, n, mean: NaN, sd: NaN };
  const m = mean(x), sd = stdev(x, 1);
  const srPeriod = sd > 0 ? m / sd : NaN;
  return { sr: Number.isFinite(srPeriod) ? srPeriod * Math.sqrt(periodsPerYear) : NaN, srPeriod, n, mean: m, sd };
}

export function profitFactor(tradeRets) {
  let w = 0, l = 0;
  for (const r of tradeRets) { if (r > 0) w += r; else if (r < 0) l -= r; }
  return l > 0 ? w / l : (w > 0 ? Infinity : NaN);
}

export function maxDrawdown(rets) {
  let eq = 0, peak = 0, dd = 0;
  for (const r of rets) { if (!Number.isFinite(r)) continue; eq += r; if (eq > peak) peak = eq; dd = Math.max(dd, peak - eq); }
  return dd;   // in cumulative simple-return units (sum of daily returns)
}

// ── Normal distribution ─────────────────────────────────────────────────────
export function normCdf(x) {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  // Abramowitz & Stegun 7.1.26 via erf; |error| < 1.5e-7
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** Inverse normal CDF (Acklam's rational approximation, relative error ~1e-9). */
export function normInv(p) {
  if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : p >= 1 ? Infinity : NaN;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pl = 0.02425, ph = 1 - pl;
  let q, r;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > ph) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  q = p - 0.5; r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// ── Clustered moving-block bootstrap of a statistic ──────────────────────────
/**
 * clusters: ordered array (by date) of arrays of rows; `stat(rows) → number` is computed on
 * the flattened sample. A resample draws runs of consecutive CLUSTERS with geometric block
 * length (mean `meanBlock` clusters, the same scheme as statsCore.blockResample), until it
 * holds as many clusters as the original, then recomputes the statistic.
 *
 * Returns the observed statistic, the bootstrap SE, a 95% percentile interval, and a
 * two-sided p for "statistic = 0" as 2 × the smaller tail share, with the Davison–Hinkley
 * +1 so it is never exactly zero.
 */
export function clusteredBlockBootstrap(clusters, stat, { meanBlock = 4, nBoot = 1000, seed = 0x9e3779b9, minClusters = 30 } = {}) {
  const C = clusters.length;
  const flat = clusters.flat();
  if (C < minClusters) return { ok: false, error: `need >= ${minClusters} date clusters, got ${C}`, n: flat.length, nClusters: C };
  const block = Math.max(1, Math.min(Math.round(meanBlock), Math.floor(C / 8)));
  const obs = stat(flat);
  const rng = mulberry32(seed >>> 0);
  const p = 1 / block;
  const dist = new Array(nBoot);
  let below = 0, above = 0;
  for (let b = 0; b < nBoot; b++) {
    const sample = [];
    let idx = (rng() * C) | 0;
    for (let k = 0; k < C; k++) {
      for (const r of clusters[idx]) sample.push(r);
      idx = (rng() < p) ? (rng() * C) | 0 : (idx + 1) % C;
    }
    const s = stat(sample);
    dist[b] = s;
    if (s <= 0) below++;
    if (s >= 0) above++;
  }
  const sorted = dist.filter(Number.isFinite).sort((a, b) => a - b);
  const q = f => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(f * sorted.length)))];
  const pTwo = Math.min(1, 2 * Math.min((below + 1) / (nBoot + 1), (above + 1) / (nBoot + 1)));
  return {
    ok: true, n: flat.length, nClusters: C, meanBlock: block, nBoot,
    obs: +obs.toFixed(5), se: +stdev(sorted, 1).toFixed(5),
    ci95: [+q(0.025).toFixed(5), +q(0.975).toFixed(5)],
    pValue: +pTwo.toFixed(4),
    method: 'moving-block bootstrap of date clusters; percentile interval; two-sided p vs 0',
  };
}

/** Group rows by a key (date), preserving sorted key order. */
export function clusterBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) { const k = keyFn(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return [...m.keys()].sort().map(k => m.get(k));
}

// ── Multiple comparisons ────────────────────────────────────────────────────
/**
 * Benjamini–Hochberg. Returns, for each input p (NaN allowed — not counted), whether it
 * is rejected at FDR `q`, the BH threshold (largest p rejected, 0 if none) and m.
 */
export function bhFdr(pvals, q = 0.10) {
  const idx = pvals.map((p, i) => [p, i]).filter(([p]) => Number.isFinite(p)).sort((a, b) => a[0] - b[0]);
  const m = idx.length;
  let k = -1;
  for (let i = 0; i < m; i++) if (idx[i][0] <= ((i + 1) / m) * q) k = i;
  const pass = new Array(pvals.length).fill(false);
  for (let i = 0; i <= k; i++) pass[idx[i][1]] = true;
  return { q, m, k: k + 1, threshold: k >= 0 ? idx[k][0] : 0, pass };
}

// ── Deflated Sharpe ratio (Bailey & López de Prado 2014) ────────────────────
/**
 * srPeriod: the per-period (daily) Sharpe; n: periods; skew/kurt of the per-period returns
 * (kurt non-excess); nTrials: N; varTrialSr: variance of the per-period Sharpe across the
 * trials. SR0 is the expected maximum Sharpe of N unrelated trials with that variance; DSR
 * is the probability the observed Sharpe exceeds it after non-normality and sample length.
 */
export function deflatedSharpe({ srPeriod, n, skew = 0, kurt = 3, nTrials = 2, varTrialSr }) {
  if (!Number.isFinite(srPeriod) || !(n > 2)) return { dsr: NaN, sr0: NaN, note: 'insufficient' };
  const gamma = 0.5772156649015329;
  const N = Math.max(2, nTrials);
  const v = Number.isFinite(varTrialSr) && varTrialSr > 0 ? varTrialSr : (1 + 0.5 * srPeriod * srPeriod) / n;   // single trial: its own sampling variance
  const sr0 = Math.sqrt(v) * ((1 - gamma) * normInv(1 - 1 / N) + gamma * normInv(1 - 1 / (N * Math.E)));
  const denomSq = 1 - skew * srPeriod + ((kurt - 1) / 4) * srPeriod * srPeriod;
  if (!(denomSq > 0)) return { dsr: NaN, sr0, note: 'non-normality term undefined' };
  const z = (srPeriod - sr0) * Math.sqrt(n - 1) / Math.sqrt(denomSq);
  return { dsr: +normCdf(z).toFixed(4), sr0: +sr0.toFixed(5), z: +z.toFixed(3), nTrials: N, varTrialSr: v };
}

// ── PBO by CSCV ─────────────────────────────────────────────────────────────
/**
 * returns: T × N matrix (rows = periods in time order, columns = cells). Splits T into S
 * contiguous blocks and uses every S/2-of-S combination (C(16,8) = 12,870) unless that is
 * more than `maxCombos`, in which case a seeded sample. For each, the best IS cell by
 * Sharpe is ranked among all cells OOS; the logit of its relative rank is negative when it
 * is below the OOS median. PBO is the share of negative logits.
 */
export function pbo(returns, { splits = 16, maxCombos = 13000, seed = 0x9e3779b9 } = {}) {
  const T = returns.length, N = T ? returns[0].length : 0;
  if (N < 2) return { ok: false, error: 'PBO needs >= 2 cells' };
  if (T < splits * 20) return { ok: false, error: `PBO needs >= ${splits * 20} periods, got ${T}` };
  const S = splits;
  const bounds = []; for (let s = 0; s < S; s++) bounds.push([Math.floor(s * T / S), Math.floor((s + 1) * T / S)]);
  // per-block sums and sums of squares per cell → Sharpe of any union of blocks in O(S)
  const bsum = bounds.map(() => new Array(N).fill(0)), bsq = bounds.map(() => new Array(N).fill(0)), bn = bounds.map(([a, b]) => b - a);
  for (let s = 0; s < S; s++) for (let t = bounds[s][0]; t < bounds[s][1]; t++) for (let j = 0; j < N; j++) { const r = returns[t][j] || 0; bsum[s][j] += r; bsq[s][j] += r * r; }
  const srOf = (blocks, j) => { let n = 0, su = 0, sq = 0; for (const s of blocks) { n += bn[s]; su += bsum[s][j]; sq += bsq[s][j]; } const m = su / n, v = sq / n - m * m; return v > 0 ? m / Math.sqrt(v) : 0; };
  // enumerate combinations with popcount S/2
  const combos = [];
  for (let mask = 0; mask < (1 << S); mask++) { let c = 0, x = mask; while (x) { c += x & 1; x >>= 1; } if (c === S / 2) combos.push(mask); }
  let use = combos;
  if (combos.length > maxCombos) { const rng = mulberry32(seed >>> 0); use = []; for (let i = 0; i < maxCombos; i++) use.push(combos[(rng() * combos.length) | 0]); }
  let neg = 0, logits = [];
  for (const mask of use) {
    const isB = [], oosB = [];
    for (let s = 0; s < S; s++) ((mask >> s) & 1 ? isB : oosB).push(s);
    let best = 0, bestSr = -Infinity;
    for (let j = 0; j < N; j++) { const sr = srOf(isB, j); if (sr > bestSr) { bestSr = sr; best = j; } }
    const oos = []; for (let j = 0; j < N; j++) oos.push(srOf(oosB, j));
    const rank = oos.filter(v => v < oos[best]).length + 1;   // 1 = worst, N = best
    const omega = rank / (N + 1);
    const lambda = Math.log(omega / (1 - omega));
    logits.push(lambda);
    if (lambda < 0) neg++;
  }
  return { ok: true, pbo: +(neg / use.length).toFixed(4), nCombos: use.length, splits: S, cells: N, periods: T, meanLogit: +mean(logits).toFixed(3) };
}

// ── PCA share of the first factor ───────────────────────────────────────────
function jacobiEigenvalues(A) {
  const n = A.length, a = A.map(r => r.slice());
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0; for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
    if (off < 1e-14) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-15) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
    }
  }
  return a.map((r, i) => r[i]).sort((x, y) => y - x);
}

/**
 * series: { inst: number[] } aligned on the same dates (NaN where missing). Rows with any
 * NaN are dropped. Returns the first eigenvalue's share of the correlation matrix trace and
 * the participation-ratio effective number of independent factors.
 */
export function pcaShare(series) {
  const names = Object.keys(series);
  const n = names.length;
  if (n < 2) return { ok: false, error: 'need >= 2 series' };
  const L = Math.min(...names.map(k => series[k].length));
  const rows = [];
  for (let t = 0; t < L; t++) { const r = names.map(k => series[k][t]); if (r.every(Number.isFinite)) rows.push(r); }
  if (rows.length < 60) return { ok: false, error: `need >= 60 complete rows, got ${rows.length}` };
  const mu = names.map((_, j) => mean(rows.map(r => r[j])));
  const sd = names.map((_, j) => stdev(rows.map(r => r[j]), 1));
  const C = names.map(() => new Array(n).fill(0));
  for (const r of rows) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) C[i][j] += ((r[i] - mu[i]) / sd[i]) * ((r[j] - mu[j]) / sd[j]);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) C[i][j] /= rows.length - 1;
  const ev = jacobiEigenvalues(C);
  const tot = ev.reduce((s, v) => s + v, 0), sq = ev.reduce((s, v) => s + v * v, 0);
  return { ok: true, n, rows: rows.length, pc1Share: +(ev[0] / tot).toFixed(3), effN: +((tot * tot) / sq).toFixed(2), eigenvalues: ev.map(v => +v.toFixed(3)) };
}
