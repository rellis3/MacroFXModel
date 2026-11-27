// js/terminal/jarvisNewViewsCore.js: the pure half of three Helix views: FLIP MAP (every market's distance to its gamma flip), RANGE USED vs IMPLIED (a scatter of today's high-low so far
// against the forecaster's usual range) and THE DAY SO FAR (one market's move per 15 minutes on a London 00:00-24:00 line, with the day's releases as pylons).
// No DOM, no fetch: everything here is tested in jarvisNewViewsCore.test.mjs. DESCRIPTION ONLY: what has happened and where open interest sits, never a forecast.
import { GAMMA_MARKETS, buildLadder } from './jarvisGammaCore.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };

// ───────────────────────── FLIP MAP ─────────────────────────
/**
 * One row per market with an option book and a gamma flip near spot. store = /api/oi-store data; inst = /api/vol-forecast/live `instruments` (optional, for the usual-range units).
 * Row: { key, label, spot, flip, dist (spot - flip, % of spot), above (spot at or above the flip: dealers modelled net long gamma), units (dist / that market's usual high-low range %, or null), savedAt }.
 * Sorted from furthest above to furthest below. Markets with no flip are counted in `noFlip`.
 */
export function flipRows(store, inst = null, markets = GAMMA_MARKETS) {
  const rows = [], noFlip = [];
  for (const m of markets) {
    const e = store?.[m.pair]; if (!e) continue;
    let L = null; try { L = buildLadder({ ...e, pair: m.pair }); } catch { L = null; }
    if (!L) continue;
    if (!fin(L.flip)) { noFlip.push(m.key); continue; }
    const dist = (L.spot - L.flip) / L.spot * 100, hl = num(inst?.[m.key]?.forecast?.hl_median);
    rows.push({ key: m.key, label: m.label, spot: L.spot, flip: L.flip, dist, above: dist >= 0, units: hl > 0 ? dist / hl : null, savedAt: e.savedAt ?? null });
  }
  rows.sort((a, b) => b.dist - a.dist);
  return { rows, noFlip };
}

/** The newest capture date (YYYY-MM-DD) among the rows, or null. */
export const latestCapture = rows => (rows ?? []).map(r => String(r.savedAt ?? '').slice(0, 10)).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s)).sort().pop() ?? null;

/** The headline: "6 of 9 above flip" and one line of words. null with no rows. The short-gamma side keeps the desk's "amplified" wording. */
export function flipHeadline(f) {
  const rows = f?.rows ?? []; if (!rows.length) return null;
  const above = rows.filter(r => r.above).length, below = rows.length - above;
  return { hero: `${above} of ${rows.length} above flip`, sub: `${above} with dealers modelled long gamma (moves damped), ${below} short gamma (moves amplified)`, asOf: latestCapture(rows) ? `OI capture ${latestCapture(rows)}` : null };
}

/** The symmetric half-width of the bar axis, in %: the biggest distance rounded up to a nice step, at least 0.5%. */
export function flipScale(rows) {
  const mx = Math.max(0.5, ...(rows ?? []).map(r => Math.abs(r.dist)));
  const steps = [0.5, 1, 2, 3, 5, 8, 10, 15, 20, 30, 50]; return steps.find(s => s >= mx) ?? Math.ceil(mx / 10) * 10;
}

// ───────────────────────── RANGE USED vs IMPLIED ─────────────────────────
/** Nice axis ticks from 0 to at least `hi`: { max, ticks[] } with 3-6 steps of 1, 2, 2.5 or 5 x 10^k. */
export function niceTicks(hi, target = 5) {
  const h = hi > 0 && Number.isFinite(hi) ? hi : 1, raw = h / target, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => s >= raw) ?? 10 * mag, max = Math.ceil(h / step - 1e-9) * step, ticks = [];
  for (let v = 0; v <= max + step * 1e-6; v += step) ticks.push(+v.toFixed(10));
  return { max, ticks, step };
}

/** One point per market: x = the forecaster's usual high-low range for today (%), y = the high-low range traded so far (%), used = y / x. inst = /api/vol-forecast/live `instruments`. */
export function rangePoints(inst, keys = null) {
  const out = [];
  for (const k of keys ?? Object.keys(inst ?? {})) {
    const v = inst?.[k]; if (!v || v.error) continue;
    const x = num(v.forecast?.hl_median), y = num(v.hl); if (!(x > 0) || y == null || y < 0) continue;
    out.push({ key: k, x, y, used: y / x, p75: num(v.forecast?.hl_75) });
  }
  return out.sort((a, b) => b.used - a.used);
}

