/**
 * Day-Type Core — the reversion-vs-continuation classifier as ONE reusable lego
 * brick. Single source of truth for "trend-day-ness": the estimate of today's
 * intraday signal-to-noise ratio, drift ÷ diffusion (per REVERSION_CONTINUATION_
 * CONCEPT.md). High score → drift-dominated → continuation (follow). Low score →
 * driftless range → mean-revert (fade).
 *
 * Why a separate module
 *   The forecaster (forecastCore.js) had this baked inline, which married the
 *   classifier to one strategy family. Lifting it out makes it a brick the
 *   forecaster AND any future system (gold bot, regime engines, the live bots)
 *   import — never copy. One classifier, one place, no drift between callers.
 *
 * The lego design
 *   • One quantity, many estimators. Every estimator below approximates the SAME
 *     drift/diffusion ratio. They are NOT independent filters stacked to inflate
 *     win rate — blending estimators of one quantity is principled; stacking
 *     unrelated gates is the overfitting trap (see SYSTEM_ASSESSMENT.md §2.5).
 *   • Plug / unplug, don't rewrite. Estimators live in ESTIMATORS keyed by name;
 *     a preset is just a {name: weight} map. Snap one in or out by editing the
 *     weights — callers never change.
 *   • Uniform context. Every estimator reads the same `ctx`
 *     ({ closes, highs, lows, idx, win }) so a new brick can't invent its own
 *     input shape. Estimators needing data they don't have return 0.5 (neutral).
 *   • Horizon-agnostic & no lookahead. `idx` is "predict window i"; estimators
 *     only read data strictly before `idx`. Daily/weekly/20-day pass their own
 *     per-horizon closes through the same code path.
 *   • Output is a score, the selector is the brain. This brick returns T ∈ [0,1]
 *     (+ a coarse label). Mapping T → an actual trade lives in each system's own
 *     selector (e.g. forecastCore.selectStrategy) — knobs stay out of here.
 */

// ── Small numeric helpers ────────────────────────────────────────────────────
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const variance = a => { const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length || 1); };

// ── Estimator registry ───────────────────────────────────────────────────────
// Each estimator: (ctx) => number in [0,1]. 1 = trend/continuation, 0 = chop/revert,
// 0.5 = neutral / insufficient data. All read ctx.closes (and optionally highs/lows)
// using ONLY indices < ctx.idx. Add a new brick by adding one entry here.
export const ESTIMATORS = {
  // Kaufman Efficiency Ratio: net move ÷ Σ|moves| over the last `win` closes.
  // ≈1 clean directional trend (follow), ≈0 round-trip chop (fade).
  efficiencyRatio({ closes, idx, win }) {
    if (idx < win + 1) return 0.5;
    const a = closes[idx - 1], b = closes[idx - 1 - win];
    let sumAbs = 0;
    for (let j = idx - win; j < idx; j++) sumAbs += Math.abs(closes[j] - closes[j - 1]);
    return sumAbs > 1e-12 ? clamp01(Math.abs(a - b) / sumAbs) : 0;
  },

  // Variance Ratio VR(2) (Lo & MacKinlay 1988): var(2-step) / (2·var(1-step)).
  // >1 persistence/trend, ≈1 random walk, <1 mean-reverting. Mapped 0.5→0, 1.5→1.
  varianceRatio({ closes, idx, win }) {
    if (idx < win + 2) return 0.5;
    const r1 = [], r2 = [];
    for (let j = idx - win; j < idx; j++) r1.push(Math.log(closes[j] / closes[j - 1]));
    for (let j = idx - win; j < idx - 1; j++) r2.push(Math.log(closes[j + 1] / closes[j - 1]));
    const v1 = variance(r1), v2 = variance(r2);
    const vr = v1 > 1e-18 ? v2 / (2 * v1) : 1;
    return clamp01((vr - 0.5) / 1.0);
  },

  // Hurst exponent via rescaled-range (R/S) on log returns. H>0.5 persists
  // (trend), H<0.5 reverts. Mapped 0.4→0, 0.6→1 (the tradable band around 0.5).
  hurst({ closes, idx, win }) {
    if (idx < win + 1) return 0.5;
    const r = [];
    for (let j = idx - win; j < idx; j++) r.push(Math.log(closes[j] / closes[j - 1]));
    const m = mean(r);
    let cum = 0, min = 0, max = 0, sd = 0;
    for (const x of r) { cum += x - m; if (cum < min) min = cum; if (cum > max) max = cum; sd += (x - m) ** 2; }
    sd = Math.sqrt(sd / r.length);
    const range = max - min;
    if (sd < 1e-18 || range < 1e-18) return 0.5;
    const H = Math.log(range / sd) / Math.log(r.length);
    return clamp01((H - 0.4) / 0.2);
  },

  // Drift t-stat: mean return ÷ (stdev / √n) over the window — the direct
  // signal-to-noise readout. |t| large ⇒ drift dominates noise ⇒ trend.
  driftTStat({ closes, idx, win }) {
    if (idx < win + 1) return 0.5;
    const r = [];
    for (let j = idx - win; j < idx; j++) r.push(Math.log(closes[j] / closes[j - 1]));
    const sd = Math.sqrt(variance(r));
    if (sd < 1e-18) return 0.5;
    const t = Math.abs(mean(r)) / (sd / Math.sqrt(r.length));
    return clamp01(t / 2.5);   // |t|≈2.5 (~95% one-sided) → fully trend
  },

  // Range budget consumed at the tag: realized H-L ÷ forecast H-L when the band
  // is touched. Low budget spent yet already at the band ⇒ something is driving
  // it ⇒ trend. Needs ctx.realizedRangeFrac & ctx.forecastRangeFrac; else neutral.
  rangeBudget({ realizedRangeFrac, forecastRangeFrac }) {
    if (!(forecastRangeFrac > 1e-12) || realizedRangeFrac == null) return 0.5;
    const budget = realizedRangeFrac / forecastRangeFrac;   // 0..~1 at the band
    return clamp01(1 - budget);   // less budget used → more trend-like
  },
};

