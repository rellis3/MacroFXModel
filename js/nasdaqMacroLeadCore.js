// Nasdaq Macro Lead — pure math core (no I/O). Runs natively in the Railway
// dashboard process (server.js), same as js/yieldSpreadCore.js — no Python
// subprocess. See NasdaqMacroLead/README.md for the methodology writeup.
//
// Tests (honestly, walk-forward, out-of-sample only) whether a macro-proxy
// composite tracks NAS100 ahead of price. Every point this produces comes
// from a model fit BEFORE the bars it's predicting — there is no in-sample
// region to accidentally chart, unlike a single full-sample fit turned into
// a line (the curve-overlay illusion this whole exercise started from).

// ── alignment ────────────────────────────────────────────────────────────

// Binary search: index of the last element with t <= target, or -1.
function bisectAtOrBefore(sortedTimes, target) {
  let lo = 0, hi = sortedTimes.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedTimes[mid] <= target) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans;
}

// Aligns a sparse {t, close} series onto `targetTimes` (already sorted
// ascending) by carrying forward the latest known close at-or-before each
// target bar — the "as of this bar, what did we know" lookup, equivalent to
// a forward-fill without an arbitrary staleness cutoff.
function alignToTarget(targetTimes, obs) {
  if (!obs || !obs.length) return targetTimes.map(() => null);
  const times = obs.map(o => o.t);
  const closes = obs.map(o => o.close);
  return targetTimes.map(t => {
    const i = bisectAtOrBefore(times, t);
    return i >= 0 ? closes[i] : null;
  });
}

function logRet(closes) {
  const out = new Array(closes.length).fill(null);
  for (let i = 1; i < closes.length; i++) {
    const p = closes[i - 1], c = closes[i];
    if (p != null && c != null && p > 0 && c > 0) out[i] = Math.log(c / p);
  }
  return out;
}

// USD basket sign convention: USD is the QUOTE currency in usdjpy/usdcad/
// usdchf (basket rises with those) and the BASE currency in the rest
// (basket rises when those FALL).
const USD_BASE_LEGS = ['eurusd', 'gbpusd', 'audusd', 'nzdusd'];
const USD_QUOTE_LEGS = ['usdjpy', 'usdcad', 'usdchf'];

