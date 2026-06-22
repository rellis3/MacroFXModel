// js/nasdaqTransforms.js
//
// Pure math/statistics primitives for the NASDAQ Liquidity Continuation
// Framework. No I/O, no config, no shared state — every function here is a
// deterministic transform of plain arrays of numbers. Keeping this layer
// pure means that if a gate's score ever looks wrong, the bug is locatable
// either in nasdaqConfig.js (a wrong threshold/weight) or in exactly one
// named function here — never in an opaque blend of the two.
//
// This module does not import from, or share logic with, any other
// backtest/gate system already in this repository.

export function clip(x, lo, hi) {
  if (!Number.isFinite(x)) return x;
  return Math.min(hi, Math.max(lo, x));
}

export function lastFinite(arr, fallback = null) {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (Number.isFinite(arr[i])) return arr[i];
  }
  return fallback;
}

export function mean(arr) {
  const f = arr.filter(Number.isFinite);
  return f.length ? f.reduce((a, b) => a + b, 0) / f.length : NaN;
}

export function std(arr) {
  const f = arr.filter(Number.isFinite);
  if (!f.length) return NaN;
  const m = mean(f);
  return Math.sqrt(f.reduce((a, b) => a + (b - m) ** 2, 0) / f.length);
}

// % change vs. `period` bars ago. NaN wherever the lookback isn't available.
export function roc(arr, period) {
  const out = new Array(arr.length).fill(NaN);
  for (let i = period; i < arr.length; i++) {
    const prev = arr[i - period];
    if (Number.isFinite(prev) && prev !== 0 && Number.isFinite(arr[i])) {
      out[i] = (arr[i] - prev) / Math.abs(prev);
    }
  }
  return out;
}

export function diff(arr, period = 1) {
  const out = new Array(arr.length).fill(NaN);
  for (let i = period; i < arr.length; i++) {
    if (Number.isFinite(arr[i]) && Number.isFinite(arr[i - period])) {
      out[i] = arr[i] - arr[i - period];
    }
  }
  return out;
}

export function sma(arr, period) {
  const out = new Array(arr.length).fill(NaN);
  for (let i = 0; i < arr.length; i++) {
    if (i + 1 < period) continue;
    const win = arr.slice(i - period + 1, i + 1);
    if (win.some(v => !Number.isFinite(v))) continue;
    out[i] = win.reduce((a, b) => a + b, 0) / period;
  }
  return out;
}

