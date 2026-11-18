// js/terminal/layoutCore.js: the PURE half of the layout editor (js/terminal/layoutView.js, widget.layouteditor). Pure: no DOM, no storage, no clock.
//
// WHAT A LAYOUT IS. Panels on a tab sit in containers (a grid, a column). A layout only ever REORDERS panels inside the container they already live in; it never
// moves a panel to another container, so nothing can be lost or land somewhere that cannot hold it. For a tab it is a list of GROUPS, one per container that was
// reordered: the panel ids in the order wanted. A panel that is not in a group (new, or never moved) stays where the page puts it.
// A layout may also carry `hidden`: panel ids switched off for the tab (the shared layout can hide things for everyone; a person's own hiding is My panels).
//
// TWO SOURCES. Mine (this browser) beats Shared (saved by the owner, seen by everyone), which beats the page's own order.
export const KEY = 'deskLayout:v1';
export const MAX_GROUPS = 40;
export const MAX_IDS = 120;
const ID = /^panel\.[\w.-]+$/;

const cleanIds = (a, ok) => { const seen = new Set(), out = []; for (const id of Array.isArray(a) ? a : []) if (typeof id === 'string' && ID.test(id) && (!ok || ok.has(id)) && !seen.has(id) && out.length < MAX_IDS) { seen.add(id); out.push(id); } return out; };

/** One tab's layout from anything: { groups: [[id...]...], hidden: [id...] }. Unknown ids are dropped when `validIds` is given; groups of fewer than 2 are meaningless and dropped. */
export function cleanLayout(raw, validIds = null) {
  const ok = validIds ? (typeof validIds === 'function' ? { has: validIds } : new Set(validIds)) : null;
  const groups = (Array.isArray(raw?.groups) ? raw.groups : []).map(g => cleanIds(g, ok)).filter(g => g.length >= 2).slice(0, MAX_GROUPS);
  return { groups, hidden: cleanIds(raw?.hidden, ok) };
}

/** All of a person's saved layouts from storage text or an object: { v:1, tabs: { [tab]: layout } }. Bad input gives empty, never an error. */
export function sanitize(raw, validIds = null) {
  let o = raw; if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch (e) { o = null; } }
  const tabs = {};
  for (const [tab, l] of Object.entries(o?.tabs && typeof o.tabs === 'object' ? o.tabs : {})) {
    if (!/^[\w-]{1,24}$/.test(tab)) continue;
    const c = cleanLayout(l, validIds);
    if (c.groups.length || c.hidden.length) tabs[tab] = c;
  }
  return { v: 1, tabs };
}

/** The order of one container's panels (domIds, in page order) under a layout's groups. The group sharing the most panels wins (needs two); panels it ranks fill the slots
 *  the ranked panels occupy, in its order; every other panel keeps its slot. Returns a new array, the same ids. */
export function arrange(domIds, groups) {
  const dom = [...(domIds ?? [])];
  let best = null, bestN = 1;
  for (const g of groups ?? []) { const n = g.filter(id => dom.includes(id)).length; if (n > bestN) { best = g; bestN = n; } }
  if (!best) return dom;
  const rank = new Map(best.map((id, i) => [id, i])), sorted = dom.filter(id => rank.has(id)).sort((a, b) => rank.get(a) - rank.get(b));
  return dom.map(id => (rank.has(id) ? sorted.shift() : id));
}

/** After a move: this container's panels are now in `newDomIds`. Replace any group that overlaps it with the new order. */
export function recordMove(groups, newDomIds) {
  const ids = cleanIds(newDomIds);
  if (ids.length < 2) return groups ?? [];
  const set = new Set(ids);
  return [...(groups ?? []).filter(g => !g.some(id => set.has(id))), ids].slice(-MAX_GROUPS);
}

/** Move `id` one step (delta -1 up/earlier, +1 down/later) within `domIds`. Unchanged at an end. */
export function moveStep(domIds, id, delta) {
  const a = [...(domIds ?? [])], i = a.indexOf(id), j = i + delta;
  if (i < 0 || j < 0 || j >= a.length) return a;
  [a[i], a[j]] = [a[j], a[i]];
  return a;
}

/** Put `id` before (or after) `targetId`. Unchanged when either is missing or they are the same. */
export function moveTo(domIds, id, targetId, after = false) {
  const a = [...(domIds ?? [])];
  if (id === targetId || !a.includes(id) || !a.includes(targetId)) return a;
  a.splice(a.indexOf(id), 1);
  a.splice(a.indexOf(targetId) + (after ? 1 : 0), 0, id);
  return a;
}

/** Which layout applies to a tab: mine, else shared, else the page's own. */
export function effective(mine, shared, tab) {
  const m = mine?.tabs?.[tab], s = shared?.[tab];
  if (m && (m.groups?.length || m.hidden?.length)) return { ...m, source: 'mine' };
  if (s && (s.groups?.length || s.hidden?.length)) return { groups: s.groups ?? [], hidden: s.hidden ?? [], source: 'shared' };
  return { groups: [], hidden: [], source: 'default' };
}

/** The one stylesheet that hides a layout's hidden panels (ids are registry ids: letters, digits, dots, hyphens). */
export const hideCss = hidden => (hidden ?? []).filter(id => ID.test(id)).map(id => `[data-surface="${id}"]{display:none!important}`).join('\n');

/** A server body for a shared layout, checked: { ok, tab, layout } or { ok:false, error }. clear:true removes the tab's shared layout. */
export function validateShared(body) {
  const tab = String(body?.tab ?? '');
  if (!/^[\w-]{1,24}$/.test(tab)) return { ok: false, error: 'tab must be a short id' };
  if (body?.clear === true) return { ok: true, tab, layout: null };
  const layout = cleanLayout(body?.layout);
  if (!layout.groups.length && !layout.hidden.length) return { ok: false, error: 'the layout is empty' };
  return { ok: true, tab, layout };
}
