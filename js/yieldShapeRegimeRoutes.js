// Yield-shape regime signal — live job + API (page: yield-shape-regime.html; rule and backtest:
// js/yieldShapeRegimeCore.js, analysis/yield_shape_regime_test.py).
//
// Tick (every 5 min, server.js svcInterval 'yieldShapeRegime'):
//   1. Fetch UST10Y (^TNX, Yahoo chart, 15m bars) and build yesterday's intraday "template" once per day (cached).
//   2. For each tracked pair, bucket today's live price to the same 15-min clock, and if it is currently tracking
//      yesterday's template closely enough (|rolling 2h correlation| > the pair's threshold) AND the template shows
//      a known turn ahead (already happened yesterday), log a pending signal.
//   3. Once enough time has elapsed for a pending signal's window, score it: did price actually turn? (hit/miss)
// Storage: KV `yield_shape_regime_v1` = { days: { 'YYYY-MM-DD': { templateDate, signals: [...] } }, log: [] }.
// Forward test only — no orders, no bots, no alerts, and no validated DIRECTION claim (see `predictedDir`).
import {
  INSTRUMENTS, BAR_MIN, CORR_WINDOW_BARS, bucketSeries, buildYieldTemplate, rollingCorrAt, priceTurnAt, utcDateOf,
} from './yieldShapeRegimeCore.js';

export const REGIME_KV = 'yield_shape_regime_v1';
const KEEP_DAYS = 120;
const YIELD_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?interval=15m&range=5d';