export function ema(arr, period) {
  const out = new Array(arr.length).fill(NaN);
  const k = 2 / (period + 1);
  let prev = null;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (!Number.isFinite(v)) { out[i] = prev; continue; }
    prev = prev === null ? v : v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function stdev(arr, period) {
  const out = new Array(arr.length).fill(NaN);
  for (let i = 0; i < arr.length; i++) {
    if (i + 1 < period) continue;
    const win = arr.slice(i - period + 1, i + 1);
    if (win.some(v => !Number.isFinite(v))) continue;
    const m = win.reduce((a, b) => a + b, 0) / period;
    out[i] = Math.sqrt(win.reduce((a, b) => a + (b - m) ** 2, 0) / period);
  }
  return out;
}

// z-score of arr[i] vs. the trailing `period` window (population stats),
// optionally clipped to +/- clipAt std devs (LIQUIDITY_SCORE.zClip uses this).
export function rollingZScore(arr, period, clipAt = null) {
  const out = new Array(arr.length).fill(NaN);
  for (let i = 0; i < arr.length; i++) {
    if (i + 1 < period || !Number.isFinite(arr[i])) continue;
    const win = arr.slice(i - period + 1, i + 1).filter(Number.isFinite);
    if (win.length < period) continue;
    const m = win.reduce((a, b) => a + b, 0) / win.length;
    const sd = Math.sqrt(win.reduce((a, b) => a + (b - m) ** 2, 0) / win.length);
    let z = sd > 0 ? (arr[i] - m) / sd : 0;
    if (clipAt != null) z = clip(z, -clipAt, clipAt);
    out[i] = z;
  }
  return out;
}

// percentile rank (0-100) of arr[i] within its trailing `period` window.
export function rollingPercentile(arr, period) {
  const out = new Array(arr.length).fill(NaN);
  for (let i = 0; i < arr.length; i++) {
    if (i + 1 < period || !Number.isFinite(arr[i])) continue;
    const win = arr.slice(i - period + 1, i + 1).filter(Number.isFinite);
    if (win.length < period) continue;
    const below = win.filter(v => v <= arr[i]).length;
    out[i] = (below / win.length) * 100;
  }
  return out;
}

export function addDays(isoDate, days) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Shifts a raw {date, value} print series forward by its real-world
// publication lag so a backtest can never see a number before the market
// actually could have. The returned `date` is the *availability* date.
export function applyPublicationLag(series, lagDays) {
  return series.map(({ date, value }) => ({ date: addDays(date, lagDays), value }));
}

// Aligns an ascending availability-dated series onto an ascending target
// calendar via as-of forward fill (NaN before the first available print).
export function forwardFillOnto(series, targetDates) {
  const out = new Array(targetDates.length).fill(NaN);
  let si = 0;
  let current = NaN;
  for (let ti = 0; ti < targetDates.length; ti++) {
    while (si < series.length && series[si].date <= targetDates[ti]) {
      current = series[si].value;
      si++;
    }
    out[ti] = current;
  }
  return out;
}

// Forward-fills gaps within an already date-aligned numeric array.
export function forwardFill(arr) {
  const out = arr.slice();
  let last = NaN;
  for (let i = 0; i < out.length; i++) {
    if (Number.isFinite(out[i])) last = out[i];
    else out[i] = last;
  }
  return out;
}

// ── True Range / ATR / ADX (Wilder's originals) ─────────────────────────────

export function trueRange(high, low, close) {
  const out = new Array(high.length).fill(NaN);
  for (let i = 0; i < high.length; i++) {
    if (i === 0 || !Number.isFinite(close[i - 1])) { out[i] = high[i] - low[i]; continue; }
    out[i] = Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i - 1]),
      Math.abs(low[i] - close[i - 1]),
    );
  }
  return out;
}

function wilderSmooth(arr, period) {
  const out = new Array(arr.length).fill(NaN);
  let prev = null;
  let seedSum = 0, seedCount = 0;
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isFinite(arr[i])) continue;
    if (prev === null) {
      seedSum += arr[i];
      seedCount++;
      if (seedCount === period) { prev = seedSum / period; out[i] = prev; }
      continue;
    }
    prev = (prev * (period - 1) + arr[i]) / period;
    out[i] = prev;
  }
  return out;
}

export function atr(high, low, close, period) {
  return wilderSmooth(trueRange(high, low, close), period);
}

export function adx(high, low, close, period) {
  const n = high.length;
  const plusDM = new Array(n).fill(0);
  const minusDM = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const upMove = high[i] - high[i - 1];
    const downMove = low[i - 1] - low[i];
    plusDM[i] = (upMove > downMove && upMove > 0) ? upMove : 0;
    minusDM[i] = (downMove > upMove && downMove > 0) ? downMove : 0;
  }
  const trS = wilderSmooth(trueRange(high, low, close), period);
  const pdmS = wilderSmooth(plusDM, period);
  const mdmS = wilderSmooth(minusDM, period);
  const plusDI = new Array(n).fill(NaN);
  const minusDI = new Array(n).fill(NaN);
  const dx = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(trS[i]) || trS[i] === 0) continue;
    plusDI[i] = 100 * pdmS[i] / trS[i];
    minusDI[i] = 100 * mdmS[i] / trS[i];
    const sum = plusDI[i] + minusDI[i];
    dx[i] = sum > 0 ? (100 * Math.abs(plusDI[i] - minusDI[i]) / sum) : 0;
  }
  return { plusDI, minusDI, adx: wilderSmooth(dx, period) };
}

// ── Hurst exponent via rescaled-range (R/S) analysis ────────────────────────

export function olsSlope(x, y) {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (x[i] - mx) * (y[i] - my); den += (x[i] - mx) ** 2; }
  const slope = den > 0 ? num / den : NaN;
  return { slope, intercept: my - slope * mx };
}

