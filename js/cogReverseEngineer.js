/**
 * COG Reverse-Engineer — infer COG's volatility algorithm from his OWN outputs.
 *
 * We have COG's forecast levels stored per day (hl_med, hl_75, oc_med, oc_75 — % of
 * price) for EURUSD / NQ / GOLD. Those are LABELS. On the same history strictly before
 * each date we can recompute any candidate σ. So "what is his calc?" becomes a fitting
 * problem with two honest, separable pieces:
 *
 *  1. RATIO DIAGNOSTICS (no fitting — just dividing his own numbers):
 *       • hl_75 / hl_med  → his percentile mapping. Ours is Feller's driftless-Brownian
 *         BM_P75/BM_P50 = 2.049/1.572 = 1.303. If COG's ratio ≈ 1.303 he shares our
 *         distribution; a different, STABLE ratio ⇒ a different distribution (fatter
 *         tails / a vol-of-vol widening / empirical quantiles).
 *       • oc_med / hl_med → his Open-Close vs High-Low relationship (ours = HN_P50/BM_P50).
 *       • oc_75 / oc_med  → the O-C percentile mapping.
 *     A stable ratio across days AND across the three instruments is strong evidence
 *     it's a fixed formula, not a per-day discretionary tweak.
 *
 *  2. ESTIMATOR FIT: for each candidate σ, the implied constant C = (hl_med/100) / σ
 *     (Feller: HL_frac = C·σ, C ≈ BM_P50 × width-correction). The candidate whose C is
 *     the MOST STABLE (lowest CV) and whose σ CORRELATES best with COG's hl_med is the
 *     likely estimator — and C itself reveals his range constant (≈1.57 ⇒ raw Feller,
 *     >1.57 ⇒ a widening).
 *
 *  3. BLEND TEST (the "combination of theories" question): the best convex mix of the
 *     top-2 estimators. Reported, but a blend only "wins" if it beats the best single
 *     estimator by a WIDE margin AND consistently across instruments — with ~20-40 days
 *     each, a blend of many estimators fits noise. Parsimony is the default.
 *
 * IMPORTANT (honest through-line): identifying COG's calc lets us REPRODUCE his line
 * (removing the manual-paste dependency) — it does NOT create edge. The paired A/B
 * already showed COG's line is not a better tradeable fade. This is understanding, not
 * a profit path. Small N ⇒ directional, not proof.
 *
 * Pure core (no network / no KV): the route computes the candidate σ per day and feeds
 * records in. Reuses nothing it shouldn't; the σ series come from volBacktestEngine.
 */

const _mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const _std = a => { if (a.length < 2) return 0; const m = _mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
const _cv = a => { const m = _mean(a); return m ? _std(a) / m : null; };
const r3 = x => x == null ? null : +x.toFixed(3);
const r4 = x => x == null ? null : +x.toFixed(4);

// Feller driftless-Brownian constants (must match volBacktestEngine) — the benchmark
// COG's ratios/constants are measured against.
export const FELLER = { BM_P50: 1.572, BM_P75: 2.049, HN_P50: 0.7979, HN_P75: 1.284 };
export const FELLER_HL75_OVER_HL50 = FELLER.BM_P75 / FELLER.BM_P50;   // 1.303
export const FELLER_OC50_OVER_HL50 = FELLER.HN_P50 / FELLER.BM_P50;   // 0.508

function _pearson(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 3) return null;
  const mx = _mean(x), my = _mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return (sxx > 0 && syy > 0) ? sxy / Math.sqrt(sxx * syy) : null;
}

function _dist(a) {
  return a.length ? { n: a.length, mean: r4(_mean(a)), std: r4(_std(a)), cv: r3(_cv(a)) } : { n: 0 };
}

// Assumption-free: COG's own output ratios. hl_* / oc_* are % of price.
export function ratioDiagnostics(records) {
  const hl75_50 = [], oc50_hl50 = [], oc75_50 = [];
  for (const r of records) {
    const c = r.cog || {};
    if (c.hl_med > 0 && c.hl_75 > 0) hl75_50.push(c.hl_75 / c.hl_med);
    if (c.hl_med > 0 && c.oc_med > 0) oc50_hl50.push(c.oc_med / c.hl_med);
    if (c.oc_med > 0 && c.oc_75 > 0) oc75_50.push(c.oc_75 / c.oc_med);
  }
  return {
    hl75_over_hl50: { ...( _dist(hl75_50)), feller: r3(FELLER_HL75_OVER_HL50), matchesFeller: hl75_50.length ? Math.abs(_mean(hl75_50) - FELLER_HL75_OVER_HL50) < 0.02 : null },
    oc50_over_hl50: { ...( _dist(oc50_hl50)), feller: r3(FELLER_OC50_OVER_HL50) },
    oc75_over_oc50: _dist(oc75_50),
  };
}

