/**
 * Short-term FX fair value (owner-approved build item 4, 2026-11-04). DESCRIPTION ONLY until the Evidence Book says
 * otherwise: the pages show it labelled with its verdict word and nothing feeds it to the desk as an impact.
 *
 * The model, per pair, refitted every day on the trailing `window` (250) days:
 *
 *     ln(price_t) = a + b1 * (2y_base − 2y_quote)_t + b2 * (10y_base − 10y_quote)_t + b3 * ln(VIX_t) + e_t
 *
 * Why the LEVEL and not the 20-day change: a fair value is a level (a price the pair "should" be at), and the gap
 * between price and that level is the thing the owner asked to test. A 20-day-change regression only gives a fair
 * CHANGE and so has no gap. The cost of a level regression is that two trending series fit well by accident
 * (spurious regression), so the in-window R² overstates the model and the in-window residual looks more
 * mean-reverting than it is. Three things here keep that honest:
 *   1. the gap shown is OUT OF SAMPLE: today's price against coefficients fitted on the 250 days BEFORE today;
 *   2. the half-life is read from the series of those out-of-sample gaps (an AR(1) on them), and the in-window
 *      residual half-life is shown beside it only as the optimistic bound it is;
 *   3. whether the gap closes is a walk-forward test (forge/FX_SHORT_TERM_FAIR_VALUE_PREREG.md), not this file.
 *
 * Pure: no fetch, no DOM. Tested on synthetic series with a planted structure (js/fxFairValue.test.mjs).
 */

/** The pairs both of whose legs have a daily 2y and 10y government yield the server can fetch (js/yieldFeeds.js, FRED,
 *  BoE). GBP's "2y" is the 5-year gilt par yield (BoE IUDSNPY), as on the global yield board: the BoE publishes no
 *  daily 2-year par yield. CHF, NZD, NOK and SEK have no keyless daily 2y feed here, so their pairs are left out. */
export const FV_PAIRS = [
  { id: 'EURUSD', base: 'EUR', quote: 'USD', pip: 0.0001 },
  { id: 'GBPUSD', base: 'GBP', quote: 'USD', pip: 0.0001 },
  { id: 'USDJPY', base: 'USD', quote: 'JPY', pip: 0.01 },
  { id: 'AUDUSD', base: 'AUD', quote: 'USD', pip: 0.0001 },
  { id: 'USDCAD', base: 'USD', quote: 'CAD', pip: 0.0001 },
  { id: 'EURJPY', base: 'EUR', quote: 'JPY', pip: 0.01 },
  { id: 'GBPJPY', base: 'GBP', quote: 'JPY', pip: 0.01 },
  { id: 'AUDJPY', base: 'AUD', quote: 'JPY', pip: 0.01 },
  { id: 'EURGBP', base: 'EUR', quote: 'GBP', pip: 0.0001 },
  { id: 'EURCAD', base: 'EUR', quote: 'CAD', pip: 0.0001 },
];
/** The five the walk-forward test scores (the crosses are linear combinations of these legs). */
export const SCORED_PAIRS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD'];
export const FACTORS = ['2y gap', '10y gap', 'ln VIX'];
/** The Evidence Book id whose verdict word labels the model on every page. */
export const EVIDENCE_ID = 'fx-short-term-fair-value';

const DAY = 864e5;
const fin = Number.isFinite;
const r = (v, dp = 4) => (fin(v) ? +v.toFixed(dp) : null);

/**
 * As-of join: for each spine date, the latest value dated on or before it, or null when that value is older than
 * `maxStaleDays` calendar days (a holiday gap is carried, a dead feed is not). Both inputs ascending by date.
 */
export function asOfJoin(spine, series, maxStaleDays = 5) {
  const out = new Array(spine.length).fill(null);
  let j = -1;
  for (let i = 0; i < spine.length; i++) {
    const d = spine[i];
    while (j + 1 < series.length && series[j + 1].date <= d) j++;
    if (j < 0) continue;
    const p = series[j];
    if (fin(p.value) && (Date.parse(d) - Date.parse(p.date)) / DAY <= maxStaleDays) out[i] = p.value;
  }
  return out;
}

