// js/terminal/layoutView.js: the layout editor (widget.layouteditor, preview). A "Layout" button in the header turns the tab you are on into EDIT mode: panels get a dashed
// outline and can be moved (drag one onto another, or click one then click where it should go, which also works on a phone). "Lock layout" puts it back as a fixed page.
// A panel only moves inside the container it is already in (js/terminal/layoutCore.js), so nothing can be lost. Mine is kept in this browser; the OWNER can also
// "Share with everyone", which saves the tab's order (and any panels hidden for the tab) to /api/desk-layouts so the desk login sees it too. Mine beats Shared beats default.
import { SURFACES } from './tabRegistry.js';
import { KEY, sanitize, cleanLayout, arrange, recordMove, moveTo, effective, hideCss } from './layoutCore.js';

const VALID = SURFACES.filter(s => s.kind === 'panel').map(s => s.id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const on = id => (globalThis.deskSurfaceOn ? globalThis.deskSurfaceOn(id) === true : false);
const isOwner = () => globalThis.deskAccessState?.role !== 'viewer';
const currentTab = () => document.querySelector('#tabs [aria-selected="true"]')?.getAttribute('data-t') ?? null;
const PANELS = '.sfc[data-surface^="panel."]';

function loadMine() { try { return sanitize(localStorage.getItem(KEY), VALID); } catch (e) { return { v: 1, tabs: {} }; } }
function saveMine(st) { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* private window: this visit only */ } }

/** The containers of a tab: each parent element with its panel wrappers, in page order. */
function containers(sec) {
  const m = new Map();
  for (const w of sec.querySelectorAll(PANELS)) { const p = w.parentElement; if (!p) continue; if (!m.has(p)) m.set(p, []); m.get(p).push(w); }
  return [...m.entries()].filter(([, ws]) => ws.length >= 2).map(([parent, ws]) => ({ parent, ws }));
}

