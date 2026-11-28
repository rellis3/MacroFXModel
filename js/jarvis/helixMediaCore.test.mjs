// js/jarvis/helixMediaCore.test.mjs: the MEDIA routes' pure half (backfill checks, merging, Range) and the two route files mounted on a real express app with a fake KV and R2.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { validateBackfill, mergeVideos, readArchive, publishedVideos, podcastRows, byteRange, BACKFILL_MAX, ARCHIVE_KEY } from './helixMediaCore.js';

const NOW = Date.parse('2026-11-28T12:00:00Z');
const row = (id, part = 'morning', at = '2026-11-26T08:43:42Z', extra = {}) => ({ videoId: id, title: `t ${id}`, part, at, ...extra });

test('backfill: 11-character ids, known parts, real times; bad rows are listed and skipped, ids deduped within the body', () => {
  const v = validateBackfill({ items: [row('Dp72bawELA4'), row('short'), row('SdeVk8D2qE8', 'podcast'), row('Hv_xfHfMpMQ', 'evening', 'yesterday'), row('Dp72bawELA4', 'evening'),
    row('VEUynvXfcoY', 'short', '2026-11-26T11:58:50Z', { seconds: 9999999 }), row('PAfz9WXa3GM', 'guide', '2027-06-01T00:00:00Z'), { videoId: 'acW4P7woNqA', part: 'Evening', at: '2026-11-26T22:00:21Z' }] }, NOW);
  assert.equal(v.ok, true);
  assert.deepEqual(v.items.map(x => x.id), ['Dp72bawELA4', 'VEUynvXfcoY', 'acW4P7woNqA']);
  assert.deepEqual(v.rejected.map(r => r.i), [1, 2, 3, 4, 6]);
  assert.match(v.rejected.find(r => r.i === 4).error, /duplicate/);
  const s = v.items[1]; assert.equal(s.format, 'short'); assert.equal(s.seconds, null, 'an absurd length is dropped, not stored');
  assert.equal(v.items[2].part, 'evening'); assert.equal(v.items[2].title, 'H.E.L.I.X. Evening briefing', 'a missing title gets the programme name');
  assert.equal(validateBackfill({}).ok, false); assert.equal(validateBackfill({ items: [] }).ok, false);
  assert.equal(validateBackfill({ items: Array.from({ length: BACKFILL_MAX + 1 }, () => row('Dp72bawELA4')) }).ok, false, 'bounded');
  assert.ok(!('url' in v.items[0]), 'no link is stored from a body');
});

test('merge: the first row of a video wins, a missing length is filled, newest first, capped', () => {
  const a = [{ id: 'Dp72bawELA4', part: 'morning', title: 'kept', format: 'wide', seconds: null, at: '2026-11-26T08:43:42Z' }];
  const m = mergeVideos(a, [{ id: 'Dp72bawELA4', part: 'evening', title: 'other', format: 'wide', seconds: 288.7, at: '2026-11-26T08:43:42Z' }, { id: 'acW4P7woNqA', part: 'evening', title: 'e', format: 'wide', seconds: 321, at: '2026-11-26T22:00:21Z' }]);
  assert.equal(m.added, 1); assert.equal(m.duplicates, 1);
  assert.deepEqual(m.videos.map(x => [x.id, x.title, x.seconds]), [['acW4P7woNqA', 'e', 321], ['Dp72bawELA4', 'kept', 288.7]]);
  assert.equal(mergeVideos([], m.videos, 1).videos.length, 1);
});

test('readArchive and publishedVideos keep only well-formed video rows; podcast items come from the index, not the list', () => {
  assert.deepEqual(readArchive(null), []); assert.deepEqual(readArchive({ videos: [{ id: 'x' }, { id: 'acW4P7woNqA', part: 'evening', title: 'e', at: '2026-11-26T22:00:21Z' }] }).map(x => x.id), ['acW4P7woNqA']);
  const pub = publishedVideos([{ id: 'pod-2026-11-28-evening', kind: 'podcast', part: 'podcast', at: '2026-11-28T00:14:00Z' }, { id: 'TuIKKm8ZgRk', kind: 'video', part: 'evening', title: 'E', format: 'wide', seconds: 362.7, at: '2026-11-28T00:13:36Z', url: 'https://evil.example' }]);
  assert.deepEqual(pub, [{ id: 'TuIKKm8ZgRk', part: 'evening', title: 'E', format: 'wide', seconds: 362.7, at: '2026-11-28T00:13:36Z' }]);
});

test('podcastRows: the MP3 address sits under the private feed path; none without a feed', () => {
  const eps = [{ id: '2026-11-27-evening', part: 'evening', title: 'A', seconds: 362, at: '2026-11-28T00:14:00Z' }, { id: 'bad id', at: '2026-11-28T00:14:00Z' }];
  assert.deepEqual(podcastRows(eps, null), []);
  assert.deepEqual(podcastRows(eps, '/api/helix/podcast/KEY'), [{ id: '2026-11-27-evening', part: 'evening', title: 'A', seconds: 362, at: '2026-11-28T00:14:00Z', src: '/api/helix/podcast/KEY/2026-11-27-evening.mp3' }]);
});

