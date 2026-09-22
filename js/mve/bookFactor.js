// mve/bookFactor.js — MVE Phase 7, the BOOK layer. Pure: no I/O, no network, no DOM.
//
// The MVE's phases 0-6 value ONE instrument at a time (fair value → residual →
// mispricing → OU). This module is the missing book-level half of the "Mean
// Reversion of Residuals" lesson (education/mean-reversion-of-residuals-notes.md,
// slides 17-23 and 32): take the positions a set of sleeves wants, express them in
// CURRENCY space, measure how much of the book is really a bet on the shared
// currency factors (USD / risk), and build the factor-neutral version of the same
// book so the two can be compared out of sample.
//
// Currency space (no pair double counted): 8 currencies, built from the 7 USD majors.
//   r_c = log return of currency c vs USD (USD = 0);  x_c = r_c − mean of the 8.
// A position of +1 in EURUSD is +1 EUR / −1 USD; +1 USDJPY is +1 USD / −1 JPY — so
// any USD-pair book already has Σw = 0 in currency space, and any Σw = 0 currency
// vector maps back EXACTLY onto the 7 USD majors (currencyToPair).
//
// Per day t (decision at the close of t, applied to the return of t+1, so nothing
// after t is used):  window = the `window` currency returns ending at t → basket
// de-mean → standardise → correlation PCA (diversificationCore.symmetricEigen) →
// top-K eigenvectors V. Raw-return factor exposure of a currency book w is
// e_k = Σ_i w_i·sd_i·V_ik; the neutral book is the projection of w off
// [sd⊙V_1 … sd⊙V_K, 1] (the general projection, since sd⊙V is not orthonormal).
//
// Deliberately NO return attribution (factor P&L = exposure × factor return): with
// only 8 currencies the factors are built from the same 8 series and "USD" is minus
// the basket average, so one currency's own move leaks into every factor return —
// on synthetic data it ranked a pure relative-value sleeve as MORE factor-driven
// than a pure dollar bet. The verdict uses the neutral-book comparison instead,
// which classified both synthetic cases correctly (bookFactor.test.mjs).
//
// Unit-tested on synthetic data in js/mve/bookFactor.test.mjs. Pre-registration of
// the real run: MD files/MVE_BOOK_FACTOR_AUDIT.md.

import { symmetricEigen, correlationMatrix } from '../diversificationCore.js';
import { mulberry32 } from '../statsCore.js';
import { solve } from './linalg.js';

export const CCYS = ['USD', 'EUR', 'GBP', 'AUD', 'NZD', 'JPY', 'CAD', 'CHF'];
// pairKey → [currency, sign]: currency-vs-USD log return = sign × pair log return.
export const USD_MAJORS = {
  eurusd: ['EUR', 1], gbpusd: ['GBP', 1], audusd: ['AUD', 1], nzdusd: ['NZD', 1],
  usdjpy: ['JPY', -1], usdcad: ['CAD', -1], usdchf: ['CHF', -1],
};
const CCY_IDX = Object.fromEntries(CCYS.map((c, i) => [c, i]));

export const BOOK_DEFAULTS = {
  window: 120,        // lesson slide 32
  noiseSims: 500,     // noise-band draws (lesson slide 7)
  noisePctl: 95,
  deadBand: 0.2,      // shadow residual sleeve only (lesson slide 32)
  cap: 1.5,
  seed: 0x5eed,
};

// ── data shaping ────────────────────────────────────────────────────────────
// closesByPair: { pairKey: [{date, close}] } → dates present for EVERY major, and
// each pair's closes aligned to them. Dropping a date drops it for all pairs, so
// the next return spans the gap for every pair together (stays synchronised).
// Weekend dates are dropped by default: M1 → daily on UTC dates turns the ~2h Sunday
// open into its own stub "day" (found on the first real run: 3,331 rows vs ~2,740
// weekdays), which distorts every window's vol/correlation. Dropping it rolls the
// Sunday move into Monday's return.
export function alignCloses(closesByPair, pairs = Object.keys(USD_MAJORS), { weekdaysOnly = true } = {}) {
  const maps = pairs.map(p => new Map((closesByPair[p] || []).map(r => [r.date, r.close])));
  const isWeekday = d => { const g = new Date(d + 'T00:00:00Z').getUTCDay(); return g !== 0 && g !== 6; };
  const dates = [...maps[0].keys()]
    .filter(d => (!weekdaysOnly || isWeekday(d)) && maps.every(m => Number.isFinite(m.get(d)) && m.get(d) > 0)).sort();
  const closes = Object.fromEntries(pairs.map((p, j) => [p, dates.map(d => maps[j].get(d))]));
  return { dates, closes };
}

