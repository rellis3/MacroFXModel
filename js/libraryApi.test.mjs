// Paper Library server handlers (js/libraryApi.js): synthetic fixtures only, fake kv / R2 / TTS, no network, no model call.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createLibraryApi, rangeResponse, mergeProgress, progressFromBody, mergeTagOverride, KV_KEY } from './libraryApi.js';
import { uploadKey } from './researchLibrary.js';

const BODY = 'Volatility clustering and jump risk in currency markets. '.repeat(30);
const fixtureText = `Synthetic Study of Volatility Jumps\n\nAbstract\n\n${BODY}\n\nIntroduction\n\n${BODY}\n\nConclusion\n\nWe find volatility jumps matter for hedging. The effect is robust.\n`;
const LIST = `# list\n\n| # | Title | Year | Link |\n|---|---|---|---|\n| 1 | Some SSRN Paper Title Here · A. Author | 2020 | [download](https://papers.ssrn.com/sol3/Delivery.cfm?abstractid=1234567) |\n| 2 | Another Paper Title Here · B. Author | 2021 | [download](https://papers.ssrn.com/sol3/Delivery.cfm?abstractid=7654321) |\n`;

function harness({ provider } = {}) {
  const store = new Map(), blobs = new Map(); let cases = { cases: [] }; const calls = { tts: 0, extract: 0 };
  const queue = { items: [{ id: 'up1', title: 'up1.pdf', status: 'pending', upload: { name: 'up1.pdf', bytes: 99, chars: 5000, at: '2026-01-01T00:00:00Z', stored: 'r2', sha: 'aa' } }] };
  const papers = [{ id: 'p-read', title: 'Jump Diffusion and Volatility', year: 2020, readFrom: 'pdf', abstract: 'Jumps and volatility.', notes: { claim: 'Jumps matter for volatility.', stance: 'supports' }, ssrn: '1234567' }, { id: 'p-abs', title: 'Abstract only paper on carry trade', year: 2019, readFrom: 'abstract', abstract: 'Carry trade returns in FX.' }];
  store.set('q', JSON.stringify(queue)); store.set('pp', JSON.stringify(papers));
  blobs.set(uploadKey('up1', 'txt'), Buffer.from(fixtureText)); blobs.set(uploadKey('up1', 'pdf'), Buffer.from('%PDF-1.4 ' + 'x'.repeat(200)));
  blobs.set(uploadKey('p-read', 'txt'), Buffer.from(fixtureText));
  const api = createLibraryApi({
    kv: { get: async k => store.get(k) ?? null, getStrict: async k => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); } },
    r2: { ok: () => true, getBuffer: async k => blobs.get(k) ?? null, putBuffer: async (k, b) => { blobs.set(k, b); } },
    keys: { queue: 'q', papers: 'pp' }, uploadKey,
    extractPages: async () => { calls.extract++; throw new Error('synthetic pdf has no real pages'); },
    tts: { getProvider: () => provider ?? { name: 'fake', free: true }, makeMp3: async (chunks) => { calls.tts++; return Buffer.concat([Buffer.from('MP3:'), Buffer.from(chunks.join('|'))]); } },
    readTodoMd: () => LIST, lessonFiles: () => fs.readdirSync(new URL('../theory-lab/lessons', import.meta.url)),
    cases: { read: async () => cases, put: async c => { cases = { cases: [c, ...cases.cases.filter(x => x.id !== c.id)] }; } },
    log: { warn() {} },
  });
  return { api, store, blobs, calls, getCases: () => cases };
}

test('papers: read, abstract-only and unread uploads, topics and totals', async () => {
  const { api } = harness(); const r = (await api.papers()).json;
  assert.equal(r.ok, true); assert.equal(r.papers.length, 3);
  const up = r.papers.find(p => p.id === 'up1'); assert.equal(up.hasPdf, true); assert.match(up.title, /Synthetic Study/); assert.equal(up.read, false);
  assert.equal(r.papers.find(p => p.id === 'p-abs').hasText, false);
  assert.equal(r.totals.all, 3); assert.equal(r.totals.abstractOnly, 1); assert.equal(r.topics.length, 15);
  // list payload: card fields + a one-line card; heavy fields live in GET /paper only
  assert.ok(r.papers.every(p => !('notes' in p) && !('abstract' in p) && !('desk' in p) && !('theory' in p) && typeof p.card === 'string' && p.card.length <= 260));
  const rd = r.papers.find(p => p.id === 'p-read'); assert.equal(rd.read, true); assert.match(rd.card, /Jumps matter for volatility/); assert.equal(rd.cardMuted, false);
  assert.equal(r.papers.find(p => p.id === 'p-abs').cardMuted, true);
  const d = (await api.paper({ query: { id: 'p-read' } })).json.paper; assert.equal(d.notes.claim, 'Jumps matter for volatility.'); assert.ok(Array.isArray(d.theory)); assert.match(d.abstract, /Jumps and volatility/);
});

