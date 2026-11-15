// js/deskWorkspaces.js: the SERVER half of the Desk Terminal's named workspaces (js/terminal/workspaceCore.js has the layout model).
// One KV key, desk_workspaces_v1 = { v:1, layouts:[{ name, tiles, updated }] }, shared by everyone on the desk (one login, one list). Pure apart from the kv argument.
// A write is read-modify-write on the whole list (at most MAX_LAYOUTS small layouts, a few KB), so two people saving at once can lose one save; the page re-reads after every write.
import { sanitizeLayout, sanitizeStore, starterByName, cleanName, MAX_LAYOUTS } from './terminal/workspaceCore.js';

export const KEY = 'desk_workspaces_v1';

export async function readStore(kv) {
  try { const raw = await kv.get(KEY); return sanitizeStore(raw ? JSON.parse(raw) : {}); } catch { return { v: 1, layouts: [] }; }
}

/**
 * Apply one action to the list. body: { action: 'save'|'delete'|'rename', name, newName?, layout? }.
 * Returns { ok:true, store } (the caller writes it) or { ok:false, status, error }. Never throws.
 */
export function applyAction(store, body, nowIso = new Date().toISOString()) {
  const a = String(body?.action ?? ''), name = cleanName(body?.name);
  if (!name) return { ok: false, status: 400, error: 'A workspace needs a name.' };
  const layouts = store.layouts.slice(), at = layouts.findIndex(l => l.name.toLowerCase() === name.toLowerCase());
  if (a === 'save') {
    if (starterByName(name)) return { ok: false, status: 400, error: `"${name}" is a built-in starter: save under your own name.` };
    const { layout } = sanitizeLayout({ ...(body.layout ?? {}), name });
    if (!layout.tiles.length) return { ok: false, status: 400, error: 'A workspace needs at least one tile this terminal knows.' };
    const row = { name, tiles: layout.tiles, updated: nowIso };
    if (at >= 0) layouts[at] = row;
    else if (layouts.length >= MAX_LAYOUTS) return { ok: false, status: 400, error: `At most ${MAX_LAYOUTS} saved workspaces: delete one first.` };
    else layouts.push(row);
    return { ok: true, store: { v: 1, layouts } };
  }
  if (a === 'delete') {
    if (at < 0) return { ok: false, status: 404, error: `No saved workspace called "${name}".` };
    layouts.splice(at, 1);
    return { ok: true, store: { v: 1, layouts } };
  }
  if (a === 'rename') {
    if (at < 0) return { ok: false, status: 404, error: `No saved workspace called "${name}".` };
    const nn = cleanName(body?.newName);
    if (!nn) return { ok: false, status: 400, error: 'Say what to rename it to.' };
    if (starterByName(nn)) return { ok: false, status: 400, error: `"${nn}" is a built-in starter name.` };
    if (nn.toLowerCase() !== name.toLowerCase() && layouts.some(l => l.name.toLowerCase() === nn.toLowerCase())) return { ok: false, status: 400, error: `"${nn}" is already used.` };
    layouts[at] = { ...layouts[at], name: nn, updated: nowIso };
    return { ok: true, store: { v: 1, layouts } };
  }
  return { ok: false, status: 400, error: 'Unknown action: use save, delete or rename.' };
}

/** The route logic, kept here so the test can run it without Express. role: 'owner' | 'viewer' | null. */
export async function handle({ method, role, body, kv, on = () => true }) {
  if (!role) return { status: 401, json: { ok: false, error: 'sign in first' } };
  if (role !== 'owner' && !on('tab.workspace')) return { status: 403, json: { ok: false, error: 'not switched on' } };
  if (method === 'GET') return { status: 200, json: { ok: true, ...(await readStore(kv)) } };
  if (method !== 'POST') return { status: 405, json: { ok: false, error: 'GET or POST' } };
  const r = applyAction(await readStore(kv), body);
  if (!r.ok) return { status: r.status, json: { ok: false, error: r.error } };
  try { await kv.put(KEY, JSON.stringify(r.store)); } catch (e) { return { status: 500, json: { ok: false, error: `could not save: ${e.message}` } }; }
  return { status: 200, json: { ok: true, ...r.store } };
}
