// js/terminal/jarvisSessionCore.js: the pure half of Jarvis's SESSION view: one market's recent price bars turned into 3D candle geometry, drawn in like a time-lapse.
// DESCRIPTION ONLY: every element is something that has happened (the bars, the session's open, the previous session, the market's own usual high/low reach from the vol-forecast feed). Nothing here is a forecast.
import { MARKET_KEYS } from './jarvisMarkets.js';
import { spoken } from './showCore.js';

export const MAX_BARS = 120;
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const FX = new Set(MARKET_KEYS.slice(0, 32));
/** Desk key -> the intraday route's asset name (/api/cog-chart/candles). Markets without one fall back to daily bars. */
export const INTRADAY = { NQ: 'NAS100' };
const idx = k => (k === 'NQ' ? 'NAS100' : k);
export const intradayAsset = k => (INTRADAY[k] ?? (FX.has(k) || ['GOLD', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100'].includes(k) ? idx(k) : null));
const DAILY = { NQ: 'NAS100_USD', SPX500: 'SPX500_USD', US30: 'US30_USD', US2000: 'US2000_USD', DE30: 'DE30_EUR', UK100: 'UK100_GBP', GOLD: 'XAU_USD', SILVER: 'XAG_USD', COPPER: 'XCU_USD', PLATINUM: 'XPT_USD', PALLADIUM: 'XPD_USD', WTI: 'WTICO_USD', BRENT: 'BCO_USD', NATGAS: 'NATGAS_USD', SOYBEAN: 'SOYBN_USD', WHEAT: 'WHEAT_USD', CORN: 'CORN_USD', SUGAR: 'SUGAR_USD', BTCUSD: 'BTC_USD' };
/** Desk key -> the daily route's symbol (/api/ohlc?symbol=). */
export const dailySymbol = k => DAILY[k] ?? (FX.has(k) && k.length === 6 ? `${k.slice(0, 3)}_${k.slice(3)}` : null);

/** The market to draw: the HUD's selection if it is a desk market with data, else the biggest mover against its own usual move. instruments = /api/vol-forecast/live `instruments`. */
export function pickMarket(sel, inst = {}) {
  if (sel && inst[sel] && MARKET_KEYS.includes(sel)) return sel;
  let best = null, bs = -1;
  for (const k of MARKET_KEYS) {
    const v = inst[k], oc = num(v?.oc), med = num(v?.forecast?.oc_median); if (oc == null || !(med > 0)) continue;
    const s = Math.abs(oc) / med; if (s > bs) { bs = s; best = k; }
  }
  return best;
}

/** Intraday candles { t (s), o, h, l, c } -> { bars (today's, capped), prev (the session before), label }. A session is a UTC day (the forecaster's own anchor is 00:00 UTC). */
export function splitSessions(candles, maxBars = MAX_BARS) {
  const cs = (candles ?? []).filter(c => c && [c.t, c.o, c.h, c.l, c.c].every(x => Number.isFinite(+x))).map(c => ({ t: +c.t, o: +c.o, h: +c.h, l: +c.l, c: +c.c })).sort((a, b) => a.t - b.t);
  if (!cs.length) return null;
  const day = t => Math.floor(t / 86400), d0 = day(cs[cs.length - 1].t);
  let bars = cs.filter(c => day(c.t) === d0), prev = cs.filter(c => day(c.t) < d0 && day(c.t) >= d0 - 1);
  if (!prev.length) prev = cs.filter(c => day(c.t) < d0).slice(-96);
  const partial = bars.length < 4;
  if (partial) { bars = cs.slice(-Math.min(96, cs.length)); prev = []; }       // a session only just begun: show the latest bars instead
  return { bars: bars.slice(-maxBars), prev: prev.slice(-maxBars), partial };
}
/** /api/ohlc `values` (newest first, strings) -> the last `n` daily bars oldest first. */
export function dailyBars(values, n = 60) {
  const out = (values ?? []).map(v => ({ t: Date.parse(`${v.datetime}T00:00:00Z`) / 1000, o: num(v.open), h: num(v.high), l: num(v.low), c: num(v.close) })).filter(b => Number.isFinite(b.t) && [b.o, b.h, b.l, b.c].every(x => x != null));
  return out.sort((a, b) => a.t - b.t).slice(-n);
}

/** The market's own usual reach today, from its vol-forecast entry: the median high and low distance from the day's open (percent) as prices. null when the feed lacks them. */
export function usualBand(v) {
  const open = num(v?.anchor_open), up = num(v?.oh_target_med), dn = num(v?.ol_target_med);
  if (!(open > 0) || !(up > 0) || !(dn > 0)) return null;
  return { open, hi: open * (1 + up / 100), lo: open * (1 - dn / 100), upPct: up, dnPct: dn };
}

/** Facts about the bars, for the title, the script and the HUD. `v` = the vol-forecast entry (optional). */
export function sessionStats(bars, v = null) {
  if (!bars?.length) return null;
  let hi = -Infinity, lo = Infinity; for (const b of bars) { if (b.h > hi) hi = b.h; if (b.l < lo) lo = b.l; }
  const last = bars[bars.length - 1].c, move = (last / bars[0].o - 1) * 100, med = num(v?.forecast?.oc_median);
  return { open: bars[0].o, hi, lo, last, movePct: move, usualPct: med > 0 ? med : null, times: med > 0 ? Math.abs(move) / med : null, n: bars.length };
}

/** Price formatting that suits the size of the price. */
export const fmtPrice = p => (p >= 1000 ? p.toFixed(0) : p >= 100 ? p.toFixed(1) : p >= 10 ? p.toFixed(2) : p.toFixed(4));
const pctWord = v => `${Math.abs(v) < 10 ? Math.abs(v).toFixed(1) : Math.round(Math.abs(v))} percent`;
const timesWord = t => (t < 0.3 ? 'a small fraction of' : t < 0.75 ? 'about half of' : t < 1.25 ? 'about the same as' : t < 9.5 ? `about ${Math.round(t)} times` : 'more than nine times');
const said = p => String(Number(fmtPrice(p)));

/** The title line: "NQ · today's session, 15 minute candles". */
export const titleOf = (key, mode) => `${key} · ${mode === 'daily' ? 'the last 60 days, daily candles' : "today's session, 15 minute candles"}`;

/** The spoken script: measured facts only, short plain sentences. null without data. */
export function sessionScript(key, st, mode = 'intraday') {
  if (!st) return null;
  const nm = spoken(key), dir = st.movePct >= 0 ? 'up' : 'down', span = mode === 'daily' ? 'the last sixty days' : 'the session so far';
  const a = `Here is the chart of ${nm}'s ${mode === 'daily' ? 'last sixty days' : 'session'}. It ${mode === 'daily' ? 'started at' : 'opened at'} ${said(st.open)}, has traded between ${said(st.lo)} and ${said(st.hi)}, and is now ${said(st.last)}.`;
  const b = mode === 'daily' ? `Over ${span} it is ${dir} ${pctWord(st.movePct)}.` : `That is ${dir} ${pctWord(st.movePct)} from the open${st.times != null ? `, which is ${timesWord(st.times)} its usual move` : ''}.`;
  return `${a} ${b}`;
}

/** How far the draw-in has got: the number of bars printed (fractional, so the leading one is still rising) and the phase. One loop = draw + hold. */
export function loopState(t, n, draw = 6, hold = 4) {
  const c = ((t % (draw + hold)) + (draw + hold)) % (draw + hold);
  return c < draw ? { printed: (c / draw) * n, phase: 'draw', hold: 0 } : { printed: n, phase: 'hold', hold: (c - draw) / hold };
}
/** The rise of bar i given `printed`: 0 not yet, 1 fully up. A bar takes 2.5 bar-times to finish rising. */
export const rise = (i, printed) => { const p = Math.max(0, Math.min(1, (printed - i) / 2.5)); return p * p * (3 - 2 * p); };

/**
 * World geometry for the bars. x runs along time (centred), y is price (0..H, floor at the lowest price in view), z=0 the candle row; the usual-range band sits behind at z=BAND_Z, the ghost behind that.
 * Returns { dx, W, H, yOf(price), priceAt(y), lo, hi, bars: [{ up, x, yO, yC, yH, yL }], ghost: [{x, y}], band: {yHi, yLo, yOpen} | null, ticks: [price] }.
 */
export function buildScene(bars, prev = [], band = null, H = 1.45) {
  if (!bars?.length) return null;
  let lo = Infinity, hi = -Infinity;
  for (const b of bars) { if (b.l < lo) lo = b.l; if (b.h > hi) hi = b.h; }
  for (const b of prev) { if (b.l < lo) lo = b.l; if (b.h > hi) hi = b.h; }
  if (band) { lo = Math.min(lo, band.lo); hi = Math.max(hi, band.hi); }
  if (!(hi > lo)) { hi = lo * 1.001 + 1e-9; }
  const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
  const yOf = p => ((p - lo) / (hi - lo)) * H, priceAt = y => lo + (y / H) * (hi - lo);
  const n = bars.length, dx = Math.min(0.06, 3.0 / n), W = n * dx, X = i => (i - (n - 1) / 2) * dx;
  const out = bars.map((b, i) => ({ up: b.c >= b.o, x: X(i), yO: yOf(b.o), yC: yOf(b.c), yH: yOf(b.h), yL: yOf(b.l) }));
  // the previous session laid over the same time axis by position: bar k of yesterday sits behind bar k of today
  const ghost = prev.slice(0, n).map((b, k) => ({ x: X(k), y: yOf(b.c) }));
  const step = niceStep((hi - lo) / 5), ticks = []; for (let p = Math.ceil(lo / step) * step; p <= hi; p += step) ticks.push(p);
  return { dx, W, H, n, lo, hi, yOf, priceAt, bars: out, ghost, band: band ? { yHi: yOf(band.hi), yLo: yOf(band.lo), yOpen: yOf(band.open) } : null, ticks };
}
const niceStep = s => { const e = Math.pow(10, Math.floor(Math.log10(s))), m = s / e; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e; };

/** The eight corners of a candle's body (base y0, top y1) at x, with half-width w and half-depth d. Fills `pts` (8 x [x,y,z]) in place. Same faces as jarvisCandles.candleBox. */
export function bodyCorners(pts, x, y0, y1, w, d, grow = 1) {
  const a = Math.min(y0, y1) * grow, b = Math.max(a + 0.004, Math.max(y0, y1) * grow), x0 = x - w, x1 = x + w, z0 = -d, z1 = d;
  const v = [[x0, a, z0], [x1, a, z0], [x1, a, z1], [x0, a, z1], [x0, b, z0], [x1, b, z0], [x1, b, z1], [x0, b, z1]];
  for (let i = 0; i < 8; i++) { pts[i][0] = v[i][0]; pts[i][1] = v[i][1]; pts[i][2] = v[i][2]; }
  return pts;
}
export const FACES = { top: [4, 5, 6, 7], sides: [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]] };
export const BAND_Z = 0.2, GHOST_Z = 0.4;
