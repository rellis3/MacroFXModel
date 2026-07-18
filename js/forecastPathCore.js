/**
 * Forecast Path Core — the cone / replay / sample-path brick behind
 * forecast-path.html. Turns a D1 history into, for any date i:
 *
 *   • an analytic forecast CONE — drift path + P50/P75 close-displacement
 *     envelopes for the next H days, from the SAME vol math as the live
 *     forecaster (volSigmaSeries → computeBands, imported, never copied); the
 *     per-step band is just computeBands at σ√h (horizon-agnostic scaling,
 *     Lego Principle 3);
 *   • Monte-Carlo SAMPLE PATHS — N simulated candle sequences drawn from that
 *     same drift+σ claim (seeded, deterministic). Their per-step median is the
 *     "most agreed path". Candle wicks are COSMETIC (sized to the Feller median
 *     daily range) — the model predicts a distribution, not wick shapes;
 *   • a CALIBRATION TALLY — sweep the cone across history on non-overlapping
 *     windows and count how often the realized close landed inside what the
 *     cone claimed (P50 → 50%, P75 → 75%), plus the drift-direction hit rate
 *     vs the 50% coin-flip benchmark. This is the falsification half: the cone
 *     is only worth drawing if these come back near their claims.
 *
 * Honest scope: the DRIFT is an EWMA of past daily log-returns (capped at
 * ±0.5σ/day so a streak can't draw an absurd cone) and the trend score is the
 * replicated multi-lookback momentum sign (trendFollowEngine.momentumSignal).
 * Direction is expected to be barely better than a coin flip in FX — the tally
 * says so out loud rather than letting the picture oversell it.
 *
 * No lookahead: everything used for window i (σ, drift, trend score) reads
 * data STRICTLY before bar i. σ comes from volSigmaSeries (contract: out[i]
 * predicts bar i from data < i); drift/trend read closes[0..i-1] only.
 * Pure — no network, no DOM; unit-tested on synthetic data
 * (forecastPathCore.test.mjs).
 */

import { volSigmaSeries, nextSigma, computeBands, HORIZONS } from './forecastCore.js';
import { momentumSignal } from './trendFollowEngine.js';

export const PATH_DEFAULTS = {
  horizonDays: 10,     // steps ahead to draw / grade
  assetClass: 'fx',
  driftLambda: 0.97,   // EWMA decay for the drift estimate (~33-day half-life)
  driftCapSigma: 0.5,  // |drift per day| capped at this × daily σ
  nPaths: 40,          // Monte-Carlo sample paths
  seed: 42,            // deterministic path RNG
  warmup: 300,         // first index eligible for a cone (σ + momentum history)
};

// ── Context: one pass over the bars, reusable for every i ────────────────────
// sigma[i] predicts bar i (data < i, volSigmaSeries contract). drift[i] and
// trend[i] are ALREADY LAGGED to be usable at i: they read closes[0..i-1].
export function buildForecastContext(bars, opts = {}) {
  const o = { ...PATH_DEFAULTS, ...opts };
  const n = bars.length;
  const closes = bars.map(b => b.close);

  const sigma = volSigmaSeries(bars, o.assetClass);

  // EWMA drift of daily log-returns. ew[j] summarises returns up to j; the
  // return ending at bar j is r[j] = ln(c[j]/c[j-1]), so drift usable at i is
  // ew[i-1] (reads closes ≤ i-1 only).
  const drift = new Float64Array(n);
  { let ew = 0, seen = 0;
    for (let j = 1; j < n; j++) {
      const r = Math.log(closes[j] / closes[j - 1]);
      ew = seen === 0 ? r : o.driftLambda * ew + (1 - o.driftLambda) * r;
      seen++;
      if (j + 1 < n) drift[j + 1] = ew;
    } }

  // momentumSignal[j] uses closes up to and including j → lag one bar.
  const mom = momentumSignal(closes);
  const trend = new Float64Array(n);
  for (let i = 1; i < n; i++) trend[i] = mom[i - 1];

  return { bars, closes, sigma, drift, trend, opts: o };
}

