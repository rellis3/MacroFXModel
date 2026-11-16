/**
 * The ghost walk's one route (Desk Terminal, preview). Read-only: it reads 15-minute bars, the stored OI captures and the archived forecasts, writes nowhere and
 * calls no model.
 *
 *   GET /api/replay/ghosts?inst=NQ&date=2026-11-12&n=90
 *       one market, the days from the FIRST OI capture to `date`: each day's path in price (15-minute steps from the London midnight clock), its forecast unit, the
 *       OI levels in force with their touch results against the mirrored placebo, and, for `date` itself, its bars. The chart only goes back as far as the OI capture
 *       (firstOi, oiDays in the answer); days without a forecast made by the open (or within the first hour of the London day) or without enough bars are dropped and counted, never filled.
 *
 * Past days never change, so a past `date` is cached for hours; today for 90 seconds. Mounted by server.js beside the Replay routes (search "ghost walk").
 *   mountGhostWalk(app, deps)   deps = { fetchRange(sym, gran, fromISO, toISO), kvGet(key), now() }  (the same deps as js/replayRoutes.js)
 */
import { INSTRUMENTS, validDate, londonDate, sessionWindow } from './replayCore.js';
import { shapeBars, oiEntries, forecastOf } from './replayRoutes.js';
import { buildGhostPayload, MAX_DAYS } from './ghostWalkCore.js';

const HOUR = 3600e3, DAY = 24 * HOUR;
const iso = ms => new Date(ms).toISOString().slice(0, 19) + 'Z';

export function mountGhostWalk(app, d) {
  const now = () => (d.now ? d.now() : Date.now());
  const cache = new Map(), inflight = new Map();
  const cached = async (key, ttlMs, build) => {
    const c = cache.get(key);
    if (c && now() - c.at < ttlMs) return c.v;
    if (inflight.has(key)) return inflight.get(key);
    const p = (async () => { try { const v = await build(); cache.set(key, { at: now(), v }); while (cache.size > 24) cache.delete(cache.keys().next().value); return v; } finally { inflight.delete(key); } })();
    inflight.set(key, p); return p;
  };
  const bad = (status, message) => Object.assign(new Error(message), { status });
  const parse = r => { try { return r ? JSON.parse(r) : null; } catch { return null; } };

  app.get('/api/replay/ghosts', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const k = String(req.query.inst ?? '').toUpperCase(), I = INSTRUMENTS[k] ? { key: k, ...INSTRUMENTS[k] } : null;
      if (!I) throw bad(400, 'unknown market');
      if (!I.oi) throw bad(400, `${I.label} has no option-OI capture, so there is no ghost walk for it`);
      const today = londonDate(now()), date = req.query.date ? String(req.query.date) : today;
      if (!validDate(date) || date < '2015-01-01' || date > today) throw bad(400, 'date must be a London date, YYYY-MM-DD, from 2015 up to today');
      const n = Math.min(MAX_DAYS, Math.max(10, Math.round(+req.query.n || 90)));
      const out = await cached(`ghost|${I.key}|${date}|${n}`, date < today ? 6 * HOUR : 90e3, async () => {
        const raw = await d.kvGet('oi_history').catch(() => null), hist = parse(raw), h = hist?.data ?? hist;
        const { entries, first } = oiEntries(h, I.oi, 0, now() + DAY);
        if (!entries.length || !first) return { ok: true, inst: I.key, label: I.label, dp: I.dp, date, days: [], dropped: {}, firstOi: null, oiDays: 0, focusFound: false, error: 'no option-OI captures are held for this market yet' };
        // only from the first capture's day: the walk cannot go back further than the OI we hold
        const startDate = first < date ? first : date, spanStart = sessionWindow(startDate).start, end = Math.min(sessionWindow(date).end, now());
        const bars = shapeBars(await d.fetchRange(I.oanda, 'M15', iso(spanStart), iso(end)));
        const dates = [...new Set(bars.map(b => londonDate(b[0])))].filter(x => x >= first && x <= date).sort().slice(-n);
        const forecasts = {};
        for (let i = 0; i < dates.length; i += 12) {
          await Promise.all(dates.slice(i, i + 12).map(async dt => { const f = forecastOf(parse(await d.kvGet(`vol_forecast_${dt}`).catch(() => null)), I.key); if (f) forecasts[dt] = f; }));
        }
        const p = buildGhostPayload({ bars, entries, forecasts, focus: date, today, n });
        return { ok: true, inst: I.key, label: I.label, dp: I.dp, date, unitNote: 'one unit is the day\'s archived forecast median high-low range, as a percent of the open', ...p,
          note: 'Fifteen-minute OANDA mid prices. Option levels count from the time their capture was saved; the unit is used only when the forecast was computed by the open or within the first hour of the London day. Saturdays and Sundays are skipped.' };
      });
      res.json(out);
    } catch (e) { if (!res.headersSent) res.status(e.status ?? 502).json({ ok: false, error: e.message }); }
  });
}