// Fit ONE estimator: implied C = (hl_med/100)/σ (Feller HL_frac = C·σ). A stable C
// (low CV) whose σ correlates with COG's hl_med ⇒ the likely estimator. C reveals the
// range constant (≈1.57 raw Feller, >1.57 a widening).
export function fitEstimator(records, name) {
  const sig = [], hl = [], cImp = [];
  for (const r of records) {
    const s = r.sigmas?.[name], h = r.cog?.hl_med;
    if (!(s > 0) || !(h > 0)) continue;
    sig.push(s); hl.push(h / 100); cImp.push((h / 100) / s);
  }
  if (sig.length < 3) return { name, n: sig.length, insufficient: true };
  return {
    name, n: sig.length,
    r: r3(_pearson(sig, hl)),          // does σ track COG's hl_med?
    cMean: r3(_mean(cImp)),            // implied range constant (≈ BM_P50 × widening)
    cStd: r4(_std(cImp)), cCv: r3(_cv(cImp)),   // stability of that constant (the key tell)
    wideningVsFeller: r3(_mean(cImp) / FELLER.BM_P50),   // >1 ⇒ COG runs wider than raw Feller
  };
}

// Best convex mix of two estimators' σ, scored by correlation with COG's hl_med.
export function fitBlend(records, nameA, nameB, step = 0.1) {
  let best = null;
  for (let a = 0; a <= 1.0001; a += step) {
    const sig = [], hl = [];
    for (const r of records) {
      const sa = r.sigmas?.[nameA], sb = r.sigmas?.[nameB], h = r.cog?.hl_med;
      if (!(sa > 0) || !(sb > 0) || !(h > 0)) continue;
      sig.push(a * sa + (1 - a) * sb); hl.push(h / 100);
    }
    const r = _pearson(sig, hl);
    if (r != null && (!best || r > best.r)) best = { alpha: r3(a), r: r3(r), a: nameA, b: nameB, n: sig.length };
  }
  return best;
}

/**
 * reverseEngineer(records, opts) — the full read for one instrument.
 *   records: [{ date, cog:{hl_med,hl_75,oc_med,oc_75}, sigmas:{ name: σdaily } }]
 * Returns the ratio diagnostics, the ranked estimator fits, and the best blend +
 * whether it materially beats the best single estimator (the parsimony guard).
 */
export function reverseEngineer(records, opts = {}) {
  const { blendMinGain = 0.03 } = opts;   // a blend must beat the best single r by this to matter
  if (!records || records.length < 3) return { insufficient: true, n: records?.length || 0 };
  const names = Object.keys(records[0]?.sigmas || {});
  const fits = names.map(n => fitEstimator(records, n)).filter(f => !f.insufficient)
    .sort((x, y) => (Math.abs(y.r) - Math.abs(x.r)) || (x.cCv - y.cCv));
  const best = fits[0] || null;
  let blend = null, blendWins = false;
  if (fits.length >= 2) {
    blend = fitBlend(records, fits[0].name, fits[1].name);
    blendWins = !!(blend && best && Math.abs(blend.r) - Math.abs(best.r) >= blendMinGain && blend.alpha > 0.05 && blend.alpha < 0.95);
  }
  return {
    n: records.length,
    ratios: ratioDiagnostics(records),
    fits,
    best,
    blend, blendWins,
    // A plain-language verdict the page can show verbatim (honest, hedged on small N).
    verdict: best
      ? `Best single: ${best.name} (r=${best.r}, C=${best.cMean}, CV=${best.cCv}). `
        + `75th/median = ${r3(ratioDiagnostics(records).hl75_over_hl50.mean)} vs Feller ${r3(FELLER_HL75_OVER_HL50)}. `
        + (blendWins ? `A ${blend.a}/${blend.b} blend (α=${blend.alpha}) beats it (r=${blend.r}).` : `No blend beats it materially — parsimony holds.`)
      : 'No estimator had enough matched days.',
  };
}
