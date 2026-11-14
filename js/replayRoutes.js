/**
 * The Desk Terminal REPLAY's routes (stage 1). Read-only: they fetch candles and read stores that already exist, and write nowhere.
 *
 *   GET /api/replay/day?inst=NQ&date=2026-11-12        one London session as one-minute bars (from 4 h before the open), the OI captures that were
 *                                                      in force (each with the time it was SAVED), the session's forecast percents, and the morning book
 *   GET /api/replay/strength?date=2026-11-12           currency strength (σ) every 15 minutes of that session, rebuilt from the bars of all 28 pairs
 *   GET /api/replay/meta?inst=NQ                       what each layer can replay and from when (the coverage panel)
 *   GET /api/replay/notable?inst=NQ                    days worth jumping to: biggest ranges, days that tested the most option levels, recent releases
 *
 * Past sessions never change, so a past day is cached for hours (a day is one OANDA call for the minutes; the strength series is about 84 range calls the first
 * time and none after). Today is cached for a minute. No model call, no paid feed. Mounted by server.js (search "Desk Terminal replay").
 *
 *   mountReplay(app, deps)   deps = { fetchRange(sym, gran, fromISO, toISO), earliest(sym, gran), kvGet(key), selfJson(path), now() }
 */
import { INSTRUMENTS, validDate, londonDate, sessionWindow, oiLines } from './replayCore.js';
import { buildStrengthSeries } from './replayStrength.js';
import { PAIRS } from './ccyStrengthCore.js';

const HOUR = 3600e3, DAY = 24 * HOUR;
const iso = ms => new Date(ms).toISOString().slice(0, 19) + 'Z';
const num = v => (v == null || v === '' ? null : Number.isFinite(+v) ? +v : null);

/** OANDA candle values ({ t seconds, open..close strings }) -> compact rows [t ms, o, h, l, c], ascending, no duplicates. */
export function shapeBars(values) {
  const out = [];
  for (const v of values ?? []) {
    const t = num(v.t) != null ? v.t * 1000 : num(v._ms), o = num(v.open), h = num(v.high), l = num(v.low), c = num(v.close);
    if (t == null || o == null || h == null || l == null || c == null) continue;
    out.push([t, o, h, l, c]);
  }
  out.sort((a, b) => a[0] - b[0]);
  return out.filter((r, i) => !i || r[0] !== out[i - 1][0]);
}

/** The per-day OI entries of one instrument, trimmed to what the chart needs, whose capture was saved from `fromMs` to `toMs`. */
export function oiEntries(hist, key, fromMs, toMs) {
  if (!key || !hist) return { entries: [], first: null, last: null, days: 0 };
  const norm = s => String(s).toLowerCase().replace(/[/_]/g, '');
  const pk = Object.keys(hist).find(k => k === key || norm(k) === norm(key));
  const per = pk ? hist[pk] : null;
  if (!per) return { entries: [], first: null, last: null, days: 0 };
  const dates = Object.keys(per).sort();
  const trim = w => (Array.isArray(w) ? w.slice(0, 8).map(x => ({ strike: num(x.strike), oi: num(x.oi), tier: x.tier ?? null })) : []);
  const entries = dates.map(d => ({ date: d, ...per[d] })).filter(e => Number.isFinite(e.savedAtMs) && e.savedAtMs >= fromMs && e.savedAtMs <= toMs)
    .map(e => ({ date: e.date, asOf: e.asOf ?? null, savedAtMs: e.savedAtMs, spot: num(e.spot), maxPain: num(e.maxPain), gammaFlip: num(e.gammaFlip), regime: e.regime ?? null,
      callWalls: trim(e.callWalls), putWalls: trim(e.putWalls), gexFlips: Array.isArray(e.gexFlips) ? e.gexFlips.slice(0, 2).map(f => ({ price: num(f.price), dir: f.dir ?? null })) : [] }));
  return { entries, first: dates[0] ?? null, last: dates[dates.length - 1] ?? null, days: dates.length };
}

/** The archived forecast for a session and one market: { hl_median, hl_75, oc_median, oc_75, vol_annual, knownFrom (ms or null), computedAt } or null. */
export function forecastOf(doc, instKey) {
  const ins = doc?.instruments ?? {};
  const k = Object.keys(ins).find(x => x.toLowerCase() === String(instKey).toLowerCase());
  const f = k ? ins[k] : null;
  if (!f) return null;
  const at = Date.parse(doc.computed_at ?? '');
  return { hl_median: num(f.hl_median), hl_75: num(f.hl_75), oc_median: num(f.oc_median), oc_75: num(f.oc_75), vol_annual: num(f.vol_annual), computedAt: doc.computed_at ?? null, knownFrom: Number.isFinite(at) ? at : null };
}