/**
 * Rows for one pair: { date, price, y = ln price, x: [2y gap, 10y gap, ln VIX] } on the FX date spine, keeping only
 * days where every input is present. Inputs ascending [{ date, value }] (fx may be { date, close }).
 * Without 10y series the model drops that factor (x has two columns).
 */
export function buildRows({ fx, y2Base, y2Quote, y10Base = null, y10Quote = null, vix }, { maxStaleDays = 5 } = {}) {
  const px = (fx ?? []).map(p => ({ date: p.date, value: p.value ?? p.close })).filter(p => fin(p.value) && p.value > 0);
  const spine = px.map(p => p.date);
  const j = s => asOfJoin(spine, s ?? [], maxStaleDays);
  const a2 = j(y2Base), b2 = j(y2Quote), v = j(vix);
  const use10 = (y10Base?.length ?? 0) > 0 && (y10Quote?.length ?? 0) > 0;
  const a10 = use10 ? j(y10Base) : null, b10 = use10 ? j(y10Quote) : null;
  const rows = [];
  for (let i = 0; i < spine.length; i++) {
    if (a2[i] == null || b2[i] == null || v[i] == null || !(v[i] > 0)) continue;
    if (use10 && (a10[i] == null || b10[i] == null)) continue;
    const x = [a2[i] - b2[i]]; if (use10) x.push(a10[i] - b10[i]); x.push(Math.log(v[i]));
    rows.push({ date: spine[i], price: px[i].value, y: Math.log(px[i].value), x });
  }
  return rows;
}

/** Solve A·z = b for a small symmetric positive-definite A (Gauss–Jordan with partial pivoting); also returns A⁻¹. */
function invert(A) {
  const n = A.length, M = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c]; for (let k = 0; k < 2 * n; k++) M[c][k] /= d;
    for (let i = 0; i < n; i++) if (i !== c) { const f = M[i][c]; if (f) for (let k = 0; k < 2 * n; k++) M[i][k] -= f * M[c][k]; }
  }
  return M.map(row => row.slice(n));
}

/**
 * OLS with an intercept. X: n × k (no constant column), y: n. Returns coefficients [a, b1..bk], their standard
 * errors, residuals, the residual SD s (n − k − 1 dof), R² and (X'X)⁻¹ for prediction intervals. null if singular.
 */
export function olsFit(X, y) {
  const n = y.length, k = (X[0]?.length ?? 0) + 1;
  if (n <= k + 1) return null;
  const XtX = Array.from({ length: k }, () => new Array(k).fill(0)), Xty = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    const row = [1, ...X[i]];
    for (let a = 0; a < k; a++) { Xty[a] += row[a] * y[i]; for (let b = a; b < k; b++) XtX[a][b] += row[a] * row[b]; }
  }
  for (let a = 0; a < k; a++) for (let b = 0; b < a; b++) XtX[a][b] = XtX[b][a];
  const inv = invert(XtX); if (!inv) return null;
  const beta = inv.map(row => row.reduce((s, v, j) => s + v * Xty[j], 0));
  let ssr = 0, my = 0; for (const v of y) my += v; my /= n;
  let sst = 0;
  const resid = new Array(n);
  for (let i = 0; i < n; i++) { const f = beta[0] + X[i].reduce((s, v, j) => s + v * beta[j + 1], 0); resid[i] = y[i] - f; ssr += resid[i] ** 2; sst += (y[i] - my) ** 2; }
  const s2 = ssr / (n - k);
  return { beta, se: inv.map((row, i) => Math.sqrt(Math.max(0, s2 * row[i]))), resid, s: Math.sqrt(s2), r2: sst > 0 ? 1 - ssr / sst : 0, inv, n, k };
}

/** Fitted value and the OLS prediction SE for a new x (s · √(1 + x'(X'X)⁻¹x)). */
export function predict(fit, x) {
  const row = [1, ...x];
  const yhat = row.reduce((s, v, j) => s + v * fit.beta[j], 0);
  let q = 0; for (let a = 0; a < row.length; a++) for (let b = 0; b < row.length; b++) q += row[a] * fit.inv[a][b] * row[b];
  return { yhat, sePred: fit.s * Math.sqrt(1 + Math.max(0, q)) };
}

