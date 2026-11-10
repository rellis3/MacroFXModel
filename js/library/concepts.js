// The Concepts tab: the concept cards built from the papers, the C.OG education and the Theory Lab (js/libraryConcepts.js), to read and mark.
// Read, filter, and mark each card Good / Wrong / Unclear with a short note. Marking changes nothing else and calls no model.
// Pure render helpers (tested in concepts.test.mjs) plus a small DOM mount.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const STATUSES = [['all', 'All cards'], ['new', 'Not reviewed yet'], ['good', 'Marked good'], ['wrong', 'Marked wrong'], ['unclear', 'Marked unclear']];
const KIND_LABEL = { paper: 'paper', cog: 'C.OG / education', 'theory-lab': 'Theory Lab' };
export const statusOf = c => c?.review?.status ?? 'new';

export function filterCards(cards, { q = '', status = 'all', domain = '', kind = '' } = {}) {
  const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
  return (cards ?? []).filter(c => {
    if (status !== 'all' && statusOf(c) !== status) return false;
    if (domain && !(c.domain ?? []).includes(domain)) return false;
    if (kind && !(c.sources ?? []).some(s => s.kind === kind)) return false;
    if (!words.length) return true;
    const hay = [c.title, c.principle, c.mechanism, c.measure, c.lookFor, c.caveats, ...(c.domain ?? [])].join(' ').toLowerCase();
    return words.every(w => hay.includes(w));
  });
}
export const domainsOf = cards => [...new Set((cards ?? []).flatMap(c => c.domain ?? []))].sort();

function sourceHtml(s) {
  const label = KIND_LABEL[s.kind] ?? s.kind;
  if (s.kind === 'paper') return `<a href="#/paper/${encodeURIComponent(s.id)}">${esc(s.id)}</a> <small>(${esc(label)})</small>`;
  return `<span>${esc(String(s.id).replace(/#.*$/, ''))}</span> <small>(${esc(label)})</small>`;
}
const kv = (k, v) => (v ? `<div class="lib-cc-kv"><span>${esc(k)}</span><span>${esc(v)}</span></div>` : '');

export function cardHtml(c) {
  const st = statusOf(c);
  const btn = (key, label) => `<button type="button" class="lib-btn sm" data-act="${key}" aria-pressed="${st === key}">${label}</button>`;
  return `<details class="lib-cc" data-id="${esc(c.id)}" data-status="${esc(st)}"><summary><span class="lib-cc-title">${esc(c.title)}</span>`
    + `<span class="lib-cc-meta">${(c.domain ?? []).map(d => `<span class="lib-tag">${esc(d)}</span>`).join('')}<span class="lib-cc-st" data-st>${esc(st === 'new' ? 'not reviewed' : st)}</span></span></summary>`
    + `<div class="lib-cc-body">${kv('Principle', c.principle)}${kv('Mechanism', c.mechanism)}${kv('What to measure', c.measure)}${kv('What to look for', c.lookFor)}${kv('Caveats', c.caveats)}`
    + `<div class="lib-cc-kv"><span>Sources</span><span>${(c.sources ?? []).map(sourceHtml).join('<br>')}</span></div>`
    + `<div class="lib-cc-rev"><div class="lib-cc-btns">${btn('good', 'Good')}${btn('wrong', 'Wrong')}${btn('unclear', 'Unclear')}</div>`
    + `<input class="lib-cc-note" type="text" maxlength="400" placeholder="Optional note: what is wrong or missing" value="${esc(c.review?.note ?? '')}" aria-label="Note on this card"></div></div></details>`;
}

export function summaryText(all, shown) {
  const n = k => all.filter(c => statusOf(c) === k).length;
  return `${shown} of ${all.length} cards shown · ${n('good')} good · ${n('wrong')} wrong · ${n('unclear')} unclear · ${n('new')} not reviewed`;
}

export function mount({ api, el, fail = () => {} }) {
  const S = { cards: null, loading: false };
  const view = () => filterCards(S.cards, { q: el.box.value, status: el.status.value, domain: el.domain.value });
  function render() {
    if (!S.cards) return;
    const list = view();
    el.info.textContent = S.cards.length ? summaryText(S.cards, list.length) : 'No cards yet. They appear after the concept-card run (run_roe.bat -Concepts 12).';
    el.list.innerHTML = list.length ? list.slice(0, 80).map(cardHtml).join('') + (list.length > 80 ? `<p class="lib-info">${list.length - 80} more: narrow the search or the filters.</p>` : '') : '';
  }
  async function show() {
    if (S.cards || S.loading) return render();
    S.loading = true; el.info.textContent = 'Loading…';
    try {
      const d = await api.concepts(); S.cards = d.cards ?? [];
      el.status.innerHTML = STATUSES.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('');
      el.domain.innerHTML = '<option value="">All areas</option>' + domainsOf(S.cards).map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
      render();
    } catch (e) { fail(e); el.info.textContent = 'Could not load the cards.'; }
    S.loading = false;
  }
  [el.box, el.status, el.domain].forEach(x => x.addEventListener(x === el.box ? 'input' : 'change', render));
  el.list.addEventListener('click', async e => {
    const b = e.target.closest?.('[data-act]'); if (!b) return;
    const card = b.closest('.lib-cc'), id = card.dataset.id, note = card.querySelector('.lib-cc-note').value;
    b.disabled = true;
    try {
      const r = await api.reviewConcept({ id, status: b.dataset.act, note });
      const c = S.cards.find(x => x.id === id); if (c) c.review = r.review;
      card.dataset.status = r.review.status; card.querySelector('[data-st]').textContent = r.review.status;
      card.querySelectorAll('[data-act]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.act === r.review.status)));
      el.info.textContent = summaryText(S.cards, view().length);
    } catch (err) { fail(err); } finally { b.disabled = false; }
  });
  return { show };
}
