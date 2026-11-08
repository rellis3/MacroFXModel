// Paper Library page glue (thin: logic lives in model/speech/progress/audio/crop modules).
import { api } from './api.js';
import * as M from './model.js';
import * as S from './speech.js';
import * as A from './audio.js';
import * as P from './progress.js';
import { cropBlock, cropBlockHi } from './pdfcrop.js';
import * as MA from './math.js';
import * as SUM from './summary.js';

const $ = id => document.getElementById(id);
const esc = M.escapeHtml;
const ls = (() => { try { localStorage.getItem('x'); return localStorage; } catch { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; } })();

const st = { papers: [], topics: [], sources: [], years: [], totals: null, selected: [], selSources: [], selYears: [], sort: M.DEFAULT_SORT, sortTouched: false, q: '', hits: null, tab: 'papers', todo: null, readNext: null, cur: null };

function toast(msg, ms = 3500) {
  const el = $('toast'); el.textContent = msg; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, ms);
}
const fail = e => { if (e && e.auth) { location.href = '/login?zone=main&next=' + encodeURIComponent(location.pathname + location.hash); return; } toast(e.message || 'Something went wrong'); };

// ── progress (Theory Lab semantics, own key) ──
const pstore = P.storeApi(ls);
const sync = P.createSync({ storage: ls, post: b => api.progress(b), onUpdated: () => { if (!st.cur) renderCards(); } });
function pctOf(p) { return Math.max(P.localPercent(ls, p.id), Math.round((p.progress && p.progress.pct) || 0)); }

