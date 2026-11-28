// js/jarvis/helixMedia.js: the server end of the MEDIA section (the desk terminal's Media tab and Helix's MEDIA panel, js/terminal/mediaView.js). Owner only.
//
//   GET  /api/helix/media               owner only: every H.E.L.I.X. video (the R2 archive helix/media/videos.json with the KV published list folded in) and the
//                                       podcast episodes (R2 helix/podcast/index.json) with their MP3 addresses, and the feed's address. Folding writes the archive
//                                       only when the published list holds a video it has not seen.
//   POST /api/helix/broadcasts/backfill { items: [{ videoId, title, part, at, seconds? }] } -> the uploads from before the published list existed go into the archive.
//                                       Auth: the laptop-push convention (X-Auth-Token = KV_WRITE_SECRET, fails closed when the secret is unset) or the owner's login.
//                                       It NEVER sends a Telegram note and never touches the published list (whose dedupe and day caps belong to the notes).
// Description only: titles, parts, lengths and dates. Unlisted videos stay unlisted: the ids are only served to the owner.
import { readStore, KV_KEY } from './helixBroadcastCore.js';
import { pushOk, feedKey } from './helixBroadcast.js';
import { ARCHIVE_KEY, readArchive, publishedVideos, mergeVideos, validateBackfill, podcastRows } from './helixMediaCore.js';

export async function mount(app, deps) {
  const { express, kv } = deps;
  const r2 = deps.r2;
  let chain = Promise.resolve();                                   // one archive read-modify-write at a time
  const withArchive = fn => (chain = chain.then(async () => {
    const raw = await r2.getJSON(ARCHIVE_KEY).catch(() => null);
    const r = await fn(readArchive(raw));
    if (r?.write) await r2.putJSON(ARCHIVE_KEY, { v: 1, updatedAt: new Date().toISOString(), videos: r.videos });
    return r;
  }));
  const r2On = () => !!r2?.configured?.();

  app.get('/api/helix/media', deps.ownerOnly, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const pub = publishedVideos(readStore(await kv.get(KV_KEY)).items);
      const fk = feedKey(), feedBase = fk ? `/api/helix/podcast/${fk}` : null;
      if (!r2On()) return res.json({ ok: true, videos: mergeVideos([], pub).videos, podcasts: [], podcastFeed: feedBase && `${feedBase}/feed.xml`, archive: false });
      const r = await withArchive(a => { const m = mergeVideos(a, pub); return { ...m, write: m.added > 0 }; });
      const idx = await r2.getJSON('helix/podcast/index.json').catch(() => null);
      res.json({ ok: true, videos: r.videos, podcasts: podcastRows(idx?.episodes, feedBase), podcastFeed: feedBase && `${feedBase}/feed.xml`, archive: true });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  const pushOrOwner = (req, res, next) => (pushOk(req.get('X-Auth-Token'), String(process.env.KV_WRITE_SECRET ?? ''), false) ? next() : deps.ownerOnly(req, res, next));
  app.post('/api/helix/broadcasts/backfill', express.json({ limit: '128kb' }), pushOrOwner, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!r2On()) return res.status(503).json({ ok: false, error: 'R2 is not configured on the server' });
    const v = validateBackfill(req.body); if (!v.ok) return res.status(400).json(v);
    try {
      const r = await withArchive(a => { const m = mergeVideos(a, v.items); return { ...m, write: m.added > 0 }; });
      res.json({ ok: true, added: r.added, duplicates: r.duplicates, rejected: v.rejected, total: r.videos.length });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
}