// bars: { target: [{t,close}...], bond10:[...], bond2:[...], gold:[...],
//         eurusd:[...], gbpusd:[...], ... } — any leg missing is dropped.
// Returns { times, targetClose, targetRet, features: {bond10_ret:[...], ...} }
export function buildFastFeatures(bars) {
  if (!bars.target || !bars.target.length) return null;
  const target = [...bars.target].sort((a, b) => a.t - b.t);
  const times = target.map(b => b.t);
  const targetClose = target.map(b => b.close);
  const targetRet = logRet(targetClose);

  const features = {};
  for (const name of ['bond10', 'bond2', 'gold']) {
    if (bars[name] && bars[name].length) {
      const aligned = alignToTarget(times, [...bars[name]].sort((a, b) => a.t - b.t));
      features[`${name}_ret`] = logRet(aligned);
    }
  }

  const basketRets = [];
  for (const leg of USD_BASE_LEGS) {
    if (bars[leg] && bars[leg].length) {
      const aligned = alignToTarget(times, [...bars[leg]].sort((a, b) => a.t - b.t));
      basketRets.push(logRet(aligned).map(v => (v == null ? null : -v)));
    }
  }
  for (const leg of USD_QUOTE_LEGS) {
    if (bars[leg] && bars[leg].length) {
      const aligned = alignToTarget(times, [...bars[leg]].sort((a, b) => a.t - b.t));
      basketRets.push(logRet(aligned));
    }
  }
  if (basketRets.length) {
    features.usd_basket_ret = times.map((_, i) => {
      const vals = basketRets.map(r => r[i]).filter(v => v != null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    });
  }

  return { times, targetClose, targetRet, features };
}

// Companion to buildFastFeatures: the aligned LEVELS (not returns) of the
// same OANDA legs, for the fair-value LEVEL regression (levelFairValue
// below) — a return regression compounds noise into a jagged walk; a level
// regression on slow-moving macro levels is what produces a smooth line.
// usd_basket_level is a synthetic index (start=100, compounded from the
// same per-bar basket return buildFastFeatures computes) since "USD level"
// isn't a single traded instrument the way bond/gold prices are.
export function buildLevelFeatures(bars) {
  if (!bars.target || !bars.target.length) return null;
  const target = [...bars.target].sort((a, b) => a.t - b.t);
  const times = target.map(b => b.t);

  const features = {};
  for (const name of ['bond10', 'bond2', 'gold']) {
    if (bars[name] && bars[name].length) {
      features[`${name}_level`] = alignToTarget(times, [...bars[name]].sort((a, b) => a.t - b.t));
    }
  }

  const basketRets = [];
  for (const leg of USD_BASE_LEGS) {
    if (bars[leg] && bars[leg].length) {
      const aligned = alignToTarget(times, [...bars[leg]].sort((a, b) => a.t - b.t));
      basketRets.push(logRet(aligned).map(v => (v == null ? null : -v)));
    }
  }
  for (const leg of USD_QUOTE_LEGS) {
    if (bars[leg] && bars[leg].length) {
      const aligned = alignToTarget(times, [...bars[leg]].sort((a, b) => a.t - b.t));
      basketRets.push(logRet(aligned));
    }
  }
  if (basketRets.length) {
    let level = 100;
    features.usd_basket_level = times.map((_, i) => {
      const vals = basketRets.map(r => r[i]).filter(v => v != null);
      if (vals.length) level *= Math.exp(vals.reduce((a, b) => a + b, 0) / vals.length);
      return level;
    });
  }

  return { times, features };
}

// fredSeries: { y2: Map(dateStr -> value), y10: Map, real10: Map, be10: Map }
// (dateStr as 'YYYY-MM-DD'). Forward-fills each series (plus a derived
// slope = y10 - y2, if both present) onto H4 bars — so a value only changes
// once a day, no interpolation — and returns the raw LEVEL series. Shared by
// buildFredFeatures (which diffs these) and buildFredLevelFeatures (which
// uses the levels directly, for the fair-value regression).
function ffillFredLevels(targetTimes, fredSeries) {
  const series = { ...fredSeries };
  if (series.y2 && series.y10 && !series.slope) {
    const slope = new Map();
    for (const [d, v10] of series.y10) {
      const v2 = series.y2.get(d);
      if (v2 != null) slope.set(d, v10 - v2);
    }
    series.slope = slope;
  }
  const out = {};
  for (const name of Object.keys(series)) {
    const obs = [...series[name].entries()]
      .map(([d, v]) => ({ t: Math.floor(Date.parse(d + 'T00:00:00Z') / 1000), v }))
      .sort((a, b) => a.t - b.t);
    if (!obs.length) continue;
    const dTimes = obs.map(o => o.t);
    const dVals = obs.map(o => o.v);
    out[name] = targetTimes.map(t => {
      const i = bisectAtOrBefore(dTimes, t);
      return i >= 0 ? dVals[i] : null;
    });
  }
  return out;
}

// Returns the CHANGE over `lookbackBars` H4 bars (default 6 ~= 1 trading
// day) of each forward-filled FRED level, mirroring the lookback=1 cell in
// analysis/yield_asset_coupling.py's study_main.csv — the feature set the
// "fred" walk-forward (return-prediction) variant uses.
export function buildFredFeatures(targetTimes, fredSeries, lookbackBars = 6) {
  const levels = ffillFredLevels(targetTimes, fredSeries);
  const out = {};
  for (const name of Object.keys(levels)) {
    const ffilled = levels[name];
    const chg = new Array(ffilled.length).fill(null);
    for (let i = lookbackBars; i < ffilled.length; i++) {
      if (ffilled[i] != null && ffilled[i - lookbackBars] != null) {
        chg[i] = ffilled[i] - ffilled[i - lookbackBars];
      }
    }
    out[`${name}_chg`] = chg;
  }
  return out;
}

// The raw forward-filled LEVELS (not changes) — the feature set the
// fair-value LEVEL regression uses: y2_level, y10_level, slope_level,
// real10_level, be10_level.
export function buildFredLevelFeatures(targetTimes, fredSeries) {
  const levels = ffillFredLevels(targetTimes, fredSeries);
  const out = {};
  for (const name of Object.keys(levels)) out[`${name}_level`] = levels[name];
  return out;
}

// ── rolling z-score ─────────────────────────────────────────────────────

export function rollingZ(values, window) {
  const minP = Math.max(20, Math.floor(window / 4));
  const out = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window);
    const win = values.slice(start, i).filter(v => v != null);
    if (win.length < minP || values[i] == null) continue;
    const mu = win.reduce((a, b) => a + b, 0) / win.length;
    const variance = win.reduce((a, b) => a + (b - mu) ** 2, 0) / win.length;
    const sd = Math.sqrt(variance);
    out[i] = sd > 0 ? (values[i] - mu) / sd : null;
  }
  return out;
}

