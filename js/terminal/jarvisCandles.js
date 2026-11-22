// js/terminal/jarvisCandles.js: the pure half of Jarvis's CANDLES view: every desk market's session candle so far today, standing in a 3D field, with the bias engine's lean over each.
// A candle is drawn in units of the market's own usual open-to-close move (forecast.oc_median), so a big move in a quiet market and a big move in a wild one stand level. Green above the floor,
// red hanging below it: what is up and what is down is visible at a glance. The lean is a chevron above the candle. DESCRIPTION ONLY: the candle is what has happened; the lean is the bias engine's
// reading, whose back-test found no proven direction skill, and the view says so.
import { MARKET_KEYS } from './jarvisMarkets.js';

const INDICES = ['NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100'], METALS = ['GOLD', 'SILVER', 'COPPER', 'PLATINUM', 'PALLADIUM'], OTHER = ['WTI', 'BRENT', 'NATGAS', 'SOYBEAN', 'WHEAT', 'CORN', 'SUGAR', 'BTCUSD'];
const MAJORS = MARKET_KEYS.slice(0, 7), CROSSES = MARKET_KEYS.filter(k => !MAJORS.includes(k) && !INDICES.includes(k) && !METALS.includes(k) && !OTHER.includes(k));
/** The field's rows, front to back. */
export const ROWS = [['FX MAJORS', MAJORS], ['FX CROSSES', CROSSES.slice(0, Math.ceil(CROSSES.length / 2))], ['', CROSSES.slice(Math.ceil(CROSSES.length / 2))], ['INDICES', INDICES], ['METALS', METALS], ['ENERGY, FARM, CRYPTO', OTHER]];
export const CAP = 3;                         // a candle is clipped at three times the market's usual move
const clip = v => Math.max(-CAP, Math.min(CAP, v));
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };

/** One candle per market the feed holds. vol = /api/vol-forecast/live `instruments`; bias = /api/bias-engine `markets`. Units = multiples of the market's usual open-to-close move. */
export function candleRows(vol = {}, bias = {}) {
  const out = [];
  for (const k of MARKET_KEYS) {
    const v = vol[k]; if (!v) continue;
    const oc = num(v.oc), oh = num(v.oh), ol = num(v.ol), noise = num(v.forecast?.oc_median);
    if (oc == null || oh == null || ol == null || !(noise > 0)) continue;
    const b = bias[k], dirWord = String(b?.dir ?? '').toUpperCase(), lean = dirWord === 'BULLISH' ? 1 : dirWord === 'BEARISH' ? -1 : 0, ratio = oc / noise;
    out.push({ key: k, oc, noise, body: clip(ratio), hi: clip(Math.max(oh, oc, 0) / noise), lo: clip(Math.min(-ol, oc, 0) / noise), ratio, tone: Math.abs(ratio) < 0.5 ? 'quiet' : ratio > 0 ? 'up' : 'dn', lean: b ? lean : null, strength: num(b?.strength) ?? 0, haveLean: !!b, hl: num(v.hl), range: num(v.forecast?.hl_median), range75: num(v.forecast?.hl_75) });
  }
  return out;
}

/** The street grid: each row is centred, markets 0.19 apart, rows 0.45 apart, the first row at the front. Returns { key: { x, z, row } }. */
export function candleLayout(keys) {
  const have = new Set(keys), out = {};
  ROWS.forEach(([, ks], ri) => { const row = ks.filter(k => have.has(k)); row.forEach((k, i) => { out[k] = { x: (i - (row.length - 1) / 2) * 0.19, z: (ri - (ROWS.length - 1) / 2) * 0.45, row: ri }; }); });
  return out;
}

/** The 3D box of a candle's body (base on the floor, rising for green, hanging for red) and its wick's two ends. Heights are in world units (0.3 per usual move). */
export function candleBox(c, pos, w = 0.065, k = 0.3) {
  const y0 = 0, y1 = c.body * k, a = Math.min(y0, y1), b = Math.max(y0, y1), x0 = pos.x - w, x1 = pos.x + w, z0 = pos.z - w, z1 = pos.z + w;
  return { pts: [[x0, a, z0], [x1, a, z0], [x1, a, z1], [x0, a, z1], [x0, b, z0], [x1, b, z0], [x1, b, z1], [x0, b, z1]], faces: { top: [4, 5, 6, 7], sides: [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]] }, wick: [[pos.x, c.lo * k, pos.z], [pos.x, c.hi * k, pos.z]], tip: [pos.x, Math.max(b, c.hi * k), pos.z] };
}

/** How the whole board leans: counts of the engine's bullish / bearish / neutral readings across the candles that have one, and the day's tally of up and down candles. */
export function boardSummary(rows) {
  const s = { n: rows.length, up: 0, dn: 0, quiet: 0, bull: 0, bear: 0, flat: 0, haveLean: 0 };
  for (const r of rows) { if (r.tone === 'up') s.up++; else if (r.tone === 'dn') s.dn++; else s.quiet++; if (r.haveLean) { s.haveLean++; if (r.lean > 0) s.bull++; else if (r.lean < 0) s.bear++; else s.flat++; } }
  return s;
}

/** The movers, biggest first by size against the usual move. */
export const topMovers = (rows, n = 5) => [...rows].filter(r => r.tone !== 'quiet').sort((a, b) => Math.abs(b.ratio) - Math.abs(a.ratio)).slice(0, n);
