// js/libraryConcepts.js: concept cards. Synthetic fixtures and a MOCKED model: nothing here calls a model or the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  collectItems, itemHash, batchItems, unsent, dryRun, parseCards, mergeCards, buildPrompt, htmlToText, sectionsOf, inSlice, createConcepts,
  CONCEPTS_CAP, CONCEPTS_KV_KEY, CONCEPTS_PRESS_MAX, CONCEPTS_CARDS_KEY, CONCEPTS_SYSTEM, CONCEPTS_PROMPT_MAX, CONCEPTS_BATCH_MAX,
} from './libraryConcepts.js';

const rd = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const CANDLE = 'A candlestick shows the open, high, low and close. The wick is the distance from the body to the high. A breakout above the opening range during the London session often comes with momentum, and a mean reversion trade fades it.';
const OFF = 'Recipes for bread: flour, water, salt and yeast. Bake for forty minutes. Let it cool on a rack before slicing the loaf.';
const files = {
  'education/candles.md': `# Candles\n${CANDLE}\n\n# Bread\n${OFF}`,
  'education/other.md': `# Cooking\n${OFF}`,
  'cog/lessons/a.txt': `${CANDLE} Jump and diffusion matter intraday.`,
  'theory-lab/lessons/l1.html': `<html><head><style>p{}</style></head><body><h1>Sessions</h1><p>${CANDLE}</p><script>var x=1</script></body></html>`,
  'theory-lab/lessons/l2.html': `<html><body><h1>Bread</h1><p>${OFF}</p></body></html>`,
};
const readText = async p => { if (!(p in files)) throw new Error('nope'); return files[p]; };
const listFiles = async (dir, { exts = [], recursive = false } = {}) => Object.keys(files).filter(f => f.startsWith(`${dir}/`) && exts.some(e => f.endsWith(e)) && (recursive || !f.slice(dir.length + 1).includes('/')));
const digests = [{ id: 'p1', title: 'Momentum and mean reversion intraday', text: 'Claim: momentum and mean reversion switch between sessions.' }, { id: 'p2', title: 'Cooking', text: OFF }];

