// Researcher wiring of the library context (js/libraryIndex.js + server.js): flag off = nothing changes. Synthetic only, no model call.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildIndex, buildContext, withLibrary, citeableIds, libraryContextOn } from './libraryIndex.js';
import { buildStagePrompt } from './deskRoles.js';
import { newCase, appendRound, answerOf, roundSections, fitSections } from './researchCase.js';
import { validateProposals } from './researchPod.js';

const notes = { claim: 'Extreme net speculative positions predict EURUSD returns.', mechanism: 'Crowded speculators unwind.', data: { market: 'EURUSD futures', period: '2006-2017', frequency: 'weekly' }, method: 'Sorts', effect: 'Small', outOfSample: 'yes', costs: 'no', relevance: 'r', stance: 'supports', caveats: ['c'], testHere: 'Rank weekly COT positioning.' };
const LIB = [{ id: 'cot1', title: 'Speculative Positioning and Currency Returns (synthetic)', year: 2018, source: { key: 'ssrn', label: 'SSRN' }, tags: [{ key: 'cot' }, { key: 'fx' }], notes, desk: [] },
  { id: 'gold1', title: 'Gold and Real Yields (synthetic)', year: 2020, source: { key: 'ssrn', label: 'SSRN' }, tags: [{ key: 'gold' }], notes: { ...notes, claim: 'Gold moves inversely with real yields.', testHere: 'x' }, desk: [] }];

const role = { id: 'r', body: 'You are a researcher.', output: 'case_answer', evidence: [] };
const base = () => [['The question', 'Does COT positioning predict EURUSD?'], ['Papers you have read', '- held1: a paper'], ['How to answer', 'Be brief.'], ["The owner's message", 'go on']];
const stage = secs => buildStagePrompt({ role, pack: { date: '2026-11-08' }, ledger: [], sections: fitSections(secs, 60000) });

test('researcher prompt is byte-identical with the flag off, and gains exactly one LIBRARY section (before the owner message) with it on', () => {
  const plain = stage(base());
  const flagOff = libraryContextOn({});   // what server.js passes on: no context when the flag is off
  const off = stage(withLibrary(base(), flagOff ? { text: 'x' } : null, { beforeLast: true }));
  assert.equal(off.prompt, plain.prompt); assert.equal(off.system, plain.system);
  const ix = buildIndex(LIB), ctx = buildContext('does COT positioning predict EURUSD', ix, new Map(LIB.map(p => [p.id, p])));
  const on = stage(withLibrary(base(), ctx, { beforeLast: true }));
  assert.notEqual(on.prompt, plain.prompt); assert.equal(on.system, plain.system);
  assert.equal((on.prompt.match(/## LIBRARY:/g) ?? []).length, 1);
  assert.ok(on.prompt.includes('[P1] id: cot1'));
  assert.ok(on.prompt.indexOf('## LIBRARY:') < on.prompt.indexOf("## The owner's message") && on.prompt.indexOf('## LIBRARY:') > on.prompt.indexOf('## How to answer'));
  assert.equal(on.prompt.replace(/## LIBRARY:[\s\S]*?(?=## The owner's message)/, ''), plain.prompt, 'removing the section gives the old prompt');
  const c = newCase({ id: 'c1', question: 'Q?', date: '2026-11-08' });
  assert.equal(roundSections(c, 'quant', { ownerMessage: 'm' }).some(s => /LIBRARY/.test(s[0])), false, 'the round builder itself is untouched');
  // round 1 / the Head append the section at the end
  const end = stage(withLibrary(base(), ctx)); assert.ok(end.prompt.indexOf('## LIBRARY:') > end.prompt.indexOf("## The owner's message"));
});

test('citations: held ids stay valid, injected library ids become valid, anything else is still dropped', () => {
  const prop = cites => ({ title: 'T', family: 'F', thesis: 'x', mechanism: 'm', sources: [{ title: 's' }], inputs: [{ what: 'i', status: 'have' }], test: { variable: 'v', benchmark: 'b' }, citations: cites });
  const check = ids => validateProposals({ proposals: [prop(['held1', 'cot1', 'made-up'])] }, 'quant', { paperIds: ids }).value.proposals[0].citations;
  const held = new Set(['held1']);
  assert.deepEqual(check(citeableIds(held, [])), ['held1'], 'off: exactly the old rule');
  assert.deepEqual(check(citeableIds(held, ['cot1'])), ['held1', 'cot1']);
  assert.equal(check(citeableIds(held, ['cot1'])).includes('made-up'), false);
  assert.ok(!held.has('cot1'), 'the held set is not modified');
});

test('case rounds record libraryIds only when a library context was used', () => {
  const c = newCase({ id: 'c1', question: 'Q?', date: '2026-11-08' }), a = { quant: answerOf({ headline: 'h', reply: 'r' }) }, at = '2026-11-08T10:00:00Z';
  const off = appendRound(c, { owner: 'Q?', answers: a, at, libraryIds: undefined });
  assert.equal('libraryIds' in off.rounds[0], false);
  assert.equal(JSON.stringify(off.rounds[0]), JSON.stringify(appendRound(c, { owner: 'Q?', answers: a, at }).rounds[0]));
  assert.equal('libraryIds' in appendRound(c, { owner: 'Q?', answers: a, at, libraryIds: [] }).rounds[0], false);
  assert.deepEqual(appendRound(c, { owner: 'Q?', answers: {}, at, libraryIds: ['cot1', 'gold1'] }).rounds[0].libraryIds, ['cot1', 'gold1']);
});

test('server.js wiring: the switch is the Agents-tab setting (env LIBRARY_CONTEXT is the fallback), off by default, and the new calls make no model request', () => {
  const src = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.ok(src.includes('async function _libCtx(query') && src.includes("if (!force && !(await readToggle('libraryContext'))) return null;"));
  assert.equal((src.match(/_LIX\.withLibrary\(/g) ?? []).length, 2, 'round 1 and later rounds');
  assert.ok(src.includes('_LIX.librarySection(libCtx)'), 'the Head of Research review');
  assert.ok(src.includes('_LIX.citeableIds(heldIds, libCtx?.ids)'));
  const fn = src.slice(src.indexOf('async function _libCtx'), src.indexOf('/** On first read in this process'));
  assert.ok(!/_modelJson|aiCall|fetch\(/.test(fn), 'the context builder calls no model');
  const prev = src.slice(src.indexOf('const _rcLibraryPreview'), src.indexOf("app.post('/api/research-pod/case/reply'"));
  assert.ok(prev.includes('force: true') && !/_modelJson|_rcStartJob|_rcPut/.test(prev), 'the preview builds the context and writes nothing');
  assert.equal(libraryContextOn({}), false);
});
