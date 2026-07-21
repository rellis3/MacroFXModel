/**
 * Trend-quality (Frog-in-the-Pan) filter for the trend basket.
 *
 * The idea (Da, Gurun & Warachka 2014, adapted by Gray & Vogel's Quantitative
 * Momentum): two trends of the SAME magnitude are not equal. A trend that got
 * there SMOOTHLY (continuous information → investors under-react → it persists)
 * outperforms one that got there in lottery-like SPIKES (discrete jumps →
 * over-reaction → it mean-reverts). So filter momentum by PATH QUALITY, not just
 * raw return.
 *
 * HOW IT COMPOSES (Lego Principle 4 — a selector, not new knobs): the trend
 * basket already exposes a `directionAt(iDecision, ctx) => {ccy: -1|0|+1}` hook.
 * This module returns exactly such a function — it keeps the default 12-mo trend
 * SIGN for the smooth trends and returns 0 (no position) for the spiky ones. The
 * validated `trendBasketEngine` is untouched; the A/B is just baseline vs this
 * selector through the identical sizing/cost/metrics machinery.
 *
 * The selector is PARAMETER-FREE by construction: each rebalance it keeps the
 * top-half of trending currencies by quality (cross-sectional MEDIAN split), so
 * there's no tuned threshold to overfit. Two quality measures are offered; both
 * are oriented so HIGHER = SMOOTHER.
 *
 * HONEST PRIOR: FIP is a US-EQUITY result (500+ names, wide dispersion). FX has
 * ~7-10 currencies, so the cross-sectional dispersion the effect feeds on is
 * thin and a median split leaves only ~half a dozen names. Expected default is
 * NULL after costs (~25-35% it survives OOS). This is a falsification test, not
 * an edge claim — see QUANT_MOMENTUM_LESSONS.md.
 *
 * Pure & offline-testable (no network/DOM). Unit-tested in trendQuality.test.mjs.
 */

import { stdev } from './statsCore.js';

// Quality of a single trend from its window of daily (log) returns.
// Higher = smoother / higher-quality momentum.
//   'driftDiffusion' — |Σr| / (σ·√L): the trend's signal-to-noise (its |t-stat|).
//                      A clean, steady drift scores high; a choppy path scores low.
//   'fipID'          — negated Frog-in-the-Pan information discreteness:
//                      ID = sign(ΣR)·(%down − %up); continuous info ⇒ ID low ⇒
//                      we return −ID so smoother ⇒ higher.
export function trendQualityScore(retWindow, measure = 'driftDiffusion') {
  const w = (retWindow || []).filter(Number.isFinite);
  const L = w.length;
  if (L < 2) return NaN;
  const sum = w.reduce((a, b) => a + b, 0);
  if (measure === 'fipID') {
    const pos = w.filter(x => x > 0).length / L;
    const neg = w.filter(x => x < 0).length / L;
    const id = Math.sign(sum) * (neg - pos);
    return -id;                       // higher = more continuous = smoother
  }
  // default: drift ÷ diffusion (|t-stat| of the trend)
  const sd = stdev(w, 0);
  if (!(sd > 0)) return NaN;
  return Math.abs(sum) / (sd * Math.sqrt(L));
}

// Build a `directionAt` selector for runTrendBasket. Keeps the top-half of
// trending currencies by quality (median split); zeroes the rest.
//   lookback : must match the basket's lookback (the trend/quality window)
//   measure  : 'driftDiffusion' (default) | 'fipID'
export function makeQualityDirection({ lookback = 252, measure = 'driftDiffusion' } = {}) {
  return function directionAt(iDec, ctx) {
    const { cols, ccys, rets } = ctx;
    const out = {};
    for (const c of ccys) out[c] = 0;
    if (iDec < lookback) return out;

    const info = [];
    for (const c of ccys) {
      const p = cols[c];
      const trend = (p[iDec] > 0 && p[iDec - lookback] > 0)
        ? Math.sign(p[iDec] / p[iDec - lookback] - 1) : 0;
      if (!trend) continue;
      const q = trendQualityScore(rets[c].slice(iDec - lookback + 1, iDec + 1), measure);
      if (Number.isFinite(q)) info.push({ c, trend, q });
    }
    // Too few trending names to split meaningfully — keep all their trends.
    if (info.length <= 2) { for (const x of info) out[x.c] = x.trend; return out; }

    const qs = info.map(x => x.q).sort((a, b) => a - b);
    const med = qs[Math.floor(qs.length / 2)];   // upper-median → keeps the sharper half
    for (const x of info) if (x.q >= med) out[x.c] = x.trend;
    return out;
  };
}
