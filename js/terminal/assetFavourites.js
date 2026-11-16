// js/terminal/assetFavourites.js: favourites on the ASSETS tab. A star on every market card and a 'Favourites' pill in the tab's filter row that
// shows only the starred cards. It is the SAME list as the Pair tab's stars (js/terminal/favourites.js: starring here shows there, and back);
// only the on/off of the filter is the tab's own, so filtering Assets never changes what the Pair selector shows.
//
// A display preference and nothing else: it changes which cards a person sees, never a number. The list is kept in this browser only
// (everyone shares one desk login), with Copy / Paste / Clear reachable from this tab too.
// The page's inline Assets code (desk-terminal.html) reaches this through globalThis.assetFav, the same way it reaches the vol clock board.
import { getFavourites } from './favourites.js';
import { toolsHtml, wireFavourites } from './favouritesView.js';

export const SURFACE = 'panel.asset.favourites';
export const TEXT_ID = 'fav-text-assets';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** A real button in the card header: aria-pressed says whether it is starred, the label says what pressing it does. */
export const cardStarHtml = (inst, on, label = inst) => `<button type="button" data-surface="panel.asset.favourites" class="fav-star fav-card-star${on ? ' on' : ''}" data-fav-star="${esc(inst)}" aria-pressed="${on ? 'true' : 'false'}" aria-label="${on ? 'Remove' : 'Add'} ${esc(label)} ${on ? 'from' : 'to'} favourites" title="${on ? 'Starred: click to remove' : 'Star this market'}"><span aria-hidden="true">${on ? '★' : '☆'}</span></button>`;

/** The filter pill. `shown` is how many starred markets have a card on this tab; the filter is off while there are none. */
export const pillHtml = (shown, on) => `<button type="button" data-surface="panel.asset.favourites" class="fav-pill${on ? ' on' : ''}" data-fav-assets-filter aria-pressed="${on ? 'true' : 'false'}"${shown ? '' : ' aria-disabled="true"'} title="${shown ? 'Show only the markets you have starred' : 'Star a market first (the ☆ on a card)'}"><span aria-hidden="true">★</span> Favourites <b>${shown}</b></button>`;

/** How many of the starred markets have a card here (a market starred on the Pair tab may have none). */
export const countShown = (fav, cards) => fav.list().filter(n => cards && Object.prototype.hasOwnProperty.call(cards, n)).length;

/** The filter is on only when there is at least one starred card to show: a filter on nothing would be a blank tab. */
export const filterOn = (fav, cards) => fav.assetsOnly && countShown(fav, cards) > 0;

/** entries: [[name, card], ...] -> only the starred ones when the filter is on. */
export const applyFilter = (entries, fav, cards) => (filterOn(fav, cards) ? entries.filter(([n]) => fav.has(n)) : entries);

/** What to say instead of an empty grid: the filter is on but the group filter hides every starred card. */
export const emptyHtml = groupLabel => `<div class="card muted">None of your favourites are in ${esc(groupLabel || 'this group')}. Pick another group, or turn Favourites off.</div>`;

/** Copy / Paste / Clear for this tab (its own ids, so the Pair tab's copy of the same row never clashes). */
export const toolsRowHtml = fav => toolsHtml(fav, { surface: SURFACE, textId: TEXT_ID });

/**
 * Wire one render of the Assets section. Stars and the pill are bound on the elements themselves: the cards open their full view from their own
 * onclick / onkeydown, and those run BEFORE a handler on the section, so a star has to stop the event itself or it would open the card too.
 * The list's own subscribe() repaints the tab after any change (a star here, on the Pair tab, or a STAR / UNSTAR / FAV command).
 */
export function wireAssets(root, fav, { win = globalThis } = {}) {
  if (!root) return;
  for (const b of root.querySelectorAll('[data-fav-star]')) {
    b.onclick = e => { e.preventDefault(); e.stopPropagation(); fav.toggle(b.dataset.favStar); };
    b.onkeydown = e => e.stopPropagation();   // Enter on the star must not reach the card's own Enter-to-open
  }
  const pill = root.querySelector('[data-fav-assets-filter]');
  if (pill) {
    pill.onclick = () => {
      if (!fav.count) {
        root.querySelector('.fav-tools')?.setAttribute('open', '');
        const m = root.querySelector('.fav-msg'); if (m) m.textContent = 'Star a market first: the ☆ on a card.';
        return;
      }
      fav.setAssetsOnly(!fav.assetsOnly);
    };
  }
  wireFavourites(root, fav, { repaint: () => {}, win, textId: TEXT_ID });   // Copy / Paste / Clear; the list repaints the tab itself
}

/** Mount: the shared list, repaints on any change, and the handle the page's inline code uses. */
export function mountAssetFavourites({ win = globalThis } = {}) {
  const fav = getFavourites(win);
  const api = {
    fav, SURFACE,
    enabled: () => win.deskSurfaceOn?.(SURFACE) ?? true,
    starHtml: (inst, label) => (api.enabled() ? cardStarHtml(inst, fav.has(inst), label) : ''),
    pillHtml: cards => (api.enabled() ? pillHtml(countShown(fav, cards), filterOn(fav, cards)) : ''),
    toolsHtml: () => (api.enabled() ? toolsRowHtml(fav) : ''),
    filter: (entries, cards) => (api.enabled() ? applyFilter(entries, fav, cards) : entries),
    on: cards => api.enabled() && filterOn(fav, cards),
    emptyHtml,
    wire: root => wireAssets(root, fav, { win }),
  };
  const unsub = fav.subscribe(() => {
    try { win.assetFavRefresh?.(); } catch (e) { win.console?.warn?.('assetFavRefresh', e); }
  });
  win.assetFav = api;
  return { api, destroy() { unsub(); if (win.assetFav === api) win.assetFav = null; } };
}
