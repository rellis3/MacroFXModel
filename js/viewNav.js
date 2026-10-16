/**
 * Views for today.html: the same panels, grouped, so a click swaps the page instead of
 * scrolling a very long one.
 *
 * WHY. The page grew to ~25 panels and the jump rail only scrolled to them, so every new
 * panel made the scroll longer. A view shows one group at a time; "All" restores the long
 * page for anyone who prefers it. Nothing is removed or re-ordered, only hidden, so every
 * panel's own render code and every id other code looks up stay exactly as they were.
 *
 * Pure data + two lookups. The DOM work (adding/removing the hide class) is in today.html.
 * `js/viewNav.test.mjs` asserts every id here exists in today.html, so the list cannot drift.
 */

/** ids are direct children of .main-col; a panel nested inside one of them follows its parent. */
export const VIEWS = [
  { id: 'now', icon: '\u{1F3AF}', label: 'Now', hint: 'the read, what changed, what is firing',
    ids: ['mbrief', 'dayRead', 'sinceYday', 'deskWatch', 'eodPanel'] },
  { id: 'pairs', icon: '\u{1F4B1}', label: 'Pairs', hint: 'every market card',
    ids: ['concentration', 'ctlBar', 'grid', 'tview', 'sview', 'footNote'] },
  { id: 'macro', icon: '\u{1F310}', label: 'Macro', hint: 'rates, regime, outlook, the chain',
    ids: ['mread', 'macro', 'summary', 'outlookPanel', 'regimeLine', 'regimePanel', 'widerPanel', 'weekCtx'] },
  { id: 'events', icon: '\u{1F4C5}', label: 'Events', hint: 'news, the week, the timeline',
    ids: ['newsPlay', 'weekAhead', 'timelinePanel'] },
  { id: 'deep', icon: '\u{1F9ED}', label: 'Deep', hint: 'full Global Read, the daily drill, concepts',
    ids: ['globalRead', 'drillPanel', 'conceptBox'] },
];
export const ALL_VIEW = 'all';
export const DEFAULT_VIEW = 'now';

const OWNER = new Map(VIEWS.flatMap(v => v.ids.map(id => [id, v.id])));

/** Which view a top-level panel belongs to; null if it is not assigned (it then always shows). */
export const viewOf = id => OWNER.get(id) ?? null;

/** A stored or hash value → a view id we know, else the default. */
export function validView(v) {
  return v === ALL_VIEW || VIEWS.some(x => x.id === v) ? v : DEFAULT_VIEW;
}

/** Should a panel with this view tag be shown while `active` is selected? */
export const shows = (panelView, active) => active === ALL_VIEW || panelView == null || panelView === active;
