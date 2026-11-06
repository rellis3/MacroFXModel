/**
 * The Options → Path chart's zoom maths (owner, 2026-11-06: "zoomable and movable like a TradingView chart").
 * Pure functions, no DOM and no d3, so they are tested on their own (js/terminal/pathZoom.test.mjs):
 *
 *   baseScale / zoomScale    the time axis: a piecewise-linear base (history on the left, the expiries to the right of
 *                            "now") and an x-only zoom transform { k, x } on top of it, the same algebra as d3.zoom's.
 *   clampTransform           zoom limits (the full view to about 5 days) and no panning past either end.
 *   windowTransform/preset   the transform that shows a chosen window of days (the 2W / 1M / 3M / All chips).
 *   yDomain / niceTicks      the y axis rescaled to what is in view.
 *   placeLabels              greedy label collision avoidance, biggest books first.
 *   thinTicks / timeTicks    day ticks thinned for the visible range.
 *   nearestPoint             the dot (or expiry line) a tap or hover means.
 *
 * Times are day numbers (days since 1970-01-01, UTC); x and y are SVG pixels.
 */
const fin = v => v != null && Number.isFinite(+v);
export const DAY_MS = 864e5;
export const dayNum = d => Date.parse(`${d}T00:00:00Z`) / DAY_MS;
export const isoOfDay = t => new Date(Math.round(t) * DAY_MS).toISOString().slice(0, 10);

/** Piecewise-linear base scale: t0 → L, tNow → xNow, tEnd → R. f(t) gives x, inv(x) gives t. */
export function baseScale({ t0, tNow, tEnd, L, xNow, R }) {
  const hs = (xNow - L) / Math.max(1, tNow - t0), fs = (R - xNow) / Math.max(1, tEnd - tNow);
  const f = t => (t <= tNow ? xNow - (tNow - t) * hs : xNow + (t - tNow) * fs);
  const inv = x => (x <= xNow ? tNow - (xNow - x) / hs : tNow + (x - xNow) / fs);
  return { f, inv, t0, tNow, tEnd, L, xNow, R, histPxPerDay: hs, futPxPerDay: fs };
}

export const IDENTITY = Object.freeze({ k: 1, x: 0 });
/** The base scale seen through a zoom transform { k, x }: x' = k·base(t) + x. */
export function zoomScale(base, tr = IDENTITY) {
  const k = tr?.k ?? 1, tx = tr?.x ?? 0;
  return { f: t => k * base.f(t) + tx, inv: x => base.inv((x - tx) / k), k, x: tx };
}
/** The days in view between the plot's edges. */
export const visibleWindow = (base, tr) => { const z = zoomScale(base, tr); return [z.inv(base.L), z.inv(base.R)]; };

/** The deepest zoom: `minDays` of the future fill the plot width. Never below 1 (the full view). */
export const maxZoom = (base, minDays = 5) => Math.max(1, (base.R - base.L) / Math.max(1e-9, minDays * base.futPxPerDay));

/** Keep k in [kMin, kMax] and the zoomed base covering the whole plot (no blank past either end). */
export function clampTransform(tr, base, { kMin = 1, kMax = maxZoom(base) } = {}) {
  const k = Math.min(kMax, Math.max(kMin, fin(tr?.k) ? +tr.k : 1));
  let x = fin(tr?.x) ? +tr.x : 0;
  const lo = base.R * (1 - k), hi = base.L * (1 - k);   // k·L + x ≤ L and k·R + x ≥ R
  x = Math.min(hi, Math.max(lo, x));
  return { k, x };
}

/** The transform that puts day `a` at the left edge and day `b` at the right edge (clamped). */
export function windowTransform(base, a, b, lim) {
  const pa = base.f(a), pb = base.f(b);
  if (!(pb > pa)) return clampTransform(IDENTITY, base, lim);
  const k = (base.R - base.L) / (pb - pa);
  return clampTransform({ k, x: base.L - k * pa }, base, lim);
}

