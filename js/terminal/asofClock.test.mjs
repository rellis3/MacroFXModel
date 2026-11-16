// js/terminal/asofClock.test.mjs: the as-of clock's answerer, banner and controls over a stand-in page and a fake server. It proves the rules (never a later record,
// never a live number in a past view, an honest refusal) and the wiring. It does NOT prove the look or the feel in a real browser. node --test js/terminal/asofClock.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { makePage, makeWin, memStore, El } from './feelFakeDom.fixtures.mjs';
import { mountAsof } from './asofClock.js';
import { exportName } from './exportCore.js';

const bootSrc = fs.readFileSync(new URL('./asofBoot.js', import.meta.url), 'utf8');
const T = s => Date.parse(s);
const json = o => new Response(JSON.stringify(o), { status: 200 });

const feedsOf = (ld, extra = {}) => ({
  'ccy-strength': { ok: true, json: { ok: true, asOf: `${ld}T10:05:00Z`, horizons: { '4H': { available: true, pairs: 28, scores: [{ ccy: 'USD', score: 1, rank: 1 }, { ccy: 'EUR', score: -1, rank: 2 }], leader: 'USD', laggard: 'EUR', spread: 2, flat: false } } } },
  'world-stress': { ok: true, json: { ok: true, overall: 'watch', tiles: [], daily: ld } },
  'vol-board': { ok: false, error: 'timeout' },
  ...extra,
});
const SNAPS = { '2026-11-14': { ts: T('2026-11-14T10:03Z'), ld: '2026-11-14', feeds: feedsOf('2026-11-14') }, '2026-11-15': { ts: T('2026-11-15T10:03Z'), ld: '2026-11-15', feeds: feedsOf('2026-11-15') }, '2026-11-16': { ts: T('2026-11-16T10:03Z'), ld: '2026-11-16', feeds: feedsOf('2026-11-16') } };
const core = (iso, e, u) => ({ ts: T(iso), d: { strength: { dataAsOf: iso, h: { '4H': { flat: false, lead: e, lag: u, spread: 3, s: { USD: u === 'USD' ? -1.5 : 1.5, EUR: e === 'EUR' ? 1.5 : -1.5 } } } } } });
const POINTS = [core('2026-11-14T17:49:00Z', 'USD', 'EUR'), core('2026-11-15T09:00:00Z', 'USD', 'EUR'), core('2026-11-15T11:55:00Z', 'EUR', 'USD'), core('2026-11-16T12:00:00Z', 'USD', 'EUR')];

function setup({ search = '', now = T('2026-11-16T12:30Z') } = {}) {
  const doc = makePage(); const btn = new El('button'); btn.attrs.id = 'asofbtn'; btn.attrs.hidden = ''; doc.body.appendChild(btn);
  const live = [], assigned = [], replaced = [], events = [], loads = [];
  const realFetch = async (u) => {
    const url = String(u); live.push(url);
    if (url.startsWith('/api/desk-snapshots/index')) return json({ ok: true, coreDays: ['2026-11-14', '2026-11-15', '2026-11-16'], fullDays: ['2026-11-14', '2026-11-15', '2026-11-16'] });
    if (url.startsWith('/api/desk-snapshots/full')) { const d = /date=([\d-]+)/.exec(url)[1]; return json(SNAPS[d] ? { ok: true, source: 'kv', snapshot: SNAPS[d] } : { ok: false }); }
    if (url.startsWith('/api/desk-snapshots?')) return json({ ok: true, points: POINTS });
    if (url.startsWith('/api/desk-bars')) { const b = []; for (let t = T('2026-11-15T11:00Z') / 1000; t <= T('2026-11-15T13:00Z') / 1000; t += 300) b.push({ time: t, open: 1, high: 2, low: 0, close: 1 }); return json({ ok: true, sec: 300, forming: true, bars: b }); }
    if (url.startsWith('/api/desk-run')) return json({ ok: true, date: /date=([\d-]+)/.exec(url)?.[1] ?? 'LIVE', head: { ok: true } });
    if (url.startsWith('/api/desk-monitors')) return json({ ok: true, monitors: [{ name: 'mine' }] });
    return json({ ok: true, live: true });
  };
  const loc = { search, hash: '', href: `https://desk.example/desk-terminal.html${search}`, origin: 'https://desk.example', assign: u => assigned.push(u) };
  const g = { fetch: realFetch, location: loc, URL, URLSearchParams, Response, Promise, Date, JSON, isFinite, Number, String, Error, decodeURIComponent, history: { replaceState: (a, b, u) => replaced.push(u) }, setTimeout: () => 0 };
  g.globalThis = g; g.window = g; vm.runInNewContext(bootSrc, g);
  const A = g.__deskAsof;
  const win = makeWin(doc, { __deskAsof: A, location: loc, history: g.history, fetch: realFetch, Event: class { constructor(t) { this.type = t; } }, dispatchEvent: e => events.push(e.type), load: () => loads.push(A.t), sessionStorage: memStore(), clearTimeout() {} });
  return { doc, win, A, btn, live, assigned, replaced, events, loads, ok: mountAsof({ doc, win, now: () => now, store: memStore() }), g };
}
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(r => setImmediate(r)); };
const body = async r => JSON.parse(await r.text());
const ask = (A, p) => A.answer(p, A.realFetch);