// Next weekday after a 'YYYY-MM-DD' date (for cone steps beyond the last bar —
// Lightweight-Charts business-day strings; weekends skipped, holidays ignored).
export function nextWeekday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().substring(0, 10);
}

const _dateOf = b => (typeof b.time === 'string' ? b.time : b.date);

// ── The cone at index i (1 ≤ i ≤ bars.length) ────────────────────────────────
// Steps h=1..H forecast bars[i], bars[i+1], … Anchor = close of bar i-1.
// i === bars.length is the LIVE cone (past the end of history, σ via nextSigma).
export function coneFromContext(ctx, i, horizonDays) {
  const { bars, sigma, drift, trend, opts } = ctx;
  const H = horizonDays ?? opts.horizonDays;
  const n = bars.length;
  if (i < 2 || i > n) return null;

  const anchor = bars[i - 1].close;
  const sig = i < n ? sigma[i] : nextSigma(bars, opts.assetClass);
  if (!(sig > 0)) return null;
  const muRaw = drift[i === n ? n - 1 : i] ?? 0;   // at i===n, ew through the last return
  const mu = Math.max(-opts.driftCapSigma * sig, Math.min(opts.driftCapSigma * sig, i === n ? _liveDrift(ctx) : muRaw));

  const steps = [];
  let lastDate = _dateOf(bars[i - 1]);
  for (let h = 1; h <= H; h++) {
    const center = anchor * Math.exp(mu * h);
    const b = computeBands(center, sig * Math.sqrt(h), opts.assetClass);
    const date = i + h - 1 < n ? _dateOf(bars[i + h - 1]) : (lastDate = nextWeekday(lastDate));
    if (i + h - 1 < n) lastDate = date;
    steps.push({ h, date, center, p50Up: b.ocUp, p50Dn: b.ocDn,
                 p75Up: center * (1 + b.oc75), p75Dn: center * (1 - b.oc75) });
  }
  return { i, anchorDate: _dateOf(bars[i - 1]), anchor, sigma: sig, mu,
           trendScore: i === n ? momentumSignal(ctx.closes)[n - 1] : trend[i], steps };
}

// Live drift (i === n): EWMA through the final return, same recursion as ctx.
function _liveDrift(ctx) {
  const { closes, opts } = ctx;
  let ew = 0, seen = 0;
  for (let j = 1; j < closes.length; j++) {
    const r = Math.log(closes[j] / closes[j - 1]);
    ew = seen === 0 ? r : opts.driftLambda * ew + (1 - opts.driftLambda) * r;
    seen++;
  }
  return ew;
}

// Convenience one-shot (page hot path uses the context form).
export function forecastCone(bars, i, opts = {}) {
  return coneFromContext(buildForecastContext(bars, opts), i, opts.horizonDays);
}

// ── Seeded RNG (mulberry32) + Box-Muller normal ──────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── Monte-Carlo sample paths from the cone's own claim ───────────────────────
// Each path: H candles, close-to-close return ~ N(mu, sigma) per day. Wicks are
// cosmetic: each bar's total range is padded toward the Feller MEDIAN daily
// range (computeBands hl50 at the anchor σ), the pad split randomly between
// top and bottom wick. Deterministic for a given seed.
// Returns { paths: [ [ {h,date,open,high,low,close} … ] ], consensus: [ {h,date,close} … ] }.
export function samplePaths(ctx, i, horizonDays, opts = {}) {
  const cone = coneFromContext(ctx, i, horizonDays);
  if (!cone) return { paths: [], consensus: [] };
  const o = { ...ctx.opts, ...opts };
  const { anchor, sigma, mu, steps } = cone;
  const medRangeFrac = computeBands(anchor, sigma, o.assetClass).hl50;  // median daily H-L (fraction)
  const rng = mulberry32(o.seed);

  const paths = [];
  for (let p = 0; p < o.nPaths; p++) {
    let prev = anchor;
    const path = [];
    for (const s of steps) {
      const close = prev * Math.exp(mu + sigma * gauss(rng));
      const open = prev;
      const bodyHi = Math.max(open, close), bodyLo = Math.min(open, close);
      const pad = Math.max(0, anchor * medRangeFrac - (bodyHi - bodyLo));
      const u = rng();
      path.push({ h: s.h, date: s.date, open, close,
                  high: bodyHi + pad * u, low: bodyLo - pad * (1 - u) });
      prev = close;
    }
    paths.push(path);
  }

  const consensus = steps.map((s, k) => {
    const cs = paths.map(p => p[k].close).sort((a, b) => a - b);
    const m = cs.length >> 1;
    return { h: s.h, date: s.date, close: cs.length % 2 ? cs[m] : (cs[m - 1] + cs[m]) / 2 };
  });
  return { paths, consensus };
}