/**
 * Days worth jumping to. bars = daily rows [t ms (London midnight), o, h, l, c]; entries = every OI capture (savedAtMs, date, walls...).
 * ranges: the biggest high-low as a share of the open. tests: days on which the most option levels (strong walls, max pain, flips) sat inside the day's high-low.
 */
export function notableDays(bars, entries, { top = 6 } = {}) {
  const byDate = new Map();
  for (const b of bars ?? []) byDate.set(londonDate(b[0]), { date: londonDate(b[0]), o: b[1], h: b[2], l: b[3], c: b[4] });
  const days = [...byDate.values()];
  const ranges = days.filter(d => d.o > 0).map(d => ({ date: d.date, rangePct: +((d.h - d.l) / d.o * 100).toFixed(2), movePct: +((d.c - d.o) / d.o * 100).toFixed(2) })).sort((a, b) => b.rangePct - a.rangePct).slice(0, top);
  const tests = [];
  for (const e of entries ?? []) {
    const d = byDate.get(e.date); if (!d) continue;
    const lines = oiLines(e).filter(l => l.type !== 'call' && l.type !== 'put' ? true : l.tier === 'strong');
    const inside = lines.filter(l => l.price >= d.l && l.price <= d.h);
    if (inside.length) tests.push({ date: e.date, levels: inside.length, of: lines.length, rangePct: +((d.h - d.l) / d.o * 100).toFixed(2) });
  }
  tests.sort((a, b) => b.levels - a.levels || b.rangePct - a.rangePct);
  return { ranges, tests: tests.slice(0, top) };
}

