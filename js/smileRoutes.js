/**
 * IV smile replay, the route (Desk Terminal, preview). Read-only: it reads the option chains the server already keeps in R2 and writes nowhere, calls no model.
 *   GET /api/replay/smile?sym=SPX                       the days held: end-of-day chains (cboe_raw/, 18 symbols from 2026-10-16) and the days with 15-minute chains (cboe_intraday/, SPX NDX SPY QQQ)
 *   GET /api/replay/smile?sym=SPX&date=2026-11-12       that day's end-of-day chain reduced to the smile of its nearest expiries (one frame)
 *   GET /api/replay/smile?sym=SPX&date=...&mode=intraday  every 15-minute snapshot of that day reduced the same way (one frame each)
 * A past day never changes, so it is cached for 12 hours (today for 2 minutes); one end-of-day chain is about 4 MB decoded for SPX and is reduced to a few KB. Mounted by server.js beside
 * the other replay routes (search "IV smile replay"). The reduction is js/smileCore.js.
 *   mountSmile(app, deps)  deps = { r2Ok(), r2List(prefix), r2Get(key), rawPrefix, rawRe, intraPrefix, intraRe, now() }
 */
import zlib from 'node:zlib';
import { reduceChain, rawSpot } from './smileCore.js';

const HOUR = 3600e3;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const unpack = b64 => JSON.parse(zlib.gunzipSync(Buffer.from(b64, 'base64')).toString());

export function mountSmile(app, d) {
  const now = () => (d.now ? d.now() : Date.now()), cache = new Map(), inflight = new Map();
  const cached = async (key, ttl, build) => {
    const c = cache.get(key); if (c && now() - c.at < ttl) return c.v;
    if (inflight.has(key)) return inflight.get(key);
    const p = (async () => { try { const v = await build(); cache.set(key, { at: now(), v }); while (cache.size > 60) cache.delete(cache.keys().next().value); return v; } finally { inflight.delete(key); } })();
    inflight.set(key, p); return p;
  };
  const today = () => new Date(now()).toISOString().slice(0, 10);
  async function held(sym) {
    return cached(`held|${sym}`, 10 * 60e3, async () => {
      const days = [], intra = new Map();
      for (const k of await d.r2List(d.rawPrefix)) { const m = d.rawRe.exec(k); if (m && m[1] === sym) days.push(m[2]); }
      for (const k of await d.r2List(d.intraPrefix)) { const m = d.intraRe.exec(k); if (m && m[1] === sym) intra.set(m[2], (intra.get(m[2]) ?? 0) + 1); }
      return { days: days.sort(), intraday: [...intra.entries()].filter(([, n]) => n >= 3).map(([x]) => x).sort() };
    });
  }
  app.get('/api/replay/smile', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      if (!d.r2Ok()) return res.status(503).json({ ok: false, error: 'the option-chain archive (R2) is not configured on this server' });
      const sym = String(req.query.sym ?? '').toUpperCase().replace(/^_/, ''), date = String(req.query.date ?? ''), mode = req.query.mode === 'intraday' ? 'intraday' : 'eod';
      if (!/^[A-Z]{2,4}$/.test(sym)) return res.status(400).json({ ok: false, error: 'say which symbol, for example sym=SPX' });
      const h = await held(sym);
      if (!date) return res.json({ ok: true, sym, ...h });
      if (!dateRe.test(date)) return res.status(400).json({ ok: false, error: 'the date must be YYYY-MM-DD' });
      const ttl = date === today() ? 2 * 60e3 : 12 * HOUR;
      const out = await cached(`day|${sym}|${date}|${mode}`, ttl, async () => {
        if (mode === 'eod') {
          if (!h.days.includes(date)) return { notFound: `no end-of-day chain is held for ${sym} on ${date}` };
          const rec = await d.r2Get(`${d.rawPrefix}${sym}/${date}.json`); if (!rec?.rows) return { notFound: `the ${sym} chain for ${date} could not be read` };
          const r = reduceChain(unpack(rec.rows), rec.fields, rawSpot(rec), date);
          return { frames: [{ t: rec.cboeTimestamp ?? date, spot: r.spot, curves: r.curves }] };
        }
        const keys = (await d.r2List(`${d.intraPrefix}${sym}/${date}/`)).filter(k => d.intraRe.test(k)).sort();
        if (!keys.length) return { notFound: `no 15-minute chains are held for ${sym} on ${date}` };
        const frames = [];
        for (let i = 0; i < keys.length; i += 5) {
          const recs = await Promise.all(keys.slice(i, i + 5).map(k => d.r2Get(k).catch(() => null)));
          for (const rec of recs) if (rec?.rows) { const r = reduceChain(unpack(rec.rows), rec.fields ?? ['option', 'bid', 'ask', 'volume', 'open_interest', 'iv', 'gamma', 'last_px', 'last_ms'], rec.spot, date); frames.push({ t: rec.t, spot: r.spot, curves: r.curves }); }
        }
        frames.sort((a, b) => (a.t < b.t ? -1 : 1));
        return { frames };
      });
      if (out.notFound) return res.status(404).json({ ok: false, error: out.notFound });
      res.json({ ok: true, sym, date, mode, ...out });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
}
