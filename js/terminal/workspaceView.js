// js/terminal/workspaceView.js: the DOM half of the Workspace tab (the layout rules are workspaceCore.js, the actions and memory workspaceState.js).
//
// A tile shows one of the terminal's own panels. While the Workspace tab is open each tile ADOPTS the live panel (the real element, so its charts and
// buttons keep working) from the tab it normally lives on, and when you leave the tab every panel goes back to where it was. If a panel's own tab has
// not drawn it yet (Macro boards are built when their section is first opened) the tile says so and offers "Load it", which visits that tab once.
// When a tab redraws a panel (a refresh), the tile picks up the new copy. Drag a tile by its title bar, resize by its corner; arrow keys move a focused
// title bar, Shift + arrows resize it. On a phone the tiles stack and cannot be dragged.
//
// A PREVIEW feature (registry id tab.workspace): js/terminal/terminalFeel.js only loads this file when the session may see that surface.
import { PANELS, COLS, snap, homeSection, moveTile, resizeTile } from './workspaceCore.js';
import { createWorkspaceState } from './workspaceState.js';
import { createAdopter } from './panelAdopter.js';

export const ROW = 44;               // px per grid row
export const NARROW = 720;           // below this width the tiles stack
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const label = id => (PANELS.get(id)?.label ?? id).replace(/^Macro:\s*/, '');
const on = (win, id) => win.deskSurfaceOn?.(id) !== false;

