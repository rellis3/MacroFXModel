// js/terminal/favouritesView.js: the Pair tab's favourites controls: a star on every market, a 'Favourites' filter pill, and a small tools row
// (Copy / Paste / Clear all). The list itself is js/terminal/favourites.js (this browser only). Markup is returned as strings so the Pair tab can
// repaint just its market row when a star changes, without rebuilding the chart and every card below it.
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** A real button: aria-pressed says whether it is starred, the label says what pressing it does. */
export const starHtml = (inst, on, label = inst) => `<button type="button" data-surface="panel.pair.favourites" class="fav-star${on ? ' on' : ''}" data-fav-star="${esc(inst)}" aria-pressed="${on ? 'true' : 'false'}" aria-label="${on ? 'Remove' : 'Add'} ${esc(label)} ${on ? 'from' : 'to'} favourites" title="${on ? 'Starred: click to remove' : 'Star this market'}"><span aria-hidden="true">${on ? '★' : '☆'}</span></button>`;

export const pillHtml = (count, only) => `<button type="button" data-surface="panel.pair.favourites" class="chip fav-pill${only ? ' on' : ''}" data-fav-filter aria-pressed="${only ? 'true' : 'false'}"${count ? '' : ' aria-disabled="true"'} title="${count ? 'Show only the markets you have starred' : 'Star a market first (the ☆ beside the market name)'}"><span aria-hidden="true">★</span> Favourites <b>${count}</b></button>`;

export function toolsHtml(fav, { surface = 'panel.pair.favourites', textId = 'fav-text' } = {}) {
  const n = fav.count;
  return `<details class="fav-tools" data-surface="${surface}"><summary>Your favourites <span class="muted">${n ? `${n} starred` : 'none yet'}</span></summary>
<div class="fav-row"><button type="button" class="btn" data-fav-act="copy"${n ? '' : ' disabled'}>Copy my favourites</button><button type="button" class="btn" data-fav-act="paste">Paste favourites</button><button type="button" class="btn" data-fav-act="clear"${n ? '' : ' disabled'}>Clear all</button></div>
<div class="fav-paste" hidden><label class="lbl" for="${textId}">Paste the copied text (it looks like FAVOURITES: EURUSD,GOLD)</label><textarea id="${textId}" rows="2" spellcheck="false" autocomplete="off"></textarea><button type="button" class="btn" data-fav-act="load">Load</button></div>
<div class="fav-msg muted" role="status" aria-live="polite"></div>
<p class="tt-note">Saved in this browser only, so a list you star here is not shown to anyone else on the desk. Copy it to carry it to another device.</p></details>`;
}

/**
 * Wire the controls inside `root`. repaint() redraws the market row and tools; open(inst) opens a pair page.
 * Event delegation on root, so repainting the row never needs a re-wire.
 */
export function wireFavourites(root, fav, { repaint, win = globalThis, textId = 'fav-text' } = {}) {
  if (!root) return;
  root._favRepaint = repaint;   // the Pair page is rebuilt for each market but this root stays: the handlers below always use the latest repaint
  if (root.dataset.favWired) return;
  root.dataset.favWired = '1';
  const redo = () => root._favRepaint?.();
  const msg = t => { const m = root.querySelector('.fav-msg'); if (m) m.textContent = t; };
  root.addEventListener('click', async e => {
    const star = e.target.closest?.('[data-fav-star]');
    if (star) { e.preventDefault(); e.stopPropagation(); const r = fav.toggle(star.dataset.favStar); if (!r.ok) msg(r.error); redo(); return; }
    const pill = e.target.closest?.('[data-fav-filter]');
    if (pill) { if (!fav.count) { msg('Star a market first: the ☆ beside the market name.'); root.querySelector('.fav-tools')?.setAttribute('open', ''); return; } fav.setOnly(!fav.only); redo(); return; }
    const act = e.target.closest?.('[data-fav-act]')?.dataset.favAct;
    if (!act) return;
    if (act === 'copy') {
      const text = fav.copyText();
      let ok = false; try { await win.navigator?.clipboard?.writeText(text); ok = true; } catch { /* blocked: show it instead */ }
      if (ok) msg('Copied. Paste it into "Paste favourites" on the other device.');
      else { const p = root.querySelector('.fav-paste'), t = root.querySelector(`#${textId}`); if (p && t) { p.hidden = false; t.value = text; t.select?.(); } msg('The clipboard is blocked here: select the text in the box and copy it.'); }
    } else if (act === 'paste') {
      const p = root.querySelector('.fav-paste'); if (p) { p.hidden = !p.hidden; if (!p.hidden) root.querySelector(`#${textId}`)?.focus?.(); }
    } else if (act === 'load') {
      const r = fav.paste(root.querySelector(`#${textId}`)?.value ?? ''); redo(); msg(r.ok ? r.message : r.error);
    } else if (act === 'clear') {
      if (win.confirm && !win.confirm('Remove every favourite from this browser?')) return;
      fav.clear(); redo(); msg('Favourites cleared.');
    }
  });
}
