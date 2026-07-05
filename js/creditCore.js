// ── creditCore.js ─────────────────────────────────────────────────────────────
// One shared definition of the corporate-credit-spread ("credit-Greeks") feature
// set + the risk-appetite gate. Pure: takes plain number arrays in, returns a
// plain object out — no DOM, no network, no globals. Imported by the dashboard
// (today.html credit gate), and the intended predictor brick for the
// credit-Δ→NQ-vol backtest and any bot gate, so the definition can't drift.
//
// Design & rationale: docs/CREDIT_SIGNAL_SPEC.md. Everything is change/percentile
// based, so the slow (persistent) liquidity premium in the OAS *level* washes out
// — OAS strips optionality, not liquidity, and for a daily gate you don't need to
// isolate it.
//
// Series convention: arrays are OLDEST → NEWEST, in percentage points (so an ICE
// BofA HY OAS of 3.34 = 334 bps). Missing history degrades gracefully to nulls.

import { rollingPercentile } from './statsCore.js';

const bp = pp => Math.round(pp * 100);                 // percentage-points → bps
const last = a => (a && a.length ? a[a.length - 1] : null);
const at = (a, backFromEnd) => (a && a.length > backFromEnd ? a[a.length - 1 - backFromEnd] : null);

// ── Feature vector ────────────────────────────────────────────────────────────
// hySeries : number[]  — HY OAS history (oldest→newest), pct-points
// opts:
//   nowValue    : latest level if fresher than the series tail (e.g. today's print)
//   prevValue   : the level before nowValue (for the 1-day change)
//   pctWindow   : lookback for the position percentile (default: full history)
//   cccSeries/bbSeries or cccNow/cccPrev/bbNow/bbPrev — for the CCC−BB quality spread
//
// Returns null if there isn't enough to say anything; otherwise the feature object.
export function creditFeatures(hySeries, opts = {}) {
  const hist = (hySeries ?? []).filter(v => v != null && Number.isFinite(v));
  const level = opts.nowValue != null ? opts.nowValue : last(hist);
  if (level == null) return null;

  // POSITION — percentile of the level within its own trailing window.
  let pct = null;
  const win = opts.pctWindow && opts.pctWindow < hist.length ? opts.pctWindow : hist.length;
  if (win >= 20) {
    // include the (possibly fresher) level as the point being ranked
    const series = opts.nowValue != null ? [...hist.slice(-win + 1), level] : hist.slice(-win);
    const p = rollingPercentile(series, series.length);
    pct = Number.isFinite(p[p.length - 1]) ? Math.round(p[p.length - 1]) : null;
  }

  // VELOCITY — 1d / 5d / 20d change in bps.
  const prev = opts.prevValue != null ? opts.prevValue : at(hist, 1);
  const d1 = prev != null ? bp(level - prev) : null;
  const d5 = hist.length >= 6 ? bp(level - at(hist, 5)) : null;
  const d20 = hist.length >= 21 ? bp(level - at(hist, 20)) : null;

  // ACCELERATION — is the ~5d pace increasing? Smoothed 2nd difference, sign only.
  let accel = 0;
  if (hist.length >= 11) {
    const slopeNow = at(hist, 0) - at(hist, 5);
    const slopePrev = at(hist, 5) - at(hist, 10);
    const dd = slopeNow - slopePrev;
    accel = Math.abs(dd) < 0.03 ? 0 : (dd > 0 ? 1 : -1);   // +1 widening-faster, −1 easing-faster
  }

  // PERSISTENCE ("theta") — consecutive days on the current side of the 20d average.
  let daysInRegime = 0, aboveAvg = null;
  if (hist.length >= 21) {
    const ma = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    aboveAvg = level > ma(hist.slice(-20));
    for (let i = hist.length - 1; i >= 19; i--) {
      const m = ma(hist.slice(i - 19, i + 1));
      if ((hist[i] > m) === aboveAvg) daysInRegime++; else break;
    }
  }

  // QUALITY — CCC − BB decompression (the sharpest, earliest risk-appetite tell).
  const cccNow = opts.cccNow != null ? opts.cccNow : last(opts.cccSeries);
  const bbNow = opts.bbNow != null ? opts.bbNow : last(opts.bbSeries);
  const cccPrev = opts.cccPrev != null ? opts.cccPrev : at(opts.cccSeries, 1);
  const bbPrev = opts.bbPrev != null ? opts.bbPrev : at(opts.bbSeries, 1);
  const quality = (cccNow != null && bbNow != null) ? bp(cccNow - bbNow) : null;
  const qualityPrev = (cccPrev != null && bbPrev != null) ? bp(cccPrev - bbPrev) : null;
  const qualityDir = (quality != null && qualityPrev != null) ? Math.sign(quality - qualityPrev) : 0;

  // DIRECTION over the meaningful (5d) horizon, falling back to 1d. Small dead-band.
  const wideningBps = d5 != null ? d5 : (d1 != null ? d1 : 0);
  const widening = wideningBps > 3 ? 1 : wideningBps < -3 ? -1 : 0;

  return { levelBps: bp(level), level, pct, d1, d5, d20, accel,
    daysInRegime, aboveAvg, quality, qualityDir, wideningBps, widening };
}

// ── Gate ──────────────────────────────────────────────────────────────────────
// Turns the features into a RISK-ON / NEUTRAL / CAUTION / RISK-OFF verdict.
// Widening + (accelerating OR stretched level) = risk-off; widening = caution;
// tightening from a non-stretched level = risk-on; else neutral.
export function creditGateFromFeatures(f, { stressPct = 80, stressBps = 450 } = {}) {
  if (!f) return null;
  const stressedLvl = (f.pct != null && f.pct >= stressPct) || f.levelBps > stressBps;
  let gate, cls;
  if (f.widening > 0 && (f.accel > 0 || stressedLvl)) { gate = 'RISK-OFF'; cls = 'off'; }
  else if (f.widening > 0)                            { gate = 'CAUTION'; cls = 'mix'; }
  else if (f.widening < 0 && !stressedLvl)            { gate = 'RISK-ON'; cls = 'on'; }
  else                                                { gate = 'NEUTRAL'; cls = 'mix'; }
  return { gate, cls, stressedLvl };
}

// Convenience: features + gate in one call.
export function creditGate(hySeries, opts = {}) {
  const f = creditFeatures(hySeries, opts);
  if (!f) return null;
  return { ...f, ...creditGateFromFeatures(f, opts) };
}