export function mountReplay(app, d) {
  const now = () => (d.now ? d.now() : Date.now());
  const cache = new Map(), inflight = new Map();
  const cached = async (key, ttlMs, build) => {
    const c = cache.get(key);
    if (c && now() - c.at < ttlMs) return c.v;
    if (inflight.has(key)) return inflight.get(key);
    const p = (async () => {
      try { const v = await build(); cache.set(key, { at: now(), v }); while (cache.size > 40) cache.delete(cache.keys().next().value); return v; }
      finally { inflight.delete(key); }
    })();
    inflight.set(key, p);
    return p;
  };
  const instOf = q => { const k = String(q.inst ?? '').toUpperCase(); return INSTRUMENTS[k] ? { key: k, ...INSTRUMENTS[k] } : null; };
  const dateOf = q => (validDate(q.date) && q.date >= '2015-01-01' && q.date <= londonDate(now()) ? String(q.date) : null);
  const oiHist = async () => { const raw = await d.kvGet('oi_history').catch(() => null); if (!raw) return null; const j = JSON.parse(raw); return j.data ?? j; };
  const ttlFor = date => (date < londonDate(now()) ? 6 * HOUR : 60e3);
  const wrap = fn => async (req, res) => { try { res.set('Cache-Control', 'no-store'); res.json(await fn(req, res)); } catch (e) { if (!res.headersSent) res.status(e.status ?? 502).json({ ok: false, error: e.message }); } };
  const bad = (status, message) => Object.assign(new Error(message), { status });

  app.get('/api/replay/day', wrap(async req => {
    const I = instOf(req.query), date = dateOf(req.query);
    if (!I) throw bad(400, 'unknown market');
    if (!date) throw bad(400, 'date must be a London date, YYYY-MM-DD, from 2015 up to today');
    return cached(`day|${I.key}|${date}`, ttlFor(date), async () => {
      const win = sessionWindow(date), to = Math.min(win.end, now());
      let oiError = null;
      const [values, hist, fcDoc, dawn] = await Promise.all([
        d.fetchRange(I.oanda, 'M1', iso(win.start - 4 * HOUR), iso(to)),
        I.oi ? oiHist().catch(e => { oiError = e.message; return null; }) : null,
        d.kvGet(`vol_forecast_${date}`).then(r => (r ? JSON.parse(r) : null)).catch(() => null),
        d.selfJson(`/api/desk-run?date=${date}&summary=1`).catch(() => null),
      ]);
      const oi = oiEntries(hist, I.oi, win.start - 7 * DAY, win.end);
      // only the lean (long / short / flat) and the tone, never the headline or any size: the headline can carry a trade sentence
      const dawnOut = dawn?.ok && dawn.head ? { date, finishedAt: dawn.finishedAt ?? null, finishedMs: Date.parse(dawn.finishedAt ?? '') || null, tone: dawn.head.tone ?? null, rating: dawn.head.ratings?.[I.key] ?? null } : null;
      return { ok: true, inst: I.key, label: I.label, dp: I.dp, date, win, bars: shapeBars(values), oi: { pair: I.oi, ...oi, error: oiError || (I.oi && !hist ? 'the option store could not be read' : null) }, forecast: forecastOf(fcDoc, I.key), dawn: dawnOut,
        note: 'Bars are one-minute OANDA mid prices. Option levels are shown from the time their capture was saved. The forecast lines are shown from the session open (or from when the forecast was computed, if later).' };
    });
  }));

  app.get('/api/replay/strength', wrap(async req => {
    const date = dateOf(req.query);
    if (!date) throw bad(400, 'date must be a London date, YYYY-MM-DD, from 2015 up to today');
    return cached(`strength|${date}`, ttlFor(date), async () => {
      const win = sessionWindow(date), to = Math.min(win.end, now());
      const bars = {};
      const toBar = v => ({ t: v.t * 1000, c: +v.close });
      for (let i = 0; i < PAIRS.length; i += 7) {
        await Promise.all(PAIRS.slice(i, i + 7).map(async p => {
          const [m5, h1, dd] = await Promise.all([
            d.fetchRange(p, 'M5', iso(win.start - 6 * HOUR), iso(to)), d.fetchRange(p, 'H1', iso(win.start - 36 * DAY), iso(to)), d.fetchRange(p, 'D', iso(win.start - 140 * DAY), iso(to))]);
          bars[p] = { m5: m5.map(toBar), h1: h1.map(toBar), d: dd.map(toBar) };
        }));
      }
      return { ok: true, date, ...buildStrengthSeries({ bars, startMs: win.start, endMs: to }),
        note: 'Rebuilt every 15 minutes from the one-hour, five-minute and daily bars of the 28 pairs, each step using only bars that had finished by then.' };
    });
  }));

  app.get('/api/replay/meta', wrap(async req => {
    const I = instOf(req.query);
    if (!I) throw bad(400, 'unknown market');
    return cached(`meta|${I.key}`, 10 * 60e3, async () => {
      const [earliest, hist, fcIdx, deskIdx, snapIdx] = await Promise.all([
        d.earliest ? d.earliest(I.oanda, 'M1').catch(() => null) : null, I.oi ? oiHist().catch(() => null) : null,
        d.kvGet('vol_forecast_index').then(r => (r ? JSON.parse(r) : [])).catch(() => []),
        d.selfJson('/api/desk-run/index').catch(() => null), d.selfJson('/api/desk-snapshots/index').catch(() => null)]);
      const oi = oiEntries(hist, I.oi, 0, now() + DAY);
      const fcDates = (Array.isArray(fcIdx) ? fcIdx : []).map(e => e.date).filter(Boolean).sort();
      const deskDays = (deskIdx?.days ?? []).map(x => x.date).filter(Boolean).sort(), snapDays = (snapIdx?.coreDays ?? []).slice().sort();
      return { ok: true, instrument: { key: I.key, label: I.label, oi: I.oi, dp: I.dp },
        coverage: { candles: { from: earliest ? String(earliest).slice(0, 10) : null }, oi: { from: oi.first, to: oi.last, days: oi.days },
          forecast: { from: fcDates[0] ?? null, to: fcDates[fcDates.length - 1] ?? null }, desk: { from: deskDays[0] ?? null, to: deskDays[deskDays.length - 1] ?? null, days: deskDays },
          snapshots: { from: snapDays[0] ?? null, to: snapDays[snapDays.length - 1] ?? null, days: snapDays } } };
    });
  }));

  app.get('/api/replay/notable', wrap(async req => {
    const I = instOf(req.query);
    if (!I) throw bad(400, 'unknown market');
    return cached(`notable|${I.key}`, 3 * HOUR, async () => {
      const to = now(), [dv, hist, rel] = await Promise.all([
        d.fetchRange(I.oanda, 'D', iso(to - 200 * DAY), iso(to)), I.oi ? oiHist().catch(() => null) : null, d.selfJson('/api/release-reactions').catch(() => null)]);
      const { entries } = oiEntries(hist, I.oi, 0, to + DAY);
      const n = notableDays(shapeBars(dv), entries);
      const releases = [...(rel?.live ?? []), ...(rel?.recent ?? [])].filter(r => Number.isFinite(r?.ms) && r.ms < to).sort((a, b) => b.ms - a.ms)
        .filter((r, i, a) => a.findIndex(x => x.ms === r.ms && x.event === r.event) === i).slice(0, 8).map(r => ({ ms: r.ms, country: r.country ?? null, event: r.event ?? null }));
      return { ok: true, inst: I.key, ...n, releases };
    });
  }));
}