// ── list view ──
function ringHtml(pct) {
  const g = M.ringGeom(pct);
  return `<div class="lib-ring" title="${pct}% read"><svg viewBox="0 0 28 28"><circle class="bg" cx="14" cy="14" r="${g.r}"/><circle class="fg" cx="14" cy="14" r="${g.r}" stroke-dasharray="${g.dash} ${g.gap}"/></svg><span>${pct}</span></div>`;
}
function mark(text, q) {
  const s = esc(text); if (!q) return s;
  const words = q.split(/\s+/).filter(w => w.length > 2).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return words.length ? s.replace(new RegExp('(' + words.join('|') + ')', 'ig'), '<mark>$1</mark>') : s;
}
const SEL_KEY = 'lib.sel.topics.v1', SRC_KEY = 'lib.sel.sources.v1', YR_KEY = 'lib.sel.years.v1', SORT_KEY = 'lib.sort.v1';
function saveSel() { try { ls.setItem(SEL_KEY, JSON.stringify(st.selected)); ls.setItem(SRC_KEY, JSON.stringify(st.selSources)); ls.setItem(YR_KEY, JSON.stringify(st.selYears)); } catch { /* storage blocked: selection just is not remembered */ } }
const srcTag = p => (p.source ? `<span class="lib-src" title="Source">${esc(p.source.label)}</span>` : '');
function cardHtml(p, hit) {
  const s = M.statusOf(p), pct = pctOf(p);
  const tags = (p.tags || []).slice(0, 4).map(t => `<span class="lib-tag${t.source === 'manual' ? ' manual' : ''}">${esc(t.label)}</span>`).join('');
  const snips = hit ? (hit.snippets || []).slice(0, 2).map(x => `<div class="snip">${mark(x.text, st.q)}</div>`).join('') : '';
  return `<a class="lib-card lib-pcard" href="#/paper/${encodeURIComponent(p.id)}" data-id="${esc(p.id)}">
    <div class="lib-pcard-top"><div class="lib-pcard-main"><h3>${esc(p.title)}</h3>
    <div class="meta">${esc(M.authorsLine(p))}${p.year ? ` · <span class="lib-year" title="${esc(M.yearTitle(p))}">${esc(M.yearText(p))}</span>` : ''}${p.venue ? ' · ' + esc(p.venue) : ''}</div></div>${ringHtml(pct)}</div>
    ${(l => `<p class="lib-pcard-short${l.muted ? ' muted' : ''}"><b>In short</b> ${esc(l.text)}</p>`)(SUM.cardLine(p))}${snips}<div class="lib-pcard-foot"><span class="lib-badge ${s.key}">${s.label}</span>${srcTag(p)}${tags}</div></a>`;
}
const hitSet = () => (st.hits ? new Set(st.hits.map(h => h.id)) : null);
function renderChips() {
  // each group's counts honour the other group's selection (and the search), so the numbers add up to what a click would show
  const forTopics = M.filterPapers(st.papers, [], hitSet(), st.selSources, st.selYears), forSources = M.filterPapers(st.papers, st.selected, hitSet(), [], st.selYears), forYears = M.filterPapers(st.papers, st.selected, hitSet(), st.selSources);
  const chip = (c, on, attr) => `<button type="button" class="lib-chip${c.count ? '' : ' zero'}" ${attr}="${esc(c.key)}" aria-pressed="${on.includes(c.key)}">${esc(c.label)} <span class="n">${c.count}</span></button>`;
  $('chips').innerHTML = M.chipCounts(st.topics, forTopics).map(c => chip(c, st.selected, 'data-key')).join('');
  $('srcChips').innerHTML = M.sourceChips(st.sources, forSources, st.selSources).map(c => chip(c, st.selSources, 'data-src')).join('');
  $('srcRow').hidden = !st.sources.length;
  $('yrChips').innerHTML = M.yearChips(st.years, forYears, st.selYears).map(c => chip(c, st.selYears, 'data-yr')).join('');
  $('yrRow').hidden = !st.years.length;
  $('yrToggle').querySelector('.sel').textContent = st.selYears.length ? ` (${st.selYears.length})` : '';
}
const nFilters = () => st.selected.length + st.selSources.length + st.selYears.length;
const searching = () => !!(st.q.trim() && st.hits);
const effSort = () => (searching() ? (st.sortTouched ? st.sort : 'match') : (st.sort === 'match' ? M.DEFAULT_SORT : st.sort));
function renderSort() {
  const sel = $('sortSel'), cur = effSort(), s = searching();
  sel.innerHTML = M.SORTS.filter(o => o.key !== 'match' || s).map(o => `<option value="${o.key}"${o.key === cur ? ' selected' : ''}>${o.label}</option>`).join('');
  $('clearFilters').hidden = !nFilters();
}
function renderCards() {
  const list = M.sortPapers(M.filterPapers(st.papers, st.selected, hitSet(), st.selSources, st.selYears), effSort(), { hits: st.hits, pct: pctOf });
  const hitBy = new Map((st.hits || []).map(h => [h.id, h]));
  $('cards').innerHTML = list.length ? list.map(p => cardHtml(p, hitBy.get(p.id))).join('') : `<div class="lib-empty">${st.q ? 'No paper matches that search.' : (nFilters() ? 'No papers match these filters.' : 'No papers yet.')}</div>`;
  const t = st.totals;
  $('resultInfo').textContent = st.q
    ? `${list.length} paper${list.length === 1 ? '' : 's'} match “${st.q}”${nFilters() ? ' with the selected filters' : ''}`
    : (t ? `${list.length} of ${t.all} papers · ${t.fullText} with full text · ${t.abstractOnly} abstract only` : '');
  $('cntPapers').textContent = st.papers.length || '';
  renderChips(); renderSort();
}
function renderReadNext() {
  const rows = M.readNextPapers(st.papers, st.readNext);
  const el = $('readNext');
  if (!rows.length) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<h2>Read next</h2><div class="lib-rn-row">${rows.slice(0, 6).map(r => `<a class="lib-rn" href="#/paper/${encodeURIComponent(r.paper.id)}"><b>${esc(r.paper.title)}</b><small>${esc(r.why || '')}</small></a>`).join('')}</div>`;
}
function renderTodo() {
  const items = (st.todo && st.todo.items) || [];
  const open = items.filter(i => !i.held).length;
  $('cntTodo').textContent = st.todo ? open : '';
  $('todoList').innerHTML = items.length ? items.map(i => `<div class="lib-todo-row${i.held ? ' held' : ''}"><div class="t">${esc(i.title)}<small>${[i.year, i.part].filter(Boolean).map(esc).join(' · ')}${i.held ? ' · held' : ''}</small></div>${i.held ? '<span class="lib-badge desk">held</span>' : (i.url ? `<a class="lib-btn sm" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">SSRN ↗</a>` : '')}</div>`).join('') : '<div class="lib-empty">Nothing on the list.</div>';
}
function setTab(tab) {
  st.tab = tab;
  document.querySelectorAll('.lib-tab').forEach(b => { const on = b.dataset.tab === tab; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
  $('papersTab').hidden = tab !== 'papers'; $('todoTab').hidden = tab !== 'todo';
  $('readNext').style.display = tab === 'papers' ? '' : 'none';
  if (tab === 'todo' && !st.todo) { $('todoList').innerHTML = '<div class="lib-loading">Loading…</div>'; api.todo().then(d => { st.todo = d; renderTodo(); }).catch(fail); }
}
const runSearch = M.debounce(async () => {
  const q = st.q.trim();
  if (!q) { st.hits = null; st.sortTouched = false; renderCards(); return; }
  try { const d = await api.search(q, st.selected, st.selSources, st.selYears); if (q === st.q.trim()) { st.hits = d.hits || []; renderCards(); } } catch (e) { fail(e); }
}, 250);

function bindList() {
  $('q').addEventListener('input', e => { st.q = e.target.value; $('qClear').hidden = !st.q; if (!st.q.trim()) { runSearch.cancel(); st.hits = null; st.sortTouched = false; renderCards(); } else runSearch(); });
  $('qClear').addEventListener('click', () => { $('q').value = ''; st.q = ''; $('qClear').hidden = true; runSearch.cancel(); st.hits = null; st.sortTouched = false; renderCards(); $('q').focus(); });
  $('chips').addEventListener('click', e => {
    const b = e.target.closest('.lib-chip'); if (!b) return;
    st.selected = M.toggleTag(st.selected, b.dataset.key); saveSel();
    renderCards(); if (st.q.trim()) runSearch();
  });
  $('srcChips').addEventListener('click', e => {
    const b = e.target.closest('.lib-chip'); if (!b) return;
    st.selSources = M.toggleTag(st.selSources, b.dataset.src); saveSel();
    renderCards(); if (st.q.trim()) runSearch();
  });
  $('yrChips').addEventListener('click', e => {
    const b = e.target.closest('.lib-chip'); if (!b) return;
    st.selYears = M.toggleTag(st.selYears, b.dataset.yr); saveSel();
    renderCards(); if (st.q.trim()) runSearch();
  });
  $('yrToggle').addEventListener('click', () => { const open = $('yrChips').hidden; $('yrChips').hidden = !open; $('yrToggle').setAttribute('aria-expanded', open); });
  $('sortSel').addEventListener('change', e => {
    st.sort = e.target.value; st.sortTouched = true;
    if (st.sort !== 'match') { try { ls.setItem(SORT_KEY, st.sort); } catch { /* not remembered */ } }
    renderCards();
  });
  $('clearFilters').addEventListener('click', () => { st.selected = []; st.selSources = []; st.selYears = []; saveSel(); renderCards(); if (st.q.trim()) runSearch(); });
  document.querySelector('.lib-tabs').addEventListener('click', e => { const b = e.target.closest('.lib-tab'); if (b) setTab(b.dataset.tab); });
  $('backBtn').addEventListener('click', () => { location.hash = ''; });
}

// ── reader ──
let speaker = null, listenCache = {}, tracker = null, tickTimer = null, rafPending = false, audioEl = null;

function stopReaderSide() {
  if (speaker) speaker.stop();
  $('listenBar').hidden = true; document.body.classList.remove('lib-listen-open');
  if (tracker) { tracker.persist(); sync.push({ keepalive: false }).catch(() => {}); }
  tracker = null; clearInterval(tickTimer); tickTimer = null;
  window.removeEventListener('scroll', onScroll);
  if (audioEl) { audioEl.pause(); audioEl = null; }
}
function showList() {
  if (st.cur) stopReaderSide();
  st.cur = null; $('readerView').hidden = true; $('listView').hidden = false;
  renderCards(); renderReadNext();
  document.title = 'Library — MacroFX';
}

function tagsHtml(p) {
  const have = new Set((p.tags || []).map(t => t.key));
  const add = st.topics.filter(t => !have.has(t.key));
  return (p.tags || []).map(t => `<span class="lib-tag${t.source === 'manual' ? ' manual' : ''}">${esc(t.label)}<button type="button" data-rm="${esc(t.key)}" aria-label="Remove tag ${esc(t.label)}">×</button></span>`).join('') +
    (add.length ? `<span class="lib-addtag"><select id="addTag" aria-label="Add a tag"><option value="">+ tag</option>${add.map(t => `<option value="${esc(t.key)}">${esc(t.label)}</option>`).join('')}</select></span>` : '');
}
function headHtml(p) {
  const s = M.statusOf(p), ext = [];
  if (p.url) ext.push(`<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">source ↗</a>`);
  if (p.ssrn) ext.push(`<a href="https://papers.ssrn.com/sol3/papers.cfm?abstract_id=${esc(p.ssrn)}" target="_blank" rel="noopener noreferrer">SSRN ↗</a>`);
  if (p.arxiv) ext.push(`<a href="https://arxiv.org/abs/${esc(p.arxiv)}" target="_blank" rel="noopener noreferrer">arXiv ↗</a>`);
  if (p.doi) ext.push(`<a href="https://doi.org/${esc(p.doi)}" target="_blank" rel="noopener noreferrer">DOI ↗</a>`);
  return `<div class="lib-rh"><h1>${esc(p.title)}</h1>
    <div class="meta">${esc(M.authorsLine(p, 6))}${p.year ? ' · ' + esc(p.year) : ''}${p.venue ? ' · ' + esc(p.venue) : ''}${p.pages ? ' · ' + p.pages + ' pages' : ''} ${ext.join(' · ')}</div>
    <div class="row"><span class="lib-badge ${s.key}">${s.label}</span><span id="pctBadge" class="lib-badge pdf"></span>${srcTag(p)}</div>
    <div class="row" id="tagRow">${tagsHtml(p)}</div>
    <div class="actions"><button type="button" class="lib-btn primary" id="listenBtn">🔊 Listen</button>
    ${p.hasPdf ? `<a class="lib-btn" href="${api.pdfUrl(p.id)}" target="_blank" rel="noopener">Open PDF ↗</a>` : ''}
    ${MA.anyMath(st.cur && st.cur.blocks) ? eqSwitchHtml() : ''}</div></div>`;
}

