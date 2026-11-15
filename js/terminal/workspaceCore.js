// js/terminal/workspaceCore.js: the LAYOUT MODEL of the Desk Terminal's Workspace tab. Pure: no DOM, no fetch (workspaceView.js is the DOM half, js/deskWorkspaces.js the server half).
//
// A workspace is a named grid of tiles. Each tile shows ONE registered panel surface (js/terminal/tabRegistry.js, kind 'panel'):
//   { v: 1, name, tiles: [{ id: 'panel.macro.fedyields', x, y, w, h }] }       12 columns, rows of any height, whole numbers only
// Everything that can reach a layout (the browser's saved copy, the server's shared copy, an imported file) goes through sanitizeLayout(), which
//   - drops a tile whose surface is not registered (a panel that was renamed or removed) and says so in `dropped`, it never throws,
//   - keeps each surface once, clamps every number into the grid, caps the tile count, and
//   - pushes overlapping tiles down so no two tiles ever share a cell.
// The three STARTERS are built in (they cannot be deleted; saving over one makes a copy under your own name).
import { SURFACES } from './tabRegistry.js';

export const COLS = 12, MAX_TILES = 24, MAX_H = 40, MAX_Y = 400, NAME_MAX = 40, MAX_LAYOUTS = 30, MIN_W = 2, MIN_H = 3;
export const FILE_KIND = 'desk-workspace';

/** Every panel surface a tile may show: id -> its registry row. */
export const PANELS = new Map(SURFACES.filter(s => s.kind === 'panel').map(s => [s.id, s]));
export const isPanel = id => PANELS.has(id);

/** The tab section a panel lives in (its home): panel.ov.* is on Overview, panel.macro.* on Macro, and so on. null when unknown. */
const HOME = { ov: 'overview', ccy: 'ccy', asset: 'assets', ana: 'ana', charts: 'charts', changed: 'changed', corr: 'corr', macro: 'macro' };
export const homeSection = id => HOME[String(id).split('.')[1]] ?? null;

