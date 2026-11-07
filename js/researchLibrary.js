/**
 * The literature desk's reading backlog (plans/DESK_ANALYST_PIPELINE.md §9ai): what the repo already holds and what
 * the owner has collected, turned into a bounded queue the research pod reads in batches, so the paper library starts
 * from the desk's own shelf rather than from nothing.
 *
 *   reading list   education/papers/open/reading_list.csv: arXiv papers (the server fetches their abstracts in one
 *                  arXiv id_list call per batch)
 *   SSRN manifest  education/papers/manifest.csv: SSRN papers (abstracts through Crossref, DOI 10.2139/ssrn.<id>)
 *   151            education/151 Trading Strategies.md (Kakushadze & Serur 2018), split into its numbered strategies,
 *                  each with the repo's own screen from education/151_STRATEGIES_PROPOSALS.md
 *   QuantConnect   the public strategy library (github QuantConnect/Tutorials, "04 Strategy Library"): each strategy
 *                  folder's numbered HTML sections, with its references linked to the papers behind it
 *   uploads        PDFs the owner pushes from the laptop (scripts/research/push_papers.py); matched to their backlog
 *                  entry by the SSRN or arXiv id in the file name
 *
 * Plus the local search the dossiers run before the web, and the working-paper feed filter. Pure: parsing, queue
 * bookkeeping and ranking only. Tested in js/researchLibrary.test.mjs.
 */
import { record, arxivIdOf, doiOf, htmlToText, terms, relevance, findPaper, hash } from './literature.js';
import { slug } from './researchPod.js';

export const KINDS = ['paper', 'working paper', 'strategy'];
export const BOOK_151 = { title: '151 Trading Strategies', authors: ['Zura Kakushadze', 'Juan Andrés Serur'], year: 2018, doi: '10.2139/ssrn.3247865', url: 'https://doi.org/10.2139/ssrn.3247865' };
export const QC = {
  owner: 'QuantConnect', repo: 'Tutorials', branch: 'master', dir: '04 Strategy Library', label: 'QuantConnect strategy library',
  treeUrl: 'https://api.github.com/repos/QuantConnect/Tutorials/git/trees/master?recursive=1',
  flatUrl: 'https://data.jsdelivr.com/v1/package/gh/QuantConnect/Tutorials@master/flat',   // keyless fallback when GitHub's 60/h is spent
  rawBase: 'https://raw.githubusercontent.com/QuantConnect/Tutorials/master/',
};

// ── CSV ────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** RFC-4180-ish CSV → objects keyed by the header row (quoted fields, doubled quotes and newlines inside quotes). */
export function parseCsv(text) {
  const s = String(text ?? '').replace(/^﻿/, ''), rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.some(x => x.trim()));
  return head ? body.map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()]))) : [];
}
const authorsOf = s => String(s ?? '').split(/;\s*/).map(x => x.trim()).filter(Boolean);

/** A backlog item: what the queue needs to find and read one entry later. */
const item = (o) => ({ status: 'pending', tries: 0, ...o });

/** education/papers/open/reading_list.csv → arXiv backlog items. */
export function readingListItems(csv) {
  return parseCsv(csv).map(r => { const a = arxivIdOf(r.doi) ?? arxivIdOf(r.link) ?? arxivIdOf(String(r.file ?? '').split('_')[0]); if (!a || !r.title) return null;
    return item({ id: `arxiv:${a}`, via: 'arxiv', arxiv: a, kind: 'paper', source: 'reading list', title: r.title, authors: authorsOf(r.authors).slice(0, 8), year: Number(r.year) || null, topic: r.topic || null, file: r.file || null }); }).filter(Boolean);
}
/** education/papers/manifest.csv → SSRN backlog items (DOI 10.2139/ssrn.<id>; the open URL kept for full text). */
export function manifestItems(csv) {
  return parseCsv(csv).map(r => { const id = String(r.ssrn_id ?? '').match(/^\d{4,9}$/)?.[0]; if (!id) return null;
    const open = /^https?:\/\//.test(r.source ?? '') ? r.source : null;
    return item({ id: `doi:10.2139/ssrn.${id}`, via: 'ssrn', ssrn: id, doi: `10.2139/ssrn.${id}`, kind: 'paper', source: 'SSRN manifest', title: r.title || null, authors: authorsOf(r.authors).slice(0, 8), year: Number(r.year) || null, openUrl: open, file: r.file || null, held: r.status === 'downloaded' }); }).filter(Boolean);
}