/** The real network half: the shared list on the server. */
export function httpApi(win = window) {
  const call = async (method, body) => {
    const r = await win.fetch('/api/desk-workspaces', { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    let j = null; try { j = await r.json(); } catch { /* not JSON */ }
    return j ?? { ok: false, error: `The server answered ${r.status}.` };
  };
  return { list: () => call('GET'), post: b => call('POST', b) };
}
const localStore = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function mountWorkspace({ doc = document, win = window, api = httpApi(win), store = localStore(), ask = (m, d) => win.prompt(m, d), sure = m => win.confirm(m) } = {}) {
  const sec = doc.getElementById('workspace');
  if (!sec || sec.dataset.mounted) return null;
  sec.dataset.mounted = '1';
  const state = createWorkspaceState({ api, store, known: id => PANELS.has(id) && on(win, id) });
  sec.innerHTML = `<div class="ws-bar" role="toolbar" aria-label="Workspace">
<label class="ws-l" for="ws-pick">Workspace</label><select id="ws-pick"></select>
<button type="button" class="btn" data-ws="save">Save</button><button type="button" class="btn" data-ws="saveas">Save as…</button><button type="button" class="btn" data-ws="rename">Rename</button><button type="button" class="btn" data-ws="delete">Delete</button>
<span class="ws-sep"></span>
<label class="ws-l" for="ws-add">Add a panel</label><select id="ws-add"></select>
<span class="ws-sep"></span>
<button type="button" class="btn" data-ws="export">Export file</button><button type="button" class="btn" data-ws="import">Import file</button><input id="ws-file" type="file" accept=".json,application/json" hidden>
</div><div id="ws-note" class="ws-note" role="status" aria-live="polite"></div><div id="ws-grid" class="ws-grid"></div>`;
  const $ = s => sec.querySelector(s);
  const grid = $('#ws-grid'), pick = $('#ws-pick'), add = $('#ws-add'), noteEl = $('#ws-note');
  const adopter = createAdopter({ doc, homeOf: homeSection });
  const tileEls = new Map();    // id -> tile element
  let open = false, obs = null, flash = '', preview = null;
  const narrow = () => (win.innerWidth ?? 1200) < NARROW;
  const tiles = () => preview ?? state.current.tiles;

  // ── drawing ──
  function drawBar() {
    const cur = state.current;
    pick.innerHTML = `<optgroup label="Built in">${state.allNames().slice(0, 3).map(n => `<option value="${esc(n)}"${n === cur.name && cur.source === 'starter' ? ' selected' : ''}>${esc(n)}</option>`).join('')}</optgroup>`
      + (state.saved.length ? `<optgroup label="Saved by the desk">${state.saved.map(l => `<option value="${esc(l.name)}"${l.name === cur.name && cur.source === 'saved' ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</optgroup>` : '')
      + (cur.source === 'new' ? `<optgroup label="Open now"><option value="" selected>${esc(cur.name)} (not saved)</option></optgroup>` : '');
    const used = new Set(state.current.tiles.map(t => t.id)), groups = new Map();
    for (const [id, row] of PANELS) if (!used.has(id) && on(win, id)) { if (!groups.has(row.group)) groups.set(row.group, []); groups.get(row.group).push([id, row]); }
    add.innerHTML = `<option value="">Choose…</option>${[...groups].map(([g, rows]) => `<optgroup label="${esc(g)}">${rows.map(([id, row]) => `<option value="${esc(id)}">${esc(label(id))}</option>`).join('')}</optgroup>`).join('')}`;
    sec.querySelector('[data-ws="delete"]').disabled = cur.source !== 'saved';
    sec.querySelector('[data-ws="rename"]').disabled = cur.source !== 'saved';
    noteEl.textContent = flash || state.note || (state.dirty ? 'Unsaved changes. Save keeps them for the whole desk.' : '');
  }
  function place(el, t) {
    if (narrow()) { el.style.cssText = `min-height:${t.h * ROW}px`; return; }
    el.style.cssText = `left:${(t.x / COLS) * 100}%;width:${(t.w / COLS) * 100}%;top:${t.y * ROW}px;height:${t.h * ROW}px`;
  }
  function placeAll() {
    const ts = tiles();
    if (narrow()) { grid.style.height = ''; grid.classList.add('stack'); } else { grid.classList.remove('stack'); grid.style.height = `${Math.max(6, ts.reduce((m, t) => Math.max(m, t.y + t.h), 0)) * ROW}px`; }
    const order = narrow() ? [...ts].sort((a, b) => a.y - b.y || a.x - b.x) : ts;
    for (const t of order) { const el = tileEls.get(t.id); if (el) { place(el, t); if (narrow()) grid.appendChild(el); } }
  }
  function body(id) { return tileEls.get(id)?.querySelector('.ws-body'); }
  function missingHtml(id) {
    const hidden = !on(win, id);
    return `<div class="ws-miss">${hidden ? 'This panel is not shown on this login.' : `<b>${esc(label(id))}</b> has not been drawn yet.`}${hidden ? '' : `<button type="button" class="btn" data-load="${esc(id)}">Load it</button><span class="muted">visits ${esc(homeSection(id) ?? 'its')} tab once and comes back</span>`}</div>`;
  }
  function drawTiles() {
    const ts = state.current.tiles, want = new Set(ts.map(t => t.id));
    for (const [id, el] of tileEls) if (!want.has(id)) { release(id); el.remove(); tileEls.delete(id); }
    for (const t of ts) {
      if (tileEls.has(t.id)) continue;
      const el = doc.createElement('div');
      el.className = 'ws-tile'; el.dataset.id = t.id;
      el.innerHTML = `<div class="ws-head" tabindex="0" role="group" aria-label="${esc(label(t.id))}: arrow keys move, shift and arrows resize"><b>${esc(label(t.id))}</b><button type="button" class="ws-x" data-rm="${esc(t.id)}" aria-label="Remove ${esc(label(t.id))}">×</button></div><div class="ws-body"></div><i class="ws-rs" aria-hidden="true"></i>`;
      grid.appendChild(el); tileEls.set(t.id, el);
      if (open) adopt(t.id);
    }
    placeAll();
  }
  function render() { drawBar(); drawTiles(); }

  // ── adopting the live panels ──
  function adopt(id) {
    const b = body(id); if (!b) return;
    if (adopter.adopt(id, b) === 'missing' && !adopter.has(id)) b.innerHTML = missingHtml(id);
  }
  const release = id => adopter.release(id);
  let timer = null;
  const refreshAdoption = () => { clearTimeout(timer); timer = win.setTimeout(() => { if (open) for (const t of state.current.tiles) if (tileEls.has(t.id) && (!adopter.has(t.id) || adopter.stale(t.id))) adopt(t.id); }, 150); };
  function enter() {
    if (open) return; open = true; state.refresh();
    for (const t of state.current.tiles) adopt(t.id);
    if (win.MutationObserver) {
      obs = new win.MutationObserver(refreshAdoption);
      for (const h of new Set(state.current.tiles.map(t => homeSection(t.id)).filter(Boolean))) { const e = doc.getElementById(h); if (e) obs.observe(e, { childList: true, subtree: true }); }
    }
    render();
  }
  function leave() {
    if (!open) return; open = false;
    obs?.disconnect(); obs = null;
    adopter.releaseAll();
    for (const [, el] of tileEls) { const b = el.querySelector('.ws-body'); if (b) b.innerHTML = ''; }
  }
  function loadIt(id) {
    const home = homeSection(id), back = doc.querySelector('#tabs [data-t="workspace"]');
    if (id.startsWith('panel.macro.') && win.openMacroBoard) win.openMacroBoard(id); else doc.querySelector(`#tabs [data-t="${home}"]`)?.click();
    win.setTimeout(() => back?.click(), 1400);
  }

  // ── dragging ──
  function startDrag(e, id, mode) {
    if (narrow() || e.button > 0) return;
    e.preventDefault();
    const base = state.current.tiles, t0 = base.find(t => t.id === id), colW = grid.clientWidth / COLS, x0 = e.clientX, y0 = e.clientY;
    tileEls.get(id)?.classList.add('drag');
    const move = ev => {
      const dc = snap(ev.clientX - x0, colW), dr = snap(ev.clientY - y0, ROW);
      preview = mode === 'move' ? moveTile(base, id, t0.x + dc, t0.y + dr) : resizeTile(base, id, t0.w + dc, t0.h + dr);
      placeAll();
    };
    const up = () => {
      doc.removeEventListener('pointermove', move); doc.removeEventListener('pointerup', up); doc.removeEventListener('pointercancel', up);
      tileEls.get(id)?.classList.remove('drag');
      const done = preview; preview = null;
      if (done) state.setTiles(done); else placeAll();
    };
    doc.addEventListener('pointermove', move); doc.addEventListener('pointerup', up); doc.addEventListener('pointercancel', up);
  }
  grid.addEventListener('pointerdown', e => {
    const tile = e.target.closest?.('.ws-tile'); if (!tile || e.target.closest('.ws-x, button, a, input, select')) return;
    if (e.target.closest('.ws-rs')) startDrag(e, tile.dataset.id, 'resize');
    else if (e.target.closest('.ws-head')) startDrag(e, tile.dataset.id, 'move');
  });
  grid.addEventListener('keydown', e => {
    const head = e.target.closest?.('.ws-head'); if (!head || narrow()) return;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!d) return;
    e.preventDefault();
    const id = head.parentNode.dataset.id, t = state.current.tiles.find(x => x.id === id); if (!t) return;
    if (e.shiftKey) state.resize(id, t.w + d[0], t.h + d[1]); else state.move(id, t.x + d[0], t.y + d[1]);
    tileEls.get(id)?.querySelector('.ws-head')?.focus();
  });
  grid.addEventListener('click', e => {
    const rm = e.target.closest?.('[data-rm]'); if (rm) { state.removeTile(rm.dataset.rm); return; }
    const ld = e.target.closest?.('[data-load]'); if (ld) loadIt(ld.dataset.load);
  });

  // ── the toolbar ──
  const say = (r, ok = '') => { flash = r.ok ? ok : (r.error ?? ''); drawBar(); if (flash) win.setTimeout(() => { flash = ''; drawBar(); }, 6000); };
  pick.addEventListener('change', () => { if (!pick.value) return; if (state.dirty && !sure('Open another workspace and drop the changes you have not saved?')) { drawBar(); return; } flash = ''; const r = state.load(pick.value); if (!r.ok) say(r); });
  add.addEventListener('change', () => { if (!add.value) return; const r = state.add(add.value); if (!r.ok) say(r); });
  sec.querySelector('.ws-bar').addEventListener('click', async e => {
    const b = e.target.closest?.('[data-ws]'); if (!b) return;
    const act = b.dataset.ws;
    if (act === 'save') { let r = await state.save(); if (r.needName) { const n = ask('Name this workspace (the whole desk sees it):', state.current.source === 'starter' ? `${state.current.name} copy` : state.current.name); if (!n) return; r = await state.save(n); } say(r, 'Saved for everyone on the desk.'); }
    else if (act === 'saveas') { const n = ask('Save as (the whole desk sees it):', `${state.current.name} copy`); if (!n) return; say(await state.save(n), 'Saved for everyone on the desk.'); }
    else if (act === 'rename') { const n = ask('Rename to:', state.current.name); if (!n) return; say(await state.rename(n), 'Renamed.'); }
    else if (act === 'delete') { if (!sure(`Delete "${state.current.name}" for everyone on the desk? This cannot be undone.`)) return; say(await state.remove(), 'Deleted.'); }
    else if (act === 'export') {
      try { const url = win.URL.createObjectURL(new win.Blob([state.exportText()], { type: 'application/json' })), a = doc.createElement('a'); a.href = url; a.download = state.exportFileName(); doc.body.appendChild(a); a.click(); a.remove(); win.setTimeout(() => win.URL.revokeObjectURL(url), 2000); }
      catch { say({ ok: false, error: 'This browser would not make the file.' }); }
    } else if (act === 'import') $('#ws-file').click();
  });
  $('#ws-file').addEventListener('change', async e => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    if (f.size > 200_000) { say({ ok: false, error: 'That file is too big to be a workspace.' }); return; }
    say(state.importText(await f.text()), 'Opened. Save it to keep it.');
  });

  state.subscribe(() => { if (open) { if (preview == null) render(); } else drawBar(); });
  // tab buttons: entering Workspace adopts the panels, leaving puts every one back
  const tabBtns = [...doc.querySelectorAll('#tabs [data-t]')], onTab = e => { const b = e.currentTarget ?? e.target; if (b.dataset.t === 'workspace') win.setTimeout(enter, 0); else leave(); };
  for (const b of tabBtns) b.addEventListener('click', onTab);
  const onResize = () => { if (open) placeAll(); };
  win.addEventListener?.('resize', onResize);

  win.deskWorkspace = { names: () => state.names(), load: n => state.load(n), saveAs: async n => say(await state.save(n), `Saved as "${n}".`), state };
  state.init().then(() => { render(); if (doc.querySelector('#tabs [data-t="workspace"]')?.getAttribute('aria-selected') === 'true') enter(); });
  return { state, enter, leave, destroy() { leave(); for (const b of tabBtns) b.removeEventListener('click', onTab); win.removeEventListener?.('resize', onResize); delete win.deskWorkspace; sec.innerHTML = ''; delete sec.dataset.mounted; } };
}
