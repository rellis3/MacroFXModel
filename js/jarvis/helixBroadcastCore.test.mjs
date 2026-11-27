// node js/jarvis/helixBroadcastCore.test.mjs
import assert from 'node:assert/strict';
import { validatePublished, validateFailed, publishedText, failedText, readStore, addItem, addFailure, specialsDue, releaseKey, validateEpisode, podcastRss, durWords, DAY_CAP, FAIL_CAP, KV_KEY } from './helixBroadcastCore.js';
import { mount, pushOk, feedKey } from './helixBroadcast.js';

const T = Date.parse('2026-11-27T07:31:00Z');

// ── validation: the link is built from the id, never taken from the body ──
let v = validatePublished({ videoId: 'abcDEF12345', title: 'H.E.L.I.X. Morning Briefing · Fri 27 Nov 2026', part: 'morning', seconds: 271.4, url: 'https://evil.example/x' }, T);
assert.ok(v.ok); assert.equal(v.item.url, 'https://youtu.be/abcDEF12345'); assert.equal(v.item.seconds, 271.4); assert.equal(v.item.format, 'wide');
assert.equal(validatePublished({ videoId: 'abcDEF12345', title: 't', part: 'short' }).item.url, 'https://youtube.com/shorts/abcDEF12345', 'a Short gets the shorts link');
for (const bad of [{}, { videoId: 'abc', title: 't', part: 'morning' }, { videoId: 'abcDEF12345', title: '', part: 'morning' }, { videoId: 'abcDEF12345', title: 't', part: 'lunch' }, { videoId: 'abcDEF12345', title: 't', part: 'podcast' }, { videoId: 'abc"<b>1234', title: 't', part: 'morning' }])
  assert.ok(!validatePublished(bad).ok, JSON.stringify(bad));
assert.equal(validatePublished({ videoId: 'abcDEF12345', title: 'x\n\u0007'.repeat(80) + 'y'.repeat(200), part: 'evening' }).item.title.length, 100, 'title capped, control characters gone');
assert.ok(validateFailed({ part: 'evening', error: 'boom' }).ok && !validateFailed({ part: 'x' }).ok);

// ── the notes ──
const txt = publishedText(v.item);
assert.equal(txt, '<b>H.E.L.I.X. · Morning briefing is up</b>\nH.E.L.I.X. Morning Briefing · Fri 27 Nov 2026\nhttps://youtu.be/abcDEF12345\n4 min 31 s · unlisted');
assert.ok(publishedText({ ...v.item, title: '<script>' }).includes('&lt;script&gt;'), 'HTML is escaped');
const ft = failedText('special', 'the recording has no sound <on> it');
assert.ok(ft.startsWith('<b>H.E.L.I.X. · Release special FAILED</b>') && ft.includes('&lt;on&gt;'));
assert.equal(durWords(52), '52 s'); assert.equal(durWords(120), '2 min'); assert.equal(durWords(null), '');

// ── the list: dedupe by id, daily caps ──
let s = readStore(null); assert.deepEqual(s, { items: [], day: { date: null, sent: 0, failed: 0 } });
let r = addItem(s, v.item, '2026-11-27'); assert.ok(!r.duplicate && !r.capped); s = r.store; assert.equal(s.items.length, 1); assert.equal(s.day.sent, 1);
r = addItem(s, v.item, '2026-11-27'); assert.ok(r.duplicate, 'the same video id is listed and noted once');
for (let i = 0; i < DAY_CAP + 2; i++) s = addItem(s, { ...v.item, id: `id${String(i).padStart(9, '0')}` }, '2026-11-27').store;
assert.equal(s.day.sent, DAY_CAP); assert.ok(addItem(s, { ...v.item, id: 'zzzzzzzzzzz' }, '2026-11-27').capped);
assert.equal(addItem(s, { ...v.item, id: 'yyyyyyyyyyy' }, '2026-11-28').store.day.sent, 1, 'a new London day resets the cap');
let f = readStore(JSON.stringify(s)); for (let i = 0; i < FAIL_CAP; i++) f = addFailure(f, '2026-11-27').store;
assert.ok(addFailure(f, '2026-11-27').capped);
assert.equal(readStore('not json').items.length, 0);

