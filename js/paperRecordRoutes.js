// Rich-vol break paper record — live job + API (page: paper-record.html; rule and backtest: js/paperRecordCore.js).
//
// Tick (every 5 min, server.js svcInterval 'paperRecord'):
//   1. From 21:00 London, set TOMORROW's rich flags once: implied vol (CME settlement IV from oi_store, or the CBOE vol
//      index's latest close) ÷ 20-day realised vol from the live M1 closes. Using the evening before keeps every input
//      dated before the trading day (the backtest's 2-day IV lag gave +0.114R vs +0.118R).
//   2. 00:00–10:00 London (plus the entry bar): on rich instruments, detect breaks of today's Vol Forecast lines.
//   3. Re-score every unfinished trade; a trade is final once its London day is over (or every variant has hit).
// Storage: KV `paper_record_v1` = { days: { 'YYYY-MM-DD': { flags, flagsAt, trades: [...] , notes: [] } }, log: [] }.
// No orders, no bots, no alerts.
import { v4Days, nyCloseDailyBars } from './voteAtlasV4Lines.js';
import { constantMaturityIV } from './ivMetrics.js';
import { assetClassFor } from './forecastAnalyserStore.js';
import { costForPair } from './perLineStrategy.js';
import { INSTRUMENTS, END_MIN, richFlag, detectBreaks, scoreTrade, h1TrendState } from './paperRecordCore.js';

export const PAPER_KV = 'paper_record_v1';
const KEEP_DAYS = 400, CBOE = s => `https://cdn.cboe.com/api/global/us_indices/daily_prices/${s}_History.csv`;
const IV_MAX_AGE_H = 36;

const london = (ms = Date.now()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute };
};
const nextBizDay = date => { const d = new Date(date + 'T12:00:00Z'); do d.setUTCDate(d.getUTCDate() + 1); while ([0, 6].includes(d.getUTCDay())); return d.toISOString().slice(0, 10); };

const nextCalDay = date => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
// Epoch seconds of 00:00 Europe/London on a YYYY-MM-DD (BST-aware).
const londonMidnightSec = date => { const g = Date.UTC(...date.split('-').map((v, i) => i === 1 ? v - 1 : +v)) / 1000; return g - (london(g * 1000).min === 60 ? 3600 : 0); };
function lowerBound(arr, x) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return lo; }

