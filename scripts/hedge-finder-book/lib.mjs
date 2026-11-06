// hedge-finder-book: shared code. Prereg: forge/HEDGE_FINDER_BOOK_PREREG.md.
//
//   loadPanel()        FRED daily closes -> the Correlations & hedges panel shape ({ dates, syms, closes }) on the H.10
//                      date spine, 1999-01-04 -> 2026-08-21 (lockbox cut), plus every G10 pair the book trades
//   bookDay(...)       the proxy book on day i: 28 G10 pairs, sign of the trailing 60-day return at close i-1, size 1,
//                      then the desk's own per-currency cap (js/deskExposure.js capExposure, cap 4)
//   hedgeOf(...)       the hedge the finder picks for day i from data <= i-1 (js/terminal/corrMath.js bookHedges, w 60)
//   costs              half the measured spread per unit of turnover (analysis/output/costs/spread_profile_hist.json)
//   stats              ES5, max drawdown, Sharpe, a seeded circular moving-block bootstrap
//
// The hedge selection imports the live tab's maths unchanged; nothing here re-implements the ranking.
import fs from 'node:fs';
import * as M from '../../js/terminal/corrMath.js';
import { capExposure } from '../../js/deskExposure.js';
import { DESK_UNIVERSE } from '../../js/deskPack.js';

export const SEED = 20261106;
export const START = '1999-01-04';
export const LOCKBOX_LAST = '2026-08-21';     // data-rules: sessions after this are the H-A holdout
export const SCORE_FROM = '2000-06-01';       // first scored day (60-day signal + 60-day window + 250-day stability)
export const W = 60;                          // the tab's default window (js/terminal/corrView.js ST.win)
export const MOM = 60;                        // the proxy book's trend lookback
export const CAP = 4;                         // the desk's per-currency cap (runDesk exposureCap default)
export const SPLIT = '2013-07-01';            // halves for the concentration check

const DATA = new URL('../../data/hedge-finder-book/', import.meta.url);
const fin = v => v != null && Number.isFinite(v);

// USD value of one unit of each currency, from the H.10 noon rates
const LEGS = { EUR: ['DEXUSEU', 1], GBP: ['DEXUSUK', 1], AUD: ['DEXUSAL', 1], NZD: ['DEXUSNZ', 1], JPY: ['DEXJPUS', -1], CAD: ['DEXCAUS', -1], CHF: ['DEXSZUS', -1] };
export const BOOK_PAIRS = [...DESK_UNIVERSE.fx_majors, ...DESK_UNIVERSE.fx_crosses].filter(p => !/NOK|SEK/.test(p));   // 28 G10 pairs
// the panel's syms (server.js CORR_PAIRS) that have a long keyless daily history; gold, silver, platinum, copper,
// S&P 500, Dow and Russell 2000 do not (prereg §3)
export const PANEL_FX = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'GBPJPY', 'EURGBP', 'EURJPY', 'EURCHF', 'GBPCHF', 'AUDJPY', 'CADJPY'];
export const PANEL_OTHER = { USDCNH: ['DEXCHUS', 1], USDZAR: ['DEXSFUS', 1], WTICO_USD: ['DCOILWTICO', 1], BCO_USD: ['DCOILBRENTEU', 1], NAS100_USD: ['NASDAQ100', 1] };
export const PANEL_MISSING = ['XAUUSD', 'XAGUSD', 'XPTUSD', 'XCUUSD', 'SPX500_USD', 'US30_USD', 'US2000_USD'];

const read = id => new Map(JSON.parse(fs.readFileSync(new URL(`${id}.json`, DATA), 'utf8')).map(p => [p.date, p.value]));