test('catalog: simultaneous first loads share one build', async () => {
  const { api, store } = harness(); let reads = 0; const get = store.get.bind(store);
  store.get = k => { if (k === 'pp') reads++; return get(k); };
  const rs = await Promise.all([api.papers(), api.papers(), api.papers()]);
  assert.equal(reads, 1, 'one catalog build for three concurrent requests');
  assert.ok(rs.every(r => r.json.papers.length === 3));
  api._test.dropCatalog(); await api.papers(); assert.equal(reads, 2, 'a drop starts a fresh build');
});

test('paper: blocks built from the text fallback when the PDF cannot be parsed, then cached in R2', async () => {
  const { api, blobs, calls } = harness(); const r = (await api.paper({ query: { id: 'up1' } })).json;
  assert.equal(r.ok, true); assert.ok(r.blocks.length > 2); assert.equal(calls.extract, 1);
  assert.ok(blobs.has(uploadKey('up1', 'blocks.json')));
  api._test.dropCatalog(); await api.paper({ query: { id: 'up1' } }); assert.equal(calls.extract, 1);
  assert.equal((await api.paper({ query: { id: 'nope' } })).status, 404);
  const abs = (await api.paper({ query: { id: 'p-abs' } })).json; assert.equal(abs.blocks, null);
});

test('search: lazily built, ranked, tag filter, snippets', async () => {
  const { api } = harness(); const r = (await api.search({ query: { q: 'jump hedging' } })).json;
  assert.ok(r.hits.length >= 1); assert.ok(r.hits[0].snippets.length >= 1);
  const t = (await api.search({ query: { q: 'volatility', tags: 'volatility' } })).json; assert.ok(t.hits.every(h => ['up1', 'p-read'].includes(h.id)));
  assert.deepEqual((await api.search({ query: { q: '' } })).json.hits, []);
});

test('ids with a slash (doi:10.2139/ssrn.N) pass id validation on pdf and audio (404 no PDF, not 400 bad id)', async () => {
  const { api } = harness();
  assert.equal((await api.pdf({ query: { id: 'doi:10.2139/ssrn.2778647' }, headers: {} })).status, 404);
  assert.equal((await api.pdf({ query: { id: '../etc/passwd' }, headers: {} })).status, 400);
});

test('pdf: Accept-Ranges, 200 / 206 / 416, 404 without a PDF', async () => {
  const { api } = harness(); const full = await api.pdf({ query: { id: 'up1' }, headers: {} });
  assert.equal(full.status, 200); assert.equal(full.headers['Accept-Ranges'], 'bytes');
  const part = await api.pdf({ query: { id: 'up1' }, headers: { range: 'bytes=0-9' } });
  assert.equal(part.status, 206); assert.equal(part.body.length, 10); assert.match(part.headers['Content-Range'], /^bytes 0-9\/\d+$/);
  assert.equal((await api.pdf({ query: { id: 'up1' }, headers: { range: 'bytes=99999-' } })).status, 416);
  assert.equal((await api.pdf({ query: { id: 'p-abs' }, headers: {} })).status, 404);
});

test('rangeResponse: open-ended, suffix and bad ranges', () => {
  const b = Buffer.from('0123456789');
  assert.equal(rangeResponse(b, 'bytes=5-', 'x').body.toString(), '56789');
  assert.equal(rangeResponse(b, 'bytes=-3', 'x').body.toString(), '789');
  assert.equal(rangeResponse(b, 'bytes=2-4', 'x').headers['Content-Range'], 'bytes 2-4/10');
  assert.equal(rangeResponse(b, 'garbage', 'x').status, 200);
});

