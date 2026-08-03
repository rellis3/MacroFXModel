/**
 * Cone Blend — combines Cone A (`forecastPathCore.intradayCone`, model-based)
 * and Cone B (`analogCone`, empirical/analog-matched) into one envelope.
 *
 * Method, precisely (so it isn't oversold as more than it is): QUANTILE
 * AVERAGING in log-return space — each cone's p50Dn/p50Up/p75Dn/p75Up/center
 * is converted to a log-return off the shared anchor, the two cones' matching
 * quantiles are combined with a weighted average, then exponentiated back.
 * This is "Vincentization" (forecast-combination literature), NOT a full
 * Bayesian mixture of the two underlying distributions — it is the practical,
 * assumption-light version of "weight cones by how well each has been doing
 * lately" discussed as the lightweight stand-in for full Bayesian model
 * averaging (which would need each cone as a proper likelihood + a fitted
 * marginal likelihood — machinery this repo doesn't have data to support yet).
 *
 * Weight fitting: walk forward through history, score each cone's own
 * envelope with pinball (quantile) loss against what actually happened —
 * the proper scoring rule for a quantile forecast, not just "did it contain
 * the outcome" (that alone rewards blowing the bands out wide). Smaller
 * trailing loss -> more blend weight, inverse-error softmax. The weight is
 * bucketed by Cone B's own (regime, volBucket) read — reusing the SAME
 * classification analogCone already computes, not a new regime axis — with
 * a global fallback when a bucket doesn't have enough graded windows yet
 * (the sample-starvation problem discussed before building this: a thin
 * bucket falls back rather than pretending a handful of windows is a
 * trustworthy weight).
 *
 * IS/OOS split is load-bearing, not optional (CLAUDE.md Lego Principle 5):
 * weights are fit on the FIRST `isFrac` of history; blendCalibration grades
 * everything — blend, Cone A alone, Cone B alone, and the naive floor — only
 * on the held-out remainder. A blend that only "wins" in-sample is not a
 * result here.
 *
 * Pure — no network, no DOM; unit-tested on synthetic data
 * (coneBlend.test.mjs).
 */
import { buildIntradayContext, intradayCone } from './forecastPathCore.js';
import { buildAnalogContext, analogCone } from './analogCone.js';
import { gradeCone, tallyGrades } from './coneCalibrationCore.js';

export const BLEND_DEFAULTS = {
  isFrac: 0.6,       // fraction of history used to FIT weights; the rest is graded OOS
  minBucketN: 15,     // graded windows a (regime, volBucket) needs before its own weight is trusted
  coneAOpts: {},      // passed through to buildIntradayContext
  coneBOpts: {},      // passed through to buildAnalogContext
};

const QUANTILES = ['p50Dn', 'p50Up', 'p75Dn', 'p75Up'];
// [tau, key] — tau is the quantile level implied by each band edge under a
// symmetric coverage claim (p50 band = 25th/75th pct, p75 band = 12.5th/87.5th).
const PINBALL_QS = [[0.25, 'p50Dn'], [0.75, 'p50Up'], [0.125, 'p75Dn'], [0.875, 'p75Up']];

function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }

// Average pinball loss of one cone's quantile lines against the REALIZED
// path over the window — the proper scoring rule for a quantile forecast
// (a too-wide band is penalized, not just credited for containing the
// outcome). Lower is better.
function _pinballLoss(bars, cone, i, H) {
  let loss = 0, n = 0;
  for (let h = 1; h <= H; h++) {
    const y = bars[i - 1 + h].close;
    const s = cone.steps[h - 1];
    for (const [tau, key] of PINBALL_QS) {
      const e = y - s[key];
      loss += e >= 0 ? tau * e : (tau - 1) * e;
      n++;
    }
  }
  return n ? loss / n : null;
}

function _bucketKey(regime, vol) { return `${regime}_${vol}`; }

function _weightFromErrors(errA, errB) {
  const mA = mean(errA), mB = mean(errB);
  const invA = 1 / Math.max(mA, 1e-12), invB = 1 / Math.max(mB, 1e-12);
  return invA / (invA + invB);
}

