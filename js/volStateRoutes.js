// Vol state vector — API (logic: js/volStateVector.js). READ-ONLY and descriptive, like the stress and drawdown shadows.
//
// Reads: vol_forecast_latest, vol_forecast_<date> and vol_session_<date> (the Vol Forecast scheduler's KV), the hourly
// HMM log (passed in by the server), /api/stress-shadow and /api/drawdown-shadow (local), and OANDA NY-close daily
// candles for the long-run σ series. Writes nothing. The live forecast, ladder and shadows are never modified.
//
//   GET /api/vol-state[?sym=NQ]   one vector per forecast instrument for the current forecast session
import { buildVector, hmmHighVolProb } from './volStateVector.js';
import { classOf } from './drawdownShadowCore.js';
import { auditUsable } from './harShadowCore.js';
import { paramsFor } from './forecastLadder.js';
import { SIGMA_ESTIMATORS } from './forecastSigma.js';
import { londonMidnightSec } from './volBacktestEngine.js';
import { INSTRUMENTS as FC_INSTRUMENTS } from './volForecastScheduler.js';

const TTL_MS = 10 * 60e3;
const parse = raw => { if (!raw) return null; const p = typeof raw === 'string' ? JSON.parse(raw) : raw; return p?.data ?? p; };
export const londonDate = (ms = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(ms));
export const midnightOf = date => londonMidnightSec(new Date(`${date}T00:30:00Z`));
const oandaBase = () => ((process.env.OANDA_ENV || 'live') === 'practice' ? 'https://api-fxpractice.oanda.com' : 'https://api-fxtrade.oanda.com');

