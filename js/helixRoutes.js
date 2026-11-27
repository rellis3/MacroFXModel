// js/helixRoutes.js: Helix's data routes (plans/HELIX_IMPROVEMENTS.md wave 3; the maths is in js/helixData.js and js/helixBundle.js, both pure and tested).
//   GET  /api/g10-rates          each G10 currency's short and long yield, the gap to the US, 20-session change and its z (R2 archive/series), cached 1 h
//   GET  /api/funding-board      SOFR p99 - IORB, SOFR - TGCR, RRP, reserves, TGA, MMF repo with the Fed, last 2y/10y/30y auctions, calendar note (R2), cached 1 h
//   GET  /api/vol-terrain        the VOL view's daily range per market in one reply (replaces ~25 /api/ohlc-range calls), cached 10 min
//   GET  /api/helix/roll-health  rates-legs/_health.json (written by the IBKR roll job; absent = not yet), cached 10 min
//   GET  /api/helix/stress       intraday MOVE and DXY from archive/i15_* once 10+ days exist, cached 30 min
//   GET  /api/helix/bundle       owner-only: the broadcast's morning payload in one request, each block { asOf, source, stale, degraded }, cached 2 min
//   POST /api/helix/record       owner-only: one broadcast run into helix/days/<date>.json (inputs, headline, plan, scene texts, watcher summary)
//   GET  /api/helix/record       owner-only: ?date=YYYY-MM-DD, the day's record
// Every cache is a single slot with one shared promise in flight, so a burst of requests costs one build. Read-only except the record. DESCRIPTION ONLY.
import { buildG10Rates, G10_KEYS, buildFundingBoard, FUNDING_KEYS, AUCTION_KEYS } from './helixData.js';
import { buildHelixBundle, cleanRun, mergeDayRecord, watcherSummary, readRollHealth, buildStress, STRESS_IDS, STRESS_MIN_DAYS, terrainRanges, TERRAIN_MARKETS } from './helixBundle.js';

/** A single-slot cache: get() returns the cached value while fresh, else one shared build. A failed build keeps serving the last good value (marked stale) for up to keepMs. */
export function slot(build, ttlMs, { now = () => Date.now(), keepMs = 24 * 3600e3 } = {}) {
  let val = null, at = 0, p = null;
  return async function get({ force = false } = {}) {
    if (!force && val && now() - at < ttlMs) return val;
    if (p) return p;
    p = (async () => {
      try { const v = await build(); val = v; at = now(); return v; }
      catch (e) { if (val && now() - at < keepMs) return { ...val, stale: true, error: e.message }; throw e; }
      finally { p = null; }
    })();
    return p;
  };
}

