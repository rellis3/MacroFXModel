/**
 * Shared daily reads on the Desk Terminal (owner 2026-11-13): the front end of js/deskSharedReads.js.
 *
 * Every fixed, keyed AI read (a market's deep read, the chain read per window) is written ONCE per London day by whoever presses
 * first and stored for everyone. This module draws the right-hand controls for the three states and does the two small jobs
 * the views share: the owner's confirm before a Refresh, and polling while a colleague's generation is running.
 *
 *   none        no read yet            -> a Generate button
 *   generating  someone is writing it  -> a gold "writing now" chip for everyone, no button (the view polls)
 *   ready       today's read exists    -> "Shared read · synced today 09:42 UK"; no button for a viewer, Refresh for the owner
 *   old         only an earlier day's  -> the dated read stays visible, with the Generate button back
 *
 * The button carries data-sr="gen" or data-sr="refresh"; the view wires the click. Pure string building plus two helpers.
 */
import { viewState } from '../deskSharedReads.js';

const h = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The state for one read, from what the server's GET returned ({ ok, generatedAt, today, role, inflight }). */
export function stateOf(r, { liveSnapshot = false, read = null } = {}) {
  const has = r?.ok && (read ?? r);
  return viewState({ read: has ? (read ?? true) : null, generatedAt: r?.generatedAt ?? r?.at ?? null, today: r?.today, inflight: !!r?.inflight, isOwner: r?.role === 'owner', liveSnapshot });
}

/** The controls for a read header. `vs` is stateOf(...). */
export function controlsHtml(vs, { genLabel = 'Generate', genTitle = '', busy = false } = {}) {
  const btn = (act, label, title) => `<button class="btn" type="button" data-sr="${act}" style="padding:3px 10px" title="${h(title)}"${busy ? ' disabled' : ''}>${h(label)}</button>`;
  if (vs.state === 'generating') return `<span class="chip gold" title="One read per day: a colleague pressed first, so it is being written for everyone">${h(vs.label)}</span>`;
  if (vs.state === 'ready') return `<span class="chip pur" title="One read per day, shared by everyone who opens the terminal">${h(vs.label)}</span>${vs.showRefresh ? ` ${btn('refresh', '↻ Refresh', 'Owner only: writes a new read and REPLACES the shared copy everyone sees today. A model call.')}` : ''}`;
  if (vs.state === 'old') return `<span class="chip" title="Kept visible until today's read is written">${h(vs.label)}</span>${vs.showGenerate ? ` ${btn('gen', genLabel, genTitle || 'Writes today\'s read. The first press of the day writes it for everyone; after that the button goes. A model call.')}` : ''}`;
  return vs.showGenerate ? btn('gen', genLabel, genTitle || 'Writes today\'s read. The first press of the day writes it for everyone; after that the button goes. A model call.') : '';
}

/** The owner's confirm before a refresh: it replaces the copy everyone sees. */
export function confirmReplace(what = 'read') {
  try { return globalThis.confirm ? globalThis.confirm(`This replaces the shared ${what} everyone sees today with a new one (a model call). Refresh it?`) : true; } catch { return true; }
}

/**
 * Poll `check()` every `every` ms until it returns true (or `max` tries, or the `alive()` test fails): used while another
 * user's generation is running, so the page flips to the finished read without a reload.
 */
export function pollWhile(check, { every = 5000, max = 36, alive = () => true } = {}) {
  let n = 0;
  const tick = async () => {
    if (!alive() || n++ >= max) return;
    let done = false; try { done = await check(); } catch { /* try again */ }
    if (!done) setTimeout(tick, every);
  };
  setTimeout(tick, every);
}
