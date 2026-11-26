// ladder-v2 SHADOW exports for the v3 page (logic: js/ladderV2Shadow.js). READ-ONLY: OANDA candles in, paste text
// out; nothing is written and nothing live reads it.
//
//   GET /api/vol-forecast/ladder-v2/export?kind=forecast|exhaustion&track=cfd|fut
//
// Inputs: NAS100 NY-close daily bars from 2016 (har_rv_log), XAU / EUR 5-minute mid candles for the last 45 days
// (HAR-CJ); for the ladder-v2-rollout instruments, whatever their banked sigma needs (NY-close daily bars from 2015-12,
// and 5- or 15-minute closes for the last 45 days). Cached 10 minutes.
import { oandaCandles } from './volStateRoutes.js';
import { getJSON as r2Get, putJSON as r2Put, r2Configured } from './r2Store.js';
import { qlikeParams, qlikeInstruments, qlikeSeries, qlikeDayLevels, qlikeText } from './ladderV2Qlike.js';
import { eventLayerRows } from './ladderV2EventLayer.js';
import { preopenParams, preopenSigma, preopenDayLevels, preopenText } from './ladderPreopen.js';
import { PARAMS, nqSigma, harcjSigma, buildText, sessionDate, nyKey, nqSigmaSeries, harcjSigmaSeries, sigmaForSession, dayLevels, rolloutSigmaSeries } from './ladderV2Shadow.js';

const TTL_MS = 10 * 60e3;
let cache = null, cacheAt = 0, building = null;

async function m5Closes(instrument, days = 45, gran = 'M5') {
  const out = [];
  let from = Math.floor(Date.now() / 1000) - days * 86400;
  for (let guard = 0; guard < 6; guard++) {
    const iso = new Date(from * 1000).toISOString().replace(/\.\d{3}Z$/, '.000000000Z');
    const c = await oandaCandles(instrument, `granularity=${gran}&count=5000&from=${encodeURIComponent(iso)}`);
    const done = c.filter(x => x.complete);
    for (const x of done) if (!out.length || x.t > out[out.length - 1][0]) out.push([x.t, x.c]);
    if (c.length < 5000) break;
    from = c[c.length - 1].t + 1;
  }
  return out;
}

async function d1Bars(instrument) {
  const d = await oandaCandles(instrument,
    `granularity=D&dailyAlignment=17&alignmentTimezone=${encodeURIComponent('America/New_York')}&count=5000&from=${encodeURIComponent('2015-12-01T00:00:00.000000000Z')}`);
  return d.filter(x => x.complete).map(x => ({ key: nyKey(x.t), open: x.o, high: x.h, low: x.l, close: x.c }));
}

const ROLLOUT = Object.keys(PARAMS.instruments).filter(s => PARAMS.instruments[s].rollout);

/** Inputs for one rollout instrument; intraday window [fromSec, toSec] (default: the last 45 days). */
async function rolloutInputs(sym, fromSec = null, toSec = null) {
  const P = PARAMS.instruments[sym];
  const inp = { d1: await d1Bars(P.oanda) };
  for (const g of ['m5', 'm15']) {
    if (!P.needs.includes(g)) continue;
    inp[g] = fromSec == null ? await m5Closes(P.oanda, 45, g.toUpperCase())
                             : await m5Window(P.oanda, fromSec, toSec, g.toUpperCase());
  }
  return inp;
}