test('progress: Theory Lab semantics (high-water marks, never cleared), both payload styles', async () => {
  const { api, store } = harness();
  let r = (await api.progressPost({ body: { id: 'up1', pct: 40, pos: 12, done: false } })).json; assert.equal(r.progress.up1.pct, 40);
  r = (await api.progressPost({ body: { id: 'up1', pct: 10, pos: 3 } })).json; assert.equal(r.progress.up1.pct, 40);
  assert.equal(r.progress.up1.pos, 3);
  r = (await api.progressPost({ body: { progress: { up1: { pct: 100, pos: 50, done: true, at: Date.now() - 5000 }, 'p-read': { pct: 5, pos: 1 } } } })).json;
  assert.equal(r.progress.up1.done, true); assert.equal(r.progress['p-read'].pct, 5);
  r = (await api.progressPost({ body: { id: 'up1', pct: 1, done: false } })).json; assert.equal(r.progress.up1.done, true);
  assert.equal((await api.progressGet()).json.progress.up1.pct, 100);
  assert.ok(JSON.parse(store.get(KV_KEY)).progress.up1);
  assert.equal((await api.progressPost({ body: { id: '../x', pct: 1 } })).status, 400);
  assert.equal((await api.progressPost({ body: {} })).status, 400);
  assert.equal(progressFromBody({ progress: [] }).ok, false);
  assert.deepEqual(mergeProgress({ a: { pct: 1, pos: 1, at: 5, done: false } }, { a: { pct: 9, pos: 2, at: 3, done: true } }).a, { pct: 9, pos: 1, at: 5, done: true });
  const p = (await api.papers()).json.papers.find(x => x.id === 'up1'); assert.equal(p.progress.pct, 100);
});

test('tags: manual overrides persist and show as source manual', async () => {
  const { api } = harness();
  const r = (await api.tagsPost({ body: { id: 'p-abs', add: ['rates', 'bogus'], remove: [] } })).json;
  assert.ok(r.tags.some(t => t.key === 'rates' && t.source === 'manual')); assert.ok(!r.tags.some(t => t.key === 'bogus'));
  const r2 = (await api.tagsPost({ body: { id: 'p-abs', add: [], remove: ['rates'] } })).json; assert.ok(!r2.tags.some(t => t.key === 'rates'));
  assert.deepEqual(mergeTagOverride({ add: ['fx'], remove: [] }, { remove: ['fx'] }), { add: [], remove: ['fx'] });
});

test('case: made once from the paper, no model call; second call returns the same case', async () => {
  const h = harness(); const a = (await h.api.casePost({ body: { id: 'p-read' } })).json;
  assert.equal(a.ok, true); assert.equal(a.existed, false); assert.equal(h.getCases().cases.length, 1); assert.equal(h.getCases().cases[0].paperId, 'p-read');
  const b = (await h.api.casePost({ body: { id: 'p-read' } })).json; assert.equal(b.caseId, a.caseId); assert.equal(b.existed, true); assert.equal(h.getCases().cases.length, 1);
  assert.equal((await h.api.casePost({ body: { id: 'zzz' } })).status, 404);
});

test('todo: the SSRN list, ticked off by held ssrn id; read-next', async () => {
  const { api } = harness(); const t = (await api.todo()).json;
  assert.equal(t.items.length, 2); assert.equal(t.items.find(i => i.id === '1234567').held, true); assert.equal(t.items.find(i => i.id === '7654321').held, false);
  const n = (await api.readNext()).json; assert.equal(n.ok, true); assert.ok(Array.isArray(n.ids));
});

test('listen: full has block indexes, briefing is non-verbatim and shorter', async () => {
  const { api } = harness();
  const full = (await api.listen({ query: { id: 'up1', mode: 'full' } })).json; assert.ok(full.sentences.length > 5); assert.equal(full.sentences.length, full.blocks.length);
  const br = (await api.listen({ query: { id: 'p-read', mode: 'briefing' } })).json; assert.ok(br.sentences.some(s => /briefing/i.test(s))); assert.ok(br.sentences.length < full.sentences.length);
  const ab = (await api.listen({ query: { id: 'p-abs', mode: 'full' } })).json; assert.ok(ab.sentences.length >= 1);
});

test('audio: background job with the mocked free TTS, state in KV, MP3 served with ranges; none / paid refuse', async () => {
  const h = harness(); const r = await h.api.audioPost({ body: { id: 'up1', mode: 'briefing' } });
  assert.equal(r.status, 202);
  for (let i = 0; i < 100 && h.api._test.jobsActive().length; i++) await new Promise(x => setTimeout(x, 10));
  assert.equal(h.calls.tts, 1);
  const st = (await h.api.audioGet({ query: { id: 'up1', status: '1' } })).json; assert.equal(st.briefing.status, 'ready');
  const full = await h.api.audioGet({ query: { id: 'up1' }, headers: {} }); assert.equal(full.status, 200); assert.equal(full.headers['Content-Type'], 'audio/mpeg'); assert.equal(full.headers['Accept-Ranges'], 'bytes');
  assert.equal((await h.api.audioGet({ query: { id: 'up1' }, headers: { range: 'bytes=0-3' } })).status, 206);
  assert.equal((await h.api.audioGet({ query: { id: 'p-abs' }, headers: {} })).status, 404);
  const off = harness({ provider: { name: 'none', free: true, disabled: true } }); assert.equal((await off.api.audioPost({ body: { id: 'up1' } })).status, 503); assert.equal(off.calls.tts, 0);
  const paid = harness({ provider: { name: 'paid', free: false } }); assert.equal((await paid.api.audioPost({ body: { id: 'up1' } })).status, 503); assert.equal(paid.calls.tts, 0);
  assert.equal((await h.api.audioPost({ body: { id: 'up1', mode: 'full' } })).status, 400);
});

