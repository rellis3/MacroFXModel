// js/deskNewsSearches.js: the SERVER half of the News tab's saved searches (js/terminal/newsSearchCore.js has the rules).
// One KV key, desk_news_searches_v1 = { v:1, searches:[{ name, q, tier, keys, onlyBook, updated }] }, shared by everyone on the desk (one login, one list). Pure apart from the kv argument.
// Reads: the owner only (a desk login gets an empty list: its own searches live in its browser). Writes: the owner only.
import { sanitizeStore, applyAction } from './terminal/newsSearchCore.js';

export const KEY = 'desk_news_searches_v1';

export async function readStore(kv) {
  try { const raw = await kv.get(KEY); return sanitizeStore(raw ? JSON.parse(raw) : {}); } catch { return { v: 1, searches: [] }; }
}

/** The route logic, kept here so the test can run it without Express. role: 'owner' | 'viewer' | null. */
export async function handle({ method, role, body, kv, on = () => true }) {
  if (!role) return { status: 401, json: { ok: false, error: 'sign in first' } };
  if (role !== 'owner' && !on('panel.news.saved')) return { status: 403, json: { ok: false, error: 'not switched on' } };
  // the owner's saved searches are the owner's: a desk login keeps its own in its browser (js/terminal/newsSearchView.js localSearches) and is never sent this list
  if (method === 'GET') return role === 'owner' ? { status: 200, json: { ok: true, ...(await readStore(kv)) } } : { status: 200, json: { ok: true, v: 1, searches: [], note: 'your saved searches are kept in this browser' } };
  if (method !== 'POST') return { status: 405, json: { ok: false, error: 'GET or POST' } };
  if (role !== 'owner') return { status: 403, json: { ok: false, error: 'only the owner saves searches' } };
  const r = applyAction(await readStore(kv), body);
  if (!r.ok) return { status: r.status, json: { ok: false, error: r.error } };
  try { await kv.put(KEY, JSON.stringify(r.store)); } catch (e) { return { status: 500, json: { ok: false, error: `could not save: ${e.message}` } }; }
  return { status: 200, json: { ok: true, ...r.store } };
}