// ── specials: rank-3 payrolls / CPI / rate decisions, 30-80 minutes after the print ──
const nfp = Date.parse('2026-12-04T13:30:00Z');
const week = [
  { date: '2026-12-04T13:30:00Z', country: 'USD', impact: 'High', title: 'Non-Farm Employment Change' },
  { date: '2026-12-04T13:30:00Z', country: 'USD', impact: 'High', title: 'Unemployment Rate' },
  { date: '2026-12-04T13:30:00Z', country: 'USD', impact: 'High', title: 'Average Hourly Earnings m/m' },
  { ms: nfp, ccy: 'CAD', rank: 3, event: 'Unemployment Rate' },
  { ms: nfp - 3600e3, country: 'EUR', impact: 'High', event: 'ECB President Lagarde Speaks' },
  { ms: nfp, country: 'GBP', impact: 'Medium', event: 'CPI y/y' },
  { ms: nfp, country: 'JPY', impact: 'High', event: 'BOJ Monetary Policy Meeting Minutes' },
];
assert.deepEqual(specialsDue(week, nfp + 20 * 60e3), [], 'too early');
let due = specialsDue(week, nfp + 35 * 60e3);
assert.equal(due.length, 1); assert.equal(due[0].ccy, 'USD'); assert.equal(due[0].key, '2026-12-04|USD|13:30'); assert.equal(due[0].name, 'Non-Farm Employment Change');
assert.deepEqual(specialsDue(week, nfp + 35 * 60e3, new Set([releaseKey(nfp, 'USD')])), [], 'one special per release');
assert.deepEqual(specialsDue(week, nfp + 90 * 60e3), [], 'too late');
due = specialsDue([{ ms: nfp, country: 'US', impact: 'High', event: 'Federal Funds Rate' }, { ms: nfp, country: 'US', impact: 'High', event: 'FOMC Statement' }, { ms: nfp + 5 * 60e3, country: 'GB', impact: 'High', event: 'Official Bank Rate' }], nfp + 40 * 60e3);
assert.equal(due.length, 2); assert.equal(due[0].name, 'Federal Funds Rate and FOMC Statement');
assert.equal(specialsDue([{ ms: nfp, country: 'US', impact: 'High', event: 'CPI m/m' }], nfp + 31 * 60e3).length, 1);
assert.deepEqual(specialsDue(null, nfp), []);

// ── podcast ──
assert.ok(validateEpisode({ id: '2026-11-27-morning', title: 'Morning', part: 'morning', seconds: '300' }, 5000).ok);
assert.ok(!validateEpisode({ id: '../x', title: 'M', part: 'morning' }, 5000).ok && !validateEpisode({ id: '2026-11-27-m', title: 'M', part: 'morning' }, 10).ok);
const rss = podcastRss([{ id: '2026-11-27-morning', title: 'Fri <27>', part: 'morning', seconds: 300, bytes: 4000, at: '2026-11-27T07:40:00Z' }], 'https://h/api/helix/podcast/k');
assert.ok(rss.startsWith('<?xml') && rss.includes('url="https://h/api/helix/podcast/k/2026-11-27-morning.mp3"') && rss.includes('<itunes:duration>00:05:00</itunes:duration>') && rss.includes('Fri &lt;27&gt;') && rss.includes('<itunes:block>Yes'));

// ── auth ──
assert.ok(pushOk(undefined, '', true) && !pushOk(undefined, '', false), 'no secret: notes open (bounded), uploads closed');
assert.ok(pushOk('s3cret', 's3cret', false) && !pushOk('s3cre', 's3cret', true) && !pushOk(null, 's3cret', true));
assert.equal(feedKey({}), null); assert.equal(feedKey({ HELIX_PODCAST_KEY: 'abcdefghijklmnop1234' }), 'abcdefghijklmnop1234'); assert.equal(feedKey({ KV_WRITE_SECRET: 'x' }).length, 32);