test('no button on the page, or no gate script: the clock does not mount (a desk login with the feature off has neither)', () => {
  const doc = makePage(); const win = makeWin(doc, {});
  assert.equal(mountAsof({ doc, win }), false);
  const s = setup(); s.doc.getElementById('asofbtn').remove(); s.win.deskAsof = undefined;
  assert.equal(mountAsof({ doc: s.doc, win: s.win }), false);
});

test('live page: the button shows, no banner, nothing held, nothing active, no records are read until the control is opened', async () => {
  const s = setup(); await settle();
  assert.equal(s.ok, true); assert.equal(s.btn.hidden, false); assert.match(s.btn.textContent, /Time machine/);
  assert.equal(s.doc.getElementById('asofbar').hidden, true); assert.equal(s.A.active, false); assert.equal(s.A.holding, false);
  assert.equal(s.live.length, 0, 'no snapshot was fetched just for mounting: the owner pays for it only when they open the control');
});

test('opening the control shows the coverage honestly and the controls', async () => {
  const s = setup(); await settle();
  s.btn.click(); await settle();
  const pop = s.doc.getElementById('asofpop'); assert.equal(pop.hidden, false);
  assert.match(pop.textContent, /Snapshots run from Sat 14 Nov 17:49 UTC to Mon 16 Nov 12:00 UTC: 4 points/); assert.match(pop.textContent, /Capture began on 14 Nov 2026, so earlier dates have nothing/);
  assert.ok(pop.querySelector('#asof-dt')); assert.ok(pop.querySelector('#asof-scrub')); assert.equal(pop.querySelectorAll('[data-asof-speed]').length, 4);
  assert.match(pop.textContent, /your own settings .* stay live/i);
});

test('a page opened with ?asof=: the clock comes up, the held reads go, the banner says when and that it is not live', async () => {
  const s = setup({ search: '?asof=2026-11-15T12:00Z' });
  assert.equal(s.A.holding, true);
  const p = s.g.fetch('/api/ccy-strength'); await settle();
  assert.equal(s.A.active, true); assert.equal(s.A.holding, false);
  const j = await body(await p);
  assert.equal(j.asofRecord.ld, '2026-11-15'); assert.equal(j.asofRecord.ts, T('2026-11-15T10:03Z'));
  const bar = s.doc.getElementById('asofbar'); assert.equal(bar.hidden, false); assert.match(bar.textContent, /Viewing Sun 15 Nov 12:00 UTC, not live/); assert.match(bar.textContent, /Back to live/);
});

test('NEVER LATER: the record used was taken at or before the as-of time (the 15th at 09:00 UTC is before that day\'s 10:03 record, so the 14th is used)', async () => {
  const s = setup({ search: '?asof=2026-11-15T09:00Z' }); await settle();
  const j = await body(await ask(s.A, '/api/world-stress'));
  assert.equal(j.asofRecord.ld, '2026-11-14'); assert.equal(j.daily, '2026-11-14'); assert.ok(j.asofRecord.ts <= s.A.t);
  for (const t of ['2026-11-14T10:04Z', '2026-11-15T10:02Z', '2026-11-16T10:02Z']) { s.A.t = T(t); const k = await body(await ask(s.A, '/api/world-stress')); assert.ok(k.asofRecord.ts <= T(t), t); }
});

