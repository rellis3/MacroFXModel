// js/terminal/myPanelsCore.js: the PURE half of "My panels" (js/terminal/myPanelsView.js): each person can hide and bring back the panels of any tab, kept in this browser.
// Default = everything the access rules show, exactly as it is now. This only ever HIDES panels the person chose to hide, and only through the same one-line CSS rule the
// access switches already use, so content that re-renders stays hidden and nothing is moved or rebuilt. A panel the owner switched off for the login is never listed here.
export const KEY = 'deskMyPanels:v1';
export const MAX_HIDDEN = 200;

/** panel.<segment>.<name>: which tab a segment lives on (the Workspace's homes, plus the tabs that have no Workspace tiles). */
export const TAB_OF_SEG = { ov: 'overview', ccy: 'ccy', asset: 'assets', ana: 'ana', charts: 'charts', changed: 'changed', corr: 'corr', macro: 'macro', pair: 'pair', deep: 'deep', replay: 'replay', cal: 'cal', pos: 'pos', news: 'news' };
export const tabOf = id => TAB_OF_SEG[String(id).split('.')[1]] ?? null;

/** Saved state from storage text (or an object): only registered panel ids, each once, capped. Bad input gives nothing hidden, never an error. */
export function sanitize(raw, validIds) {
  let o = raw; if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch (e) { o = null; } }
  const ok = new Set(validIds), seen = new Set(), hidden = [];
  for (const id of Array.isArray(o?.hidden) ? o.hidden : []) if (typeof id === 'string' && ok.has(id) && !seen.has(id) && hidden.length < MAX_HIDDEN) { seen.add(id); hidden.push(id); }
  return { v: 1, hidden };
}

/** The one stylesheet that hides them (ids are registry ids: letters, digits, dots, hyphens only). */
export const cssFor = hidden => (hidden ?? []).filter(id => /^[\w.-]+$/.test(id)).map(id => `[data-surface="${id}"]{display:none!important}`).join('\n');

export const toggled = (hidden, id, show) => { const s = new Set(hidden ?? []); if (show) s.delete(id); else s.add(id); return [...s]; };

/** The rows of the list for a tab: the panels PRESENT on that tab now (ids found in the page), registered, in page order, once each, labelled without the tab prefix. */
export function rowsFor(tab, presentIds, surfaces, hidden = []) {
  const reg = new Map((surfaces ?? []).filter(s => s.kind === 'panel').map(s => [s.id, s])), h = new Set(hidden), seen = new Set(), out = [];
  for (const id of presentIds ?? []) {
    const s = reg.get(id); if (!s || seen.has(id) || tabOf(id) !== tab) continue;
    seen.add(id);
    out.push({ id, label: String(s.label).replace(/^[A-Za-z &]+:\s*/, ''), note: s.note ?? '', shown: !h.has(id) });
  }
  return out;
}
