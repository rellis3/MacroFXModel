// The Index tab of the Paper Library: one dense, scannable row per held paper (title, year, source, topics, claim line, evidence badge),
// with a filter box that asks /api/library/find (rule-based ranking, no model). Rows come from /api/library/index (js/libraryIndex.js).
import { escapeHtml as esc } from './model.js';

export const EV_LABEL = { oos: 'out-of-sample', 'in-sample': 'in-sample', partly: 'partly OOS', survey: 'survey', unknown: 'unrated' };
export const EV_CLASS = { oos: 'desk', 'in-sample': 'abstract', partly: 'pdf', survey: 'pdf', unknown: 'none' };

/** Evidence badge html: label plus a "net of costs" mark. */
export const evBadge = r => `<span class="lib-badge ${EV_CLASS[r.ev] || 'none'}" title="Evidence in the paper, from the desk's reading">${esc(EV_LABEL[r.ev] || 'unrated')}${r.co ? ' · costs' : ''}</span>`;

/** One row. `labels`: { topic: { key: label }, source: { key: label } }; `why`: the matched terms of a find hit. */
export function rowHtml(r, labels = {}, hit = null) {
  const tl = labels.topic || {}, sl = labels.source || {};
  const tags = (r.tg || []).slice(0, 4).map(k => `<span class="lib-tag">${esc(tl[k] || k)}</span>`).join('');
  const meta = [r.y ? String(r.y) : '', esc(sl[r.src] || r.src), r.m && r.m !== 'unknown' ? esc(r.m) : ''].filter(Boolean).join(' · ');
  const why = hit && hit.why ? [...(hit.why.topics || []).map(k => tl[k] || k), ...(hit.why.terms || [])].slice(0, 8) : [];
  const vd = r.vd && r.vd.length ? `<span class="lib-ix-vd" title="Our own Evidence Book verdict">desk: ${esc(r.vd.join(', '))}</span>` : '';
  return `<a class="lib-ix-row" role="row" href="#/paper/${encodeURIComponent(r.id)}">`
    + `<span class="lib-ix-t" role="cell">${esc(r.t)}</span>`
    + `<span class="lib-ix-m" role="cell">${meta}</span>`
    + `<span class="lib-ix-tg" role="cell">${tags}</span>`
    + `<span class="lib-ix-c${r.c ? '' : ' none'}" role="cell">${r.c ? esc(r.c) : 'Not read in full yet (abstract or title only).'}</span>`
    + `<span class="lib-ix-ev" role="cell">${evBadge(r)}${r.cs ? `<span class="lib-ix-cs" title="Desk entries and proposals that cite it">${r.cs} cite</span>` : ''}${vd}</span>`
    + (why.length ? `<span class="lib-ix-why" role="cell">matched: ${why.map(esc).join(', ')}${hit && hit.score != null ? ` · ${hit.score}` : ''}</span>` : '')
    + '</a>';
}

/** Client-side filter of the rows by the selects (an empty value means all). */
export function filterRows(rows, { topic = '', source = '', ev = '' } = {}) {
  return rows.filter(r => (!topic || (r.tg || []).includes(topic)) && (!source || r.src === source) && (!ev || r.ev === ev));
}

/** Newest first, then title: the default order when nothing is searched. */
export const byYear = rows => [...rows].sort((a, b) => (b.y || 0) - (a.y || 0) || String(a.t).localeCompare(String(b.t)));

/**
 * Wire the tab. ctx: { api: { index(), find(q, opts) }, el: { box, topic, source, ev, info, list, stats }, labels(), fail(e) }.
 * Returns { show() }: loads the index once, renders it, and re-ranks through /find as the owner types.
 */
export function mount(ctx) {
  const { api, el } = ctx;
  let data = null, timer = null, seq = 0;
  const labels = () => ctx.labels();
  function fillSelects(opts) {
    const keep = { topic: el.topic.value, source: el.source.value };
    el.topic.innerHTML = '<option value="">All topics</option>' + (opts.topics || []).map(t => `<option value="${esc(t.key)}">${esc(t.label)}</option>`).join('');
    el.source.innerHTML = '<option value="">All sources</option>' + (opts.sources || []).map(t => `<option value="${esc(t.key)}">${esc(t.label)}</option>`).join('');
    el.topic.value = keep.topic; el.source.value = keep.source;
  }
  function paint(rows, hits) {
    const L = labels();
    el.list.innerHTML = rows.length ? rows.map(r => rowHtml(r, L, hits ? hits.get(r.id) : null)).join('') : '<div class="lib-empty">No paper matches. Try fewer words or clear the filters.</div>';
  }
  function showAll() {
    const f = { topic: el.topic.value, source: el.source.value, ev: el.ev.value }, rows = byYear(filterRows(data.rows, f));
    el.info.textContent = `${rows.length} of ${data.rows.length} papers, newest first`;
    paint(rows, null);
  }
  async function run() {
    if (!data) return;
    const q = el.box.value.trim();
    if (!q) { showAll(); return; }
    const my = ++seq;
    try {
      const d = await api.find(q, { n: 40, topics: el.topic.value ? [el.topic.value] : [], sources: el.source.value ? [el.source.value] : [] });
      if (my !== seq) return;
      let hits = d.hits || [];
      if (el.ev.value) hits = hits.filter(h => h.ev === el.ev.value);
      el.info.textContent = hits.length ? `${hits.length} best match${hits.length === 1 ? '' : 'es'} for "${q}", best first` : `Nothing matches "${q}"`;
      paint(hits, new Map(hits.map(h => [h.id, h])));
    } catch (e) { ctx.fail(e); }
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(run, 250); };
  el.box.addEventListener('input', later);
  [el.topic, el.source, el.ev].forEach(s => s.addEventListener('change', run));
  return {
    async show() {
      if (data) return;
      el.list.innerHTML = '<div class="lib-loading">Loading…</div>';
      try {
        data = await api.index();
        fillSelects(ctx.options());
        const s = data.stats || {};
        el.stats.textContent = `${s.rows || data.rows.length} papers · ${s.read || 0} read by the desk · about ${s.tokensPerRow || '?'} tokens per row`;
        run();
      } catch (e) { ctx.fail(e); }
    },
  };
}
