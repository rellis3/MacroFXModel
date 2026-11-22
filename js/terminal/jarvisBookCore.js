// js/terminal/jarvisBookCore.js: the pure half of Jarvis's BOOK view: the desk's written morning calls as towers. DESCRIPTION ONLY: a tower is what the desk WROTE (its own call), never a forecast of ours;
// the bias engine's lean (no proven direction skill) and what the market actually did today are separate things and are never merged into it.
// Tower height = the card's conviction (low 1, medium 2, high 3); the card's size (0.35 / 0.5 ...) only sets how thick the tower is. A flat card is a low plinth in the card's own state wording
// (reviewState.js, the same logic the cards use): "Not reviewed" (dashed) is nobody having looked, "Neutral - reviewed" (solid) is a view of no lean.
import { reviewState } from './reviewState.js';
import { spoken } from './showCore.js';

const DIR = { STRONG_LONG: 1, LONG: 1, SHORT: -1, STRONG_SHORT: -1 };
const CONV = { low: 1, medium: 2, high: 3 };
export const PLINTH = 0.35;          // the height of a flat plinth, in conviction units
/** The conviction word of a card, lower case, or null. */
export const convWord = c => { const w = String(c?.conviction ?? '').toLowerCase(); return CONV[w] ? w : null; };

/**
 * One row per desk market. run = /api/desk-run (full) or ?summary=1 (ratings only: then `partial` is true and a flat card cannot be told apart, so it is "unknown").
 * Row: { key, state: 'long'|'short'|'neutral'|'unreviewed'|'unknown', call: -1|0|1, strong, conv: 'low'|'medium'|'high'|null, h (height, units), size, why, move: today's oc/usual ratio or null }.
 */
export function bookRows(run, moves = {}) {
  const head = run?.head; if (!head || head.ok === false) return { rows: [], partial: false, date: run?.date ?? null };
  const cards = head.book?.instruments ?? null, partial = !cards, src = cards ?? Object.fromEntries(Object.entries(head.ratings ?? {}).map(([k, r]) => [k, { rating: r }]));
  const rows = [];
  for (const [key, c] of Object.entries(src)) {
    const d = DIR[c?.rating] ?? 0, rs = reviewState(c), conv = convWord(c), strong = /^STRONG/.test(String(c?.rating));
    let state, h;
    if (d !== 0) { state = d > 0 ? 'long' : 'short'; h = CONV[conv] ?? 1; }
    else { state = partial ? 'unknown' : rs.state === 'neutral' ? 'neutral' : 'unreviewed'; h = PLINTH; }
    const m = moves[key]; rows.push({ key, state, call: d, strong, conv, h, size: Number.isFinite(+c?.size) ? +c.size : null, why: String(c?.why ?? ''), move: m == null ? null : m });
  }
  return { rows, partial, date: run.date ?? null };
}

/** The tower's 3D box: a call rises (long) or hangs (short) from the floor; a flat card is a low plinth above it. Thickness follows the card's size. k = world units per conviction step. */
export function towerBox(r, pos, k = 0.26) {
  const w = 0.04 + 0.03 * Math.min(1, (r.size ?? 0.5) / 0.5) + (r.call === 0 ? 0.014 : 0), y1 = r.call < 0 ? -r.h * k : r.h * k * (r.call === 0 ? 0.5 : 1), a = Math.min(0, y1), b = Math.max(0, y1);
  const x0 = pos.x - w, x1 = pos.x + w, z0 = pos.z - w, z1 = pos.z + w;
  return { pts: [[x0, a, z0], [x1, a, z0], [x1, a, z1], [x0, a, z1], [x0, b, z0], [x1, b, z0], [x1, b, z1], [x0, b, z1]], faces: { top: [4, 5, 6, 7], bottom: [0, 1, 2, 3], sides: [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]] }, tip: [pos.x, r.call < 0 ? a : b, pos.z], w };
}
/** Today's move beside the tower: a thin bar at the tower's right, in the market's own usual-move units (clipped at 3). null without a move. */
export function moveBar(r, pos, w = 0.07, k = 0.12) {
  if (r.move == null) return null; const v = Math.max(-3, Math.min(3, r.move)), x = pos.x + w + 0.03, y = v * k, a = Math.min(0, y), b = Math.max(0, y), e = 0.012;
  return { pts: [[x - e, a, pos.z - e], [x + e, a, pos.z - e], [x + e, a, pos.z + e], [x - e, a, pos.z + e], [x - e, b, pos.z - e], [x + e, b, pos.z - e], [x + e, b, pos.z + e], [x - e, b, pos.z + e]], v };
}

