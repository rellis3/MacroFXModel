// js/deskMonitors.js: the SERVER half of the Desk Terminal's named monitors (js/terminal/monitorCore.js has the rules).
// One KV key, desk_monitors_v1 = { v:1, lists:[{ name, items, updated }] }, shared by everyone on the desk (one login, one list). Pure apart from the kv argument.
// A write is read-modify-write on the whole list (at most MAX_LISTS lists of at most MAX_ITEMS markets, a few KB), so two people saving at once can lose one save; the page re-reads after every write.
import { sanitizeStore, cleanItems, cleanName, starterByName, MAX_LISTS } from './terminal/monitorCore.js';

export const KEY = 'desk_monitors_v1';

export async function readStore(kv) {
  try { const raw = await kv.get(KEY); return sanitizeStore(raw ? JSON.parse(raw) : {}); } catch { return { v: 1, lists: [] }; }
}

/** body: { action: 'save'|'delete', name, items? }. Returns { ok:true, store } (the caller writes it) or { ok:false, status, error }. Never throws. */
export function applyAction(store, body, nowIso = new Date().toISOString()) {
  const a = String(body?.action ?? ''), name = cleanName(body?.name);
  if (!name) return { ok: false, status: 400, error: 'A monitor needs a name.' };
  const lists = store.lists.slice(), at = lists.findIndex(l => l.name.toLowerCase() === name.toLowerCase());
  if (a === 'save') {
    if (starterByName(name)) return { ok: false, status: 400, error: `"${name}" is a built-in starter: save under your own name.` };
    const { items } = cleanItems(body?.items);
    if (!items.length) return { ok: false, status: 400, error: 'A monitor needs at least one market this terminal knows.' };
    const row = { name, items, updated: nowIso };
    if (at >= 0) lists[at] = row;
    else if (lists.length >= MAX_LISTS) return { ok: false, status: 400, error: `At most ${MAX_LISTS} saved monitors: delete one first.` };
    else lists.push(row);
    return { ok: true, store: { v: 1, lists } };
  }
  if (a === 'delete') {
    if (at < 0) return { ok: false, status: 404, error: `No saved monitor called "${name}".` };
    lists.splice(at, 1);
    return { ok: true, store: { v: 1, lists } };
  }
  return { ok: false, status: 400, error: 'Unknown action: use save or delete.' };
}

/** The route logic, kept here so the test can run it without Express. role: 'owner' | 'viewer' | null. */
export async function handle({ method, role, body, kv, on = () => true }) {
  if (!role) return { status: 401, json: { ok: false, error: 'sign in first' } };
  if (role !== 'owner' && !on('tab.monitor')) return { status: 403, json: { ok: false, error: 'not switched on' } };
  if (method === 'GET') return { status: 200, json: { ok: true, ...(await readStore(kv)) } };
  if (method !== 'POST') return { status: 405, json: { ok: false, error: 'GET or POST' } };
  if (role !== 'owner') return { status: 403, json: { ok: false, error: 'only the owner saves monitors' } };
  const r = applyAction(await readStore(kv), body);
  if (!r.ok) return { status: r.status, json: { ok: false, error: r.error } };
  try { await kv.put(KEY, JSON.stringify(r.store)); } catch (e) { return { status: 500, json: { ok: false, error: `could not save: ${e.message}` } }; }
  return { status: 200, json: { ok: true, ...r.store } };
}
