/**
 * At-the-moment TOUCH FEATURES — what the intraday approach into a forecast line
 * looked like at the instant price tagged it, for testing fade-vs-continuation.
 *
 * The day-type score (pre-day, from daily closes) was proven NOT to predict
 * fade-vs-follow (AUC ~0.50). The edge, if any, is in the *at-the-moment* state —
 * the analyser's range-budget driver already shows this. These features extend
 * that idea with the intraday character of the approach.
 *
 * Configurable lego brick — set config at import (per the house pattern):
 *   import { createTouchFeatures } from './touchFeatures.js';
 *   const tf = createTouchFeatures({ erWin: 20, velWin: 15 });
 *   const wt1 = tf.wtSeries(bars);                       // once per window (causal)
 *   const f   = tf.compute({ bars, touchIdx, open, sigma, side, wt1 });
 *   // f = { approachER:{value,bucket}, approachVel:{…}, wtState:{…} }
 *
 * Research basis (REVERSION_CONTINUATION_CONCEPT.md): Crabel "the stretch"
 * (fast/overextended approach → fade), Osler 2000/2003 (order-cluster reversals
 * at FX levels), Gao-Han-Li-Zhou 2018 intraday momentum (persistent flow →
 * continue), and VuManChu/WaveTrend as the order-flow-exhaustion proxy.
 *
 * Reuses the vumanchuCore brick for WaveTrend — never re-inlines the formula.
 * Pure, no network, unit-tested in js/legoBricks.test.mjs.
 */

import { waveTrendSeries } from './vumanchuCore.js';

export const TOUCH_DEFAULTS = {
  erWin:  20,                 // bars into the line for Kaufman approach-efficiency
  velWin: 15,                 // bars for the approach-velocity leg
  erHigh: 0.50, erLow: 0.25,  // efficiency buckets: driven / mixed / choppy
  velFast: 0.60, velSlow: 0.25, // |Δ| over velWin in DAILY-σ units: spike / med / grind
  wt: { n1: 10, n2: 21, sp: 4 }, obLevel: 53, osLevel: -53,  // WaveTrend (VuManChu Cipher-B bands)
};

// ── Feature computers: (ctx, cfg) → { value, bucket } ────────────────────────
// ctx = { bars, touchIdx, open, sigma(daily frac), side('up'|'dn'), wt1? }.
// Insufficient inputs → { value:null, bucket:null } (the bucket is then dropped
// from the slice, so it never pollutes an aggregate).

// Kaufman efficiency of the last `erWin` bars INTO the line: net move ÷ path
// length. ≈1 = a clean drive into the level (continuation-prone); ≈0 = a choppy
// grind (fade-prone). The realized twin of the day-type Efficiency-Ratio.
function approachEfficiency({ bars, touchIdx }, cfg) {
  const w = cfg.erWin;
  if (!(touchIdx >= w)) return { value: null, bucket: null };
  let sumAbs = 0;
  for (let j = touchIdx - w + 1; j <= touchIdx; j++) sumAbs += Math.abs(bars[j].close - bars[j - 1].close);
  const net = Math.abs(bars[touchIdx].close - bars[touchIdx - w].close);
  const er  = sumAbs > 1e-12 ? net / sumAbs : 0;
  const bucket = er >= cfg.erHigh ? '3·driven' : er <= cfg.erLow ? '1·choppy' : '2·mixed';
  return { value: +er.toFixed(4), bucket };
}

// Speed of the approach: |move| over the last `velWin` bars, in DAILY-σ units.
// A fast spike into the line = overextension (fade-prone, Crabel's "stretch"); a
// slow grind = orderly (continuation-prone).
function approachVelocity({ bars, touchIdx, open, sigma }, cfg) {
  const w = cfg.velWin;
  if (!(touchIdx >= w) || !(open > 0) || !(sigma > 0)) return { value: null, bucket: null };
  const ret  = Math.abs(bars[touchIdx].close - bars[touchIdx - w].close) / open;
  const vSig = ret / sigma;
  const bucket = vSig >= cfg.velFast ? '3·spike' : vSig <= cfg.velSlow ? '1·grind' : '2·med';
  return { value: +vSig.toFixed(4), bucket };
}

// WaveTrend (momentum) at the touch, read in the touch's direction. 'extended' =
// stretched WITH the move (overbought at an up-line / oversold at a down-line) =
// the VuManChu exhaustion read → fade-prone. 'counter' = momentum already against
// the move. wt1 is the precomputed (causal) series; index at touchIdx is lookahead-free.
function waveTrendExtension({ wt1, touchIdx, side }, cfg) {
  const v = wt1?.[touchIdx];
  if (v == null || !Number.isFinite(v)) return { value: null, bucket: null };
  const up = side === 'up';
  const extended = up ? v >= cfg.obLevel : v <= cfg.osLevel;
  const counter  = up ? v <= cfg.osLevel : v >= cfg.obLevel;
  const bucket = extended ? '3·extended' : counter ? '1·counter' : '2·neutral';
  return { value: +v.toFixed(3), bucket };
}

export const TOUCH_FEATURES = {
  approachER:  { label: 'Approach efficiency', compute: approachEfficiency },
  approachVel: { label: 'Approach velocity',   compute: approachVelocity },
  wtState:     { label: 'WaveTrend at touch',  compute: waveTrendExtension },
};

// Factory — set config at import, get a configured computer. Mirrors the
// createLevelChart / preset pattern (config lives on the instance, not globals).
export function createTouchFeatures(userCfg = {}) {
  const cfg = { ...TOUCH_DEFAULTS, ...userCfg, wt: { ...TOUCH_DEFAULTS.wt, ...(userCfg.wt || {}) } };
  return {
    cfg,
    // Compute the WaveTrend series ONCE per window; index it at each touch. EMA is
    // causal so wt1[touchIdx] uses only data ≤ touchIdx (no lookahead).
    wtSeries: bars => waveTrendSeries(bars, cfg.wt),
    compute(ctx) {
      const out = {};
      for (const [id, f] of Object.entries(TOUCH_FEATURES)) out[id] = f.compute(ctx, cfg);
      return out;
    },
  };
}
