// js/jarvis/helixBroadcast.js: the server end of the H.E.L.I.X. broadcasts (the laptop records and uploads them; jarvis_broadcast/record_broadcast.py).
// Telegram goes from HERE, never from the laptop: after each upload the laptop tells this server, which sends the owner one note (sender helixBroadcast, ⚙ Alerts).
//
//   POST /api/helix/broadcast-published  { videoId, title, part, seconds?, format?, releaseKey? }  -> the "is up" note, once per video id; listed for Helix
//   POST /api/helix/broadcast-failed     { part, error }                                          -> a short failure note (at most FAIL_CAP a day)
//   GET  /api/helix/broadcasts           owner only: the last published videos and podcast episodes, and the podcast feed's address
//   GET  /api/helix/special-due          the rank-3 release (payrolls, CPI, a rate decision) printed 30-80 minutes ago that has no special yet, or none (read-only)
//   POST /api/helix/podcast/episode?id=&title=&part=&seconds=  (audio/mpeg body) -> R2 helix/podcast/<id>.mp3, the feed, and the note. The push secret when set.
//   GET  /api/helix/podcast/<feedKey>/feed.xml | /<id>.mp3     the private podcast feed (an obscure address, not listed anywhere)
//   GET  /api/helix/weekly-digest?week=YYYY-MM-DD[&format=text|json]  owner only: the WRITTEN weekly digest (a printable page; js/jarvis/helixDigestCore.js), read-only.
//        Its link goes in the Friday weekly recap's Telegram note.
//
// AUTH (the laptop has no login cookie): the platform's laptop-push convention, the X-Auth-Token header against KV_WRITE_SECRET, the same variable /api/kv/set and the
// footprint pushes use (read from the same env var on both sides). With KV_WRITE_SECRET set, every write here needs it. Without it, the two note routes stay usable but
// bounded (a valid YouTube id, the link built here, deduped, capped per day); the podcast upload is open but bounded too (an MP3 body, deduped, 6 episodes a day).
// Description only: the notes say a video is up or a run failed, nothing else.
import { createHash, timingSafeEqual } from 'node:crypto';
import { KV_KEY, readStore, addItem, addFailure, validatePublished, validateFailed, publishedText, failedText, specialsDue, validateEpisode, podcastRss } from './helixBroadcastCore.js';
import { weekDates, buildDigest, digestText, digestHtml } from './helixDigestCore.js';
import { byteRange } from './helixMediaCore.js';

const R2_PREFIX = 'helix/podcast/';
const origin = req => { const h = String(req.get('host') ?? ''); return `${/^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(h) ? 'http' : 'https'}://${h}`; };      // Railway terminates TLS in front of us
const londonDay = (deps, ms = Date.now()) => (deps.londonDate ? deps.londonDate(ms) : new Date(ms).toISOString().slice(0, 10));

/** An MP3 body: an ID3 tag or an MPEG audio frame sync at the start. */
export const isMp3 = b => !!b && b.length > 4 && ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0));
export const OPEN_PODCAST_DAY = 6;

/** The push secret check: true when the header matches KV_WRITE_SECRET, or when no secret is configured and `open` is allowed. */
export function pushOk(header, secret, open) {
  if (!secret) return !!open;
  const a = Buffer.from(String(header ?? '')), b = Buffer.from(String(secret));
  return a.length === b.length && timingSafeEqual(a, b);
}
/** The podcast feed's private path segment: HELIX_PODCAST_KEY, else derived from the push secret; null (feed off) with neither. */
export function feedKey(env = process.env) {
  const k = String(env.HELIX_PODCAST_KEY ?? '').trim(); if (/^[A-Za-z0-9_-]{16,80}$/.test(k)) return k;
  const s = String(env.KV_WRITE_SECRET ?? '').trim(); return s ? createHash('sha256').update(`helix-podcast|${s}`).digest('hex').slice(0, 32) : null;
}