/** The chips: '2W' | '1M' | '3M' show that many days ahead with "now" a fifth of the way in; 'All' is the full view. */
export const PRESET_DAYS = { '2W': 14, '1M': 31, '3M': 92 };
export function presetWindow(base, preset, { nowAt = 0.2 } = {}) {
  const n = PRESET_DAYS[preset];
  if (!n) return [base.inv(base.L), base.inv(base.R)];
  const b = Math.min(base.tEnd, base.tNow + n), pb = base.f(b), pNow = base.f(base.tNow);
  const pa = pNow - (pb - pNow) * nowAt / (1 - nowAt);
  return [base.inv(Math.max(base.L, pa)), b];
}
export const presetTransform = (base, preset, lim) => {
  if (!PRESET_DAYS[preset]) return clampTransform(IDENTITY, base, lim);
  const [a, b] = presetWindow(base, preset); return windowTransform(base, a, b, lim);
};
/** Which chip a transform matches (for the active state), or null. */
export function presetOf(base, tr, lim, tol = 0.02) {
  for (const p of ['All', ...Object.keys(PRESET_DAYS)]) {
    const q = presetTransform(base, p, lim);
    if (Math.abs(q.k - tr.k) / q.k < tol && Math.abs(q.x - tr.x) < 2) return p;
  }
  return null;
}
/** Keep the zoom, move so that day t sits at the plot's centre. */
export function centreOn(base, tr, t, lim) {
  const k = tr?.k ?? 1, mid = (base.L + base.R) / 2;
  return clampTransform({ k, x: mid - k * base.f(t) }, base, lim);
}

/** Visible items: the entries of `ts` (sorted day numbers) in [a, b] plus one neighbour each side, as indices. */
export function visibleRange(ts, a, b) {
  let i0 = ts.findIndex(t => t >= a); if (i0 < 0) i0 = ts.length;
  let i1 = -1; for (let i = ts.length - 1; i >= 0; i--) if (ts[i] <= b) { i1 = i; break; }
  return [Math.max(0, i0 - 1), Math.min(ts.length - 1, i1 + 1)];
}

/**
 * The y domain for what is in view. `values`: the prices in view (history, dots, the start price). `shade`: the
 * 1σ/2σ shading's extremes in view. The shading widens the axis, but the data keeps at least `minDataFrac` of the
 * height, so a wide 200-day cone never flattens the walk (the shading is clipped to the plot).
 */
export function yDomain(values, shade = [], { minDataFrac = 0.7, padFrac = 0.1, minSpanFrac = 0.004 } = {}) {
  const v = values.filter(fin).map(Number); if (!v.length) return null;
  let lo = Math.min(...v), hi = Math.max(...v);
  const mid = (lo + hi) / 2, minSpan = Math.abs(mid) * minSpanFrac || 1;
  if (hi - lo < minSpan) { lo = mid - minSpan / 2; hi = mid + minSpan / 2; }
  const span = hi - lo, maxSpan = span / minDataFrac;
  const s = shade.filter(fin).map(Number);
  let sLo = Math.min(lo, ...s), sHi = Math.max(hi, ...s);
  const extra = (sHi - sLo) - span;
  if (sHi - sLo > maxSpan && extra > 0) { const keep = (maxSpan - span) / extra; sLo = lo - (lo - sLo) * keep; sHi = hi + (sHi - hi) * keep; }
  const pad = (sHi - sLo) * padFrac;
  return [sLo - pad, sHi + pad];
}

/** About `n` round price levels across [lo, hi]. */
export function niceTicks(lo, hi, n = 5) {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / Math.max(1, n), p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
  const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}

/** Rough text width in px (the chart's sans-serif at `size`): good enough to keep labels apart. */
export const textW = (s, size = 11, bold = false) => String(s).length * size * (bold ? 0.62 : 0.58) + 2;

const overlap = (a, b, m = 0) => a.x0 < b.x1 + m && b.x0 < a.x1 + m && a.y0 < b.y1 + m && b.y0 < a.y1 + m;
/**
 * Greedy label placement. cands: [{ id, x, y, r, w, h, pri }] (the anchor dot at x, y with radius r; the label w × h).
 * Highest pri first; each tries right-above, right-below, left-above, left-below, then above and below; a label is
 * drawn only where it overlaps nothing already placed nor any obstacle ({ x0, y0, x1, y1, id? }; an obstacle with
 * the label's own id is ignored) and fits the bounds. Returns Map id → { x, y (baseline), anchor, box }.
 */
