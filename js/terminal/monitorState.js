// js/terminal/monitorState.js: the CONTROLLER of the Monitor tab: which monitor is open, the saved list, add / remove / reorder, save / delete. No DOM and
// no fetch of its own; the page passes
//   api    { list(): Promise<{ ok, lists }>, post(body): Promise<{ ok, lists?, error? }> }   (the desk's shared monitors, /api/desk-monitors)
//   store  a localStorage-like { getItem, setItem } (this browser's open monitor survives a reload; every use is in try/catch)
// Every method that can fail returns { ok:false, error } in words and never throws.
import { STARTERS, starterByName, cleanItems, cleanName, MAX_ITEMS, isKnown, MAX_LISTS } from './monitorCore.js';

export const LOCAL_KEY = 'deskMonitor:v1';
const clone = o => JSON.parse(JSON.stringify(o));

export function createMonitorState({ api, store = null, known = isKnown } = {}) {
  let cur = { name: STARTERS[0].name, items: clone(STARTERS[0].items), source: 'starter' };
  let saved = [], dirty = false, note = '';
  const subs = new Set();
  const emit = () => { for (const f of subs) { try { f(); } catch { /* one bad view must not stop the others */ } } };
  const safe = (fn, d = null) => { try { return fn(); } catch { return d; } };
  const persist = () => safe(() => store?.setItem(LOCAL_KEY, JSON.stringify({ name: cur.name, source: cur.source, items: cur.items, dirty })));
  const change = (items, msg = '') => { cur = { ...cur, items }; dirty = true; note = msg; persist(); emit(); };
  const setSaved = lists => { saved = Array.isArray(lists) ? lists : saved; };
  const takenNames = () => [...STARTERS.map(s => s.name), ...saved.map(l => l.name)];

  const s = {
    get current() { return cur; }, get dirty() { return dirty; }, get saved() { return saved; }, get note() { return note; },
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
    allNames() { return takenNames(); },

    /** This browser's last monitor first, then the shared list. Offline or signed out: the starters still work. */
    async init() {
      const local = safe(() => JSON.parse(store?.getItem(LOCAL_KEY) ?? 'null'));
      if (local && Array.isArray(local.items)) {
        const { items, dropped } = cleanItems(local.items, known);
        if (items.length) {
          cur = { name: cleanName(local.name) || 'My monitor', items, source: ['starter', 'saved', 'new'].includes(local.source) ? local.source : 'new' }; dirty = !!local.dirty;
          if (dropped.length) note = `${dropped.length} market${dropped.length === 1 ? '' : 's'} in your last monitor ${dropped.length === 1 ? 'is' : 'are'} not on this terminal and ${dropped.length === 1 ? 'was' : 'were'} left out.`;
        }
      }
      await s.refresh();
      emit();
      return s;
    },
    async refresh() {
      try { const r = await api.list(); if (r?.ok) setSaved(r.lists); else if (r?.error) note = `Saved monitors: ${r.error}`; } catch { note = 'Saved monitors could not be reached; the starters and this browser still work.'; }
      emit();
    },

    /** Open a starter or a saved monitor by name (any case; a unique prefix is enough). */
    load(name) {
      const w = String(name ?? '').trim().toLowerCase();
      const all = [...STARTERS.map(x => ({ ...x, source: 'starter' })), ...saved.map(x => ({ ...x, source: 'saved' }))];
      const hit = all.find(x => x.name.toLowerCase() === w) ?? (() => { const m = all.filter(x => x.name.toLowerCase().startsWith(w)); return m.length === 1 ? m[0] : null; })();
      if (!hit) return { ok: false, error: `No monitor called "${name}". Try ${all.map(x => x.name).join(', ')}.` };
      const { items } = cleanItems(hit.items, known);
      cur = { name: hit.name, items, source: hit.source }; dirty = false; note = ''; persist(); emit();
      return { ok: true };
    },
    async save(name = null) {
      const target = cleanName(name ?? (cur.source === 'saved' ? cur.name : ''));
      if (!target) return { ok: false, needName: true, error: 'Give it a name of your own to save it.' };
      if (starterByName(target)) return { ok: false, needName: true, error: `"${target}" is a built-in starter: pick your own name.` };
      if (!cur.items.length) return { ok: false, error: 'Add at least one market before saving.' };
      if (!saved.some(l => l.name.toLowerCase() === target.toLowerCase()) && saved.length >= MAX_LISTS) return { ok: false, error: `At most ${MAX_LISTS} saved monitors: delete one first.` };
      let r; try { r = await api.post({ action: 'save', name: target, items: cur.items }); } catch { r = { ok: false, error: 'Could not reach the server.' }; }
      if (!r?.ok) return { ok: false, error: r?.error ?? 'Could not save.' };
      setSaved(r.lists); cur = { ...cur, name: target, source: 'saved' }; dirty = false; note = `Saved as "${target}" for everyone on the desk.`; persist(); emit();
      return { ok: true };
    },
    async remove() {
      if (cur.source !== 'saved') return { ok: false, error: 'A built-in starter cannot be deleted.' };
      const was = cur.name; let r; try { r = await api.post({ action: 'delete', name: was }); } catch { r = { ok: false, error: 'Could not reach the server.' }; }
      if (!r?.ok) return { ok: false, error: r?.error ?? 'Could not delete.' };
      setSaved(r.lists); cur = { name: was, items: cur.items, source: 'new' }; dirty = true; note = `"${was}" deleted from the shared list. The markets you have open are kept until you leave.`; persist(); emit();
      return { ok: true };
    },

    add(word) {
      const w = String(word ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!w || !known(w)) return { ok: false, error: `"${String(word ?? '').trim()}" is not a market on this terminal.` };
      if (cur.items.includes(w)) return { ok: false, error: `${w} is already on this monitor.` };
      if (cur.items.length >= MAX_ITEMS) return { ok: false, error: `At most ${MAX_ITEMS} markets on a monitor.` };
      change([...cur.items, w]); return { ok: true, inst: w };
    },
    removeItem(inst) { change(cur.items.filter(x => x !== inst)); },
    /** Move one market up (-1) or down (+1). */
    move(inst, delta) {
      const i = cur.items.indexOf(inst), j = i + delta;
      if (i < 0 || j < 0 || j >= cur.items.length) return;
      const a = cur.items.slice(); [a[i], a[j]] = [a[j], a[i]]; change(a);
    },
  };
  return s;
}