// → { dates (return dates, i.e. aligned dates[1..]), R: n×8 currency-vs-USD log
//     returns, pairRet: { pairKey: simple returns } }
export function currencyReturns(aligned) {
  const { dates, closes } = aligned;
  const n = dates.length - 1;
  const R = Array.from({ length: n }, () => new Array(CCYS.length).fill(0));
  const pairRet = {};
  for (const [p, [ccy, sign]] of Object.entries(USD_MAJORS)) {
    const c = closes[p];
    if (!c) continue;
    pairRet[p] = new Array(n);
    for (let t = 0; t < n; t++) {
      R[t][CCY_IDX[ccy]] = sign * Math.log(c[t + 1] / c[t]);
      pairRet[p][t] = c[t + 1] / c[t] - 1;
    }
  }
  return { dates: dates.slice(1), R, pairRet };
}

// ── per-window factor model ─────────────────────────────────────────────────
function colStats(X) {
  const n = X.length, m = X[0].length;
  const mu = new Array(m).fill(0), sd = new Array(m).fill(0);
  for (const row of X) for (let j = 0; j < m; j++) mu[j] += row[j] / n;
  for (const row of X) for (let j = 0; j < m; j++) sd[j] += (row[j] - mu[j]) ** 2;
  for (let j = 0; j < m; j++) sd[j] = Math.sqrt(sd[j] / (n - 1));
  return { mu, sd };
}

export function basketDemean(X) {
  return X.map(row => { const a = row.reduce((s, v) => s + v, 0) / row.length; return row.map(v => v - a); });
}

// Xwin: rows of currency-vs-USD returns. Returns the standardised-window PCA:
// { mu, sd (of basket returns), values, vectors (descending), shares, cov }.
export function windowFactors(Xwin) {
  const X = basketDemean(Xwin);
  const { mu, sd } = colStats(X);
  const m = sd.length;
  const cols = Array.from({ length: m }, (_, j) => X.map(r => r[j]));
  const C = correlationMatrix(cols);
  const { values, vectors } = symmetricEigen(C);
  const tot = values.reduce((s, v) => s + Math.max(v, 0), 0);
  return { X, mu, sd, C, values, vectors, shares: values.map(v => Math.max(v, 0) / tot) };
}

// 95th-percentile eigenvalue share per rank from pure noise run through the SAME
// procedure (basket de-mean → standardise → correlation PCA).
export function noiseBand(nObs, nSer = CCYS.length, { sims = BOOK_DEFAULTS.noiseSims, pctl = BOOK_DEFAULTS.noisePctl, seed = BOOK_DEFAULTS.seed } = {}) {
  const rng = mulberry32(seed);
  const gauss = () => { let u = 0; while (u === 0) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); };
  const byRank = Array.from({ length: nSer }, () => []);
  for (let s = 0; s < sims; s++) {
    const E = Array.from({ length: nObs }, () => Array.from({ length: nSer }, gauss));
    const { shares } = windowFactors(E);
    shares.forEach((v, k) => byRank[k].push(v));
  }
  return byRank.map(a => { a.sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(pctl / 100 * a.length))]; });
}

export function kBeatingNoise(shares, band) {
  let k = 0;
  while (k < shares.length && shares[k] > band[k]) k++;
  return k;
}

// Pre-registered K rule: per window, count leading components above the noise band;
// K = median of that count over windows ending before `uptoIdx` (the IS period only).
export function chooseK(R, window, band, uptoIdx = R.length) {
  const ks = [];
  for (let t = window - 1; t < Math.min(uptoIdx, R.length); t++) {
    ks.push(kBeatingNoise(windowFactors(R.slice(t - window + 1, t + 1)).shares, band));
  }
  const sorted = ks.slice().sort((a, b) => a - b);
  const hist = {};
  for (const k of ks) hist[k] = (hist[k] || 0) + 1;
  return { K: sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : 0, hist, windows: ks.length };
}

// ── pair ↔ currency ─────────────────────────────────────────────────────────
// Any pair whose both legs are in CCYS is accepted (e.g. eurgbp = +EUR −GBP).
export function pairToCurrency(posByPair) {
  const w = new Array(CCYS.length).fill(0);
  for (const [p, v] of Object.entries(posByPair || {})) {
    if (!v) continue;
    const b = CCY_IDX[p.slice(0, 3).toUpperCase()], q = CCY_IDX[p.slice(3, 6).toUpperCase()];
    if (b == null || q == null) throw new Error(`pairToCurrency: unknown pair ${p}`);
    w[b] += v; w[q] -= v;
  }
  return w;
}

