// js/terminal/workspaceState.js: the CONTROLLER of the Workspace tab: which layout is open, whether it has unsaved changes, the saved list, and every
// action (load, save, save as, rename, delete, add / move / resize / remove a tile, export, import). No DOM and no fetch of its own: the page passes
//   api    { list(): Promise<{ ok, layouts }>, post(body): Promise<{ ok, layouts?, error? }> }   (the shared list on the server, /api/desk-workspaces)
//   store  a localStorage-like { getItem, setItem } (this browser's current layout survives a reload; every use is in try/catch)
// workspaceView.js draws whatever this says and calls these methods. Each method that can fail returns { ok:false, error } in words and never throws.
import { STARTERS, starterByName, sanitizeLayout, addTile, removeTile, moveTile, resizeTile, exportLayout, parseImport, uniqueName, cleanName, isPanel } from './workspaceCore.js';

export const LOCAL_KEY = 'deskWorkspace:v1';
const clone = o => JSON.parse(JSON.stringify(o));

export function createWorkspaceState({ api, store = null, known = isPanel } = {}) {
  let cur = { name: STARTERS[0].name, tiles: clone(STARTERS[0].tiles), source: 'starter' };
  let saved = [], dirty = false, note = '';
  const subs = new Set();
  const emit = () => { for (const f of subs) { try { f(); } catch { /* a view that threw must not stop the others */ } } };
  const safe = (fn, d = null) => { try { return fn(); } catch { return d; } };
  const persist = () => safe(() => store?.setItem(LOCAL_KEY, JSON.stringify({ name: cur.name, source: cur.source, tiles: cur.tiles, dirty })));
  const change = (tiles, msg = '') => { cur = { ...cur, tiles }; dirty = true; note = msg; persist(); emit(); };
  const savedNames = () => saved.map(l => l.name);
  const takenNames = () => [...STARTERS.map(s => s.name), ...savedNames()];
  const setSaved = layouts => { saved = Array.isArray(layouts) ? layouts : saved; };

  const s = {
    get current() { return cur; }, get dirty() { return dirty; }, get saved() { return saved; }, get note() { return note; },
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
    names() { return savedNames(); },
    allNames() { return takenNames(); },

    /** Start: this browser's last layout first, then the shared list. Offline or signed out: the starters still work. */
    async init() {
      const local = safe(() => JSON.parse(store?.getItem(LOCAL_KEY) ?? 'null'));
      if (local && Array.isArray(local.tiles)) {
        const { layout, dropped } = sanitizeLayout(local, known);
        if (layout.tiles.length) { cur = { name: layout.name, tiles: layout.tiles, source: ['starter', 'saved', 'new'].includes(local.source) ? local.source : 'new' }; dirty = !!local.dirty; if (dropped.length) note = `${dropped.length} panel${dropped.length === 1 ? '' : 's'} this terminal no longer has ${dropped.length === 1 ? 'was' : 'were'} left out.`; }
      }
      await s.refresh();
      emit();
      return s;
    },
    async refresh() {
      try { const r = await api.list(); if (r?.ok) setSaved(r.layouts); else note = r?.error === 'sign in first' ? 'Saved layouts need a signed-in session (this one has none); the starters and this browser still work.' : r?.error ? `Saved layouts: ${r.error}` : note; } catch { note = 'Saved layouts could not be reached; the starters and this browser still work.'; }
      emit();
    },

    /** Open a starter or a saved layout by name (any case; a prefix is enough when it is unique). */
    load(name) {
      const w = String(name ?? '').trim().toLowerCase();
      const all = [...STARTERS.map(x => ({ ...x, source: 'starter' })), ...saved.map(x => ({ ...x, source: 'saved' }))];
      const hit = all.find(x => x.name.toLowerCase() === w) ?? (() => { const m = all.filter(x => x.name.toLowerCase().startsWith(w)); return m.length === 1 ? m[0] : null; })();
      if (!hit) return { ok: false, error: `No workspace called "${name}". Try ${all.map(x => x.name).join(', ')}.` };
      const { layout, dropped } = sanitizeLayout(hit, known);
      cur = { name: hit.name, tiles: layout.tiles, source: hit.source }; dirty = false;
      note = dropped.length ? `${dropped.length} panel${dropped.length === 1 ? '' : 's'} no longer exist${dropped.length === 1 ? 's' : ''} and ${dropped.length === 1 ? 'was' : 'were'} left out.` : '';
      persist(); emit();
      return { ok: true, dropped };
    },

    /** Save under the open name (a saved layout), or under `name`. A starter or an unnamed layout needs its own name: { ok:false, needName:true }. */
    async save(name = null) {
      const target = cleanName(name ?? (cur.source === 'saved' ? cur.name : ''));
      if (!target) return { ok: false, needName: true, error: 'Give it a name of your own to save it.' };
      if (starterByName(target)) return { ok: false, needName: true, error: `"${target}" is a built-in starter: pick your own name.` };
      if (!cur.tiles.length) return { ok: false, error: 'Add at least one panel before saving.' };
      let r;
      try { r = await api.post({ action: 'save', name: target, layout: { tiles: cur.tiles } }); } catch { r = { ok: false, error: 'Could not reach the server.' }; }
      if (!r?.ok) return { ok: false, error: r?.error ?? 'Could not save.' };
      setSaved(r.layouts); cur = { ...cur, name: target, source: 'saved' }; dirty = false; note = `Saved as "${target}" for everyone on the desk.`;
      persist(); emit();
      return { ok: true };
    },
    saveAs(name) { return s.save(name); },

    async rename(newName) {
      if (cur.source !== 'saved') return { ok: false, error: 'Only a saved workspace can be renamed. Save it under a name first.' };
      let r;
      try { r = await api.post({ action: 'rename', name: cur.name, newName }); } catch { r = { ok: false, error: 'Could not reach the server.' }; }
      if (!r?.ok) return { ok: false, error: r?.error ?? 'Could not rename.' };
      setSaved(r.layouts); cur = { ...cur, name: cleanName(newName) }; note = 'Renamed.'; persist(); emit();
      return { ok: true };
    },
    async remove() {
      if (cur.source !== 'saved') return { ok: false, error: 'A built-in starter cannot be deleted.' };
      const was = cur.name; let r;
      try { r = await api.post({ action: 'delete', name: was }); } catch { r = { ok: false, error: 'Could not reach the server.' }; }
      if (!r?.ok) return { ok: false, error: r?.error ?? 'Could not delete.' };
      setSaved(r.layouts); cur = { name: was, tiles: cur.tiles, source: 'new' }; dirty = true; note = `"${was}" deleted from the shared list. The grid you have open is kept until you leave.`;
      persist(); emit();
      return { ok: true };
    },

    add(id) { if (!known(id)) return { ok: false, error: 'That panel is not part of this terminal.' }; const t = addTile(cur.tiles, id, known); if (t === cur.tiles) return { ok: false, error: 'It is already on the grid (or the grid is full).' }; change(t); return { ok: true }; },
    removeTile(id) { change(removeTile(cur.tiles, id)); },
    move(id, x, y) { change(moveTile(cur.tiles, id, x, y)); },
    resize(id, w, h) { change(resizeTile(cur.tiles, id, w, h)); },
    /** Replace the tiles in one go (a finished drag). */
    setTiles(tiles) { const { layout } = sanitizeLayout({ name: cur.name, tiles }, known); change(layout.tiles); },

    exportText() { return exportLayout({ name: cur.name, tiles: cur.tiles }); },
    exportFileName() { return `${cur.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace'}.workspace.json`; },
    /** An exported file's text -> opens it as a new unsaved layout (its name made unique). */
    importText(text) {
      const r = parseImport(text, known);
      if (!r.ok) return { ok: false, error: r.error };
      cur = { name: uniqueName(r.layout.name, takenNames()), tiles: r.layout.tiles, source: 'new' }; dirty = true;
      note = r.dropped.length ? `Opened. ${r.dropped.length} panel${r.dropped.length === 1 ? '' : 's'} in the file ${r.dropped.length === 1 ? 'is' : 'are'} not in this terminal and ${r.dropped.length === 1 ? 'was' : 'were'} left out. Save it to keep it.` : 'Opened. Save it to keep it.';
      persist(); emit();
      return { ok: true, dropped: r.dropped };
    },
  };
  return s;
}