/**
 * AR(1) of a series (with an intercept): e_t = c + φ e_{t−1} + u. Half-life = ln ½ / ln φ trading days for
 * 0 < φ < 1. The interval maps φ's bounds through the same formula (lower φ − 1.96 SE; upper φ + 2.86 SE, the
 * Dickey–Fuller 5% value); an upper φ ≥ 1 means the gap may not close at all (half-life upper bound ∞, returned as
 * null with `noReversionInCi: true`). dfT is the Dickey–Fuller t of φ − 1.
 */
export function ar1HalfLife(series) {
  const e = (series ?? []).filter(fin);
  if (e.length < 30) return { ok: false, error: `need >= 30 points, got ${e.length}` };
  const X = e.slice(0, -1).map(v => [v]), y = e.slice(1);
  const f = olsFit(X, y); if (!f) return { ok: false, error: 'singular' };
  // the upper end uses the Dickey–Fuller 5% critical value (−2.86 with a constant), not 1.96: under a unit root φ̂ is
  // biased below 1 and a normal interval would claim reversion on a random walk about a quarter of the time
  const phi = f.beta[1], se = f.se[1], lo = phi - 1.96 * se, hi = phi + 2.86 * se, dfT = (phi - 1) / se;
  const hl = p => (p > 0 && p < 1 ? Math.log(0.5) / Math.log(p) : p >= 1 ? Infinity : 0);
  const H = hl(phi), Hlo = hl(Math.max(lo, 1e-9)), Hhi = hl(hi);
  return { ok: true, n: e.length, phi: r(phi), phiCi: [r(lo), r(hi)], halfLife: fin(H) ? r(H, 1) : null, halfLifeCi: [fin(Hlo) ? r(Hlo, 1) : null, fin(Hhi) ? r(Hhi, 1) : null], dfT: r(dfT, 2), noReversionInCi: hi >= 1 };
}

/**
 * Walk-forward gaps: for each day t with `window` days before it, fit on rows [t − window, t − 1] and price day t.
 * gap = ln price − ln fair (so +0.01 ≈ price 1% ABOVE fair, i.e. rich); z = gap / in-window residual SD.
 * `naive` is the price's distance from its own trailing-window mean log price (the control any fair value must
 * beat: a pure price anchor "reverts" on a random walk's shape too). `step` > 1 refits every `step` days (the
 * coefficients are held in between), for speed in long backtests.
 */
export function rollingGaps(rows, { window = 250, step = 1 } = {}) {
  const out = [];
  let fit = null, lastFit = -Infinity;
  for (let t = window; t < rows.length; t++) {
    if (!fit || t - lastFit >= step) {
      const w = rows.slice(t - window, t);
      fit = olsFit(w.map(q => q.x), w.map(q => q.y));
      lastFit = t;
      if (fit) fit.meanY = w.reduce((s, q) => s + q.y, 0) / w.length;
    }
    if (!fit) continue;
    const p = predict(fit, rows[t].x), gap = rows[t].y - p.yhat;
    out.push({ i: t, date: rows[t].date, price: rows[t].price, fair: Math.exp(p.yhat), gap, z: gap / fit.s, sePred: p.sePred, s: fit.s, r2: fit.r2, beta: fit.beta, naive: rows[t].y - fit.meanY });
  }
  return out;
}

/** How steady the model has been over the last `lastN` daily refits: R² range, and for each factor the share of
 *  fits whose coefficient has today's sign and the coefficient's coefficient of variation. 'stable' = every factor
 *  kept today's sign in ≥ 95% of the fits and R² moved by ≤ 0.25; 'drifting' = every factor ≥ 80%; else 'unstable'. */
export function stability(gaps, lastN = 60) {
  const g = gaps.slice(-lastN); if (g.length < 10) return null;
  const r2 = g.map(x => x.r2).sort((a, b) => a - b), k = g[0].beta.length - 1, now = g.at(-1).beta;
  const factors = Array.from({ length: k }, (_, j) => {
    const b = g.map(x => x.beta[j + 1]), m = b.reduce((s, v) => s + v, 0) / b.length, sd = Math.sqrt(b.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, b.length - 1));
    return { sameSign: r(b.filter(v => Math.sign(v) === Math.sign(now[j + 1])).length / b.length, 2), cv: m !== 0 ? r(Math.abs(sd / m), 2) : null };
  });
  const minSame = Math.min(...factors.map(f => f.sameSign));
  return { n: g.length, r2Min: r(r2[0], 3), r2Median: r(r2[Math.floor(r2.length / 2)], 3), r2Max: r(r2.at(-1), 3), factors, label: minSame >= 0.95 && r2.at(-1) - r2[0] <= 0.25 ? 'stable' : minSame >= 0.8 ? 'drifting' : 'unstable' };
}