// ── the routes, on a fake app ──
const routes = {}, app = { get: (p, ...h) => { routes[`GET ${p}`] = h; }, post: (p, ...h) => { routes[`POST ${p}`] = h; } };
const store = new Map(), sent = [];
const deps = { express: { json: () => (_q, _r, n) => n(), raw: () => (_q, _r, n) => n() }, kv: { get: async k => store.get(k) ?? null, put: async (k, val) => { store.set(k, val); } },
  ownerOnly: (_q, _r, n) => n(), tgSendAs: async (sender, text) => { sent.push([sender, text]); return true; }, londonDate: () => '2026-11-27',
  selfJson: async p => { assert.equal(p, '/api/events'); return week; }, r2: { configured: () => false } };
await mount(app, deps);
const call = async (key, req) => {
  const res = { code: 200, body: null, set() { return this; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; }, send(b) { this.body = b; return this; } };
  const q = { get: h => (req.headers ?? {})[h.toLowerCase()], query: {}, params: {}, ...req };
  const hs = routes[key]; let i = 0; const next = async () => { const h = hs[i++]; if (h) await h(q, res, next); }; await next(); return res;
};
const prevSecret = process.env.KV_WRITE_SECRET; delete process.env.KV_WRITE_SECRET;
let res = await call('POST /api/helix/broadcast-published', { body: { videoId: 'abcDEF12345', title: 'Morning', part: 'morning', seconds: 200 } });
assert.equal(res.code, 200); assert.ok(res.body.sent && !res.body.duplicate);
assert.equal(sent.length, 1); assert.equal(sent[0][0], 'helixBroadcast', 'its own sender (⚙ Alerts switch)');
res = await call('POST /api/helix/broadcast-published', { body: { videoId: 'abcDEF12345', title: 'Morning', part: 'morning' } });
assert.ok(res.body.duplicate && !res.body.sent); assert.equal(sent.length, 1, 'a retried notify sends nothing');
res = await call('POST /api/helix/broadcast-published', { body: { videoId: 'nope', title: 'x', part: 'morning' } }); assert.equal(res.code, 400);
res = await call('POST /api/helix/broadcast-failed', { body: { part: 'evening', error: 'washed-out frames' } }); assert.ok(res.body.sent); assert.ok(sent[1][1].includes('Evening briefing FAILED'));
res = await call('GET /api/helix/broadcasts', { query: {} }); assert.equal(res.body.items.length, 1); assert.equal(res.body.items[0].url, 'https://youtu.be/abcDEF12345');
assert.ok(JSON.parse(store.get(KV_KEY)).items.length === 1);
res = await call('GET /api/helix/special-due', { query: { now: String(nfp + 35 * 60e3) } }); assert.equal(res.body.due.length, 1);
await call('POST /api/helix/broadcast-published', { body: { videoId: 'spcDEF12345', title: 'Special', part: 'special', releaseKey: '2026-12-04|USD|13:30' } });
res = await call('GET /api/helix/special-due', { query: { now: String(nfp + 35 * 60e3) } }); assert.equal(res.body.due.length, 0, 'a published special closes its release');
res = await call('POST /api/helix/podcast/episode', { query: { id: 'x12345', title: 't', part: 'morning' }, body: Buffer.alloc(5000) }); assert.equal(res.code, 401, 'podcast upload fails closed with no secret');
process.env.KV_WRITE_SECRET = 'top-secret-value';
res = await call('POST /api/helix/broadcast-published', { body: { videoId: 'eveDEF12345', title: 'Evening', part: 'evening' } }); assert.equal(res.code, 401, 'with a secret set, it is required');
res = await call('POST /api/helix/broadcast-published', { headers: { 'x-auth-token': 'top-secret-value' }, body: { videoId: 'eveDEF12345', title: 'Evening', part: 'evening' } }); assert.ok(res.body.sent);
res = await call('POST /api/helix/podcast/episode', { headers: { 'x-auth-token': 'top-secret-value' }, query: { id: 'x12345', title: 't', part: 'morning' }, body: Buffer.alloc(5000) }); assert.equal(res.code, 503, 'no R2: refused');
res = await call('GET /api/helix/podcast/:key/feed.xml', { params: { key: 'wrong' } }); assert.equal(res.code, 404);
if (prevSecret == null) delete process.env.KV_WRITE_SECRET; else process.env.KV_WRITE_SECRET = prevSecret;
console.log('helixBroadcastCore: all tests passed');