test('byteRange: open, closed, suffix, clamped, unsatisfiable, and ignored forms', () => {
  assert.deepEqual(byteRange('bytes=0-', 100), { start: 0, end: 99 });
  assert.deepEqual(byteRange('bytes=10-19', 100), { start: 10, end: 19 });
  assert.deepEqual(byteRange('bytes=90-500', 100), { start: 90, end: 99 });
  assert.deepEqual(byteRange('bytes=-30', 100), { start: 70, end: 99 });
  assert.deepEqual(byteRange('bytes=-500', 100), { start: 0, end: 99 });
  assert.deepEqual(byteRange('bytes=100-', 100), { unsatisfiable: true });
  assert.deepEqual(byteRange('bytes=20-10', 100), { unsatisfiable: true });
  assert.deepEqual(byteRange('bytes=-0', 100), { unsatisfiable: true });
  for (const h of [undefined, '', 'bytes=-', 'bytes=0-1,5-9', 'items=0-5']) assert.equal(byteRange(h, 100), null, String(h));
});

// ── the routes, mounted for real ──
async function serve(envSecret) {
  process.env.HELIX_PODCAST_KEY = 'testkey_0123456789abcd';
  if (envSecret == null) delete process.env.KV_WRITE_SECRET; else process.env.KV_WRITE_SECRET = envSecret;
  const kvStore = new Map(), r2Store = new Map(), sent = [];
  kvStore.set('helix_published_v1', JSON.stringify({ items: [{ id: 'TuIKKm8ZgRk', kind: 'video', part: 'evening', title: 'E', format: 'wide', seconds: 362.7, at: '2026-11-28T00:13:36Z' }], day: {} }));
  const mp3 = Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 251));
  r2Store.set('helix/podcast/2026-11-27-evening.mp3', mp3);
  r2Store.set('helix/podcast/index.json', { episodes: [{ id: '2026-11-27-evening', part: 'evening', title: 'Ep', seconds: 362, bytes: 5000, at: '2026-11-28T00:14:00Z' }] });
  let owner = true;
  const deps = {
    express, kv: { get: async k => kvStore.get(k) ?? null, put: async (k, v) => kvStore.set(k, v) },
    ownerOnly: (req, res, next) => (owner ? next() : res.status(403).json({ ok: false })),
    tgSendAs: async (s, t) => { sent.push(t); return true; },
    r2: { configured: () => true, getJSON: async k => r2Store.get(k) ?? null, putJSON: async (k, v) => r2Store.set(k, v), getBuffer: async k => r2Store.get(k) ?? null, putBuffer: async (k, v) => r2Store.set(k, v) },
  };
  const app = express();
  await (await import('./helixBroadcast.js')).mount(app, deps);
  await (await import('./helixMedia.js')).mount(app, deps);
  const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { base, srv, r2Store, sent, setOwner: v => { owner = v; }, mp3 };
}

test('routes: media folds the published list into the archive; backfill adds rows without a note; the MP3 honours Range', async () => {
  const S = await serve(null);
  try {
    let j = await (await fetch(`${S.base}/api/helix/media`)).json();
    assert.equal(j.ok, true); assert.deepEqual(j.videos.map(v => v.id), ['TuIKKm8ZgRk']); assert.equal(j.podcasts[0].src, '/api/helix/podcast/testkey_0123456789abcd/2026-11-27-evening.mp3');
    assert.equal(j.podcastFeed, '/api/helix/podcast/testkey_0123456789abcd/feed.xml');
    assert.equal(S.r2Store.get(ARCHIVE_KEY).videos.length, 1, 'the archive was written');

    const body = { items: [row('Dp72bawELA4'), row('TuIKKm8ZgRk', 'evening', '2026-11-28T00:13:36Z'), row('nope')] };
    const post = h => fetch(`${S.base}/api/helix/broadcasts/backfill`, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(body) });
    S.setOwner(false);
    assert.equal((await post({})).status, 403, 'no secret on the server and no owner login: refused');
    S.setOwner(true);
    j = await (await post({})).json();
    assert.deepEqual([j.added, j.duplicates, j.rejected.length, j.total], [1, 1, 1, 2]);
    assert.deepEqual(S.sent, [], 'a backfill never sends Telegram');
    j = await (await fetch(`${S.base}/api/helix/media`)).json();
    assert.deepEqual(j.videos.map(v => v.id), ['TuIKKm8ZgRk', 'Dp72bawELA4']);

    const mp3 = `${S.base}/api/helix/podcast/testkey_0123456789abcd/2026-11-27-evening.mp3`;
    let r = await fetch(mp3, { headers: { range: 'bytes=100-199' } });
    assert.equal(r.status, 206); assert.equal(r.headers.get('content-range'), 'bytes 100-199/5000');
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), S.mp3.subarray(100, 200));
    r = await fetch(mp3, { headers: { range: 'bytes=9000-' } }); assert.equal(r.status, 416); assert.equal(r.headers.get('content-range'), 'bytes */5000');
    r = await fetch(mp3); assert.equal(r.status, 200); assert.equal(r.headers.get('accept-ranges'), 'bytes'); assert.equal((await r.arrayBuffer()).byteLength, 5000);
    assert.equal((await fetch(`${S.base}/api/helix/podcast/wrongkey_0123456789ab/2026-11-27-evening.mp3`)).status, 404);
  } finally { S.srv.close(); }
});

test('routes: with KV_WRITE_SECRET set the laptop pushes with X-Auth-Token; a wrong token falls back to the owner check', async () => {
  const S = await serve('s3cret-value');
  try {
    S.setOwner(false);
    const post = tok => fetch(`${S.base}/api/helix/broadcasts/backfill`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Auth-Token': tok }, body: JSON.stringify({ items: [row('Dp72bawELA4')] }) });
    assert.equal((await post('wrong')).status, 403);
    const j = await (await post('s3cret-value')).json(); assert.equal(j.added, 1);
  } finally { S.srv.close(); delete process.env.KV_WRITE_SECRET; }
});
