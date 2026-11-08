/**
 * Paper Library server side (plans/PAPER_LIBRARY.md): the handlers behind /api/library/*.
 *
 * Framework-free and injectable: createLibraryApi(deps) returns async handlers that take a plain request
 * ({ query, body, headers }) and return { status, json } or { status, headers, body } (a Buffer, for PDF / MP3).
 * server.js only mounts them behind the login. No model call and no paid API is made here: tagging, search, listen
 * scripts, desk links, read-next and cases are rule-based (js/paperCatalog.js); the MP3 uses a FREE provider only
 * (js/paperTts.js; PAPER_TTS_PROVIDER=none switches it off). No paper text is stored in git; R2 holds PDFs, text,
 * block caches and audio, KV holds one small state document (KV_KEY below).
 *
 * deps: {
 *   kv:{ get(k), getStrict(k), put(k,v) }              r2:{ ok(), getBuffer(k), putBuffer(k,buf,type) }
 *   keys:{ queue, papers }                              KV keys of the reading queue and the read papers
 *   uploadKey(id, ext)                                  R2 key of an upload (js/researchLibrary.js uploadKey)
 *   extractPages(buf)                                   positioned pages (js/paperPages.js, worker thread)
 *   tts:{ getProvider(), makeMp3(chunks, provider, opts) }   js/paperTts.js (mock it in tests)
 *   readTodoMd()                                        text of education/papers/SSRN_DOWNLOAD_LIST.md
 *   lessonFiles()                                       file names in theory-lab/lessons
 *   cases:{ read() -> { cases }, put(case) }            research cases (server: _rcStore / locked _rcPut)
 *   textFallback(id)                                    uploaded text kept in memory when R2 is not configured (optional)
 *   now(), log }
 */
import { buildBlocks, plainText, conclusion, abstractOf } from './paperText.js';
import { flatTextToPages } from './paperPages.js';
import { speechSentences, briefingScript, chunkForTts, estimateSecs, toSentences } from './paperAudio.js';
import {
  joinCatalog, topicCounts, sourceCounts, SOURCES, TOPIC_KEYS, TOPICS, buildIndex, addDoc, search as indexSearch, setDocTags,
  theoryLinks, parseTodoList, heldSsrnIds, readNext, caseFromPaper, caseForPaper,
} from './paperCatalog.js';

export const KV_KEY = 'library_state_v1';
export const MAX_PROGRESS = 3000;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:%@+-]{0,159}$/;
const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const reply = (status, json, headers) => ({ status, json, ...(headers ? { headers } : {}) });
const bad = (status, error) => reply(status, { ok: false, error });

// ── HTTP Range (PDF and MP3) ───────────────────────────────────────────────────────────────────────────────────
/** One byte range of `buf`: 200 with Accept-Ranges when no Range header, 206 with Content-Range, 416 when unsatisfiable. */
export function rangeResponse(buf, rangeHeader, contentType, extra = {}) {
  const size = buf.length, base = { 'Content-Type': contentType, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store', ...extra };
  const m = typeof rangeHeader === 'string' ? rangeHeader.match(/^bytes=(\d*)-(\d*)$/i) : null;   // a single range only
  if (!m || (m[1] === '' && m[2] === '')) return { status: 200, headers: { ...base, 'Content-Length': String(size) }, body: buf };
  let start, end;
  if (m[1] === '') { const n = Number(m[2]); if (!n) return { status: 416, headers: { ...base, 'Content-Range': `bytes */${size}` }, body: Buffer.alloc(0) }; start = Math.max(0, size - n); end = size - 1; }
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (!(start <= end) || start >= size) return { status: 416, headers: { ...base, 'Content-Range': `bytes */${size}` }, body: Buffer.alloc(0) };
  return { status: 206, headers: { ...base, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) }, body: buf.subarray(start, end + 1) };
}