/** Counts and the biggest conviction, for the legend, the panel and the spoken script. */
export function bookSummary(rows) {
  const s = { n: rows.length, long: 0, short: 0, neutral: 0, unreviewed: 0, unknown: 0, calls: 0, flat: 0, top: [], topConv: null };
  for (const r of rows) s[r.state]++;
  s.calls = s.long + s.short; s.flat = s.neutral + s.unreviewed + s.unknown;
  const calls = rows.filter(r => r.call !== 0).sort((a, b) => b.h - a.h || (b.size ?? 0) - (a.size ?? 0) || a.key.localeCompare(b.key));
  s.topConv = calls[0]?.conv ?? null; s.top = calls.filter(r => r.h === calls[0]?.h).map(r => r.key);
  return s;
}

const list = a => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
/** The SHOW scene's words, or null when there is no book. Short plain sentences: it is spoken. */
export function bookScript(book) {
  if (!book?.rows?.length) return null; const s = bookSummary(book.rows);
  const parts = [s.calls ? `The desk has a view on ${s.calls} markets: ${s.long} long and ${s.short} short.` : 'The desk has no long or short call on any market this morning.'];
  if (s.top.length && !book.partial) parts.push(`The biggest conviction is ${s.topConv}, on ${list(s.top.slice(0, 3).map(spoken))}${s.top.length > 3 ? ' and others' : ''}.`);
  if (s.flat) parts.push(book.partial ? `${s.flat} markets are flat.` : s.unreviewed ? `${s.neutral} markets are neutral: the desk looked and has no lean. ${s.unreviewed} were simply not reviewed, which is not a neutral call.` : `${s.flat} markets are neutral: the desk looked at each and has no lean.`);
  parts.push("That is the desk's own call, written this morning, not a forecast.");
  return parts.join(' ');
}

// ───────────── the hologram's honest shapes (jarvisViewBook.js) ─────────────
// A review flagged that a conviction HEIGHT standing next to a MEASURED move invites a false comparison (two heights, no shared scale). So in the hologram HEIGHT means one thing
// only: the cyan bar, today's measured move in multiples of the market's usual move. A call's tower has ONE fixed height for every call (it only says long = rises, short = hangs);
// the conviction word is carried by the tower's WIDTH (three steps), its brightness and a count of rings at its foot (1 / 2 / 3), and is written on its label.
export const CALL_H = 0.5, FLAT_H = 0.03, MOVE_K = 0.32, MOVE_CAP = 3;
const CONV_STEP = { low: 1, medium: 2, high: 3 };
/** The conviction step 1..3 of a row (0 when the feed does not carry it, e.g. the ratings-only summary). */
export const convStep = r => CONV_STEP[r?.conv] ?? 0;
/**
 * A call's shape (world units, before the view's grid scale): { y0, y1 } the vertical extent (fixed height: +CALL_H long, -CALL_H short, a FLAT_H plinth when flat),
 * half-width w by conviction step (unknown = the middle width, drawn hollow), glow 0..1 by step, rings = step count, dashed for "Not reviewed" / unknown flat.
 */
export function callShape(r) {
  const step = convStep(r), call = r?.call ?? 0;
  const y1 = call > 0 ? CALL_H : call < 0 ? -CALL_H : FLAT_H, w = call === 0 ? 0.045 : [0.042, 0.028, 0.042, 0.058][step];
  return { y0: 0, y1, w, step, rings: call === 0 ? 0 : step, glow: call === 0 ? 0.35 : [0.55, 0.45, 0.72, 1][step], dashed: call === 0 && r?.state !== 'neutral', hollow: call !== 0 && step === 0 };
}
/** Today's measured move as a height: v = ratio clipped at ±MOVE_CAP usual moves, y = v * MOVE_K, capped flag, and the whole-number ticks (1x, 2x, 3x usual) the bar passes. null without a move. */
export function moveHeight(r) {
  if (r?.move == null || !Number.isFinite(r.move)) return null;
  const v = Math.max(-MOVE_CAP, Math.min(MOVE_CAP, r.move)), ticks = [];
  for (let k = 1; k <= Math.floor(Math.abs(v) + 1e-9); k++) ticks.push(Math.sign(v) * k * MOVE_K);
  return { v, y: v * MOVE_K, capped: Math.abs(r.move) > MOVE_CAP, ticks };
}
/**
 * The SHOW camera for the book, a pure function of progress p (0..1): an overview high over the street grid, a dive down to fly low past the tallest-conviction calls
 * (focus = their mean grid position, or null), then a rise to a three-quarter view. Returns { yaw, elev, dist, target: [x, y, z] } for an orbit (dist in grid units).
 */
export function bookShowCam(p, focus) {
  const e = x => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };
  const f = focus ?? { x: 0, z: 0 }, a = e(p / 0.3), b = e((p - 0.3) / 0.4), c = e((p - 0.72) / 0.28);
  const yaw = -0.55 + 0.35 * a + 0.75 * b + 0.25 * c, elev = 1.05 - 0.75 * a + 0.05 * b + 0.45 * c, dist = 2.9 - 1.6 * a + 0.1 * b + 1.1 * c;
  const k = a * (1 - c);
  return { yaw, elev, dist, target: [f.x * k, 0.06 + 0.05 * a, f.z * k] };
}