// ── Calibration tally — does reality land where the cone claims? ─────────────
// Non-overlapping windows (step = H) so counts aren't inflated by overlap
// autocorrelation (same discipline as rankICEngine). Claimed coverage: the P50
// envelope is the MEDIAN |close move| → 50%; P75 → 75%. Direction grades
// sign(mu) vs sign(realized H-day move); benchmark 50%. `recent` re-tallies the
// final `recentFrac` of windows so decay is visible next to the full-history
// number.
export function calibrationTally(bars, opts = {}) {
  const o = { ...PATH_DEFAULTS, ...opts };
  const ctx = buildForecastContext(bars, o);
  const H = o.horizonDays;
  const n = bars.length;
  const recentFrac = o.recentFrac ?? 0.3;

  const windows = [];
  for (let i = Math.max(o.warmup, 2); i + H <= n; i += H) {
    const cone = coneFromContext(ctx, i, H);
    if (!cone) continue;
    const w = { in50: new Array(H), in75: new Array(H), dirHit: null };
    for (let h = 1; h <= H; h++) {
      const c = bars[i + h - 1].close, s = cone.steps[h - 1];
      w.in50[h - 1] = c >= s.p50Dn && c <= s.p50Up;
      w.in75[h - 1] = c >= s.p75Dn && c <= s.p75Up;
    }
    const move = bars[i + H - 1].close - cone.anchor;
    if (cone.mu !== 0 && move !== 0) w.dirHit = Math.sign(move) === Math.sign(cone.mu);
    windows.push(w);
  }

  const tally = ws => {
    const perStep = [];
    for (let k = 0; k < H; k++) {
      let a = 0, b = 0;
      for (const w of ws) { if (w.in50[k]) a++; if (w.in75[k]) b++; }
      perStep.push({ h: k + 1, c50: ws.length ? a / ws.length : null, c75: ws.length ? b / ws.length : null });
    }
    const dir = ws.filter(w => w.dirHit !== null);
    return { n: ws.length, perStep,
             direction: { n: dir.length, hitRate: dir.length ? dir.filter(w => w.dirHit).length / dir.length : null } };
  };

  const recentN = Math.max(1, Math.floor(windows.length * recentFrac));
  return { horizonDays: H, claimed: { p50: 0.5, p75: 0.75, direction: 0.5 },
           full: tally(windows), recent: tally(windows.slice(-recentN)) };
}

// ═══════════════════════════════════════════════════════════════════════════
// Intraday extension — "the next few hours" on M15 bars.
//
// The daily cone can't just be √t-scaled down: intraday variance is strongly
// time-of-day shaped (Asia quiet, London/NY open loud), so a flat cone would
// bust its claimed containment at every London open. Here σ per FUTURE bar =
// (per-bar EWMA σ) × (hour-of-day multiplier), where the multiplier is the
// bucket's RMS return over the global RMS computed on data STRICTLY before i
// (expanding, causal — prefix sums per bucket, bisect-queried). Envelopes are
// Gaussian close-displacement quantiles on the accumulated variance (|z| median
// 0.6745, 75th pct 1.1503) — the Feller/computeBands constants describe a
// DAILY session's range distribution and don't apply to an intraday step.
// Same claims, same grading: P50→50%, P75→75%, drift direction vs coin flip.
// ═══════════════════════════════════════════════════════════════════════════

import { bisect } from './barUtils.js';