// ── progress: the Theory Lab's semantics (js/progressSync.js), per paper ───────────────────────────────────────
// Entry { pct 0-100, pos (reader position: a block index), at (ms), done }. Merge = high-water marks, exactly as the Theory
// Lab merges a lesson: pct is the furthest reached, done is never cleared, `at` the latest; pos follows the newer entry.
const num = (v, lo, hi, round = true) => { const n = Number(v); if (!Number.isFinite(n)) return lo; const c = Math.min(hi, Math.max(lo, n)); return round ? Math.round(c) : c; };
const tsOk = (v, fallback) => { const n = Number(v); return Number.isFinite(n) && n > Date.UTC(2020, 0, 1) && n <= Date.now() + 86_400_000 ? Math.round(n) : fallback; };
export function cleanProgressEntry(r, now = Date.now()) {
  return { pct: num(r.pct, 0, 100), pos: num(r.pos, 0, 10_000_000), at: tsOk(r.at, now), done: r.done === true || num(r.pct, 0, 100) >= 100 && r.done !== false };
}
export function mergeProgressEntry(a, b) {
  if (!a) return { ...b }; if (!b) return { ...a };
  const newer = (a.at ?? 0) >= (b.at ?? 0) ? a : b;
  return { pct: Math.max(a.pct || 0, b.pct || 0), pos: newer.pos || 0, at: Math.max(a.at || 0, b.at || 0), done: !!(a.done || b.done) };
}
export function mergeProgress(local, remote) {
  const l = isPlain(local) ? local : {}, r = isPlain(remote) ? remote : {}, out = {};
  for (const id of new Set([...Object.keys(l), ...Object.keys(r)])) out[id] = mergeProgressEntry(isPlain(l[id]) ? l[id] : null, isPlain(r[id]) ? r[id] : null);
  return out;
}
/** Body -> { ok, value: map } for POST { id, pct, pos, done } or a whole-map sync { progress: { [id]: entry } }. */
export function progressFromBody(body, now = Date.now()) {
  if (!isPlain(body)) return { ok: false, error: 'body must be a JSON object' };
  const map = {};
  if (body.progress != null) {
    if (!isPlain(body.progress)) return { ok: false, error: 'progress must be an object' };
    const ids = Object.keys(body.progress); if (ids.length > MAX_PROGRESS) return { ok: false, error: 'too many papers' };
    for (const id of ids) { if (!ID_RE.test(id)) return { ok: false, error: 'bad paper id' }; if (!isPlain(body.progress[id])) return { ok: false, error: 'entry must be an object' }; map[id] = cleanProgressEntry(body.progress[id], now); }
  }
  if (body.id != null) {
    if (typeof body.id !== 'string' || !ID_RE.test(body.id)) return { ok: false, error: 'bad paper id' };
    map[body.id] = mergeProgressEntry(map[body.id] ?? null, cleanProgressEntry({ ...body, at: now }, now));
  }
  if (!Object.keys(map).length) return { ok: false, error: 'send { id, pct, pos, done } or { progress: { id: {...} } }' };
  return { ok: true, value: map };
}

// ── tag overrides ──────────────────────────────────────────────────────────────────────────────────────────────
export function mergeTagOverride(cur, { add = [], remove = [] } = {}) {
  const keys = a => (Array.isArray(a) ? a : []).filter(k => TOPIC_KEYS.includes(k));
  const A = new Set(cur?.add ?? []), R = new Set(cur?.remove ?? []);
  for (const k of keys(add)) { A.add(k); R.delete(k); }
  for (const k of keys(remove)) { R.add(k); A.delete(k); }
  return { add: [...A], remove: [...R] };
}

