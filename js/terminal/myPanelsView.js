// js/terminal/myPanelsView.js: "My panels" (widget.mypanels, preview). A Panels button in the header opens a list of the panels on the tab you are looking at, each with a
// tick: untick to hide it, tick to bring it back, Show all to reset. Kept in this browser (localStorage), applied with the one-line CSS rule the access switches use, so
// nothing is moved or rebuilt and a panel that re-renders stays hidden. Default is everything the access rules show. Rules are in myPanelsCore.js.
import { SURFACES } from './tabRegistry.js';
import { KEY, sanitize, cssFor, toggled, rowsFor } from './myPanelsCore.js';

const VALID = SURFACES.filter(s => s.kind === 'panel').map(s => s.id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function load() { try { return sanitize(localStorage.getItem(KEY), VALID); } catch (e) { return { v: 1, hidden: [] }; } }
function save(st) { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* private window: applies for this visit only */ } }
function apply(st) {
  let el = document.getElementById('deskMyPanelsStyle');
  if (!el) { el = document.createElement('style'); el.id = 'deskMyPanelsStyle'; document.head.appendChild(el); }
  el.textContent = cssFor(st.hidden);
}
const currentTab = () => document.querySelector('#tabs [aria-selected="true"]')?.getAttribute('data-t') ?? null;
const on = id => (globalThis.deskSurfaceOn ? globalThis.deskSurfaceOn(id) === true : false);

export function mountMyPanels() {
  if (!on('widget.mypanels')) return false;
  const bar = document.getElementById('hdrsheet');
  if (!bar || document.getElementById('myPanelsBtn')) return false;
  let st = load(); apply(st);
  bar.insertAdjacentHTML('afterbegin', '<button type="button" id="myPanelsBtn" class="btn" data-surface="widget.mypanels" aria-haspopup="dialog" title="Hide or bring back the panels on this tab (kept in this browser)">Panels</button>');
  const btn = document.getElementById('myPanelsBtn');
  const pop = document.createElement('div');
  pop.id = 'myPanelsPop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Panels on this tab'); pop.hidden = true;
  pop.style.cssText = 'position:fixed;top:54px;right:16px;z-index:60;width:min(380px,calc(100vw - 32px));max-height:70vh;overflow:auto;background:var(--bg1);border:1px solid var(--line2);border-radius:10px;padding:12px 14px;box-shadow:0 8px 30px rgba(0,0,0,.4)';
  document.body.appendChild(pop);

  function render() {
    const tab = currentTab(), sec = tab ? document.getElementById(tab) : null;
    const present = sec ? [...sec.querySelectorAll('[data-surface^="panel."]')].map(e => e.getAttribute('data-surface')) : [];
    const rows = rowsFor(tab, present, SURFACES, st.hidden).filter(r => on(r.id));
    const nHid = rows.filter(r => !r.shown).length;
    pop.innerHTML = `<div style="display:flex;align-items:baseline;gap:8px"><b>Panels on this tab</b><span class="muted" style="font-size:12px">${rows.length} here${nHid ? ` · ${nHid} hidden` : ''}</span><span style="flex:1"></span><button type="button" class="btn" data-mp-close aria-label="Close">×</button></div>
<p class="muted" style="font-size:12px;margin:6px 0 8px">Untick a panel to hide it, tick to bring it back. Kept in this browser. Some sub-sections only list their panels once opened.</p>
${rows.length ? rows.map(r => `<label style="display:flex;gap:8px;align-items:flex-start;padding:4px 0;cursor:pointer" title="${esc(r.note)}"><input type="checkbox" data-mp-id="${esc(r.id)}" ${r.shown ? 'checked' : ''} style="margin-top:3px"><span>${esc(r.label)}</span></label>`).join('') : '<p class="muted">Nothing on this tab can be hidden.</p>'}
<div style="margin-top:10px;display:flex;gap:8px"><button type="button" class="btn" data-mp-reset ${st.hidden.length ? '' : 'disabled'}>Show all${st.hidden.length ? ` (${st.hidden.length} hidden)` : ''}</button></div>`;
  }
  const open = () => { render(); pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); };
  const close = () => { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.onclick = () => (pop.hidden ? open() : close());
  pop.addEventListener('change', e => { const id = e.target?.getAttribute?.('data-mp-id'); if (!id) return; st = { v: 1, hidden: toggled(st.hidden, id, e.target.checked) }; save(st); apply(st); render(); });
  pop.addEventListener('click', e => { if (e.target.closest('[data-mp-close]')) close(); else if (e.target.closest('[data-mp-reset]')) { st = { v: 1, hidden: [] }; save(st); apply(st); render(); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) close(); });
  document.getElementById('tabs')?.addEventListener('click', () => { if (!pop.hidden) setTimeout(render, 150); });   // the list follows the tab you are on
  return true;
}

// start once the access rules are known (the preview switch is the registry's answer), the way the other previews do
if (typeof document !== 'undefined' && !globalThis.__terminalFeelNoAutoStart) {
  const go = () => { try { mountMyPanels(); } catch (e) { console.warn('my panels', e); } };
  if (globalThis.deskAccessState) go(); else addEventListener('deskaccess', go, { once: true });
}