export const INTRADAY_DEFAULTS = {
  horizonBars: 16,      // 16 × M15 = 4 hours
  sigmaLambda: 0.94,    // EWMA variance decay per bar
  driftLambda: 0.98,    // EWMA drift decay per bar
  driftCapSigma: 0.5,   // |drift per bar| capped at this × per-bar σ
  nPaths: 40,
  seed: 42,
  warmupBars: 480,      // ~5 trading days of M15 before the first cone
  minBucketObs: 20,     // bucket multiplier stays 1 until this many obs
};

const Z50 = 0.6744898, Z75 = 1.1503494;   // |z| median and 75th percentile

// bars: [{ time: epoch seconds, open, high, low, close }] on a regular grid.
export function buildIntradayContext(bars, opts = {}) {
  const o = { ...INTRADAY_DEFAULTS, ...opts };
  const n = bars.length;
  const closes = bars.map(b => b.close);

  // sigma[i] / drift[i] usable AT i: EWMA over returns ending ≤ i-1. The live
  // edge (i === n) needs the EWMA through the FINAL return — kept separately as
  // sigmaLive/driftLive (there is no slot n in the arrays).
  const sigma = new Float64Array(n), drift = new Float64Array(n);
  let sigmaLive = 0, driftLive = 0;
  { let ewv = 0, ewm = 0, seen = 0;
    for (let j = 1; j < n; j++) {
      const r = Math.log(closes[j] / closes[j - 1]);
      ewv = seen === 0 ? r * r : o.sigmaLambda * ewv + (1 - o.sigmaLambda) * r * r;
      ewm = seen === 0 ? r : o.driftLambda * ewm + (1 - o.driftLambda) * r;
      seen++;
      if (j + 1 < n) { sigma[j + 1] = Math.sqrt(ewv); drift[j + 1] = ewm; }
    }
    sigmaLive = Math.sqrt(ewv); driftLive = ewm; }

  // Hour-of-day buckets over return indices (return j ends at bar j). Arrays
  // are appended in bar order → sorted; prefix sums make profileMult(i, hour)
  // an O(log n) causal query.
  const buckets = Array.from({ length: 24 }, () => ({ idx: [], cum: [0] }));
  const gCum = new Float64Array(n);   // gCum[j] = Σ r² for returns 1..j
  for (let j = 1; j < n; j++) {
    const r = Math.log(closes[j] / closes[j - 1]);
    gCum[j] = gCum[j - 1] + r * r;
    const b = buckets[new Date(bars[j].time * 1000).getUTCHours()];
    b.idx.push(j);
    b.cum.push(b.cum[b.cum.length - 1] + r * r);
  }

  // Bar spacing (seconds): the smallest positive gap — robust to weekend holes.
  let barSec = Infinity;
  for (let j = 1; j < Math.min(n, 500); j++) {
    const d = bars[j].time - bars[j - 1].time;
    if (d > 0 && d < barSec) barSec = d;
  }
  if (!isFinite(barSec)) barSec = 900;

  return { bars, closes, sigma, drift, sigmaLive, driftLive, buckets, gCum, barSec, opts: o };
}

// σ multiplier for `hour`, using only returns with index < i.
export function profileMult(ctx, i, hour) {
  const { buckets, gCum, opts } = ctx;
  const b = buckets[hour];
  const cnt = bisect(b.idx, i);
  const gCnt = Math.max(0, Math.min(i - 1, gCum.length - 1));
  if (cnt < opts.minBucketObs || gCnt < 100) return 1;
  const bucketMean = b.cum[cnt] / cnt;
  const globalMean = gCum[gCnt] / gCnt;
  return globalMean > 0 ? Math.sqrt(bucketMean / globalMean) : 1;
}

