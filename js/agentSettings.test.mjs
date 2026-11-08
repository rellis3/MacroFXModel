// Agent switches (js/agentSettings.js), the /api/agents payload (js/agentsApi.js) and the server wiring. Everything mocked: no KV, no network, no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TOGGLES, TOGGLE_IDS, KV_KEY, TTL_MS, parseSettings, resolveToggle, envValue, validateToggleBody, createToggleStore } from './agentSettings.js';
import { buildAgentsPayload, usedOf } from './agentsApi.js';
import { libraryContextOn } from './libraryIndex.js';
import { cardHtml, switchHtml, capHtml, esc } from './agentsTab.js';

const rd = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const fakeKv = (init = null) => { const m = new Map(); if (init) m.set(KV_KEY, typeof init === 'string' ? init : JSON.stringify(init)); let reads = 0, fail = false;
  return { m, get reads() { return reads; }, set fail(v) { fail = v; }, getStrict: async k => { reads++; if (fail) throw new Error('kv down'); return m.get(k) ?? null; }, put: async (k, v) => { m.set(k, v); } }; };

test('registry: libraryContext defaults off and falls back to LIBRARY_CONTEXT; libraryLibrarian defaults on', () => {
  assert.equal(TOGGLES.libraryContext.default, false); assert.equal(TOGGLES.libraryContext.env, 'LIBRARY_CONTEXT');
  assert.equal(TOGGLES.libraryLibrarian.default, true); assert.equal(TOGGLES.libraryLibrarian.env, null);
  for (const id of TOGGLE_IDS) { const t = TOGGLES[id]; assert.ok(t.label && t.text.length > 40 && typeof t.default === 'boolean' && typeof t.spends === 'boolean', id); }
  assert.equal(KV_KEY, 'agent_settings_v1');
});

test('precedence: saved setting > env > default', () => {
  assert.deepEqual(resolveToggle('libraryContext', {}, {}), { value: false, source: 'default' });
  assert.deepEqual(resolveToggle('libraryContext', {}, { LIBRARY_CONTEXT: '1' }), { value: true, source: 'env' });
  assert.deepEqual(resolveToggle('libraryContext', {}, { LIBRARY_CONTEXT: '0' }), { value: false, source: 'env' });
  assert.deepEqual(resolveToggle('libraryContext', { libraryContext: false }, { LIBRARY_CONTEXT: '1' }), { value: false, source: 'setting' }, 'a saved off beats an env on');
  assert.deepEqual(resolveToggle('libraryContext', { libraryContext: true }, {}), { value: true, source: 'setting' });
  assert.deepEqual(resolveToggle('libraryLibrarian', {}, {}), { value: true, source: 'default' });
  assert.deepEqual(resolveToggle('libraryLibrarian', { libraryLibrarian: false }, {}), { value: false, source: 'setting' });
  assert.throws(() => resolveToggle('nope', {}, {}), /not an agent switch/);
  for (const v of ['1', 'true', 'ON', 'yes']) assert.equal(envValue(TOGGLES.libraryContext, { LIBRARY_CONTEXT: v }), true);
  assert.equal(envValue(TOGGLES.libraryContext, { LIBRARY_CONTEXT: '' }), null);
  assert.equal(envValue(TOGGLES.libraryContext, { LIBRARY_CONTEXT: 'maybe' }), false);
  assert.equal(envValue(TOGGLES.libraryLibrarian, { LIBRARY_LIBRARIAN: '0' }), null, 'a switch with no env name ignores the environment');
});

test('libraryContextOn (js/libraryIndex.js): an explicit setting wins, the env var is the fallback, off by default', () => {
  assert.equal(libraryContextOn({}), false); assert.equal(libraryContextOn({ LIBRARY_CONTEXT: '1' }), true);
  assert.equal(libraryContextOn({ LIBRARY_CONTEXT: '1' }, { libraryContext: false }), false);
  assert.equal(libraryContextOn({}, { libraryContext: true }), true);
  assert.equal(libraryContextOn({ LIBRARY_CONTEXT: '1' }, {}), true, 'no setting: the env var decides');
});