// ── Presets (plug/unplug = edit a weight map) ────────────────────────────────
// `default` reproduces the forecaster's original inline score (ER 0.6 / VR 0.4)
// bit-for-bit, so lifting the brick out changes no backtest number. The richer
// presets are opt-in for systems that have proven they help OOS.
export const DAYTYPE_PRESETS = {
  default:  { efficiencyRatio: 0.6, varianceRatio: 0.4 },
  balanced: { efficiencyRatio: 0.4, varianceRatio: 0.3, hurst: 0.15, driftTStat: 0.15 },
  closesOnly: { efficiencyRatio: 0.35, varianceRatio: 0.25, hurst: 0.2, driftTStat: 0.2 },
};

// ── The classifier ───────────────────────────────────────────────────────────
// Blends the enabled estimators (weighted, renormalised) into:
//   T       ∈ [0,1]   — trend-day-ness (0 = chop/fade, 1 = strong trend/follow)
//   signedT ∈ [-1,+1] — the SAME signal re-centred on zero: sign = action
//                       (−ve → fade, +ve → follow), magnitude = strength/lean.
//                       signedT = (T − 0.5) × 2. It is a directional LEAN, NOT a
//                       calibrated probability — magnitude ≠ P(win). Near 0 = no
//                       lean (stand aside).
// `ctx` must carry closes + idx; win/weights are optional.
//   classifyDayType({ closes, idx, win, highs, lows, ... }, { weights, bands })
export function classifyDayType(ctx, cfg = {}) {
  const weights = cfg.weights ?? DAYTYPE_PRESETS.default;
  const win = ctx.win ?? cfg.win ?? 14;
  const c = { ...ctx, win };
  const components = {};
  let num = 0, den = 0;
  for (const [name, w] of Object.entries(weights)) {
    const fn = ESTIMATORS[name];
    if (!fn || !(w > 0)) continue;
    const v = fn(c);
    components[name] = v;
    num += w * v; den += w;
  }
  const T = den > 0 ? +(num / den).toFixed(4) : 0.5;
  const signedT = +((T - 0.5) * 2).toFixed(4);   // [-1,+1]: −fade / +follow, |.| = lean
  const { rangeMax = 0.30, trendMin = 0.55 } = cfg.bands ?? {};
  const label = T < rangeMax ? 'RANGE' : T < trendMin ? 'MIXED' : 'TREND';
  return { T, signedT, label, components };
}

// ── Realized outcome label (the ground truth the score is graded against) ────
// The SCORE (above) predicts trend-day-ness BEFORE the window. This LABEL measures
// what the window ACTUALLY did, so analyses can ask "did a stronger lean mean more
// often right?" (the day-type AUC/reliability test). Like ESTIMATORS, the labelers
// are named and pluggable so every system grades against the SAME definition —
// never an inline re-spin (CLAUDE.md Lego Principle #1).
//
// ctx = { open, close, high, low, ocMedFrac, hl50Frac }  (fracs = forecast band
// distances as a fraction of price, from computeBands). Returns 'CONTINUATION' |
// 'REVERSION' | null (insufficient inputs).
export const OUTCOME_LABELERS = {
  // DEFAULT. Close finished beyond the MEDIAN close displacement → the day pushed
  // through (continuation); within → it round-tripped (reversion). ~50/50 by
  // construction (ocMed IS the median |close−open|), so the grade isn't starved —
  // this is the fix for the old hl50 label that fired only ~12% of the time.
  closeVsOcMed: ({ open, close, ocMedFrac }) =>
    (open > 0 && ocMedFrac > 0)
      ? (Math.abs(close - open) / open > ocMedFrac ? 'CONTINUATION' : 'REVERSION')
      : null,

  // Strict: close beyond the projected median high/low (~1.5σ). Rare (~12%) — a
  // strong trend-through only. Kept for reference / back-compat with the brief.
  closeVsHl50: ({ open, close, hl50Frac }) =>
    (open > 0 && hl50Frac > 0)
      ? (Math.abs(close - open) / open > hl50Frac ? 'CONTINUATION' : 'REVERSION')
      : null,

  // Realized single-day efficiency: net move ÷ traversed range. The realized twin
  // of the Efficiency-Ratio estimator. >thresh ⇒ the day went somewhere (trend).
  dayEfficiency: ({ open, high, low, close, effThresh = 0.5 }) => {
    const rng = high - low;
    return rng > 0 ? (Math.abs(close - open) / rng > effThresh ? 'CONTINUATION' : 'REVERSION') : null;
  },
};
export const DEFAULT_OUTCOME = 'closeVsOcMed';

// Label one window's realized behaviour. `def` selects the labeler (default =
// the balanced close-vs-median rule); pass extra fields (e.g. effThresh) on ctx.
export function labelOutcome(ctx, def = DEFAULT_OUTCOME) {
  const fn = OUTCOME_LABELERS[def] ?? OUTCOME_LABELERS[DEFAULT_OUTCOME];
  return fn(ctx);
}

// ── Backward-compatible thin wrapper ─────────────────────────────────────────
// Preserves the original forecastCore signature & numbers. Existing callers keep
// `dayTypeScore(closes, idx, win)`; the forecaster re-exports this verbatim.
export function dayTypeScore(closes, idx, win = 14, cfg = {}) {
  return classifyDayType({ closes, idx, win }, cfg).T;
}