function eqSwitchHtml() {
  const m = MA.eqMode(ls);
  return `<div class="lib-eqswitch" role="group" aria-label="Equations"><span class="lbl">Equations</span>` +
    `<button type="button" data-eqmode="rendered" aria-pressed="${m === 'rendered'}">Rendered</button><button type="button" data-eqmode="original" aria-pressed="${m === 'original'}">Original</button>` +
    `<label class="incl" title="Also draw the equations that were only read automatically from the PDF (not checked against arXiv or the AI)"><input type="checkbox" id="eqIncl"${MA.includeUnchecked(ls) ? ' checked' : ''}> include unchecked</label></div>`;
}
function eqHtml(b, a) {
  const cap = b.label && b.label.toLowerCase().startsWith('equation') ? esc(b.label) : 'Equation' + (b.label ? ' ' + esc(b.label) : '');
  const src = MA.sourceLabel(b.latexSource);
  return `<figure class="lib-fig lib-eq" ${a} data-math="1" data-page="${b.page}" data-view="math"><div class="eqmath" role="math" aria-label="Equation"><span class="lib-loading">Equation, page ${b.page}…</span></div><div class="slot" hidden></div>` +
    `<div class="cap"><span>${cap} · page ${b.page} · <a href="${api.pdfUrl(st.cur.paper.id)}#page=${b.page}" target="_blank" rel="noopener">open PDF</a></span>` +
    `<button type="button" class="lib-btn sm eqtoggle" aria-pressed="false" title="Show the equation as it is printed in the PDF">Original</button>` +
    (src ? `<span class="eqsrc" title="${esc(MA.sourceTitle(b.latexSource))}">${esc(src)}</span>` : '') + `</div></figure>`;
}
// "What this shows": a note the model wrote from the paper's text (caption, mentions, table cells, text inside the figure); never a reading of the picture
function noteHtml(b) {
  if (b.type === 'eq' || typeof b.note !== 'string' || !b.note.trim()) return '';
  return `<aside class="fignote${b.noteConfident ? '' : ' unsure'}" aria-label="What this shows"><div class="fnh"><b>What this shows</b><span class="fntag" title="Written by the AI from the caption, the paragraphs that mention it and the numbers in the table; it has not seen the picture">from the paper's text</span></div><p>${esc(b.note)}</p>${b.noteConfident ? '' : '<small>Low confidence: check it against the picture.</small>'}</aside>`;
}
function blocksHtml(blocks) {
  const refs = [];
  let h = '';
  for (const b of blocks) {
    const a = `data-i="${b.i}"`;
    if (b.type === 'h1') h += `<h2 class="b1" ${a}>${esc(b.text)}</h2>`;
    else if (b.type === 'h2') h += `<h3 class="b2" ${a}>${esc(b.text)}</h3>`;
    else if (b.type === 'p') h += `<p class="bp${b.foot ? ' foot' : ''}" ${a}>${esc(b.text)}</p>`;
    else if (MA.hasMath(b)) h += eqHtml(b, a);
    else if (b.type === 'eq' || b.type === 'table' || b.type === 'fig') {
      const what = b.type === 'eq' ? 'Equation' : b.type === 'table' ? 'Table' : 'Figure';
      h += `<figure class="lib-fig ph" ${a} data-lazy="1" data-page="${b.page}"><div class="slot"><span class="lib-loading">${what}, page ${b.page}…</span></div><div class="cap">${b.label && b.label.toLowerCase().startsWith(what.toLowerCase()) ? esc(b.label) : what + (b.label ? ' ' + esc(b.label) : '')} · page ${b.page} · <a href="${api.pdfUrl(st.cur.paper.id)}#page=${b.page}" target="_blank" rel="noopener">open PDF</a></div>${noteHtml(b)}</figure>`;
    } else if (b.type === 'refs') refs.push(b);
  }
  if (refs.length) h += `<details class="lib-refs"><summary>References (${refs.length} block${refs.length > 1 ? 's' : ''})</summary>${refs.map(b => `<p class="refs" data-i="${b.i}">${esc(b.text)}</p>`).join('')}</details>`;
  return h;
}
// An equation with LaTeX shows KaTeX (loaded on first use) or, one tap away or if KaTeX fails, the image crop of the original page.
function ensureCrop(el, b, pageSize) {
  if (el._crop) return; el._crop = true;
  const slot = el.querySelector('.slot'), id = st.cur.paper.id;
  slot.innerHTML = `<span class="lib-loading">Equation, page ${b.page}…</span>`;
  cropBlock(id, b, pageSize).then(canvas => {
    if (!el.isConnected) return;
    if (canvas) { slot.replaceChildren(canvas); canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'Equation from page ' + b.page); }
    else slot.innerHTML = `<b>Equation on page ${b.page}</b>: could not be drawn here. <a href="${api.pdfUrl(id)}#page=${b.page}" target="_blank" rel="noopener">Page ${b.page}, open PDF</a>`;
  });
}
function setEqView(el, view, b, pageSize) {
  const m = el.querySelector('.eqmath'), s = el.querySelector('.slot'), t = el.querySelector('.eqtoggle');
  const go = v => {
    el.dataset.view = v; m.hidden = v !== 'math'; s.hidden = v !== 'crop';
    t.textContent = MA.toggleLabel(b, v); t.setAttribute('aria-pressed', v === 'crop' ? 'true' : 'false');
    t.title = v === 'math' ? 'Show the equation as it is printed in the PDF' : 'Show the rendered equation again';
    if (v === 'crop') ensureCrop(el, b, pageSize);
  };
  if (view === 'crop') return go('crop');
  go('math');
  if (el._mathDone) return;
  MA.loadKatex().then(k => {
    if (!el.isConnected) return;
    if (k && MA.renderInto(m, b.latex, k)) { el._mathDone = true; return; }
    el._mathBad = true; m.textContent = ''; go('crop');   // KaTeX missing or it refused this formula: the crop, and no toggle back to nothing
    t.hidden = true;
  });
}
function lazyMath(blocks, pageSize) {
  const byI = new Map(blocks.map(b => [b.i, b]));
  const io = new IntersectionObserver(entries => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      io.unobserve(en.target);
      const el = en.target, b = byI.get(+el.dataset.i);
      setEqView(el, MA.defaultView(b, MA.eqMode(ls), MA.includeUnchecked(ls)), b, pageSize);
    }
  }, { rootMargin: '600px 0px' });
  $('blocks').querySelectorAll('[data-math]').forEach(el => {
    io.observe(el);
    el.querySelector('.eqtoggle').addEventListener('click', () => { io.unobserve(el); const b = byI.get(+el.dataset.i); setEqView(el, el.dataset.view === 'math' ? 'crop' : 'math', b, pageSize); });
  });
  return io;
}
function setAllEq(mode, blocks, pageSize, incl) {
  MA.setEqMode(ls, mode); if (incl !== undefined) MA.setIncludeUnchecked(ls, incl); incl = MA.includeUnchecked(ls);
  document.querySelectorAll('.lib-eqswitch [data-eqmode]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.eqmode === mode)));
  const byI = new Map(blocks.map(b => [b.i, b]));
  $('blocks').querySelectorAll('[data-math]').forEach(el => { if (el._mathBad) return; const b = byI.get(+el.dataset.i); setEqView(el, MA.defaultView(b, mode, incl), b, pageSize); });
}
// Tap a figure or table crop: the same box re-rendered sharper, in a full-screen overlay (fit to width; "Full size" scrolls inside it,
// never the page); Esc, the close button or a tap on the backdrop closes it.
function openZoom(id, b, pageSize, small) {
  closeZoom();
  const o = document.createElement('div'); o.className = 'lib-zoom'; o.id = 'libZoom'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', (b.label || (b.type === 'table' ? 'Table' : 'Figure')) + ', page ' + b.page);
  o.innerHTML = `<div class="zbar"><span class="zt">${esc(b.label || (b.type === 'table' ? 'Table' : 'Figure'))} · page ${b.page}</span><button type="button" class="lib-btn sm" data-z="fit" aria-pressed="true">Fit</button><button type="button" class="lib-btn sm" data-z="full" aria-pressed="false">Full size</button><a class="lib-btn sm" href="${api.pdfUrl(id)}#page=${b.page}" target="_blank" rel="noopener">Open PDF</a><button type="button" class="lib-btn sm zx" data-z="close" aria-label="Close">Close</button></div><div class="zbody"><span class="lib-loading">Sharpening…</span></div>`;
  document.body.appendChild(o); document.documentElement.classList.add('lib-zoomed');
  const body = o.querySelector('.zbody');
  const show = c => { c.className = 'zc'; c.removeAttribute('role'); body.replaceChildren(c); };
  const copy = document.createElement('canvas'); copy.width = small.width; copy.height = small.height; copy.getContext('2d').drawImage(small, 0, 0); show(copy);   // instant: the crop already on screen
  cropBlockHi(id, b, pageSize).then(c => { if (c && o.isConnected) show(c); });
  const mode = m => { body.classList.toggle('full', m === 'full'); o.querySelectorAll('[data-z=fit],[data-z=full]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.z === m))); };
  o.addEventListener('click', e => { const z = e.target.closest && e.target.closest('[data-z]'); if (z) { if (z.dataset.z === 'close') closeZoom(); else mode(z.dataset.z); } else if (e.target === o || e.target === body) closeZoom(); });
  o._key = e => { if (e.key === 'Escape') closeZoom(); };
  document.addEventListener('keydown', o._key);
  o.querySelector('[data-z=close]').focus();
}
function closeZoom() {
  const o = $('libZoom'); if (!o) return;
  document.removeEventListener('keydown', o._key); o.remove(); document.documentElement.classList.remove('lib-zoomed');
}
function lazyCrops(blocks, pageSize) {
  const byI = new Map(blocks.map(b => [b.i, b]));
  const id = st.cur.paper.id;
  const io = new IntersectionObserver(entries => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      io.unobserve(en.target);
      const el = en.target, b = byI.get(+el.dataset.i);
      cropBlock(id, b, pageSize).then(canvas => {
        if (!el.isConnected) return;
        if (canvas) {
          el.classList.remove('ph'); el.querySelector('.slot').replaceChildren(canvas);
          const what = b.type === 'eq' ? 'Equation' : b.type === 'table' ? 'Table' : 'Figure';
          canvas.setAttribute('aria-label', what + ' from page ' + b.page);
          if (b.type !== 'eq') { canvas.setAttribute('role', 'button'); canvas.tabIndex = 0; canvas.title = 'Tap to enlarge'; canvas.classList.add('zoomable'); const open = () => openZoom(id, b, pageSize, canvas); canvas.addEventListener('click', open); canvas.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }); }
          else canvas.setAttribute('role', 'img');
        }
        else el.querySelector('.slot').innerHTML = `<b>${b.type === 'eq' ? 'Equation' : b.type === 'table' ? 'Table' : 'Figure'} on page ${b.page}</b>: could not be drawn here. <a href="${api.pdfUrl(id)}#page=${b.page}" target="_blank" rel="noopener">Page ${b.page}, open PDF</a>`;
      });
    }
  }, { rootMargin: '600px 0px' });
  $('blocks').querySelectorAll('[data-lazy]').forEach(el => io.observe(el));
  return io;
}

