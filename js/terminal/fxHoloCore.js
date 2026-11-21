// js/terminal/fxHoloCore.js: the pure maths behind Jarvis's FX MATRIX hologram (js/terminal/jarvisViewFxMatrix.js). Reads the payload of /api/ccy-strength (js/ccyStrengthCore.js:
// eight currencies, four windows 1H / 4H / 1D / 1W, scores in sigma that sum to zero, rank 1 = strongest) through fxMatrixCore's strengthTable, and builds
//   holoModel(payload)        the windows that have data, each currency's score / rank per window and its "stronger / weaker lately" word
//   windowState(model, key)   one window: the currencies in strength order (grid order), their scores, and the biggest pair gap (strongest over weakest)
//   heightOf(v)               a cell's column height: linear in sigma (one shared scale for every window, so a morph compares like with like), capped and MARKED as capped
//   ccyCard(model, key, ccy)  the selected currency's card: score, rank, the word, the two it has out-run most and the two it has lagged most
//   placeLabels(items)        greedy label placement so no two overlay labels overlap (priority first, nudged, else dropped)
//   fxgridScript(model)       the SHOW line: strongest / weakest over the shortest window and the biggest pair gap, in plain words
// A cell (row a, column b) = score(a) - score(b): how far a has out-run b over the window, in units of a normal move. DESCRIPTION ONLY: what has happened, never a forecast.
import { strengthTable, TURN_WORDS, KEYS } from './fxMatrixCore.js';