export function hurstExponent(returns, minChunk = 8) {
  const n = returns.length;
  if (n < minChunk * 4) return NaN;
  const chunkSizes = [];
  for (let size = minChunk; size <= Math.floor(n / 2); size = Math.ceil(size * 1.5)) {
    chunkSizes.push(size);
  }
  const logs = [];
  for (const size of chunkSizes) {
    const numChunks = Math.floor(n / size);
    if (numChunks < 1) continue;
    let rsSum = 0, rsCount = 0;
    for (let c = 0; c < numChunks; c++) {
      const chunk = returns.slice(c * size, (c + 1) * size);
      const m = chunk.reduce((a, b) => a + b, 0) / size;
      let cumDev = 0, maxDev = -Infinity, minDev = Infinity, sqSum = 0;
      for (const r of chunk) {
        cumDev += (r - m);
        if (cumDev > maxDev) maxDev = cumDev;
        if (cumDev < minDev) minDev = cumDev;
        sqSum += (r - m) ** 2;
      }
      const range = maxDev - minDev;
      const sd = Math.sqrt(sqSum / size);
      if (sd > 0) { rsSum += range / sd; rsCount++; }
    }
    if (rsCount > 0) logs.push([Math.log(size), Math.log(rsSum / rsCount)]);
  }
  if (logs.length < 3) return NaN;
  return olsSlope(logs.map(l => l[0]), logs.map(l => l[1])).slope;
}

// ── GARCH(1,1) via grid search + coordinate-descent refinement ─────────────
// Deliberately avoids an external numerical-optimizer dependency — favors a
// simple, auditable estimation procedure over a more "accurate" black box,
// per the framework's "simple over complex" mandate.

function clampUnit(x) { return Math.min(0.99, Math.max(0.001, x)); }

export function garch11(returns) {
  const r = returns.filter(Number.isFinite);
  const n = r.length;
  if (n < 50) return null;
  const meanR = r.reduce((a, b) => a + b, 0) / n;
  const demeaned = r.map(x => x - meanR);
  const sampleVar = demeaned.reduce((a, b) => a + b * b, 0) / n;

  function negLogLik(alpha, beta, omega) {
    let h = sampleVar;
    let ll = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) h = omega + alpha * demeaned[i - 1] ** 2 + beta * h;
      if (!(h > 0)) return Infinity;
      ll += -0.5 * (Math.log(2 * Math.PI) + Math.log(h) + (demeaned[i] ** 2) / h);
    }
    return -ll;
  }

  let best = { alpha: 0.05, beta: 0.90, omega: sampleVar * 0.05, nll: Infinity };
  for (const alpha of [0.02, 0.05, 0.08, 0.12, 0.18]) {
    for (const beta of [0.70, 0.80, 0.85, 0.90, 0.95]) {
      if (alpha + beta >= 0.999) continue;
      const omega = sampleVar * (1 - alpha - beta);
      if (omega <= 0) continue;
      const nll = negLogLik(alpha, beta, omega);
      if (nll < best.nll) best = { alpha, beta, omega, nll };
    }
  }

  let { alpha, beta, omega, nll } = best;
  for (const step of [0.02, 0.01, 0.005]) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const [da, db] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
        const a2 = clampUnit(alpha + da), b2 = clampUnit(beta + db);
        if (a2 + b2 >= 0.999) continue;
        const o2 = sampleVar * (1 - a2 - b2);
        if (o2 <= 0) continue;
        const nll2 = negLogLik(a2, b2, o2);
        if (nll2 < nll) { alpha = a2; beta = b2; omega = o2; nll = nll2; improved = true; }
      }
    }
  }

  const condVar = new Array(n).fill(sampleVar);
  for (let i = 1; i < n; i++) {
    condVar[i] = omega + alpha * demeaned[i - 1] ** 2 + beta * condVar[i - 1];
  }
  const forecastVar = omega + alpha * demeaned[n - 1] ** 2 + beta * condVar[n - 1];
  return {
    alpha, beta, omega,
    persistence: alpha + beta,
    condVar,
    forecastVol: Math.sqrt(forecastVar),
    unconditionalVol: Math.sqrt(sampleVar),
  };
}