// Σw = 0 currency vector → positions in the 7 USD majors (exact inverse on that set).
export function currencyToPair(w) {
  const out = {};
  for (const [p, [ccy, sign]] of Object.entries(USD_MAJORS)) out[p] = sign * w[CCY_IDX[ccy]];
  return out;
}

export const grossOf = pos => Object.values(pos).reduce((s, v) => s + Math.abs(v), 0);

// w − B(BᵀB)⁻¹Bᵀw  (B given as an array of column vectors)
export function projectOut(w, Bcols) {
  const k = Bcols.length;
  if (!k) return w.slice();
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  const G = Bcols.map(a => Bcols.map(b => dot(a, b)));
  const beta = solve(G, Bcols.map(a => dot(a, w)));
  return w.map((v, i) => v - Bcols.reduce((s, col, j) => s + col[i] * beta[j], 0));
}

// Raw-return exposure columns sd⊙V_k for the top K components, plus the basket (ones).
export function exposureColumns(fm, K) {
  const cols = [];
  for (let k = 0; k < K; k++) cols.push(fm.vectors[k].map((v, i) => v * fm.sd[i]));
  return cols;
}

// Ex-ante share of the book's variance that is factor (lesson slide 20's column):
// factorVar = Σ_k (Σ_i w_i sd_i V_ik)² λ_k ; totalVar = wᵀ D C D w.
export function factorVarianceShare(w, fm, K) {
  const m = w.length;
  const ws = w.map((v, i) => v * fm.sd[i]);
  let tot = 0;
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) tot += ws[i] * fm.C[i][j] * ws[j];
  let fac = 0;
  for (let k = 0; k < K; k++) {
    const e = fm.vectors[k].reduce((s, v, i) => s + v * ws[i], 0);
    fac += e * e * fm.values[k];
  }
  return tot > 1e-18 ? fac / tot : null;
}

// ── sleeves → positions ─────────────────────────────────────────────────────
// A sleeve trade {pair, date (entry close), exitDate (exit close), dir} is held for
// the returns AFTER its entry close up to and including its exit close — so the
// position "after the close of d" is active when entry ≤ d < exit. Flat size 1
// (the sleeves' validated honest stream is flat-sized; z-tier sizing tested worse).
export function positionsAfterClose(trades, dates, { sizeOf = () => 1 } = {}) {
  const byDate = dates.map(() => ({}));
  for (const tr of trades || []) {
    const p = String(tr.pairKey || tr.pair).toLowerCase().replace('/', '');
    const sgn = tr.dir === 'LONG' ? 1 : -1;
    const exit = tr.exitDate || dates[dates.length - 1];
    for (let i = 0; i < dates.length; i++) {
      const d = dates[i];
      if (d >= tr.date && d < exit) byDate[i][p] = (byDate[i][p] || 0) + sgn * sizeOf(tr);
    }
  }
  return byDate;
}

// ── performance ─────────────────────────────────────────────────────────────
export function perf(rets, ppy = 252) {
  const n = rets.length;
  if (n < 2) return { days: n, sharpe: null, annRetPct: null, annVolPct: null, maxDdPct: null, totalPct: null };
  const mean = rets.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  let eq = 1, peak = 1, mdd = 0;
  for (const r of rets) { eq *= 1 + r; peak = Math.max(peak, eq); mdd = Math.min(mdd, eq / peak - 1); }
  return {
    days: n,
    sharpe: sd > 0 ? +(mean / sd * Math.sqrt(ppy)).toFixed(3) : null,
    annRetPct: +(mean * ppy * 100).toFixed(3),
    annVolPct: +(sd * Math.sqrt(ppy) * 100).toFixed(3),
    maxDdPct: +(mdd * 100).toFixed(2),
    totalPct: +((eq - 1) * 100).toFixed(2),
  };
}

function byYear(dates, rets) {
  const out = {};
  dates.forEach((d, i) => { const y = d.slice(0, 4); out[y] = (out[y] || 0) + rets[i]; });
  for (const y in out) out[y] = +(out[y] * 100).toFixed(2);
  return out;
}

