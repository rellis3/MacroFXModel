/**
 * OI over time, the route (Desk Terminal, preview). Read-only: stored option-OI captures (oi_history) + daily candles; writes nowhere, calls no model.
 *   GET /api/replay/oi-days?inst=NQ   one compact record per weekday with a capture (strike profile of the 8 biggest call and put strikes, max pain, gamma flip, GEX flips,
 *                                     put/call ratio, primary DTE) with that day's high/low/open/close. Days held and the first date are in the answer.
 * Cached 6 hours (the archive grows by one capture a day). Mounted by server.js beside the ghost walk (search "OI over time").
 *   mountOiTime(app, deps)  deps = { fetchRange(sym, gran, fromISO, toISO), kvGet(key), now() }
 */
import { INSTRUMENTS, londonDate } from './replayCore.js';
import { shapeBars } from './replayRoutes.js';
import { buildOiDays, coverage } from './oiTimeCore.js';

const DAY = 864e5, iso = ms => new Date(ms).toISOString().slice(0, 19) + 'Z';
export function mountOiTime(app, d) {
  const now = () => (d.now ? d.now() : Date.now()), cache = new Map(), inflight = new Map();
  const cached = async (key, ttl, build) => {
    const c = cache.get(key); if (c && now() - c.at < ttl) return c.v;
    if (inflight.has(key)) return inflight.get(key);
    const p = (async () => { try { const v = await build(); cache.set(key, { at: now(), v }); while (cache.size > 16) cache.delete(cache.keys().next().value); return v; } finally { inflight.delete(key); } })();
    inflight.set(key, p); return p;
  };
  app.get('/api/replay/oi-days', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const k = String(req.query.inst ?? '').toUpperCase(), I = INSTRUMENTS[k] ? { key: k, ...INSTRUMENTS[k] } : null;
      if (!I) return res.status(400).json({ ok: false, error: 'unknown market' });
      if (!I.oi) return res.status(400).json({ ok: false, error: `${I.label} has no option-OI capture` });
      const out = await cached(`oidays|${I.key}`, 6 * 3600e3, async () => {
        const raw = await d.kvGet('oi_history').catch(() => null), hist = raw ? JSON.parse(raw) : null, h = hist?.data ?? hist;
        const norm = s => String(s).toLowerCase().replace(/[/_]/g, ''), pk = h ? Object.keys(h).find(x => x === I.oi || norm(x) === norm(I.oi)) : null, per = pk ? h[pk] : null;
        if (!per) return { ok: true, inst: I.key, label: I.label, dp: I.dp, days: [], first: null, count: 0, error: 'no option-OI captures are held for this market yet' };
        const dates = Object.keys(per).sort(), first = dates[0], from = Date.parse(`${first}T00:00:00Z`) - 3 * DAY;
        const candles = shapeBars(await d.fetchRange(I.oanda, 'D', iso(from), iso(now())));
        const days = buildOiDays(per, candles, { tzDate: londonDate });
        return { ok: true, inst: I.key, label: I.label, dp: I.dp, days, first, last: dates.at(-1), captureDates: dates.length, coverage: coverage(days),
          note: 'Stored option-OI captures (CME, each describing the previous settlement) with the daily candles of the same London day. The archive keeps only the 8 biggest strikes per side and the primary expiry, not the whole ladder.' };
      });
      res.json(out);
    } catch (e) { if (!res.headersSent) res.status(502).json({ ok: false, error: e.message }); }
  });
}