// Future bar time: real bar time inside history; beyond the end, step the grid
// forward and hop the FX weekend gap (Fri ~21:00 UTC → Sun 21:00 UTC).
function _futureTime(ctx, i, h) {
  const { bars, barSec } = ctx;
  const n = bars.length;
  if (i + h - 1 < n) return bars[i + h - 1].time;
  let t = bars[n - 1].time + (i + h - 1 - (n - 1)) * barSec;
  const d = new Date(t * 1000);
  if (d.getUTCDay() === 6 || (d.getUTCDay() === 5 && d.getUTCHours() >= 21) || (d.getUTCDay() === 0 && d.getUTCHours() < 21))
    t += 2 * 86400;   // hop the closed weekend; grid alignment is cosmetic here
  return t;
}

// Per-step σ ladder shared by cone and sample paths. i === n (live edge) reads
// the through-the-last-return EWMA; times and the profile query always use i.
function _stepSigmas(ctx, i, H) {
  const { sigma, drift, sigmaLive, driftLive, bars, opts } = ctx;
  const n = bars.length;
  const sigBase = i === n ? sigmaLive : sigma[i];
  if (!(sigBase > 0)) return null;
  const rawMu = i === n ? driftLive : (drift[i] || 0);
  const mu = Math.max(-opts.driftCapSigma * sigBase, Math.min(opts.driftCapSigma * sigBase, rawMu));
  const times = [], sigs = [];
  for (let h = 1; h <= H; h++) {
    const t = _futureTime(ctx, i, h);
    times.push(t);
    sigs.push(sigBase * profileMult(ctx, i, new Date(t * 1000).getUTCHours()));
  }
  return { sigBase, mu, times, sigs };
}

// ── The intraday cone (2 ≤ i ≤ bars.length; i === n is the live edge) ────────
export function intradayCone(ctx, i, horizonBars) {
  const { bars, opts } = ctx;
  const H = horizonBars ?? opts.horizonBars;
  const n = bars.length;
  if (i < 2 || i > n) return null;
  const ladder = _stepSigmas(ctx, i, H);
  if (!ladder) return null;
  const anchor = bars[i - 1].close;

  const steps = [];
  let cumVar = 0;
  for (let h = 1; h <= H; h++) {
    cumVar += ladder.sigs[h - 1] ** 2;
    const sd = Math.sqrt(cumVar);
    const center = anchor * Math.exp(ladder.mu * h);
    steps.push({ h, time: ladder.times[h - 1], center,
                 p50Up: center * Math.exp(Z50 * sd), p50Dn: center * Math.exp(-Z50 * sd),
                 p75Up: center * Math.exp(Z75 * sd), p75Dn: center * Math.exp(-Z75 * sd) });
  }
  return { i, anchorTime: bars[i - 1].time, anchor, sigmaBar: ladder.sigBase, mu: ladder.mu, steps };
}

// ── Intraday Monte-Carlo paths (seeded; wicks cosmetic, padded to the median
// prior-bar range — same honesty rule as the daily samplePaths) ──────────────
export function intradaySamplePaths(ctx, i, horizonBars, opts = {}) {
  const cone = intradayCone(ctx, i, horizonBars);
  if (!cone) return { paths: [], consensus: [] };
  const o = { ...ctx.opts, ...opts };
  const ladder = _stepSigmas(ctx, cone.i, cone.steps.length);

  // Median |high-low| of the prior ~96 bars (strictly before i) → cosmetic wick budget.
  const ranges = [];
  for (let k = Math.max(0, cone.i - 97); k < cone.i - 1; k++) ranges.push(ctx.bars[k].high - ctx.bars[k].low);
  ranges.sort((a, b) => a - b);
  const medRange = ranges.length ? ranges[ranges.length >> 1] : 0;

  const rng = mulberry32(o.seed);
  const paths = [];
  for (let p = 0; p < o.nPaths; p++) {
    let prev = cone.anchor;
    const path = [];
    for (let k = 0; k < cone.steps.length; k++) {
      const close = prev * Math.exp(ladder.mu + ladder.sigs[k] * gauss(rng));
      const open = prev;
      const bodyHi = Math.max(open, close), bodyLo = Math.min(open, close);
      const pad = Math.max(0, medRange - (bodyHi - bodyLo));
      const u = rng();
      path.push({ h: k + 1, time: cone.steps[k].time, open, close,
                  high: bodyHi + pad * u, low: bodyLo - pad * (1 - u) });
      prev = close;
    }
    paths.push(path);
  }
  const consensus = cone.steps.map((s, k) => {
    const cs = paths.map(p => p[k].close).sort((a, b) => a - b);
    const m = cs.length >> 1;
    return { h: s.h, time: s.time, close: cs.length % 2 ? cs[m] : (cs[m - 1] + cs[m]) / 2 };
  });
  return { paths, consensus };
}