export function placeLabels(cands, { bounds = null, obstacles = [], margin = 2 } = {}) {
  const placed = [], out = new Map();
  const order = cands.slice().sort((a, b) => (b.pri ?? 0) - (a.pri ?? 0) || a.x - b.x);
  for (const c of order) {
    const r = c.r ?? 0, w = c.w, h = c.h, g = 3;
    const opts = [
      [c.x + r + g, c.y - r * 0.4 - g, 'start'], [c.x + r + g, c.y + r * 0.4 + h + g - 2, 'start'],
      [c.x - r - g, c.y - r * 0.4 - g, 'end'], [c.x - r - g, c.y + r * 0.4 + h + g - 2, 'end'],
      [c.x, c.y - r - g - 1, 'middle'], [c.x, c.y + r + h + g, 'middle']];
    for (const [x, y, anchor] of opts) {
      const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
      const box = { x0, x1: x0 + w, y0: y - h + 2, y1: y + 2 };
      if (bounds && (box.x0 < bounds.x0 || box.x1 > bounds.x1 || box.y0 < bounds.y0 || box.y1 > bounds.y1)) continue;
      if (placed.some(b => overlap(b, box, margin))) continue;
      if (obstacles.some(o => o.id !== c.id && overlap(o, box, 0))) continue;
      placed.push(box); out.set(c.id, { x, y, anchor, box }); break;
    }
  }
  return out;
}

/** Thin tick labels: items [{ x, w, pri }]; biggest pri first, keep those whose span (+gap) clears every kept one. */
export function thinTicks(items, { gap = 6, x0 = -Infinity, x1 = Infinity } = {}) {
  const kept = [];
  for (const it of items.slice().sort((a, b) => (b.pri ?? 0) - (a.pri ?? 0) || a.x - b.x)) {
    const a = it.x - it.w / 2, b = it.x + it.w / 2;
    if (a < x0 || b > x1) continue;
    if (kept.some(k => a < k.x + k.w / 2 + gap && k.x - k.w / 2 < b + gap)) continue;
    kept.push(it);
  }
  return kept.sort((a, b) => a.x - b.x);
}

/**
 * Calendar ticks for the days [a, b] across `px` pixels: the smallest step (1, 2, 3 days, a week on Mondays, two
 * weeks, then 1, 2, 3 months on the 1st) that leaves at least `minPx` per tick on average. Day numbers, ascending.
 */
export function timeTicks(a, b, px, { minPx = 58 } = {}) {
  const span = Math.max(1e-9, b - a), perDay = px / span;
  const steps = [1, 2, 3, 7, 14, 'm1', 'm2', 'm3', 'm6'];
  const step = steps.find(s => (typeof s === 'number' ? s : +s.slice(1) * 30.4) * perDay >= minPx) ?? 'm6';
  const out = [];
  if (typeof step === 'number') {
    const phase = step === 7 || step === 14 ? 4 : 0;   // day 4 (1970-01-05) is a Monday
    for (let t = Math.ceil((a - phase) / step) * step + phase; t <= b; t += step) out.push(t);
  } else {
    const m = +step.slice(1), d = new Date(Math.ceil(a) * DAY_MS);
    let y = d.getUTCFullYear(), mo = d.getUTCMonth() + (d.getUTCDate() > 1 ? 1 : 0);
    mo = Math.ceil(mo / m) * m;
    for (;;) { const t = Date.UTC(y, mo, 1) / DAY_MS; if (t > b) break; if (t >= a) out.push(t); mo += m; }
  }
  return out;
}

/** The point a tap or hover at (px, py) means: within maxDx horizontally (the expiry line), the closest in 2-D. */
export function nearestPoint(pts, px, py, { maxDx = 22, yWeight = 0.35 } = {}) {
  let best = null, bd = Infinity;
  for (const p of pts) {
    const dx = Math.abs(p.x - px); if (dx > maxDx) continue;
    const d = dx * dx + (yWeight * (p.y - py)) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