test('before the first record: every board gets a plain refusal, with the date snapshots start', async () => {
  const s = setup({ search: '?asof=2026-11-10T09:00Z' }); await settle();
  const j = await body(await ask(s.A, '/api/ccy-strength'));
  assert.equal(j.ok, false); assert.equal(j.noRecord, true); assert.match(j.error, /No record of this at Tue 10 Nov 09:00 UTC/); assert.match(j.error, /snapshots start 14 Nov 2026/); assert.match(j.error, /Nothing live/);
});

test('LIVE-LEAK GUARD: a route the record does not hold is refused and the live server is never asked for it; a failed feed in the record is refused too', async () => {
  const s = setup({ search: '?asof=2026-11-15T12:00Z' }); await settle();
  s.live.length = 0;
  for (const u of ['/api/live-layer', '/api/news-channel', '/api/chain-live', '/api/vol-board']) { const j = await body(await ask(s.A, u)); assert.equal(j.noRecord, true, u); assert.equal(j.ok, false); }
  assert.ok(!s.live.some(u => /live-layer|news-channel|chain-live|vol-board/.test(u)), 'none of those went to the live server');
  const bar = s.doc.getElementById('asofbar'); await settle(); s.win.flush();
  assert.match(bar.textContent, /4 with no record at that time/);
});

test('five-minute strength scores are laid over the daily record, only from points at or before the time', async () => {
  const s = setup({ search: '?asof=2026-11-15T12:00Z' }); await settle();
  const j = await body(await ask(s.A, '/api/ccy-strength'));
  assert.equal(j.horizons['4H'].scores[0].ccy, 'EUR', 'the 11:55 point (EUR leading) is the latest at or before 12:00'); assert.equal(j.horizons['4H'].pairs, 28); assert.equal(j.asofOverlay.ts, T('2026-11-15T11:55:00Z'));
  s.A.t = T('2026-11-15T09:30Z');
  const k = await body(await ask(s.A, '/api/ccy-strength'));
  assert.equal(k.asofRecord.ld, '2026-11-14', 'before 10:03 on the 15th the 14th daily record is the latest');
  assert.equal(k.asofOverlay.ts, T('2026-11-15T09:00:00Z'), 'and the 09:00 five-minute point, newer than that record, is laid over it (the 11:55 and the 16th points are later, so not used)');
});

test('candles are cut at the as-of time; the morning book is read by date; the person\'s own settings pass through', async () => {
  const s = setup({ search: '?asof=2026-11-15T12:00Z' }); await settle();
  const b = await body(await ask(s.A, '/api/desk-bars?inst=GOLD&tf=5m'));
  assert.ok(b.bars.length > 0 && b.bars.every(x => (x.time + 300) * 1000 <= T('2026-11-15T12:00Z')), 'no candle finishes after the as-of time'); assert.equal(b.forming, false);
  const r = await body(await ask(s.A, '/api/desk-run'));
  assert.equal(r.date, '2026-11-15');
  s.A.t = T('2026-11-15T06:00Z'); assert.equal((await body(await ask(s.A, '/api/desk-run'))).date, '2026-11-14', 'before 08:00 London the previous morning book');
  const m = await body(await ask(s.A, '/api/desk-monitors')); assert.equal(m.monitors[0].name, 'mine');
});

test('commands: ASOF set goes to the address and reloads; ASOF live leaves; stepping while active redraws in place, moves the address and calls load()', async () => {
  const s = setup({ search: '?asof=2026-11-15T12:00Z' }); await settle();
  s.win.deskAsof.act({ op: 'set', t: T('2026-11-12T14:30Z') });
  assert.match(s.assigned.at(-1), /asof=2026-11-12T14%3A30Z/);
  s.win.deskAsof.act({ op: 'step', ms: 3_600_000 });
  assert.equal(s.A.t, T('2026-11-15T13:00Z')); assert.equal(s.loads.at(-1), s.A.t); assert.ok(s.events.includes('deskasof')); assert.match(s.replaced.at(-1), /asof=2026-11-15T13%3A00Z/);
  assert.match(s.doc.getElementById('asofbar').textContent, /Sun 15 Nov 13:00 UTC/);
  s.win.deskAsof.act({ op: 'live' });
  assert.ok(!/asof/.test(s.assigned.at(-1)), 'back to live drops the as-of value'); assert.equal(s.A.active, false);
});