export function createYieldShapeRegime({ kv, getFastLive, liveCache, fetchImpl = fetch, log = console }) {
  let running = false, last = null;
  let yieldRaw = null;                 // { fetchedOn: 'YYYY-MM-DD', times: [], closes: [] } -- refetched once/day
  const templateCache = new Map();     // yield-day date -> built template

  async function load() {
    const raw = await kv.getStrict(REGIME_KV);           // throws on backend failure -> the tick refuses to write
    if (!raw) return { days: {}, log: [] };
    const p = JSON.parse(raw); return p.data ?? p;
  }
  const note = (store, msg) => { store.log = [{ at: new Date().toISOString(), msg }, ...(store.log ?? [])].slice(0, 200); };

  async function packedFor(key) {
    await getFastLive(key);                              // gap-fills from OANDA; first call may only start warming
    const p = liveCache.get(key)?.packed;
    if (!p?.n) return null;
    return p;
  }

  function bucketsForDate(packed, date) {
    const times = [], vals = [];
    for (let i = 0; i < packed.n; i++) {
      if (utcDateOf(packed.times[i]) === date) { times.push(packed.times[i]); vals.push(packed.closes[i]); }
    }
    return bucketSeries(times, vals);
  }

  // Yesterday's (most recent trading day strictly before `today`) ^TNX template, cached so it is fetched/built once.
  async function templateFor(today) {
    if (!yieldRaw || yieldRaw.fetchedOn !== today) {
      const r = await fetchImpl(YIELD_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) throw new Error(`Yahoo ^TNX HTTP ${r.status}`);
      const res = (await r.json())?.chart?.result?.[0];
      const times = res?.timestamp ?? [];
      const closes = res?.indicators?.quote?.[0]?.close ?? [];
      yieldRaw = { fetchedOn: today, times, closes };
    }
    const dates = [...new Set(yieldRaw.times.map(utcDateOf))].sort();
    const yDate = dates.filter(d => d < today).at(-1);
    if (!yDate) return null;
    if (templateCache.has(yDate)) return templateCache.get(yDate);
    const dTimes = [], dCloses = [];
    for (let i = 0; i < yieldRaw.times.length; i++) {
      if (utcDateOf(yieldRaw.times[i]) === yDate) { dTimes.push(yieldRaw.times[i]); dCloses.push(yieldRaw.closes[i]); }
    }
    const tmpl = buildYieldTemplate(yDate, bucketSeries(dTimes, dCloses));
    templateCache.set(yDate, tmpl);
    if (templateCache.size > 10) templateCache.delete(templateCache.keys().next().value);
    return tmpl;
  }

  async function tick(reason = 'scheduled') {
    if (running) return { skipped: 'already running' };
    running = true;
    try {
      const today = utcDateOf(Date.now() / 1000);
      const store = await load();
      store.days[today] ??= { signals: [] };
      const template = await templateFor(today);
      store.days[today].templateDate = template?.date ?? null;
      if (!template) note(store, `${today}: no ^TNX template available yet`);

      for (const inst of INSTRUMENTS) {
        const packed = await packedFor(inst.key);
        if (!packed) continue;
        const todayBars = bucketsForDate(packed, today);

        if (template && todayBars.length >= CORR_WINDOW_BARS) {
          const idx = todayBars.length - 1, tod = todayBars[idx].tod;
          const corr = rollingCorrAt(template.byTod, todayBars, idx, CORR_WINDOW_BARS);
          const turnDir = template.turns[inst.windowMin]?.[tod] ?? null;
          const already = store.days[today].signals.some(s => s.inst === inst.key && s.tod === tod);
          if (!already && corr != null && Math.abs(corr) > inst.thr && turnDir != null) {
            const predictedDir = corr > 0 ? turnDir : -turnDir;
            store.days[today].signals.push({
              inst: inst.key, tod, corr: +corr.toFixed(3), windowMin: inst.windowMin, thr: inst.thr,
              predictedDir, status: 'pending', loggedAt: new Date().toISOString(),
            });
            note(store, `${today} ${inst.key} signal @ ${tod}Z (corr ${corr.toFixed(2)}, ${inst.windowMin}m window)`);
          }
        }

        for (const [date, day] of Object.entries(store.days)) {
          for (const sig of (day.signals ?? [])) {
            if (sig.inst !== inst.key || sig.status !== 'pending') continue;
            const bars = date === today ? todayBars : bucketsForDate(packed, date);
            const sigIdx = bars.findIndex(b => b.tod === sig.tod);
            const fwdBars = sig.windowMin / BAR_MIN;
            if (sigIdx === -1 || sigIdx + fwdBars >= bars.length) continue;   // not enough time elapsed yet
            const r = priceTurnAt(bars, sigIdx, fwdBars);
            if (r) Object.assign(sig, { status: r.turned ? 'hit' : 'miss', actualDir: r.dir, resolvedAt: new Date().toISOString() });
          }
        }
      }

      const dates = Object.keys(store.days).sort();
      for (const old of dates.slice(0, Math.max(0, dates.length - KEEP_DAYS))) delete store.days[old];
      store.updatedAt = new Date().toISOString();
      await kv.put(REGIME_KV, JSON.stringify(store));
      last = { at: store.updatedAt, reason, ok: true };
      return last;
    } catch (e) {
      last = { at: new Date().toISOString(), reason, ok: false, error: String(e.message || e) };
      log.warn?.(`[yield-shape-regime] tick failed: ${last.error}`);
      return last;
    } finally { running = false; }
  }

  function mount(app) {
    app.get('/api/yield-shape-regime', async (_req, res) => {
      try {
        const store = await load();
        const stats = {};
        for (const inst of INSTRUMENTS) {
          let hits = 0, resolved = 0;
          for (const day of Object.values(store.days)) for (const s of (day.signals ?? [])) {
            if (s.inst !== inst.key || s.status === 'pending') continue;
            resolved++; if (s.status === 'hit') hits++;
          }
          stats[inst.key] = { resolved, hits, hitRate: resolved ? hits / resolved : null };
        }
        res.json({ ...store, lastTick: last, stats, rule: { instruments: INSTRUMENTS } });
      } catch (e) { res.status(503).json({ error: `KV unavailable: ${e.message}` }); }
    });
    app.post('/api/yield-shape-regime/tick', async (_req, res) => res.json(await tick('manual')));
  }

  return { tick, mount, _templateFor: templateFor };   // _ = test hook
}
