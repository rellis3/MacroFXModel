// js/terminal/asofBoot.test.mjs: the fetch gate of the as-of clock, run in a fake window. The point of these tests is the LIVE-LEAK GUARD: with an as-of
// time set, no market-data read ever reaches the live server. node --test js/terminal/asofBoot.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseAsofValue } from '../asofCore.js';

const src = fs.readFileSync(new URL('./asofBoot.js', import.meta.url), 'utf8');

function boot(search = '', hash = '') {
  const liveCalls = [], timers = [], replaced = [];
  const realFetch = async (u, init) => { liveCalls.push([typeof u === 'string' ? u : u.url, init?.method ?? 'GET']); return new Response(JSON.stringify({ ok: true, live: true }), { status: 200 }); };
  const loc = { search, hash, href: `https://desk.example/desk-terminal.html${search}${hash}`, origin: 'https://desk.example' };
  const g = {
    fetch: realFetch, location: loc, URL, URLSearchParams, Response, Promise, Date, JSON, isFinite, Number, String, Error, decodeURIComponent,
    history: { replaceState: (a, b, u) => replaced.push(u) },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
  };
  g.globalThis = g; g.window = g;
  vm.runInNewContext(src, g);
  return { g, A: g.__deskAsof, liveCalls, timers, replaced };
}
const body = async r => JSON.parse(await r.text());
const answerFn = async (p) => new Response(JSON.stringify({ ok: true, from: 'record', p }), { status: 200 });

test('no as-of in the address: a straight pass-through, nothing held, nothing active', async () => {
  const { g, A, liveCalls } = boot('', '');
  assert.equal(A.requested, false); assert.equal(A.holding, false); assert.equal(A.active, false); assert.equal(A.t, null);
  const r = await g.fetch('/api/ccy-strength'); assert.equal((await body(r)).live, true); assert.equal(liveCalls.length, 1);
});

test('LIVE-LEAK GUARD: with an as-of time, market-data reads are held, then answered by the answerer; the live server is never asked', async () => {
  const { g, A, liveCalls } = boot('?asof=2026-11-12T14:30Z');
  assert.equal(A.requested, true); assert.equal(A.holding, true); assert.equal(A.t, Date.parse('2026-11-12T14:30:00Z'));
  let settled = false;
  const p = g.fetch('/api/ccy-strength').then(r => { settled = true; return r; });
  await new Promise(r => setImmediate(r));
  assert.equal(settled, false, 'held until the clock is up'); assert.equal(liveCalls.length, 0, 'nothing went to the live server while holding');
  A.activate(answerFn);
  const j = await body(await p);
  assert.equal(j.from, 'record'); assert.equal(j.p, '/api/ccy-strength'); assert.equal(liveCalls.length, 0);
  for (const u of ['/api/live-layer', '/api/vol-clock', '/api/desk-bars?inst=GOLD&tf=5m', 'https://desk.example/api/risk-flags']) { const r = await g.fetch(u); assert.equal((await body(r)).from, 'record', u); }
  assert.equal(liveCalls.length, 0, 'not one market-data read reached the live server in a past view');
});

test('what passes straight through while holding or active: the plumbing routes, non-GET, other origins, anything that is not /api/', async () => {
  const { g, A, liveCalls } = boot('?asof=2026-11-12T14:30Z');
  await g.fetch('/api/desk-session'); await g.fetch('/api/desk-access'); await g.fetch('/api/desk-snapshots/index'); await g.fetch('/api/desk-snapshots?fields=strength'); await g.fetch('/api/nav-layout');
  await g.fetch('/api/desk-alert-rules', { method: 'POST', body: '{}' }); await g.fetch('https://other.example/api/x'); await g.fetch('/js/terminal/asofClock.js');
  assert.equal(liveCalls.length, 8, 'all eight went live straight away, while the page was still holding');
  A.activate(answerFn);
  liveCalls.length = 0;
  await g.fetch('/api/desk-access'); await g.fetch('/api/desk-monitors', { method: 'POST', body: '{}' });
  assert.equal(liveCalls.length, 2);
  const settings = await g.fetch('/api/desk-monitors');   // a GET of the person's settings goes to the answerer, which decides (it passes it on): the gate itself never guesses
  assert.equal((await body(settings)).from, 'record');
});

test('an answerer that throws REFUSES; it never falls through to the live server', async () => {
  const { g, A, liveCalls } = boot('?asof=2026-11-12T14:30Z');
  A.activate(async () => { throw new Error('boom'); });
  const j = await body(await g.fetch('/api/ccy-strength'));
  assert.equal(j.ok, false); assert.equal(j.noRecord, true); assert.match(j.error, /Nothing live/); assert.equal(liveCalls.length, 0);
  const B = boot('?asof=2026-11-12T14:30Z'); B.A.active = true; B.A.holding = false; B.A.answer = null;
  const k = await body(await B.g.fetch('/api/ccy-strength'));
  assert.equal(k.noRecord, true, 'active without an answerer refuses too'); assert.equal(B.liveCalls.length, 0);
});

test('a session that may not use the clock: abandon() lets the held reads go to the live server and drops the address', async () => {
  const { g, A, liveCalls, replaced } = boot('?asof=2026-11-12T14:30Z');
  const p = g.fetch('/api/ccy-strength');
  A.abandon('not available to this session');
  const j = await body(await p);
  assert.equal(j.live, true); assert.equal(liveCalls.length, 1); assert.equal(A.active, false); assert.equal(A.t, null); assert.equal(A.failed, 'not available to this session');
  assert.equal(replaced.length, 1); assert.ok(!/asof/.test(replaced[0]), 'the as-of value is gone from the address');
  assert.equal((await body(await g.fetch('/api/vol-clock'))).live, true, 'after that the page is live like any other');
});

test('the gate gives up on its own after 20 seconds if the clock never starts', async () => {
  const { g, A, timers, liveCalls } = boot('?asof=2026-11-12T14:30Z');
  const t = timers.find(x => x.ms === 20000); assert.ok(t, 'a 20 second timer was set');
  const p = g.fetch('/api/ccy-strength'); t.fn();
  assert.equal((await body(await p)).live, true); assert.equal(A.holding, false); assert.equal(liveCalls.length, 1);
});

test('back to live: deactivate() returns every read to the live server', async () => {
  const { g, A, liveCalls } = boot('?asof=2026-11-12T14:30Z');
  A.activate(answerFn); A.deactivate();
  assert.equal((await body(await g.fetch('/api/ccy-strength'))).live, true); assert.equal(liveCalls.length, 1); assert.equal(A.active, false);
});

test('the boot script reads the address exactly as js/asofCore.js does', () => {
  for (const [search, hash, want] of [['?asof=2026-11-12T14:30Z', '', 'ok'], ['', '#asof=2026-11-12T14:30Z', 'ok'], ['?asof=2026-11-12', '', 'ok'], ['?asof=2026-11-12 14:30', '', 'ok'], ['?asof=garbage', '', null], ['?asof=1999-01-01', '', null], ['', '', null]]) {
    const { A } = boot(search, hash);
    const core = parseAsofValue(new URLSearchParams(search.replace(/^\?/, '')).get('asof') ?? (/^#asof=(.+)$/.exec(hash)?.[1] ?? null));
    assert.equal(A.t, core, `${search}${hash}`); assert.equal(A.t != null, want === 'ok');
  }
});
