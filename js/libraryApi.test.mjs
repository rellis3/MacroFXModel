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
  const up = r.papers.find(p => p.id === 'up1'); assert.equal(up.hasPdf, true); assert.match(up.title, /Synthetic Study/); assert.equal(up.notes, null);
  assert.equal(r.papers.find(p => p.id === 'p-abs').hasText, false);
  assert.equal(r.totals.all, 3); assert.equal(r.totals.abstractOnly, 1); assert.equal(r.topics.length, 15);
  assert.ok(r.papers.every(p => Array.isArray(p.theory)));
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