// ── small linear algebra (least squares via normal equations) ──────────

// Solves A x = b for a small square A (Gaussian elimination, partial pivot).
function solveLinearSystem(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) continue; // singular-ish column — leave as 0
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map((row, i) => (Math.abs(row[i]) > 1e-12 ? row[n] / row[i] : 0));
}

// X: n x k matrix (array of rows, INTERCEPT COLUMN ALREADY INCLUDED), y: n.
function olsFit(X, y) {
  const n = X.length, k = X[0].length;
  const XtX = Array.from({ length: k }, () => new Array(k).fill(0));
  const Xty = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      Xty[a] += X[i][a] * y[i];
      for (let bcol = 0; bcol < k; bcol++) XtX[a][bcol] += X[i][a] * X[i][bcol];
    }
  }
  return solveLinearSystem(XtX, Xty);
}

// ── walk-forward ────────────────────────────────────────────────────────

// features: { times, targetClose, targetRet, allFeatureSeries: {name: [...]} }
// where allFeatureSeries already merges fast+fred columns.
// Returns an array of OOS rows: { t, predRet, actualNextRet, targetClose, windowStart }
export function walkForward(times, targetClose, targetRet, featureSeries, featureCols, {
  trainBars = 500, testBars = 100, stepBars = 100, zWindow = 250,
} = {}) {
  const n = times.length;
  const zCols = {};
  for (const c of featureCols) zCols[c] = rollingZ(featureSeries[c] || new Array(n).fill(null), zWindow);

  const fwd = new Array(n).fill(null); // targetRet shifted -1 (next bar's return)
  for (let i = 0; i < n - 1; i++) fwd[i] = targetRet[i + 1];

  const rows = [];
  let start = 0;
  while (start + trainBars + testBars <= n) {
    const trainIdx = [];
    for (let i = start; i < start + trainBars; i++) {
      if (fwd[i] == null) continue;
      if (featureCols.every(c => zCols[c][i] != null)) trainIdx.push(i);
    }
    if (trainIdx.length >= Math.max(60, Math.floor(trainBars / 4))) {
      const X = trainIdx.map(i => [1, ...featureCols.map(c => zCols[c][i])]);
      const y = trainIdx.map(i => fwd[i]);
      const coef = olsFit(X, y);

      for (let i = start + trainBars; i < start + trainBars + testBars; i++) {
        if (!featureCols.every(c => zCols[c][i] != null)) continue;
        const xi = [1, ...featureCols.map(c => zCols[c][i])];
        const pred = xi.reduce((s, v, idx) => s + v * coef[idx], 0);
        rows.push({
          idx: i, t: times[i], predRet: pred, actualNextRet: fwd[i],
          targetClose: targetClose[i], windowStart: times[start],
        });
      }
    }
    start += stepBars;
  }
  rows.sort((a, b) => a.idx - b.idx);
  // de-dupe by idx (windows can't overlap given stepBars===testBars in our
  // defaults, but guard anyway if they're changed later).
  const seen = new Set();
  return rows.filter(r => (seen.has(r.idx) ? false : (seen.add(r.idx), true)));
}

// ── fair value: LEVEL regression, walk-forward, forward-projecting ────────