// Standard normal CDF (Abramowitz-Stegun 7.1.26 via erf approximation).
export function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? 1 - p : p;
}

// ── "Surprise meter" — where does a price sit inside the cone drawn at i? ────
// z of the realized log-move vs the cone's claim h steps after anchor i; pct is
// the claimed percentile (0.5 = dead centre, >0.875 = beyond the P75 band).
export function intradayRealizedZ(ctx, i, h, price) {
  const ladder = _stepSigmas(ctx, i, h);
  if (!ladder || !(price > 0) || h < 1) return null;
  let cumVar = 0;
  for (let k = 0; k < h; k++) cumVar += ladder.sigs[k] ** 2;
  const sd = Math.sqrt(cumVar);
  if (!(sd > 0)) return null;
  const anchor = ctx.bars[i - 1].close;
  const z = (Math.log(price / anchor) - ladder.mu * h) / sd;
  return { z, pct: normCdf(z), absPct: normCdf(Math.abs(z)) * 2 - 1 };
}

// ── Intraday calibration tally — same discipline, same output shape ──────────
// Beyond the overall per-step containment this also splits the FINAL-step claim
//   • by ENTRY HOUR (when is the cone trustworthy?), and
//   • by RANGE-BUDGET spent at entry (`budget`): today's high-low so far vs the
//     causal median at the same hour over prior days → cold (<0.8×) / normal /
//     hot (>1.25×). This MEASURES the exhaustion-vs-persistence question — it
//     does NOT rescale the cone. medAbsZ is the median realized |z| at the
//     final step (≈0.674 if the width claim is honest): hot-bucket medAbsZ
//     above overall ⇒ expansion persists (cone too tight on hot days); below ⇒
//     exhaustion (too wide). Only if a stable gap shows up does a conditioner
//     earn its way into the cone.
export function intradayTally(bars, opts = {}) {
  const o = { ...INTRADAY_DEFAULTS, ...opts };
  const ctx = buildIntradayContext(bars, o);
  const H = o.horizonBars;
  const n = bars.length;
  const recentFrac = o.recentFrac ?? 0.3;

  // Per-bar range-so-far within its UTC day, + per-(day, hour) last value for
  // the causal same-hour climatology.
  const dayKeyOf = j => Math.floor(bars[j].time / 86400);
  const rangeFrac = new Float64Array(n);
  const dayHourVal = new Map();               // dayKey → Array(24) of rangeFrac
  { let dk = null, hi = -Infinity, lo = Infinity, open = 0;
    for (let j = 0; j < n; j++) {
      const k = dayKeyOf(j);
      if (k !== dk) { dk = k; hi = -Infinity; lo = Infinity; open = bars[j].open; dayHourVal.set(k, new Array(24).fill(null)); }
      if (bars[j].high > hi) hi = bars[j].high;
      if (bars[j].low < lo) lo = bars[j].low;
      rangeFrac[j] = open > 0 ? (hi - lo) / open : 0;
      dayHourVal.get(k)[new Date(bars[j].time * 1000).getUTCHours()] = rangeFrac[j];
    } }
  const hourHistory = Array.from({ length: 24 }, () => []);   // values from days strictly before the current window's day
  const dayKeysSorted = [...dayHourVal.keys()].sort((a, b) => a - b);
  let flushedUpTo = 0;                                        // index into dayKeysSorted

  const windows = [];
  for (let i = Math.max(o.warmupBars, 2); i + H <= n; i += H) {
    const cone = intradayCone(ctx, i, H);
    if (!cone) continue;
    const w = { in50: new Array(H), in75: new Array(H), dirHit: null };
    for (let h = 1; h <= H; h++) {
      const c = bars[i + h - 1].close, s = cone.steps[h - 1];
      w.in50[h - 1] = c >= s.p50Dn && c <= s.p50Up;
      w.in75[h - 1] = c >= s.p75Dn && c <= s.p75Up;
    }
    const move = bars[i + H - 1].close - cone.anchor;
    if (cone.mu !== 0 && move !== 0) w.dirHit = Math.sign(move) === Math.sign(cone.mu);

    // Final-step realized |z| from the cone's own envelope (sd = ln(p75Up/center)/Z75).
    const last = cone.steps[H - 1];
    const sd = Math.log(last.p75Up / last.center) / Z75;
    w.absZ = sd > 0 ? Math.abs(Math.log(bars[i + H - 1].close / cone.anchor) - Math.log(last.center / cone.anchor)) / sd : null;

    // Entry hour + causal range-budget ratio.
    const entryDay = dayKeyOf(i - 1);
    w.hour = new Date(bars[i - 1].time * 1000).getUTCHours();
    while (flushedUpTo < dayKeysSorted.length && dayKeysSorted[flushedUpTo] < entryDay) {
      const vals = dayHourVal.get(dayKeysSorted[flushedUpTo]);
      for (let hr = 0; hr < 24; hr++) if (vals[hr] != null) hourHistory[hr].push(vals[hr]);
      flushedUpTo++;
    }
    const hist = hourHistory[w.hour];
    if (hist.length >= 5 && rangeFrac[i - 1] > 0) {
      const s = [...hist].sort((a, b) => a - b);
      const med = s.length % 2 ? s[s.length >> 1] : (s[(s.length >> 1) - 1] + s[s.length >> 1]) / 2;
      w.spentRatio = med > 0 ? rangeFrac[i - 1] / med : null;
    } else w.spentRatio = null;

    windows.push(w);
  }

  const tally = ws => {
    const perStep = [];
    for (let k = 0; k < H; k++) {
      let a = 0, b = 0;
      for (const w of ws) { if (w.in50[k]) a++; if (w.in75[k]) b++; }
      perStep.push({ h: k + 1, c50: ws.length ? a / ws.length : null, c75: ws.length ? b / ws.length : null });
    }
    const dir = ws.filter(w => w.dirHit !== null);
    return { n: ws.length, perStep,
             direction: { n: dir.length, hitRate: dir.length ? dir.filter(w => w.dirHit).length / dir.length : null } };
  };

  // Final-step summary for a subset (the by-hour / budget cells).
  const cell = ws => {
    const zs = ws.map(w => w.absZ).filter(z => z != null).sort((a, b) => a - b);
    return { n: ws.length,
             c50: ws.length ? ws.filter(w => w.in50[H - 1]).length / ws.length : null,
             c75: ws.length ? ws.filter(w => w.in75[H - 1]).length / ws.length : null,
             medAbsZ: zs.length ? +(zs.length % 2 ? zs[zs.length >> 1] : (zs[(zs.length >> 1) - 1] + zs[zs.length >> 1]) / 2).toFixed(3) : null };
  };

  const byHour = [];
  for (let hr = 0; hr < 24; hr++) {
    const ws = windows.filter(w => w.hour === hr);
    if (ws.length) byHour.push({ hour: hr, ...cell(ws) });
  }

  const withRatio = windows.filter(w => w.spentRatio != null);
  const budget = {
    skipped: windows.length - withRatio.length,
    cold:   cell(withRatio.filter(w => w.spentRatio < 0.8)),
    normal: cell(withRatio.filter(w => w.spentRatio >= 0.8 && w.spentRatio <= 1.25)),
    hot:    cell(withRatio.filter(w => w.spentRatio > 1.25)),
    overall: cell(windows),
  };

  const recentN = Math.max(1, Math.floor(windows.length * recentFrac));
  return { horizonBars: H, claimed: { p50: 0.5, p75: 0.75, direction: 0.5, medAbsZ: 0.674 },
           full: tally(windows), recent: tally(windows.slice(-recentN)),
           byHour, budget };
}

export { HORIZONS };
