// js/libraryMath.js: the capped equations job, validation, merging. Synthetic fixtures, a mocked model and a mocked arXiv: nothing calls out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMath, validateLatex, readReply, promptItem, buildPrompt, resolveLatex, mergeLatexIntoBlocks, MATH_CAP, MATH_KV_KEY, MATH_PRESS_MAX, MATH_BATCH, MATH_SYSTEM, readMathFile } from './libraryMath.js';
import { uploadKey } from './researchLibrary.js';

const it = (str, x, y = 500, h = 10) => [str, x, y, str.length * h * 0.5, h, 0];
const GOOD = { it: [it('x', 100), it('=', 110), it('a', 120), it('+', 128), it('b', 138)], fonts: ['F'] };            // reads cleanly (conf 1)
const BAD = n => ({ it: [it('y', 100), it('=', 110), it('\uF8FF', 120), it(String(n), 130)], fonts: ['F'] });          // an unknown glyph: needs the model
const eq = (i, src, label) => ({ i, type: 'eq', text: 'text ' + i, page: 1, bbox: [0, 0, 1, 1], ...(label ? { label } : {}), ...(src ? { src } : {}) });
const para = (i, text) => ({ i, type: 'p', text, page: 1, bbox: null });

function rig({ papers, blocksById, model, fetchArxiv, kvUsed = 0 }) {
  const kv = new Map(); if (kvUsed) kv.set(MATH_KV_KEY, JSON.stringify({ v: 1, used: kvUsed, papers: {} }));
  const blobs = new Map(); const calls = { model: 0, arxiv: 0, prompts: [] };
  const math = createMath({
    kv: { get: async k => kv.get(k) ?? null, getStrict: async k => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } },
    r2: { ok: () => true, getBuffer: async k => blobs.get(k) ?? null, putBuffer: async (k, b) => { blobs.set(k, b); } }, uploadKey,
    papers: async () => papers, getBlocks: async id => ({ blocks: blocksById[id] ?? [] }),
    mathModel: model && (async o => { calls.model++; calls.prompts.push(o); return model(o, calls.model); }),
    fetchArxiv: fetchArxiv && (async id => { calls.arxiv++; return fetchArxiv(id); }), log: { warn() {} },
  });
  const wait = async () => { for (let k = 0; k < 400; k++) { const j = math._test.getJob(); if (j && j.status !== 'running') return j; await new Promise(r => setTimeout(r, 5)); } throw new Error('job did not finish'); };
  return { math, kv, blobs, calls, wait, state: () => JSON.parse(kv.get(MATH_KV_KEY) ?? '{"used":0}'), file: id => readMathFile(blobs.get(uploadKey(id, 'math.json'))) };
}
const answerAll = ids => ({ results: ids.map(id => ({ id, latex: `y=z_{${id}}`, confident: true })) });
const idsOf = o => JSON.parse(o.prompt.slice(o.prompt.indexOf('['))).map(x => x.id);

test('validateLatex: KaTeX parse, braces, size, and nothing that reads files or defines macros', async () => {
  assert.equal(await validateLatex('\\frac{a}{b}+\\sum_{i=1}^{n}x_i'), true);
  assert.equal(await validateLatex('\\begin{aligned}a&=b\\\\c&=d\\end{aligned}\\tag{1}'), true);
  for (const bad of ['\\frac{a}{', 'x^', '\\unknowncommand{x}', '', '   ', '\\input{/etc/passwd}', '\\def\\x{1}', '\\href{http://x}{y}', 'a'.repeat(5000), '\\includegraphics{x}']) assert.equal(await validateLatex(bad), false, bad.slice(0, 30));
});

test('readReply: only the asked ids, one answer each, delimiters and \\tag stripped, junk dropped', () => {
  const r = readReply({ results: [{ id: 1, latex: '$$a=b\\tag{3}$$', confident: true }, { id: 1, latex: 'dup' }, { id: 9, latex: 'not asked' }, { id: 2, latex: 5 }, null, { id: 3, latex: '\\[x\\]' }] }, [1, 2, 3]);
  assert.deepEqual(r.map(x => [x.id, x.latex, x.confident]), [[1, 'a=b', true], [3, 'x', false]]);
  assert.deepEqual(readReply(null, [1]), []); assert.deepEqual(readReply('x', [1]), []); assert.equal(readReply([{ id: 1, latex: 'q' }], [1]).length, 1);
});