async function pool(items, n, fn) {          // at most n OANDA fetches in flight
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

async function build() {
  const session = sessionDate();
  const d1 = await d1Bars(PARAMS.instruments.NQ.oanda);
  const [gold, eur] = await Promise.all([m5Closes(PARAMS.instruments.GOLD.oanda), m5Closes(PARAMS.instruments.EURUSD.oanda)]);
  const sigmas = { NQ: nqSigma(d1, session), GOLD: harcjSigma('GOLD', gold, session), EURUSD: harcjSigma('EURUSD', eur, session) };
  const roll = await pool(ROLLOUT, 6, async sym => {
    try { return sigmaForSession(rolloutSigmaSeries(sym, await rolloutInputs(sym)), session); } catch { return null; }
  });
  ROLLOUT.forEach((s, i) => { sigmas[s] = roll[i]; });
  return { session, sigmas, at: Date.now() };
}

async function inputs() {
  if (cache && Date.now() - cacheAt < TTL_MS && cache.session === sessionDate()) return cache;
  if (!building) building = build().then(v => { cache = v; cacheAt = Date.now(); return v; }).finally(() => { building = null; });
  return building;
}

export { build as buildLadderV2Inputs };   // diagnostics / live check

// ── per-day levels for the forecast-reversion page ─────────────────────────────────────────────────
//   GET /api/vol-forecast/ladder-v2/levels?pair=gold|eurusd|nq|<any rollout instrument>&from=YYYY-MM-DD&to=YYYY-MM-DD[&track=fut]
// -> { ok, pair, track, days: { date: { sigma, asof, oh_p50..ol_p90, oc_*, hl_*, zone50_pct, zone75_pct, odds } } }
const PAIR_SYM = { gold: 'GOLD', eurusd: 'EURUSD', nq: 'NQ', nas100: 'NQ', xauusd: 'GOLD',
  ...Object.fromEntries(ROLLOUT.map(s => [s.toLowerCase(), s])) };
const MAX_DAYS = 370;
const seriesCache = new Map();   // `${sym}|${fromKey}|${toKey}` -> { at, series }
async function m5Window(instrument, fromSec, toSec, gran = 'M5') {
  const out = [];
  let cur = fromSec;
  for (let guard = 0; guard < 40 && cur < toSec; guard++) {
    const iso = new Date(cur * 1000).toISOString().replace(/\.\d{3}Z$/, '.000000000Z');
    const c = await oandaCandles(instrument, `granularity=${gran}&count=5000&from=${encodeURIComponent(iso)}`);
    for (const x of c) if (x.complete && x.t <= toSec && (!out.length || x.t > out[out.length - 1][0])) out.push([x.t, x.c]);
    if (c.length < 5000) break;
    cur = c[c.length - 1].t + 1;
  }
  return out;
}
async function seriesFor(sym, from, to) {
  const ck = `${sym}|${from}|${to}`;
  const hit = seriesCache.get(ck);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.series;
  let series;
  if (sym === 'NQ') {
    const d = await oandaCandles(PARAMS.instruments.NQ.oanda,
      `granularity=D&dailyAlignment=17&alignmentTimezone=${encodeURIComponent('America/New_York')}&count=5000&from=${encodeURIComponent('2015-12-01T00:00:00.000000000Z')}`);
    series = nqSigmaSeries(d.filter(x => x.complete).map(x => ({ key: nyKey(x.t), open: x.o, high: x.h, low: x.l, close: x.c })));
  } else if (PARAMS.instruments[sym].rollout) {
    const fromSec = Math.floor(Date.parse(from + 'T00:00:00Z') / 1000) - 50 * 86400;
    const toSec = Math.floor(Date.parse(to + 'T23:59:59Z') / 1000);
    series = rolloutSigmaSeries(sym, await rolloutInputs(sym, fromSec, toSec));
  } else {
    const fromSec = Math.floor(Date.parse(from + 'T00:00:00Z') / 1000) - 50 * 86400;
    const toSec = Math.floor(Date.parse(to + 'T23:59:59Z') / 1000);
    series = harcjSigmaSeries(sym, await m5Window(PARAMS.instruments[sym].oanda, fromSec, toSec));
  }
  seriesCache.set(ck, { at: Date.now(), series });
  if (seriesCache.size > 24) seriesCache.delete(seriesCache.keys().next().value);
  return series;
}
export async function levelsRange(pair, from, to, track = 'cfd') {
  const sym = PAIR_SYM[String(pair).toLowerCase()];
  if (!sym) return { ok: false, error: `no v2 levels for ${pair}; on the site: ${Object.keys(PARAMS.instruments).join(', ')}` };
  if (!PARAMS.instruments[sym][track]) return { ok: false, error: `${sym} has no validated v2 ${track === 'fut' ? 'futures' : 'CFD'} ladder` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return { ok: false, error: 'from/to as YYYY-MM-DD' };
  const span = (Date.parse(to) - Date.parse(from)) / 86400e3;
  if (!(span >= 0) || span > MAX_DAYS) return { ok: false, error: `range must be 0-${MAX_DAYS} days` };
  const series = await seriesFor(sym, from, to);
  const days = {};
  for (let t = Date.parse(from + 'T12:00:00Z'); t <= Date.parse(to + 'T12:00:00Z'); t += 86400e3) {
    const date = new Date(t).toISOString().slice(0, 10);
    const dow = new Date(t).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const s = sigmaForSession(series, date);
    if (s) days[date] = { ...dayLevels(sym, track, s.sigma), asof: s.asof };
  }
  return { ok: true, pair: String(pair).toLowerCase(), symbol: sym, track, version: PARAMS.version,
           note: 'shadow ladder-v2; widths fitted on sessions to 2026-08-21, so earlier dates are partly in-sample', days };
}

// ── QLIKE per-line shadow ladders (ladder-qlike-per-line: futures; ladder-qlike-per-line-cfd: CFDs) ─────────
const qCache = new Map();   // `${track}|${sym}|${from}|${to}` -> { at, series }
async function qlikeInputs(sym, fromSec = null, toSec = null, track = 'fut') {
  const P = qlikeParams(sym, track);
  const inp = { d1: await d1Bars(P.oanda) };
  for (const g of ['m5', 'm15']) {
    if (!P.needs.includes(g)) continue;
    inp[g] = fromSec == null ? await m5Closes(P.oanda, 45, g.toUpperCase()) : await m5Window(P.oanda, fromSec, toSec, g.toUpperCase());
  }
  return inp;
}
export async function qlikeLevelsRange(pair, from, to, track = 'fut') {
  const sym = PAIR_SYM[String(pair).toLowerCase()] ?? String(pair).toUpperCase();
  if (!qlikeParams(sym, track)) return { ok: false, error: `no QLIKE per-line ${track} ladder for ${pair}; on the site: ${qlikeInstruments(track).join(', ')}` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return { ok: false, error: 'from/to as YYYY-MM-DD' };
  const span = (Date.parse(to) - Date.parse(from)) / 86400e3;
  if (!(span >= 0) || span > MAX_DAYS) return { ok: false, error: `range must be 0-${MAX_DAYS} days` };
  const ck = `${track}|${sym}|${from}|${to}`;
  let hit = qCache.get(ck);
  if (!hit || Date.now() - hit.at > TTL_MS) {
    const fromSec = Math.floor(Date.parse(from + 'T00:00:00Z') / 1000) - 50 * 86400;
    const toSec = Math.floor(Date.parse(to + 'T23:59:59Z') / 1000);
    hit = { at: Date.now(), series: qlikeSeries(sym, await qlikeInputs(sym, fromSec, toSec, track), track) };
    qCache.set(ck, hit);
    if (qCache.size > 16) qCache.delete(qCache.keys().next().value);
  }
  const days = {};
  for (let t = Date.parse(from + 'T12:00:00Z'); t <= Date.parse(to + 'T12:00:00Z'); t += 86400e3) {
    const dow = new Date(t).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const date = new Date(t).toISOString().slice(0, 10);
    const o = qlikeDayLevels(sym, hit.series, date, track);
    if (o) days[date] = o;
  }
  return { ok: true, pair: String(pair).toLowerCase(), symbol: sym, track, calc: 'qlike', lines: qlikeParams(sym, track).lines,
           note: `shadow QLIKE per-line ladder; widths fitted on ${track === 'cfd' ? 'CFD' : 'futures'} sessions to 2026-08-21, so earlier dates are partly in-sample`, days };
}
// The board is a function of the session date only: every line comes from completed NY-close daily bars and prior 5/15-minute closes, so it does not move during the session. It is therefore built ONCE per
// session and stored in R2 (qlike-lines/<track>/<session>.json); a request or a reboot loads the stored board instead of re-fetching ~65 instruments' history from OANDA (2026-11-25, memory).
const Q_PREFIX = 'qlike-lines', Q_RETRY_MS = 2 * 60e3;
const qExport = {}, qBuilding = {};
async function qlikeBoard(track = 'fut') {
  const session = sessionDate();
  const names = qlikeInstruments(track);
  let c = qExport[track];
  if (!c || c.session !== session) {
    c = { session, lv: {}, lastTry: 0, stored: false };
    if (r2Configured()) {
      try { const st = await r2Get(`${Q_PREFIX}/${track}/${session}.json`); if (st?.session === session && st.lv) { c.lv = st.lv; c.stored = true; } } catch { /* no stored board yet */ }
    }
    qExport[track] = c;
  }
  const missing = () => names.filter(s => !c.lv[s]);
  if (missing().length && Date.now() - c.lastTry > Q_RETRY_MS) {
    if (!qBuilding[track]) qBuilding[track] = (async () => {
      c.lastTry = Date.now();
      const one = async sym => { try { c.lv[sym] = qlikeDayLevels(sym, qlikeSeries(sym, await qlikeInputs(sym, null, null, track), track), session, track); } catch { c.lv[sym] = null; } };
      await pool(missing(), 4, one);
      // a transient OANDA failure under the parallel fetch (seen 2026-11-24 on NQ, 18 futures): retry the failures once, one at a time
      for (const s of missing()) await one(s);
      if (r2Configured() && names.some(s => c.lv[s])) {
        try { await r2Put(`${Q_PREFIX}/${track}/${session}.json`, { session, track, builtAt: new Date().toISOString(), lv: c.lv }); c.stored = true; } catch (e) { console.warn(`[qlike-board] ${track} store failed: ${e.message}`); }
      }
    })().finally(() => { qBuilding[track] = null; });
    await qBuilding[track];
  } else if (qBuilding[track]) await qBuilding[track];
  return c;
}
async function qlikeExportText(track = 'fut') {
  const c = await qlikeBoard(track);
  // Layer 2 (event days, CFD only): extra 'EV2' rows on decision days; the base rows above them are unchanged.
  const extra = track === 'cfd' ? Object.fromEntries(Object.keys(c.lv).map(s => [s, eventLayerRows(s, c.lv[s], c.session)])) : {};
  return qlikeText(c.lv, c.session, track, extra);
}

// Today's per-line levels for every instrument (the vol-forecast-v3 charts overlay them); same stored board as the export.
async function qlikeTodayLevels(track = 'fut') {
  const c = await qlikeBoard(track);
  return { ok: true, track, session: c.session, levels: c.lv ?? {} };
}

// ── PRE-OPEN shadow ladder (gold-calc-upgrades / calc-upgrades-wide; js/ladderPreopen.js) ───────────────────────
// Reads the bars between the NY close and London midnight, so the board for session D is built only AFTER 00:00 London
// on D (once per session, stored in R2 under preopen-lines/<track>/<session>.json). Validated instruments get the
// pre-open sigma on every line; the rest repeat the QLIKE per-line board unchanged. Shadow only: nothing live reads it.
async function m5Bars(instrument, days = 45) {
  const out = [];
  let from = Math.floor(Date.now() / 1000) - days * 86400;
  for (let guard = 0; guard < 6; guard++) {
    const iso = new Date(from * 1000).toISOString().replace(/\.\d{3}Z$/, '.000000000Z');
    const c = await oandaCandles(instrument, `granularity=M5&count=5000&from=${encodeURIComponent(iso)}`);
    for (const x of c.filter(y => y.complete)) if (!out.length || x.t > out[out.length - 1][0]) out.push([x.t, x.h, x.l, x.c]);
    if (c.length < 5000) break;
    from = c[c.length - 1].t + 1;
  }
  return out;
}
const _ivHist = new Map();   // CBOE code -> { at, rows: [[YYYY-MM-DD, close], ...] }, 6 h cache (daily index)
async function ivHistory(code) {
  const hit = _ivHist.get(code);
  if (hit && Date.now() - hit.at < 6 * 3600e3) return hit.rows;
  const r = await fetch(`https://cdn.cboe.com/api/global/us_indices/daily_prices/${code}_History.csv`, { signal: AbortSignal.timeout(25_000) });
  if (!r.ok) throw new Error(`CBOE ${code} HTTP ${r.status}`);
  const lines = (await r.text()).trim().split(/\r?\n/);
  const head = lines[0].split(',').map(h => h.trim().toUpperCase());
  const ci = head.includes('CLOSE') ? head.indexOf('CLOSE') : head.length - 1;   // 5-column files: CLOSE; 2-column (GVZ): the value
  const rows = [];
  for (const l of lines.slice(1)) {
    const c = l.split(','); const m = String(c[0]).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/); const v = parseFloat(c[ci]);
    if (m && Number.isFinite(v)) rows.push([`${m[3]}-${m[1]}-${m[2]}`, v]);
  }
  rows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  _ivHist.set(code, { at: Date.now(), rows: rows.slice(-60) });
  return _ivHist.get(code).rows;
}
const _ldnDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });
const P_PREFIX = 'preopen-lines';
const pExport = {}, pBuilding = {};
async function preopenOne(sym, track, session) {
  const P = preopenParams(sym, track);
  const [m5, iv] = await Promise.all([m5Bars(P.oanda), P.iv ? ivHistory(P.iv) : Promise.resolve(null)]);
  return preopenDayLevels(sym, track, preopenSigma(P, m5, iv, session));
}
async function preopenBoard(track = 'fut') {
  const session = sessionDate();
  if (_ldnDate.format(new Date()) < session) return { session, pending: true, lv: {} };   // before 00:00 London on the session day
  const names = qlikeInstruments(track);
  let c = pExport[track];
  if (!c || c.session !== session) {
    c = { session, lv: {}, lastTry: 0 };
    if (r2Configured()) {
      try { const st = await r2Get(`${P_PREFIX}/${track}/${session}.json`); if (st?.session === session && st.lv) c.lv = st.lv; } catch { /* none yet */ }
    }
    pExport[track] = c;
  }
  const missing = () => names.filter(s => !c.lv[s]);
  if (missing().length && Date.now() - c.lastTry > Q_RETRY_MS) {
    if (!pBuilding[track]) pBuilding[track] = (async () => {
      c.lastTry = Date.now();
      const base = await qlikeBoard(track);
      const one = async sym => {
        try { c.lv[sym] = preopenParams(sym, track) ? await preopenOne(sym, track, session) : (base.lv[sym] ?? null); } catch { c.lv[sym] = null; }
      };
      await pool(missing(), 4, one);
      for (const s of missing()) await one(s);
      if (r2Configured() && names.some(s => c.lv[s])) {
        try { await r2Put(`${P_PREFIX}/${track}/${session}.json`, { session, track, builtAt: new Date().toISOString(), lv: c.lv }); } catch (e) { console.warn(`[preopen-board] ${track} store failed: ${e.message}`); }
      }
    })().finally(() => { pBuilding[track] = null; });
    await pBuilding[track];
  } else if (pBuilding[track]) await pBuilding[track];
  return c;
}

