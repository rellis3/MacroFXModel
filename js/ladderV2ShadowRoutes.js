// ladder-v2 SHADOW exports for the v3 page (logic: js/ladderV2Shadow.js). READ-ONLY: OANDA candles in, paste text
// out; nothing is written and nothing live reads it.
//
//   GET /api/vol-forecast/ladder-v2/export?kind=forecast|exhaustion&track=cfd|fut
//
// Inputs: NAS100 NY-close daily bars from 2016 (har_rv_log), XAU / EUR 5-minute mid candles for the last 45 days
// (HAR-CJ); for the ladder-v2-rollout instruments, whatever their banked sigma needs (NY-close daily bars from 2015-12,
// and 5- or 15-minute closes for the last 45 days). Cached 10 minutes.
import { oandaCandles } from './volStateRoutes.js';
import { QPARAMS, qlikeInstruments, qlikeSeries, qlikeDayLevels, qlikeText } from './ladderV2Qlike.js';
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

// ── QLIKE per-line shadow ladder (ladder-qlike-per-line; futures track) ─────────────────────────────
const qCache = new Map();   // `${sym}|${from}|${to}` -> { at, series }
async function qlikeInputs(sym, fromSec = null, toSec = null) {
  const P = QPARAMS.instruments[sym];
  const inp = { d1: await d1Bars(P.oanda) };
  for (const g of ['m5', 'm15']) {
    if (!P.needs.includes(g)) continue;
    inp[g] = fromSec == null ? await m5Closes(P.oanda, 45, g.toUpperCase()) : await m5Window(P.oanda, fromSec, toSec, g.toUpperCase());
  }
  return inp;
}
export async function qlikeLevelsRange(pair, from, to) {
  const sym = PAIR_SYM[String(pair).toLowerCase()] ?? String(pair).toUpperCase();
  if (!QPARAMS.instruments[sym]) return { ok: false, error: `no QLIKE per-line ladder for ${pair}; on the site: ${qlikeInstruments().join(', ')}` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return { ok: false, error: 'from/to as YYYY-MM-DD' };
  const span = (Date.parse(to) - Date.parse(from)) / 86400e3;
  if (!(span >= 0) || span > MAX_DAYS) return { ok: false, error: `range must be 0-${MAX_DAYS} days` };
  const ck = `${sym}|${from}|${to}`;
  let hit = qCache.get(ck);
  if (!hit || Date.now() - hit.at > TTL_MS) {
    const fromSec = Math.floor(Date.parse(from + 'T00:00:00Z') / 1000) - 50 * 86400;
    const toSec = Math.floor(Date.parse(to + 'T23:59:59Z') / 1000);
    hit = { at: Date.now(), series: qlikeSeries(sym, await qlikeInputs(sym, fromSec, toSec)) };
    qCache.set(ck, hit);
    if (qCache.size > 16) qCache.delete(qCache.keys().next().value);
  }
  const days = {};
  for (let t = Date.parse(from + 'T12:00:00Z'); t <= Date.parse(to + 'T12:00:00Z'); t += 86400e3) {
    const dow = new Date(t).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const date = new Date(t).toISOString().slice(0, 10);
    const o = qlikeDayLevels(sym, hit.series, date);
    if (o) days[date] = o;
  }
  return { ok: true, pair: String(pair).toLowerCase(), symbol: sym, track: 'fut', calc: 'qlike', lines: QPARAMS.instruments[sym].lines,
           note: 'shadow QLIKE per-line ladder; widths fitted on futures sessions to 2026-08-21, so earlier dates are partly in-sample', days };
}
let qExport = null, qExportAt = 0;
async function qlikeExportText() {
  const session = sessionDate();
  if (qExport && qExport.session === session && Date.now() - qExportAt < TTL_MS) return qExport.text;
  const lv = {};
  await pool(qlikeInstruments(), 4, async sym => {
    try { lv[sym] = qlikeDayLevels(sym, qlikeSeries(sym, await qlikeInputs(sym)), session); } catch { lv[sym] = null; }
  });
  qExport = { session, text: qlikeText(lv, session) }; qExportAt = Date.now();
  return qExport.text;
}

export function mountLadderV2Shadow(app) {
  // which instruments have a validated v2 ladder on each track (the reversion page reads this)
  app.get('/api/vol-forecast/ladder-v2/instruments', (req, res) => {
    const pick = t => Object.keys(PARAMS.instruments).filter(s => PARAMS.instruments[s][t]).map(s => s.toLowerCase());
    res.json({ ok: true, cfd: pick('cfd'), fut: pick('fut'), off_site: PARAMS.rollout?.off_site ?? [],
               qlike: { fut: qlikeInstruments().map(s => s.toLowerCase()), lines: Object.fromEntries(qlikeInstruments().map(s => [s.toLowerCase(), QPARAMS.instruments[s].lines])) } });
  });
  app.get('/api/vol-forecast/ladder-v2/levels', async (req, res) => {
    try {
      const r = req.query.calc === 'qlike'
        ? await qlikeLevelsRange(req.query.pair, String(req.query.from ?? ''), String(req.query.to ?? ''))
        : await levelsRange(req.query.pair, String(req.query.from ?? ''), String(req.query.to ?? ''), req.query.track === 'fut' ? 'fut' : 'cfd');
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
  app.get('/api/vol-forecast/ladder-v2/export', async (req, res) => {
    const kind = req.query.kind === 'exhaustion' ? 'exhaustion' : 'forecast';
    const track = req.query.track === 'fut' ? 'fut' : 'cfd';
    if (req.query.calc === 'qlike') {
      try { return res.type('text/plain').send(await qlikeExportText()); } catch (e) { return res.status(500).type('text/plain').send(`Error: ${e.message}`); }
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
