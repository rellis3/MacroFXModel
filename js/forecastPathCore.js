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
  bandsFn: null,       // optional calibration swap: (open, σ, assetClass) → at
                       // least { ocUp, ocDn, oc75 } (computeBands shape). Lets a
                       // caller grade a DIFFERENT band calibration (e.g. COG's
                       // constants) through the same cone/tally path — the drift
                       // (most-agreed) line is calibration-independent, only the
                       // envelope widths change. Default: the platform computeBands.
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
  const bandsFn = opts.bandsFn ?? computeBands;
  let lastDate = _dateOf(bars[i - 1]);
  for (let h = 1; h <= H; h++) {
    const center = anchor * Math.exp(mu * h);
    const b = bandsFn(center, sig * Math.sqrt(h), opts.assetClass);
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
  // Event-aware widening (economic releases). `events` = epoch SECONDS of the
  // releases that matter for this instrument (caller filters by currency +
  // impact rank — the brick stays pure). A bar is "near an event" inside
  // [ev - eventPre, ev + eventPost]. The widening multiplier is LEARNED, not
  // asserted: RMS of near-event returns ÷ their same-hour causal baseline
  // (so the session profile isn't double-counted — releases cluster at loud
  // hours). Stays 1 until minEventObs near-event returns exist; floored at 1
  // (an event never narrows the claim) and capped at 4. Applied only when
  // eventAware is true, and only to steps whose time falls inside a window.
  events: [],
  eventAware: false,
  eventPre: 900,        // 15 min before the release
  eventPost: 3600,      // 60 min after
  minEventObs: 20,
  // Implied-vol width conditioner (measured-first, default OFF). `ivByDate` =
  // { 'YYYY-MM-DD': impliedVolLevel } (e.g. EVZ/GVZ/VIX from FRED — the brick
  // stays pure, the server passes it in). When `ivConditioner` is on, the whole
  // day's base σ is scaled by the day's implied-vol level ÷ its own trailing
  // median — CAUSAL (uses implied as of the prior trading day, strictly before
  // the day). Clamped so a noisy print can't blow the cone up. This tests
  // whether forward-looking implied vol adds anything BEYOND the backward-
  // looking realized σ already in the cone — the A/B decides; the honest prior
  // is a coin flip. Baseline needs ≥ minIvObs prior observations or the mult
  // stays 1.
  ivByDate: null,
  ivConditioner: false,
  ivBaselineDays: 60,
  ivClampLo: 0.5,
  ivClampHi: 2.0,
  minIvObs: 20,
};

// Day key (UTC midnight index) shared by the context and the iv conditioner.
const _dayKeyOfSec = t => Math.floor(t / 86400);
const _dayKeyOfDate = ds => Math.floor(Date.parse(ds + 'T00:00:00Z') / 1000 / 86400);

// Per-day implied-vol σ multiplier (causal): iv as of the latest date strictly
// before day D ÷ median iv over the prior `baselineDays`. 1 without enough data.
function _buildIvMult(ivByDate, opts) {
  const out = new Map();
  if (!ivByDate) return out;
  const entries = Object.entries(ivByDate)
    .map(([d, v]) => [_dayKeyOfDate(d), +v])
    .filter(([k, v]) => Number.isFinite(k) && Number.isFinite(v) && v > 0)
    .sort((a, b) => a[0] - b[0]);
  if (entries.length < opts.minIvObs) return out;
  const keys = entries.map(e => e[0]);
  // For any query day D: use entries with key < D.
  return { entries, keys, opts, get(D) {
    if (out.has(D)) return out.get(D);
    let hi = bisectNum(keys, D);      // first index with key ≥ D
    const prior = entries.slice(0, hi);
    if (prior.length < opts.minIvObs) { out.set(D, 1); return 1; }
    const ivToday = prior[prior.length - 1][1];
    const win = prior.filter(([k]) => k >= D - opts.ivBaselineDays).map(e => e[1]).sort((a, b) => a - b);
    const base = win.length ? win[win.length >> 1] : ivToday;
    const m = base > 0 ? Math.min(opts.ivClampHi, Math.max(opts.ivClampLo, ivToday / base)) : 1;
    out.set(D, m); return m;
  } };
}
// Local numeric bisect (barUtils.bisect is imported later in the file for bar times).
function bisectNum(arr, x) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return lo; }

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

  // Near-event return index: which returns fall inside an event window, with
  // prefix sums of r² and each one's hour (for the causal baseline query).
  const events = [...(o.events ?? [])].sort((a, b) => a - b);
  const evIdx = [], evR2Cum = [0], evHour = [];
  if (events.length) {
    for (let j = 1; j < n; j++) {
      if (!_nearEvent(events, bars[j].time, o.eventPre, o.eventPost)) continue;
      const r = Math.log(closes[j] / closes[j - 1]);
      evIdx.push(j);
      evR2Cum.push(evR2Cum[evR2Cum.length - 1] + r * r);
      evHour.push(new Date(bars[j].time * 1000).getUTCHours());
    }
  }

  const ivMult = o.ivConditioner ? _buildIvMult(o.ivByDate, o) : null;

  return { bars, closes, sigma, drift, sigmaLive, driftLive, buckets, gCum, barSec,
           events, evIdx, evR2Cum, evHour, ivMult, opts: o };
}