const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
export const cleanName = s => String(s ?? '').replace(/[\u0000-\u001f<>"`]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);

/** A sensible first size for a new tile (wide boards get the full width). */
export function defaultSize(id) {
  const key = String(id).split('.').slice(0, 2).join('.');
  if (/^panel\.macro\.(fedyields|curve|creditliq|globalyields|ratesboard|cbboard|livelayer|regime|vol)$/.test(id)) return { w: 12, h: 12 };
  if (key === 'panel.macro') return { w: 6, h: 10 };
  return { w: 6, h: 9 };
}

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Lay the tiles out with no overlap. The tile named `first` keeps its place and the others give way (moved down); otherwise the order is top to bottom, left to right.
 * Deterministic and idempotent: a layout with no overlaps comes back unchanged.
 */
export function resolve(tiles, first = null) {
  const order = [...tiles].sort((a, b) => (a.id === first ? -1 : b.id === first ? 1 : a.y - b.y || a.x - b.x));
  const placed = [];
  for (const t of order) {
    const c = { ...t };
    for (let guard = 0; guard < 200; guard++) {
      const hit = placed.find(p => overlap(c, p));
      if (!hit) break;
      c.y = hit.y + hit.h;
    }
    c.y = Math.min(c.y, MAX_Y);
    placed.push(c);
  }
  const byId = new Map(placed.map(t => [t.id, t]));
  return tiles.map(t => byId.get(t.id));   // keep the caller's order
}

/** A raw tile, or null if it is not one. Position and size are clamped so the tile fits inside the grid. */
function cleanTile(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return null;
  const w = int(raw.w, MIN_W, COLS, 6), h = int(raw.h, MIN_H, MAX_H, 8);
  return { id: raw.id, x: int(raw.x, 0, COLS - w, 0), y: int(raw.y, 0, MAX_Y, 0), w, h };
}

/**
 * Anything -> a safe layout. known(id) says which surfaces exist (default: the registered panels).
 * Returns { layout, dropped: [{ id, why }] }. A value that is not a layout at all gives an empty one named 'Untitled'.
 */
export function sanitizeLayout(raw, known = isPanel) {
  const dropped = [], seen = new Set(), tiles = [];
  const src = raw && typeof raw === 'object' && Array.isArray(raw.tiles) ? raw.tiles : [];
  for (const r of src) {
    const t = cleanTile(r);
    if (!t) { dropped.push({ id: String(r?.id ?? '?'), why: 'not a tile' }); continue; }
    if (!known(t.id)) { dropped.push({ id: t.id, why: 'not a surface this terminal has' }); continue; }
    if (seen.has(t.id)) { dropped.push({ id: t.id, why: 'already on the grid' }); continue; }
    if (tiles.length >= MAX_TILES) { dropped.push({ id: t.id, why: `more than ${MAX_TILES} tiles` }); continue; }
    seen.add(t.id); tiles.push(t);
  }
  const name = cleanName(raw?.name) || 'Untitled';
  return { layout: { v: 1, name, tiles: resolve(tiles) }, dropped };
}

/** Where a new tile goes: full width of its size, directly under everything already there. */
export function addTile(tiles, id, known = isPanel) {
  if (!known(id) || tiles.some(t => t.id === id) || tiles.length >= MAX_TILES) return tiles;
  const { w, h } = defaultSize(id), bottom = tiles.reduce((m, t) => Math.max(m, t.y + t.h), 0);
  return resolve([...tiles, { id, x: 0, y: bottom, w, h }], id);
}
export const removeTile = (tiles, id) => tiles.filter(t => t.id !== id);
export function moveTile(tiles, id, x, y) {
  const t = tiles.find(q => q.id === id); if (!t) return tiles;
  return resolve(tiles.map(q => (q.id === id ? { ...q, x: int(x, 0, COLS - q.w, q.x), y: int(y, 0, MAX_Y, q.y) } : q)), id);
}
export function resizeTile(tiles, id, w, h) {
  const t = tiles.find(q => q.id === id); if (!t) return tiles;
  const nw = int(w, MIN_W, COLS, t.w), nh = int(h, MIN_H, MAX_H, t.h);
  return resolve(tiles.map(q => (q.id === id ? { ...q, w: nw, h: nh, x: Math.min(q.x, COLS - nw) } : q)), id);
}

/** Pixels to the nearest grid cell: snap(137, 48) = 3. Used by the drag handlers. */
export const snap = (px, cell) => (cell > 0 ? Math.round(px / cell) : 0);

// ── the built-in starters ──
const S = (name, note, list) => ({ name, note, starter: true, tiles: resolve(list.map(([id, x, y, w, h]) => ({ id, x, y, w, h }))) });
export const STARTERS = [
  S('Morning', 'The day\'s book, who is strong, the risk state and what is released today.', [
    ['panel.ov.book', 0, 0, 8, 10], ['panel.ov.riskstate', 8, 0, 4, 10], ['panel.ov.ccystrength', 0, 10, 6, 10], ['panel.ov.priceread', 6, 10, 6, 10], ['panel.ov.releases', 0, 20, 12, 9]]),
  S('Rates', 'The Fed path, the curve, global yields and the rate gaps between currencies.', [
    ['panel.macro.fedyields', 0, 0, 12, 13], ['panel.macro.curve', 0, 13, 6, 11], ['panel.macro.globalyields', 6, 13, 6, 11], ['panel.macro.ratediff', 0, 24, 6, 9], ['panel.macro.termprem', 6, 24, 6, 9]]),
  S('Event day', 'The FOMC clock, today\'s releases, the live market layer, vol against its forecast and the fear gauges.', [
    ['panel.macro.fomcstrip', 0, 0, 6, 10], ['panel.macro.releases', 6, 0, 6, 10], ['panel.macro.livelayer', 0, 10, 12, 11], ['panel.asset.volclock', 0, 21, 6, 11], ['panel.macro.vol', 6, 21, 6, 11]]),
];
export const starterByName = n => STARTERS.find(s => s.name.toLowerCase() === String(n ?? '').trim().toLowerCase()) ?? null;

// ── files: export and import ──
export function exportLayout(layout) {
  const { layout: l } = sanitizeLayout(layout);
  return JSON.stringify({ kind: FILE_KIND, v: 1, name: l.name, tiles: l.tiles }, null, 2);
}
/** Text of an exported file -> { ok:true, layout, dropped } or { ok:false, error }. Never throws. */
export function parseImport(text, known = isPanel) {
  let j;
  try { j = JSON.parse(String(text)); } catch { return { ok: false, error: 'That file is not JSON.' }; }
  if (!j || typeof j !== 'object' || j.kind !== FILE_KIND) return { ok: false, error: 'That is not a Desk Terminal workspace file.' };
  if (j.v !== 1) return { ok: false, error: `This file is version ${j.v}; this terminal reads version 1.` };
  const r = sanitizeLayout(j, known);
  if (!r.layout.tiles.length) return { ok: false, error: 'The file has no tiles this terminal knows.', dropped: r.dropped };
  return { ok: true, layout: r.layout, dropped: r.dropped };
}

/** A name that is not taken: 'Rates', then 'Rates 2', 'Rates 3'... Case-insensitive. */
export function uniqueName(want, taken) {
  const base = cleanName(want) || 'Untitled', have = new Set([...taken].map(n => String(n).toLowerCase()));
  if (!have.has(base.toLowerCase())) return base;
  for (let i = 2; i < 100; i++) { const n = `${base.slice(0, NAME_MAX - 3)} ${i}`; if (!have.has(n.toLowerCase())) return n; }
  return base;
}

/** The saved-list shape the server keeps and the browser mirrors: { v:1, layouts:[{ name, tiles, updated }] }. Bad entries are dropped, names made unique, the count capped. */
export function sanitizeStore(raw, known = isPanel) {
  const out = [], names = new Set();
  for (const r of Array.isArray(raw?.layouts) ? raw.layouts : []) {
    if (out.length >= MAX_LAYOUTS) break;
    const { layout } = sanitizeLayout(r, known);
    if (!layout.tiles.length || names.has(layout.name.toLowerCase())) continue;
    names.add(layout.name.toLowerCase());
    out.push({ name: layout.name, tiles: layout.tiles, updated: typeof r.updated === 'string' ? r.updated.slice(0, 30) : null });
  }
  return { v: 1, layouts: out };
}