// ── the factory ────────────────────────────────────────────────────────────────────────────────────────────────
export function createLibraryApi(deps) {
  const { kv, r2, keys, uploadKey, extractPages, tts, readTodoMd, lessonFiles, cases } = deps;
  const now = deps.now ?? (() => Date.now()), log = deps.log ?? console;
  const jget = async (k, d) => { const raw = await kv.get(k); if (!raw) return d; try { return JSON.parse(raw); } catch { return d; } };

  // state document (progress, tag overrides, audio job state), writes serialised
  let chain = Promise.resolve();
  const locked = fn => { const p = chain.then(fn); chain = p.catch(() => {}); return p; };
  const readState = async () => { const raw = await kv.getStrict(KV_KEY); let s = null; try { s = raw ? JSON.parse(raw) : null; } catch { s = null; } return { v: 1, progress: {}, tags: {}, audio: {}, ...(isPlain(s) ? s : {}) }; };
  const mutate = fn => locked(async () => { const s = await readState(); const out = await fn(s); await kv.put(KV_KEY, JSON.stringify(s)); return out; });

  // caches: blocks (memory + R2), search index, catalog
  const blocksMem = new Map(), inflight = new Map(), BLOCKS_MEM_MAX = 8;
  const blocksKey = id => uploadKey(id, 'blocks.json');
  const audioKey = id => uploadKey(id, 'briefing.mp3').replace('research/papers/', 'research/audio/');
  const audioMem = new Map();   // when R2 is not configured (lost on restart)
  const jobs = new Map();       // id -> { startedAt }
  let catalogCache = null, firstTexts = new Map(), index = null, indexDocs = new Set(), indexBuilding = null;

  async function loadQueue() { return (await jget(keys.queue, { items: [] })).items ?? []; }
  async function loadPapers() { const p = await jget(keys.papers, []); return Array.isArray(p) ? p : []; }

  async function textOf(id) {
    try { const b = r2.ok() ? await r2.getBuffer(uploadKey(id, 'txt')) : null; if (b) return b.toString('utf8'); } catch { /* fall through */ }
    return deps.textFallback?.(id) ?? null;
  }

  async function catalog({ fresh = false } = {}) {
    if (!fresh && catalogCache && now() - catalogCache.at < 30_000) return catalogCache;
    const [papers, queueItems, st] = await Promise.all([loadPapers(), loadQueue(), readState()]);
    const have = new Set(papers.map(p => p.id));
    const uploads = {};
    for (const it of queueItems) {
      if (!it?.upload) continue;
      const u = { chars: it.upload.chars ?? null, hasPdf: !!it.upload.stored && it.upload.stored !== 'memory', sha: it.upload.sha };
      if (!have.has(it.id)) {   // an unread upload: its first text gives it a title and tags (cached per id)
        if (!firstTexts.has(it.id)) { const t = await textOf(it.id).catch(() => null); firstTexts.set(it.id, t ? t.slice(0, 6000) : ''); }
        u.firstText = firstTexts.get(it.id);
      }
      uploads[it.id] = u;
    }
    for (const p of papers) if (p.uploaded) uploads[p.id] = { ...(uploads[p.id] ?? {}), chars: p.uploaded.chars ?? null, hasPdf: p.uploaded.stored === 'r2', sha: p.uploaded.sha };
    const list = joinCatalog({ papers, queueItems, uploads, tagOverrides: st.tags, progress: st.progress, audio: st.audio });
    catalogCache = { at: now(), list, papers, queueItems, state: st, byId: new Map(list.map(p => [p.id, p])) };
    return catalogCache;
  }
  const dropCatalog = () => { catalogCache = null; };
  const theoryOf = p => theoryLinks(p.tags, lessonFiles?.() ?? null);

  // ── blocks: R2 cache, built in the worker thread on first open ──
  async function getBlocks(id, paperHasPdf) {
    if (blocksMem.has(id)) return blocksMem.get(id);
    if (inflight.has(id)) return inflight.get(id);
    const job = (async () => {
      if (r2.ok()) {
        const c = await r2.getBuffer(blocksKey(id)).catch(() => null);
        if (c) { try { const j = JSON.parse(c.toString('utf8')); if (j?.v === 1 && Array.isArray(j.blocks)) return j; } catch { /* rebuild */ } }
      }
      let pages = null, source = 'flat';
      if (r2.ok() && paperHasPdf !== false) {
        const pdf = await r2.getBuffer(uploadKey(id, 'pdf')).catch(() => null);
        if (pdf) { try { const ex = await extractPages(pdf); if (ex?.pages?.length) { pages = ex.pages; source = 'pdf'; } } catch (e) { log.warn?.(`[library] extractPages ${id}: ${e.message}`); } }
      }
      if (!pages) { const t = await textOf(id); if (!t) return null; pages = flatTextToPages(t).pages; }
      const built = buildBlocks(pages);
      const doc = { v: 1, source, pages: pages.length, pageSize: built.pageSize, blocks: built.blocks };
      if (r2.ok() && built.blocks.length) await r2.putBuffer(blocksKey(id), Buffer.from(JSON.stringify(doc)), 'application/json').catch(e => log.warn?.(`[library] cache blocks ${id}: ${e.message}`));
      return doc;
    })();
    inflight.set(id, job);
    try {
      const doc = await job;
      if (doc) { blocksMem.set(id, doc); if (blocksMem.size > BLOCKS_MEM_MAX) blocksMem.delete(blocksMem.keys().next().value); if (index) addToIndex(doc, id); }
      return doc;
    } finally { inflight.delete(id); }
  }

  // ── search index: built lazily on the first search, from the .txt (no worker); block caches refine it ──
  function addToIndex(doc, id) {
    const p = catalogCache?.byId.get(id); if (!p || !index) return;
    addDoc(index, { id, title: p.title, abstract: p.abstract, text: plainText(doc.blocks), tags: p.tags.map(t => t.key) }); indexDocs.add(id);
  }
  async function ensureIndex() {
    if (index) return index;
    indexBuilding ??= (async () => {
      const cat = await catalog(), ix = buildIndex([]);
      for (const p of cat.list) {
        let body = blocksMem.get(p.id) ? plainText(blocksMem.get(p.id).blocks) : '';
        if (!body && p.hasText) body = await textOf(p.id).catch(() => '') ?? '';
        const nt = p.notes ? Object.values(p.notes).filter(v => typeof v === 'string').join('\n') : '';
        const text = [p.abstract, nt, body].filter(Boolean).join('\n\n');
        if (!text && !p.title) continue;
        addDoc(ix, { id: p.id, title: p.title, abstract: p.abstract, text, tags: p.tags.map(t => t.key) }); indexDocs.add(p.id);
      }
      index = ix; return ix;
    })().finally(() => { indexBuilding = null; });
    return indexBuilding;
  }

  // ── handlers ──────────────────────────────────────────────────────────────────────────────────────────────
  const H = {};

  H.papers = async () => {
    const cat = await catalog({ fresh: true });
    const papers = cat.list.map(p => ({ ...p, theory: theoryOf(p) }));
    const fullText = papers.filter(p => p.hasText).length;
    return reply(200, { ok: true, papers, topics: topicCounts(papers), sources: sourceCounts(papers), totals: { all: papers.length, fullText, abstractOnly: papers.length - fullText } });
  };

  H.paper = async ({ query }) => {
    const id = String(query?.id ?? ''); const cat = await catalog(); const p = cat.byId.get(id);
    if (!p) return bad(404, 'unknown paper');
    let doc = null; try { doc = p.hasText || p.hasPdf ? await getBlocks(id, p.hasPdf) : null; } catch (e) { log.warn?.(`[library] blocks ${id}: ${e.message}`); }
    return reply(200, { ok: true, paper: { ...p, pages: doc?.pages ?? p.pages, theory: theoryOf(p) }, blocks: doc?.blocks ?? null, pageSize: doc?.pageSize ?? {}, pages: doc?.pages ?? p.pages ?? null });
  };

  H.search = async ({ query }) => {
    const q = String(query?.q ?? '').trim().slice(0, 200); if (!q) return reply(200, { ok: true, hits: [], total: 0 });
    const tags = String(query?.tags ?? '').split(',').map(s => s.trim()).filter(k => TOPIC_KEYS.includes(k));
    const sources = String(query?.sources ?? '').split(',').map(s => s.trim()).filter(k => SOURCES.some(x => x.key === k));
    const limit = Math.min(100, Math.max(1, Number(query?.limit) || 40));
    const ix = await ensureIndex(); const cat = await catalog();
    for (const p of cat.list) setDocTags(ix, p.id, p.tags);   // manual tag changes apply without re-indexing
    const r = indexSearch(ix, q, { tags, limit: sources.length ? 100 : limit });   // a source filter applies after ranking, so rank deeper first
    const hits = [];
    for (const h of r.hits) {
      if (sources.length && (!sources.includes(cat.byId.get(h.id)?.source?.key) || hits.length >= limit)) continue;
      const doc = blocksMem.get(h.id) ?? null;   // only cached blocks resolve a snippet to a block (never builds one here)
      const locate = text => { if (!doc) return null; const probe = String(text).replace(/\s+/g, ' ').slice(0, 40); const b = doc.blocks.find(x => x.text && x.text.replace(/\s+/g, ' ').includes(probe)); return b ? b.i : null; };
      hits.push({ id: h.id, score: h.score, title: h.title, snippets: h.snippets.map(s => ({ block: locate(s.text), text: s.text, marks: s.marks })) });
    }
    return reply(200, { ok: true, hits, total: r.total, mode: r.mode });
  };

  H.pdf = async ({ query, headers }) => {
    const id = String(query?.id ?? ''); if (!ID_RE.test(id)) return bad(400, 'bad id');
    const cat = await catalog(); const p = cat.byId.get(id); if (!p?.hasPdf || !r2.ok()) return bad(404, 'no PDF');
    const buf = await r2.getBuffer(uploadKey(id, 'pdf')); if (!buf) return bad(404, 'no PDF');
    return rangeResponse(buf, headers?.range, 'application/pdf', { 'Content-Disposition': 'inline; filename="paper.pdf"' });
  };

  H.progressGet = async () => { const s = await readState(); return reply(200, { ok: true, progress: s.progress, data: s.progress }); };
  H.progressPost = async ({ body }) => {
    const v = progressFromBody(body, now()); if (!v.ok) return bad(400, v.error);
    const out = await mutate(async s => {
      const merged = mergeProgress(v.value, s.progress);   // like the Theory Lab PUT: merge, never overwrite
      if (Object.keys(merged).length > MAX_PROGRESS) return null;
      const changed = JSON.stringify(merged) !== JSON.stringify(s.progress);
      s.progress = merged; return { merged, changed };
    });
    if (!out) return bad(400, 'too many papers');
    dropCatalog();
    return reply(200, { ok: true, progress: out.merged, data: out.merged, changed: out.changed });
  };

  H.tagsPost = async ({ body }) => {
    const id = String(body?.id ?? ''); const cat = await catalog(); if (!cat.byId.has(id)) return bad(404, 'unknown paper');
    if (!isPlain(body)) return bad(400, 'bad body');
    await mutate(async s => { s.tags[id] = mergeTagOverride(s.tags[id], body); if (!s.tags[id].add.length && !s.tags[id].remove.length) delete s.tags[id]; });
    dropCatalog(); const p = (await catalog()).byId.get(id);
    return reply(200, { ok: true, id, tags: p.tags });
  };

  H.casePost = async ({ body }) => {
    const id = String(body?.id ?? ''); const cat = await catalog(); const p = cat.byId.get(id); if (!p) return bad(404, 'unknown paper');
    const store = await cases.read(), had = caseForPaper(store.cases ?? store, id);
    if (had) return reply(200, { ok: true, caseId: had.id, existed: true });
    const c = caseFromPaper(p, { now: new Date(now()).toISOString() });   // no model call: nothing is spent until the owner writes
    await cases.put(c);
    return reply(200, { ok: true, caseId: c.id, existed: false });
  };

  H.todo = async () => {
    let md = ''; try { md = (await readTodoMd()) ?? ''; } catch { /* no list */ }
    const [papers, queueItems] = await Promise.all([loadPapers(), loadQueue()]);
    const items = parseTodoList(md, heldSsrnIds(papers, queueItems)).map(i => ({ id: i.id, title: i.title, year: i.year, part: i.part, url: i.url, held: i.held, section: i.section }));
    return reply(200, { ok: true, items });
  };

  H.readNext = async () => {
    const cat = await catalog(); let list = [];
    try { const s = await cases.read(); list = s.cases ?? s ?? []; } catch { /* no cases */ }
    const r = readNext({ papers: cat.list, cases: list });
    return reply(200, { ok: true, ids: r.ids, why: r.why });
  };

  // the listen script. sentences: string[]; blocks: the source block index of each sentence (null in briefings), for highlighting.
  async function scriptFor(p, mode) {
    let doc = null; if (p.hasText || p.hasPdf) { try { doc = await getBlocks(p.id, p.hasPdf); } catch { doc = null; } }
    const blocks = doc?.blocks ?? null;
    if (mode === 'briefing') {
      const abs = p.abstract || (blocks ? abstractOf(blocks) : '');
      const b = briefingScript({ title: p.title, year: p.year, abstract: abs, notes: p.notes }, blocks, blocks ? conclusion(blocks) : []);
      return { title: p.title, sentences: b.sentences, blocks: null, secs: b.secs, source: b.source };
    }
    if (blocks?.length) { const s = speechSentences(blocks); return { title: p.title, sentences: s.map(x => x.text), blocks: s.map(x => x.block), secs: estimateSecs(s.map(x => x.text)) }; }
    const fallback = [p.abstract, p.notes ? Object.values(p.notes).filter(v => typeof v === 'string').join('. ') : ''].filter(Boolean).join('\n\n');
    const sents = toSentences(fallback); return { title: p.title, sentences: sents, blocks: null, secs: estimateSecs(sents), abstractOnly: true };
  }
  H.listen = async ({ query }) => {
    const id = String(query?.id ?? ''), mode = query?.mode === 'full' ? 'full' : 'briefing';
    const p = (await catalog()).byId.get(id); if (!p) return bad(404, 'unknown paper');
    const s = await scriptFor(p, mode);
    return reply(200, { ok: true, mode, sentences: s.sentences, blocks: s.blocks, title: s.title, secs: s.secs });
  };

  // MP3 briefing: a background job; free provider only; audio in R2, state in KV
  const setAudio = (id, patch) => mutate(async s => { s.audio[id] = { briefing: { ...(s.audio[id]?.briefing ?? {}), ...patch } }; }).then(dropCatalog);
  async function runAudioJob(p, provider) {
    try {
      const s = await scriptFor(p, 'briefing');
      const chunks = chunkForTts(s.sentences);
      const mp3 = await tts.makeMp3(chunks, provider, { onProgress: () => {} });
      if (r2.ok()) await r2.putBuffer(audioKey(p.id), mp3, 'audio/mpeg'); else { audioMem.set(p.id, mp3); if (audioMem.size > 5) audioMem.delete(audioMem.keys().next().value); }
      await setAudio(p.id, { status: 'ready', secs: s.secs, error: null, bytes: mp3.length, at: now() });
    } catch (e) { await setAudio(p.id, { status: 'error', error: String(e?.message ?? e).slice(0, 240), at: now() }).catch(() => {}); }
    finally { jobs.delete(p.id); }
  }
  H.audioPost = async ({ body }) => {
    const id = String(body?.id ?? ''), mode = body?.mode ?? 'briefing';
    if (mode !== 'briefing') return bad(400, 'only the briefing can be made as MP3');
    const p = (await catalog()).byId.get(id); if (!p) return bad(404, 'unknown paper');
    const provider = tts.getProvider();
    if (!provider || provider.disabled) return bad(503, 'MP3 creation is switched off (PAPER_TTS_PROVIDER=none). The browser voice still works.');
    if (provider.free !== true) return bad(503, 'only a free voice provider may be used');
    if (jobs.has(id)) return reply(200, { ok: true, job: { id, status: 'working', startedAt: jobs.get(id).startedAt } });
    jobs.set(id, { startedAt: now() });
    await setAudio(id, { status: 'working', secs: null, error: null, at: now() });
    runAudioJob(p, provider);   // background: not awaited
    return reply(202, { ok: true, job: { id, status: 'working', startedAt: jobs.get(id)?.startedAt ?? now() } });
  };
  H.audioGet = async ({ query, headers }) => {
    const id = String(query?.id ?? ''); if (!ID_RE.test(id)) return bad(400, 'bad id');
    const st = (await readState()).audio[id]?.briefing;
    if (query?.status === '1' || query?.status === 'true') return reply(200, { ok: true, briefing: st ?? { status: 'none' } });
    if (st?.status !== 'ready') return bad(404, 'no audio');
    const buf = r2.ok() ? await r2.getBuffer(audioKey(id)).catch(() => null) : audioMem.get(id);
    if (!buf) return bad(404, 'no audio');
    return rangeResponse(buf, headers?.range, 'audio/mpeg');
  };

  /** A job that was 'working' when the server restarted will never finish: report it as an error instead of spinning forever. */
  H.reapStaleAudio = () => mutate(async s => { for (const [id, a] of Object.entries(s.audio)) if (a.briefing?.status === 'working' && !jobs.has(id) && now() - (a.briefing.at ?? 0) > 60_000) a.briefing = { ...a.briefing, status: 'error', error: 'interrupted by a restart; try again' }; });

  H._test = { catalog, getBlocks, readState, dropCatalog, jobsActive: () => [...jobs.keys()] };
  return H;
}
