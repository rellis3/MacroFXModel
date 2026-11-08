// js/libraryFigs.js: figure/table notes from the paper's text. Synthetic fixtures and a mocked model: nothing calls out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { collectFigureTasks, buildPrompt, parseNotes, splitBatches, mergeNotesIntoBlocks, unbackedNumbers, createFigs, readFigsFile, FIGS_CAP, FIGS_KV_KEY, FIGS_PRESS_MAX, FIGS_BATCH, FIGS_SYSTEM, NOTE_MAX } from './libraryFigs.js';
import { uploadKey } from './researchLibrary.js';

const para = (i, text, extra = {}) => ({ i, type: 'p', text, page: 1, bbox: null, ...extra });
const tab = (i, label, caption, cells) => ({ i, type: 'table', text: caption, label, page: 2, bbox: [0, 0, 1, 1], ...(cells ? { cells } : {}) });
const fig = (i, label, caption, inText) => ({ i, type: 'fig', text: caption, label, page: 3, bbox: [0, 0, 1, 1], ...(inText ? { inText } : {}) });
const CELLS = ['1M|3M|6M|12M', 'Sharpe Ratio|0.42|0.48|0.47|0.59', 'Max drawdown|-12.5%|-10.1%|-9.8%|-7.4%'];
const sample = () => [
  para(0, 'We test a carry rule. Table 5 reports the Sharpe ratio by holding period. It rises with the horizon.'),
  para(1, 'Results are in Figure 5, which plots cumulative returns. The line ends at 180 in 2020.'),
  para(2, 'See also Fig. 5 and Tables 4 and 5 for robustness.'),
  tab(3, 'Table 5', 'Table 5: Sharpe ratio by holding period', CELLS),
  fig(4, 'Figure 5', 'Figure 5: Cumulative returns of the carry rule', 'Cumulative return | Year | Carry | Benchmark | ticks 0 to 200'),
  para(5, 'A note on Table 5 in a footnote.', { foot: true }),
  fig(6, undefined, 'Figure without a label'),
];

test('collectFigureTasks: labelled figures and tables with caption, mentions that hold the reference, cells or inText', () => {
  const t = collectFigureTasks(sample());
  assert.deepEqual(t.map(x => x.key), ['Table 5', 'Figure 5']);
  const T = t[0], F = t[1];
  assert.equal(T.kind, 'table'); assert.equal(T.caption, 'Sharpe ratio by holding period'); assert.deepEqual(T.cells, CELLS); assert.ok(!('inText' in T));
  assert.equal(T.mentions.length, 2); assert.equal(T.refs, 2, 'the footnote does not count');
  assert.match(T.mentions[0], /Table 5 reports the Sharpe ratio/); assert.match(T.mentions[0], /rises with the horizon/, 'the next sentence rides along');
  assert.match(T.mentions[1], /Tables 4 and 5/);
  assert.equal(F.kind, 'figure'); assert.equal(F.inText, 'Cumulative return | Year | Carry | Benchmark | ticks 0 to 200'); assert.ok(!('cells' in F));
  assert.equal(F.mentions.length, 2); assert.match(F.mentions[0], /Figure 5, which plots/); assert.match(F.mentions[1], /Fig\. 5/);
  assert.ok(t.every(x => x.mentions.every(m => m.length <= 400)));
});

test('collectFigureTasks: at most 4 mentions of at most 400 chars; "Table 15" is not "Table 5"; empty tasks are skipped', () => {
  const blocks = [tab(0, 'Table 5', 'Cap')];
  for (let k = 1; k <= 7; k++) blocks.push(para(k, `Paragraph ${k} says Table 5 matters. ` + 'Long filler sentence. '.repeat(40)));
  blocks.push(para(9, 'Table 15 is different and Table 50 too.'), tab(10, 'Table 7', ''), fig(11, 'Figure 9', ''));
  const t = collectFigureTasks(blocks);
  assert.equal(t.length, 1, 'Table 7 and Figure 9 have nothing to say');
  assert.equal(t[0].mentions.length, 4); assert.equal(t[0].refs, 7); assert.ok(t[0].mentions.every(m => m.length <= 400 && /Table 5/.test(m)));
  assert.deepEqual(collectFigureTasks(null), []); assert.deepEqual(collectFigureTasks([null, 3, {}]), []);
});