test('promptItem: the positioned text with markers, the equation number, and the sentence before and after', () => {
  const blocks = [para(0, 'First sentence. The dynamics are as follows.'), eq(1, GOOD, '2.1'), para(2, 'Here a is the drift. Then more text.')];
  const o = promptItem(blocks, 1);
  assert.equal(o.id, 1); assert.equal(o.tag, '2.1'); assert.match(o.t, /x\s*=\s*a\s*\+\s*b/); assert.equal(o.pre, 'The dynamics are as follows.'); assert.equal(o.post, 'Here a is the drift.');
  assert.equal(promptItem(blocks, 0), null);
  assert.match(buildPrompt([o]), /Equations to convert \(1\):\n\[\{"id":1/);
  assert.match(MATH_SYSTEM, /KaTeX/); assert.match(MATH_SYSTEM, /confident/);
});

test('resolveLatex: arXiv beats the model beats the rules; low confidence and invalid LaTeX are never shown; the geometry is stripped', async () => {
  const blocks = [eq(1, GOOD), eq(2, GOOD), eq(3, BAD(1)), eq(4, GOOD), eq(5, BAD(2)), para(6, 'p')];
  const math = { v: 1, eq: { 1: { latex: 'A=\\alpha', source: 'arxiv', conf: 0.95 }, 2: { latex: 'M=m', source: 'model', conf: 0.85 }, 3: { latex: 'weak=1', source: 'model', conf: 0.55 }, 4: { latex: '\\frac{', source: 'arxiv', conf: 0.95 } } };
  const r = await resolveLatex(blocks, math);
  assert.equal(r.get(1).source, 'arxiv'); assert.equal(r.get(2).source, 'model'); assert.ok(!r.has(3), 'a not-confident model answer is not shown'); assert.equal(r.get(4).source, 'rule', 'invalid arXiv LaTeX falls to the rules'); assert.ok(!r.has(5));
  const merged = mergeLatexIntoBlocks(blocks, r);
  assert.ok(merged.every(b => !('src' in b))); assert.deepEqual([merged[0].latex, merged[0].latexSource, merged[0].latexConf], ['A=\\alpha', 'arxiv', 0.95]); assert.ok(!('latex' in merged[2])); assert.equal(merged[5].type, 'p');
});

test('the job: one model call per 25 equations, notes-papers first, results validated and stored, the counter in KV', async () => {
  const big = []; for (let k = 0; k < 60; k++) big.push(eq(k, BAD(k), String(k + 1)));
  const small = [para(0, 'Before.'), eq(1, BAD(1), '1'), para(2, 'After.')];
  const r = rig({ papers: [{ id: 'plain', hasPdf: true, read: false }, { id: 'noted', hasPdf: true, read: true }], blocksById: { noted: small, plain: big }, model: o => answerAll(idsOf(o)) });
  const s = await r.math.start({ calls: 12 }); assert.equal(s.ok, true); assert.equal(s.status, 202);
  const j = await r.wait();
  assert.equal(j.status, 'done'); assert.equal(j.calls, 4, '1 call for the noted paper (1 eq), 3 for 60 equations in batches of 25');
  assert.equal(r.calls.prompts[0].prompt.includes('"id":1'), true, 'the paper with notes goes first');
  assert.ok(r.calls.prompts.every(p => p.system === MATH_SYSTEM && p.maxTokens <= 8000));
  assert.ok(r.calls.prompts.slice(1).every(p => idsOf(p).length <= MATH_BATCH));
  const f = r.file('plain'); assert.equal(Object.keys(f.eq).length, 60); assert.deepEqual([f.eq[0].source, f.eq[0].conf], ['model', 0.85]); assert.match(f.eq[0].latex, /\\tag\{1\}$/, 'the equation number is added by us, not the model');
  assert.equal(r.state().used, 4); assert.equal(r.state().papers.plain.done, true); assert.equal(r.state().papers.noted.done, true);
  const st = await r.math.status(); assert.deepEqual([st.papers.total, st.papers.done, st.papers.todo, st.calls.used, st.calls.cap, st.calls.left], [2, 2, 0, 4, MATH_CAP, MATH_CAP - 4]);
});

test('the job is idempotent: a second press asks for nothing that is already done or already solved by arXiv', async () => {
  const blocks = [eq(0, BAD(0), '1'), eq(1, BAD(1), '2'), eq(2, GOOD)];
  const r = rig({ papers: [{ id: 'p', hasPdf: true }], blocksById: { p: blocks }, model: o => answerAll(idsOf(o)) });
  await r.math.start({ calls: 3 }); await r.wait();
  assert.equal(r.calls.model, 1); assert.deepEqual(Object.keys(r.file('p').eq).sort(), ['0', '1']);
  const again = await r.math.start({ calls: 3 }); assert.equal(again.ok, true); await r.wait();
  assert.equal(r.calls.model, 1, 'nothing left to ask'); assert.equal(r.state().used, 1);
});

test('layer 2 first: arXiv answers the equations it can, so the model is not paid for them; the arXiv attempt is made once per paper', async () => {
  const blocks = [eq(0, BAD(0), '1'), eq(1, BAD(1), '2'), eq(2, BAD(2), '3')];
  const arxivEq = { tag: '1', tags: ['1'], latex: 'y=1\\tag{1}', display: true, group: false, rows: [{ tag: '1', latex: 'y=1' }] };
  const r = rig({ papers: [{ id: 'p', hasPdf: true, arxivRec: { arxiv: '2007.14874' } }], blocksById: { p: blocks }, model: o => answerAll(idsOf(o)), fetchArxiv: async id => { assert.equal(id, '2007.14874'); return { ok: true, eqs: [arxivEq], from: 'arxiv' }; } });
  blocks[0].text = 'y = 1 (1)';
  await r.math.start({ calls: 3 }); await r.wait();
  const f = r.file('p'); assert.equal(f.eq[0].source, 'arxiv'); assert.equal(f.eq[0].conf, 0.95);
  assert.deepEqual(idsOf(r.calls.prompts[0]), [1, 2], 'the model only gets what arXiv did not give');
  assert.deepEqual([f.arxiv.id, f.arxiv.status, f.arxiv.matched], ['2007.14874', 'ok', 1]);
  await r.math.syncArxiv('p', { arxiv: '2007.14874' }, blocks); await r.math.syncArxiv('p', { arxiv: '2007.14874' }, blocks);
  assert.equal(r.calls.arxiv, 1, 'cached: one request per paper');
});

test('a failed arXiv fetch is remembered (no hammering) and the model job carries on', async () => {
  const blocks = [eq(0, BAD(0))];
  const r = rig({ papers: [{ id: 'p', hasPdf: true, arxivRec: { arxiv: '2007.14874' } }], blocksById: { p: blocks }, model: o => answerAll(idsOf(o)), fetchArxiv: async () => ({ ok: false, status: 'no-equations', eqs: [] }) });
  await r.math.start({ calls: 1 }); await r.wait(); await r.math.syncArxiv('p', { arxiv: '2007.14874' }, blocks);
  assert.equal(r.calls.arxiv, 1); assert.equal(r.file('p').arxiv.status, 'no-equations'); assert.equal(r.file('p').eq[0].source, 'model');
});

test('model answers that fail KaTeX or that nobody asked for are rejected and stored nowhere; the failure is retried at most twice', async () => {
  const blocks = [eq(0, BAD(0)), eq(1, BAD(1)), eq(2, BAD(2))];
  const r = rig({ papers: [{ id: 'p', hasPdf: true }], blocksById: { p: blocks }, model: () => ({ results: [{ id: 0, latex: '\\frac{a}{', confident: true }, { id: 1, latex: 'ok=1', confident: false }, { id: 77, latex: 'nope', confident: true }] }) });
  await r.math.start({ calls: 12 }); const j = await r.wait();
  const f = r.file('p'); assert.ok(!f.eq[0]); assert.ok(!f.eq[2]); assert.equal(f.eq[1].conf, 0.55, 'a not-confident answer is kept but never shown');
  assert.ok(j.rejected >= 1); assert.equal(j.calls, 2, 'asked twice, then given up on (0 and 2); 1 was answered');
  await r.math.start({ calls: 12 }); await r.wait(); assert.equal(r.calls.model, 2, 'no third attempt');
});

test('the press limit: calls are clamped to 1..12 and a running job refuses a second one', async () => {
  const blocks = []; for (let k = 0; k < 400; k++) blocks.push(eq(k, BAD(k)));
  let release; const gate = new Promise(r => { release = r; });
  const r = rig({ papers: [{ id: 'p', hasPdf: true }], blocksById: { p: blocks }, model: async o => { await gate; return answerAll(idsOf(o)); } });
  const a = await r.math.start({ calls: 999 }); assert.equal(a.job.max, MATH_PRESS_MAX);
  const b = await r.math.start({ calls: 1 }); assert.equal(b.ok, false); assert.equal(b.status, 409);
  release(); const j = await r.wait(); assert.equal(j.calls, 12); assert.equal(r.calls.model, 12); assert.equal(r.state().used, 12);
  const c = await r.math.start({ calls: -5 }); assert.equal(c.job.max, 1); await r.wait(); assert.equal(r.state().used, 13);
});

test('the hard cap of 1500 calls: the last calls are allowed, the next is refused, and nothing is spent past it', async () => {
  const blocks = []; for (let k = 0; k < 100; k++) blocks.push(eq(k, BAD(k)));
  const r = rig({ papers: [{ id: 'p', hasPdf: true }], blocksById: { p: blocks }, model: o => answerAll(idsOf(o)), kvUsed: MATH_CAP - 2 });
  const s = await r.math.start({ calls: 12 }); assert.equal(s.job.max, 2); const j = await r.wait();
  assert.equal(j.calls, 2); assert.equal(r.state().used, MATH_CAP);
  const more = await r.math.start({ calls: 12 }); assert.equal(more.ok, false); assert.equal(more.status, 409); assert.match(more.error, /cap/);
  assert.equal(r.calls.model, 2); assert.equal((await r.math.status()).calls.left, 0);
});

test('a call is counted before it is made: a crashing model still uses its slot, and an error does not stop the other papers', async () => {
  const r = rig({ papers: [{ id: 'a', hasPdf: true, read: true }, { id: 'b', hasPdf: true }], blocksById: { a: [eq(0, BAD(0))], b: [eq(0, BAD(0))] }, model: (o, n) => { if (n === 1) throw new Error('model down'); return answerAll(idsOf(o)); } });
  await r.math.start({ calls: 6 }); const j = await r.wait();
  assert.equal(j.status, 'done'); assert.ok(j.errors.some(e => /model down/.test(e))); assert.equal(r.file('b').eq[0].source, 'model'); assert.equal(r.state().used, j.calls);
});

test('no model key: the job does not start, nothing is spent; status still answers', async () => {
  const none = rig({ papers: [{ id: 'p', hasPdf: true }], blocksById: { p: [eq(0, BAD(0))] } });
  const s = await none.math.start({ calls: 3 }); assert.equal(s.ok, false); assert.equal(s.status, 503);
  const st = await none.math.status(); assert.equal(st.model, false); assert.equal(st.calls.used, 0);
  const off = createMath({ kv: { get: async () => null, getStrict: async () => null, put: async () => {} }, r2: { ok: () => false }, uploadKey, papers: async () => [], getBlocks: async () => null, mathModel: async () => ({}), modelReady: () => false });
  assert.equal((await off.start({})).status, 503);
});

test('papers without equations or without blocks are skipped and never cost a call', async () => {
  const r = rig({ papers: [{ id: 'text', hasPdf: true }, { id: 'none', hasPdf: true }, { id: 'abs', hasPdf: false, hasText: false }], blocksById: { text: [para(0, 'only prose'), eq(1, GOOD)], none: [] }, model: o => answerAll(idsOf(o)) });
  await r.math.start({ calls: 12 }); await r.wait();
  assert.equal(r.calls.model, 0); assert.equal(r.state().papers.text.done, true);
});
