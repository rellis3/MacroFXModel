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

export { HORIZONS };