test('buildPrompt: the paper, the abstract and compact JSON items; strict reply format in the system prompt', () => {
  const p = buildPrompt(collectFigureTasks(sample()), 'Carry and Momentum', 'We study carry.');
  assert.match(p, /^Paper: Carry and Momentum\nAbstract: We study carry\.\nFigures and tables to note \(2\):\n\[/);
  const items = JSON.parse(p.slice(p.indexOf('[{')));
  assert.deepEqual(Object.keys(items[0]), ['key', 'kind', 'caption', 'mentions', 'cells']); assert.deepEqual(Object.keys(items[1]), ['key', 'kind', 'caption', 'mentions', 'inText']);
  assert.match(FIGS_SYSTEM, /\{"notes":\[/); assert.match(FIGS_SYSTEM, /cannot see the picture/); assert.match(FIGS_SYSTEM, /ONLY numbers/);
});

test('splitBatches: at most 12 tasks and a character budget per call', () => {
  const mk = n => Array.from({ length: n }, (_, k) => ({ key: `Table ${k + 1}`, caption: 'c'.repeat(100) }));
  assert.deepEqual(splitBatches(mk(30)).map(b => b.length), [12, 12, 6]);
  assert.ok(splitBatches(mk(12), { maxChars: 500 }).length > 1);
  assert.deepEqual(splitBatches([]), []);
});

test('parseNotes: valid notes kept, empty / unknown / over-long / markup dropped, confident only when true', () => {
  const tasks = collectFigureTasks(sample());
  const r = parseNotes({ notes: [
    { key: 'Table 5', text: 'It lists the Sharpe ratio for four holding periods, from 0.42 at 1M to 0.59 at 12M.', confident: true },
    { key: 'Figure 5', text: 'Cumulative returns of the carry rule against a benchmark.' },
    { key: 'Table 9', text: 'not asked' }, { key: 'Table 5', text: 'a duplicate' },
  ] }, tasks);
  assert.deepEqual(Object.keys(r.notes), ['Table 5', 'Figure 5']); assert.equal(r.notes['Table 5'].confident, true); assert.equal(r.notes['Figure 5'].confident, false);
  assert.deepEqual(r.rejected.map(x => x.why), ['unknown key']);
  const bad = parseNotes([{ key: 'Table 5', text: '   ' }, { key: 'Figure 5', text: 'See <b>this</b> chart' }], tasks);
  assert.deepEqual(bad.notes, {}); assert.deepEqual(bad.rejected.map(x => x.why), ['empty', 'markup or link']);
  const long = parseNotes({ notes: [{ key: 'Table 5', text: 'It shows the Sharpe ratio. ' + 'It rises with the horizon. '.repeat(20) }] }, tasks);
  assert.ok(long.notes['Table 5'].text.length <= NOTE_MAX && /\.$/.test(long.notes['Table 5'].text), 'a little long is cut at a sentence end');
  assert.deepEqual(parseNotes({ notes: [{ key: 'Table 5', text: 'x'.repeat(500) }] }, tasks).notes, {}, 'no sentence end to cut at: rejected');
  for (const junk of [null, 'nope', {}, { notes: 'x' }, 5]) assert.deepEqual(parseNotes(junk, tasks).notes, {});
  assert.equal(parseNotes(JSON.stringify({ notes: [{ key: 'Figure 5', text: 'A chart.', confident: true }] }), tasks).notes['Figure 5'].confident, true);
});

test('the invented-number guard: every number must be in the caption, mentions, cells or inText (rounding and percent forms allowed)', () => {
  const tasks = collectFigureTasks(sample()), T = tasks[0], F = tasks[1];
  const ok = txt => unbackedNumbers(txt, T).length === 0;
  assert.ok(ok('Sharpe rises from 0.42 to 0.59.'), 'exact');
  assert.ok(ok('Sharpe rises from 0.4 to 0.6.'), 'rounded to fewer decimals');
  assert.ok(ok('Sharpe rises from 42% to 59%.'), 'fraction said as a percentage');
  assert.ok(ok('Drawdown improves from 12.5 to 7.4 percent.'), 'sign and unit ignored');
  assert.ok(ok('Drawdown improves from 13% to 7%.'), 'integer rounding');
  assert.ok(ok('It covers the 1M, 3M, 6M and 12M horizons in Table 5.'), 'the label itself is not a claim');
  assert.ok(!ok('Sharpe rises from 0.42 to 0.71.'), 'invented 0.71');
  assert.ok(!ok('It spans 9 horizons.'), 'invented count');
  assert.deepEqual(unbackedNumbers('Peaks at 250 in 2020.', F).map(n => n.v), [250], 'the figure says 180, ticks to 200');
  assert.equal(unbackedNumbers('Ends near 180 in 2020, on an axis up to 200.', F).length, 0);
  const tasks2 = [{ key: 'Table 1', kind: 'table', caption: 'Returns', mentions: ['Returns were 59% in the best year.'], cells: ['x|0.59'] }];
  assert.ok(parseNotes({ notes: [{ key: 'Table 1', text: 'Best year returned 0.59.', confident: true }] }, tasks2).notes['Table 1'], 'percent in the text, fraction in the note');
  const r = parseNotes({ notes: [{ key: 'Table 1', text: 'Best year returned 83%.', confident: true }, { key: 'Table 1', text: 'Best year returned 59%.', confident: true }] }, tasks2);
  assert.equal(r.notes['Table 1'].text, 'Best year returned 59%.', 'the invented one is rejected, a later honest duplicate can stand');
  assert.match(r.rejected[0].why, /number not in the paper's text: 83/);
});

test('mergeNotesIntoBlocks: note, confidence and how often the paper refers to it; other blocks untouched', () => {
  const file = { notes: { 'Table 5': { text: 'N5', confident: true }, 'Figure 5': { text: 'N6', confident: false } } };
  const m = mergeNotesIntoBlocks(sample(), file);
  assert.deepEqual([m[3].note, m[3].noteConfident, m[3].noteRefs], ['N5', true, 2]); assert.deepEqual([m[4].note, m[4].noteConfident], ['N6', false]);
  assert.ok(!('note' in m[0]) && !('note' in m[6]));
  const same = sample(); assert.equal(mergeNotesIntoBlocks(same, { notes: {} }), same); assert.equal(mergeNotesIntoBlocks(same, null), same);
});

// ── the job ──
function rig({ papers, blocksById, model, usedBefore = 0 }) {
  const kv = new Map(); if (usedBefore) kv.set(FIGS_KV_KEY, JSON.stringify({ v: 1, used: usedBefore, papers: {} }));
  const blobs = new Map(), calls = { model: 0, prompts: [] };
  const figs = createFigs({
    kv: { get: async k => kv.get(k) ?? null, getStrict: async k => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } },
    r2: { ok: () => true, getBuffer: async k => blobs.get(k) ?? null, putBuffer: async (k, b) => { blobs.set(k, b); } }, uploadKey,
    papers: async () => papers, getBlocks: async id => ({ blocks: blocksById[id] ?? [] }),
    figsModel: model && (async o => { calls.model++; calls.prompts.push(o); return model(o, calls.model); }), log: { warn() {} },
  });
  const wait = async () => { for (let k = 0; k < 400; k++) { const j = figs._test.getJob(); if (j && j.status !== 'running') return j; await new Promise(r => setTimeout(r, 5)); } throw new Error('job did not finish'); };
  return { figs, kv, blobs, calls, wait, state: () => JSON.parse(kv.get(FIGS_KV_KEY) ?? '{"used":0}'), file: id => readFigsFile(blobs.get(uploadKey(id, 'figs.json'))) };
}
const P = (id, extra = {}) => ({ id, hasPdf: true, hasText: true, read: false, title: `Paper ${id}`, abstract: 'abs', ...extra });
const itemsOf = o => JSON.parse(o.prompt.slice(o.prompt.indexOf('[{')));
const honest = o => ({ notes: itemsOf(o).map(t => ({ key: t.key, text: `${t.key} shows ${t.caption.toLowerCase()}.`, confident: true })) });
const many = n => { const b = []; for (let k = 1; k <= n; k++) b.push(tab(k * 2, `Table ${k}`, `Caption ${k}`, ['a|1', 'b|2']), para(k * 2 + 1, `Table ${k} is discussed here.`)); return b; };

test('the job: one call per paper batch, notes-papers first, results stored in R2 and the counter in KV', async () => {
  const r = rig({ papers: [P('a'), P('b', { read: true })], blocksById: { a: sample(), b: sample() }, model: honest });
  const out = await r.figs.start({ calls: 6 }); assert.equal(out.status, 202);
  const j = await r.wait();
  assert.equal(j.status, 'done'); assert.equal(r.calls.model, 2, 'one call per paper, both of its tasks together'); assert.match(r.calls.prompts[0].prompt, /Paper: Paper b/, 'desk-notes paper first');
  assert.equal(r.state().used, 2); assert.equal(r.state().papers.a.done, true); assert.equal(r.state().papers.a.tasks, 2);
  assert.deepEqual(Object.keys(r.file('a').notes).sort(), ['Figure 5', 'Table 5']); assert.equal(typeof r.file('a').notes['Table 5'].at, 'number');
  assert.equal(r.file('a').notes['Table 5'].confident, true); assert.equal(j.notes, 4);
  const st = await r.figs.status(); assert.deepEqual([st.papers.done, st.papers.todo, st.calls.used, st.calls.left, st.calls.cap, st.model], [2, 0, 2, FIGS_CAP - 2, 600, true]);
});

test('a paper with more than 12 tasks is split into several calls', async () => {
  const r = rig({ papers: [P('a')], blocksById: { a: many(30) }, model: honest });
  await r.figs.start({ calls: 12 }); await r.wait();
  assert.deepEqual([r.calls.model, Object.keys(r.file('a').notes).length], [3, 30]); assert.equal(FIGS_BATCH, 12);
});

test('idempotent: a second press asks for nothing already noted or done; a paper with no figures costs nothing', async () => {
  const r = rig({ papers: [P('a'), P('none')], blocksById: { a: sample(), none: [para(0, 'Only text.')] }, model: honest });
  await r.figs.start({ calls: 6 }); await r.wait(); const n = r.calls.model;
  await r.figs.start({ calls: 6 }); await r.wait();
  assert.equal(r.calls.model, n); assert.equal(n, 1); assert.equal(r.state().used, 1); assert.equal(r.state().papers.none.done, true);
});

test('guard in the job: an invented number is rejected, not stored, retried at most twice', async () => {
  const lie = o => ({ notes: itemsOf(o).map(t => ({ key: t.key, text: `${t.key} peaks at 9999.`, confident: true })) });
  const r = rig({ papers: [P('a')], blocksById: { a: sample() }, model: lie });
  await r.figs.start({ calls: 12 }); const j = await r.wait();
  assert.equal(Object.keys(r.file('a').notes).length, 0); assert.equal(j.rejected, 4); assert.equal(r.calls.model, 2, 'two tries, then it stops asking');
  assert.equal(r.state().papers.a.done, true);
});

test('the press limit: calls clamped to 1..12 and a running job refuses a second one', async () => {
  const r = rig({ papers: [P('a')], blocksById: { a: sample() }, model: async () => { await new Promise(x => setTimeout(x, 30)); return { notes: [] }; } });
  assert.equal(FIGS_PRESS_MAX, 12);
  const a = await r.figs.start({ calls: 999 }); assert.equal(a.job.max, 12);
  const b = await r.figs.start({ calls: 3 }); assert.deepEqual([b.ok, b.status], [false, 409]);
  await r.wait(); const c = await r.figs.start({ calls: -4 }); assert.equal(c.job.max, 1); await r.wait();
});

test('the hard cap of 600 calls: the last call is allowed, the next is refused with 409, nothing is spent past it', async () => {
  const r = rig({ papers: [P('a'), P('b')], blocksById: { a: sample(), b: sample() }, model: honest, usedBefore: FIGS_CAP - 1 });
  const a = await r.figs.start({ calls: 12 }); assert.equal(a.job.max, 1);
  const j = await r.wait(); assert.equal(r.calls.model, 1); assert.equal(r.state().used, FIGS_CAP); assert.equal(j.status, 'done');
  const b = await r.figs.start({ calls: 12 }); assert.deepEqual([b.ok, b.status], [false, 409]); assert.match(b.error, /600-call cap/); assert.equal(r.calls.model, 1);
  const r2 = rig({ papers: [P('a')], blocksById: { a: sample() }, model: honest, usedBefore: FIGS_CAP });
  assert.equal((await r2.figs.start({})).status, 409); assert.equal(r2.calls.model, 0);
});

test('no model key: 503, nothing spent, status still answers', async () => {
  const r = rig({ papers: [P('a')], blocksById: { a: sample() } });
  const out = await r.figs.start({ calls: 3 }); assert.deepEqual([out.ok, out.status], [false, 503]); assert.equal(r.state().used, 0);
  const st = await r.figs.status(); assert.equal(st.ok, true); assert.equal(st.model, false);
});

test('a call is counted before it is made: a crashing model still uses its slot and does not stop the job', async () => {
  const r = rig({ papers: [P('a'), P('b')], blocksById: { a: sample(), b: sample() }, model: (o, n) => { if (n === 1) throw new Error('boom'); return honest(o); } });
  await r.figs.start({ calls: 6 }); const j = await r.wait();
  assert.equal(j.status, 'done'); assert.equal(j.errors.length, 1); assert.ok(r.state().used >= 2);
  assert.ok(Object.keys(r.file('b').notes).length + Object.keys(r.file('a').notes).length >= 2);
});

test('fileOf never throws: a broken or missing file is "no notes"', async () => {
  const r = rig({ papers: [], blocksById: {}, model: honest });
  assert.deepEqual((await r.figs.fileOf('zzz')).notes, {}); r.blobs.set(uploadKey('bad', 'figs.json'), Buffer.from('{nope'));
  assert.deepEqual((await r.figs.fileOf('bad')).notes, {});
});