test('every /api/library route in server.js is registered after the login gate', () => {
  const src = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const gate = src.indexOf("app.use('/api/library', _libGate)"); assert.ok(gate > 0);
  const routes = [...src.matchAll(/_libRoute\('(get|post)', '[a-z-]+'/g)];
  assert.equal(routes.length, 13); assert.ok(!/app\.(get|post|put)\('\/api\/library/.test(src), 'a route bypasses _libRoute (and so the gate order)');
  for (const m of routes) assert.ok(m.index > gate, `${m[0]} registered before the gate`);
});

test('KV key library_state_v1 is registered in kv.js, both lists in _worker.js and the store registry', () => {
  const rd = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
  assert.ok(rd('../kv.js').includes(`'${KV_KEY}'`));
  assert.ok(rd('../_worker.js').split(`'${KV_KEY}'`).length - 1 >= 2);
  assert.ok(rd('./storeRegistry.js').includes(KV_KEY));
});

test('sources: every paper has one, the list carries counts, and search can filter by source', async () => {
  const { api } = harness(); const r = (await api.papers()).json;
  const by = Object.fromEntries(r.papers.map(p => [p.id, p.source.key]));
  assert.deepEqual(by, { 'p-read': 'ssrn', 'p-abs': 'other', up1: 'upload' });
  assert.deepEqual(r.sources.map(s => [s.key, s.count]), [['ssrn', 1], ['upload', 1], ['other', 1]]);
  assert.ok(r.papers.every(p => p.source.label));
  const s = (await api.search({ query: { q: 'volatility', sources: 'ssrn' } })).json; assert.deepEqual(s.hits.map(h => h.id), ['p-read']);
  const u = (await api.search({ query: { q: 'volatility', sources: 'upload,BOGUS!' } })).json; assert.deepEqual(u.hits.map(h => h.id), ['up1']);
  const n = (await api.search({ query: { q: 'volatility', sources: 'BOGUS!' } })).json; assert.ok(n.hits.length >= 2);   // malformed keys are ignored
});

test('years: unread upload year from the cached text head, buckets in the list, search filters by years, unknown stays null', async () => {
  const { api, blobs } = harness();
  blobs.set(uploadKey('up1', 'txt'), Buffer.from(`Synthetic Study of Volatility Jumps\nWorking Paper, March 2018\n\n${BODY}\n`));
  const r = (await api.papers()).json, by = Object.fromEntries(r.papers.map(p => [p.id, [p.year, p.yearFrom, p.yearKey]]));
  assert.deepEqual(by['up1'], [2018, 'text', 'd2010']); assert.deepEqual(by['p-read'], [2020, 'given', 'd2020']);
  assert.ok(Array.isArray(r.years) && r.years.every(y => y.key && y.label && y.count > 0));
  assert.equal(r.years.reduce((a, y) => a + y.count, 0), 3);
  const s = (await api.search({ query: { q: 'volatility', years: 'd2010' } })).json; assert.deepEqual(s.hits.map(h => h.id), ['up1']);
  const both = (await api.search({ query: { q: 'volatility', years: 'd2010,d2020', sources: 'upload' } })).json; assert.deepEqual(both.hits.map(h => h.id), ['up1']);   // AND with sources
  const none = (await api.search({ query: { q: 'volatility', years: 'unknown' } })).json; assert.deepEqual(none.hits, []);
  const junk = (await api.search({ query: { q: 'volatility', years: 'BOGUS!' } })).json; assert.ok(junk.hits.length >= 2);   // malformed keys are ignored
  const h2 = harness(); const r2 = (await h2.api.papers()).json;   // the plain fixture has no year anywhere in up1's text
  assert.deepEqual([r2.papers.find(p => p.id === 'up1').year, r2.papers.find(p => p.id === 'up1').yearFrom], [null, null]);
  assert.ok(r2.years.some(y => y.key === 'unknown' && y.count === 1));
});

// ── equations as maths (js/libraryMath.js, js/mathLatex.js, js/arxivMath.js) ──
const eqItem = (str, x, y = 500, h = 10) => [str, x, y, str.length * h * 0.5, h, 0];
const mathBlocks = () => [
  { i: 0, type: 'p', text: 'Before the equation. The return is defined below.', page: 1, bbox: null },
  { i: 1, type: 'eq', text: 'x = a + b (1)', page: 1, bbox: [50, 490, 300, 515], label: '1', src: { it: [eqItem('x', 100), eqItem('=', 110), eqItem('a', 120), eqItem('+', 128), eqItem('b', 138)], fonts: ['F'] } },
  { i: 2, type: 'eq', text: 'y = ? (2)', page: 1, bbox: [50, 450, 300, 475], label: '2', src: { it: [eqItem('y', 100, 460), eqItem('', 110, 460)], fonts: ['F'] } },
  { i: 3, type: 'eq', text: 'z (3)', page: 1, bbox: [50, 400, 300, 425], label: '3', src: { it: [eqItem('z', 100, 410), eqItem('', 110, 410)], fonts: ['F'] } },
  { i: 4, type: 'p', text: 'After the equation. More text follows here.', page: 1, bbox: null },
];
function mathHarness({ math } = {}) {
  const h = harness(); const { blobs, api } = h;
  blobs.set(uploadKey('up1', 'blocks.json'), Buffer.from(JSON.stringify({ v: 3, source: 'pdf', pages: 1, pageSize: { 1: [612, 792] }, blocks: mathBlocks() })));
  if (math) blobs.set(uploadKey('up1', 'math.json'), Buffer.from(JSON.stringify(math)));
  return { ...h, get: async () => (await api.paper({ query: { id: 'up1' } })).json };
}

test('paper: eq blocks get latex from the best layer (arXiv > model > rules), keep their crop box, and never expose the raw geometry', async () => {
  const { get } = mathHarness({ math: { v: 1, eq: { 2: { latex: 'y=\\mu', source: 'arxiv', conf: 0.95 }, 3: { latex: 'z=1', source: 'model', conf: 0.55 } } } });
  const r = await get(); const [, a, b, c] = r.blocks;
  assert.deepEqual([a.latexSource, a.latexConf], ['rule', 1]); assert.match(a.latex, /^x=a\+b\\tag\{1\}$/);
  assert.deepEqual([b.latex, b.latexSource, b.latexConf], ['y=\\mu', 'arxiv', 0.95]);
  assert.ok(!('latex' in c), 'a model answer that is not confident stays hidden: the crop shows');
  for (const e of [a, b, c]) { assert.ok(Array.isArray(e.bbox) && e.page === 1, 'the crop box stays'); assert.ok(!('src' in e), 'the geometry stays on the server'); }
  assert.ok(!JSON.stringify(r).includes('"src"'));
});

test('paper: without a math file the rule-based layer still gives the clean equations, the unreadable ones show as before', async () => {
  const { get } = mathHarness(); const r = await get();
  assert.ok(r.blocks[1].latex && r.blocks[1].latexSource === 'rule'); assert.ok(!('latex' in r.blocks[2]) && !('latex' in r.blocks[3]));
});

test('blocks cache: a v2 cache (before equations kept their geometry) is rebuilt, a v3 one is used as is', async () => {
  const { api, blobs, calls } = harness();
  blobs.set(uploadKey('up1', 'blocks.json'), Buffer.from(JSON.stringify({ v: 2, source: 'pdf', pages: 1, pageSize: {}, blocks: [{ i: 0, type: 'p', text: 'old', page: 1, bbox: null }] })));
  const r = (await api.paper({ query: { id: 'up1' } })).json; assert.equal(calls.extract, 1, 'rebuilt'); assert.ok(r.blocks.length > 2);
  assert.equal(JSON.parse(blobs.get(uploadKey('up1', 'blocks.json')).toString()).v, 3);
});

test('the equations job is mounted at /api/research-pod/math (GET status, POST capped), task library-math, key registered everywhere', () => {
  const rd = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8'), src = rd('../server.js');
  assert.match(src, /app\.get\('\/api\/research-pod\/math'/); assert.match(src, /app\.post\('\/api\/research-pod\/math'/);
  assert.match(src, /task: 'library-math'/); assert.match(src, /_libApi\.math\.start\(/); assert.match(src, /_libApi\.math\.status\(/);
  for (const [f, n] of [['../kv.js', 1], ['../_worker.js', 2], ['./storeRegistry.js', 1]]) assert.ok(rd(f).split('library_math_v1').length - 1 >= n, `${f} lists library_math_v1`);
  assert.match(rd('./modelRouter.js'), /'library-math': \{ ledger: 'brief'/);
});
