/**
 * Analog Cone — an EMPIRICAL forward-path envelope, no distributional
 * assumption. Companion to `forecastPathCore.js`'s `intradayCone` (Cone A,
 * model-based: assumes lognormal steps, plugs σ/drift into a formula). This
 * is Cone B: find every prior time the market was in a similar state
 * (trend regime × realized-vol bucket), stack what price ACTUALLY did next
 * across those analogs, and let the empirical quantiles of real outcomes be
 * the envelope. No formula decides the shape — the historical record does.
 *
 * State bucketing reuses existing Tier-1 bricks rather than inventing new
 * regime math:
 *   • trend regime  — `classifyRegime` (js/volBacktestEngine.js), the same
 *     causal EMA-slope classifier already used by rankICEngine/backtests.
 *   • vol bucket    — a causal rolling-stdev-of-returns series, tertile-
 *     bucketed via `rollingPercentile` (js/statsCore.js).
 *
 * No lookahead: state "as of" position p uses closes[0..p-1] only (matching
 * classifyRegime's own contract). An analog candidate at position j is only
 * eligible if its OWN forward window (bars[j..j+H-1]) ends at or before the
 * query anchor's last known bar (j + H - 1 <= i - 1) — so a live cone never
 * draws on data that hasn't happened yet, and a calibration walk never draws
 * on the window it is about to grade.
 *
 * Context split (same shape as buildIntradayContext / intradayCone): the
 * expensive part — the causal state series over the whole history — is built
 * ONCE via `buildAnalogContext`; `analogCone(ctx, i, H)` then reads it, O(pool
 * size) per call instead of O(n) per call. A calibration walk over thousands
 * of windows would otherwise rebuild the state series thousands of times.
 *
 * Honesty fields: `nAnalogs` (raw matched windows) and `nEpisodes` (maximal
 * contiguous runs of matching state — the closer estimate of INDEPENDENT
 * samples, since a multi-day regime contributes many overlapping, highly
 * correlated windows to nAnalogs). A thin cone reports itself as thin
 * (`lowConfidence: true` below `minAnalogs`) rather than drawing a confident
 * line off five samples. Pure — no network, no DOM; unit-tested on synthetic
 * data (analogCone.test.mjs).
 */
import { classifyRegime } from './volBacktestEngine.js';
import { rollingPercentile, mulberry32 } from './statsCore.js';
import { gradeCone, tallyGrades } from './coneCalibrationCore.js';

export const ANALOG_DEFAULTS = {
  regimeSpan: 20,
  regimeSlopeWindow: 5,
  regimeThresh: 0.002,
  volLookback: 96,      // bars of trailing returns used per realized-vol reading
  volPctPeriod: 480,    // rolling window (bars) the vol reading is percentile-ranked against
  minAnalogs: 20,        // below this, the envelope is still returned but flagged low-confidence
  maxAnalogs: 500,       // cap on the matched pool per query — keeps the MOST RECENT matches
  nPaths: 12,            // how many real analog paths to hand back for path-overlay display
  naiveMaxPool: 2000,    // cap on the unconditional (naive-benchmark) pool size per window
  seed: 42,
};

const Z50_COVER = [25, 75];     // percentile pair spanning the same 50% coverage as Cone A's p50 band
const Z75_COVER = [12.5, 87.5]; // ...and the 75% coverage of Cone A's p75 band