/** OANDA mid candles -> [{t (open sec), o, h, l, c, complete}]. */
export async function oandaCandles(instrument, query, fetchImpl = fetch) {
  if (!process.env.OANDA_KEY) throw new Error('no OANDA_KEY');
  const r = await fetchImpl(`${oandaBase()}/v3/instruments/${encodeURIComponent(instrument)}/candles?price=M&${query}`,
    { headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`OANDA ${instrument} HTTP ${r.status}`);
  return ((await r.json()).candles ?? []).filter(c => c.mid).map(c => ({ t: Math.floor(Date.parse(c.time) / 1000), o: +c.mid.o, h: +c.mid.h, l: +c.mid.l, c: +c.mid.c, complete: !!c.complete }));
}

function weekdaysBefore(date, n) {
  const out = [], d = new Date(date + 'T12:00:00Z');
  while (out.length < n) { d.setUTCDate(d.getUTCDate() - 1); if (![0, 6].includes(d.getUTCDay())) out.push(d.toISOString().slice(0, 10)); }
  return out.reverse();
}

export function createVolState({ kv, getHmmStore = async () => null, hmmKeys = {}, fetchLocal = async () => null, log = console }) {
  const cfgOf = Object.fromEntries(FC_INSTRUMENTS.map(c => [c.name, c]));
  const auditCache = new Map();          // date -> { sess, fc } for finished dates (immutable)
  const longrunCache = new Map();        // `${sym}|${sessionDate}` -> longrun input
  let cache = null, cacheAt = 0, building = null;

  async function audited(date) {
    if (auditCache.has(date)) return auditCache.get(date);
    const [sess, fc] = [parse(await kv.get(`vol_session_${date}`)), parse(await kv.get(`vol_forecast_${date}`))];
    const v = { sess, fc };
    if (sess?.instruments) auditCache.set(date, v);
    if (auditCache.size > 120) auditCache.delete(auditCache.keys().next().value);
    return v;
  }

  async function longrun(sym, sessionDate) {
    const k = `${sym}|${sessionDate}`;
    if (longrunCache.has(k)) return longrunCache.get(k);
    const cfg = cfgOf[sym];
    let out;
    try {
      if (!cfg) throw new Error('no OANDA mapping');
      const est = paramsFor(sym, cfg.assetClass)?.estimator ?? 'yz_30';
      const fn = SIGMA_ESTIMATORS[est];
      if (!fn) throw new Error(`estimator ${est} has no series form`);
      const cut = midnightOf(sessionDate);
      // a daily candle is stamped at its 17:00 New York open and closes a day later; keep only those closed before the London open
      const bars = (await oandaCandles(cfg.oandaInstrument, 'granularity=D&count=320')).filter(b => b.complete && b.t + 86400 <= cut)
        .map(b => ({ open: b.o, high: b.h, low: b.l, close: b.c }));
      out = { series: fn(bars), estimator: est, asOf: bars.length ? `${bars.length} daily bars to the NY close before ${sessionDate}` : null };
    } catch (e) { out = { series: null, reason: `long-run σ series unavailable: ${e.message}` }; }
    if (out.series) { longrunCache.set(k, out); if (longrunCache.size > 200) longrunCache.delete(longrunCache.keys().next().value); }
    return out;
  }

  async function build() {
    const fcAll = parse(await kv.get('vol_forecast_latest'));
    if (!fcAll?.instruments) throw new Error('no vol forecast in KV');
    const sessionDate = fcAll.session_date ?? londonDate();
    const cutMs = midnightOf(sessionDate) * 1000;
    const [stress, drawdown, hmmStore] = await Promise.all([
      fetchLocal('/api/stress-shadow').catch(() => null), fetchLocal('/api/drawdown-shadow').catch(() => null), getHmmStore().catch(() => null)]);
    const stressBy = stress?.sessionDate === sessionDate ? Object.fromEntries((stress.today ?? []).map(x => [x.sym, { factor: x.factor, sessionDate }])) : {};
    const ddBy = drawdown?.sessionDate === sessionDate ? Object.fromEntries((drawdown.today ?? []).map(x => [x.sym, { factor: x.factor, trigger: drawdown.trigger, sessionDate }])) : {};
    const errDays = [];
    for (const d of weekdaysBefore(sessionDate, 30)) {
      try { const a = await audited(d); if (a.sess?.instruments && a.fc?.instruments && auditUsable(d, a.sess.audited_at)) errDays.push({ date: d, ...a }); }
      catch (e) { log.warn?.(`[vol-state] ${d}: ${e.message}`); }
    }
    const vectors = {};
    for (const sym of Object.keys(fcAll.instruments)) {
      const fc = fcAll.instruments[sym];
      const errRows = errDays.map(d => ({ date: d.date, hl: d.sess.instruments[sym]?.error ? null : d.sess.instruments[sym]?.hl, p50: d.fc.instruments[sym]?.ladder_flat?.hl_p50 }));
      const hk = hmmKeys[sym];
      const hmm = hk && hmmStore?.pairs?.[hk] ? hmmHighVolProb(hmmStore.pairs[hk], cutMs) : null;
      vectors[sym] = buildVector({
        sym, sessionDate, fc, fcAsOf: fcAll.computed_at, longrun: await longrun(sym, sessionDate), hmm, cutoffIso: new Date(cutMs).toISOString(),
        errRows, stress: stressBy[sym] ?? null, drawdown: ddBy[sym] ?? null, cls: classOf(sym), jump: null,
      });
      if (!hk || !hmmStore?.pairs?.[hk]) vectors[sym].regime = { value: null, reason: hk ? 'hourly HMM log has no entry for this instrument yet' : 'instrument not in the hourly HMM log' };
    }
    return { builtAt: new Date().toISOString(), sessionDate, forecastComputedAt: fcAll.computed_at, cutoff: new Date(cutMs).toISOString(), vectors,
             note: 'Descriptive state of volatility per instrument, assembled from numbers the server already computes. Not a forecast of direction, not a signal.' };
  }

  async function get() {
    if (!cache || Date.now() - cacheAt > TTL_MS) {
      building ??= build().finally(() => { building = null; });
      cache = await building; cacheAt = Date.now();
    }
    return cache;
  }

  function mount(app) {
    app.get('/api/vol-state', async (req, res) => {
      try {
        const v = await get(), sym = String(req.query.sym || '').toUpperCase();
        res.set('Cache-Control', 'no-store');
        if (sym) return v.vectors[sym] ? res.json({ ...v, vectors: { [sym]: v.vectors[sym] } }) : res.status(404).json({ error: `no vol state for ${sym}` });
        res.json(v);
      } catch (e) { res.status(503).json({ error: `vol-state unavailable: ${e.message}` }); }
    });
  }
  return { mount, get };
}
