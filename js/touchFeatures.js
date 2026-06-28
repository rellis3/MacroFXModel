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
 *   const f   = tf.compute({ bars, touchIdx, open, sigma, side, wt1, level, pip });
 *   // f = { approachER, approachVel, wtState, volClimax, candleReject, roundNum }
 *   //     each { value, bucket }
 *
 * Features (each maps a research mechanism to a price/volume proxy — test them in
 * the analyser's Drivers tab and KEEP ONLY what's significant + OOS, drop the rest):
 *   • approachER / approachVel — Crabel "the stretch": fast/overextended drive
 *     into the line → fade; slow grind → continue.
 *   • wtState — VuManChu/WaveTrend as the momentum-exhaustion proxy.
 *   • volClimax — tick-volume spike at the touch = exhaustion (fade). Needs the
 *     parquet volume col (now loaded). FX tick volume = activity proxy, not flow.
 *   • candleReject — touch-bar wick against the move = absorption/rejection (fade),
 *     full body through = acceptance (continue) — Market-Profile logic.
 *   • roundNum — Osler 2000/2003: reversals cluster AT round numbers (resting
 *     take-profits). Distance of the level to the nearest 50-pip figure.
 *
 * Reuses vumanchuCore for WaveTrend — never re-inlines the formula. No order-book
 * needed; all proxies are price+tick-volume. Pure, unit-tested in legoBricks.test.mjs.
 */

import { waveTrendSeries } from './vumanchuCore.js';

export const TOUCH_DEFAULTS = {
  erWin:  20,                 // bars into the line for Kaufman approach-efficiency
  velWin: 15,                 // bars for the approach-velocity leg
  erHigh: 0.50, erLow: 0.25,  // efficiency buckets: driven / mixed / choppy
  velFast: 0.60, velSlow: 0.25, // |Δ| over velWin in DAILY-σ units: spike / med / grind
  wt: { n1: 10, n2: 21, sp: 4 }, obLevel: 53, osLevel: -53,  // WaveTrend (VuManChu Cipher-B bands)
  volWin: 30,                 // bars for the touch-bar volume baseline
  climaxHi: 2.0, climaxLo: 0.6, // touch-bar volume ÷ trailing avg: surge / normal / quiet
  rejHi: 0.55, rejLo: 0.20,   // touch-bar wick-against-move ÷ range: reject / neutral / accept
  rnOnPips: 5, rnNearPips: 15, // distance of the level to the nearest 50-pip round number
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

// Touch-bar volume vs its trailing baseline (tick volume = FX activity proxy).
// A volume CLIMAX at the level = a buying/selling spike into it = exhaustion
// (fade-prone); a quiet touch = orderly (continuation-prone). Needs bar.volume
// (unlock the parquet col[4]); null when volume is absent/zero.
function volumeClimax({ bars, touchIdx }, cfg) {
  const w = cfg.volWin;
  if (!(touchIdx >= w)) return { value: null, bucket: null };
  let sum = 0, m = 0;
  for (let j = touchIdx - w; j < touchIdx; j++) { const v = bars[j].volume; if (v > 0) { sum += v; m++; } }
  const base = m ? sum / m : 0;
  const v0 = bars[touchIdx].volume;
  if (!(base > 0) || !(v0 > 0)) return { value: null, bucket: null };
  const ratio = v0 / base;
  const bucket = ratio >= cfg.climaxHi ? '3·surge' : ratio <= cfg.climaxLo ? '1·quiet' : '2·normal';
  return { value: +ratio.toFixed(3), bucket };
}

// Touch-bar candle shape: the wick AGAINST the move ÷ bar range. A long rejection
// wick (price poked the level and got pushed back) = absorption/rejection
// (fade-prone, Market-Profile "rejection"); a full body through = acceptance
// (continuation-prone).
function candleRejection({ bars, touchIdx, side }, cfg) {
  const b = bars[touchIdx];
  if (!b) return { value: null, bucket: null };
  const rng = b.high - b.low;
  if (!(rng > 1e-12)) return { value: null, bucket: null };
  const wick = side === 'up' ? b.high - Math.max(b.open, b.close)   // upper wick at an up-line
                             : Math.min(b.open, b.close) - b.low;   // lower wick at a down-line
  const frac = Math.max(0, wick) / rng;
  const bucket = frac >= cfg.rejHi ? '3·reject' : frac <= cfg.rejLo ? '1·accept' : '2·neutral';
  return { value: +frac.toFixed(3), bucket };
}

// Structural confluence (Osler 2000/2003): reversals cluster AT round numbers
// (resting take-profits), breakouts just beyond (stops). Distance of the LINE
// level to the nearest 50-pip round number, in pips. On-figure = fade-prone.
// Needs ctx.level + ctx.pip; null without them.
function roundNumber({ level, pip }, cfg) {
  if (!(level > 0) || !(pip > 0)) return { value: null, bucket: null };
  const inPips = level / pip;
  const nearest = Math.round(inPips / 50) * 50;          // nearest 50-pip (covers 00 and 50 figures)
  const dist = Math.abs(inPips - nearest);
  const bucket = dist <= cfg.rnOnPips ? '3·on-figure' : dist <= cfg.rnNearPips ? '2·near' : '1·off';
  return { value: +dist.toFixed(1), bucket };
}

export const TOUCH_FEATURES = {
  approachER:   { label: 'Approach efficiency', compute: approachEfficiency },
  approachVel:  { label: 'Approach velocity',   compute: approachVelocity },
  wtState:      { label: 'WaveTrend at touch',  compute: waveTrendExtension },
  volClimax:    { label: 'Volume climax',       compute: volumeClimax },
  candleReject: { label: 'Candle rejection',    compute: candleRejection },
  roundNum:     { label: 'Round-number prox',   compute: roundNumber },
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