function _pct(sorted, p) {
  if (!sorted.length) return null;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// bars: [{ time: epoch seconds, open, high, low, close }] on a regular grid
// (same contract as forecastPathCore's intradayCone). Builds the causal
// (regime[p], volBucket[p]) state series ONCE — valid for forecasting forward
// FROM bars[p-1].close, using only closes[0..p-1].
export function buildAnalogContext(bars, opts = {}) {
  const o = { ...ANALOG_DEFAULTS, ...opts };
  const closes = bars.map(b => b.close);
  const n = closes.length;
  const warmup = Math.max(o.regimeSpan + o.regimeSlopeWindow, o.volLookback) + o.volPctPeriod + 1;

  // State arrays run 0..n INCLUSIVE (length n+1): index n is the LIVE edge —
  // "state as of right now", forecasting forward from bars[n-1].close, using
  // only closes[0..n-1] (already-realized data, no lookahead). Every one of
  // these p's is causal by construction (classifyRegime/rv/rollingPercentile
  // at p never touch closes[p] or later).
  const ret = new Array(n).fill(NaN);
  for (let k = 1; k < n; k++) ret[k] = Math.log(closes[k] / closes[k - 1]);

  // rv[p] = stdev of returns strictly before p (i.e. ret[p-volLookback..p-1]).
  const rv = new Array(n + 1).fill(NaN);
  for (let p = o.volLookback + 1; p <= n; p++) {
    const win = ret.slice(p - o.volLookback, p).filter(Number.isFinite);
    if (win.length < o.volLookback) continue;
    const m = win.reduce((s, x) => s + x, 0) / win.length;
    const v = win.reduce((s, x) => s + (x - m) ** 2, 0) / win.length;
    rv[p] = Math.sqrt(v);
  }
  const rvPct = rollingPercentile(rv, o.volPctPeriod);

  const regime = new Array(n + 1).fill(null);
  const volBucket = new Array(n + 1).fill(null);
  for (let p = warmup; p <= n; p++) {
    regime[p] = classifyRegime(closes, p, o.regimeSpan, o.regimeSlopeWindow, o.regimeThresh);
    const pr = rvPct[p];
    if (Number.isFinite(pr)) volBucket[p] = pr < 33.33 ? 'LOW' : pr < 66.67 ? 'MID' : 'HIGH';
  }
  return { bars, closes, regime, volBucket, warmup, opts: o };
}

// Pool of eligible analog anchors j < i whose state matches state[i] and
// whose own forward window doesn't reach into or past the query anchor.
// Scans backward from the query and stops at maxAnalogs: bounds the cost of
// a long, common bucket (a multi-year RANGE/MID state can otherwise match
// thousands of windows) AND biases toward the MOST RECENT matching analogs,
// a deliberate, defensible choice (structurally closer to "now" than a decade
// -old analog of the same label) rather than an arbitrary performance hack.
function _analogPool(ctx, i, H) {
  const target = { regime: ctx.regime[i], vol: ctx.volBucket[i] };
  if (target.regime == null || target.vol == null) return { target, matches: [] };
  const matches = [];
  for (let j = i - H; j >= ctx.warmup && matches.length < ctx.opts.maxAnalogs; j--) {
    if (ctx.regime[j] === target.regime && ctx.volBucket[j] === target.vol) matches.push(j);
  }
  matches.reverse(); // ascending index order — nEpisodes assumes this
  return { target, matches };
}

function _countEpisodes(matches) {
  if (!matches.length) return 0;
  let episodes = 1;
  for (let k = 1; k < matches.length; k++) if (matches[k] !== matches[k - 1] + 1) episodes++;
  return episodes;
}

function _envelopeFromMatches(ctx, i, H, matches) {
  const bars = ctx.bars;
  const anchor = bars[i - 1].close;
  const anchorTime = bars[i - 1].time;
  const interval = i >= 2 ? (bars[i - 1].time - bars[Math.max(0, i - 2)].time) || 0 : 0;

  const stepReturns = Array.from({ length: H }, () => []);
  for (const j of matches) {
    const base = bars[j - 1].close;
    for (let h = 1; h <= H; h++) stepReturns[h - 1].push(Math.log(bars[j - 1 + h].close / base));
  }

  const steps = [];
  for (let h = 1; h <= H; h++) {
    const sorted = stepReturns[h - 1].sort((a, b) => a - b);
    const time = bars[i - 1 + h] ? bars[i - 1 + h].time : anchorTime + h * interval;
    const at = p => anchor * Math.exp(_pct(sorted, p));
    steps.push({
      h, time,
      center: anchor * Math.exp(_pct(sorted, 50)),
      p50Dn: at(Z50_COVER[0]), p50Up: at(Z50_COVER[1]),
      p75Dn: at(Z75_COVER[0]), p75Up: at(Z75_COVER[1]),
    });
  }
  return { anchor, anchorTime, steps };
}

// ctx: buildAnalogContext(bars, opts) output. i: anchor index — the cone
// forecasts forward from bars[i-1].close. H: horizon in bars.
export function analogCone(ctx, i, H) {
  const n = ctx.bars.length;
  if (i < ctx.warmup || i > n || H < 1) return null;

  const { target, matches } = _analogPool(ctx, i, H);
  const nAnalogs = matches.length;
  if (!nAnalogs) return null;
  const nEpisodes = _countEpisodes(matches);

  const { anchor, anchorTime, steps } = _envelopeFromMatches(ctx, i, H, matches);
  return {
    i, anchorTime, anchor, target, steps,
    nAnalogs, nEpisodes,
    minAnalogs: ctx.opts.minAnalogs,
    lowConfidence: nAnalogs < ctx.opts.minAnalogs,
  };
}

// The real historical paths behind the envelope (not simulated) — up to
// nPaths of the matched analogs' own price paths, rescaled onto the current
// anchor, for literal "here's what happened those N times" overlay display.
export function analogSamplePaths(ctx, i, H, opts = {}) {
  const o = { ...ctx.opts, ...opts };
  const n = ctx.bars.length;
  if (i < ctx.warmup || i > n || H < 1) return { paths: [], nAnalogs: 0 };
  const { matches } = _analogPool(ctx, i, H);
  if (!matches.length) return { paths: [], nAnalogs: 0 };

  const bars = ctx.bars;
  const anchor = bars[i - 1].close;
  const anchorTime = bars[i - 1].time;
  const interval = i >= 2 ? (bars[i - 1].time - bars[Math.max(0, i - 2)].time) || 0 : 0;
  const rng = mulberry32(o.seed >>> 0);
  const pick = matches.length <= o.nPaths
    ? matches
    : Array.from({ length: o.nPaths }, () => matches[(rng() * matches.length) | 0]);

  const paths = pick.map(j => {
    const base = bars[j - 1].close;
    const path = [];
    for (let h = 1; h <= H; h++) {
      const time = bars[i - 1 + h] ? bars[i - 1 + h].time : anchorTime + h * interval;
      path.push({ h, time, close: anchor * Math.exp(Math.log(bars[j - 1 + h].close / base)) });
    }
    return path;
  });
  return { paths, nAnalogs: matches.length };
}

// Unconditional counterpart of analogCone: pool = the most recent eligible
// prior indices, no state matching, capped at naiveMaxPool for cost. Same
// output shape, used purely as the calibration floor.
function _naiveCone(ctx, i, H) {
  if (i < 2 || i > ctx.bars.length) return null;
  const lastJ = i - H;
  if (lastJ < 2) return null;
  const firstJ = Math.max(2, lastJ - ctx.opts.naiveMaxPool + 1);
  const matches = [];
  for (let j = firstJ; j <= lastJ; j++) matches.push(j);
  if (!matches.length) return null;
  const { anchor, anchorTime, steps } = _envelopeFromMatches(ctx, i, H, matches);
  return { i, anchorTime, anchor, steps, nAnalogs: matches.length };
}

// ── Calibration — does the empirical envelope actually contain what it
// claims? Same tally shape as forecastPathCore.calibrationTally (per-step
// P50/P75 coverage, direction hit rate, full vs recent) so the two cones'
// calibration cards read side by side. Also reports the naive-persistence
// floor: the UNCONDITIONAL empirical envelope (no regime/vol matching at
// all) — the benchmark this cone must beat to justify the extra machinery
// (CLAUDE.md: name the benchmark before claiming improvement).
export function analogConeCalibration(bars, H, opts = {}) {
  const ctx = buildAnalogContext(bars, opts);
  const n = bars.length;
  const windows = [], naiveWindows = [];

  for (let i = ctx.warmup; i + H <= n; i += H) {
    const cone = analogCone(ctx, i, H);
    if (cone) windows.push(gradeCone(bars, cone, i, H));
    const naive = _naiveCone(ctx, i, H);
    if (naive) naiveWindows.push(gradeCone(bars, naive, i, H));
  }

  const recentFrac = ctx.opts.recentFrac ?? 0.3;
  const recentN = Math.max(1, Math.floor(windows.length * recentFrac));
  return {
    horizonBars: H, claimed: { p50: 0.5, p75: 0.75, direction: 0.5 },
    full: tallyGrades(windows, H), recent: tallyGrades(windows.slice(-recentN), H),
    naiveBenchmark: tallyGrades(naiveWindows, H),
    note: 'naiveBenchmark = unconditional empirical envelope (no state matching). ' +
          'The regime/vol-matched cone only earns its complexity if full beats naiveBenchmark.',
  };
}