function harness({ model, kvFail = false, r2ok = true, preUsed = 0, preItems = {} } = {}) {
  const kvm = new Map(); if (preUsed || Object.keys(preItems).length) kvm.set(CONCEPTS_KV_KEY, JSON.stringify({ v: 1, used: preUsed, items: preItems }));
  const r2m = new Map(), calls = [];
  const kv = { getStrict: async k => { if (kvFail) throw new Error('kv down'); return kvm.get(k) ?? null; }, get: async k => kvm.get(k) ?? null, put: async (k, v) => { if (kvFail) throw new Error('kv down'); kvm.set(k, v); } };
  const r2 = { ok: () => r2ok, getBuffer: async k => r2m.get(k) ?? null, putBuffer: async (k, b) => { r2m.set(k, b); } };
  const conceptsModel = model ?? (async ({ prompt }) => { calls.push(prompt); const ids = [...prompt.matchAll(/"id":"([^"]+)"/g)].map(m => m[1]); return { cards: [{ id: `card-${calls.length}`, title: 'Opening range breakout', domain: ['Candles', 'breakout'], principle: 'p', mechanism: 'm', measure: 'x', lookFor: 'l', caveats: 'c', sources: ids.slice(0, 2) }] }; });
  const c = createConcepts({ kv, r2, conceptsModel, modelReady: () => true, digests: async () => digests, readText, listFiles, now: () => 1000 });
  return { c, kvm, r2m, calls };
}
const settle = async c => { for (let i = 0; i < 200 && c._test.getJob()?.status === 'running'; i++) await new Promise(r => setTimeout(r, 5)); return c._test.getJob(); };

test('slice filter: only items about the slice, from papers, education, cog and Theory Lab; headings split a file', async () => {
  const items = await collectItems({ digests, readText, listFiles, slice: 'candles-sessions' });
  const ids = items.map(i => i.id);
  assert.ok(ids.includes('p1') && !ids.includes('p2'));
  assert.ok(ids.some(i => i.startsWith('education/candles.md')) && !ids.some(i => i.startsWith('education/other.md')));
  assert.ok(ids.includes('cog/lessons/a.txt') && ids.includes('theory-lab/lessons/l1.html') && !ids.includes('theory-lab/lessons/l2.html'));
  assert.deepEqual([...new Set(items.map(i => i.kind))].sort(), ['cog', 'paper', 'theory-lab']);
  assert.ok(items.filter(i => i.id.startsWith('education/candles.md')).every(i => !/Recipes for bread/.test(i.text)), 'the bread section of a matching file is not an item');
  assert.ok(items.find(i => i.id === 'theory-lab/lessons/l1.html').text.indexOf('<') < 0 && !/var x/.test(items[items.length - 1].text), 'html is plain text');
  assert.deepEqual(await collectItems({ digests, readText, listFiles, slice: 'nope' }), []);
  assert.equal(inSlice('x', OFF, 'candles-sessions'), false);
  assert.deepEqual(await collectItems({ readText: async () => { throw new Error('x'); }, listFiles: async () => { throw new Error('x'); } }), [], 'broken readers mean no items');
});

test('htmlToText and sectionsOf', () => {
  assert.equal(htmlToText('<h2>A &amp; B</h2><p>one</p><script>x</script><p>two</p>'), '# A & B\n\none\ntwo'.replace('\n\none', '\none'));
  const secs = sectionsOf(`# One\n${'a '.repeat(50)}\n# Two\n${'b '.repeat(50)}`);
  assert.equal(secs.length, 1, 'tiny sections merge');
  const big = sectionsOf(`# Big\n${Array.from({ length: 30 }, (_, i) => `para ${i} ${'w '.repeat(100)}`).join('\n\n')}`, 1000);
  assert.ok(big.length > 3 && big.every(s => s.text.length <= 1100));
});

test('itemHash is stable per content and changes with it; unsent drops what was sent', async () => {
  const a = { kind: 'paper', id: 'p1', text: 'x' };
  assert.equal(itemHash(a), itemHash({ ...a })); assert.notEqual(itemHash(a), itemHash({ ...a, text: 'y' })); assert.notEqual(itemHash(a), itemHash({ ...a, id: 'p2' }));
  const items = await collectItems({ digests, readText, listFiles });
  assert.equal(unsent(items, { [items[0].hash]: { at: 1 } }).length, items.length - 1);
});

test('batching: item and size budgets, an oversized item goes alone, nothing is lost', () => {
  const mk = (n, len) => Array.from({ length: n }, (_, i) => ({ kind: 'cog', id: `i${i}`, title: 't', text: 'x'.repeat(len), hash: `h${i}` }));
  const a = batchItems(mk(20, 100)); assert.equal(a.length, Math.ceil(20 / CONCEPTS_BATCH_MAX)); assert.equal(a.flatMap(c => c.items).length, 20);
  const b = batchItems(mk(10, 5000)); assert.ok(b.every(c => c.chars <= CONCEPTS_PROMPT_MAX) && b.flatMap(c => c.items).length === 10 && b.length >= 3);
  const c = batchItems(mk(2, 30000)); assert.equal(c.length, 2);
  assert.deepEqual(batchItems([]), []);
});

test('dry run: counts only, makes ZERO model calls, skips what was already sent', async () => {
  let called = 0;
  const h = harness({ model: async () => { called++; return {}; } });
  const d = await h.c.dryRun('candles-sessions');
  assert.equal(called, 0);
  assert.equal(d.ok, true); assert.ok(d.items >= 4); assert.equal(d.bySource.paper, 1); assert.ok(d.bySource.cog >= 2 && d.bySource['theory-lab'] === 1);
  assert.equal(d.calls, 1); assert.equal(d.callsUsed, 0); assert.equal(d.callsCap, CONCEPTS_CAP); assert.equal(d.cards, 0);
  assert.ok(d.estimatedTokens > 0 && Number.isInteger(d.estimatedTokens));
  assert.ok(!JSON.stringify(d).includes('candlestick'), 'no card or source text in the counts');
  const items = await collectItems({ digests, readText, listFiles });
  const raw = await dryRun({ digests, readText, listFiles, sent: { [items[0].hash]: { at: 1 } } });
  assert.equal(raw.items, items.length - 1); assert.equal(raw.skipped, 1);
  assert.equal((await h.c.status('bogus')).ok, false);
});

test('a run: reserves the call first, validates the cards, merges by id, stores them in R2, marks the items sent; a second run sends nothing', async () => {
  const h = harness();
  const r = await h.c.start({ slice: 'candles-sessions', calls: 99 });
  assert.equal(r.status, 202); assert.equal(r.job.max, CONCEPTS_PRESS_MAX >= 1 ? Math.min(CONCEPTS_PRESS_MAX, CONCEPTS_CAP) : 0);
  const j = await settle(h.c);
  assert.equal(j.status, 'done'); assert.equal(j.calls, 1); assert.equal(h.calls.length, 1); assert.equal(j.cards, 1);
  const st = JSON.parse(h.kvm.get(CONCEPTS_KV_KEY)); assert.equal(st.used, 1); assert.equal(st.v, 1); assert.ok(Object.keys(st.items).length >= 4 && st.items[Object.keys(st.items)[0]].at === 1000);
  const store = JSON.parse(h.r2m.get(CONCEPTS_CARDS_KEY).toString()); assert.equal(Object.keys(store.cards).length, 1);
  assert.deepEqual(store.cards['card-1'].domain, ['candles', 'breakout']); assert.ok(store.cards['card-1'].sources.every(s => ['paper', 'cog', 'theory-lab'].includes(s.kind)));
  assert.match(h.calls[0], /Source items/); assert.doesNotMatch(h.calls[0], /Recipes for bread/);
  await h.c.start({ slice: 'candles-sessions', calls: 5 }); const j2 = await settle(h.c);
  assert.equal(j2.calls, 0); assert.equal(h.calls.length, 1, 'an unchanged item is never sent twice');
  assert.equal(JSON.parse(h.kvm.get(CONCEPTS_KV_KEY)).used, 1);
  const got = await h.c.cards(); assert.equal(got.count, 1);
});

test('the per-press limit is 12, the call count in KV is reserved BEFORE the call, and a failed call still counts', async () => {
  let seenUsed = null; const h = harness();
  const c2 = createConcepts({ kv: { getStrict: async k => h.kvm.get(k) ?? null, put: async (k, v) => h.kvm.set(k, v) }, r2: { ok: () => true, getBuffer: async () => null, putBuffer: async () => {} },
    conceptsModel: async () => { seenUsed = JSON.parse(h.kvm.get(CONCEPTS_KV_KEY)).used; throw new Error('boom'); }, modelReady: () => true, digests: async () => digests, readText, listFiles });
  const r = await c2.start({ calls: 100 }); assert.equal(r.job.max, 12);
  const j = await settle(c2); assert.equal(seenUsed, 1, 'reserved before the model was called'); assert.equal(j.calls, 1); assert.equal(JSON.parse(h.kvm.get(CONCEPTS_KV_KEY)).used, 1);
  assert.ok(j.errors.some(e => /boom/.test(e))); assert.equal(Object.keys(JSON.parse(h.kvm.get(CONCEPTS_KV_KEY)).items).length, 0, 'a failed call does not mark its items as sent');
});

test('cap reached: refuses to start at the cap, and stops cleanly when the cap is hit mid-run', async () => {
  const h = harness({ preUsed: CONCEPTS_CAP }); const r = await h.c.start({});
  assert.equal(r.ok, false); assert.equal(r.status, 409); assert.equal(h.calls.length, 0);
  const h2 = harness({ preUsed: CONCEPTS_CAP - 1 }); const r2 = await h2.c.start({ calls: 12 }); assert.equal(r2.job.max, 1);
  await settle(h2.c); assert.equal(JSON.parse(h2.kvm.get(CONCEPTS_KV_KEY)).used, CONCEPTS_CAP); assert.equal(h2.calls.length, 1);
  // the counter reaches the cap between the check and the call: the reservation refuses
  const h3 = harness(); await h3.c._test.reserve(); h3.kvm.set(CONCEPTS_KV_KEY, JSON.stringify({ v: 1, used: CONCEPTS_CAP, items: {} }));
  assert.equal(await h3.c._test.reserve(), false); assert.equal(JSON.parse(h3.kvm.get(CONCEPTS_KV_KEY)).used, CONCEPTS_CAP);
  const j = { calls: 0, rejected: 0, cards: 0, items: 0, errors: [], capped: false };
  await h3.c._test.runJob('candles-sessions', 5, j); assert.equal(j.capped, true); assert.equal(h3.calls.length, 0);
});

test('KV unreadable fails closed: no model call, no write, a 503', async () => {
  const h = harness({ kvFail: true }); const r = await h.c.start({});
  assert.equal(r.ok, false); assert.equal(r.status, 503); assert.equal(h.calls.length, 0); assert.equal(h.kvm.size, 0); assert.equal(h.r2m.size, 0);
  const st = await h.c.status(); assert.equal(st.ok, true); assert.equal(st.counterReadable, false); assert.equal(st.callsUsed, null);
  // the counter becomes unreadable after the job has started
  let n = 0; const kvm = new Map(); let modelCalls = 0;
  const c = createConcepts({ kv: { getStrict: async k => { if (++n > 2) throw new Error('down'); return kvm.get(k) ?? null; }, put: async (k, v) => kvm.set(k, v) }, r2: { ok: () => true, getBuffer: async () => null, putBuffer: async () => {} },
    conceptsModel: async () => { modelCalls++; return { cards: [] }; }, modelReady: () => true, digests: async () => digests, readText, listFiles });
  await c.start({}); const j = await settle(c); assert.equal(modelCalls, 0); assert.equal(j.capped, true); assert.ok(j.errors.some(e => /cannot be read/.test(e)));
});

test('no model, no key and no R2 are refused before anything is read or sent', async () => {
  const base = { kv: { getStrict: async () => null, put: async () => {} }, r2: { ok: () => true, getBuffer: async () => null, putBuffer: async () => {} }, digests: async () => digests, readText, listFiles };
  assert.equal((await createConcepts({ ...base }).start({})).status, 503);
  assert.equal((await createConcepts({ ...base, conceptsModel: async () => ({}), modelReady: () => false }).start({})).status, 503);
  assert.equal((await createConcepts({ ...base, r2: { ok: () => false }, conceptsModel: async () => ({}) }).start({})).status, 503);
  assert.equal((await createConcepts({ ...base, conceptsModel: async () => ({}) }).start({ slice: 'nope' })).status, 400);
});

const ITEMS = [{ kind: 'paper', id: 'p1', title: 't', text: 'x' }, { kind: 'cog', id: 'education/a.md', title: 't', text: 'y' }];
const GOOD = { id: 'Opening Range Breakout', title: 'Opening range breakout', domain: ['Candles', 'Range Break'], principle: 'a'.repeat(900), mechanism: 'm', measure: 'x', lookFor: 'l', caveats: 'c', sources: ['p1', { id: 'education/a.md' }, 'ghost'] };

test('malformed model output is dropped; long text is clipped; sources must be supplied ids', () => {
  const r = parseCards({ cards: [GOOD, { ...GOOD, id: 'no-source', sources: ['ghost'] }, { ...GOOD, id: 'markup', mechanism: 'see <b>x</b>' }, { ...GOOD, id: 'link', measure: 'https://x.com' },
    { ...GOOD, id: 'empty', lookFor: '' }, { ...GOOD, id: '' , title: ''}, 'junk', null, { ...GOOD, id: 'no-caveats', caveats: undefined }, { ...GOOD, id: 'Opening-range-breakout' }] }, ITEMS, 'candles-sessions');
  assert.deepEqual(r.cards.map(c => c.id), ['opening-range-breakout', 'no-caveats']);
  const c = r.cards[0]; assert.ok(c.principle.length <= 300); assert.deepEqual(c.domain, ['candles', 'range-break']); assert.deepEqual(c.sources, [{ kind: 'paper', id: 'p1' }, { kind: 'cog', id: 'education/a.md' }]); assert.equal(c.slice, 'candles-sessions');
  assert.equal(r.cards[1].caveats, ''); assert.ok(r.rejected.length >= 6);
  assert.deepEqual(Object.keys(c).sort(), ['caveats', 'domain', 'id', 'lookFor', 'measure', 'mechanism', 'principle', 'slice', 'sources', 'title']);
  assert.equal(parseCards('not json', ITEMS).cards.length, 0); assert.equal(parseCards({ nope: 1 }, ITEMS).cards.length, 0); assert.equal(parseCards(null, ITEMS).cards.length, 0);
  assert.equal(parseCards(JSON.stringify([GOOD]), ITEMS).cards.length, 1, 'a JSON string and a bare array are accepted');
});

test('an unusable reply is not marked as sent (a later press can retry it); a partly good reply is', async () => {
  const bad = harness({ model: async () => ({ nonsense: true }) }); await bad.c.start({}); const j = await settle(bad.c);
  assert.equal(j.calls, 1); assert.equal(j.cards, 0); assert.equal(Object.keys(JSON.parse(bad.kvm.get(CONCEPTS_KV_KEY)).items).length, 0);
  const part = harness({ model: async ({ prompt }) => ({ cards: [{ id: 'x' }, { id: 'good-one', title: 't', principle: 'p', mechanism: 'm', measure: 'x', lookFor: 'l', sources: [prompt.match(/"id":"([^"]+)"/)[1]] }] }) });
  await part.c.start({}); const j2 = await settle(part.c); assert.equal(j2.cards, 1); assert.equal(j2.rejected, 1); assert.ok(Object.keys(JSON.parse(part.kvm.get(CONCEPTS_KV_KEY)).items).length >= 4);
});

test('mergeCards: by id, sources and tags unioned, text updated', () => {
  const store = { cards: {} };
  const c1 = { id: 'a', title: 't', domain: ['x'], principle: 'p', mechanism: 'm', measure: 'x', lookFor: 'l', caveats: '', sources: [{ kind: 'paper', id: 'p1' }] };
  assert.equal(mergeCards(store, [c1], 1), 1); assert.equal(mergeCards(store, [c1], 2), 0, 'identical card: nothing changed');
  assert.equal(mergeCards(store, [{ ...c1, principle: 'new', domain: ['y'], sources: [{ kind: 'cog', id: 'c' }, { kind: 'paper', id: 'p1' }] }], 3), 1);
  assert.equal(store.cards.a.principle, 'new'); assert.deepEqual(store.cards.a.domain, ['x', 'y']); assert.equal(store.cards.a.sources.length, 2);
});

test('the prompt says: only the supplied text, cite ids, do not invent, no advice or results', () => {
  for (const re of [/ONLY what the supplied text says/, /Cite the source ids/, /Do not invent/, /Do not give trading advice/, /or results/]) assert.match(CONCEPTS_SYSTEM, re);
  const p = buildPrompt(ITEMS, 'candles-sessions'); assert.match(p, /"id":"p1"/); assert.match(p, /candles-sessions/);
});

test('server.js: routes, gates, model task and handle; the key and cap are registered everywhere; nothing makes a model call at import', () => {
  const s = rd('../server.js');
  assert.match(s, /app\.get\('\/api\/research-pod\/concepts', async/);
  assert.match(s, /app\.post\('\/api\/research-pod\/concepts', _conceptsPressGate/);
  assert.match(s, /app\.get\('\/api\/research-pod\/concepts\/cards', _agentsGate/);
  assert.match(s, /const _conceptsPressGate = [^\n]*_ROE\.tokenOk\(req\.get\('authorization'\), process\.env\.ROE_PUSH_TOKEN\)[^\n]*_agentsGate\(req, res, next\)/);
  assert.ok(s.indexOf("app.post('/api/research-pod/concepts'") < s.indexOf('\napp.use(requireAuth);'), 'registered before the global requireAuth');
  assert.ok(s.indexOf('const _agentsGate') < s.indexOf('const _conceptsPressGate'));
  assert.match(s, /Math\.min\(12, Number\(req\.body\?\.calls\) \|\| 6\)/);
  assert.match(s, /conceptsModel:/); assert.match(s, /task: 'library-concepts'/); assert.match(s, /_libApi\.concepts\.start\(/); assert.match(s, /_libApi\.concepts\.status\(/); assert.match(s, /_libApi\.concepts\.cards\(/);
  const getBlock = s.slice(s.indexOf("app.get('/api/research-pod/concepts', async"), s.indexOf("app.post('/api/research-pod/concepts'"));
  assert.doesNotMatch(getBlock, /\.cards\(|\.start\(/, 'the open GET never serves cards or runs');
  for (const [f, n] of [['../kv.js', 1], ['../_worker.js', 2], ['./storeRegistry.js', 1]]) assert.ok(rd(f).split(CONCEPTS_KV_KEY).length - 1 >= n, `${f} lists ${CONCEPTS_KV_KEY}`);
  assert.match(rd('./modelRouter.js'), /'library-concepts': \{ ledger: 'brief'[^}]*defaultProvider: 'deepseek'/);
  assert.match(rd('./libraryApi.js'), /H\.concepts = concepts/);
  assert.doesNotMatch(rd('./libraryConcepts.js'), /\bfetch\(|https?\.request|from 'node:https?'|_modelJson|process\.env/, 'the module has no network, model or env access of its own');
});

test('the Agents tab entry: Library group, task, cap, spends, trigger text; no sensitive words', async () => {
  const { AGENTS } = await import('./agentRegistry.js'), a = AGENTS.find(x => x.id === 'library-concepts');
  assert.ok(a); assert.equal(a.group, 'Library'); assert.equal(a.modelTask, 'library-concepts'); assert.equal(a.spends, true);
  assert.deepEqual(a.cap, { key: CONCEPTS_KV_KEY, cap: CONCEPTS_CAP, label: 'concept card calls' });
  assert.ok(a.links.some(l => l.href === 'library.html'));
  assert.equal(a.trigger, 'Runs only when you start it: python -m roe.concepts run, or the owner presses it.');
  assert.doesNotMatch(JSON.stringify(a), /secret|password|api key/i);
});

test('review: a mark is stored on the card, survives a model re-run, and bad input is refused', async () => {
  const h = harness();
  const st = await h.c._test.loadCards();
  const card = { id: 'trend-follow', title: 'Trend following', principle: 'p', mechanism: 'm', measure: 'x', lookFor: 'y', caveats: '', domain: ['trend'], sources: [{ kind: 'paper', id: 'p1' }] };
  mergeCards(st, [card], 1000); await h.c._test.saveCards(st);
  assert.equal((await h.c.review('nope', 'good')).status, 404);
  assert.equal((await h.c.review('trend-follow', 'maybe')).status, 400);
  assert.equal((await h.c.review('trend-follow', 'wrong', 'see <b>x</b>')).status, 400);
  const r = await h.c.review('trend-follow', 'wrong', '  too   vague  ');
  assert.equal(r.ok, true); assert.deepEqual({ s: r.review.status, n: r.review.note }, { s: 'wrong', n: 'too vague' });
  const again = await h.c._test.loadCards();
  mergeCards(again, [{ ...card, principle: 'a newer text' }], 2000);   // a later model run rewrites the text
  assert.equal(again.cards['trend-follow'].principle, 'a newer text');
  assert.equal(again.cards['trend-follow'].review.status, 'wrong', "the owner's mark survives");
  assert.equal((await h.c.cards()).cards[0].review.status, 'wrong');
});
