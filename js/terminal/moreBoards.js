/**
 * Desk Terminal, Macro tab: the newer boards in one place, so desk-terminal.html needs ONE hook (globalThis.macroMoreHtml, set in terminalTabs.js).
 * Each board draws only once its feed has landed (E[key] undefined = still loading: draw nothing, never a spinner); a failed feed says so in
 * the board's own card. Each board wraps itself in its own data-surface (js/terminal/tabRegistry.js), so the admin panel switches it.
 * A throwing board is logged and skipped: it can never blank the tab.
 */
import * as CL from './creditLiquidityView.js';
import * as CV from './curveBoardView.js';
import * as RG from './regimeBoardView.js';
import * as RL from './releasesBoardView.js';
import * as VB from './volBoardView.js';
import * as CS from './ccyStrengthView.js';
import * as LV from './liveLayerView.js';

const BOARDS = [
  ['credit-liquidity', CL.boardHtml],
  ['curve-board', CV.boardHtml],
  ['regime-board', RG.boardHtml],
  ['releases-board', RL.boardHtml],
  ['vol-board', VB.boardHtml],
  ['live-layer', LV.boardHtml],
];

/** The Overview's extra block: the live currency strength board's slot (js/terminal/ccyStrengthView.js). The slot is filled by mountOverview() once it is in the page. */
export const overviewMoreHtml = () => `<div class="sfc" data-surface="panel.ov.ccystrength"><div id="csx" class="cs-root"></div></div>${LV.priceReadSlot()}`;
/** Attach the live board to its slot (idempotent: the Overview re-renders its slot, the state survives). getJson = the page's fetcher. */
export function mountOverview(getJson) { const root = typeof document !== 'undefined' ? document.getElementById('csx') : null; if (root) CS.mount(root, { getJson }); }

/** E = the terminal's enrichment store ({ 'feed-name': payload }). Returns the HTML for every board whose feed has landed. */
export function macroMoreHtml(E, extra = {}) {
  let out = '';
  for (const [key, draw] of BOARDS) {
    if (!E || E[key] === undefined) continue;
    try { out += draw(E[key], extra); } catch (e) { console.warn('board', key, e); }
  }
  return out;
}

/** One of the boards above by its feed key (the Macro tab draws them one section at a time): '' while its feed has not landed or if it throws. */
export function macroMoreBoard(key, E, extra = {}) {
  const draw = BOARDS.find(([k]) => k === key)?.[1];
  if (!draw || !E || E[key] === undefined) return '';
  try { return draw(E[key], { ...extra, E }); } catch (e) { console.warn('board', key, e); return ''; }   // E: a board may read a sibling feed (credit-liquidity reads credit-board)
}

/** The live layer (js/terminal/liveLayerView.js): start its refresh and fill the Overview's price-read slot. getAnalyst = () => the desk's dawn read per currency. */
export const mountLive = (getJson, getAnalyst) => LV.mount({ getJson, getAnalyst });
export const liveEmCell = LV.liveEmCell, liveWiderChip = LV.liveWiderChip;