test('parseSettings keeps only registered boolean switches and never throws', () => {
  assert.deepEqual(parseSettings(JSON.stringify({ v: 1, toggles: { libraryContext: true, libraryLibrarian: 'no', ghost: true }, at: 'T' })), { toggles: { libraryContext: true }, at: 'T' });
  for (const bad of [null, '', 'not json', '{"v":2,"toggles":{"libraryContext":true}}', 42, [], { toggles: { libraryContext: true } }]) assert.deepEqual(parseSettings(bad).toggles, {});
});

test('validateToggleBody: registered id, real boolean (a string "false" is refused)', () => {
  assert.deepEqual(validateToggleBody({ id: 'libraryContext', value: true }), { ok: true, id: 'libraryContext', value: true });
  assert.equal(validateToggleBody({ id: 'libraryContext', value: 'false' }).ok, false);
  assert.equal(validateToggleBody({ id: 'libraryContext' }).ok, false);
  assert.equal(validateToggleBody({ id: 'constructor', value: true }).ok, false, 'prototype names are not switches');
  assert.equal(validateToggleBody({ id: '__proto__', value: true }).ok, false);
  assert.equal(validateToggleBody({ id: 'ANTHROPIC_KEY', value: true }).ok, false);
  assert.equal(validateToggleBody(null).ok, false);
});

test('store: 30 s cache, falls back to env/default, set() writes one switch without losing the others and refreshes the cache at once', async () => {
  let t = 1_000_000; const now = () => t;
  const kv = fakeKv(), s = createToggleStore({ kv, env: { LIBRARY_CONTEXT: '1' }, now });
  assert.equal(TTL_MS, 30_000);
  assert.deepEqual(await s.resolve('libraryContext'), { value: true, source: 'env' });
  assert.equal(kv.reads, 1);
  await s.read('libraryContext'); await s.all(); t += 29_000; await s.read('libraryLibrarian'); assert.equal(kv.reads, 1, 'within 30 s: no new KV read');
  // another instance saves a setting; this one sees it only after the TTL
  kv.m.set(KV_KEY, JSON.stringify({ v: 1, toggles: { libraryContext: false }, at: 'x' }));
  assert.equal(await s.read('libraryContext'), true);
  t += 2_000; assert.equal(await s.read('libraryContext'), false); assert.equal(kv.reads, 2);
  assert.deepEqual(await s.resolve('libraryContext'), { value: false, source: 'setting' });
  // set: read-modify-write
  const r = await s.set('libraryLibrarian', false);
  assert.equal(r.value, false);
  assert.deepEqual(JSON.parse(kv.m.get(KV_KEY)).toggles, { libraryContext: false, libraryLibrarian: false }, 'the other switch is kept');
  assert.equal(JSON.parse(kv.m.get(KV_KEY)).v, 1);
  assert.equal(await s.read('libraryLibrarian'), false, 'the cache reflects the write at once');
  assert.equal(s.peek('libraryLibrarian'), false);
  await assert.rejects(() => s.set('ghost', true), /not an agent switch/);
  await assert.rejects(() => s.set('libraryContext', 'yes'), /true or false/);
});

test('store: a failed KV read keeps the last good value (or env/default) and never throws; a failed read blocks set() so nothing is overwritten', async () => {
  let t = 5_000_000; const now = () => t;
  const kv = fakeKv({ v: 1, toggles: { libraryContext: true }, at: 'x' }), s = createToggleStore({ kv, env: {}, now });
  assert.equal(await s.read('libraryContext'), true);
  kv.fail = true; t += 31_000;
  assert.equal(await s.read('libraryContext'), true, 'kept the last good setting');
  await assert.rejects(() => s.set('libraryLibrarian', false), /kv down/);
  assert.deepEqual(JSON.parse(kv.m.get(KV_KEY)).toggles, { libraryContext: true }, 'nothing was written over the stored switches');
  const cold = createToggleStore({ kv, env: { LIBRARY_CONTEXT: '1' }, now });
  assert.deepEqual(await cold.resolve('libraryContext'), { value: true, source: 'env' }, 'never read: env fallback');
  s.invalidate(); kv.fail = false; assert.equal(await s.read('libraryContext'), true);
});