export { KEYS, TURN_WORDS };
const fin = v => v != null && v !== '' && Number.isFinite(+v);
export const PER_SIGMA = 0.36;          // world units of column height per 1 sigma
export const CAP_SIGMA = 5;             // a gap beyond this is drawn at the cap and marked as capped
export const SPOKEN = { USD: 'the dollar', EUR: 'the euro', GBP: 'sterling', JPY: 'the yen', CHF: 'the Swiss franc', CAD: 'the Canadian dollar', AUD: 'the Australian dollar', NZD: 'the New Zealand dollar' };
export const OVER = { '1H': 'over the last hour', '4H': 'over the last four hours', '1D': 'over the last day', '1W': 'over the last week' };
const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
/** Signed sigma for display: "+1.2" / "-0.4" / "0.0"; "n/a" for a missing value. */
export const sg = v => (!fin(v) ? 'n/a' : Math.abs(v) < 0.05 ? '0.0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`);

/** The whole payload reduced to what the hologram draws. Never throws: a bad payload gives { ok: false, error }. */
export function holoModel(payload) {
  let t; try { t = strengthTable(payload); } catch (e) { t = { ok: false, error: 'the currency strength payload could not be read' }; }
  if (!t?.ok) return { ok: false, error: t?.error ?? 'currency strength is not available' };
  const score = {}, rank = {};
  const windows = t.cols.map(c => {
    const s = {}, r = {}; let n = 0;
    for (const row of t.rows) { const cell = row.cells[c.key]; if (cell && fin(cell.score)) { s[row.ccy] = +cell.score; r[row.ccy] = fin(cell.rank) ? +cell.rank : null; n++; } }
    const available = !!c.available && n >= 2;
    score[c.key] = s; rank[c.key] = r;
    return { key: c.key, available, flat: !!c.flat, reason: available ? null : (c.reason ?? 'no data for this window'), unitPct: fin(c.unitPct) ? +c.unitPct : null, from: c.from ?? null, to: c.to ?? null };
  });
  const turning = Object.fromEntries(t.rows.map(r => [r.ccy, r.turning ?? null]));
  const ccys = t.rows.map(r => r.ccy);
  return { ok: true, ccys, windows, score, rank, turning, asOf: t.asOf, closed: t.closed, closeLabel: t.closeLabel, anyAvailable: windows.some(w => w.available) };
}

/** The window the view opens on: 1D when it has data (as the terminal board does), else the first window that does; null when none. */
export const defaultWindow = m => (!m?.ok ? null : m.windows.find(w => w.key === '1D' && w.available)?.key ?? m.windows.find(w => w.available)?.key ?? null);
/** The shortest window with data that actually moved (the SHOW scene's window); falls back to the shortest with data. */
export const shortestWindow = m => (!m?.ok ? null : m.windows.find(w => w.available && !w.flat)?.key ?? m.windows.find(w => w.available)?.key ?? null);

/**
 * One window: grid order = strongest first (ties keep the payload order), every currency's score (a currency with no score sits at 0 at the end), and the biggest pair gap.
 * Returns null when the window has no data.
 */
export function windowState(m, key) {
  const w = m?.ok ? m.windows.find(x => x.key === key) : null;
  if (!w?.available) return null;
  const sc = m.score[key] ?? {}, ccys = m.ccys;
  const order = [...ccys].sort((a, b) => (fin(sc[b]) ? sc[b] : -Infinity) - (fin(sc[a]) ? sc[a] : -Infinity) || ccys.indexOf(a) - ccys.indexOf(b));
  const score = Object.fromEntries(ccys.map(c => [c, fin(sc[c]) ? sc[c] : 0]));
  const idx = Object.fromEntries(order.map((c, i) => [c, i]));
  const has = order.filter(c => fin(sc[c]));
  const hi = has[0], lo = has[has.length - 1], gap = hi && lo && hi !== lo ? sc[hi] - sc[lo] : 0;
  const rank = Object.fromEntries(order.map((c, i) => [c, m.rank[key]?.[c] ?? (fin(sc[c]) ? i + 1 : null)]));
  return { key, order, idx, score, rank, missing: ccys.filter(c => !fin(sc[c])), biggest: gap > 0.05 ? { a: hi, b: lo, v: gap } : null, flat: w.flat || gap <= 0.05, unitPct: w.unitPct, from: w.from, to: w.to };
}

/** Column height for a gap of v sigma: linear, sign kept, capped at CAP_SIGMA and flagged so the view can mark it. NaN -> 0. */
export function heightOf(v, { perSigma = PER_SIGMA, cap = CAP_SIGMA } = {}) {
  if (!fin(v)) return { h: 0, capped: false };
  const a = Math.abs(+v), capped = a > cap;
  return { h: Math.sign(+v) * Math.min(a, cap) * perSigma, capped };
}

/** Linear blend of two window states' per-currency slot and score, for the morph (p 0..1, eased by the caller). Writes into out (allocated once). */
export function blendInto(out, from, to, p, ccys) {
  for (const c of ccys) {
    const a = from ?? to, b = to ?? from;
    out.idx[c] = (a?.idx[c] ?? 0) + ((b?.idx[c] ?? 0) - (a?.idx[c] ?? 0)) * p;
    out.score[c] = (a?.score[c] ?? 0) + ((b?.score[c] ?? 0) - (a?.score[c] ?? 0)) * p;
  }
  return out;
}

/** The selected currency's card over one window: its score and rank, the word, the two it has out-run most and the two it has lagged most (gaps in sigma). */
export function ccyCard(m, key, ccy) {
  const ws = windowState(m, key); if (!ws || !(ccy in ws.score)) return null;
  const s = ws.score[ccy], others = ws.order.filter(c => c !== ccy && !ws.missing.includes(c)).map(c => ({ ccy: c, v: s - ws.score[c] }));
  const outran = others.filter(o => o.v > 0.05).sort((a, b) => b.v - a.v).slice(0, 2), lagged = others.filter(o => o.v < -0.05).sort((a, b) => a.v - b.v).slice(0, 2);
  const word = m.turning?.[ccy] ?? null;
  return { ccy, key, score: ws.missing.includes(ccy) ? null : s, rank: ws.rank[ccy], of: ws.order.length - ws.missing.length, word, wordText: word ? TURN_WORDS[word] : null, outran, lagged };
}

/**
 * Greedy label placement: items [{ x, y, w, h, pri }] (x, y = the label's top-left in px). Highest pri first; a label that overlaps one already placed is nudged up or down
 * (by its own height, up to `tries` times each way); if it still overlaps, or leaves the bounds, it is dropped. Returns the items with { show, x, y } set (same array).
 */
export function placeLabels(items, { tries = 2, pad = 2, W = Infinity, H = Infinity } = {}) {
  const placed = [], hit = (a, b) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
  const order = items.map((it, i) => i).sort((i, j) => (items[j].pri ?? 0) - (items[i].pri ?? 0) || i - j);
  for (const i of order) {
    const it = items[i]; it.show = false;
    const offs = [0]; for (let k = 1; k <= tries; k++) offs.push(-k * (it.h + pad), k * (it.h + pad));
    for (const dy of offs) {
      const c = { x: it.x, y: it.y + dy, w: it.w, h: it.h };
      if (c.x < 0 || c.y < 0 || c.x + c.w > W || c.y + c.h > H) continue;
      if (placed.some(p => hit(c, p))) continue;
      it.x = c.x; it.y = c.y; it.show = true; placed.push(c); break;
    }
  }
  return items;
}

/** The SHOW line: 2-3 plain sentences over the shortest window that moved. null when there is nothing to say. No forecast words. */
export function fxgridScript(m) {
  const key = shortestWindow(m), ws = windowState(m, key); if (!ws) return null;
  const over = OVER[key] ?? `over the ${key} window`;
  if (ws.flat || !ws.biggest) return `${cap1(over)}, the eight major currencies have barely moved against each other, so the matrix lies flat. This describes what has happened, not a forecast.`;
  const { a, b, v } = ws.biggest, name = c => SPOKEN[c] ?? c;
  const second = ws.order.filter(c => !ws.missing.includes(c))[1];
  let s = `${cap1(over)}, ${name(a)} is the strongest of the eight major currencies and ${name(b)} the weakest.`;
  s += ` That is the biggest gap on the grid: ${name(a)} has out-run ${name(b)} by about ${v.toFixed(1)} times a usual move.`;
  if (second && second !== b) s += ` ${cap1(name(second))} is next strongest.`;
  return `${s} This describes what has happened, not a forecast.`;
}
