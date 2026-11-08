// The librarian (js/libraryLibrarian.js): scan, pick, fetch, caps and fallbacks. Synthetic papers only; the model is a fake (no key, no network).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as LIX from './libraryIndex.js';
import * as LBR from './libraryLibrarian.js';
import { createLibraryApi } from './libraryApi.js';
import { uploadKey } from './researchLibrary.js';
import { buildStagePrompt } from './deskRoles.js';
import { fitSections } from './researchCase.js';

const rd = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const NOTES = { claim: 'Extreme net speculative positions predict EURUSD returns.', mechanism: 'Crowded speculators unwind.', data: { market: 'EURUSD futures', period: '2006-2017', frequency: 'weekly' }, method: 'Sorts on weekly COT positioning', effect: 'Small', outOfSample: 'yes', costs: 'no', relevance: 'r', stance: 'supports', caveats: ['c'], testHere: 'Rank weekly COT positioning.' };
const mkp = (id, title, tags, claim, o = {}) => ({ id, title, year: o.year ?? 2018, source: { key: 'ssrn', label: 'SSRN' }, tags: tags.map(key => ({ key })), notes: claim ? { ...NOTES, claim, testHere: o.testHere ?? 'x', method: o.method ?? 'Regression' } : null, desk: o.desk ?? [] });
const PAPERS = [
  mkp('cot1', 'Speculative Positioning and Currency Returns (synthetic)', ['cot', 'fx'], NOTES.claim, { desk: [{ id: 'e1', verdict: 'dead' }] }),
  mkp('cot2', 'Commitments of Traders Extremes in Futures (synthetic)', ['cot'], 'Large speculator extremes in futures reverse.'),
  mkp('gold1', 'Gold and Real Yields (synthetic)', ['commodities'], 'Gold moves inversely with real yields.'),
  mkp('vol1', 'Volatility Clustering and Jumps (synthetic)', ['volatility', 'jump'], 'Jumps follow volatility clustering.'),
  mkp('carry1', 'Carry Trade Crash Risk (synthetic)', ['fx'], 'Carry returns crash in high-vol states.', { year: 2012 }),
  mkp('abs1', 'An Unread Paper About Positioning (synthetic)', ['cot'], null),
];
const ix = LIX.buildIndex(PAPERS), byId = new Map(PAPERS.map(p => [p.id, p]));
const memKv = () => { const m = new Map(); return { m, getStrict: async k => m.get(k) ?? null, get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; };
const Q = 'Does COT positioning predict EURUSD returns?';

// ── queries ──────────────────────────────────────────────────────────────────────────────────────────────────

test('buildQueries: 3-6 keyword queries with the asset, a topic phrase and the plain keywords; deterministic; nothing for an empty question', () => {
  const qs = LBR.buildQueries(Q);
  assert.ok(qs.length >= 3 && qs.length <= 6, JSON.stringify(qs));
  assert.ok(qs.some(q => /eurusd/i.test(q)), 'the pair is kept');
  assert.ok(qs.some(q => /speculator|position/i.test(q)), 'a COT topic phrase');
  assert.ok(qs.every(q => q.length < 120 && !/[?]/.test(q)));
  assert.equal(new Set(qs.map(q => q.toLowerCase())).size, qs.length, 'no duplicates');
  assert.deepEqual(LBR.buildQueries(Q), qs);
  assert.deepEqual(LBR.buildQueries(''), []); assert.deepEqual(LBR.buildQueries('the of and'), []);
  assert.ok(LBR.buildQueries('Is gold a hedge when real yields rise?').some(q => /gold/i.test(q)));
  assert.deepEqual(LBR.assetsOf('EUR/USD and USDJPY versus the VIX and gold'), ['eurusd', 'usdjpy', 'vix', 'gold']);
  const thin = LBR.buildQueries('mystery quantum widgets'); assert.ok(thin.length >= 3, 'padded from the words');
});

// ── scan ─────────────────────────────────────────────────────────────────────────────────────────────────────

test('scan: merges by id keeping the best score and the union of why, caps at 25, best first', () => {
  const qs = ['COT positioning EURUSD', 'speculator net positioning futures', 'currency carry'];
  const c = LBR.scan(ix, qs);
  assert.equal(new Set(c.map(r => r.id)).size, c.length, 'deduped');
  const best = id => Math.max(...qs.map(q => LIX.search(ix, q, { n: 12 }).find(r => r.id === id)?.score ?? 0));
  for (const r of c) assert.equal(r.score, best(r.id), `best score kept for ${r.id}`);
  const cot1 = c.find(r => r.id === 'cot1'); assert.ok(cot1.qs >= 2);
  const termsOf = q => LIX.search(ix, q, { n: 12 }).find(r => r.id === 'cot1')?.why.terms ?? [];
  assert.deepEqual([...new Set(qs.flatMap(termsOf))].sort(), [...cot1.why.terms].sort(), 'union of the matched terms');
  for (let i = 1; i < c.length; i++) assert.ok(c[i - 1].score >= c[i].score);
  // cap
  const many = Array.from({ length: 60 }, (_, i) => mkp(`m${i}`, `${['zebra', 'yak', 'xray'][i % 3]} study number ${i} (synthetic)`, ['cot'], `Positioning claim ${i}.`));
  const big = LIX.buildIndex(many);
  assert.equal(LBR.scan(big, ['zebra', 'yak', 'xray']).length, 25, '3 x 12 hits merge, then the cap');
  assert.equal(LBR.scan(big, ['zebra', 'yak', 'xray'], { cap: 7 }).length, 7);
  assert.deepEqual(LBR.scan(ix, ['zzzzqqqq']), []);
});

test('candidateText: a compact numbered list within 3000 tokens, rows not cut, with every index field', () => {
  const c = LBR.scan(ix, ['COT positioning EURUSD']), t = LBR.candidateText(c);
  assert.ok(t.text.startsWith('1. [') && t.rows.length === t.text.split('\n').length);
  const line = t.text.split('\n').find(l => l.includes('[cot1]'));
  for (const bit of ['Speculative Positioning', '(2018)', 'ssrn', 'claim:', 'evidence: out-of-sample', 'market:', 'method:', 'test here:', 'our verdicts: dead']) assert.ok(line.includes(bit), bit);
  assert.ok(t.text.includes('not read in full'), 'an unread paper says so');
  const many = LIX.buildIndex(Array.from({ length: 40 }, (_, i) => mkp(`m${i}`, `Positioning study ${i} ${'long title words '.repeat(5)}`, ['cot'], `Claim ${i}. ${'More words about positioning. '.repeat(8)}`, { testHere: 'Test here. '.repeat(20) })));
  const big = LBR.candidateText(LBR.scan(many, ['positioning']));
  assert.ok(Math.ceil(big.text.length / 4) <= 3000, `${big.text.length} chars`);
  assert.ok(big.text.split('\n').every(l => /^\d+\. \[/.test(l)));
});

// ── prompt and validation ────────────────────────────────────────────────────────────────────────────────────

test('librarianPrompt: the question, the queries and the numbered candidates; the system asks for strict JSON', () => {
  const c = LBR.candidateText(LBR.scan(ix, ['COT positioning EURUSD'])), p = LBR.librarianPrompt(Q, ['COT positioning EURUSD'], c.text);
  assert.ok(p.prompt.includes(`QUESTION:\n${Q}`) && p.prompt.includes('"COT positioning EURUSD"') && p.prompt.includes('CANDIDATES (') && p.prompt.includes('1. [cot1]'));
  for (const w of ['"picks"', '"refine"', '"none"', 'at most 6', 'ONE JSON object', 'Use only ids from the list']) assert.ok(p.system.includes(w), w);
  assert.ok(!p.prompt.includes('SECOND scan') && LBR.librarianPrompt(Q, ['q'], 'x', { round: 2 }).prompt.includes('SECOND scan'));
});

test('validatePicks: unknown ids dropped, duplicates collapse, over-cap picks cut, list numbers accepted, refine capped', () => {
  const cands = Array.from({ length: 10 }, (_, i) => ({ id: `id${i}` }));
  const v = LBR.validatePicks({ picks: [{ id: 'id3', why: 'a' }, { id: 'made-up', why: 'b' }, { id: 'id3', why: 'dup' }, { id: '2', why: 'by number' }, { id: 'id0' }, { id: 'id1' }, { id: 'id4' }, { id: 'id5' }, { id: 'id6' }, { id: 'id7' }], refine: ['one', 'two', 'three', 'four', '', 5], none: false }, cands);
  assert.deepEqual(v.picks.map(p => p.id), ['id3', 'id1', 'id0', 'id4', 'id5', 'id6'], 'max 6, order kept, the list number 2 means the second line (id1)');
  assert.equal(v.picks[0].why, 'a'); assert.equal(v.picks[2].why, '');
  assert.ok(v.dropped >= 3); assert.equal(v.refine.length, 3);
  assert.equal(LBR.validatePicks({ picks: [{ id: 'x' }] }, cands).picks.length, 0);
  assert.deepEqual(LBR.validatePicks('garbage', cands), { picks: [], refine: [], none: false, dropped: 0 });
  assert.deepEqual(LBR.validatePicks(null, cands).picks, []);
  assert.equal(LBR.validatePicks({ picks: [{ id: 'id1' }, { id: 'id2' }, { id: 'id3' }] }, cands, { max: 2 }).picks.length, 2);
  assert.equal(LBR.validatePicks({ picks: [], none: true }, cands).none, true);
  assert.equal(LBR.validatePicks({ picks: [{ id: 'id1', why: 'x'.repeat(500) }] }, cands).picks[0].why.length, 160);
});

// ── the run ──────────────────────────────────────────────────────────────────────────────────────────────────

const fakeModel = replies => { const calls = []; const f = async a => { calls.push(a); const r = replies[Math.min(calls.length - 1, replies.length - 1)]; if (r instanceof Error) throw r; return typeof r === 'function' ? r(a) : r; }; f.calls = calls; return f; };
const run = (model, o = {}) => LBR.runLibrarian({ question: Q, ix, papers: byId, model, budget: o.budget ?? LBR.createBudget({ kv: memKv() }), modelReady: o.ready, figNotesFor: o.fig, ...o.extra });

test('runLibrarian: one scan, ONE model call, then digests only for the picked papers, with the librarian section', async () => {
  const model = fakeModel([{ picks: [{ id: 'cot1', why: 'Same market and out-of-sample.' }, { id: 'nope', why: 'x' }, { id: 'cot2', why: 'Same signal in futures.' }], none: false }]);
  const r = await run(model, { fig: async ids => ({ cot1: { 'Figure 1': { text: 'Returns fall after extremes.' }, 'Figure 2': { text: 'Net of costs the edge halves.' }, 'Figure 3': { text: 'Stable by sub-period.' }, 'Table 9': { text: 'a fourth, dropped' } } }) });
  assert.equal(r.ok, true); assert.equal(r.calls, 1); assert.equal(model.calls.length, 1);
  assert.deepEqual(r.picks.map(p => p.id), ['cot1', 'cot2']); assert.deepEqual(r.ids, ['cot1', 'cot2']); assert.equal(r.none, false);
  assert.ok(r.queries.length >= 3 && r.candidates.every(c => c.id && c.title));
  assert.ok(r.title.startsWith('LIBRARY (picked by the librarian)'));
  assert.ok(r.text.includes('[P1] Picked because: Same market and out-of-sample.') && r.text.includes('Cite as: cot1') && r.text.includes('[P2] Picked because: Same signal in futures.'));
  assert.ok(r.text.includes('id: cot1 | Speculative Positioning') && r.text.includes('Claim:') && r.text.includes('Test here:'));
  assert.ok(r.text.includes('Figures: Figure 1: Returns fall after extremes. | Figure 2: Net of costs the edge halves. | Figure 3: Stable by sub-period.') && !r.text.includes('a fourth, dropped'), 'up to 3 figure notes');
  assert.ok(/not the full paper/.test(r.text) && /no held paper covers this/.test(r.text), 'the closing line');
  assert.ok(!r.text.includes('gold1') && !r.text.includes('Gold and Real Yields'), 'no digest for papers that were not picked');
  for (const b of r.text.split(/\n(?=\[P\d+\])/).slice(1)) assert.ok(b.split('\nCite as:')[0].length <= 900 + 120, 'each digest stays near 900 chars');
  assert.ok(model.calls[0].prompt.includes('CANDIDATES') && !model.calls[0].prompt.includes('Mechanism:'), 'the pick call sees index rows, not digests');
  assert.ok(Math.ceil(model.calls[0].prompt.length / 4) < 4500);
});

test('runLibrarian: refine runs exactly one more scan and pick (hard cap of 2 calls), then picks or says none', async () => {
  // refine -> second call picks
  const m1 = fakeModel([{ picks: [], refine: ['speculator net positioning currency futures'] }, { picks: [{ id: 'cot2', why: 'second round' }], refine: ['ignored'] }]);
  const r1 = await run(m1); assert.equal(r1.ok, true); assert.equal(r1.calls, 2); assert.deepEqual(r1.ids, ['cot2']);
  assert.ok(r1.queries.includes('speculator net positioning currency futures') && m1.calls[1].prompt.includes('SECOND scan') && m1.calls[1].prompt.includes('"speculator net positioning currency futures"'));
  // refine, then refine again: never a third call; the answer is none
  const m2 = fakeModel([{ picks: [], refine: ['gold real yields'] }, { picks: [], refine: ['carry'] }, { picks: [{ id: 'cot1' }] }]);
  const r2 = await run(m2); assert.equal(m2.calls.length, 2); assert.equal(r2.ok, true); assert.equal(r2.none, true); assert.equal(r2.calls, 2); assert.deepEqual(r2.ids, []);
  // refine whose queries find nothing: no second call
  const m3 = fakeModel([{ picks: [], refine: ['zzzzqqqq'] }]); const r3 = await run(m3); assert.equal(m3.calls.length, 1); assert.equal(r3.none, true);
  // picks given AND refine: the picks win, no second call
  const m4 = fakeModel([{ picks: [{ id: 'cot1', why: 'w' }], refine: ['gold'] }]); await run(m4); assert.equal(m4.calls.length, 1);
});

test('runLibrarian: the none case injects a short note, records none and picks nothing', async () => {
  const r = await run(fakeModel([{ picks: [], none: true }]));
  assert.equal(r.ok, true); assert.equal(r.none, true); assert.deepEqual(r.picks, []); assert.deepEqual(r.ids, []); assert.equal(r.calls, 1);
  assert.ok(r.text.includes('no held paper covers this') && r.text.length < 400 && r.text.startsWith('LIBRARY'));
  const rec = LBR.librarianRecord(r); assert.deepEqual(Object.keys(rec), ['queries', 'picked', 'none', 'calls']); assert.equal(rec.none, true);
});

test('runLibrarian: every failure is { ok:false, reason } so the caller uses the rule-based context', async () => {
  const bad = async (model, o) => { const r = await run(model, o); assert.equal(r.ok, false); assert.ok(r.reason); return r; };
  assert.match((await bad(fakeModel([new Error('timeout after 60s')]))).reason, /model failed: timeout/);
  assert.match((await bad(fakeModel(['not json at all']))).reason, /no usable picks/);
  assert.match((await bad(fakeModel([{ picks: [{ id: 'invented' }] }]))).reason, /no usable picks/);
  assert.match((await bad(fakeModel([{ picks: [] }]))).reason, /no usable picks/);
  assert.match((await bad(fakeModel([{ picks: [{ id: 'cot1' }] }]), { ready: () => false })).reason, /no model key/);
  assert.match((await bad(null)).reason, /no model/);
  const m = fakeModel([{ picks: [{ id: 'cot1' }] }]);
  assert.match((await bad(m, { ready: () => false })).reason, /key/); assert.equal(m.calls.length, 0, 'no key: no call and no budget used');
  // a question with no usable word, and a question that finds nothing: no model call
  const e = fakeModel([{}]); assert.equal((await LBR.runLibrarian({ question: 'the of', ix, papers: byId, model: e, budget: LBR.createBudget({ kv: memKv() }) })).ok, false);
  const z = await LBR.runLibrarian({ question: 'zzzzqqqq wwwwxxxx', ix, papers: byId, model: e, budget: LBR.createBudget({ kv: memKv() }) });
  assert.equal(z.ok, false); assert.match(z.reason, /no candidates/); assert.equal(e.calls.length, 0);
  // a budget that cannot be read
  const broken = LBR.createBudget({ kv: { getStrict: async () => { throw new Error('kv down'); }, put: async () => {} } });
  assert.match((await bad(fakeModel([{ picks: [{ id: 'cot1' }] }]), { budget: broken })).reason, /budget unreadable/);
  // a throwing figure-notes reader does not fail the run
  const ok = await run(fakeModel([{ picks: [{ id: 'cot1', why: 'w' }] }]), { fig: async () => { throw new Error('r2 down'); } }); assert.equal(ok.ok, true);
});

test('the cap: calls are reserved in KV library_librarian_v1 before the call; at the cap the run falls back without a model call', async () => {
  const kv = memKv(), budget = LBR.createBudget({ kv, cap: 3 });
  const m = fakeModel([{ picks: [{ id: 'cot1', why: 'w' }] }]);
  assert.equal((await run(m, { budget })).calls, 1); assert.equal((await run(m, { budget })).calls, 1);
  assert.equal(JSON.parse(kv.m.get('library_librarian_v1')).used, 2);
  assert.equal((await run(m, { budget })).ok, true);
  const capped = await run(m, { budget }); assert.equal(capped.ok, false); assert.match(capped.reason, /cap reached/); assert.equal(m.calls.length, 3, 'no fourth model call');
  assert.deepEqual(await budget.status(), { used: 3, cap: 3, left: 0 });
  // a failed call still counts; a refine round needing a second call at the cap falls back
  const k2 = memKv(), b2 = LBR.createBudget({ kv: k2, cap: 1 }); const m2 = fakeModel([{ picks: [], refine: ['carry crash'] }, { picks: [{ id: 'carry1' }] }]);
  const r2 = await run(m2, { budget: b2 }); assert.equal(r2.ok, false); assert.match(r2.reason, /cap reached before the second scan/); assert.equal(m2.calls.length, 1);
  assert.equal(LBR.LIBRARIAN_CAP, 400); assert.equal(LBR.RUN_CALLS_MAX, 2);
  // concurrent takes never pass the cap
  const b3 = LBR.createBudget({ kv: memKv(), cap: 5 }); const got = await Promise.all(Array.from({ length: 9 }, () => b3.take(1)));
  assert.equal(got.filter(Boolean).length, 5);
});

// ── prompts: flag off byte-identical, one run per round shared by the researchers ───────────────────────────────

const role = { id: 'r', body: 'You are a researcher.', output: 'case_answer', evidence: [] };
const base = () => [['The question', Q], ['How to answer', 'Be brief.'], ["The owner's message", 'go on']];
const stage = secs => buildStagePrompt({ role, pack: { date: '2026-11-08' }, ledger: [], sections: fitSections(secs, 60000) });

test('flag off: no context, the prompt is byte-identical; flag on: exactly one LIBRARY (picked by the librarian) section, built once and shared', async () => {
  const plain = stage(base());
  assert.equal(LIX.withLibrary(base(), null, { beforeLast: true }).length, 3);
  assert.equal(stage(LIX.withLibrary(base(), null, { beforeLast: true })).prompt, plain.prompt);
  assert.equal(LIX.libraryContextOn({}), false);
  const model = fakeModel([{ picks: [{ id: 'cot1', why: 'Same market.' }] }]);
  const ctx = await run(model);   // ONE run for the round
  const prompts = ['quant', 'macro', 'flow'].map(() => stage(LIX.withLibrary(base(), ctx, { beforeLast: true })));
  assert.equal(model.calls.length, 1, 'three researchers, one librarian call');
  for (const p of prompts) {
    assert.equal(p.prompt, prompts[0].prompt); assert.equal((p.prompt.match(/## LIBRARY \(picked by the librarian\)/g) ?? []).length, 1);
    assert.ok(p.prompt.indexOf('## LIBRARY') > p.prompt.indexOf('## How to answer') && p.prompt.indexOf('## LIBRARY') < p.prompt.indexOf("## The owner's message"));
    assert.equal(p.prompt.replace(/## LIBRARY \(picked[\s\S]*?(?=## The owner's message)/, ''), plain.prompt);
  }
  // the old rule-based section keeps its title
  const old = stage(LIX.withLibrary(base(), LIX.buildContext(Q, ix, byId), { beforeLast: true })); assert.ok(old.prompt.includes('## LIBRARY: held papers most related'));
});

// ── the API layer: roundContext falls back to the rule-based context ────────────────────────────────────────────

function apiHarness({ model, ready = true } = {}) {
  const store = new Map(); store.set('q', JSON.stringify({ items: [] }));
  store.set('pp', JSON.stringify(PAPERS.map(p => ({ id: p.id, title: p.title, year: p.year, readFrom: 'pdf', abstract: 'a', notes: p.notes, ssrn: null }))));
  const api = createLibraryApi({
    kv: { get: async k => store.get(k) ?? null, getStrict: async k => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); } },
    r2: { ok: () => false, getBuffer: async () => null, putBuffer: async () => {} }, keys: { queue: 'q', papers: 'pp' }, uploadKey,
    extractPages: async () => { throw new Error('none'); }, tts: { getProvider: () => ({ name: 'f', free: true }), makeMp3: async () => Buffer.from('x') },
    readTodoMd: () => '', lessonFiles: () => [], cases: { read: async () => ({ cases: [] }), put: async () => {} }, log: { warn() {} },
    librarianModel: model, modelReady: () => ready,
  });
  return { api, store };
}

test('API roundContext: the librarian when it works; the rule-based context (with the reason recorded) when it does not', async () => {
  const q = 'speculative positioning currency returns';
  const m = fakeModel([{ picks: [{ id: 'cot1', why: 'Same signal.' }] }]); const h = apiHarness({ model: m });
  const ok = await h.api.roundContext(q);
  assert.deepEqual(ok.ids, ['cot1']); assert.ok(ok.text.includes('Picked because: Same signal.') && ok.title.startsWith('LIBRARY (picked'));
  assert.deepEqual(ok.librarian.picked, [{ id: 'cot1', why: 'Same signal.' }]); assert.equal(ok.librarian.calls, 1); assert.equal(ok.librarian.fallback, undefined);
  assert.equal(JSON.parse(h.store.get('library_librarian_v1')).used, 1);
  for (const [name, o, re] of [['throws', { model: fakeModel([new Error('boom')]) }, /model failed/], ['bad json', { model: fakeModel(['<html>']) }, /no usable picks/], ['no key', { model: fakeModel([{}]), ready: false }, /no model key/], ['no model', { model: undefined }, /no model/]]) {
    const f = await apiHarness(o).api.roundContext(q);
    assert.ok(f.text.startsWith('LIBRARY:') && f.text.includes('[P1] id: cot1'), `${name}: the old rule-based context`);
    assert.match(f.librarian.fallback, re, name); assert.equal(f.title, undefined);
  }
  const capped = apiHarness({ model: m }); capped.store.set('library_librarian_v1', JSON.stringify({ v: 1, used: 400, at: null }));
  const before = m.calls.length; const c = await capped.api.roundContext(q);
  assert.match(c.librarian.fallback, /cap reached/); assert.equal(m.calls.length, before, 'at the cap: no model call'); assert.ok(c.text.startsWith('LIBRARY:'));
  assert.equal(await h.api.roundContext('   '), null);
  assert.deepEqual(await h.api.librarianStatus(), { used: 1, cap: 400, left: 399 });
});

// ── source assertions ────────────────────────────────────────────────────────────────────────────────────────

test('server.js: the librarian never runs when the flag is off, runs once per round, and is wired in the same three call sites as withLibrary', () => {
  const src = rd('../server.js');
  const fn = src.slice(src.indexOf('async function _libRoundCtx'), src.indexOf('/** On first read in this process'));
  assert.ok(fn.indexOf("if (!(await readToggle('libraryContext'))) return null;") > 0 && fn.indexOf("if (!(await readToggle('libraryContext'))) return null;") < fn.indexOf('_libApi.roundContext'), 'flag check first');
  assert.equal((src.match(/_libApi\.roundContext\(/g) ?? []).length, 1, 'only _libRoundCtx reaches the librarian from a round');
  const uses = src.split('\n').filter(l => l.includes('_libRoundCtx('));
  assert.equal(uses.filter(l => /const libCtx = await _libRoundCtx\(/.test(l)).length, 3, 'round 1, later rounds, the Head review');
  assert.equal(src.split('\n').filter(l => /_libApi\.librarian\(/.test(l)).length, 2, 'the preview (librarian=1 only) and the owner route');
  const prev = src.slice(src.indexOf('const _rcLibraryPreview'), src.indexOf("app.post('/api/research-pod/case/library-preview'"));
  assert.ok(prev.includes("const wantLib = /^(1|true|yes|on)$/i.test(String(src.librarian ?? ''))") && prev.includes('wantLib ? await _libApi.librarian('), 'preview: no librarian without librarian=1');
  // the researchers' Promise.all bodies never call it: it is computed before them and shared
  for (const m of src.matchAll(/await Promise\.all\(\s*(?:lenses\.filter\([^\n]*|_RCS\.LENSES\.map\([^\n]*)\n([\s\S]*?)\n  \}\)\);/g)) assert.ok(!m[1].includes('_libRoundCtx') && !m[1].includes('roundContext') && !m[1].includes('.librarian('));
  assert.ok(src.includes("task: 'library-librarian'") && src.includes('librarianModel:'));
  assert.ok(src.includes("app.post('/api/research-pod/librarian'"));
  assert.ok(src.includes('librarian: libCtx?.librarian') && src.includes('libCtx.librarian ? { librarian: libCtx.librarian }'));
  const api = rd('./libraryApi.js'); assert.ok(!/librarian/.test(api.slice(api.indexOf('H.contextFor'), api.indexOf('// ── the librarian'))), 'the rule-based contextFor is untouched');
});

test('the KV key and the router task are registered everywhere', () => {
  for (const f of ['../kv.js', '../js/storeRegistry.js']) assert.ok(rd(f).includes('library_librarian_v1'), f);
  assert.equal((rd('../_worker.js').match(/'library_librarian_v1'/g) ?? []).length, 2, 'both lists in _worker.js');
  assert.match(rd('./modelRouter.js'), /'library-librarian': \{ ledger: 'brief'.*defaultProvider: 'deepseek'/);
  assert.equal(LBR.LIBRARIAN_KV_KEY, 'library_librarian_v1');
});

test('the Ask-the-librarian box: markup, API call and result rendering (no model call in the page)', async () => {
  const html = rd('../library.html'); assert.ok(html.includes('id="lbBox"') && html.includes('id="lbGo"') && html.includes('id="lbOut"') && /one small AI call/.test(html));
  assert.ok(rd('./library/api.js').includes("post('/api/research-pod/librarian'"));
  const V = await import('./library/librarianView.js');
  const h = V.resultHtml({ queries: ['a b'], candidates: [{}, {}], picks: [{ id: 'p<1>', title: 'T <b>', year: 2020, why: 'because & so' }], none: false, calls: 1, cap: { used: 3, cap: 400 } });
  assert.ok(h.includes('href="#/paper/p%3C1%3E"') && h.includes('T &lt;b&gt;') && h.includes('because &amp; so') && h.includes('1 small AI call used (3 of 400') && !h.includes('<b>'));
  assert.ok(V.resultHtml({ queries: [], candidates: [], picks: [], none: true, calls: 1 }).includes('found no held paper'));
});
