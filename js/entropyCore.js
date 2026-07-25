/**
 * Entropy Core — information-theory Tier-1 primitives (engine #6/#14 of the
 * analytics map, `ANALYTICS_ENGINE_DESIGN.md`). Nothing in the codebase
 * computed Shannon entropy, KL/JS divergence or mutual information before this
 * brick (audited 2026-07-24) — the family the desk uses to ask "has the
 * distribution changed?" without assuming a parametric model.
 *
 * Measurement brick, not a signal: it describes disorder and distributional
 * shift; any use as a trade filter goes through the harness first.
 *
 * Conventions (stated here so callers own the meaning):
 *   • All entropies/divergences are in BITS (log base 2).
 *   • Probability vectors are plain arrays summing to ~1; zero entries are
 *     legal (0·log0 ≡ 0). KL is +Infinity where q=0 with p>0 — that is the
 *     mathematically honest answer; use jsDivergence (always finite, bounded
 *     [0,1] bits) when a distance for noisy histograms is wanted.
 *   • Binning: equal-width over an explicit [lo, hi]. `regimeShiftSeries`
 *     derives its bin edges from the REFERENCE window only, so the data being
 *     judged never defines the ruler it is judged with (no lookahead).
 */

// ── Histograms ───────────────────────────────────────────────────────────────
// Probability vector of xs over `bins` equal-width bins on [lo, hi].
// Out-of-range values clamp into the edge bins (deliberate: a new regime that
// escapes the reference range should pile up visibly in a tail bin, not vanish).
export function histProbs(xs, bins = 10, lo = null, hi = null) {
  const v = xs.filter(Number.isFinite);
  if (!v.length || bins < 1) return new Array(Math.max(bins, 0)).fill(0);
  if (lo == null) lo = Math.min(...v);
  if (hi == null) hi = Math.max(...v);
  const counts = new Array(bins).fill(0);
  const w = (hi - lo) / bins;
  for (const x of v) {
    let b = w > 0 ? Math.floor((x - lo) / w) : 0;
    if (b < 0) b = 0; else if (b >= bins) b = bins - 1;
    counts[b]++;
  }
  return counts.map(c => c / v.length);
}

// ── Entropy ──────────────────────────────────────────────────────────────────
// Shannon entropy of a probability vector, in bits. H([.5,.5]) = 1.
export function shannonEntropy(p) {
  let h = 0;
  for (const pi of p) if (pi > 0) h -= pi * Math.log2(pi);
  return h;
}

// Entropy of a raw series after binning, normalized to [0,1] by the maximum
// log2(bins) — the "market disorder" gauge. 1 = maximally spread (uniform
// across bins), →0 = concentrated (orderly / one-sided).
export function normalizedEntropy(xs, { bins = 10, lo = null, hi = null } = {}) {
  if (bins < 2) return 0;
  return shannonEntropy(histProbs(xs, bins, lo, hi)) / Math.log2(bins);
}

// ── Divergences ──────────────────────────────────────────────────────────────
// KL(p‖q) in bits. Asymmetric; +Infinity where q has a zero p doesn't.
export function klDivergence(p, q) {
  let d = 0;
  for (let i = 0; i < p.length; i++) {
    if (p[i] > 0) {
      if (!(q[i] > 0)) return Infinity;
      d += p[i] * Math.log2(p[i] / q[i]);
    }
  }
  return d;
}

// Jensen-Shannon divergence in bits: symmetric, finite, bounded [0,1].
// 0 = identical distributions, 1 = fully disjoint support.
export function jsDivergence(p, q) {
  const m = p.map((pi, i) => (pi + (q[i] || 0)) / 2);
  return (klDivergence(p, m) + klDivergence(q, m)) / 2;
}

// ── Mutual information ───────────────────────────────────────────────────────
// Binned MI between two aligned series, in bits: H(x) + H(y) − H(x,y).
// 0 = independent (linear OR nonlinear); H(x) = fully determined. Catches
// relationships correlation misses, at histogram resolution (`bins` per axis —
// keep modest: bins² cells need filling; small-n MI is biased upward).
export function mutualInformation(xs, ys, { bins = 8 } = {}) {
  const n = Math.min(xs.length, ys.length);
  const px = [], py = [];
  for (let i = 0; i < n; i++) if (Number.isFinite(xs[i]) && Number.isFinite(ys[i])) { px.push(xs[i]); py.push(ys[i]); }
  if (px.length < 2) return 0;
  const [xlo, xhi] = [Math.min(...px), Math.max(...px)];
  const [ylo, yhi] = [Math.min(...py), Math.max(...py)];
  const wx = (xhi - xlo) / bins, wy = (yhi - ylo) / bins;
  const joint = new Array(bins * bins).fill(0);
  const binOf = (x, lo, w) => { let b = w > 0 ? Math.floor((x - lo) / w) : 0; return b < 0 ? 0 : b >= bins ? bins - 1 : b; };
  for (let i = 0; i < px.length; i++) joint[binOf(px[i], xlo, wx) * bins + binOf(py[i], ylo, wy)]++;
  const pj = joint.map(c => c / px.length);
  const mi = shannonEntropy(histProbs(px, bins, xlo, xhi))
           + shannonEntropy(histProbs(py, bins, ylo, yhi))
           - shannonEntropy(pj);
  return Math.max(0, mi);
}

// ── Rolling regime-shift detector ────────────────────────────────────────────
// For each index i: JS divergence (bits) between the trailing `window` values
// [i−window, i) and the `ref` values before them [i−window−ref, i−window).
// High = "the recent distribution no longer looks like the recent past" —
// a model-free change signal to A/B against HMM/BOCPD flips (design doc §4).
//
// No lookahead: out[i] reads bars ≤ i only (the trailing window ends at bar i),
// and the bin edges come from the REFERENCE window alone. NaN until warm
// (i ≥ window + ref − 1).
export function regimeShiftSeries(xs, { window = 60, ref = 250, bins = 10 } = {}) {
  const out = new Array(xs.length).fill(NaN);
  for (let i = window + ref; i <= xs.length; i++) {
    const refWin = xs.slice(i - window - ref, i - window);
    const cur = xs.slice(i - window, i);
    const lo = Math.min(...refWin), hi = Math.max(...refWin);
    const idx = i - 1;
    out[idx] = jsDivergence(histProbs(cur, bins, lo, hi), histProbs(refWin, bins, lo, hi));
  }
  return out;
}