// liveEventTag(sym, date) -> 'FOMC'|'NFP'|'CPI'|'high'|'holiday'|'none'|null: the site's own vol-forecast event tag for that
// London day (server.js passes one reading forecastState). Recorded per day on first use so re-scoring never changes it.
// getContext(sym) (optional): the Daily Read / Surface Lab reads for this instrument at the moment a break is first
// seen — line tag (IV ÷ the lines' σ), extending/giving back by horizon, dollar share, FX and cross-asset one-trade share,
// market clock. Stored once on the trade as `ctx`, never updated, so the record is a forward test of whether these reads
// separate good breaks from bad (forge/TAG_X_PERSISTENCE_PREREG.md). It never changes which trades are taken.
export function createPaperRecord({ kv, getFastLive, liveCache, fetchImpl = fetch, log = console, liveEventTag = () => null, getContext = async () => null }) {
  const dayCache = new Map();               // `${key}|${date}` -> v4Days day (ladder + static lines), built once per day
  let running = false, last = null;

  async function load() {
    const raw = await kv.getStrict(PAPER_KV);             // throws on backend failure -> the tick refuses to write
    if (!raw) return { days: {}, log: [] };
    const p = JSON.parse(raw); return p.data ?? p;
  }
  const note = (store, msg) => { store.log = [{ at: new Date().toISOString(), msg }, ...(store.log ?? [])].slice(0, 200); };

  async function packedFor(key) {
    await getFastLive(key);                                // gap-fills from OANDA; first call may only start warming
    const p = liveCache.get(key)?.packed;
    if (!p?.n) return null;
    return { ...p, volumes: p.volumes ?? new Float64Array(p.n) };
  }

  async function ivFor(inst, oiStore, cboeCache) {
    if (inst.src === 'cme') {
      const e = oiStore?.[inst.oi];
      const at = e?.ivSavedAtMs ?? e?.savedAtMs ?? null;
      if (!e?.ivTermStructure?.points) return { iv: null, why: 'no IV term structure in oi_store' };
      if (!at || Date.now() - at > IV_MAX_AGE_H * 3600e3) return { iv: null, why: `capture older than ${IV_MAX_AGE_H}h` };
      const v = constantMaturityIV(e.ivTermStructure.points, { days: 30, minDte: 5 });
      return v ? { iv: v * 100, asOf: new Date(at).toISOString(), source: 'CME settlement IV30 (options capture)' } : { iv: null, why: 'IV30 not computable' };
    }
    if (!cboeCache[inst.cboe]) {
      const r = await fetchImpl(CBOE(inst.cboe)); if (!r.ok) return { iv: null, why: `CBOE ${inst.cboe} HTTP ${r.status}` };
      const rows = (await r.text()).trim().split(/\r?\n/).filter(l => /^\d/.test(l));
      const [mdY, , , , close] = rows.at(-1).split(','); const [m, d, y] = mdY.split('/');
      cboeCache[inst.cboe] = { iv: +close, asOf: `${y}-${m}-${d}` };
    }
    return { ...cboeCache[inst.cboe], source: `CBOE ${inst.cboe} close` };
  }

  // Flags for `forDate`, using only data available now (the evening before).
  async function setFlags(store, forDate) {
    let oiStore = null;
    try { const raw = await kv.get('oi_store'); if (raw) { const p = JSON.parse(raw); oiStore = p.data ?? p; } } catch {}
    const cboe = {}, flags = {};
    for (const inst of INSTRUMENTS) {
      try {
        const iv = await ivFor(inst, oiStore, cboe);
        const packed = await packedFor(inst.key);
        if (!packed) { flags[inst.key] = { rich: null, why: 'live prices still warming' }; continue; }
        const closes = nyCloseDailyBars(packed).filter(b => b.n >= 60 && b.endSec <= Date.now() / 1000).map(b => b.close);
        flags[inst.key] = iv.iv == null ? { rich: null, why: iv.why } : { ...richFlag(inst, iv.iv, closes), threshold: inst.rich, ivSource: iv.source, ivAsOf: iv.asOf, provisional: !!inst.provisional };
      } catch (e) { flags[inst.key] = { rich: null, why: String(e.message || e) }; }
    }
    store.days[forDate] = { ...(store.days[forDate] ?? {}), flags, flagsAt: new Date().toISOString(), trades: store.days[forDate]?.trades ?? [] };
    note(store, `flags set for ${forDate}: rich = ${Object.entries(flags).filter(([, f]) => f.rich).map(([k]) => k).join(', ') || 'none'}`);
  }

  // The day's forecast (ladder, static lines, open, σ) is fixed once the day has opened, so it is built once and
  // cached; the day's BARS are rebuilt from the live window on every call so later ticks see new bars.
  function dayFor(inst, packed, date, tag) {
    const ck = `${inst.key}|${date}`;
    let base = dayCache.get(ck);
    if (!base) {
      const from = Math.max(0, packed.n - 200 * 1440);                     // ~140 trading days; the ladder needs 60
      const sub = { n: packed.n - from, times: packed.times.subarray(from), opens: packed.opens.subarray(from), highs: packed.highs.subarray(from),
                    lows: packed.lows.subarray(from), closes: packed.closes.subarray(from), volumes: packed.volumes.subarray(from) };
      const d = v4Days(sub, { instrument: inst.sym, assetClass: assetClassFor(inst.key), eventTagFor: () => tag ?? null }).find(x => x.date === date);
      if (!d) return null;
      base = { ...d, bars: null };
      dayCache.set(ck, base);
      if (dayCache.size > 60) dayCache.delete(dayCache.keys().next().value);   // a few days × 11 instruments
    }
    const end = londonMidnightSec(nextCalDay(date));
    let i = lowerBound(packed.times, base.openSec);
    const bars = [];
    for (; i < packed.n && packed.times[i] < end; i++) bars.push({ time: packed.times[i], open: packed.opens[i], high: packed.highs[i], low: packed.lows[i], close: packed.closes[i], volume: packed.volumes[i] });
    return bars.length ? { ...base, bars } : null;
  }

  async function updateDay(store, date, final) {
    const day = store.days[date]; if (!day?.flags) return;
    day.trades ??= [];
    for (const inst of INSTRUMENTS) {
      if (!day.flags[inst.key]?.rich) continue;
      const packed = await packedFor(inst.key); if (!packed) continue;
      day.eventTags ??= {};
      if (!(inst.key in day.eventTags)) day.eventTags[inst.key] = liveEventTag(inst.sym, date) ?? null;
      const d = dayFor(inst, packed, date, day.eventTags[inst.key]); if (!d) continue;
      const bars = d.bars, costPx = costForPair(inst.key, assetClassFor(inst.key)) / 100 * d.open;
      day.lines ??= {}; day.lines[inst.key] = Object.fromEntries(Object.entries(d.static).map(([k, v]) => [k, +v.toFixed(5)]));
      for (const b of detectBreaks(d, bars)) {
        let t = day.trades.find(x => x.inst === inst.key && x.line === b.line);
        if (!t) { const h1 = h1TrendState(packed, b.signalTime);
          t = { inst: inst.key, line: b.line, dir: b.dir, level: +b.level.toFixed(6), entry: b.entry, signalTime: b.signalTime, entryTime: b.entryTime,
                h1Trend: h1, h1Rel: h1 == null ? null : h1 === 0 ? 'neutral' : h1 * b.dir > 0 ? 'with' : 'counter' };
          // Context only for breaks first seen live (within 30 min of the signal); a late or backfilled trade gets none,
          // because the reads would be from after the entry.
          if (Date.now() / 1000 - b.signalTime <= 1800) { try { t.ctx = await getContext(inst.sym, b.dir); } catch { t.ctx = null; } }
          day.trades.push(t); note(store, `${date} ${inst.sym} break of ${b.line} ${b.dir > 0 ? 'up' : 'down'} at ${b.entry}`); }
        if (t.done) continue;
        Object.assign(t, scoreTrade(d, bars, b, costPx, final));
        if (final) t.done = true;
      }
    }
    if (final) day.final = true;
  }

  async function tick(reason = 'scheduled') {
    if (running) return { skipped: 'already running' };
    running = true;
    try {
      const now = london(), store = await load();
      if (now.min >= 21 * 60) { const nd = nextBizDay(now.date); if (!store.days[nd]?.flags) await setFlags(store, nd); }
      const today = store.days[now.date];
      if (!today?.flags && ![0, 6].includes(new Date(now.date + 'T12:00:00Z').getUTCDay())) {
        store.days[now.date] = { flags: null, trades: [], skipped: 'flags were not set before the day opened (deploy or outage)' };
      }
      if (store.days[now.date]?.flags && now.min <= END_MIN + 5) await updateDay(store, now.date, false);
      else if (store.days[now.date]?.flags && store.days[now.date].trades?.some(t => !t.done)) await updateDay(store, now.date, false);
      for (const [date, d] of Object.entries(store.days)) if (date < now.date && d.flags && !d.final) await updateDay(store, date, true);
      const dates = Object.keys(store.days).sort(); for (const old of dates.slice(0, Math.max(0, dates.length - KEEP_DAYS))) delete store.days[old];
      store.updatedAt = new Date().toISOString();
      await kv.put(PAPER_KV, JSON.stringify(store));
      last = { at: store.updatedAt, reason, ok: true };
      return last;
    } catch (e) {
      last = { at: new Date().toISOString(), reason, ok: false, error: String(e.message || e) };
      log.warn?.(`[paper-record] tick failed: ${last.error}`);
      return last;
    } finally { running = false; }
  }

  function mount(app) {
    app.get('/api/paper-record', async (_req, res) => {
      try { res.json({ ...(await load()), lastTick: last, rule: { instruments: INSTRUMENTS, endMin: END_MIN } }); }
      catch (e) { res.status(503).json({ error: `KV unavailable: ${e.message}` }); }
    });
    app.post('/api/paper-record/tick', async (_req, res) => res.json(await tick('manual')));
  }
  return { tick, mount, _setFlags: setFlags, _updateDay: updateDay };   // _ = test hooks
}