test('store: concurrent first reads share one KV read', async () => {
  const kv = fakeKv(), s = createToggleStore({ kv, env: {} });
  await Promise.all([s.read('libraryContext'), s.read('libraryLibrarian'), s.all()]);
  assert.equal(kv.reads, 1);
});

test('GET payload: counts and names only; caps from the KV counters; models by task; switches with their source', () => {
  const p = buildAgentsPayload({
    toggles: { libraryContext: { value: true, source: 'setting' }, libraryLibrarian: { value: true, source: 'default' } },
    capsRaw: { library_math_v1: JSON.stringify({ v: 1, used: 12, papers: { secret: {} } }), library_figs_v1: { used: 600 }, library_librarian_v1: null },
    models: { 'library-librarian': { provider: 'deepseek', model: 'deepseek-chat', maxOutput: 8192, key: 'sk-LEAK' }, 'research-pod': { provider: 'deepseek', model: 'deepseek-chat' } },
    jobs: { researchPod: { pageOn: true, railwayOn: true, lastRunAt: 5 } }, stats: { calls: 3 }, spendTodayUsd: 0.12,
  });
  assert.equal(p.ok, true);
  assert.deepEqual(p.caps['library-equations'], { key: 'library_math_v1', used: 12, cap: 1500, label: 'equation calls', known: true });
  assert.equal(p.caps['library-figures'].used, 600); assert.equal(p.caps['library-librarian'].used, 0); assert.equal(p.caps['library-librarian'].known, false);
  assert.deepEqual(p.models['library-librarian'], { provider: 'deepseek', model: 'deepseek-chat' }, 'only provider and model, nothing else of the resolved task');
  assert.ok(!JSON.stringify(p).match(/sk-LEAK|secret/));
  assert.equal(p.toggles.libraryContext.source, 'setting'); assert.equal(p.toggleDefs.libraryContext.spends, true);
  assert.deepEqual(p.jobs.researchPod, { pageOn: true, railwayOn: true, lastRunAt: 5 });
  assert.ok(p.flows.length >= 5 && p.flows.every(f => f.nodes.length && f.edges.length));
  assert.equal(usedOf('{"used":7}'), 7); assert.equal(usedOf('garbage'), null); assert.equal(usedOf(null), null); assert.equal(usedOf({ used: -1 }), null);
});