// ── one day's hedge (THE single implementation — the backtest walk and the forward
//    tracker both call this, so they cannot drift apart) ──────────────────────
// raw: { pairKey: position } decided at a close; fm: windowFactors() of the window
// ending at that close; K: components to neutralise. Returns the factor-neutral
// book on the 7 USD majors, rescaled to the raw book's gross, plus diagnostics.
export function neutralBook(raw, fm, K) {
  const cols = exposureColumns(fm, K);
  const ones = new Array(CCYS.length).fill(1);
  const w = pairToCurrency(raw);
  const wn = projectOut(w, [...cols, ones]);
  const residPos = currencyToPair(wn);
  const gR = grossOf(raw), gN = grossOf(residPos);
  const neutral = gN > 1e-12 ? Object.fromEntries(Object.entries(residPos).map(([p, v]) => [p, v * gR / gN])) : {};
  const wNeutral = pairToCurrency(neutral);
  return {
    raw, neutral, gross: gR,
    exposurePre: cols.map(c => c.reduce((a, v, i) => a + v * w[i], 0)),
    exposurePost: cols.map(c => c.reduce((a, v, i) => a + v * wNeutral[i], 0)),
    factorVarShare: gR > 1e-12 ? factorVarianceShare(w, fm, K) : null,
  };
}

// ── the book walk ───────────────────────────────────────────────────────────
// Inputs (all pure data):
//   dates, R, pairRet        from currencyReturns(alignCloses(...))
//   books: { name: posAfterClose[] }   aligned to `closeDates` (= the ALIGNED close
//          dates, i.e. [firstCloseDate, ...dates]); built with positionsAfterClose
//   splitDate                OOS starts at the first return date ≥ splitDate
//   costOneWay: { pairKey: fraction of notional per unit of one-way turnover }
//   K: number | 'auto'       'auto' = chooseK on the IS windows only
//   shadowResidual: bool     also run the lesson's own residual loop (test #1) as an
//                            information-only sleeve
// Output per book: raw / neutral / residual-part / factor-part return streams
// (net of costs), IS/OOS perf, exposure diagnostics, per-year net.
export function runBookLayer({
  dates, R, pairRet, books, splitDate, costOneWay = {}, K = 'auto',
  window = BOOK_DEFAULTS.window, band = null, shadowResidual = true,
  deadBand = BOOK_DEFAULTS.deadBand, cap = BOOK_DEFAULTS.cap,
} = {}) {
  const n = R.length;
  if (n < window + 30) throw new Error(`runBookLayer: need > ${window + 30} return days, have ${n}`);
  const nb = band || noiseBand(window, CCYS.length);
  let oosIdx = splitDate ? dates.findIndex(d => d >= splitDate) : Math.floor(n / 2);
  if (oosIdx < 0) oosIdx = n;
  const kInfo = K === 'auto' ? chooseK(R, window, nb, oosIdx) : { K, hist: null, windows: null };
  const KK = kInfo.K;
  const pairs = Object.keys(USD_MAJORS);
  const cost1 = p => costOneWay[p] ?? 0;

  const names = Object.keys(books);
  if (shadowResidual) names.push('pcaResidual');
  const mk = () => ({ gross: [], net: [], prev: {} });
  const st = Object.fromEntries(names.map(nm => [nm, {
    raw: mk(), neutral: mk(),
    exp: [], varShare: [], activeDays: 0,
  }]));
  const outDates = [];
  const turn = (a, b) => { let s = 0; for (const p of new Set([...Object.keys(a), ...Object.keys(b)])) s += Math.abs((a[p] || 0) - (b[p] || 0)) * cost1(p); return s; };
  const pnlOf = (pos, t1) => { let s = 0; for (const [p, v] of Object.entries(pos)) if (v) { const r = pairRet[p]?.[t1]; if (r == null) throw new Error(`no returns for ${p}`); s += v * r; } return s; };
  const push = (acc, pos, t1) => {
    const g = pnlOf(pos, t1);
    const c = turn(pos, acc.prev);
    acc.gross.push(g); acc.net.push(g - c); acc.prev = pos;
  };

  for (let t = window - 1; t < n - 1; t++) {
    const fm = windowFactors(R.slice(t - window + 1, t + 1));
    const cols = exposureColumns(fm, KK);
    const ones = new Array(CCYS.length).fill(1);
    const closeIdx = t + 1;                 // books[] is indexed by CLOSE date; return t ends at close t+1
    outDates.push(dates[t + 1]);

    for (const nm of names) {
      const s = st[nm];
      let raw;
      if (nm === 'pcaResidual') {
        // Lesson slide 32 loop, verbatim: residual path z → lean, dead band, cap,
        // inverse vol, project out K components + basket, gross 1 over currencies.
        const Z = fm.X.map(row => row.map((v, j) => (v - fm.mu[j]) / fm.sd[j]));
        const VK = fm.vectors.slice(0, KK);
        const res = Z.map(z => { const f = VK.map(v => v.reduce((a, b, i) => a + b * z[i], 0)); return z.map((zi, i) => zi - VK.reduce((a, v, k) => a + v[i] * f[k], 0)); });
        const m = CCYS.length;
        const w = new Array(m).fill(0);
        for (let j = 0; j < m; j++) {
          let c = 0; const path = res.map(r => (c += r[j]));
          const mu = path.reduce((a, b) => a + b, 0) / path.length;
          const sd = Math.sqrt(path.reduce((a, b) => a + (b - mu) ** 2, 0) / (path.length - 1));
          const disp = sd > 0 ? (path[path.length - 1] - mu) / sd : 0;
          let target = Math.abs(disp) < deadBand ? 0 : Math.max(-cap, Math.min(cap, -disp));
          w[j] = target / fm.sd[j];
        }
        const wn = projectOut(w, [...cols, ones]);
        const g = wn.reduce((a, b) => a + Math.abs(b), 0);
        raw = currencyToPair(g > 0 ? wn.map(v => v / g) : wn);
      } else {
        raw = books[nm][closeIdx] || {};
      }
      const nb = neutralBook(raw, fm, KK);
      const neutralPos = nb.neutral;
      if (nb.gross > 1e-12) {
        s.activeDays++;
        s.exp.push(nb.exposurePre);
        if (nb.factorVarShare != null) s.varShare.push(nb.factorVarShare);
      }
      push(s.raw, raw, t + 1);
      push(s.neutral, neutralPos, t + 1);
    }
  }

  const iOos = Math.max(0, outDates.findIndex(d => d >= (splitDate || outDates[Math.floor(outDates.length / 2)])));
  const split = arr => ({ IS: perf(arr.slice(0, iOos)), OOS: perf(arr.slice(iOos)) });
  const out = {};
  for (const nm of names) {
    const s = st[nm];
    const meanAbs = k => s.exp.length ? +(s.exp.reduce((a, e) => a + Math.abs(e[k]), 0) / s.exp.length).toFixed(5) : null;
    out[nm] = {
      activeDays: s.activeDays,
      meanAbsFactorExposure: Array.from({ length: KK }, (_, k) => meanAbs(k)),
      meanFactorVarShare: s.varShare.length ? +(s.varShare.reduce((a, b) => a + b, 0) / s.varShare.length).toFixed(3) : null,
      raw: { gross: split(s.raw.gross), net: split(s.raw.net) },
      neutral: { gross: split(s.neutral.gross), net: split(s.neutral.net) },
      rawNetByYear: byYear(outDates, s.raw.net),
      neutralNetByYear: byYear(outDates, s.neutral.net),
      _streams: { dates: outDates, raw: s.raw.net, rawGross: s.raw.gross, neutral: s.neutral.net, neutralGross: s.neutral.gross },
    };
  }
  return {
    K: KK, kHistIS: kInfo.hist, noiseBandPct: nb.map(v => +(v * 100).toFixed(2)),
    window, splitDate: outDates[iOos] || null, days: outDates.length, books: out,
  };
}

