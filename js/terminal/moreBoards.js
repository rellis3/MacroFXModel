/**
 * Desk Terminal, Macro tab: the newer boards in one place, so desk-terminal.html needs ONE hook (globalThis.macroMoreHtml, set in terminalTabs.js).
 * Each board draws only once its feed has landed (E[key] undefined = still loading: draw nothing, never a spinner); a failed feed says so in
 * the board's own card. Each board wraps itself in its own data-surface (js/terminal/tabRegistry.js), so the admin panel switches it.
 * A throwing board is logged and skipped: it can never blank the tab.
 */
import * as CL from './creditLiquidityView.js';

const BOARDS = [
  ['credit-liquidity', CL.boardHtml],
];

/** E = the terminal's enrichment store ({ 'feed-name': payload }). Returns the HTML for every board whose feed has landed. */
export function macroMoreHtml(E, extra = {}) {
  let out = '';
  for (const [key, draw] of BOARDS) {
    if (!E || E[key] === undefined) continue;
    try { out += draw(E[key], extra); } catch (e) { console.warn('board', key, e); }
  }
  return out;
}