function notesHtml(p) {
  const rows = M.noteRows(p.notes);
  let h = '<h2 class="lib-h">What the desk found</h2>';
  h += rows.length ? rows.map(r => `<div class="lib-note"><div class="k">${esc(r.label)}</div><p>${esc(r.text)}</p></div>`).join('') : '<p class="lib-info">The desk has not read this paper yet. Nothing is assumed about it.</p>';
  if ((p.desk || []).length) h += '<h2 class="lib-h">Desk evidence</h2><div class="lib-links">' + p.desk.map(d => `<a href="/evidence.html#ev-${encodeURIComponent(d.id)}" target="_blank" rel="noopener">${esc(d.verdict || 'entry')}: ${esc(d.claim || d.id)}</a>`).join('') + '</div>';
  const les = M.lessonLinks(p.tags);
  if (les.length) h += '<h2 class="lib-h">Theory Lab lessons</h2><div class="lib-links">' + les.map(l => `<a href="${l.href}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('') + '</div>';
  return h;
}

function setView(v) {
  document.querySelectorAll('.lib-mode').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $('viewRead').hidden = v !== 'read'; $('viewPdf').hidden = v !== 'pdf'; $('viewNotes').hidden = v !== 'notes';
  const p = st.cur.paper;
  if (v === 'pdf' && !$('viewPdf').firstChild) {
    $('viewPdf').innerHTML = p.hasPdf
      ? `<p class="lib-info">The cleaned text is never exact: the original PDF is the source. <a href="${api.pdfUrl(p.id)}" target="_blank" rel="noopener">Open it in a new tab ↗</a></p><iframe class="lib-pdfframe" title="Original PDF" src="${api.pdfUrl(p.id)}"></iframe>`
      : '<div class="lib-empty">No PDF is held for this paper (abstract only).</div>';
  }
}

// progress glue
function scrollPctNow() {
  if (!st.cur || $('viewRead').hidden) return 0;
  const el = $('blocks'); const r = el.getBoundingClientRect();
  if (r.height < 40) return 0;
  return Math.min(1, Math.max(0, (window.innerHeight - r.top) / r.height));
}
function firstVisibleBlock() {
  if ($('viewRead').hidden) return null;
  for (const el of $('blocks').querySelectorAll('[data-i]')) if (el.getBoundingClientRect().bottom > 60) return +el.dataset.i;
  return 0;
}
function paintPct() { if (tracker) $('pctBadge').textContent = tracker.bestPercent() + '% read'; }
function onScroll() {
  if (rafPending || !tracker) return; rafPending = true;
  requestAnimationFrame(() => { rafPending = false; if (tracker) { tracker.onScroll(firstVisibleBlock()); paintPct(); } });
}
function startTracking(p, blocks) {
  tracker = P.createTracker({ storage: ls, id: p.id, readSec: P.readSecFor(p.chars), scrollPctNow });
  // fold in what the server knows (other device) before deciding where to resume
  const rem = P.recordFromServer(p.progress);
  if (rem) { pstore.write(P.mergeStores(pstore.read(), { [p.id]: rem })); tracker = P.createTracker({ storage: ls, id: p.id, readSec: P.readSecFor(p.chars), scrollPctNow }); }
  const pos = tracker.rec.pos;
  if (pos > 0 && tracker.rec.percent < 99) {
    const el = $('blocks').querySelector(`[data-i="${pos}"]`);
    if (el) { requestAnimationFrame(() => { el.scrollIntoView({ block: 'start' }); toast('Resumed where you left off (' + tracker.rec.percent + '%)'); }); }
  }
  let ticks = 0;
  tickTimer = setInterval(() => { tracker.tick(document.visibilityState === 'visible'); paintPct(); if (++ticks % 5 === 0) tracker.persist(); }, 1000);
  window.addEventListener('scroll', onScroll, { passive: true });
  paintPct();
  tracker.persist();
}

// listen glue
function ensureSpeaker() {
  if (speaker) return speaker;
  const synthOk = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  if (!synthOk) return null;
  const synth = window.speechSynthesis;
  const label = $('lLabel'), fill = $('lFill'), play = document.querySelector('[data-act="play"]');
  let lastEl = null;
  speaker = S.createSpeaker({
    synth, Utterance: SpeechSynthesisUtterance, storage: ls,
    onState: s => {
      play.textContent = s.playing ? '⏸' : '▶'; play.setAttribute('aria-label', s.playing ? 'Pause' : 'Play');
      label.textContent = !s.total ? 'Nothing to read' : s.idx < 0 ? `Ready · ${s.total} parts` : `Part ${s.idx + 1} of ${s.total}`;
      fill.style.width = s.idx < 0 || !s.total ? '0%' : Math.round(((s.idx + 1) / s.total) * 100) + '%';
    },
    onBlock: i => {
      if (lastEl) lastEl.classList.remove('lib-speaking'); lastEl = null;
      if (i == null || i < 0 || $('viewRead').hidden) return;
      const el = $('blocks').querySelector(`[data-i="${i}"]`); if (!el) return;
      el.classList.add('lib-speaking'); lastEl = el;
      const r = el.getBoundingClientRect();
      if (r.top < 60 || r.bottom > window.innerHeight - 140) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
  });
  const rate = $('lRate'); rate.value = String(speaker.rate);
  if (![...rate.options].some(o => o.value === rate.value)) rate.value = '1';
  const fillVoices = () => {
    const vs = synth.getVoices(); if (!vs.length) return;
    const { sorted, voice } = speaker.pickVoice(vs);
    const sel = $('lVoice'); sel.innerHTML = sorted.map(v => `<option value="${esc(v.name)}">${esc(v.name)} (${esc(v.lang)})</option>`).join('');
    if (voice) sel.value = voice.name;
    sel._voices = sorted;
  };
  fillVoices(); synth.addEventListener('voiceschanged', fillVoices);
  return speaker;
}
function loadListen(mode) {
  const id = st.cur.paper.id, key = id + ':' + mode;
  if (!listenCache[key]) listenCache[key] = api.listen(id, mode).then(d => ({ d, q: S.buildQueue(d, st.cur.blocks) })).catch(e => { delete listenCache[key]; throw e; });
  return listenCache[key];
}
function currentMode() { return ls.getItem(S.MODE_KEY) === 'full' ? 'full' : 'briefing'; }
async function openListen() {
  const sp = ensureSpeaker();
  if (!sp) { toast('This browser has no built-in voice. Use the MP3 briefing below.'); return; }
  const bar = $('listenBar'), mode = currentMode();
  bar.hidden = false; document.body.classList.add('lib-listen-open'); $('lMode').value = mode;
  const cached = listenCache[st.cur.paper.id + ':' + mode];
  // The queue is already prefetched when the paper opened, so setQueue + play stay inside this click handler.
  if (cached && cached.ready) { sp.setQueue(cached.ready.q); sp.play(); return; }
  $('lLabel').textContent = 'Preparing…';
  try { const r = await loadListen(mode); sp.setQueue(r.q); sp.play(); } catch (e) { fail(e); }
}

// audio glue
function renderAudio(p) {
  const box = $('audioBox'), b = (p.audio && p.audio.briefing) || { status: 'none' };
  const head = '<h3>MP3 briefing</h3><p>A short spoken summary built from the abstract, the desk\'s notes and the conclusion. It does not read the paper out word for word. Free voice, no paid service.</p>';
  if (b.status === 'ready') {
    box.innerHTML = head + `<audio id="aEl" controls preload="none" src="${A.audioUrl(p.id)}"></audio><p class="lib-info">${b.secs ? M.formatSecs(b.secs) + ' long' : ''}</p>`;
    bindAudio(p);
  } else if (b.status === 'working') {
    box.innerHTML = head + '<p class="lib-loading" role="status">Creating the briefing…</p>';
  } else {
    box.innerHTML = head + `${b.status === 'error' ? `<p class="lib-info" style="color:var(--red)">Last try failed: ${esc(b.error || 'unknown error')}</p>` : ''}<button type="button" class="lib-btn primary" id="mkAudio">Create audio briefing</button>`;
    $('mkAudio').onclick = async () => {
      $('mkAudio').disabled = true;
      try { await api.makeAudio(p.id); } catch (e) { $('mkAudio').disabled = false; return fail(e); }
      box.innerHTML = head + '<p class="lib-loading" role="status">Creating the briefing…</p>';
      watchAudio(p);
    };
  }
  if (b.status === 'working') watchAudio(p);
}
let watching = null;
async function watchAudio(p) {
  if (watching === p.id) return; watching = p.id;
  const r = await A.pollBriefing(() => api.audioStatus(p.id)).catch(e => ({ status: 'error', error: e.message }));
  watching = null;
  if (!st.cur || st.cur.paper.id !== p.id) return;
  p.audio = { briefing: r }; renderAudio(p);
}
function bindAudio(p) {
  audioEl = $('aEl');
  const pos = A.loadPos(ls, p.id);
  audioEl.addEventListener('loadedmetadata', () => { if (pos && pos < audioEl.duration - 3) audioEl.currentTime = pos; }, { once: true });
  let last = 0;
  audioEl.addEventListener('timeupdate', () => { const n = Date.now(); if (n - last > 4000) { last = n; A.savePos(ls, p.id, audioEl.currentTime, audioEl.duration); } });
  audioEl.addEventListener('pause', () => A.savePos(ls, p.id, audioEl.currentTime, audioEl.duration));
  audioEl.addEventListener('ended', () => A.savePos(ls, p.id, audioEl.duration, audioEl.duration));
  audioEl.addEventListener('play', () => {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    navigator.mediaSession.metadata = new MediaMetadata(A.mediaMeta(p));
    const seek = d => { audioEl.currentTime = Math.max(0, Math.min(audioEl.duration || 1e9, audioEl.currentTime + d)); };
    const set = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch { /* unsupported action */ } };
    set('play', () => audioEl.play()); set('pause', () => audioEl.pause());
    set('seekbackward', e => seek(-((e && e.seekOffset) || 15))); set('seekforward', e => seek((e && e.seekOffset) || 30));
    set('seekto', e => { if (e && e.seekTime != null) audioEl.currentTime = e.seekTime; });
  });
}

async function openPaper(id) {
  if (st.cur) stopReaderSide();
  $('listView').hidden = true; $('readerView').hidden = false; window.scrollTo(0, 0);
  $('readerHead').innerHTML = '<div class="lib-loading">Loading…</div>'; $('readerSummary').innerHTML = ''; $('blocks').innerHTML = ''; $('viewPdf').innerHTML = ''; $('audioBox').innerHTML = '';
  let d;
  try { d = await api.paper(id); } catch (e) { fail(e); location.hash = ''; return; }
  if (!location.hash.includes(encodeURIComponent(id))) return;
  const p = d.paper;
  st.cur = { paper: p, blocks: d.blocks || [], pageSize: d.pageSize || {} };
  document.title = p.title + ' — Library';
  $('readerHead').innerHTML = headHtml(p);
  $('readerSummary').innerHTML = SUM.inShortHtml(p) + SUM.helpHtml(p);
  $('viewNotes').innerHTML = notesHtml(p);
  if (d.blocks && d.blocks.length) {
    $('blocks').innerHTML = blocksHtml(d.blocks);
    lazyCrops(d.blocks, d.pageSize || {});
    lazyMath(d.blocks, d.pageSize || {});
    const sw = document.querySelector('.lib-eqswitch');
    if (sw) {
      sw.addEventListener('click', e => { const x = e.target.closest('[data-eqmode]'); if (x) setAllEq(x.dataset.eqmode, d.blocks, d.pageSize || {}); });
      sw.querySelector('#eqIncl').addEventListener('change', e => setAllEq(MA.eqMode(ls), d.blocks, d.pageSize || {}, e.target.checked));
    }
  } else {
    $('blocks').innerHTML = `<div class="lib-card"><p>${p.hasText ? 'The text of this paper could not be shown.' : 'Only the abstract and the desk\'s notes are held for this paper.'}</p><p class="lib-info">Switch to “Desk notes”${p.hasPdf ? ' or “Original PDF”' : ''}.</p></div>`;
  }
  setView(d.blocks && d.blocks.length ? 'read' : 'notes');
  renderAudio(p);
  startTracking(p, st.cur.blocks);
  // prefetch both listen scripts so the Listen click can queue everything synchronously
  for (const m of ['briefing', 'full']) loadListen(m).then(r => { listenCache[p.id + ':' + m].ready = r; }).catch(() => {});
  bindReader(p);
}
function bindReader(p) {
  const head = $('readerHead');
  head.querySelector('#listenBtn').onclick = openListen;
  $('readerSummary').querySelector('#caseBtn').onclick = async e => {
    const b = e.currentTarget; b.disabled = true;
    try {
      const r = await api.makeCase(p.id);
      const a = document.createElement('a'); a.className = 'lib-btn primary'; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Open the case ↗';
      a.href = '/desk-office.html?case=' + encodeURIComponent(r.caseId) + '#research/ideas'; b.replaceWith(a);
      toast('Case created from this paper');
    } catch (err) { b.disabled = false; fail(err); }
  };
  const tagRow = head.querySelector('#tagRow');
  const refreshTags = () => { tagRow.innerHTML = tagsHtml(p); };
  tagRow.addEventListener('click', async e => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    const key = b.dataset.rm; const prev = p.tags;
    p.tags = p.tags.filter(t => t.key !== key); refreshTags();
    try { await api.tags({ id: p.id, remove: [key] }); } catch (err) { p.tags = prev; refreshTags(); fail(err); }
  });
  tagRow.addEventListener('change', async e => {
    if (e.target.id !== 'addTag' || !e.target.value) return;
    const key = e.target.value, topic = st.topics.find(t => t.key === key); const prev = p.tags;
    p.tags = p.tags.concat({ key, label: topic ? topic.label : key, source: 'manual' }); refreshTags();
    try { await api.tags({ id: p.id, add: [key] }); } catch (err) { p.tags = prev; refreshTags(); fail(err); }
  });
  document.querySelector('.lib-modes').onclick = e => { const b = e.target.closest('.lib-mode'); if (b) setView(b.dataset.view); };
}

function bindListenBar() {
  $('listenBar').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || !speaker) return;
    const a = b.dataset.act;
    if (a === 'play') speaker.toggle(); else if (a === 'prev') speaker.skip(-1); else if (a === 'next') speaker.skip(1);
    else if (a === 'close') { speaker.stop(); $('listenBar').hidden = true; document.body.classList.remove('lib-listen-open'); }
  });
  $('lRate').addEventListener('change', e => speaker && speaker.setRate(e.target.value));
  $('lVoice').addEventListener('change', e => { if (!speaker) return; const v = ($('lVoice')._voices || []).find(x => x.name === e.target.value); speaker.setVoice(v); });
  $('lMode').addEventListener('change', e => {
    ls.setItem(S.MODE_KEY, e.target.value);
    if (!speaker || !st.cur) return;
    const c = listenCache[st.cur.paper.id + ':' + e.target.value];
    if (c && c.ready) { speaker.setQueue(c.ready.q); speaker.play(); }   // synchronous inside the change handler
    else loadListen(e.target.value).then(r => { speaker.setQueue(r.q); speaker.play(); }).catch(fail);
  });
  // Theory Lab rule: never leave speech running when the page goes away.
  const cancel = () => { try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch { /* ignore */ } };
  window.addEventListener('pagehide', cancel); window.addEventListener('beforeunload', cancel);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { if (tracker) tracker.persist(); sync.push({ keepalive: true }).catch(() => {}); } });
  window.addEventListener('pagehide', () => { if (tracker) tracker.persist(); });
}

function route() {
  const m = location.hash.match(/^#\/paper\/(.+)$/);
  if (m) openPaper(decodeURIComponent(m[1])); else showList();
}

async function init() {
  bindList(); bindListenBar();
  window.addEventListener('hashchange', route);
  $('cards').innerHTML = '<div class="lib-loading">Loading papers…</div>';
  try {
    const d = await api.papers();
    st.papers = d.papers || []; st.topics = d.topics || []; st.sources = d.sources || []; st.years = d.years || []; st.totals = d.totals || null;
    st.selected = M.restoreSelection(ls.getItem(SEL_KEY), st.topics.map(t => t.key));
    st.selSources = M.restoreSelection(ls.getItem(SRC_KEY), st.sources.map(t => t.key));
    st.selYears = M.restoreSelection(ls.getItem(YR_KEY), st.years.map(t => t.key));
    const sv = ls.getItem(SORT_KEY); if (M.sortKeyOk(sv) && sv !== 'match') st.sort = sv;
    sync.pullFromPapers(st.papers);
  } catch (e) { $('cards').innerHTML = `<div class="lib-empty">${esc(e.message || 'Could not load the library.')}</div>`; fail(e); return; }
  if (window.matchMedia('(max-width:640px)').matches && !st.selYears.length) { $('yrChips').hidden = true; $('yrToggle').setAttribute('aria-expanded', 'false'); }
  renderChips(); renderCards();
  api.readNext().then(d => { st.readNext = d; renderReadNext(); }).catch(() => {});
  api.todo().then(d => { st.todo = d; renderTodo(); }).catch(() => {});
  route();
}
// Reader text size (A-/A+): a scale applied to the paper text only, remembered in this browser.
{
  const STEPS = [0.85, 1, 1.15, 1.3, 1.5, 1.75]; let k = 1;
  try { const v = parseInt(localStorage.getItem('lib.fs.v1'), 10); if (v >= 0 && v < STEPS.length) k = v; } catch { /* storage may be blocked */ }
  const down = document.getElementById('fsDown'), up = document.getElementById('fsUp');
  const apply = () => {
    document.documentElement.style.setProperty('--lib-fs', String(STEPS[k]));
    if (down) down.disabled = k === 0; if (up) up.disabled = k === STEPS.length - 1;
    try { localStorage.setItem('lib.fs.v1', String(k)); } catch { /* ignore */ }
  };
  if (down) down.addEventListener('click', () => { if (k > 0) { k--; apply(); } });
  if (up) up.addEventListener('click', () => { if (k < STEPS.length - 1) { k++; apply(); } });
  apply();
}
init();