export function loadPanel({ fxOnly = false } = {}) {
  const raw = {};
  for (const id of ['DEXUSEU', 'DEXUSUK', 'DEXJPUS', 'DEXUSAL', 'DEXUSNZ', 'DEXCAUS', 'DEXSZUS', ...Object.values(PANEL_OTHER).map(x => x[0])]) raw[id] = read(id);
  const dates = [...raw.DEXUSEU.keys()].filter(d => d >= START && d <= LOCKBOX_LAST).sort();
  // usd value of each currency on each date (null where its H.10 rate is missing)
  const usd = { USD: dates.map(() => 1) };
  for (const [c, [id, s]] of Object.entries(LEGS)) usd[c] = dates.map(d => { const v = raw[id].get(d); return fin(v) && v > 0 ? (s > 0 ? v : 1 / v) : null; });
  const pairClose = p => { const b = usd[p.slice(0, 3)], q = usd[p.slice(3)]; return dates.map((_, i) => (fin(b[i]) && fin(q[i]) ? b[i] / q[i] : null)); };
  const closes = {};
  for (const p of new Set([...PANEL_FX, ...BOOK_PAIRS])) closes[p] = pairClose(p);
  const syms = [...PANEL_FX];
  if (!fxOnly) for (const [sym, [id]] of Object.entries(PANEL_OTHER)) { syms.push(sym); closes[sym] = dates.map(d => { const v = raw[id].get(d); return fin(v) && v > 0 ? v : null; }); }
  else for (const sym of ['USDCNH', 'USDZAR']) { syms.push(sym); closes[sym] = dates.map(d => { const v = raw[PANEL_OTHER[sym][0]].get(d); return fin(v) && v > 0 ? v : null; }); }
  // forward-filled closes for P&L (a missing print moves the return to the next printed day, never drops it)
  const ff = {};
  for (const [k, c] of Object.entries(closes)) { let last = null; ff[k] = c.map(v => (fin(v) ? (last = v) : last)); }
  const ret = {};
  for (const [k, c] of Object.entries(ff)) ret[k] = c.map((v, i) => (i > 0 && fin(v) && fin(c[i - 1]) ? Math.log(v / c[i - 1]) : 0));
  const panel = { dates, syms, closes: Object.fromEntries(syms.map(s => [s, closes[s]])) };
  return { dates, panel, closes, ff, ret, S: M.series(panel) };
}

// ── the proxy book ──
/** Cards for day i from closes up to i-1: LONG if the trailing MOM-day log return is > 0, SHORT if < 0, size 1. */
export function bookCards(ff, i) {
  const cards = {};
  for (const p of BOOK_PAIRS) {
    const a = ff[p][i - 1], b = ff[p][i - 1 - MOM];
    if (!fin(a) || !fin(b)) continue;
    const m = Math.log(a / b);
    if (m !== 0) cards[p] = { rating: m > 0 ? 'LONG' : 'SHORT', size: 1 };
  }
  return capExposure(cards, { cap: CAP });
}
/** Signed position per pair (+ long, in units) from capped cards. */
export const positions = cards => Object.fromEntries(Object.entries(cards).map(([p, c]) => [p, (c.rating === 'LONG' ? 1 : c.rating === 'SHORT' ? -1 : 0) * (Number.isFinite(c.size) ? c.size : 1)]));

// ── costs ──
const SPREADS = JSON.parse(fs.readFileSync(new URL('../../analysis/output/costs/spread_profile_hist.json', import.meta.url), 'utf8'));
const PIP = k => (/jpy$/.test(k) ? 0.01 : k === 'nq' ? 1.0 : 0.0001);
function pipsFor(key, year) {
  const t = SPREADS[key]?.by_year; if (!t) return null;
  const ys = Object.keys(t).map(Number);
  if (t[year]) return t[year].med_pips;
  if (year < Math.min(...ys)) return Math.max(...ys.map(y => t[y].med_pips));   // before 2016: the widest yearly median
  return t[Math.max(...ys)].med_pips;
}
const CANDKEY = { NAS100_USD: 'nq', WTICO_USD: null, BCO_USD: null, USDCNH: null, USDZAR: null };
/** Full round-trip spread as a fraction of price for instrument id (panel/book key) on date. Unmeasured ones are
 *  charged the worst measured FX pair that year (js/harness/costs.mjs rule). */
export function makeCost(ff, dates) {
  const fxKeys = Object.keys(SPREADS).filter(k => /^[a-z]{6}$/.test(k) && !['uk100', 'us2000'].includes(k));
  const memo = new Map();
  function frac(id, i) {
    const y = +dates[i].slice(0, 4), mk = `${id}|${y}`;
    const pxOf = k => ff[k.toUpperCase()]?.[i];
    const measured = k => { const p = pipsFor(k, y), px = k === 'nq' ? ff.NAS100_USD?.[i] : pxOf(k); return fin(p) && fin(px) && px > 0 ? p * PIP(k) / px : null; };
    let key = id in CANDKEY ? CANDKEY[id] : id.toLowerCase();
    if (key && SPREADS[key]) { const f = measured(key); if (fin(f)) return f; }
    if (!memo.has(mk)) memo.set(mk, Math.max(...fxKeys.map(k => measured(k) ?? 0)));
    return memo.get(mk);
  }
  return frac;
}

