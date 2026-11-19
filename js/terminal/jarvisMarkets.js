// js/terminal/jarvisMarkets.js: the MARKETS layer's pure half. Where each of the desk's markets sits on Jarvis's globe, and how big its move is against its own noise.
// DESCRIPTION ONLY: a size says how far a market has moved today against how far it usually moves, never where it goes next.
// The move feed is /api/vol-forecast/live (every desk instrument: today's open-to-now % in `oc`, and the forecaster's median open-to-close in forecast.oc_median).
import { llToVec } from './jarvisCore.js';

/** A rough centre for each currency, used to put a pair between its two ends. */
const CCY = { USD: [38.9, -77.0], EUR: [50.1, 8.7], GBP: [51.5, -0.1], JPY: [35.7, 139.7], AUD: [-33.9, 151.2], NZD: [-41.3, 174.8], CAD: [45.4, -75.7], CHF: [47.4, 8.5], NOK: [59.9, 10.7], SEK: [59.3, 18.1] };
/** The fixed (non-pair) markets: [lat, lon, place]. Indices at their exchange city, commodities at a representative producer region. */
const FIXED = {
  NQ: [40.7, -74.0, 'New York (Nasdaq)'], SPX500: [40.7, -74.0, 'New York (S&P)'], US30: [40.7, -74.0, 'New York (Dow)'], US2000: [40.7, -74.0, 'New York (Russell)'], DE30: [50.1, 8.7, 'Frankfurt'], UK100: [51.5, -0.1, 'London'],
  GOLD: [40.8, -116.0, 'Nevada'], SILVER: [22.8, -102.6, 'Zacatecas, Mexico'], COPPER: [-14.0, -72.0, 'Peru'], PLATINUM: [-25.7, 27.2, 'Rustenburg, South Africa'], PALLADIUM: [69.3, 88.2, 'Norilsk, Russia'],
  WTI: [36.0, -96.8, 'Cushing, Oklahoma'], BRENT: [58.0, 1.5, 'North Sea'], NATGAS: [30.0, -92.0, 'Henry Hub, Louisiana'],
  SOYBEAN: [-12.6, -55.4, 'Mato Grosso, Brazil'], WHEAT: [49.0, 32.0, 'Ukraine'], CORN: [42.0, -93.6, 'Iowa'], SUGAR: [-21.5, -48.0, 'Sao Paulo state, Brazil'], BTCUSD: [47.2, 8.5, 'Zug, Switzerland'],
};
/** The desk's markets in the desk's own order (a copy of commandCore UNIVERSE's keys; the test fails if they drift). */
export const MARKET_KEYS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF',
  'GBPJPY', 'EURGBP', 'EURJPY', 'EURCHF', 'GBPCHF', 'AUDJPY', 'CADJPY', 'EURAUD', 'EURCAD', 'EURNZD', 'GBPAUD', 'GBPCAD', 'AUDCAD', 'NZDCAD', 'NZDJPY', 'GBPNZD', 'AUDNZD', 'AUDCHF', 'NZDCHF', 'CADCHF', 'CHFJPY', 'EURNOK', 'EURSEK', 'USDNOK', 'USDSEK',
  'NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100', 'GOLD', 'SILVER', 'COPPER', 'PLATINUM', 'PALLADIUM', 'WTI', 'BRENT', 'NATGAS', 'SOYBEAN', 'WHEAT', 'CORN', 'SUGAR', 'BTCUSD'];

/** Minimum separation between two markets, in degrees of arc on the globe. */
export const MIN_SEP_DEG = 3.2;
const R2D = 180 / Math.PI;
/** Great-circle angle between two [lat, lon] points, degrees. */
export function arcDeg(a, b) { const u = llToVec(a[0], a[1]), v = llToVec(b[0], b[1]); const d = u[0] * v[0] + u[1] * v[1] + u[2] * v[2]; return Math.acos(Math.max(-1, Math.min(1, d))) * R2D; }
const mid = (a, b) => { const u = llToVec(...a), v = llToVec(...b); const s = [u[0] + v[0], u[1] + v[1], u[2] + v[2]]; const n = Math.hypot(...s) || 1; return [Math.asin(s[1] / n) * R2D, Math.atan2(s[0], s[2]) * R2D]; };
const clampLat = x => Math.max(-80, Math.min(80, x));
const wrapLon = x => ((x + 540) % 360) - 180;

