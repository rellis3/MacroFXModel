// js/terminal/previewSwitches.js: the "Preview features" panel at the top of the Info map tab (owner only): one row per preview surface, with
// whether the DESK LOGIN can see it (the owner always can) and a button to flip that. Pure helpers here, the DOM part is mountSwitches().
// The switch is the same one desk-admin.html draws: POST /api/desk-access { [id]: true|false }, which only the main login may call.
import { SURFACES } from './tabRegistry.js';
import { FEATURES, KEY_OF_SURFACE, statusOf, statusLine } from './featureStatus.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The preview surfaces, in registry order. */
export const previewRows = () => SURFACES.filter(s => s.hidden === 'preview');
/** Is this preview on for the desk login, given the saved switches ({ [id]: boolean })? Unsaved = the registry default (off). */
export const deskSees = (row, saved) => (saved && typeof saved[row.id] === 'boolean' ? saved[row.id] : row.defaultVisible);

/** The 'Is it running here?' lines for one row: its status on THIS page and where to find it (only the features terminalFeel.js starts have them). */
export function rowDetail(row, feel = globalThis.__deskFeel) {
  const key = KEY_OF_SURFACE[row.id]; if (!key) return '';
  const st = statusOf(feel, key), cls = st.state === 'loaded' ? 'up' : st.state === 'failed' ? 'dn' : '';
  return `<div class="muted" style="font-size:12px;margin-top:3px">On this page: <b class="${cls}" data-pv-status="${esc(key)}">${esc(statusLine(feel, key))}</b></div>
<details class="pv-where" style="margin-top:3px"><summary class="muted" style="font-size:12px;cursor:pointer">Where do I see it?</summary><ul style="margin:4px 0 0 18px;padding:0;font-size:12.5px">${FEATURES[key].where.map(w => `<li>${esc(w)}</li>`).join('')}</ul></details>`;
}

export function panelHtml(saved, feel = globalThis.__deskFeel) {
  const rows = previewRows();
  if (!rows.length) return '';
  return `<div class="card" id="pv-card"><div class="ch"><span class="lbl">Preview features</span><span class="r muted">new things you are trying out: you always see them, the desk login only when switched on</span></div>
${rows.map(r => {
    const on = deskSees(r, saved);
    return `<div class="tt-row" style="align-items:center;gap:10px;flex-wrap:wrap;padding:6px 0"><div style="flex:1;min-width:220px"><b>${esc(r.label)}</b><div class="muted" style="font-size:12.5px">${esc(r.note)}</div>${rowDetail(r, feel)}</div>
<span class="chip ${on ? 'up' : ''}">desk login: ${on ? 'on' : 'off'}</span><button type="button" class="btn" data-pv="${esc(r.id)}" data-to="${on ? 'off' : 'on'}">${on ? 'Hide from the desk login' : 'Show to the desk login'}</button></div>`;
  }).join('')}
<p class="tt-note" id="pv-msg">Press <b>/</b> anywhere on the page to open the command line. The full list of switches (every tab, panel and widget) is on the Access page.</p></div>`;
}

/** Draw the panel into host and wire the buttons. fetchJson(url, init) must resolve to parsed JSON (the page's own fetch is fine). */
export async function mountSwitches(host, { fetchJson = (u, i) => fetch(u, i).then(r => r.json()) } = {}) {
  if (!host || globalThis.deskIsViewer?.()) return;   // a desk login never sees the owner's switches
  let saved = {};
  try {
    const a = await fetchJson('/api/desk-access', { cache: 'no-store' });
    if (a?.ok && a.role === 'owner') saved = a.saved ?? {}; else return;
  } catch { return; }
  const draw = () => { host.innerHTML = panelHtml(saved); };
  draw();
  globalThis.addEventListener?.('deskfeel', draw);   // the features finish starting after this panel may have drawn: repaint their status
  host.addEventListener('click', async e => {
    const b = e.target.closest?.('[data-pv]'); if (!b) return;
    const id = b.dataset.pv, to = b.dataset.to === 'on';
    b.disabled = true;
    const msg = () => host.querySelector('#pv-msg');
    try {
      const r = await fetchJson('/api/desk-access', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ [id]: to }) });
      if (!r?.ok) throw new Error(r?.error || 'not saved');
      saved = r.saved ?? { ...saved, [id]: to }; draw();
      const m = msg(); if (m) m.textContent = `Saved. The desk login ${to ? 'now sees' : 'no longer sees'} that feature (it picks it up on its next page load).`;
    } catch (err) { draw(); const m = msg(); if (m) m.textContent = `Not saved: ${err.message}`; }
  });
}
