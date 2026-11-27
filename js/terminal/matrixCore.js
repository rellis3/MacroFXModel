// js/terminal/matrixCore.js: the cross-asset board and the sector rotation map (Insight tab), from the daily market bundle (/api/drill-series). Pure: no DOM, no fetch.
//
//   returnsGrid     every asset in the basket with its 1, 5 and 20 session move, and how unusual each is against that asset's own history (unusualCore).
//   corrMatrix      the correlation of daily moves between the basket's assets over the last N sessions (N = 20 and 120) and where the 20 session one sits
//                   against the 120 session one. 20 daily moves give a correlation a standard error of about 0.22, so only a difference beyond ~0.5 in
//                   Fisher z is called a change, and with ~90 pairs a handful will pass by chance: both are stated on the board.
//   rotation        the 11 US sector ETFs against SPY over the last 20 sessions: relative strength (the sector's 20 session move over SPY's, 100 = level)
//                   and its momentum (the change in that over 5 sessions), with a trail of earlier points and the quadrant the sector sits in.
// All of it describes what has happened. None of it is a forecast, and the board says so.

import { metaFor, SECTORS } from './insightSeries.js';
import { analyse, change } from './unusualCore.js';

export const ASSET_BASKET = ['spx', 'nq', 'r2k', 'de30', 'uk100', 'jp225', 'dxy', 'eurusd', 'usdjpy', 'gbpusd', 'audusd', 'us2y', 'us10y', 'tips', 'hy', 'vix', 'move', 'gold', 'silver', 'copper', 'oil', 'natgas', 'btc'];
export const CORR_BASKET = ['spx', 'nq', 'r2k', 'dxy', 'us10y', 'tips', 'hy', 'vix', 'gold', 'oil', 'copper', 'btc', 'eurusd', 'usdjpy'];
export const WIN_SHORT = 20, WIN_LONG = 120;
const fin = v => v != null && Number.isFinite(+v);

/** Daily moves of a series on the bundle's date axis (index i = the move from row i-1 to row i), null where either end is missing. */
export function dailyMoves(vals, kind) {
  const out = new Array(vals.length).fill(null);
  for (let i = 1; i < vals.length; i++) { const a = vals[i - 1], b = vals[i]; if (fin(a) && fin(b)) out[i] = change(+a, +b, kind); }
  return out;
}
/** Pearson correlation of two move arrays over the last `win` rows ending at row `end` (inclusive), pairs where both exist. { r, n } or null under 8 pairs. */
export function corr(ma, mb, win, end = ma.length - 1) {
  const xs = [], ys = [];
  for (let i = Math.max(0, end - win + 1); i <= end; i++) if (fin(ma[i]) && fin(mb[i])) { xs.push(ma[i]); ys.push(mb[i]); }
  const n = xs.length; if (n < 8) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (sxx <= 0 || syy <= 0) return null;
  return { r: Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy))), n };
}
const fisher = r => 0.5 * Math.log((1 + Math.min(0.999, Math.max(-0.999, r))) / (1 - Math.min(0.999, Math.max(-0.999, r))));

/**
 * The correlation matrix for `keys`: cells[i][j] = { r20, r120, n20, n120, dz, moved } (moved = the 20 session value differs from the 120 session one by more than the noise).
 * `noise` is the 95% threshold on the Fisher z difference for these window lengths (about 0.51 for 20 vs 120).
 */
export function corrMatrix(bundle, keys = CORR_BASKET, { short = WIN_SHORT, long = WIN_LONG } = {}) {
  const dates = bundle?.dates ?? [], series = bundle?.series ?? {};
  const have = keys.filter(k => Array.isArray(series[k]));
  const mv = Object.fromEntries(have.map(k => [k, dailyMoves(series[k], metaFor(k).kind)]));
  const end = dates.length - 1, noise = 1.96 * Math.sqrt(1 / (short - 3) + 1 / (long - 3));
  const cells = have.map((a, i) => have.map((b, j) => {
    if (i === j) return { r20: 1, r120: 1, n20: short, n120: long, dz: 0, moved: false };
    const s = corr(mv[a], mv[b], short, end), l = corr(mv[a], mv[b], long, end);
    if (!s || !l) return null;
    const dz = fisher(s.r) - fisher(l.r);
    return { r20: s.r, r120: l.r, n20: s.n, n120: l.n, dz, moved: Math.abs(dz) > noise };
  }));
  const pairs = [];
  for (let i = 0; i < have.length; i++) for (let j = i + 1; j < have.length; j++) if (cells[i][j]) pairs.push({ a: have[i], b: have[j], ...cells[i][j] });
  const flagged = pairs.filter(p => p.moved).sort((x, y) => Math.abs(y.dz) - Math.abs(x.dz));
  return { keys: have, cells, pairs, flagged, noise, expectedByChance: pairs.length * 0.05, asOf: dates[end] ?? null, short, long };
}
/** The correlation said in words: strength and sign, never a direction call. */
export function corrWords(r) {
  const a = Math.abs(r), s = r >= 0 ? 'together' : 'opposite ways';
  return a < 0.2 ? 'barely related' : `${a < 0.45 ? 'loosely' : a < 0.7 ? 'fairly closely' : 'closely'} ${s}`;
}