test('the banner button and the control\'s Back to live both leave; Escape closes the control', async () => {
  const s = setup({ search: '?asof=2026-11-15T12:00Z' }); await settle();
  const bar = s.doc.getElementById('asofbar'); bar.querySelector('[data-asof="live"]').click();
  assert.ok(!/asof/.test(s.assigned.at(-1)));
  s.btn.click(); await settle(); assert.equal(s.doc.getElementById('asofpop').hidden, false);
  s.doc.fire('keydown', s.doc.body, { key: 'Escape' }); assert.equal(s.doc.getElementById('asofpop').hidden, true);
});

test('play: a speed button sets the speed; play from a live page reloads into the as-of view and resumes playing there', async () => {
  const s = setup(); await settle();
  s.btn.click(); await settle();
  s.doc.getElementById('asofpop').querySelector('[data-asof-speed="60"]').click();
  assert.equal(s.doc.getElementById('asofpop').querySelector('[data-asof-speed="60"]').getAttribute('aria-pressed'), 'true');
  s.doc.getElementById('asofpop').querySelector('[data-asof="play"]').click();
  assert.match(s.assigned.at(-1), /asof=/, 'play from live goes to a past time first');
});

test('a failed index read gives the page back to live and says so (never a half past view)', async () => {
  const doc = makePage(); const btn = new El('button'); btn.attrs.id = 'asofbtn'; doc.body.appendChild(btn);
  const loc = { search: '?asof=2026-11-15T12:00Z', href: 'https://desk.example/x?asof=2026-11-15T12:00Z', origin: 'https://desk.example', assign() {} };
  const g = { fetch: async () => { throw new Error('offline'); }, location: loc, URL, URLSearchParams, Response, Promise, Date, JSON, isFinite, Number, String, Error, decodeURIComponent, history: { replaceState() {} }, setTimeout: () => 0 };
  g.globalThis = g; g.window = g; vm.runInNewContext(bootSrc, g);
  const win = makeWin(doc, { __deskAsof: g.__deskAsof, location: loc, history: g.history, sessionStorage: memStore() });
  assert.equal(mountAsof({ doc, win }), true); await settle();
  assert.equal(g.__deskAsof.active, false); assert.equal(g.__deskAsof.holding, false); assert.match(g.__deskAsof.failed, /snapshots could not be read/);
  assert.match(doc.querySelector('.asof-toast').textContent, /page is live/);
});

test('an export made in a past view says so in its file name', () => {
  assert.match(exportName('Currency strength', 'csv', T('2026-11-16T12:30Z')), /^desk-currency-strength-2026-11-16-1230\.csv$/);
  globalThis.__deskAsof = { active: true, t: T('2026-11-12T14:30Z') };
  try { assert.match(exportName('Currency strength', 'csv', T('2026-11-16T12:30Z')), /^desk-currency-strength-asof-2026-11-12-1430\.csv$/); } finally { delete globalThis.__deskAsof; }
});

test('NO TRACE for a desk login: the button is hidden and carries its surface id; the gate script loads first in the head and holds nothing without ?asof=', () => {
  const html = fs.readFileSync(new URL('../../desk-terminal.html', import.meta.url), 'utf8');
  const tag = /<button[^>]*id="asofbtn"[^>]*>/.exec(html)?.[0];
  assert.ok(tag, 'the Time machine button is in the top bar'); assert.ok(tag.includes('data-surface="widget.asof"')); assert.ok(/\shidden[\s>]/.test(tag), 'starts hidden');
  const boot = html.indexOf('js/terminal/asofBoot.js'), anyOther = html.search(/<script[^>]*src="https:\/\/cdn|<script type="module"/);
  assert.ok(boot > 0 && boot < anyOther, 'the gate is the first script on the page');
  assert.ok(boot < html.indexOf('<script>try{var __t'), 'and it runs before the inline theme script and the page code');
  assert.ok(/'widget\.asof'/.test(fs.readFileSync(new URL('./tabRegistry.js', import.meta.url), 'utf8')), 'a registered surface');
  const feel = fs.readFileSync(new URL('./terminalFeel.js', import.meta.url), 'utf8');
  assert.ok(/if \(!want\.asof && globalThis\.__deskAsof\?\.requested\) globalThis\.__deskAsof\.abandon/.test(feel), 'a session that may not use the clock lets the gate go');
});