// ── Session VWAP ─────────────────────────────────────────────────────────────
// `bars` must already be sliced to a single session — VWAP resets per call.
export function sessionVWAP(bars) {
  const out = new Array(bars.length).fill(NaN);
  let cumPV = 0, cumVol = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const typical = (b.high + b.low + b.close) / 3;
    // Unit-volume fallback for feeds with no real volume (e.g. some FX/index proxies).
    const vol = Number.isFinite(b.volume) && b.volume > 0 ? b.volume : 1;
    cumPV += typical * vol;
    cumVol += vol;
    out[i] = cumVol > 0 ? cumPV / cumVol : NaN;
  }
  return out;
}

// ── Generic linear-ramp composite scoring (Gate 2 / Gate 4 building block) ─
// Maps a raw value onto a 0-100 sub-score via a linear ramp between two
// config-defined anchors (clipped outside the range). `low > high` encodes a
// "lower raw value is better" component — same primitive, no special-casing.
export function rampScore(value, low, high) {
  if (!Number.isFinite(value) || low === high) return null;
  const t = (value - low) / (high - low);
  return clip(t * 100, 0, 100);
}

// Weighted composite of ramp-scored components. `components` is a list of
// {id, weight, rampLow, rampHigh}; `valuesById` maps id -> raw value. Missing
// inputs are excluded from both the numerator and the weight total (never
// treated as zero) — the same weight-present coverage policy used everywhere
// else in this framework, so a component with no data simply abstains.
export function compositeRampScore(valuesById, components) {
  const totalWeight = components.reduce((a, c) => a + c.weight, 0);
  let weightedSum = 0, weightPresent = 0;
  const breakdown = [];
  for (const c of components) {
    const raw = valuesById[c.id];
    const sub = rampScore(raw, c.rampLow, c.rampHigh);
    breakdown.push({ id: c.id, label: c.label, weight: c.weight, rawValue: Number.isFinite(raw) ? raw : null, subScore: sub });
    if (sub != null) { weightedSum += c.weight * sub; weightPresent += c.weight; }
  }
  const coverage = totalWeight > 0 ? weightPresent / totalWeight : 0;
  const score = weightPresent > 0 ? weightedSum / weightPresent : null;
  return { score, coverage, breakdown };
}

// ── Correlation utilities (lead-lag study, feature importance) ─────────────

export function pearsonCorr(x, y) {
  const pairs = [];
  for (let i = 0; i < x.length; i++) if (Number.isFinite(x[i]) && Number.isFinite(y[i])) pairs.push([x[i], y[i]]);
  const n = pairs.length;
  if (n < 3) return NaN;
  const mx = pairs.reduce((a, p) => a + p[0], 0) / n;
  const my = pairs.reduce((a, p) => a + p[1], 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (const [a, b] of pairs) { num += (a - mx) * (b - my); dx += (a - mx) ** 2; dy += (b - my) ** 2; }
  return (dx > 0 && dy > 0) ? num / Math.sqrt(dx * dy) : NaN;
}

function rank(arr) {
  const idx = arr.map((_, i) => i).sort((a, b) => arr[a] - arr[b]);
  const ranks = new Array(arr.length);
  for (let i = 0; i < idx.length; i++) ranks[idx[i]] = i + 1;
  return ranks;
}

export function spearmanCorr(x, y) {
  const pairs = [];
  for (let i = 0; i < x.length; i++) if (Number.isFinite(x[i]) && Number.isFinite(y[i])) pairs.push([x[i], y[i]]);
  if (pairs.length < 3) return NaN;
  return pearsonCorr(rank(pairs.map(p => p[0])), rank(pairs.map(p => p[1])));
}

// Two-sided t-stat for a correlation coefficient under the null r=0.
export function corrTStat(r, n) {
  if (!Number.isFinite(r) || n < 4 || Math.abs(r) >= 1) return NaN;
  return r * Math.sqrt((n - 2) / (1 - r * r));
}

// ── Deterministic PRNG ───────────────────────────────────────────────────────
// Shared by the synthetic self-test dataset (nasdaqDataSources.js) and the
// Monte Carlo bootstrap (nasdaqPerformance.js) — same seed always reproduces
// the same sequence, which both callers rely on.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
