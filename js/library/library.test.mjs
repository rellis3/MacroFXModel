// Paper Library frontend logic (synthetic data only).   node js/library/library.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from './model.js';
import { cropRect, renderScale, zoomView } from './crop.js';
import * as S from './speech.js';
import * as A from './audio.js';
import * as P from './progress.js';

let n = 0; const t = (name, fn) => { try { const r = fn(); if (r && r.then) return r.then(() => { n++; }, e => { console.log('FAIL', name); throw e; }); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const memStore = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; };

// ── model ──
t('status badge', () => {
  assert.equal(M.statusOf({ notes: { claim: 'x' }, hasPdf: true }).key, 'desk');
  assert.equal(M.statusOf({ notes: null, hasPdf: true }).label, 'PDF only');
  assert.equal(M.statusOf({ notes: null, hasText: false, hasPdf: false }).label, 'abstract only');
});
t('tag filter is multi-select (any)', () => {
  const ps = [{ id: 'a', tags: [{ key: 'vol' }, { key: 'jump' }] }, { id: 'b', tags: [{ key: 'cot' }] }, { id: 'c', tags: [] }];
  assert.equal(M.filterPapers(ps, [], null).length, 3);
  assert.deepEqual(M.filterPapers(ps, ['jump'], null).map(p => p.id), ['a']);
  assert.deepEqual(M.filterPapers(ps, ['jump', 'cot'], null).map(p => p.id), ['a', 'b']);
  assert.deepEqual(M.filterPapers(ps, [], new Set(['b'])).map(p => p.id), ['b']);
  assert.deepEqual(M.toggleTag(['a'], 'b'), ['a', 'b']); assert.deepEqual(M.toggleTag(['a', 'b'], 'a'), ['b']);
});
t('filter: OR within topics, OR within sources, AND between the groups, search hits narrow further', () => {
  const ps = [
    { id: 'a', source: { key: 'ssrn' }, tags: [{ key: 'vol' }] }, { id: 'b', source: { key: 'nber' }, tags: [{ key: 'vol' }, { key: 'cot' }] },
    { id: 'c', source: { key: 'ssrn' }, tags: [{ key: 'cot' }] }, { id: 'd', tags: [{ key: 'vol' }] }, { id: 'e', source: { key: 'arxiv' }, tags: [] }];
  const ids = (...a) => M.filterPapers(ps, ...a).map(p => p.id);
  assert.deepEqual(ids([], null, []), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(ids([], null, ['ssrn']), ['a', 'c']);
  assert.deepEqual(ids([], null, ['ssrn', 'arxiv']), ['a', 'c', 'e']);
  assert.deepEqual(ids(['vol'], null, ['ssrn']), ['a']);
  assert.deepEqual(ids(['vol', 'cot'], null, ['ssrn', 'nber']), ['a', 'b', 'c']);
  assert.deepEqual(ids(['vol'], null, ['arxiv']), []);
  assert.deepEqual(ids(['vol'], new Set(['b', 'd']), []), ['b', 'd']);
  assert.deepEqual(ids([], new Set(['b', 'c']), ['ssrn']), ['c']);
  assert.deepEqual(ids(['vol'], null, ['nope']), []);   // a paper with no source never passes a source filter
});
t('source chips follow the papers in scope; selection restore drops vanished keys', () => {
  const srcs = [{ key: 'ssrn', label: 'SSRN', count: 9 }, { key: 'nber', label: 'NBER', count: 9 }];
  assert.deepEqual(M.sourceChips(srcs, [{ source: { key: 'ssrn' } }, { source: { key: 'ssrn' } }, {}]).map(c => c.count), [2, 0]);
  assert.deepEqual(M.sourceChips(srcs, [], ['gone']).map(c => [c.key, c.count]), [['ssrn', 0], ['nber', 0], ['gone', 0]]);
  assert.deepEqual(M.restoreSelection('["ssrn","gone"]', ['ssrn', 'nber']), ['ssrn']);
  assert.deepEqual(M.restoreSelection('garbage', ['ssrn']), []); assert.deepEqual(M.restoreSelection(null, ['ssrn']), []); assert.deepEqual(M.restoreSelection('{"a":1}', ['a']), []);
});
t('order by search rank, else year desc', () => {
  const ps = [{ id: 'a', year: 2001, title: 'A' }, { id: 'b', year: 2020, title: 'B' }];
  assert.deepEqual(M.orderPapers(ps, null).map(p => p.id), ['b', 'a']);
  assert.deepEqual(M.orderPapers(ps, [{ id: 'a' }, { id: 'b' }]).map(p => p.id), ['a', 'b']);
});
t('chip counts follow papers in scope', () => {
  const c = M.chipCounts([{ key: 'vol', label: 'Vol', count: 9 }, { key: 'x', label: 'X', count: 3 }], [{ tags: [{ key: 'vol' }] }, { tags: [{ key: 'vol' }] }]);
  assert.deepEqual(c.map(x => x.count), [2, 0]);
});
t('ring geometry clamps', () => { assert.equal(M.ringGeom(150).dash, M.ringGeom(100).dash); assert.equal(M.ringGeom(0).dash, 0); });
t('read next, notes, lessons, debounce', () => {
  assert.deepEqual(M.readNextPapers([{ id: 'a' }], { ids: ['z', 'a'], why: { a: 'because' } }), [{ paper: { id: 'a' }, why: 'because' }]);
  assert.deepEqual(M.noteRows({ claim: ' c ', mechanism: '', caveats: 'k' }).map(r => r.key), ['claim', 'caveats']);
  assert.ok(M.lessonLinks([{ key: 'volatility', label: 'Volatility' }]).some(l => l.slug === 'garch-volatility'));
  assert.equal(M.authorsLine({ authors: ['A', 'B', 'C', 'D'] }), 'A, B, C et al.');
  assert.equal(M.escapeHtml('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
  const q = []; const timers = { set: f => { q.push(f); return q.length; }, clear: id => { q[id - 1] = null; } };
  let calls = 0; const d = M.debounce(() => calls++, 10, timers); d(); d(); d(); q.forEach(f => f && f());
  assert.equal(calls, 1);
});
t('every linked lesson file exists', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'theory-lab', 'lessons');
  for (const slugs of Object.values(M.LESSONS_BY_TAG)) for (const s of slugs) assert.ok(fs.existsSync(path.join(root, s + '.html')), s);
});

// ── crop ──
t('crop rect flips y and clamps', () => {
  const r = cropRect([100, 600, 300, 640], [612, 792], 1224, 1584, 0);
  assert.deepEqual(r, { sx: 200, sy: 304, sw: 400, sh: 80 });   // top = (792-640)*2
  const edge = cropRect([-50, -50, 700, 900], [612, 792], 612, 792, 4);
  assert.deepEqual(edge, { sx: 0, sy: 0, sw: 612, sh: 792 });
  assert.equal(cropRect(null, [1, 1], 1, 1), null);
  assert.equal(cropRect([1, 1, 1, 1], [612, 792], 612, 792, 0), null);
  assert.ok(renderScale([612, 792]) <= 3 && renderScale([612, 792]) >= 1);
});

t('zoom view: a tall figure box is rendered at a bounded scale and offset to its top-left corner', () => {
  const v = zoomView([50, 100, 290, 700], [612, 792], { pad: 0, targetW: 1800, maxScale: 5, maxPixels: 12e6 });
  assert.ok(v.scale >= 1 && v.scale <= 5);
  assert.ok(v.width * v.height <= 12e6 * 1.02, 'pixel budget kept');
  assert.equal(v.width, Math.ceil(240 * v.scale)); assert.equal(v.height, Math.ceil(600 * v.scale));
  assert.ok(Math.abs(v.offsetX + 50 * v.scale) < 1e-6 && Math.abs(v.offsetY + (792 - 700) * v.scale) < 1e-6, 'viewport offset puts the crop at the canvas origin');
  const huge = zoomView([0, 0, 612, 792], [612, 792], { pad: 0 }); assert.ok(huge.width * huge.height <= 12e6 * 1.02);
  assert.equal(zoomView(null, [612, 792]), null); assert.equal(zoomView([5, 5, 5, 5], [612, 792], { pad: 0 }), null);
  const clamped = zoomView([-10, -10, 700, 900], [612, 792]); assert.equal(clamped.x0, 0); assert.equal(clamped.y1, 792);
});

// ── speech (fake synth) ──
function fake() {
  const spoken = []; const synth = { speaking: false, pending: false, paused: false, cancels: 0, pauses: 0, resumes: 0,
    speak(u) { spoken.push(u); this.pending = true; }, cancel() { this.cancels++; spoken.length = 0; this.pending = false; this.speaking = false; },
    pause() { this.pauses++; this.paused = true; }, resume() { this.resumes++; this.paused = false; } };
  class U { constructor(text) { this.text = text; } }
  return { synth, spoken, U };
}
t('splitForSpeech caps at 110 chars', () => {
  const long = 'Alpha beta gamma delta. ' + 'word '.repeat(60) + 'End.';
  const parts = S.splitForSpeech(long);
  assert.ok(parts.length >= 3 && parts.every(p => p.length <= 110), JSON.stringify(parts.map(p => p.length)));
});
t('buildQueue maps sentences to blocks', () => {
  const blocks = [{ i: 0, type: 'h1', text: 'Title here' }, { i: 1, type: 'p', text: 'Volatility clusters in calm markets, and then it jumps.' }, { i: 2, type: 'eq', text: 'x' }, { i: 3, type: 'p', text: 'Second paragraph talks about carry trades.' }];
  const q = S.buildQueue({ sentences: ['Volatility clusters in calm markets, and then it jumps.', 'Second paragraph talks about carry trades.'] }, blocks);
  assert.deepEqual(q.map(x => x.block), [1, 3]);
  assert.deepEqual(S.buildQueue({ sentences: ['a b c d e f g h', 'z'], blocks: [5, null] }, blocks).map(x => x.block), [5, -1]);
});
t('speaker queues everything synchronously, no keep-alive, stale tokens ignored', () => {
  const { synth, spoken, U } = fake(); const st = memStore(); const blocks = []; const states = [];
  const sp = S.createSpeaker({ synth, Utterance: U, storage: st, onBlock: b => blocks.push(b), onState: s => states.push(s) });
  sp.setQueue([{ text: 'one', block: 1 }, { text: 'two', block: 1 }, { text: 'three', block: 2 }, { text: 'four', block: 3 }]);
  sp.play();
  assert.equal(spoken.length, 4, 'all queued in the click call');
  assert.equal(synth.pauses + synth.resumes, 0);
  spoken[2].onstart(); assert.equal(blocks.at(-1), 2);
  const old = spoken.slice();
  sp.skip(1);                                     // next paragraph from idx 2 (block 2) -> 'four'
  assert.equal(spoken.length, 1); assert.equal(spoken[0].text, 'four');
  old[3].onend && old[3].onend();                 // stale callback from the superseded batch
  assert.equal(sp.state.playing, true);
  sp.skip(-1);                                    // back to the start of block 2
  assert.equal(spoken[0].text, 'three');
  sp.setRate('1.5'); assert.equal(st.getItem(S.RATE_KEY), '1.5'); assert.equal(spoken[0].rate, 1.5);
  spoken.at(-1).onend(); assert.equal(sp.state.playing, false);
  sp.pause(); assert.equal(synth.pauses, 1);
});
t('speaker prev goes to paragraph start, pause then play resumes', () => {
  const { synth, spoken, U } = fake(); const sp = S.createSpeaker({ synth, Utterance: U, storage: memStore() });
  sp.setQueue([{ text: 'a', block: 1 }, { text: 'b', block: 1 }, { text: 'c', block: 2 }]);
  sp.play(); spoken[1].onstart();
  sp.skip(-1); assert.equal(spoken[0].text, 'a');
  synth.speaking = true; sp.pause(); sp.play(); assert.equal(synth.resumes, 1);
});
t('voice choice persisted and restored', () => {
  const st = memStore(); const { synth, U } = fake();
  const voices = [{ name: 'Zed', lang: 'fr-FR' }, { name: 'Bob', lang: 'en-US' }, { name: 'Amy', lang: 'en-GB' }];
  const a = S.createSpeaker({ synth, Utterance: U, storage: st });
  assert.equal(a.pickVoice(voices).voice.name, 'Amy');
  a.setVoice(voices[1]);
  assert.equal(S.createSpeaker({ synth, Utterance: U, storage: st }).pickVoice(voices).voice.name, 'Bob');
});

// ── audio ──
t('pollBriefing resolves on ready, errors on stuck none', async () => {
  const seq = ['working', 'working', 'ready']; let i = 0;
  const r = await A.pollBriefing(async () => ({ status: seq[i++], secs: 60 }), { sleep: async () => {} });
  assert.equal(r.status, 'ready');
  const e = await A.pollBriefing(async () => ({ status: 'none' }), { sleep: async () => {} });
  assert.equal(e.status, 'error');
  const st = memStore(); A.savePos(st, 'p1', 42.9, 300); assert.equal(A.loadPos(st, 'p1'), 42);
  A.savePos(st, 'p1', 299, 300); assert.equal(A.loadPos(st, 'p1'), 0);
  assert.equal(A.audioUrl('a b'), '/api/library/audio?id=a%20b&mode=briefing');
});

// ── progress: copied Theory Lab merge/high-water logic ──
t('mergeRecord: high-water marks, earliest first visit/completion, latest update (TLSync.merge semantics)', () => {
  const a = { percent: 40, scrollPct: 0.4, activeSec: 100, firstVisit: 50, completedAt: null, updatedAt: 1000, pos: 7 };
  const b = { percent: 25, scrollPct: 0.6, activeSec: 30, firstVisit: 20, completedAt: 900, updatedAt: 2000, pos: 3 };
  assert.deepEqual(P.mergeRecord(a, b), { percent: 40, scrollPct: 0.6, activeSec: 100, firstVisit: 20, completedAt: 900, updatedAt: 2000, pos: 3 });
  assert.deepEqual(P.mergeRecord(null, b), b); assert.equal(P.mergeRecord(null, null), null);
  assert.ok(P.mergeRecord(a, null) !== a, 'copies');
});
t('mergeStores unions papers and ignores junk', () => {
  const m = P.mergeStores({ a: { percent: 10 }, b: 'junk' }, { a: { percent: 30 }, c: { percent: 5 } });
  assert.equal(m.a.percent, 30); assert.equal(m.c.percent, 5); assert.equal(m.b, null);
  assert.deepEqual(P.mergeStores(null, undefined), {});
});
t('merge is idempotent and commutative on percent', () => {
  const x = { a: { percent: 12, updatedAt: 1 } }, y = { a: { percent: 70, updatedAt: 2 } };
  assert.equal(P.mergeStores(x, y).a.percent, P.mergeStores(y, x).a.percent);
  assert.deepEqual(P.mergeStores(P.mergeStores(x, y), y), P.mergeStores(x, y));
});
t('recordFromServer maps {pct,pos,at,done}', () => {
  const r = P.recordFromServer({ pct: 55, pos: 9, at: 1234, done: false });
  assert.equal(r.percent, 55); assert.equal(r.pos, 9); assert.equal(r.completedAt, null);
  assert.ok(P.recordFromServer({ pct: 100, done: true, at: 5 }).completedAt);
  assert.equal(P.recordFromServer(null), null);
});
t('tracker: percent is a high-water mark of scroll and active time', () => {
  const st = memStore(); let sc = 0.3, clock = 1000;
  const tr = P.createTracker({ storage: st, id: 'p', readSec: 100, now: () => clock, scrollPctNow: () => sc });
  assert.equal(tr.bestPercent(), 30);
  tr.onScroll(4); sc = 0.1; assert.equal(tr.bestPercent(), 30, 'scrolling back up never drops it');
  for (let i = 0; i < 50; i++) tr.tick(true); tr.tick(false);
  assert.equal(tr.bestPercent(), 50, 'time signal 50/100 s');
  clock = 2000; tr.persist();
  const saved = P.storeApi(st).read().p;
  assert.equal(saved.percent, 50); assert.equal(saved.pos, 4); assert.equal(saved.completedAt, null);
  sc = 1; tr.onScroll(9); tr.persist();
  assert.equal(P.storeApi(st).read().p.percent, 100); assert.ok(P.storeApi(st).read().p.completedAt);
  const again = P.createTracker({ storage: st, id: 'p', readSec: 100, now: () => 3000, scrollPctNow: () => 0 });
  assert.equal(again.bestPercent(), 100, 'resumes from stored');
  assert.equal(P.readSecFor(0), 60); assert.ok(P.readSecFor(300000) > 600);
});
t('persist does not clobber another tab\'s paper', () => {
  const st = memStore(); P.storeApi(st).write({ other: { percent: 80 } });
  const tr = P.createTracker({ storage: st, id: 'p', readSec: 100, now: () => 1, scrollPctNow: () => 0.2 }); tr.persist();
  const s = P.storeApi(st).read(); assert.equal(s.other.percent, 80); assert.equal(s.p.percent, 20);
});
await t('sync push: only when changed, 1/min gap, merges the reply, posts per paper', async () => {
  const st = memStore(); let clock = 1e6; const posts = []; let reply = null; const timers = [];
  P.storeApi(st).write({ p: { percent: 30, scrollPct: 0.3, activeSec: 5, firstVisit: 1, completedAt: null, updatedAt: 10, pos: 2 } });
  const sync = P.createSync({ storage: st, now: () => clock, setTimer: (f, ms) => { timers.push([f, ms]); return 1; }, post: async b => { posts.push(b); return reply; } });
  reply = { ok: true, progress: { p: { pct: 60, pos: 8, at: 20, done: false }, q: { pct: 5, pos: 1, at: 3, done: false } } };
  await sync.push();
  assert.equal(posts.length, 1); assert.equal(posts[0].id, 'p'); assert.equal(posts[0].pct, 30); assert.equal(posts[0].pos, 2);
  assert.equal(P.storeApi(st).read().p.percent, 60, 'other device progress merged in');
  await sync.push(); assert.equal(posts.length, 1, 'unchanged -> no post');
  P.storeApi(st).write({ p: { ...P.storeApi(st).read().p, percent: 70, updatedAt: 30 } });
  await sync.push(); assert.equal(posts.length, 1, 'within a minute -> deferred'); assert.equal(timers.length, 1);
  clock += 61000; reply = null; await sync.push(); assert.equal(posts.length, 2); assert.equal(posts[1].pct, 70);
});
t('pullFromPapers folds server progress into local without lowering it', () => {
  const st = memStore(); P.storeApi(st).write({ a: { percent: 90, updatedAt: 5 } });
  const sync = P.createSync({ storage: st, post: async () => null });
  sync.pullFromPapers([{ id: 'a', progress: { pct: 40, pos: 1, at: 9 } }, { id: 'b', progress: { pct: 20, pos: 3, at: 9 } }, { id: 'c', progress: null }]);
  const s = P.storeApi(st).read(); assert.equal(s.a.percent, 90); assert.equal(s.b.percent, 20); assert.ok(!s.c);
});

// ── years and sorting ──
t('year filter: OR within years, AND with topics and sources, unknown is a bucket', () => {
  const ps = [
    { id: 'a', year: 2025, yearKey: '2025', source: { key: 'ssrn' }, tags: [{ key: 'vol' }] }, { id: 'b', year: 2012, yearKey: 'd2010', source: { key: 'nber' }, tags: [{ key: 'vol' }] },
    { id: 'c', year: null, yearKey: 'unknown', source: { key: 'ssrn' }, tags: [{ key: 'cot' }] }, { id: 'd', year: 1980, yearKey: 'earlier', tags: [] }, { id: 'e', year: 2024, tags: [] }];
  const ids = (...a) => M.filterPapers(ps, ...a).map(p => p.id);
  assert.deepEqual(ids([], null, [], []), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(ids([], null, [], ['2025', 'd2010']), ['a', 'b']);
  assert.deepEqual(ids([], null, [], ['unknown']), ['c']);
  assert.deepEqual(ids(['vol'], null, [], ['d2010', 'unknown']), ['b']);
  assert.deepEqual(ids([], null, ['ssrn'], ['2025', 'unknown']), ['a', 'c']);
  assert.deepEqual(ids([], new Set(['a', 'b']), [], ['d2010']), ['b']);
  assert.deepEqual(ids([], null, [], ['2024']), ['e']);   // no yearKey: falls back to the year itself
  assert.deepEqual(ids([], null, [], ['d1990']), []);
});
t('year chips follow the papers in scope and keep a selected key at zero', () => {
  const ys = [{ key: '2025', label: '2025' }, { key: 'd2010', label: '2010s' }, { key: 'unknown', label: 'Unknown year' }];
  assert.deepEqual(M.yearChips(ys, [{ yearKey: '2025' }, { yearKey: '2025' }, { year: null }]).map(c => [c.key, c.count]), [['2025', 2], ['d2010', 0], ['unknown', 1]]);
  assert.deepEqual(M.yearChips(ys, [], ['gone']).map(c => [c.key, c.count]), [['2025', 0], ['d2010', 0], ['unknown', 0], ['gone', 0]]);
});
t('sort: newest / oldest with unknown years last in both, title tie-break', () => {
  const ps = [{ id: 'u1', title: 'B', year: null }, { id: 'a', title: 'A', year: 2020 }, { id: 'b', title: 'B', year: 2010 }, { id: 'c', title: 'C', year: 2020 }, { id: 'u0', title: 'A', year: null }];
  const ids = (m, o) => M.sortPapers(ps, m, o).map(p => p.id);
  assert.deepEqual(ids('newest'), ['a', 'c', 'b', 'u0', 'u1']);
  assert.deepEqual(ids('oldest'), ['b', 'a', 'c', 'u0', 'u1']);
  assert.deepEqual(ids('title'), ['a', 'u0', 'u1', 'b', 'c']);
  assert.deepEqual(ids('bogus'), ids('newest'));
  assert.deepEqual(ps.map(p => p.id), ['u1', 'a', 'b', 'c', 'u0']);   // input not mutated
});
t('sort: best match keeps the ranking, read orders use the percent read, match without hits is newest', () => {
  const ps = [{ id: 'a', title: 'A', year: 2001 }, { id: 'b', title: 'B', year: 2002 }, { id: 'c', title: 'C', year: 2003 }];
  assert.deepEqual(M.sortPapers(ps, 'match', { hits: [{ id: 'c' }, { id: 'a' }, { id: 'b' }] }).map(p => p.id), ['c', 'a', 'b']);
  assert.deepEqual(M.sortPapers(ps, 'match').map(p => p.id), ['c', 'b', 'a']);
  const pct = p => ({ a: 0, b: 80, c: 30 })[p.id];
  assert.deepEqual(M.sortPapers(ps, 'read', { pct }).map(p => p.id), ['b', 'c', 'a']);
  assert.deepEqual(M.sortPapers(ps, 'unread', { pct }).map(p => p.id), ['a', 'c', 'b']);
  assert.deepEqual(M.orderPapers(ps, [{ id: 'b' }, { id: 'a' }, { id: 'c' }]).map(p => p.id), ['b', 'a', 'c']);
  assert.ok(M.sortKeyOk('oldest') && !M.sortKeyOk('x')); assert.equal(M.DEFAULT_SORT, 'newest');
});
t('year text: ~ marks years estimated from the file name or text only', () => {
  assert.equal(M.yearText({ year: 2019, yearFrom: 'given' }), '2019'); assert.equal(M.yearText({ year: 2019, yearFrom: 'arxiv' }), '2019');
  assert.equal(M.yearText({ year: 2019, yearFrom: 'text' }), '~2019'); assert.equal(M.yearText({ year: 2019, yearFrom: 'filename' }), '~2019');
  assert.equal(M.yearText({ year: null }), ''); assert.equal(M.yearText({ year: 2019 }), '2019');
});
console.log(`library tests: ${n} passed`);