// Walk forward on NON-OVERLAPPING windows in [warmup, isEnd) and fit
// inverse-pinball-loss blend weights, globally and per (regime, volBucket)
// bucket. Returns a `fit` object consumed by `weightAFor`/`blendCalibration`.
// Pass `opts.ctxA`/`opts.ctxB` (prior buildIntradayContext/buildAnalogContext
// results for the SAME bars+opts) to skip rebuilding them — both are O(n) to
// O(n × volPctPeriod) and a caller that also needs them for a live cone
// would otherwise pay for the build 2-3x over in one page load.
export function fitBlendWeights(bars, H, opts = {}) {
  const o = { ...BLEND_DEFAULTS, ...opts };
  const n = bars.length;
  const isEnd = Math.floor(n * o.isFrac);

  const ctxA = opts.ctxA ?? buildIntradayContext(bars, o.coneAOpts);
  const ctxB = opts.ctxB ?? buildAnalogContext(bars, o.coneBOpts);

  const global = { errA: [], errB: [] };
  const buckets = new Map();

  for (let i = ctxB.warmup; i + H <= isEnd; i += H) {
    const a = intradayCone(ctxA, i, H);
    const b = analogCone(ctxB, i, H);
    if (!a || !b) continue;
    const errA = _pinballLoss(bars, a, i, H);
    const errB = _pinballLoss(bars, b, i, H);
    if (errA == null || errB == null) continue;
    global.errA.push(errA); global.errB.push(errB);
    const key = _bucketKey(b.target.regime, b.target.vol);
    if (!buckets.has(key)) buckets.set(key, { errA: [], errB: [] });
    buckets.get(key).errA.push(errA);
    buckets.get(key).errB.push(errB);
  }

  const globalWeightA = global.errA.length ? _weightFromErrors(global.errA, global.errB) : 0.5;
  const bucketWeights = new Map();
  for (const [key, e] of buckets) {
    bucketWeights.set(key, e.errA.length >= o.minBucketN ? _weightFromErrors(e.errA, e.errB) : null);
  }

  return {
    isEnd, globalWeightA, bucketWeights,
    minBucketN: o.minBucketN, nGlobal: global.errA.length,
    nBuckets: buckets.size, nTrustedBuckets: [...bucketWeights.values()].filter(w => w != null).length,
  };
}

// weightA for a live query — the bucket weight if that (regime, volBucket)
// has enough graded history, else the global fallback.
export function weightAFor(fit, regime, vol) {
  const w = fit.bucketWeights.get(_bucketKey(regime, vol));
  return w != null ? w : fit.globalWeightA;
}

// Combine two envelopes (same shape: {anchor, anchorTime, steps:[{h,time,
// center,p50Dn,p50Up,p75Dn,p75Up}]}) into one, quantile-averaging in
// log-return space off the shared anchor. Requires the same anchor (both
// cones must be built from the same bars/anchor index) — returns whichever
// cone is present if the other is missing, null if both are.
export function blendCones(coneA, coneB, weightA) {
  if (!coneA && !coneB) return null;
  if (!coneA) return coneB;
  if (!coneB) return coneA;
  const wA = Math.min(1, Math.max(0, weightA)), wB = 1 - wA;
  const anchor = coneA.anchor;
  const H = Math.min(coneA.steps.length, coneB.steps.length);

  const steps = [];
  for (let h = 1; h <= H; h++) {
    const sa = coneA.steps[h - 1], sb = coneB.steps[h - 1];
    const blendKey = key => anchor * Math.exp(wA * Math.log(sa[key] / anchor) + wB * Math.log(sb[key] / anchor));
    const step = { h, time: sa.time, center: blendKey('center') };
    for (const key of QUANTILES) step[key] = blendKey(key);
    steps.push(step);
  }
  return { anchorTime: coneA.anchorTime, anchor, weightA: wA, weightB: wB, steps };
}

// Weights fit on [warmup, isEnd); everything graded here is OUT-OF-SAMPLE —
// blend vs Cone A alone vs Cone B alone vs the naive (unconditional analog)
// floor, over [isEnd, end). Per CLAUDE.md: a blend that only wins in-sample
// is not a result. Pass `opts.fit` (a prior fitBlendWeights(bars, H, opts)
// result) and/or `opts.ctxA`/`opts.ctxB` to skip re-fitting / rebuilding when
// the caller already has them for the same (bars, H, opts) — e.g. a live
// page that also needs the fit and contexts for its own live cone and would
// otherwise pay for the walk-forward fit and the contexts 2-3x over per load.
export function blendCalibration(bars, H, opts = {}) {
  const o = { ...BLEND_DEFAULTS, ...opts };
  const fit = opts.fit ?? fitBlendWeights(bars, H, o);
  const n = bars.length;

  const ctxA = opts.ctxA ?? buildIntradayContext(bars, o.coneAOpts);
  const ctxB = opts.ctxB ?? buildAnalogContext(bars, o.coneBOpts);

  const blendWs = [], aWs = [], bWs = [];
  const oosStart = Math.max(fit.isEnd, ctxB.warmup);
  for (let i = oosStart; i + H <= n; i += H) {
    const a = intradayCone(ctxA, i, H);
    const b = analogCone(ctxB, i, H);
    if (!a || !b) continue;
    const wA = weightAFor(fit, b.target.regime, b.target.vol);
    const blend = blendCones(a, b, wA);
    blendWs.push(gradeCone(bars, blend, i, H));
    aWs.push(gradeCone(bars, a, i, H));
    bWs.push(gradeCone(bars, b, i, H));
  }

  return {
    horizonBars: H, isEnd: fit.isEnd, oosStart, oosWindows: blendWs.length,
    fit: { globalWeightA: fit.globalWeightA, nGlobal: fit.nGlobal,
           nBuckets: fit.nBuckets, nTrustedBuckets: fit.nTrustedBuckets },
    claimed: { p50: 0.5, p75: 0.75, direction: 0.5 },
    blend: tallyGrades(blendWs, H), coneA: tallyGrades(aWs, H), coneB: tallyGrades(bWs, H),
    note: 'Weights fit on [0, isEnd) only; blend/coneA/coneB are all graded OOS on [oosStart, end). ' +
          'The blend only earns its complexity if it beats BOTH individual cones OOS, not just in-sample.',
  };
}