/** The scatter's frame: one shared scale on both axes (so the diagonal is "used all of it"), a little headroom, and the ticks. */
export function scatterFrame(points) {
  const mx = Math.max(0.05, ...(points ?? []).flatMap(p => [p.x, p.y])) * 1.08;
  return niceTicks(mx, 5);
}

/** The headline for the scatter: how many markets have already traded their usual day's range. */
export function rangeHeadline(points, label = null) {
  if (!points?.length) return null;
  const over = points.filter(p => p.used >= 1).length, top = points[0];
  return { hero: `${over} of ${points.length} past their usual range`, sub: `furthest: ${top.key} at ${Math.round(top.used * 100)}% of its usual high-low`, asOf: label };
}

// ───────────────────────── THE DAY SO FAR ─────────────────────────
const LDN = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** London wall clock for an instant (ms): { date: 'YYYY-MM-DD', mins (0..1439) }. Europe/London through Intl, so BST and GMT are both right. */
export function londonClock(ms) {
  const p = {}; for (const x of LDN.formatToParts(new Date(ms))) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, mins: (+p.hour % 24) * 60 + +p.minute };
}
export const SLOTS = 96;   // 15-minute slots in a London day

/**
 * Bars { t (seconds), o, c } -> the London day's 96 slots of move, in % of the day's first open. Slot = London wall-clock minutes / 15, so a DST change day still runs 00:00-24:00
 * (the repeated autumn hour adds into the same slots). date = the London date to keep (default: the date of the newest bar). Returns { date, open, move: Float64Array(96) (NaN = no bar), n, last, total }.
 */
export function bucketDay(bars, date = null) {
  const cs = (bars ?? []).filter(b => b && fin(+b.t) && fin(+b.o) && fin(+b.c)).map(b => ({ t: +b.t, o: +b.o, c: +b.c })).sort((a, b) => a.t - b.t);
  const move = new Float64Array(SLOTS).fill(NaN);
  if (!cs.length) return { date, open: null, move, n: 0, last: -1, total: 0 };
  const d = date ?? londonClock(cs[cs.length - 1].t * 1000).date;
  let open = null, last = -1, n = 0, close = null;
  for (const b of cs) {
    const lc = londonClock(b.t * 1000); if (lc.date !== d) continue;
    if (open == null) open = b.o; if (!(open > 0)) continue;
    const i = Math.min(SLOTS - 1, Math.floor(lc.mins / 15)), m = (b.c - b.o) / open * 100;
    move[i] = Number.isNaN(move[i]) ? m : move[i] + m; last = Math.max(last, i); n++; close = b.c;
  }
  return { date: d, open, move, n, last, total: open > 0 && close != null ? (close - open) / open * 100 : 0 };
}

/** The biggest absolute slot move (for the bar scale), at least `floor`. */
export const slotScale = (move, floor = 0.02) => { let m = floor; for (const v of move ?? []) if (Number.isFinite(v)) m = Math.max(m, Math.abs(v)); return m; };

/**
 * Release pylons on the 0..1440 line: events { mins, rank, ccy, name } of today, placed at x = x0 + mins / 1440 * w, each label given a lane (0, 1, 2) so labels closer than `gap` px do not overlap.
 * Ranks below `minRank` are left out. Returns [{ x, mins, rank, lane, label }].
 */
export function placePylons(events, x0, w, { gap = 64, minRank = 2, lanes = 3 } = {}) {
  const ev = (events ?? []).filter(e => e && fin(e.mins) && e.mins >= 0 && e.mins < 1440 && (+e.rank || 0) >= minRank).sort((a, b) => a.mins - b.mins);
  const out = [], laneEnd = new Array(lanes).fill(-Infinity);
  for (const e of ev) {
    const x = x0 + e.mins / 1440 * w; let lane = laneEnd.findIndex(end => x - end >= gap); if (lane < 0) lane = laneEnd.indexOf(Math.min(...laneEnd));
    laneEnd[lane] = x;
    const name = String(e.name ?? '').replace(/\s+/g, ' ').trim();
    out.push({ x, mins: e.mins, rank: +e.rank || 0, lane, label: `${String(e.ccy ?? '').toUpperCase()} ${name.length > 14 ? name.slice(0, 13) + '…' : name}`.trim() });
  }
  return out;
}

/** The headline for the day line. */
export function dayHeadline(b, key) {
  if (!b || !b.n) return null;
  const up = Array.from(b.move).filter(v => Number.isFinite(v) && v > 0).length, dn = Array.from(b.move).filter(v => Number.isFinite(v) && v < 0).length;
  const s = b.total >= 0 ? '+' : '−';
  return { hero: `${key} ${s}${Math.abs(b.total).toFixed(2)}%`, sub: `since London midnight · ${up} quarter-hours up, ${dn} down`, asOf: b.date ? `London ${b.date}` : null };
}
