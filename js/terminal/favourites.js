// js/terminal/favourites.js: PAIR FAVOURITES. A star on a market keeps it on a short list of your own; the Pair tab can show only the starred ones.
//
// A display preference and nothing else: it changes which markets a person sees first, never a number. Everyone shares one desk login, so the list
// lives in THIS browser (localStorage), not on the server; 'Copy my favourites' / 'Paste favourites' move it to another device as plain text.
// Every storage call is in try/catch (private windows, blocked site data): the list still works for the visit, it just is not remembered.
import { isKnown } from './monitorCore.js';

export const KEY = 'deskFavourites:v1';
export const FILTER_KEY = 'deskFavouritesOnly:v1';
export const MAX = 60;
export const FAV_NAME = 'My favourites';

/** Known markets only, upper-cased, in order, no repeats, at most MAX. { items, dropped } */
export function cleanList(list, known = isKnown) {
  const items = [], dropped = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const w = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!w) continue;
    if (!known(w)) { dropped.push(w); continue; }
    if (items.includes(w)) continue;
    if (items.length >= MAX) { dropped.push(w); continue; }
    items.push(w);
  }
  return { items, dropped };
}

/** Pasted text in any shape: 'EURUSD, GOLD NQ', one per line, or the copy format 'FAVOURITES: EURUSD,GOLD'. */
export function parsePaste(text) {
  const body = String(text ?? '').replace(/^\s*favou?rites?\s*:/i, '');
  return cleanList(body.split(/[\s,;|]+/).filter(Boolean));
}
export const copyText = items => `FAVOURITES: ${items.join(',')}`;

const stripNote = n => (n === 1 ? 'market' : 'markets');

export function createFavourites({ store = null, known = isKnown } = {}) {
  const safe = (fn, d = null) => { try { return fn(); } catch { return d; } };
  let items = cleanList(safe(() => JSON.parse(store?.getItem(KEY) ?? '[]'), []), known).items;
  let only = safe(() => store?.getItem(FILTER_KEY), null) === '1';
  const subs = new Set();
  const persist = () => safe(() => { store?.setItem(KEY, JSON.stringify(items)); store?.setItem(FILTER_KEY, only ? '1' : '0'); });
  const emit = () => { for (const f of subs) safe(() => f()); };
  const norm = w => String(w ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  const api = {
    list: () => items.slice(),
    has: w => items.includes(norm(w)),
    get count() { return items.length; },
    get only() { return only && items.length > 0; },   // a filter on an empty list would show nothing: treat it as off
    subscribe(f) { subs.add(f); return () => subs.delete(f); },

    add(word) {
      const w = norm(word);
      if (!w || !known(w)) return { ok: false, error: `"${String(word ?? '').trim()}" is not a market on this terminal.` };
      if (items.includes(w)) return { ok: true, inst: w, already: true };
      if (items.length >= MAX) return { ok: false, error: `At most ${MAX} favourites: remove one first.` };
      items = [...items, w]; persist(); emit(); return { ok: true, inst: w };
    },
    remove(word) {
      const w = norm(word);
      if (!items.includes(w)) return { ok: true, inst: w, already: true };
      items = items.filter(x => x !== w); persist(); emit(); return { ok: true, inst: w };
    },
    toggle(word) { return api.has(word) ? api.remove(word) : api.add(word); },
    clear() { const n = items.length; items = []; only = false; persist(); emit(); return { ok: true, removed: n }; },
    setOnly(on) { only = !!on; persist(); emit(); return api.only; },

    copyText: () => copyText(items),
    /** Replace the list with pasted text. Nothing valid in it leaves the list as it was. */
    paste(text) {
      const { items: next, dropped } = parsePaste(text);
      if (!next.length) return { ok: false, error: 'No markets found in what was pasted. It should look like FAVOURITES: EURUSD,GOLD,NQ.' };
      items = next; persist(); emit();
      return { ok: true, count: next.length, dropped, message: `${next.length} ${stripNote(next.length)} loaded${dropped.length ? `; ${dropped.length} not on this terminal (${dropped.slice(0, 4).join(', ')}${dropped.length > 4 ? '…' : ''}) left out` : ''}.` };
    },
  };
  return api;
}

/** The one shared instance for the page (window.deskFavourites), made on first use. */
export function getFavourites(win = globalThis) {
  if (win.deskFavourites) return win.deskFavourites;
  const store = safeStore(win);
  const f = createFavourites({ store });
  try { win.deskFavourites = f; } catch { /* read-only global: still returned */ }
  return f;
}
function safeStore(win) { try { return win.localStorage ?? null; } catch { return null; } }