// Pre-registered reading (MD files/MVE_BOOK_FACTOR_AUDIT.md §4) for one sleeve book.
export function readBook(b) {
  const n = b.neutral.net, r = b.raw.net;
  const nO = n.OOS.sharpe ?? 0, nI = n.IS.sharpe ?? 0, rO = r.OOS.sharpe ?? 0;
  if (nO >= 0.5 && nI > 0) return { verdict: 'RELATIVE-VALUE', read: `Edge survives factor neutralisation (neutral OOS Sharpe ${nO} vs raw ${rO}, neutral IS ${nI} > 0).` };
  if (nO <= 0.2 && rO >= 0.5) return { verdict: 'FACTOR-DRIVEN', read: `Raw OOS Sharpe ${rO} but neutral only ${nO} — the edge lived in the shared currency factors, not the relative value.` };
  return { verdict: 'MIXED', read: `Neither clean case: raw OOS ${rO}, neutral OOS ${nO}, neutral IS ${nI}.` };
}

// Drop the heavy per-day streams for an API response (keep a light equity curve).
export function publicBookResult(res, { curvePoints = 400 } = {}) {
  const books = {};
  for (const [nm, b] of Object.entries(res.books)) {
    const { _streams, ...rest } = b;
    const stepN = Math.max(1, Math.floor(_streams.dates.length / curvePoints));
    const eq = arr => { let e = 1; return arr.map(r => (e *= 1 + r)); };
    const er = eq(_streams.raw), en = eq(_streams.neutral);
    const curve = [];
    for (let i = 0; i < _streams.dates.length; i += stepN) curve.push([_streams.dates[i], +er[i].toFixed(5), +en[i].toFixed(5)]);
    books[nm] = { ...rest, reading: nm === 'pcaResidual' ? null : readBook(b), curve };
  }
  return { ...res, books };
}
