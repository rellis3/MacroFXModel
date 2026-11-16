// js/terminal/newsSearchCore.js: SAVED NEWS SEARCHES on the News tab, pure. A saved search is the News tab's own filter (words, tier, currency/asset keys, "only
// headlines on today's book") kept under a name for the whole desk; one click applies it, and the owner can turn its words into a keyword alert
// (js/deskAlertRulesCore.js kind news_keyword). Nothing here reads or ranks headlines: the filter is js/terminal/newsView.js filterNews.
// Direction note: the arrows on a headline are the news analyst's reading of the first move it implies. The Evidence Book holds no validated headline-direction
// rule (news-asymmetry, bad-versus-good surprise size, is NULL), so a saved search finds headlines and never says which way to trade them.
import { NEWS_KEYS } from './newsView.js';

export const MAX_SEARCHES = 12;
export const NAME_MAX = 40;
export const Q_MAX = 60;

export const cleanName = s => String(s ?? '').replace(/[<>"&\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);

/** The filter as the tab holds it -> a stored search, or null when it has no words and no key (an empty search would be "everything"). */
export function cleanSearch(raw) {
  const q = String(raw?.q ?? '').toLowerCase().replace(/[\u0000-\u001f<>"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, Q_MAX);
  const keys = [...new Set((Array.isArray(raw?.keys) ? raw.keys : []).map(k => String(k).toUpperCase()).filter(k => NEWS_KEYS.includes(k)))].slice(0, 5);
  if (q.length < 2 && !keys.length) return null;
  return { q: q.length >= 2 ? q : '', tier: [1, 2, 3].includes(+raw?.tier) ? +raw.tier : 2, keys, onlyBook: !!raw?.onlyBook };
}

/** The stored shape: { v:1, searches:[{ name, q, tier, keys, onlyBook, updated }] }. Anything that does not validate is dropped. */
export function sanitizeStore(raw) {
  const out = [], seen = new Set();
  for (const s of Array.isArray(raw?.searches) ? raw.searches : []) {
    const name = cleanName(s?.name), c = cleanSearch(s); if (!name || !c || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, ...c, updated: typeof s?.updated === 'string' ? s.updated.slice(0, 30) : null });
    if (out.length >= MAX_SEARCHES) break;
  }
  return { v: 1, searches: out };
}

/** One action on the stored list: save | delete. { ok:true, store } or { ok:false, status, error }. */
export function applyAction(store, body, nowIso = new Date().toISOString()) {
  const a = String(body?.action ?? ''), name = cleanName(body?.name);
  if (!name) return { ok: false, status: 400, error: 'A saved search needs a name.' };
  const list = store.searches.slice(), at = list.findIndex(s => s.name.toLowerCase() === name.toLowerCase());
  if (a === 'save') {
    const c = cleanSearch(body?.search);
    if (!c) return { ok: false, status: 400, error: 'Type some words (at least two letters) or pick a currency or asset first: an empty search is the whole wire.' };
    const row = { name, ...c, updated: nowIso };
    if (at >= 0) list[at] = row;
    else if (list.length >= MAX_SEARCHES) return { ok: false, status: 400, error: `At most ${MAX_SEARCHES} saved searches: delete one first.` };
    else list.push(row);
    return { ok: true, store: { v: 1, searches: list } };
  }
  if (a === 'delete') {
    if (at < 0) return { ok: false, status: 404, error: `No saved search called "${name}".` };
    list.splice(at, 1);
    return { ok: true, store: { v: 1, searches: list } };
  }
  return { ok: false, status: 400, error: 'Unknown action: use save or delete.' };
}

/** A search in a phrase: 'words "ecb hawkish", tier 1 and 2, EUR'. */
export function describeSearch(s) {
  const bits = [];
  if (s.q) bits.push(`words "${s.q}"`);
  bits.push(s.tier === 1 ? 'tier 1 only' : s.tier === 2 ? 'tier 1 and 2' : 'any tier');
  if (s.keys?.length) bits.push(s.keys.join(', '));
  if (s.onlyBook) bits.push("only headlines on today's book");
  return bits.join(', ');
}

/** The keyword alert a search can become: { ok:true, kind, params } or { ok:false, error } (an alert needs words to look for). */
export function alertFor(s) {
  if (!s?.q) return { ok: false, error: 'A keyword alert needs words to look for. Add some words to the search first.' };
  return { ok: true, kind: 'news_keyword', params: { q: s.q, tier: s.tier, ...(s.keys?.length ? { keys: s.keys } : {}) } };
}

/** Do two filters mean the same thing? (to show "changed since you applied it") */
export const sameFilter = (a, b) => {
  const x = cleanSearch(a), y = cleanSearch(b);
  if (!x || !y) return !x && !y;
  return x.q === y.q && x.tier === y.tier && x.onlyBook === y.onlyBook && [...x.keys].sort().join() === [...y.keys].sort().join();
};
