/**
 * The Path replay's one route (Desk Terminal, preview). Read-only: it reads the nightly per-expiry walk records (R2 swing_walk/<INST>/<capture>.json, written one per
 * capture date since 2026-11-03 by the Swing Map: for every anchor, one level per expiry with its days-to-expiry) and 15-minute bars; writes nothing, calls no model.
 *   GET /api/replay/path-days?inst=GOLD   { records: [{ captureDate, closeDate, close, vol, walks: { anchor: [[expiry, dte, px, pullShare]] } }], bars: [[t, o, h, l, c]], first, count }
 * The records ARE the per-expiry history: nothing else keeps the level of each expiry as it stood each night. Cached 30 minutes. Mounted by server.js beside the OI over time route.
 *   mountPathReplay(app, deps)  deps = { fetchRange(sym, gran, fromISO, toISO), walkHistory(inst, n), now() }
 */
import { INSTRUMENTS } from './replayCore.js';
import { shapeBars } from './replayRoutes.js';
import { PATH_MARKETS } from './pathReplayCore.js';

const DAY = 864e5, iso = ms => new Date(ms).toISOString().slice(0, 19) + 'Z';
export function mountPathReplay(app, d) {
  const now = () => (d.now ? d.now() : Date.now()), cache = new Map();
  app.get('/api/replay/path-days', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const k = String(req.query.inst ?? '').toUpperCase();
      if (!PATH_MARKETS.includes(k) || !INSTRUMENTS[k]) return res.status(400).json({ ok: false, error: `the path replay covers ${PATH_MARKETS.join(', ')}` });
      const c = cache.get(k); if (c && now() - c.at < 30 * 60e3) return res.json(c.v);
      const raw = await d.walkHistory(k, 400), byClose = new Map();
      for (const r of raw ?? []) if (r?.walks && r.closeDate) { const o = byClose.get(r.closeDate); if (!o || String(r.captureDate) > String(o.captureDate)) byClose.set(r.closeDate, r); }   // one per session: a weekend re-save of Friday's book is the same book
      const records = [...byClose.values()].sort((a, b) => String(a.captureDate).localeCompare(String(b.captureDate))).map(r => ({ captureDate: r.captureDate, closeDate: r.closeDate, close: r.close, vol: r.vol, walks: r.walks }));
      let bars = [];
      if (records.length) bars = shapeBars(await d.fetchRange(INSTRUMENTS[k].oanda, 'M15', iso(Date.parse(`${records[0].closeDate}T00:00:00Z`) - DAY), iso(now()))).map(b => [b[0], +b[1].toFixed(5), +b[2].toFixed(5), +b[3].toFixed(5), +b[4].toFixed(5)]);
      const v = { ok: true, inst: k, label: INSTRUMENTS[k].label, dp: INSTRUMENTS[k].dp, records, bars, first: records[0]?.captureDate ?? null, count: records.length, error: records.length ? null : 'no nightly path records are held for this market yet',
        note: 'One record per capture session from the Swing Map\'s nightly record (R2 swing_walk): for each anchor, the level of every expiry as that night\'s capture stood. It deepens by one night every day.' };
      cache.set(k, { at: now(), v }); res.json(v);
    } catch (e) { if (!res.headersSent) res.status(502).json({ ok: false, error: e.message }); }
  });
}
