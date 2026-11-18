// js/terminal/tabGroups.js: the tidy navigation. The terminal had 23 tab buttons. This draws NINE nav buttons instead, and a row of "pills" under the one you are in for the tabs
// that were merged into it. Nothing is rebuilt: every original tab, section, renderer, #hash link and saved choice is untouched. The original #tabs strip stays in the page (hidden) and
// this bar drives it by clicking its buttons, so every other module that finds a tab by data-t keeps working. A tab switched off for a login (access rules) drops out of its group;
// a group with nothing left disappears. The pure grouping lives in tabGroupsCore.js.
import { GROUPS, groupOf, visibleGroups, pillsFor } from './tabGroupsCore.js';

const LS = 'deskTabGroupLast:v1';
const lsGet = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { return {}; } };
const lsPut = o => { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) { /* private window */ } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function mountTabGroups(doc = document) {
  const orig = doc.getElementById('tabs');
  if (!orig || doc.getElementById('tabsMerged')) return false;
  const btnOf = t => orig.querySelector(`[data-t="${t}"]`);
  const offFor = t => { const b = btnOf(t); return !b || doc.defaultView.getComputedStyle(b).display === 'none'; };
  const label = t => (btnOf(t)?.textContent ?? t).trim();
  const title = t => btnOf(t)?.getAttribute('title') ?? '';

  const style = doc.createElement('style'); style.id = 'tabGroupsStyle';
  style.textContent = '#tabs{display:none!important}.tabpills{margin:-8px 0 14px;background:transparent;border:0;padding:0;gap:6px}.tabpills button{border:1px solid var(--line);padding:5px 11px;font-size:10.5px}.tabpills[hidden]{display:none!important}';
  doc.head.appendChild(style);
  const nav = doc.createElement('nav'); nav.className = 'tabs'; nav.id = 'tabsMerged'; nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-label', 'Terminal sections');
  const pills = doc.createElement('div'); pills.className = 'tabs tabpills'; pills.id = 'tabPills'; pills.setAttribute('role', 'tablist'); pills.setAttribute('aria-label', 'Pages in this section'); pills.hidden = true;
  orig.parentNode.insertBefore(nav, orig); orig.parentNode.insertBefore(pills, orig);
  const link = orig.querySelector('a.tablink');

  const current = () => orig.querySelector('[aria-selected="true"]')?.getAttribute('data-t') ?? null;
  const go = t => { const b = btnOf(t); if (b && b.getAttribute('aria-selected') !== 'true') b.click(); };

  function refresh() {
    const cur = current(), gid = groupOf(cur), off = new Set(GROUPS.flatMap(g => g.tabs).filter(offFor)), vis = visibleGroups(off);
    nav.innerHTML = vis.map(g => `<button type="button" role="tab" data-g="${esc(g.id)}" aria-selected="${g.id === gid}"${g.tabs.length === 1 && title(g.tabs[0]) ? ` title="${esc(title(g.tabs[0]))}"` : ''}>${esc(g.label)}</button>`).join('');
    if (link && !nav.querySelector('a.tablink')) nav.appendChild(link.cloneNode(true));
    const ps = pillsFor(gid, off);
    pills.hidden = ps.length < 2;
    pills.innerHTML = ps.length < 2 ? '' : ps.map(t => `<button type="button" role="tab" data-p="${esc(t)}" aria-selected="${t === cur}"${title(t) ? ` title="${esc(title(t))}"` : ''}>${esc(label(t))}</button>`).join('');
  }
  nav.addEventListener('click', e => {
    const b = e.target.closest('button[data-g]'); if (!b) return;
    const g = GROUPS.find(x => x.id === b.dataset.g), off = new Set(GROUPS.flatMap(x => x.tabs).filter(offFor)), ok = pillsFor(g.id, off);
    const last = lsGet()[g.id], t = ok.includes(last) ? last : ok[0]; if (t) go(t);
  });
  pills.addEventListener('click', e => { const b = e.target.closest('button[data-p]'); if (b) go(b.dataset.p); });
  new MutationObserver(() => { const g = groupOf(current()); if (g) { const m = lsGet(); if (m[g] !== current()) { m[g] = current(); lsPut(m); } } refresh(); })
    .observe(orig, { attributes: true, attributeFilter: ['aria-selected'], subtree: true });
  refresh();
  for (const ms of [400, 1500, 4000]) setTimeout(refresh, ms);       // the access rules arrive after the page: drop what this login may not see
  doc.defaultView.addEventListener('deskaccess', () => setTimeout(refresh, 50));
  return true;
}

if (typeof document !== 'undefined' && !globalThis.__terminalFeelNoAutoStart) {
  const go = () => { try { mountTabGroups(document); } catch (e) { console.warn('tab groups', e); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true }); else go();
}