/**
 * The read for a page: today's out-of-sample fair value with its 95% prediction band, the gap in pips and %, its
 * z-score, the model's R² and stability, the half-life (AR(1) on the last `hlDays` out-of-sample gaps; the in-window
 * residual half-life beside it), today's betas with SEs, and the last `histDays` of price and fair value for a chart.
 */
export function fairValueNow(rows, { window = 250, pip = 0.0001, hlDays = 250, stabilityDays = 60, histDays = 120, factors = null } = {}) {
  if ((rows?.length ?? 0) < window + 30) return { ok: false, error: `need >= ${window + 30} aligned days, have ${rows?.length ?? 0}` };
  const gaps = rollingGaps(rows, { window });
  const last = gaps.at(-1); if (!last) return { ok: false, error: 'no fit' };
  const w = rows.slice(last.i - window, last.i), fit = olsFit(w.map(q => q.x), w.map(q => q.y));
  const p = predict(fit, rows[last.i].x), fairLn = p.yhat;
  const names = factors ?? (rows[0].x.length === 3 ? FACTORS : [FACTORS[0], FACTORS[2]]);
  const hlOos = ar1HalfLife(gaps.slice(-hlDays).map(x => x.gap)), hlIn = ar1HalfLife(fit.resid);
  const gapPrice = last.price - last.fair;
  return {
    ok: true, date: last.date, window, n: rows.length,
    price: last.price, fair: r(last.fair, 5), band95: [r(Math.exp(fairLn - 1.96 * p.sePred), 5), r(Math.exp(fairLn + 1.96 * p.sePred), 5)],
    gapPips: r(gapPrice / pip, 1), gapPct: r(100 * (last.price / last.fair - 1), 2), z: r(last.z, 2),
    r2: r(fit.r2, 3), residSdPct: r(100 * fit.s, 2), stability: stability(gaps, stabilityDays),
    halfLife: hlOos, halfLifeInSample: hlIn,
    betas: names.map((nm, j) => ({ factor: nm, beta: r(fit.beta[j + 1], 4), se: r(fit.se[j + 1], 4), now: r(rows[last.i].x[j], 3) })),
    history: gaps.slice(-histDays).map(x => ({ date: x.date, price: x.price, fair: r(x.fair, 5), z: r(x.z, 2) })),
  };
}

/**
 * Convergence sample for the walk-forward test: the gap measured on day t (all inputs dated ≤ t) and the pair's log
 * return from t + skip to t + skip + h. skip = 1 leaves a whole day between the signal and the outcome, so a gap
 * built from a later print clock (US yields close after the noon NY FX fix) cannot lend the outcome its own move.
 * Rows after `end` (the lockbox) are never used as signal OR outcome.
 */
export function convergenceSample(rows, gaps, { h, skip = 1, end = null, every = 1 } = {}) {
  const out = [];
  const last = end ? rows.findLastIndex(q => q.date <= end) : rows.length - 1;
  for (let k = 0; k < gaps.length; k += every) {
    const g = gaps[k], a = g.i + skip, b = a + h;
    if (b > last) break;
    out.push({ date: g.date, gap: g.gap, z: g.z, naive: g.naive, fwd: rows[b].y - rows[a].y });
  }
  return out;
}

/** Slope of the forward return on −gap, with an intercept: the share of the gap price closes in h days (0 = none,
 *  1 = all of it). `key` picks the gap column ('gap' or 'naive'). */
export function closureBeta(sample, key = 'gap') {
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const s of sample) { const x = -s[key], y = s.fwd; if (!fin(x) || !fin(y)) continue; n++; sx += x; sy += y; sxx += x * x; sxy += x * y; }
  if (n < 3) return NaN;
  const vx = sxx - (sx * sx) / n; return vx > 0 ? (sxy - (sx * sy) / n) / vx : NaN;
}

/** Closure share implied by a half-life of `hl` trading days over h days: 1 − ½^(h/hl). */
export const closureAt = (h, hl) => 1 - Math.pow(0.5, h / hl);