// ── 151 Trading Strategies ─────────────────────────────────────────────────────────────────────────────────────────
/**
 * The book's numbered strategies: every "## N.M Title" (and "### N.M.k Title" sub-strategy) after the contents, its
 * text up to the next numbered heading or chapter. "Generalities" sections are not strategies and are skipped.
 */
export function parse151(md, { maxChars = 6000 } = {}) {
  const lines = String(md ?? '').split('\n'), out = [];
  let chapter = null, cur = null, started = false;
  const close = () => { if (cur) { cur.text = cur.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, cur.whole ? 3000 : maxChars); delete cur.lines; delete cur.whole; if (!/^generalities$/i.test(cur.name) && cur.text.length > 80) out.push(cur); cur = null; } };
  for (const l of lines) {
    const ch = l.match(/^# (\d{1,2}) ([A-Z][A-Za-z()&,' -]{2,60})$/);
    if (ch && (chapter == null ? ch[1] === '1' : Number(ch[1]) === chapter.n + 1)) {
      if (ch[1] === '1') started = true; close();
      chapter = { n: Number(ch[1]), name: ch[2].trim() };
      // a chapter with no numbered sections (20 Infrastructure) is one strategy
      if (chapter.n > 1) cur = { num: `${chapter.n}`, name: chapter.name, chapter: chapter.n, chapterName: chapter.name, lines: [], whole: true };
      continue; }
    if (/^#+\s*(References|Bibliography|Acknowledg)/i.test(l)) { close(); started = false; continue; }
    const h = started && l.match(/^#{2,3} (\d{1,2}\.\d{1,2}(?:\.\d{1,2})?) (.{2,120})$/);
    if (h && chapter && h[1].startsWith(`${chapter.n}.`)) { if (cur?.whole) cur = null; close(); cur = { num: h[1], name: h[2].replace(/[“”"]/g, '').trim(), chapter: chapter.n, chapterName: chapter.name, lines: [] }; continue; }
    if (cur) cur.lines.push(l);
  }
  close();
  return out;
}
/**
 * The repo's screen of one strategy (education/151_STRATEGIES_PROPOSALS.md, the chapter table): the sentence of its
 * chapter's row that names the strategy number, and the verdict word in it; else the chapter's blanket verdict.
 */
export function screen151(proposalsMd, num) {
  const ch = num.split('.')[0], row = String(proposalsMd ?? '').split('\n').find(l => new RegExp(`^\\|\\s*${ch}[ –-]`).test(l) || new RegExp(`^\\|\\s*\\d+[–-]\\d+ `).test(l) && (() => { const m = l.match(/^\|\s*(\d+)[–-](\d+)/); return m && +ch >= +m[1] && +ch <= +m[2]; })());
  if (!row) return { verdict: null, note: null };
  const cells = row.split('|').map(c => c.trim()).filter(Boolean), text = cells.at(-1) ?? '';
  const inRange = s => [...s.matchAll(/(\d+\.\d+(?:\.\d+)?)(?:\s*[–-]\s*(\d+\.\d+))?/g)].some(m => {
    if (m[1] === num || num.startsWith(`${m[1]}.`)) return true;
    if (!m[2]) return false; const [a, b, x] = [m[1], m[2], num].map(v => v.split('.').map(Number)); return x[0] === a[0] && x[1] >= a[1] && x[1] <= b[1]; });
  const sentences = text.replace(/\*\*/g, '').split(/(?<=\.)\s+(?=[A-Z0-9])|;\s+/);
  const hit = sentences.find(inRange);
  const word = s => (/PROPOSE/.test(s) ? 'PROPOSE' : /NEEDS INSIGHT/.test(s) ? 'NEEDS INSIGHT' : /already built/i.test(s) ? 'BUILT' : /\bNO\b/.test(s) ? 'NO' : null);
  if (hit) return { verdict: word(hit), note: hit.slice(0, 300) };
  return { verdict: /^\**NO\s*[—-]\s*all/i.test(text.replace(/\*\*/g, '')) ? 'NO' : null, note: text.replace(/\*\*/g, '').slice(0, 300) };
}
/** 151 strategies → backlog items (the text stays in the repo file; the server re-reads it when the item is read). */
export function items151(md, proposalsMd) {
  return parse151(md).map(s => { const sc = screen151(proposalsMd, s.num);
    return item({ id: `151:${s.num}`, via: '151', kind: 'strategy', source: '151 Trading Strategies (Kakushadze & Serur 2018)', title: `${s.num} ${s.name}`, chapter: `${s.chapter} ${s.chapterName}`, year: 2018, screen: sc }); });
}
/** One 151 strategy as a library record (kind strategy, citing the book), with the text for the reader. */
export function record151(md, proposalsMd, num) {
  const s = parse151(md).find(x => x.num === num); if (!s) return null;
  const sc = screen151(proposalsMd, num);
  const r = { ...record({ source: '151', title: `${s.num} ${s.name} (151 Trading Strategies)`, authors: BOOK_151.authors, year: BOOK_151.year, venue: `151 Trading Strategies, ch. ${s.chapter} ${s.chapterName}`, abstract: s.text.slice(0, 1200), url: BOOK_151.url }),
    id: `151:${num}`, kind: 'strategy', sourceLabel: '151 Trading Strategies (Kakushadze & Serur 2018)', screen: sc, cites: [`doi:${BOOK_151.doi}`] };
  r.keys = [r.id];
  return { rec: r, text: `${s.chapterName} — ${s.num} ${s.name}\n${sc.verdict ? `The repo's screen (education/151_STRATEGIES_PROPOSALS.md): ${sc.verdict}. ${sc.note ?? ''}\n` : ''}\n${s.text}` };
}

// ── QuantConnect strategy library ──────────────────────────────────────────────────────────────────────────────────
/**
 * The repo listing → strategies: one per folder under "04 Strategy Library" with numbered .html sections, in section
 * order. Takes GitHub's tree reply (git/trees/master?recursive=1: { tree: [{ path, type }] }) or jsDelivr's flat
 * listing ({ files: [{ name: '/path' }] }). The index folder (00) and folders without HTML are dropped.
 */
export function parseQcTree(json) {
  const by = new Map();
  const entries = Array.isArray(json?.tree) ? json.tree : (json?.files ?? []).map(f => ({ type: 'blob', path: String(f?.name ?? '').replace(/^\//, '') }));
  for (const e of entries) {
    if (e?.type !== 'blob') continue;
    const m = String(e.path).match(/^04 Strategy Library\/((\d+) ([^/]+))\/((\d+) ([^/]+))\.html$/); if (!m || m[2] === '00') continue;
    const s = by.get(m[1]) ?? { dir: `${QC.dir}/${m[1]}`, num: Number(m[2]), title: m[3].trim(), sections: [] };
    s.sections.push({ n: Number(m[5]), name: m[6].trim(), path: e.path }); by.set(m[1], s);
  }
  return [...by.values()].map(s => ({ ...s, id: `qc:${slug(s.title)}`, sections: s.sections.sort((a, b) => a.n - b.n) })).sort((a, b) => a.num - b.num);
}
export const qcRawUrl = path => QC.rawBase + String(path).split('/').map(encodeURIComponent).join('/');
export const qcPageUrl = dir => `https://github.com/${QC.owner}/${QC.repo}/tree/${QC.branch}/${String(dir).split('/').map(encodeURIComponent).join('/')}`;
/** The sections worth reading (abstract, introduction, method, results, summary, conclusion, references), not the code. */
export const QC_READ = /abstract|introduction|method|theory|result|summary|conclusion|reference|strategy|framework|part /i;
export const qcSectionsToRead = s => s.sections.filter(x => QC_READ.test(x.name) && !/algorithm|code|backtest/i.test(x.name)).slice(0, 7);
/** A References section → [{ text, url, doi, arxiv, ssrn }]. */
export function qcReferences(html) {
  return [...String(html ?? '').matchAll(/<li[^>]*>([\s\S]*?)(?=<li[^>]*>|<\/ol>|<\/ul>|$)/gi)].map(m => {
    const raw = m[1], url = (raw.match(/href="([^"]+)"/i) ?? [])[1] ?? null, text = htmlToText(raw).replace(/\s*Online Copy\s*/gi, ' ').replace(/\s+/g, ' ').trim();
    if (text.length < 8) return null;
    const ssrn = (`${url ?? ''} ${text}`.match(/ssrn\.com\/(?:abstract=|sol3\/papers\.cfm\?abstract_id=)(\d+)/i) ?? [])[1] ?? null;
    return { text: text.slice(0, 300), url, doi: doiOf(url ?? '') ?? doiOf(text), arxiv: arxivIdOf(url ?? '') , ssrn };
  }).filter(Boolean).slice(0, 20);
}
/** A strategy folder's fetched sections ({ name: html }) → a library record (kind strategy) and the text for the reader. */
export function qcRecord(s, html) {
  const sec = Object.entries(html ?? {});
  const refs = qcReferences(sec.find(([n]) => /reference/i.test(n))?.[1] ?? '');
  const body = sec.filter(([n]) => !/reference/i.test(n)).map(([n, h]) => `## ${n}\n${htmlToText(h)}`).join('\n\n');
  const abs = htmlToText(sec.find(([n]) => /abstract|introduction/i.test(n))?.[1] ?? '').slice(0, 1500) || body.slice(0, 1200);
  const r = { ...record({ source: 'qc', title: `${s.title} (QuantConnect)`, venue: QC.label, abstract: abs, url: qcPageUrl(s.dir) }), id: s.id, kind: 'strategy', sourceLabel: QC.label,
    references: refs, cites: refs.map(x => (x.arxiv ? `arxiv:${x.arxiv}` : x.doi ? `doi:${x.doi}` : x.ssrn ? `doi:10.2139/ssrn.${x.ssrn}` : null)).filter(Boolean) };
  r.keys = [r.id];
  return { rec: r, text: `${s.title}\n\n${body}\n\n## References\n${refs.map(x => `- ${x.text}${x.url ? ` <${x.url}>` : ''}`).join('\n')}` };
}
export const qcItems = strategies => strategies.map(s => item({ id: s.id, via: 'qc', kind: 'strategy', source: QC.label, title: s.title, dir: s.dir, sections: qcSectionsToRead(s).map(x => ({ name: x.name, path: x.path })) }));

// ── uploads ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** An uploaded file name → which backlog entry it is: "<ssrn id>_anything.pdf" or an arXiv id ("1803.07152v1_x.pdf"). */
export function matchUpload(name) {
  const base = String(name ?? '').split(/[\\/]/).pop().replace(/\.pdf$/i, '');
  const a = arxivIdOf(base.split('_')[0]); if (a && /^\d{4}\.\d{4,5}/.test(base)) return { id: `arxiv:${a}`, arxiv: a, via: 'arxiv' };
  // SSRN's own download names too ("SSRN-id2293684.pdf", "ssrn-2293684.pdf"), so a phone upload needs no renaming
  const s = base.match(/^(\d{5,9})(?:[_\- ]|$)/) ?? base.match(/^ssrn[-_ ]?(?:id)?(\d{5,9})(?:\D|$)/i); if (s) return { id: `doi:10.2139/ssrn.${s[1]}`, ssrn: s[1], doi: `10.2139/ssrn.${s[1]}`, via: 'ssrn' };
  return { id: `upload:${hash(base.toLowerCase())}`, via: 'upload', name: base };
}
/**
 * Is an upload already held in full text? Owner, 2026-11-07: a bulk upload skips what the library already has and moves on.
 * Held = the same backlog id was already uploaded, the same file bytes (sha256) were uploaded under any name, or the paper
 * library has that id read from full text (a PDF or arXiv HTML). A paper read only from its abstract is NOT held: the
 * upload is how it gets its full text. Returns the reason in words, or null.
 */
export const FULL_TEXT_FROM = new Set(['pdf', 'arxiv-html', 'html', 'upload', 'full']);
export function alreadyHeld({ id, sha = null } = {}, queueItems = [], papers = []) {
  for (const x of queueItems ?? []) {
    if (!x?.upload) continue;
    if (sha && x.upload.sha === sha) return `the same file was uploaded before${x.upload.name ? ` (${x.upload.name})` : ''}`;
    if (id && x.id === id) return `already uploaded${x.upload.name ? ` as ${x.upload.name}` : ''}`;
  }
  for (const p of papers ?? []) {
    if (sha && p.uploaded?.sha === sha) return 'the same file is already in the library';
    if (id && p.id === id && (p.uploaded || FULL_TEXT_FROM.has(p.readFrom))) return `already in the library, read from ${p.uploaded ? 'an upload' : p.readFrom}`;
  }
  return null;
}
/**
 * Duplicate uploads: unmatched "upload:<hash>" queue items whose file is also held under a matched id (same file name,
 * or the same sha256). They arose when SSRN's own names ("ssrn-2089463.pdf") did not match yet (2026-11-07) and the
 * owner uploaded the batch again after the fix. Returns { queue, removed: [ids] }; only unread duplicates are removed.
 */
export function dedupeUploads(queue) {
  const items = queue?.items ?? [], matched = items.filter(x => x.upload && !String(x.id).startsWith('upload:'));
  const names = new Set(matched.map(x => String(x.upload.name ?? '').toLowerCase()).filter(Boolean)), shas = new Set(matched.map(x => x.upload.sha).filter(Boolean));
  const dup = x => x.upload && String(x.id).startsWith('upload:') && x.status !== 'done' && (names.has(String(x.upload.name ?? '').toLowerCase()) || (x.upload.sha && shas.has(x.upload.sha)) || names.has(String(matchUpload(x.upload.name ?? '').via === 'upload' ? '' : x.upload.name ?? '').toLowerCase()));
  const removed = items.filter(dup).map(x => x.id);
  return { queue: { ...queue, items: items.filter(x => !dup(x)) }, removed };
}
/** The R2 key an uploaded PDF (and its extracted text) is stored under: private, never served. */
export const uploadKey = (id, ext = 'pdf') => `research/papers/${String(id).replace(/[^a-z0-9.:_-]+/gi, '_').replace(/:/g, '_')}.${ext}`;

// ── the queue ──────────────────────────────────────────────────────────────────────────────────────────────────────
export const QUEUE_MAX = 800;
/** Add items not already queued (by id) and not already read into the library. Returns { queue, added }. */
export function seedQueue(queue, items, lib = []) {
  const q = { items: [...(queue?.items ?? [])], seeded: { ...(queue?.seeded ?? {}) } }, have = new Set(q.items.map(x => x.id));
  let added = 0;
  for (const it of items ?? []) {
    if (!it?.id || have.has(it.id)) continue;
    const held = findPaper(lib, { id: it.id, keys: [it.id, ...(it.arxiv ? [`arxiv:${it.arxiv}`] : []), ...(it.ssrn ? [`ssrn:${it.ssrn}`] : [])] });
    q.items.push(held?.notes ? { ...it, status: 'done', doneAt: held.notesAt ?? null } : it); have.add(it.id); added++;
  }
  q.items = q.items.slice(0, QUEUE_MAX);
  return { queue: q, added };
}
/** Merge an update into a queued item (an upload arriving for an entry that is already queued, say). */
export function upsertItem(queue, it) {
  const q = { items: [...(queue?.items ?? [])], seeded: { ...(queue?.seeded ?? {}) } }, i = q.items.findIndex(x => x.id === it.id);
  if (i >= 0) q.items[i] = { ...q.items[i], ...it }; else q.items.unshift({ status: 'pending', tries: 0, ...it });
  q.items = q.items.slice(0, QUEUE_MAX);
  return q;
}
const ORDER = { upload: 0, ssrn: 1, arxiv: 2, qc: 3, '151': 4 };
/**
 * The next items to read: pending, fewer than `maxTries` failed attempts; uploads first (their full text is the
 * owner's own copy), then the SSRN and arXiv papers, the QuantConnect strategies, then the 151 (which the repo has
 * already screened). Strategies the repo's screen rejected outright go last.
 */
export function nextItems(queue, { n = 8, via = null, maxTries = 2 } = {}) {
  return (queue?.items ?? []).filter(x => x.status === 'pending' && (x.tries ?? 0) < maxTries && (!via || (Array.isArray(via) ? via.includes(x.via) : x.via === via)))
    .map((x, i) => ({ x, i, k: (x.upload ? 0 : ORDER[x.via] ?? 5) + (x.screen?.verdict === 'NO' ? 1 : 0) })).sort((a, b) => a.k - b.k || a.i - b.i).slice(0, n).map(o => o.x);
}
/** Mark items done or failed (a failure counts a try; two tries and it is left alone). */
export function markItems(queue, ids, status, { error = null, at = new Date().toISOString() } = {}) {
  const want = new Set(ids);
  return { ...queue, items: (queue?.items ?? []).map(x => (!want.has(x.id) ? x : status === 'done' ? { ...x, status: 'done', doneAt: at, error: null }
    : { ...x, tries: (x.tries ?? 0) + 1, status: (x.tries ?? 0) + 1 >= 2 ? 'failed' : 'pending', error: String(error ?? 'failed').slice(0, 200) })) };
}
/** Counts for the page: by source and status. */
export function queueSummary(queue) {
  const by = {}, items = queue?.items ?? [];
  for (const x of items) { const b = by[x.source] ??= { pending: 0, done: 0, failed: 0 }; b[x.status] = (b[x.status] ?? 0) + 1; }
  return { total: items.length, pending: items.filter(x => x.status === 'pending').length, done: items.filter(x => x.status === 'done').length, failed: items.filter(x => x.status === 'failed').length, bySource: by, seeded: queue?.seeded ?? {} };
}
/** Plan the reader calls for a batch: uploads one per call, strategies four per call, abstracts eight per call; at most `calls`. */
export function batchPlan(items, { calls = 6 } = {}) {
  const up = items.filter(x => x.upload), st = items.filter(x => !x.upload && x.kind === 'strategy'), ab = items.filter(x => !x.upload && x.kind !== 'strategy');
  const chunks = (a, k) => Array.from({ length: Math.ceil(a.length / k) }, (_, i) => a.slice(i * k, i * k + k));
  return [...up.map(x => [x]), ...chunks(st, 4), ...chunks(ab, 8)].slice(0, calls);
}

// ── the local library is searched first ────────────────────────────────────────────────────────────────────────────
const entryText = p => `${p.title ?? ''} ${p.abstract ?? ''} ${p.notes?.claim ?? ''} ${p.notes?.mechanism ?? ''} ${p.topic ?? ''} ${p.chapter ?? ''}`;
/**
 * Local search: the paper library (read entries, any kind) and the unread backlog, by keyword overlap with the
 * queries (title counts double). Returns { read: library entries with notes, unread: queue items }, best first.
 */
export function searchLocal(lib, queue, queries, { max = 10, min = 0.25, kinds = null } = {}) {
  const qs = (Array.isArray(queries) ? queries : [queries]).filter(Boolean);
  const score = p => Math.max(0, ...qs.map(q => relevance({ title: p.title, abstract: entryText(p) }, q)));
  const ok = p => !kinds || kinds.includes(p.kind ?? 'paper');
  const read = (lib ?? []).filter(p => p.notes?.claim && ok(p)).map(p => ({ p, s: score(p) })).filter(o => o.s >= min).sort((a, b) => b.s - a.s).slice(0, max).map(o => ({ ...o.p, relevance: o.s }));
  const ids = new Set(read.map(p => p.id));
  const unread = (queue?.items ?? []).filter(x => x.status === 'pending' && !ids.has(x.id) && ok(x)).map(x => ({ x, s: score(x) })).filter(o => o.s >= min).sort((a, b) => b.s - a.s).slice(0, max).map(o => ({ ...o.x, relevance: o.s }));
  return { read, unread };
}

/** Feeds that mix papers with other publications keep only the matching links (e.g. the BoE's /working-paper/). */
/** Working-paper feed items (sources with paper: true, read by js/researchPod.js) → records of kind 'working paper'. */
export function paperFeedRecords(reads, sources) {
  return (sources ?? []).filter(s => s.paper).flatMap(s => (reads?.[s.id]?.items ?? []).map(i => {
    const pdf = /\.pdf(?:$|[?#])/i.test(i.link ?? '') ? i.link : null;
    const r = record({ source: s.id, title: i.title, abstract: i.summary, url: i.link, pdfUrl: pdf, year: (String(i.date ?? '').match(/(19|20)\d{2}/) ?? [])[0], venue: s.label });
    return { ...r, kind: 'working paper', sourceLabel: s.label, oa: true };
  })).filter(r => r.title);
}
/** A library entry's kind (entries from before kinds existed are papers). */
export const kindOf = p => (KINDS.includes(p?.kind) ? p.kind : 'paper');