const POINTS_KEEP = 400, ROWS_KEEP = 40;
export function mountHelixRoutes(app, deps) {
  const { ownerOnly, r2GetJSON, r2ListKeys, r2Ok = () => true, archive, drill = async () => null, fetchRange = null, selfFetch, log = console, now = () => Date.now() } = deps;
  const seriesOf = async keys => {
    const out = {};
    await Promise.all(keys.map(async k => { try { const j = await r2GetJSON(`archive/series/${k}.json`); if (j?.points) out[k] = j.points.slice(-POINTS_KEEP); } catch (e) { /* missing series = empty row */ } }));
    return out;
  };
  const send = (res, p, maxAge = 300) => p.then(j => { res.set('Cache-Control', `public, max-age=${maxAge}`); res.json(j); }).catch(e => res.status(500).json({ ok: false, error: e.message }));

  const g10 = slot(async () => {
    if (!r2Ok()) return { ok: false, error: 'R2 not configured' };
    return { ...buildG10Rates(await seriesOf([...G10_KEYS, 'fred/DGS2', 'fred/DGS10']), { nowMs: now() }), builtAt: new Date(now()).toISOString(), source: 'R2 archive/series (js/macroCapture.js, FRED archive)' };
  }, 3600e3, { now });
  const funding = slot(async () => {
    if (!r2Ok()) return { ok: false, error: 'R2 not configured' };
    const [series, auctions] = await Promise.all([seriesOf(FUNDING_KEYS), (async () => {
      const o = {}; await Promise.all(AUCTION_KEYS.map(async ([, k]) => { try { const j = await r2GetJSON(`archive/tables/ust_auctions/${k}.json`); if (j?.rows) o[k] = j.rows.slice(-ROWS_KEEP); } catch (e) { /* none yet */ } })); return o;
    })()]);
    return { ...buildFundingBoard(series, auctions, { nowMs: now() }), builtAt: new Date(now()).toISOString(), source: 'R2 archive/series (NY Fed, OFR, FRED, Daily Treasury Statement) and archive/tables/ust_auctions' };
  }, 3600e3, { now });
  const rollHealth = slot(async () => {
    let j = null; try { j = r2Ok() ? await r2GetJSON('rates-legs/_health.json') : null; } catch (e) { j = null; }
    return { ...readRollHealth(j, { now: now() }), builtAt: new Date(now()).toISOString() };
  }, 600e3, { now });
  const stress = slot(async () => {
    if (!r2Ok()) return { ok: false, error: 'R2 not configured' };
    const days = {};
    for (const id of STRESS_IDS) {
      const keys = (await r2ListKeys(`archive/i15_${id}/`).catch(() => [])).filter(k => /\d{4}-\d{2}-\d{2}\.json$/.test(k)).sort().slice(-22);
      if (keys.length < STRESS_MIN_DAYS) { days[id] = keys.map(k => ({ date: k.match(/(\d{4}-\d{2}-\d{2})\.json$/)[1], t: [], c: [] })); continue; }   // too few: only count them, read nothing
      days[id] = (await Promise.all(keys.map(async k => { try { const j = await r2GetJSON(k); const p = j?.payload; return p?.c ? { date: j.date ?? k.match(/(\d{4}-\d{2}-\d{2})\.json$/)[1], t: p.t ?? [], c: p.c } : null; } catch (e) { return null; } }))).filter(Boolean);
    }
    return { ...buildStress(days), builtAt: new Date(now()).toISOString(), source: 'R2 archive/i15_MOVE, archive/i15_DXY (Yahoo 15-minute bars, js/macroCapture.js)' };
  }, 1800e3, { now });
  const dxyIce = async () => {
    const B = await drill(); const a = B?.series?.dxyIce, d = B?.dates;
    if (!Array.isArray(a) || !Array.isArray(d)) return { ok: false, error: 'no ICE dollar index in the drill bundle' };
    const pts = []; for (let i = 0; i < a.length; i++) if (a[i] != null) pts.push([d[i], a[i]]);
    const last = pts.at(-1), chg = h => (pts.length > h ? +(((last[1] / pts[pts.length - 1 - h][1]) - 1) * 100).toFixed(2) : null);
    return { ok: !!last, asOf: last?.[0] ?? null, last: last?.[1] ?? null, chg1dPct: chg(1), chg5dPct: chg(5), chg20dPct: chg(20), spark: pts.slice(-30), note: 'ICE dollar index rebuilt from its six OANDA legs (js/dxyIce.js), beside the Fed broad dollar.' };
  };
  const terrain = slot(async () => {
    if (!fetchRange) return { ok: false, error: 'OANDA_KEY not configured' };
    const t = now(), today = new Date(t).toISOString().slice(0, 10), from = new Date(t - 135 * 864e5).toISOString().slice(0, 10), bars = {}, failed = [];
    for (let k = 0; k < TERRAIN_MARKETS.length; k += 7) {
      await Promise.all(TERRAIN_MARKETS.slice(k, k + 7).map(async m => { try { bars[m.key] = await fetchRange(m.oanda, 'D', `${from}T00:00:00Z`, `${today}T23:59:59Z`); } catch (e) { failed.push(m.key); } }));
    }
    const tr = terrainRanges(bars, today);
    return { ok: Object.keys(tr.markets).length >= 3, asOf: new Date(t).toISOString(), from, to: today, markets: tr.markets, missing: tr.missing, failed };
  }, 600e3, { now });

  app.get('/api/g10-rates', (_req, res) => send(res, g10()));
  app.get('/api/funding-board', (_req, res) => send(res, funding()));
  app.get('/api/vol-terrain', (_req, res) => send(res, terrain(), 120));
  app.get('/api/helix/roll-health', (_req, res) => send(res, rollHealth(), 120));
  app.get('/api/helix/stress', (_req, res) => send(res, stress()));

  // The bundle is fetched with the owner's own cookie, so every route's own login rules apply as if the HUD had asked. One build per 2 minutes, shared.
  let bundleSlot = null;
  app.get('/api/helix/bundle', ownerOnly, (req, res) => {
    const cookie = req.headers.cookie ?? '';
    bundleSlot ??= slot(() => buildHelixBundle({ fetchJson: u => selfFetch(u, { cookie: bundleSlot.cookie }), now, internal: { g10: () => g10(), funding: () => funding(), rollHealth: () => rollHealth(), stress: () => stress(), dxyIce } }), 120e3, { now, keepMs: 15 * 60e3 });
    bundleSlot.cookie = cookie;
    res.set('Cache-Control', 'no-store');
    bundleSlot({ force: req.query.force === '1' }).then(j => res.json(j)).catch(e => res.status(500).json({ ok: false, error: e.message }));
  });

  app.post('/api/helix/record', ownerOnly, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const c = cleanRun(req.body, { now: now() }); if (!c.ok) return res.status(400).json(c);
      if (!archive?.enabled) return res.json({ ok: false, error: 'R2 not configured' });
      if (!c.run.watcher) { try { c.run.watcher = watcherSummary(await selfFetch('/api/jarvis/watch', { cookie: req.headers.cookie ?? '' })); } catch (e) { c.run.watcher = null; } }
      const key = `helix/days/${c.date}.json`, w = await archive.putRecord(key, prev => mergeDayRecord(prev, c.date, c.part, c.run));
      res.json({ ok: !w.error, key, wrote: !!w.wrote, reason: w.reason ?? null, error: w.error ?? null, parts: w.doc ? Object.keys(w.doc.runs) : null });
    } catch (e) { log.warn?.('[helix-record]', e.message); res.status(500).json({ ok: false, error: e.message }); }
  });
  app.get('/api/helix/record', ownerOnly, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const date = String(req.query.date ?? ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ ok: false, error: 'date=YYYY-MM-DD' });
    try { const j = r2Ok() ? await r2GetJSON(`helix/days/${date}.json`) : null; res.json(j ? { ok: true, ...j } : { ok: false, error: 'no record for that day' }); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  return { g10, funding, rollHealth, stress, terrain };
}
