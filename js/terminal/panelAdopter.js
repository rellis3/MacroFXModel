// js/terminal/panelAdopter.js: moves the terminal's LIVE panels into Workspace tiles and puts them back. Kept apart from the view so it can be tested on its own.
//
// adopt(id, host): find the panel's element in its home tab section (data-surface="<id>"), leave a comment marker where it was, and move it into `host`.
//   Returns 'adopted', or 'missing' when the home tab has not drawn it (host is left alone).
// If the home tab redraws the panel while it is adopted, the old element is no longer in the tab, so a copy found there is NEW: adopt() swaps it in and the
//   old one is dropped. release(id) puts the element back at its marker; if the marker is gone (the tab redrew) the stale element is dropped instead.
// `homeOf(id)` -> the id of the section element a panel lives in (workspaceCore.homeSection).
export function createAdopter({ doc, homeOf }) {
  const held = new Map();   // id -> { el, marker }
  const home = id => { const h = homeOf(id); return h ? doc.getElementById(h) : null; };
  const findLive = id => { const h = home(id); return h ? h.querySelector(`[data-surface="${id}"]`) : null; };
  function release(id) {
    const a = held.get(id); if (!a) return false;
    held.delete(id);
    if (a.marker.parentNode) { a.marker.parentNode.insertBefore(a.el, a.marker); a.marker.parentNode.removeChild(a.marker); } else if (a.el.parentNode) a.el.parentNode.removeChild(a.el);
    return true;
  }
  function adopt(id, host) {
    const live = findLive(id);
    if (!live) return 'missing';
    if (held.has(id)) release(id);
    const marker = doc.createComment(`ws:${id}`);
    live.parentNode.insertBefore(marker, live);
    host.replaceChildren(live);
    held.set(id, { el: live, marker });
    return 'adopted';
  }
  return {
    adopt, release, findLive,
    has: id => held.has(id),
    /** True when the tab has drawn a copy we do not hold (a refresh): worth adopting again. */
    stale: id => held.has(id) && !!findLive(id),
    releaseAll() { for (const id of [...held.keys()]) release(id); },
    ids: () => [...held.keys()],
  };
}