export async function mount(app, deps) {
  const { express, kv } = deps;
  const secret = () => String(process.env.KV_WRITE_SECRET ?? '');
  let chain = Promise.resolve();                                // one KV read-modify-write at a time
  const update = fn => (chain = chain.then(async () => { const s = readStore(await kv.get(KV_KEY)); const r = await fn(s); if (r?.store) await kv.put(KV_KEY, JSON.stringify(r.store)); return r; }));
  const send = async text => { try { return !!(await deps.tgSendAs?.('helixBroadcast', text)); } catch (e) { console.warn('[helixBroadcast] telegram:', e.message); return false; } };

  app.post('/api/helix/broadcast-published', express.json({ limit: '8kb' }), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!pushOk(req.get('X-Auth-Token'), secret(), true)) return res.status(401).json({ ok: false, error: 'X-Auth-Token required' });
    const v = validatePublished(req.body); if (!v.ok) return res.status(400).json(v);
    try {
      const r = await update(s => addItem(s, v.item, londonDay(deps)));
      // the Friday weekly recap's note carries the written digest's link (owner-only page; the week is the recap's own London date)
      const digest = v.item.part === 'weekly' ? `${origin(req)}/api/helix/weekly-digest?week=${londonDay(deps)}` : null;
      const sent = !r.duplicate && !r.capped ? await send(publishedText(v.item) + (digest ? `\nWritten digest (prints to PDF): ${digest}` : '')) : false;
      res.json({ ok: true, duplicate: r.duplicate, capped: r.capped, sent, url: v.item.url, digest });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.post('/api/helix/broadcast-failed', express.json({ limit: '8kb' }), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!pushOk(req.get('X-Auth-Token'), secret(), true)) return res.status(401).json({ ok: false, error: 'X-Auth-Token required' });
    const v = validateFailed(req.body); if (!v.ok) return res.status(400).json(v);
    try {
      const r = await update(s => addFailure(s, londonDay(deps)));
      const sent = r.capped ? false : await send(failedText(v.part, v.error));
      res.json({ ok: true, capped: r.capped, sent });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.get('/api/helix/broadcasts', deps.ownerOnly, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const s = readStore(await kv.get(KV_KEY)), fk = feedKey();
      res.json({ ok: true, items: s.items.slice(0, Math.max(1, Math.min(60, +req.query.n || 20))), today: s.day, podcastFeed: fk ? `/api/helix/podcast/${fk}/feed.xml` : null });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.get('/api/helix/special-due', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const s = readStore(await kv.get(KV_KEY)), done = new Set(s.items.map(x => x.releaseKey).filter(Boolean));
      const ev = await deps.selfJson('/api/events'), events = Array.isArray(ev) ? ev : Array.isArray(ev?.events) ? ev.events : [];
      const now = Number.isFinite(+req.query.now) && +req.query.now > 0 ? +req.query.now : Date.now();     // ?now= replays a time (for testing the laptop's launcher); nothing is written
      const due = specialsDue(events, now, done);
      res.json({ ok: true, now: new Date(now).toISOString(), checked: events.length, due });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // ── the written WEEKLY DIGEST (owner only, read-only): the week's day records, the calendar and the published list; cached 10 min per week ──
  const digests = new Map();
  async function weekDigest(week) {
    const hit = digests.get(week[0]); if (hit && Date.now() - hit.at < 10 * 60_000) return hit.d;
    const r2ok = !!deps.r2?.configured?.();
    const recs = await Promise.all(week.map(async d => [d, r2ok ? await deps.r2.getJSON(`helix/days/${d}.json`).catch(() => null) : null]));
    let events = []; try { const ev = await deps.selfJson('/api/events'); events = Array.isArray(ev) ? ev : Array.isArray(ev?.events) ? ev.events : []; } catch (e) { events = []; }
    const items = readStore(await kv.get(KV_KEY).catch(() => null)).items;
    const d = buildDigest({ week, records: Object.fromEntries(recs), events, items, now: Date.now() });
    digests.set(week[0], { at: Date.now(), d }); if (digests.size > 12) digests.delete(digests.keys().next().value);
    return d;
  }
  app.get('/api/helix/weekly-digest', deps.ownerOnly, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const q = String(req.query.week ?? ''), day = /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : londonDay(deps), week = weekDates(day);
    if (!week.length) return res.status(400).json({ ok: false, error: 'week=YYYY-MM-DD' });
    try {
      const d = await weekDigest(week), fmt = String(req.query.format ?? 'html'), self = `/api/helix/weekly-digest?week=${week[0]}`;
      if (fmt === 'json') return res.json(d);
      if (fmt === 'text') return res.type('text/plain; charset=utf-8').send(digestText(d, `${origin(req)}${self}`));
      const shift = n => { const t = Date.parse(`${week[0]}T12:00:00Z`) + n * 7 * 864e5; return `/api/helix/weekly-digest?week=${new Date(t).toISOString().slice(0, 10)}`; };
      res.set('X-Robots-Tag', 'noindex').type('text/html; charset=utf-8').send(digestHtml(d, { textHref: `${self}&format=text`, prevHref: shift(-1), nextHref: week[0] < weekDates(londonDay(deps))[0] ? shift(1) : null, builtAt: Date.now() }));
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  // ── the podcast ──
  app.post('/api/helix/podcast/episode', express.raw({ type: ['audio/mpeg', 'application/octet-stream'], limit: '60mb' }), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    // OPT-IN like the rest of the platform (/api/kv/set, the footprint pushes): with KV_WRITE_SECRET set it is required; without it the upload is open but bounded
    // (a real MP3 body, a valid episode id, deduped, at most OPEN_PODCAST_DAY episodes a London day). 2026-11-28: failing closed meant no episode ever published.
    if (!pushOk(req.get('X-Auth-Token'), secret(), true)) return res.status(401).json({ ok: false, error: 'bad X-Auth-Token for KV_WRITE_SECRET' });
    if (!deps.r2?.configured?.()) return res.status(503).json({ ok: false, error: 'R2 is not configured on the server' });
    const buf = Buffer.isBuffer(req.body) ? req.body : null;
    if (!secret() && !isMp3(buf)) return res.status(415).json({ ok: false, error: 'the body is not an MP3' });
    const v = validateEpisode(req.query, buf?.length ?? 0); if (!v.ok) return res.status(400).json(v);
    if (!secret()) {
      const idx0 = (await deps.r2.getJSON(`${R2_PREFIX}index.json`).catch(() => null)) ?? { episodes: [] }, today = londonDay(deps);
      if ((idx0.episodes ?? []).filter(e => londonDay(deps, Date.parse(e.at)) === today).length >= OPEN_PODCAST_DAY) return res.status(429).json({ ok: false, error: `at most ${OPEN_PODCAST_DAY} podcast episodes a day without KV_WRITE_SECRET` });
    }
    try {
      const fk = feedKey(), base = `${origin(req)}/api/helix/podcast/${fk}`;
      const ep = { ...v.ep, kind: 'podcast', at: new Date().toISOString() };
      const r = await update(async s => {
        if (s.items.some(x => x.id === `pod-${ep.id}`)) return { store: null, duplicate: true };
        await deps.r2.putBuffer(`${R2_PREFIX}${ep.id}.mp3`, buf, 'audio/mpeg');
        const idx = (await deps.r2.getJSON(`${R2_PREFIX}index.json`).catch(() => null)) ?? { episodes: [] };
        idx.episodes = [ep, ...(idx.episodes ?? []).filter(e => e.id !== ep.id)].slice(0, 120);
        await deps.r2.putJSON(`${R2_PREFIX}index.json`, idx);
        const item = { id: `pod-${ep.id}`, kind: 'podcast', part: 'podcast', title: ep.title, url: `${base}/${ep.id}.mp3`, seconds: ep.seconds, at: ep.at };
        return { ...addItem(s, item, londonDay(deps)), item };
      });
      if (r.duplicate) return res.json({ ok: true, duplicate: true });
      const sent = r.capped ? false : await send(publishedText({ ...r.item, url: `${base}/feed.xml` }));
      res.status(201).json({ ok: true, sent, feed: `${base}/feed.xml` });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  const feedGate = (req, res, next) => { const fk = feedKey(); if (!fk || req.params.key !== fk || !deps.r2?.configured?.()) return res.status(404).end(); next(); };
  app.get('/api/helix/podcast/:key/feed.xml', feedGate, async (req, res) => {
    try {
      const idx = (await deps.r2.getJSON(`${R2_PREFIX}index.json`).catch(() => null)) ?? { episodes: [] };
      res.set({ 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'private, max-age=300', 'X-Robots-Tag': 'noindex' });
      res.send(podcastRss(idx.episodes, `${origin(req)}/api/helix/podcast/${req.params.key}`));
    } catch (e) { res.status(500).end(); }
  });
  app.get('/api/helix/podcast/:key/:file', feedGate, async (req, res) => {
    const m = /^([A-Za-z0-9][A-Za-z0-9_-]{5,63})\.mp3$/.exec(req.params.file); if (!m) return res.status(404).end();
    try {
      const buf = await deps.r2.getBuffer(`${R2_PREFIX}${m[1]}.mp3`); if (!buf) return res.status(404).end();
      res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=86400', 'Accept-Ranges': 'bytes', 'X-Robots-Tag': 'noindex' });
      const rg = byteRange(req.get('range'), buf.length);           // a player's scrubber sends Range (the rule and its tests: js/jarvis/helixMediaCore.js)
      if (rg?.unsatisfiable) return res.status(416).set('Content-Range', `bytes */${buf.length}`).end();
      if (rg) return res.status(206).set('Content-Range', `bytes ${rg.start}-${rg.end}/${buf.length}`).send(buf.subarray(rg.start, rg.end + 1));
      res.send(buf);
    } catch (e) { res.status(500).end(); }
  });
}