test('server.js: the routes exist, are gated (stricter than /api/ai-config), validate the id and read the counters from the existing KV keys', () => {
  const src = rd('../server.js');
  assert.ok(src.includes("app.get('/api/agents', _agentsGate,") && src.includes("app.post('/api/agents/toggle', _agentsGate, _agentsSameOrigin,"), 'both routes carry the gate');
  const gate = src.slice(src.indexOf('const _agentsGate'), src.indexOf("app.get('/api/agents'"));
  assert.ok(gate.includes("if (!AUTH_ENABLED) return next();") && gate.includes("authVerifyCookie(authParseCookies(req)[`${AUTH_COOKIE_NAME}_main`], 'main')") && gate.includes('.status(401)'), 'main-zone login cookie, 401 JSON');
  assert.ok(gate.includes('cross-origin request refused'));
  // the ai-config POST (which changes model routing and so spend) carries the same two gates, called lazily because they are defined further down
  assert.ok(src.includes("app.post('/api/ai-config', (q, r, n) => _agentsGate(q, r, n), (q, r, n) => _agentsSameOrigin(q, r, n), async (req, res) =>"), 'ai-config POST is gated');
  const post = src.slice(src.indexOf("app.post('/api/agents/toggle'"), src.indexOf("app.post('/api/agents/toggle'") + 900);
  assert.ok(post.includes('_agValidateToggle(req.body)') && post.includes('res.status(400)') && post.includes('_agentToggles.set(v.id, v.value)'));
  const get = src.slice(src.indexOf("app.get('/api/agents'"), src.indexOf("app.post('/api/agents/toggle'"));
  assert.ok(get.includes('aiResolveTask(id, cfg)') && get.includes('kv.get(k)') && get.includes('buildAgentsPayload('));
  assert.ok(!/process\.env\./.test(get), 'the GET reads no environment variable, so it cannot echo one');
  assert.ok(src.indexOf("app.get('/api/agents'") > 0 && !/_modelJson|callModel\(|fetch\(/.test(get + post), 'no model call, no network');
});

test('server.js: the library context reads the switch (setting > env > default); flag off still returns before any library work', () => {
  const src = rd('../server.js');
  assert.ok(src.includes("const _agentToggles = _agCreateToggles({ kv });") && src.includes('const readToggle = id => _agentToggles.read(id);'));
  assert.ok(!/_LIX\.libraryContextOn\(\)/.test(src), 'no direct env read left in server.js');
  const ctx = src.slice(src.indexOf('async function _libCtx'), src.indexOf('/** On first read in this process'));
  assert.ok(ctx.indexOf("if (!force && !(await readToggle('libraryContext'))) return null;") < ctx.indexOf('_libApi.contextFor'));
  assert.ok(ctx.indexOf("if (!(await readToggle('libraryContext'))) return null;") < ctx.indexOf("if (!(await readToggle('libraryLibrarian'))) return _libCtx(query);"), 'context switch first, then the librarian switch');
  assert.ok(ctx.indexOf("readToggle('libraryLibrarian')") < ctx.indexOf('_libApi.roundContext'), 'librarian off: the rule-based context, no librarian call');
  assert.ok(src.includes("const libCase = (await readToggle('libraryContext')) && caseId"));
});

test('the UI builders: escape everything, show the spends-money note, the cap bar and a switch that reflects the state', () => {
  assert.equal(esc('<b>"x"&\'</b>'), '&lt;b&gt;&quot;x&quot;&amp;&#39;&lt;/b&gt;');
  const D = buildAgentsPayload({ toggles: { libraryContext: { value: false, source: 'env' }, libraryLibrarian: { value: true, source: 'default' } }, capsRaw: { library_librarian_v1: { used: 360 } }, models: { 'library-librarian': { provider: 'deepseek', model: 'deepseek-chat' } } });
  const a = D.agents.find(x => x.id === 'library-librarian'), html = cardHtml(a, D, { open: true });
  assert.ok(html.includes('<details') && html.includes(' open') && html.includes('deepseek-chat') && html.includes('data-goto-tab="aimodels"'));
  assert.ok(html.includes('360 of 400 librarian calls used') && html.includes('class="hot"'), 'a cap at 90% or more turns red');
  assert.ok(html.includes('aria-checked="false"') && html.includes('data-toggle="libraryContext"') && html.includes('Spends money when on'));
  assert.ok(html.includes('Has no effect while the library switch above is off.') && !/ag-note" hidden/.test(html));
  assert.ok(html.includes('the LIBRARY_CONTEXT variable is only used until you press this') === false, 'the env note shows only while the source is the setting');
  assert.ok(switchHtml('libraryContext', D.toggleDefs.libraryContext, { value: true, source: 'setting' }).includes('aria-checked="true"'));
  assert.equal(capHtml(null), '');
  const evil = { ...a, name: '<img src=x onerror=alert(1)>', purpose: '"><script>x</script>' };
  assert.ok(!/<img|<script>/.test(cardHtml(evil, D)));
});