/** Build the table: a pair sits midway between its currencies' centres, the rest at their fixed place; a deterministic spiral nudge keeps every market >= MIN_SEP_DEG from every other. */
export function buildMarketGeo(keys = MARKET_KEYS) {
  const out = {}, placed = [];
  for (const k of keys) {
    let base, place;
    if (FIXED[k]) { base = [FIXED[k][0], FIXED[k][1]]; place = FIXED[k][2]; }
    else { const a = CCY[k.slice(0, 3)], b = CCY[k.slice(3, 6)]; if (!a || !b) continue; base = mid(a, b); place = `${k.slice(0, 3)}/${k.slice(3)}`; }
    let pos = base;
    for (let ring = 1; ring < 40 && placed.some(p => arcDeg(p, pos) < MIN_SEP_DEG); ring++) {
      const r = MIN_SEP_DEG * 1.15 * ring, n = 6 * ring; let found = null;
      for (let i = 0; i < n && !found; i++) { const ang = (2 * Math.PI * i) / n + ring * 0.7, c = [clampLat(base[0] + r * Math.sin(ang)), wrapLon(base[1] + r * Math.cos(ang) / Math.max(0.35, Math.cos(base[0] / R2D)))]; if (!placed.some(p => arcDeg(p, c) < MIN_SEP_DEG)) found = c; }
      if (found) pos = found;
    }
    placed.push(pos); out[k] = [+pos[0].toFixed(2), +pos[1].toFixed(2), place];
  }
  return out;
}
export const MARKET_GEO = buildMarketGeo();

/** A desk key's plain label: EURUSD -> EUR/USD, the rest as given. */
export const marketLabel = k => (/^[A-Z]{6}$/.test(k) && k !== 'BTCUSD' ? `${k.slice(0, 3)}/${k.slice(3)}` : k);

/** Size scale: a move this many times the market's median open-to-close is a full-size marker. */
export const FULL_AT = 3, QUIET_BELOW = 0.5;
/**
 * raw = the /api/vol-forecast/live body. Returns { KEY: { move (% from today's open), noise (the median |open-to-close| %), ratio (|move| / noise), size 0..1, tone 'up'|'dn'|'quiet' } }.
 * A market with no usable move or noise is left out, never zero-filled.
 */
export function marketSizes(raw) {
  const out = {}; const ins = raw?.ok === false ? null : raw?.instruments;
  if (!ins || typeof ins !== 'object') return out;
  for (const [k, v] of Object.entries(ins)) {
    if (!MARKET_GEO[k] || !v || v.error) continue;
    const move = Number(v.oc), noise = Number(v.forecast?.oc_median ?? (Number(v.forecast?.hl_median) > 0 ? Number(v.forecast.hl_median) / 2 : NaN));
    if (!Number.isFinite(move) || !(noise > 0)) continue;
    const ratio = Math.abs(move) / noise, size = Math.max(0, Math.min(1, ratio / FULL_AT));
    out[k] = { move, noise, ratio, size, tone: ratio < QUIET_BELOW ? 'quiet' : move >= 0 ? 'up' : 'dn' };
  }
  return out;
}
/** The markets ranked by move against noise, biggest first: [{ key, ...size row }]. */
export const rankMarkets = sizes => Object.entries(sizes ?? {}).map(([key, s]) => ({ key, ...s })).sort((a, b) => b.ratio - a.ratio);
/** One plain line: "+0.84% from today's open, 2.1 times its usual open-to-close move." */
export const moveText = s => `${s.move >= 0 ? '+' : ''}${s.move.toFixed(2)}% from today's open, ${s.ratio.toFixed(1)} times its usual open-to-close move`;
