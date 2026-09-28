/**
 * A jump rail for a long page — the sections that are actually on screen, in the order
 * they actually appear.
 *
 * today.html is eleven panels deep and several of them only render when their data
 * arrives. Two things follow, and they are why this is a module rather than a hardcoded
 * list of links:
 *
 *   ORDER COMES FROM THE DOM, not from this file. A nav whose order is maintained by
 *   hand drifts from the page the first time a panel moves, and then it is worse than no
 *   nav: you click "Regime" and land somewhere else.
 *
 *   A SECTION THAT DID NOT RENDER MUST NOT BE LISTED. Panels hide themselves when their
 *   feed is empty. Linking to a hidden anchor scrolls nowhere and looks broken, and the
 *   reader cannot tell that from a bug. If it is not on the page it is not in the rail.
 *
 * The labels ARE fixed here, deliberately. Panel headings carry live counts — "Desk watch
 * — 2 conditions firing" — and a nav item that changes width as the day goes on is
 * annoying to aim at. A short stable label is what a jump list is for. `js/jumpNav.test.mjs`
 * asserts every id below exists in today.html, so the fixed half cannot drift either.
 *
 * Pure: takes a document, returns data. No DOM writing, no scrolling, no listeners.
 */

/** id → what to call it. Order here is irrelevant; the DOM decides. */
export const SECTIONS = [
  { id: 'mbrief', icon: '\u{1F5DE}', label: 'Brief' },
  { id: 'eodPanel', icon: '\u{1F313}', label: 'End of day' },
  { id: 'widerPanel', icon: '\u{1F30D}', label: 'Wider market' },
  { id: 'drillPanel', icon: '\u{1F9E9}', label: 'Reading' },
  { id: 'deskWatch', icon: '\u{1F441}', label: 'Desk watch' },
  { id: 'mread', icon: '\u{1F4CA}', label: 'Market read' },
  { id: 'outlookPanel', icon: '\u{1F52D}', label: 'Outlook' },
  { id: 'timelinePanel', icon: '⏱', label: 'Timeline' },
  { id: 'weekAhead', icon: '\u{1F4C5}', label: 'Week ahead' },
  { id: 'regimePanel', icon: '\u{1F501}', label: 'Regime' },
  { id: 'chainPanel', icon: '\u{1F517}', label: 'The chain' },
];

/**
 * Is this element actually showing? Walks up, because a visible panel inside a hidden
 * parent is not visible, and `style.display` on the element alone would say it was.
 */
export function isVisible(el, getStyle) {
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const d = n.style?.display;
    if (d === 'none') return false;
    if (getStyle) { const cs = getStyle(n); if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false; }
  }
  return true;
}

/**
 * The rail's items: present, visible, in DOM order.
 *
 * `doc` needs getElementById and compareDocumentPosition — a real document or anything
 * that fakes those two, which is what makes this testable without a browser.
 */
export function items(doc, { sections = SECTIONS, getStyle = null } = {}) {
  if (!doc?.getElementById) return [];
  const found = [];
  for (const s of sections) {
    const el = doc.getElementById(s.id);
    if (!el) continue;                       // never rendered at all
    if (!isVisible(el, getStyle)) continue;  // rendered but hidden: linking there looks broken
    found.push({ ...s, el });
  }
  // DOM order, so the rail always reads top-to-bottom the way the page does
  found.sort((a, b) => {
    if (a.el === b.el) return 0;
    const pos = a.el.compareDocumentPosition?.(b.el) ?? 0;
    if (pos & 4) return -1;   // b follows a
    if (pos & 2) return 1;    // b precedes a
    return 0;
  });
  return found.map(({ el, ...rest }) => ({ ...rest, el }));
}

/**
 * Which item is "current" for a given scroll position.
 *
 * The one whose top is nearest above the reading line, so a section stays current while
 * you read it rather than flicking to the next the instant its heading clears the top.
 * Falls back to the first item before you have scrolled past anything.
 */
export function activeId(list, scrollY, { offset = 120, topOf = i => i.el?.offsetTop ?? 0 } = {}) {
  if (!list?.length) return null;
  const line = scrollY + offset;
  let best = null;
  for (const i of list) {
    const top = topOf(i);
    if (top <= line && (best == null || top > topOf(best))) best = i;
  }
  return (best ?? list[0]).id;
}