// ── the hedge ──
/** The finder's ranked rows for day i's exposure, from data <= i-1 (the tab's call, unchanged). */
export function finderRows(S, exposure, i, { w = W } = {}) {
  const bh = M.bookHedges(S, exposure, S.ids, { w, end: i - 1 });
  return bh;
}
/** Units of candidate held for one unit of exposure: +ratio long / -ratio short. */
export const hedgeUnits = row => (row && fin(row.ratio) ? (row.side === 'long' ? 1 : -1) * row.ratio : 0);
/** A fixed-candidate hedge (the naive controls): min-variance ratio of `cand` against the exposure basket. */
export function fixedHedge(S, big, cand, i, { w = W } = {}) {
  const bx = M.retOf(S, `${big.ccy}*`); if (!bx || !M.retOf(S, cand)) return null;
  const sgn = Math.sign(big.net), tx = bx.map(v => (fin(v) ? v * sgn : null));
  return M.rankCandidates(S, tx, [cand], { w, end: i - 1, minAbs: 0 })[0] ?? null;
}
/** Every candidate's return for P&L: panel instruments from forward-filled closes, DXY from its legs. */
export function candRet(L, id) {
  if (L.ret[id]) return L.ret[id];
  if (id === 'DXY') {
    const legs = { EUR: ['EURUSD', 1], JPY: ['USDJPY', -1], GBP: ['GBPUSD', 1], CAD: ['USDCAD', -1], CHF: ['USDCHF', -1] };
    const Wt = Object.values(M.DXY_W).reduce((s, v) => s + v, 0);
    return (L.ret.DXY = L.dates.map((_, i) => -Object.entries(M.DXY_W).reduce((s, [c, w]) => s + w * legs[c][1] * L.ret[legs[c][0]][i], 0) / Wt));
  }
  return null;
}

/** The unhedged proxy book: per day its positions, capped exposure, gross return and cost (fractions of a unit). */
export function buildBook(L, cost) {
  const { dates, ret } = L, days = [];
  let prev = {};
  for (let i = MOM + 1; i < dates.length; i++) {
    const { cards, report } = bookCards(L.ff, i);
    const pos = positions(cards);
    let g = 0, c = 0;
    for (const p of new Set([...Object.keys(pos), ...Object.keys(prev)])) {
      const now = pos[p] ?? 0, was = prev[p] ?? 0;
      g += now * ret[p][i];
      if (now !== was) c += Math.abs(now - was) * 0.5 * cost(p, i);
    }
    prev = pos;
    days.push({ i, date: dates[i], exposure: report, gross: g, cost: c, net: g - c });
  }
  return days;
}

// ── stats ──
export const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
export const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
export function es(a, q = 0.05) { const s = [...a].sort((x, y) => x - y), k = Math.max(1, Math.floor(s.length * q)); return -mean(s.slice(0, k)); }
export function maxDD(a) { let c = 0, pk = 0, dd = 0; for (const v of a) { c += v; if (c > pk) pk = c; if (pk - c > dd) dd = pk - c; } return dd; }
/** Mean of the max drawdowns inside consecutive 252-day chunks (a full last chunk only). */
export function ddYear(a, len = 252) { const out = []; for (let s = 0; s + len <= a.length; s += len) out.push(maxDD(a.slice(s, s + len))); return mean(out); }
/** ES5 of overlapping 21-day sums (monthly loss tail). */
export function es21(a, h = 21) { const s = []; let c = 0; for (let t = 0; t < a.length; t++) { c += a[t]; if (t >= h) c -= a[t - h]; if (t >= h - 1) s.push(c); } return es(s); }
export const sharpe = a =>(mean(a) / sd(a)) * Math.sqrt(252);
export const annRet = a => mean(a) * 252;

export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** Circular moving-block bootstrap index sets (block L), the same draws for every arm (paired). */
export function blockIndex(n, { B = 2000, L = 21, seed = SEED } = {}) {
  const r = rng(seed), out = [];
  for (let b = 0; b < B; b++) { const idx = new Int32Array(n); let k = 0; while (k < n) { const s = Math.floor(r() * n); for (let j = 0; j < L && k < n; j++) idx[k++] = (s + j) % n; } out.push(idx); }
  return out;
}
export const take = (a, idx) => Array.from(idx, j => a[j]);
export function quantile(a, q) { const s = [...a].sort((x, y) => x - y), p = (s.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return s[lo] + (s[hi] - s[lo]) * (p - lo); }