// Predicts NAS100's LEVEL `horizonBars` ahead from TODAY's z-scored macro
// LEVELS (front-end/long-end rate proxies, real yield, USD index, gold,
// curve slope) — structurally different from walkForward() above: a level
// regression on slow-moving macro levels doesn't compound bar-to-bar noise
// into a jagged walk the way a return regression does, so this comes out
// smooth by construction, not by any display-time smoothing on top.
//
// Unlike walkForward, this ALSO predicts past the end of known history: for
// the most recent `horizonBars` bars, the target (targetClose[i+horizon])
// doesn't exist yet — those rows still get a prediction (a synthesized
// future timestamp), just `scored: false` since there's nothing to grade
// them against yet. That unscored tail IS "a rough expectation of the next
// day or so"; everything before it is the walk-forward track record that
// CAN be judged honestly (feed the scored rows' predRet/actualNextRet into
// oosStats exactly like walkForward's output).
export function levelFairValue(times, targetClose, featureSeries, featureCols, {
  trainBars = 500, testBars = 100, stepBars = 100, zWindow = 250, horizonBars = 8,
} = {}) {
  const n = times.length;
  if (n < 2) return [];
  const zCols = {};
  for (const c of featureCols) zCols[c] = rollingZ(featureSeries[c] || new Array(n).fill(null), zWindow);

  // Median bar spacing, for synthesizing timestamps past the last known bar
  // (weekend gaps would otherwise skew a simple first-vs-second diff).
  const gaps = [];
  for (let i = 1; i < n; i++) gaps.push(times[i] - times[i - 1]);
  gaps.sort((a, b) => a - b);
  const barSeconds = gaps[Math.floor(gaps.length / 2)] || 14400;

  const rows = [];
  let start = 0;
  while (start + trainBars <= n) {
    const trainIdx = [];
    for (let i = start; i < start + trainBars; i++) {
      if (targetClose[i + horizonBars] == null) continue;   // no known outcome yet -> can't train on it
      if (featureCols.every(c => zCols[c][i] != null)) trainIdx.push(i);
    }
    const testEnd = Math.min(start + trainBars + testBars, n);
    if (trainIdx.length >= Math.max(60, Math.floor(trainBars / 4))) {
      const X = trainIdx.map(i => [1, ...featureCols.map(c => zCols[c][i])]);
      const y = trainIdx.map(i => targetClose[i + horizonBars]);
      const coef = olsFit(X, y);

      for (let i = start + trainBars; i < testEnd; i++) {
        if (!featureCols.every(c => zCols[c][i] != null)) continue;
        const xi = [1, ...featureCols.map(c => zCols[c][i])];
        const predLevel = xi.reduce((s, v, idx) => s + v * coef[idx], 0);
        const hasActual = (i + horizonBars) < n && targetClose[i + horizonBars] != null;
        rows.push({
          idx: i,
          t: hasActual ? times[i + horizonBars] : times[i] + horizonBars * barSeconds,
          v: predLevel,
          scored: hasActual,
          predRet: Math.log(predLevel / targetClose[i]),
          actualNextRet: hasActual ? Math.log(targetClose[i + horizonBars] / targetClose[i]) : null,
        });
      }
    }
    start += stepBars;
  }
  rows.sort((a, b) => a.t - b.t);
  const seen = new Set();
  return rows.filter(r => (seen.has(r.idx) ? false : (seen.add(r.idx), true)));
}

// ── stats (ported from analysis/yield_asset_coupling.py) ───────────────

function rankOf(arr) {
  const idx = arr.map((v, i) => i).sort((a, b) => arr[a] - arr[b]);
  const ranks = new Array(arr.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && arr[idx[j + 1]] === arr[idx[i]]) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k]] = avgRank;
    i = j + 1;
  }
  return ranks;
}

function rankZ(arr) {
  const r = rankOf(arr);
  const mu = r.reduce((a, b) => a + b, 0) / r.length;
  const centered = r.map(v => v - mu);
  const sd = Math.sqrt(centered.reduce((a, b) => a + b * b, 0) / centered.length);
  return sd > 0 ? centered.map(v => v / sd) : centered;
}

function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