export function mountLayout() {
  if (!on('widget.layouteditor')) return false;
  const bar = document.getElementById('hdrsheet');
  if (!bar || document.getElementById('layoutBtn')) return false;
  let mine = loadMine(), shared = {}, editing = false, picked = null, applying = false;
  bar.insertAdjacentHTML('afterbegin', '<button type="button" id="layoutBtn" class="btn" data-surface="widget.layouteditor" aria-pressed="false" title="Rearrange the panels on this tab, then lock it">Layout</button>');
  const btn = document.getElementById('layoutBtn');
  const style = document.createElement('style'); style.id = 'deskLayoutStyle'; document.head.appendChild(style);
  const hud = document.createElement('div'); hud.id = 'layoutHud'; hud.hidden = true; hud.setAttribute('role', 'region'); hud.setAttribute('aria-label', 'Layout editor');
  hud.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:14px;z-index:70;max-width:min(720px,calc(100vw - 24px));background:var(--bg1);border:1px solid var(--gold);border-radius:12px;padding:10px 14px;box-shadow:0 8px 30px rgba(0,0,0,.45);font-size:13px;display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center';
  document.body.appendChild(hud);

  const eff = tab => effective(mine, shared, tab);
  const css = () => { style.textContent = `${hideCss(Object.values(shared).flatMap(l => l?.hidden ?? []).filter(Boolean))}\n${editing ? '.ly-edit .sfc[data-surface^="panel."]>*{outline:2px dashed var(--gold);outline-offset:3px;cursor:grab}\n.ly-edit .sfc.ly-picked>*{outline:3px solid var(--gold);box-shadow:0 0 0 6px rgba(0,0,0,.25)}' : ''}`; };

  /** Put every container of the current tab in the order its layout wants. Idempotent: nothing is touched when the order already matches. */
  function apply() {
    const tab = currentTab(), sec = tab ? document.getElementById(tab) : null; if (!sec) return;
    const L = eff(tab); if (!L.groups.length) return;
    applying = true;
    try {
      for (const { parent, ws } of containers(sec)) {
        const ids = ws.map(w => w.getAttribute('data-surface')), want = arrange(ids, L.groups);
        if (want.join() === ids.join()) continue;
        const byId = new Map(ws.map(w => [w.getAttribute('data-surface'), w])), marker = document.createComment('ly');
        parent.insertBefore(marker, ws[0]);
        for (const id of want) parent.insertBefore(byId.get(id), marker);
        marker.remove();
      }
    } finally { applying = false; }
  }
  let t = null;
  const later = () => { clearTimeout(t); t = setTimeout(() => { apply(); if (editing) mark(); }, 120); };
  new MutationObserver(() => { if (!applying) later(); }).observe(document.body, { childList: true, subtree: true });

  const mark = () => { for (const el of document.querySelectorAll('.sfc[data-surface^="panel."]>*')) el.setAttribute('draggable', editing ? 'true' : 'false'); if (!editing) for (const el of document.querySelectorAll('.ly-picked')) el.classList.remove('ly-picked'); };

  function move(wId, tId, after) {
    const sec = document.getElementById(currentTab() ?? ''); if (!sec) return;
    const c = containers(sec).find(x => x.ws.some(w => w.getAttribute('data-surface') === wId) && x.ws.some(w => w.getAttribute('data-surface') === tId));
    if (!c) return status('A panel can only move within its own block: drop it among its neighbours.');
    const ids = c.ws.map(w => w.getAttribute('data-surface')), next = moveTo(ids, wId, tId, after);
    if (next.join() === ids.join()) return;
    const tab = currentTab(), cur = mine.tabs[tab] ?? { groups: [], hidden: [] };
    mine = { v: 1, tabs: { ...mine.tabs, [tab]: { groups: recordMove(cur.groups, next), hidden: cur.hidden } } };
    saveMine(mine); apply(); status('Moved. Saved in this browser.');
  }

  let msg = '';
  const status = m => { msg = m; render(); };
  function render() {
    const tab = currentTab(), L = tab ? eff(tab) : { source: 'default', groups: [] };
    const src = L.source === 'mine' ? 'your own layout' : L.source === 'shared' ? 'the shared layout' : 'the default layout';
    hud.hidden = !editing;
    if (!editing) { hud.innerHTML = ''; return; }
    hud.innerHTML = `<b style="color:var(--gold)">Editing layout</b><span class="muted">${esc(tab ?? '')} · ${esc(src)}</span>
<span class="muted" style="flex-basis:100%;font-size:12px">Drag a panel onto another, or click one then click the panel it should go before (click in the lower half to go after). Panels move only among their neighbours.</span>
<button type="button" class="btn" data-ly="lock">Lock layout</button>
<button type="button" class="btn" data-ly="reset" ${mine.tabs[tab] ? '' : 'disabled'} title="Drop your own order for this tab">Reset mine</button>
${isOwner() ? `<button type="button" class="btn" data-ly="share" ${eff(tab).groups.length || eff(tab).hidden.length ? '' : 'disabled'} title="Save this tab's order for everyone (owner only)">Share with everyone</button><button type="button" class="btn" data-ly="unshare" ${shared[tab] ? '' : 'disabled'}>Clear shared</button>` : ''}
<span class="muted" role="status" style="flex-basis:100%;font-size:12px">${esc(msg)}</span>`;
  }

  const setEditing = on_ => { editing = on_; picked = null; document.body.classList.toggle('ly-edit', editing); btn.setAttribute('aria-pressed', String(editing)); btn.textContent = editing ? 'Lock layout' : 'Layout'; css(); mark(); msg = ''; render(); };
  btn.onclick = () => setEditing(!editing);
  document.getElementById('tabs')?.addEventListener('click', () => { picked = null; setTimeout(() => { apply(); mark(); render(); }, 200); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && editing) setEditing(false); });

  hud.addEventListener('click', async e => {
    const a = e.target.closest('[data-ly]')?.getAttribute('data-ly'); if (!a) return;
    const tab = currentTab();
    if (a === 'lock') return setEditing(false);
    if (a === 'reset') { const { [tab]: _gone, ...rest } = mine.tabs; mine = { v: 1, tabs: rest }; saveMine(mine); location.reload(); return; }
    if ((a === 'share' || a === 'unshare') && isOwner()) {
      const body = a === 'share' ? { tab, layout: { groups: eff(tab).groups, hidden: eff(tab).hidden } } : { tab, clear: true };
      try {
        const r = await fetch('/api/desk-layouts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        shared = sanitizeShared(j.tabs); css(); status(a === 'share' ? 'Shared: everyone with the layout feature now sees this order.' : 'Shared layout cleared for this tab.');
      } catch (err) { status(`Not saved: ${err.message}`); }
    }
  });

  // drag and drop
  let dragId = null;
  const wrapOf = el => el?.closest?.('.sfc[data-surface^="panel."]') ?? null;
  document.addEventListener('dragstart', e => { if (!editing) return; const w = wrapOf(e.target); if (!w) return; dragId = w.getAttribute('data-surface'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch (x) { /* */ } });
  document.addEventListener('dragover', e => { if (editing && dragId && wrapOf(e.target)) e.preventDefault(); });
  document.addEventListener('drop', e => {
    if (!editing || !dragId) return;
    const w = wrapOf(e.target); if (!w) return; e.preventDefault();
    const r = w.firstElementChild?.getBoundingClientRect?.(), after = r ? e.clientY > r.top + r.height / 2 : false;
    const id = dragId; dragId = null; move(id, w.getAttribute('data-surface'), after);
  });
  document.addEventListener('dragend', () => { dragId = null; });
  // click to pick up, click to put down (touch, and anyone who prefers it)
  document.addEventListener('click', e => {
    if (!editing || e.target.closest('#layoutHud, #layoutBtn, #tabs')) return;
    const w = wrapOf(e.target); if (!w) return;
    e.preventDefault(); e.stopPropagation();
    const id = w.getAttribute('data-surface');
    if (!picked) { picked = id; w.classList.add('ly-picked'); return status('Picked up. Now click the panel it should go before.'); }
    if (picked === id) { picked = null; w.classList.remove('ly-picked'); return status(''); }
    const r = w.firstElementChild?.getBoundingClientRect?.(), after = r ? e.clientY > r.top + r.height / 2 : false;
    const from = picked; picked = null; document.querySelectorAll('.ly-picked').forEach(x => x.classList.remove('ly-picked')); move(from, id, after);
  }, true);

  const sanitizeShared = raw => { const out = {}; for (const [k, v] of Object.entries(raw ?? {})) { const c = cleanLayout(v, VALID); if (c.groups.length || c.hidden.length) out[k] = c; } return out; };
  css();
  fetch('/api/desk-layouts').then(r => (r.ok ? r.json() : null)).then(j => { if (j?.ok) { shared = sanitizeShared(j.tabs); css(); apply(); } }).catch(() => { /* no shared layouts: the page's own order */ });
  apply();
  return true;
}

if (typeof document !== 'undefined' && !globalThis.__terminalFeelNoAutoStart) {
  const go = () => { try { mountLayout(); } catch (e) { console.warn('layout', e); } };
  if (globalThis.deskAccessState) go(); else addEventListener('deskaccess', go, { once: true });
}