// Is `t` inside any event's [ev - pre, ev + post] window? (events sorted asc)
function _nearEvent(events, t, pre, post) {
  const k = bisect(events, t - post);          // first event with ev ≥ t - post
  return k < events.length && events[k] - pre <= t;
}

// Causal mean r² for an hour bucket using returns strictly before i.
function _bucketMeanAt(ctx, i, hour) {
  const b = ctx.buckets[hour];
  const cnt = bisect(b.idx, i);
  if (cnt >= ctx.opts.minBucketObs) return b.cum[cnt] / cnt;
  const g = Math.max(0, Math.min(i - 1, ctx.gCum.length - 1));
  return g > 0 ? ctx.gCum[g] / g : 0;
}

// Learned near-event σ multiplier from returns strictly before i: RMS of
// near-event returns over their same-hour baseline. 1 until enough data;
// floored at 1, capped at 4.
//
// NB the same-hour baseline buckets CONTAIN the event bars (releases recur at
// fixed clock hours), so this factor in isolation under-reads the true event
// widening — deliberately. The applied event-step σ is
//   sigBase × profileMult(hour) × eventMult
// and the bucket contamination cancels in that product:
//   √(bucketMean/global) × √(evVar/bucketMean) = √(evVar/global),
// i.e. event steps get exactly the event-bar RMS over the global baseline.
// Verified on planted synthetic events in the test (product ≈ true multiplier).
export function eventMult(ctx, i) {
  const { evIdx, evR2Cum, evHour, opts } = ctx;
  const k = bisect(evIdx, i);
  if (k < opts.minEventObs) return 1;
  const evVar = evR2Cum[k] / k;
  let base = 0;
  for (let m = 0; m < k; m++) base += _bucketMeanAt(ctx, i, evHour[m]);
  base /= k;
  if (!(base > 0)) return 1;
  return Math.min(4, Math.max(1, Math.sqrt(evVar / base)));
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
// With eventAware on, steps inside an event window get the learned eventMult.
function _stepSigmas(ctx, i, H) {
  const { sigma, drift, sigmaLive, driftLive, bars, events, opts } = ctx;
  const n = bars.length;
  const sigBase = i === n ? sigmaLive : sigma[i];
  if (!(sigBase > 0)) return null;
  const rawMu = i === n ? driftLive : (drift[i] || 0);
  const mu = Math.max(-opts.driftCapSigma * sigBase, Math.min(opts.driftCapSigma * sigBase, rawMu));
  const useEvents = opts.eventAware && events.length > 0;
  const evM = useEvents ? eventMult(ctx, i) : 1;
  // Implied-vol width multiplier for the anchor's UTC day (causal, whole-day).
  const ivM = ctx.ivMult ? ctx.ivMult.get(_dayKeyOfSec(bars[i - 1].time)) : 1;
  const times = [], sigs = [];
  let eventSteps = 0;
  for (let h = 1; h <= H; h++) {
    const t = _futureTime(ctx, i, h);
    times.push(t);
    let s = sigBase * ivM * profileMult(ctx, i, new Date(t * 1000).getUTCHours());
    if (useEvents && _nearEvent(events, t, opts.eventPre, opts.eventPost)) { s *= evM; eventSteps++; }
    sigs.push(s);
  }
  return { sigBase, mu, times, sigs, eventMult: evM, ivMult: ivM, eventSteps };
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
  return { i, anchorTime: bars[i - 1].time, anchor, sigmaBar: ladder.sigBase, mu: ladder.mu,
           eventMult: ladder.eventMult, ivMult: ladder.ivMult, eventSteps: ladder.eventSteps, steps };
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

// ── Target reachability — will price TOUCH this level within H bars? ─────────
// The "price" primitive: hand it a target level + a hold window, get the
// calibrated probability price trades through it and the typical time to do so.
// Monte-Carlo first-passage from the cone's OWN claim (same per-step drift + σ
// ladder as intradayCone/samplePaths), using each simulated bar's intrabar
// high/low (padded to the causal median prior-bar range — a wick touch counts,
// which is the honest "did price reach my TP/SL" test). Deterministic (seeded).
//
// nPaths defaults higher than the cosmetic path viewer (a probability wants
// resolution). Returns:
//   pTouch          fraction of paths whose high/low crossed the target ≤ H
//   medBarsToTouch  median first-touch step among touching paths (null if <½)
//   side            'up' | 'down' (target above/below the anchor)
//   z               the target's cone-z at H (context; from intradayRealizedZ)
// It inherits the cone's calibration: trustworthy to exactly the degree the
// tally shows the envelopes hold (reachabilityCalibration grades it directly).
export function intradayReachability(ctx, i, target, horizonBars, opts = {}) {
  const o = { ...ctx.opts, nPaths: 400, ...opts };
  const H = horizonBars ?? ctx.opts.horizonBars;
  const ladder = _stepSigmas(ctx, i, H);
  if (!ladder || !(target > 0)) return null;
  const anchor = ctx.bars[i - 1].close;
  if (target === anchor) return { pTouch: 1, medBarsToTouch: 0, side: 'flat', z: 0 };
  const up = target > anchor;

  // Causal median prior-bar range → intrabar wick budget (same as samplePaths).
  const ranges = [];
  for (let k = Math.max(0, i - 97); k < i - 1; k++) ranges.push(ctx.bars[k].high - ctx.bars[k].low);
  ranges.sort((a, b) => a - b);
  const medRange = ranges.length ? ranges[ranges.length >> 1] : 0;

  const rng = mulberry32(o.seed);
  let touched = 0;
  const touchBar = [];
  for (let p = 0; p < o.nPaths; p++) {
    let prev = anchor, hit = 0;
    for (let k = 0; k < H; k++) {
      const close = prev * Math.exp(ladder.mu + ladder.sigs[k] * gauss(rng));
      const bodyHi = Math.max(prev, close), bodyLo = Math.min(prev, close);
      const pad = Math.max(0, medRange - (bodyHi - bodyLo));
      const u = rng();
      const hi = bodyHi + pad * u, lo = bodyLo - pad * (1 - u);
      if ((up && hi >= target) || (!up && lo <= target)) { hit = k + 1; break; }
      prev = close;
    }
    if (hit) { touched++; touchBar.push(hit); }
  }
  const pTouch = touched / o.nPaths;
  let medBarsToTouch = null;
  if (touchBar.length >= o.nPaths / 2) {
    touchBar.sort((a, b) => a - b);
    const m = touchBar.length >> 1;
    medBarsToTouch = touchBar.length % 2 ? touchBar[m] : (touchBar[m - 1] + touchBar[m]) / 2;
  }
  const zr = intradayRealizedZ(ctx, i, H, target);
  return { pTouch, medBarsToTouch, side: up ? 'up' : 'down', z: zr ? zr.z : null };
}

// ── Reachability calibration — does a "70% reach" actually reach 70%? ────────
// The falsification the primitive needs before it's believed. Over
// non-overlapping windows, at a ladder of σ-scaled targets (both sides),
// predict pTouch and record whether price ACTUALLY touched within H — then bin
// by predicted decile and compare mean-predicted vs realized frequency (a
// reliability curve). Well-calibrated ⇒ points sit on the diagonal. `gap` is
// the mean |predicted − realized| across populated bins (lower = better).
export function reachabilityCalibration(bars, opts = {}) {
  const o = { ...INTRADAY_DEFAULTS, ...opts };
  const ctx = buildIntradayContext(bars, o);
  const H = o.horizonBars;
  const n = bars.length;
  const mults = o.targetMults ?? [0.5, 1.0, 1.5, 2.0];
  const nPaths = o.calibPaths ?? 200;

  const bins = Array.from({ length: 10 }, () => ({ sumP: 0, hit: 0, n: 0 }));
  let total = 0;
  for (let i = Math.max(o.warmupBars, 2); i + H <= n; i += H) {
    const cone = intradayCone(ctx, i, H);
    if (!cone) continue;
    const anchor = cone.anchor;
    // Per-window σ over the full horizon (from the cone's own P75 envelope).
    const last = cone.steps[H - 1];
    const sdH = Math.log(last.p75Up / last.center) / Z75;
    if (!(sdH > 0)) continue;

    // Realized intrabar extremes over the window (for the actual-touch test).
    let hi = -Infinity, lo = Infinity;
    for (let h = 1; h <= H; h++) { const b = bars[i + h - 1]; if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low; }

    for (const mu of mults) for (const sgn of [1, -1]) {
      const target = anchor * Math.exp(sgn * mu * sdH);
      const r = intradayReachability(ctx, i, target, H, { nPaths });
      if (!r) continue;
      const actual = sgn > 0 ? hi >= target : lo <= target;
      const b = Math.min(9, Math.floor(r.pTouch * 10));
      bins[b].sumP += r.pTouch; bins[b].hit += actual ? 1 : 0; bins[b].n++;
      total++;
    }
  }
  const curve = bins.map((b, k) => ({ bin: k / 10, n: b.n,
    predicted: b.n ? b.sumP / b.n : null, realized: b.n ? b.hit / b.n : null }));
  const populated = curve.filter(c => c.n >= 10);
  const gap = populated.length
    ? populated.reduce((s, c) => s + Math.abs(c.predicted - c.realized), 0) / populated.length : null;
  return { horizonBars: H, nPredictions: total, curve, gap,
           note: 'Predicted vs realized touch frequency, binned. Well-calibrated ⇒ predicted ≈ realized per bin (gap→0).' };
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
    // Event classification is independent of eventAware (same buckets for the
    // base and conditioned runs): does any event's window overlap this window?
    const tStart = bars[i - 1].time, tEnd = bars[i + H - 1].time;
    const ek = bisect(ctx.events, tStart - o.eventPost);
    const isEvent = ek < ctx.events.length && ctx.events[ek] <= tEnd + o.eventPre;
    const w = { in50: new Array(H), in75: new Array(H), dirHit: null, isEvent, iStart: i - 1 };
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

  // Event vs quiet split (final-step cells) — the A/B substrate: run the tally
  // twice (eventAware on/off) and compare the event bucket between runs.
  const eventSplit = ctx.events.length
    ? { event: cell(windows.filter(w => w.isEvent)), quiet: cell(windows.filter(w => !w.isEvent)),
        eventAware: !!o.eventAware }
    : null;

  // Implied-vol conditioner stat: how much the day multiplier actually varied
  // (so a null A/B can be read as "no signal" vs "conditioner inert"). overall
  // = the full-sample containment cell the page compares on/off.
  let ivStat = null;
  if (ctx.ivMult) {
    const ms = windows.map(w => ctx.ivMult.get(_dayKeyOfSec(bars[w.iStart].time))).filter(Number.isFinite);
    if (ms.length) {
      const sorted = [...ms].sort((a, b) => a - b);
      ivStat = { on: !!o.ivConditioner, n: ms.length,
                 lo: +sorted[0].toFixed(2), hi: +sorted[sorted.length - 1].toFixed(2),
                 med: +sorted[sorted.length >> 1].toFixed(2),
                 varied: sorted[sorted.length - 1] - sorted[0] > 0.1 };
    }
  }

  const recentN = Math.max(1, Math.floor(windows.length * recentFrac));
  return { horizonBars: H, claimed: { p50: 0.5, p75: 0.75, direction: 0.5, medAbsZ: 0.674 },
           full: tally(windows), recent: tally(windows.slice(-recentN)),
           byHour, budget, eventSplit, ivStat, overall: cell(windows) };
}

export { HORIZONS };