// mulberry32 — small deterministic PRNG (seed fixed so repeated exports are
// reproducible; not cryptographic, doesn't need to be).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nullP(xz, yz, ic, nNull, rng) {
  const n = xz.length;
  if (n < 120) return null;
  let hits = 0;
  for (let k = 0; k < nNull; k++) {
    const off = 30 + Math.floor(rng() * (n - 60));
    let s = 0;
    for (let i = 0; i < n; i++) s += xz[(i + off) % n] * yz[i];
    if (Math.abs(s / n) >= Math.abs(ic)) hits++;
  }
  return hits / nNull;
}

// oos: array of {predRet, actualNextRet, ...}
export function oosStats(oos, { nNull = 2000, seed = 7 } = {}) {
  const d = oos.filter(r => r.predRet != null && r.actualNextRet != null);
  const n = d.length;
  if (n < 60) return { n, ic: null, hit: null, t: null, p_null: null, stable: null };

  const x = d.map(r => r.predRet), y = d.map(r => r.actualNextRet);
  const xz = rankZ(x), yz = rankZ(y);
  const ic = dot(xz, yz) / n;
  const t = ic * Math.sqrt(Math.max(0, n - 2)) / Math.max(1e-9, Math.sqrt(Math.max(1e-9, 1 - ic * ic)));
  let hits = 0;
  for (let i = 0; i < n; i++) if (Math.sign(x[i]) === Math.sign(y[i])) hits++;
  const hit = hits / n;

  const half = Math.floor(n / 2);
  const ic1 = half > 30 ? dot(rankZ(x.slice(0, half)), rankZ(y.slice(0, half))) / half : null;
  const ic2 = (n - half) > 30 ? dot(rankZ(x.slice(half)), rankZ(y.slice(half))) / (n - half) : null;
  const stable = ic1 != null && ic2 != null && Math.sign(ic1) === Math.sign(ic2) && Math.min(Math.abs(ic1), Math.abs(ic2)) > 0.02;

  const rng = mulberry32(seed);
  const p_null = Math.abs(ic) >= 0.02 ? nullP(xz, yz, ic, nNull, rng) : null;

  const round = (v, p) => (v == null ? null : Number(Number(v).toFixed(p)));
  return {
    n, ic: round(ic, 4), t: round(t, 3), hit: round(hit, 4),
    p_null: round(p_null, 4), ic_h1: round(ic1, 4), ic_h2: round(ic2, 4), stable,
  };
}

// Re-anchors the cumulative predicted path to the ACTUAL close at the start
// of every walk-forward test window. The value plotted at bar t_i is built
// only from predictions made strictly BEFORE t_i (predRet shifted by one
// before the cumsum) — without the shift, row i's own predRet (which
// targets t_{i+1}) would leak into the value plotted at t_i.
//
// Returns an ARRAY OF SEGMENTS (one per window), not one flat series. Each
// reset re-anchors to the real price, which is the whole point — if a
// window's cumulative drift wandered far from reality by its last bar, the
// NEXT window still starts fresh at the true close. Flattening that into one
// line would draw a straight connecting segment across the reset — a
// vertical "cliff" that looks like a rendering bug, not the reset it
// actually is. Callers must render each segment as its own line so a reset
// shows up as a gap, never a connector.
export function anchoredWindowPath(oos) {
  const byWindow = new Map();
  for (const r of oos) {
    if (!byWindow.has(r.windowStart)) byWindow.set(r.windowStart, []);
    byWindow.get(r.windowStart).push(r);
  }
  const segments = [...byWindow.values()].map(grp => {
    grp.sort((a, b) => a.idx - b.idx);
    const anchor = grp[0].targetClose;
    let cum = 0;
    const seg = [];
    for (let i = 0; i < grp.length; i++) {
      seg.push({ t: grp[i].t, v: anchor * Math.exp(cum) });
      if (grp[i].predRet != null) cum += grp[i].predRet;
    }
    return seg;
  });
  segments.sort((a, b) => a[0].t - b[0].t);
  return segments;
}

// Per-bar 1-step-ahead forecast, plotted AT the bar it was made from (so it
// visually leads the realized close one bar later) — the direct test of
// "does the line arrive before the candle."
export function nextBarPredPrice(oos) {
  return oos
    .filter(r => r.predRet != null)
    .map(r => ({ t: r.t, v: r.targetClose * Math.exp(r.predRet) }))
    .sort((a, b) => a.t - b.t);
}
