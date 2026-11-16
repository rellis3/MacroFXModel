// js/terminal/analyticsSplit.js: the Analytics tab in two sections, "Market behaviour" and "The desk's record" (plans/TERMINAL_FLOW_REVIEW.md, item F9).
// Not a preview: it only groups blocks that were already there (every panel.ana.* surface keeps its id, so the Access page switches work as before).
// desk-terminal.html draws the whole tab in one go (analytics() sets #ana's innerHTML); this file adds a pill row on top and hides the blocks of the
// section that is not open. A section shows only if at least one of its blocks is switched on for the session; with one section left there is no pill row.
// The choice is remembered in this browser and shared as #ana/desk. Pure rules: flowCore.js (ANA_GROUPS, pickAnaGroup), tested by flowCore.test.mjs.
import { ANA_GROUPS, SURFACES, anaPillsHtml, pickAnaGroup } from './flowCore.js';

const LS = 'deskAnalytics:v1';

export function mountAnalyticsSplit({ doc = document, win = window } = {}) {
  const sec = doc.getElementById('ana');
  if (!sec || sec.dataset.splitMounted) return null;
  sec.dataset.splitMounted = '1';
  const isOn = id => win.deskSurfaceOn?.(id) ?? true;
  const store = () => { try { return win.localStorage ?? null; } catch { return null; } };
  let current = null, applying = false;

  function apply() {
    if (applying) return; applying = true;
    try {
      if (!sec.querySelector('.sfc[data-surface^="panel.ana."]')) return;   // still "Drawing…"
      let saved = ''; try { saved = store()?.getItem(LS) ?? ''; } catch { /* private window */ }
      const active = current ?? pickAnaGroup({ hash: win.location?.hash, saved, isOn });
      current = active;
      let pills = sec.querySelector('.fl-anapills') ? 'kept' : '';
      if (pills) { for (const b of sec.querySelectorAll('.fl-anapills [data-ana]')) { const sel = b.dataset.ana === active; b.setAttribute('aria-selected', String(sel)); b.setAttribute('aria-pressed', String(sel)); } }   // already drawn: only the selection changes (so our own change does not wake the observer into a loop)
      else { pills = anaPillsHtml(active, isOn); if (pills) sec.insertAdjacentHTML('afterbegin', pills); }
      const grp = ANA_GROUPS.find(g => g.id === active);
      const split = !!pills && !!grp;
      for (const b of sec.querySelectorAll('.sfc[data-surface^="panel.ana."]')) { b.hidden = split ? !grp.blocks.includes(b.dataset.surface) : false; b.setAttribute('data-fl-seen', '1'); }
      for (const g of sec.querySelectorAll('.grid')) { const kids = [...g.children].filter(c => c.matches?.('.sfc')); g.hidden = kids.length > 0 && kids.every(k => k.hidden); }
    } finally { applying = false; }
  }
  function choose(id) {
    current = id;
    try { store()?.setItem(LS, id); } catch { /* private window */ }
    try { win.history.replaceState(null, '', `#ana/${ANA_GROUPS.find(g => g.id === id)?.alias ?? id}`); } catch { /* no history */ }
    apply();
  }
  sec.addEventListener('click', e => { const b = e.target.closest?.('[data-ana]'); if (b) choose(b.dataset.ana); });
  const mo = new win.MutationObserver(() => { if (!sec.querySelector('.fl-anapills') || sec.querySelector('.sfc[data-surface^="panel.ana."]:not([data-fl-seen])')) win.setTimeout(apply, 0); });
  mo.observe(sec, { childList: true });
  win.addEventListener('hashchange', () => { const h = pickAnaGroup({ hash: win.location.hash, saved: '', isOn }); if (/^#ana\//.test(win.location.hash) && h) choose(h); });
  win.deskAnalyticsSplit = { show: choose, groups: () => ANA_GROUPS.map(g => g.id), surface: SURFACES.anaPills };
  apply();
  return { destroy() { mo.disconnect(); delete sec.dataset.splitMounted; sec.querySelector('.fl-anapills')?.remove(); } };
}

if (typeof document !== 'undefined' && !globalThis.__analyticsSplitNoAutoStart) {
  const start = () => mountAnalyticsSplit();
  if (globalThis.deskAccessState) start(); else addEventListener('deskaccess', start, { once: true });
}
