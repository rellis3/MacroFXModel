// "Ask the librarian" on the Index tab: POST /api/research-pod/librarian { q } runs the desk librarian on a free-text question (js/libraryLibrarian.js):
// keyword scan of the index, ONE small AI call that picks the papers, and the reasons. Clearly marked as an AI call; the rest of the page is rule-based.
import { escapeHtml as esc } from './model.js';

/** The result as html: the queries, then each pick (title as a link to the paper, year, the librarian's one-line why), or the 'none' note. */
export function resultHtml(d) {
  const qs = (d.queries || []).map(q => `<span class="lib-lb-q">${esc(q)}</span>`).join('');
  const picks = (d.picks || []).map((p, i) => `<a class="lib-lb-pick" href="#/paper/${encodeURIComponent(p.id)}"><span class="lib-lb-t">${i + 1}. ${esc(p.title || p.id)}${p.year ? ` (${esc(p.year)})` : ''}</span><span class="lib-lb-why">${esc(p.why || 'No reason given.')}</span></a>`).join('');
  const body = d.none || !(d.picks || []).length
    ? '<div class="lib-empty">The librarian found no held paper that covers this.</div>'
    : `<div class="lib-lb-picks">${picks}</div>`;
  const n = (d.candidates || []).length;
  return `<div class="lib-lb-qs" aria-label="Searches the librarian ran">${qs}</div>${body}<div class="lib-info">Looked at ${n} candidate paper${n === 1 ? '' : 's'}; ${d.calls || 0} small AI call${d.calls === 1 ? '' : 's'} used${d.cap ? ` (${d.cap.used} of ${d.cap.cap} in total)` : ''}.</div>`;
}

/** ctx: { api:{ librarian(q) }, el:{ box, go, out }, fail(e) } */
export function mount(ctx) {
  const { api, el } = ctx; let busy = false;
  async function ask() {
    const q = el.box.value.trim(); if (!q || busy) return;
    busy = true; el.go.disabled = true; el.out.innerHTML = '<div class="lib-loading">The librarian is looking…</div>';
    try { el.out.innerHTML = resultHtml(await api.librarian(q)); }
    catch (e) { el.out.innerHTML = `<div class="lib-empty">${esc(e.message || 'The librarian could not answer.')}</div>`; if (e && e.auth) ctx.fail(e); }
    finally { busy = false; el.go.disabled = false; }
  }
  el.go.addEventListener('click', ask);
  el.box.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ask(); } });
  return { ask };
}