export function mountLadderV2Shadow(app) {
  // Warm the stored board when the session flips (22:00 London): checked every 30 min, a no-op once today's board is complete. First check 3 min after boot, so a reboot just loads the stored copy.
  if (process.env.LADDER_QLIKE_WARM !== '0') {
    const warm = async () => {
      for (const t of ['fut', 'cfd']) { try { await qlikeBoard(t); } catch (e) { console.warn(`[qlike-board] warm ${t}: ${e.message}`); } }
      // pre-open board: a no-op before 00:00 London; once built it is stored per session (the forward record for the shadow)
      for (const t of ['fut', 'cfd']) { try { await preopenBoard(t); } catch (e) { console.warn(`[preopen-board] warm ${t}: ${e.message}`); } }
    };
    const first = setTimeout(() => { warm(); setInterval(warm, 30 * 60e3).unref?.(); }, 180e3); first.unref?.();
  }
  // which instruments have a validated v2 ladder on each track (the reversion page reads this)
  app.get('/api/vol-forecast/ladder-v2/instruments', (req, res) => {
    const pick = t => Object.keys(PARAMS.instruments).filter(s => PARAMS.instruments[s][t]).map(s => s.toLowerCase());
    res.json({ ok: true, cfd: pick('cfd'), fut: pick('fut'), off_site: PARAMS.rollout?.off_site ?? [],
               qlike: { fut: qlikeInstruments().map(s => s.toLowerCase()), lines: Object.fromEntries(qlikeInstruments().map(s => [s.toLowerCase(), qlikeParams(s).lines])),
                        cfd: qlikeInstruments('cfd').map(s => s.toLowerCase()), cfd_lines: Object.fromEntries(qlikeInstruments('cfd').map(s => [s.toLowerCase(), qlikeParams(s, 'cfd').lines])) } });
  });
  app.get('/api/vol-forecast/ladder-v2/preopen-today', async (req, res) => {
    try { const c = await preopenBoard(req.query.track === 'fut' ? 'fut' : 'cfd'); res.json({ ok: true, session: c.session, pending: !!c.pending, levels: c.lv ?? {} }); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  app.get('/api/vol-forecast/ladder-v2/qlike-today', async (req, res) => {
    try { res.json(await qlikeTodayLevels(req.query.track === 'fut' ? 'fut' : 'cfd')); } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  app.get('/api/vol-forecast/ladder-v2/levels', async (req, res) => {
    try {
      const r = req.query.calc === 'qlike'
        ? await qlikeLevelsRange(req.query.pair, String(req.query.from ?? ''), String(req.query.to ?? ''), req.query.track === 'cfd' ? 'cfd' : 'fut')
        : await levelsRange(req.query.pair, String(req.query.from ?? ''), String(req.query.to ?? ''), req.query.track === 'fut' ? 'fut' : 'cfd');
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
  app.get('/api/vol-forecast/ladder-v2/export', async (req, res) => {
    const kind = req.query.kind === 'exhaustion' ? 'exhaustion' : 'forecast';
    const track = req.query.track === 'fut' ? 'fut' : 'cfd';
    if (req.query.calc === 'preopen') {
      try {
        const t = req.query.track === 'cfd' ? 'cfd' : 'fut';
        const c = await preopenBoard(t);
        if (c.pending) return res.status(202).type('text/plain').send(`The pre-open ladder for ${c.session} builds after 00:00 London (it reads the hour before the open). Try again after midnight.`);
        return res.type('text/plain').send(preopenText(c.lv, qlikeInstruments(t), c.session, t));
      } catch (e) { return res.status(500).type('text/plain').send(`Error: ${e.message}`); }
    }
    if (req.query.calc === 'qlike') {
      try { return res.type('text/plain').send(await qlikeExportText(req.query.track === 'cfd' ? 'cfd' : 'fut')); } catch (e) { return res.status(500).type('text/plain').send(`Error: ${e.message}`); }
    }
    try {
      const { session, sigmas } = await inputs();
      res.set('X-Ladder-V2-Asof', Object.entries(sigmas).map(([k, v]) => `${k}:${v?.asof ?? 'none'}`).join(','));
      res.type('text/plain').send(buildText(kind, track, sigmas, session));
    } catch (e) {
      res.status(500).type('text/plain').send(`Error: ${e.message}`);
    }
  });
}