/** Every asset in the basket: its 1, 5, 20 session move and the percentile of each against its own history. */
export function returnsGrid(bundle, keys = ASSET_BASKET) {
  const dates = bundle?.dates ?? [], series = bundle?.series ?? {}, refDate = bundle?.to ?? dates[dates.length - 1] ?? null;
  const rows = [];
  for (const key of keys) {
    if (!Array.isArray(series[key])) continue;
    const a = analyse(key, dates, series[key], { refDate }); if (!a || a.tooShort) continue;
    rows.push({ key, label: a.label, group: a.group, go: a.go, stale: a.stale, to: a.to, moves: [1, 5, 20].map(k => a.moves[k] ?? null), last: a.lastFmt, kind: a.kind });
  }
  return { rows, asOf: refDate };
}

/** Relative strength map for the sector ETFs against `base` (spy). Needs ~45 sessions. null when the bundle lacks the base or every sector. */
export function rotation(bundle, { base = 'spy', sectors = SECTORS, rsWin = 20, momWin = 5, trail = 4 } = {}) {
  const dates = bundle?.dates ?? [], series = bundle?.series ?? {};
  if (!Array.isArray(series[base])) return null;
  const rel = key => { const s = series[key], b = series[base], out = new Array(dates.length).fill(null); for (let i = 0; i < dates.length; i++) if (fin(s[i]) && fin(b[i]) && b[i] > 0) out[i] = s[i] / b[i]; return out; };
  const rsAt = (r, i) => (i >= rsWin && fin(r[i]) && fin(r[i - rsWin]) && r[i - rsWin] > 0 ? 100 * r[i] / r[i - rsWin] : null);
  const end = dates.length - 1, items = [];
  for (const key of sectors) {
    if (!Array.isArray(series[key])) continue;
    const r = rel(key), pts = [];
    for (let t = 0; t <= trail; t++) {
      const i = end - t * momWin, rs = rsAt(r, i), prev = rsAt(r, i - momWin);
      if (rs != null && prev != null) pts.push({ date: dates[i], rs, mom: rs - prev });
    }
    if (!pts.length) continue;
    const now = pts[0], s = series[key], abs20 = fin(s[end]) && fin(s[end - rsWin]) && s[end - rsWin] > 0 ? s[end] / s[end - rsWin] - 1 : null;
    const abs5 = fin(s[end]) && fin(s[end - 5]) && s[end - 5] > 0 ? s[end] / s[end - 5] - 1 : null;
    const quadrant = now.rs >= 100 ? (now.mom >= 0 ? 'leading' : 'weakening') : (now.mom >= 0 ? 'improving' : 'lagging');
    items.push({ key, label: metaFor(key).label, now, trail: pts.slice(1).reverse(), quadrant, abs20, abs5, rel20: now.rs - 100 });
  }
  if (!items.length) return null;
  items.sort((a, b) => b.rel20 - a.rel20);
  items.forEach((x, i) => { x.rank = i + 1; });
  return { items, base, rsWin, momWin, asOf: dates[end], counts: ['leading', 'weakening', 'lagging', 'improving'].map(q => ({ q, n: items.filter(x => x.quadrant === q).length })) };
}
export const QUADRANT_TEXT = {
  leading: 'ahead of the S&P 500 over 20 sessions and still gaining on it',
  weakening: 'ahead of the S&P 500 over 20 sessions but the lead has been shrinking',
  lagging: 'behind the S&P 500 over 20 sessions and still losing ground',
  improving: 'behind the S&P 500 over 20 sessions but closing the gap',
};
