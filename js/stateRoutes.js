// Market State Engine — API (logic: js/stateEngine.js + js/stateSources.js; plan: plans/MARKET_STATE_ENGINE_PLAN.md).
//
// READ-ONLY. One document for state.html: the hierarchy tiers, the chain with evidence status per link, the
// first-move order and data health. Inputs are the caches the rest of the server already keeps:
//   FRED      KV fredhistory_series_<key> (refreshFredHistory, ~90 prints each)
//   prices    OANDA New York-close daily bars via fetchD1 (session-dated), 400 bars per instrument
//   extras    /api/intl-yields, crack, chain-extra, stress-shadow, fed-path, econ-surprise over a local self-call (cheap, cached);
//             KV macro_regime_fx_v1, credit_quality_v1; in-memory global read, risk flags, funding, nowcast, OI, COT, vol forecast
//             via `readers` (never triggers their builds)
// A failed input is listed in `errors` and its nodes come out unmeasured; nothing is filled in.
//
//   GET /api/state            the state document (cached 10 minutes; ?force=1 rebuilds)
import { buildState } from './stateEngine.js';
import { assembleChainSeries, CHAIN_OHLC, FRED_KEYS } from './stateSources.js';
import { summariseGlobal, summariseEconomies, summariseLayers, activeEdges } from './stateLayers.js';

const TTL_MS = 10 * 60e3, PRICE_BARS = 400;

// `readers` (optional) hand over state the server already holds in memory, so this route never triggers a heavy
// build: { globalRead, riskFlags, funding, nowcast, oiToday, cotState, volForecast } → value | Promise<value>.
export function createStateRoutes({ kv, port, fetchD1, readers = {}, log = console }) {
  let cache = { at: 0, doc: null }, building = null;
  const local = async (p, ms = 15_000) => {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/${p}`, { signal: AbortSignal.timeout(ms) }); return r.ok ? await r.json() : null; }
    catch { return null; }
  };

  async function build() {
    const errors = [];
    const fredHist = {};
    await Promise.all([...FRED_KEYS, 'gb10y', 'de10y', 'jp10y', 'au10y', 'ca10y', 'ch10y'].map(async k => {
      try { const raw = await kv.get(`fredhistory_series_${k}`); if (raw) fredHist[k] = JSON.parse(raw); } catch (e) { errors.push({ source: `FRED ${k}`, error: e.message }); }
    }));
    if (!Object.keys(fredHist).length) errors.push({ source: 'FRED', error: 'no fredhistory_series_* in KV' });

    const prices = {};
    if (process.env.OANDA_KEY) {
      for (const [node, sym] of Object.entries(CHAIN_OHLC)) {
        try { prices[node] = (await fetchD1(sym, PRICE_BARS)).map(b => ({ date: b.date, value: b.close })); }
        catch (e) { errors.push({ source: `OANDA ${sym}`, error: e.message }); }
        await new Promise(r => setTimeout(r, 80));      // gentle on the OANDA rate limit
      }
    } else errors.push({ source: 'OANDA', error: 'OANDA_KEY not configured' });

    const kvJson = async key => { try { const raw = await kv.get(key); if (!raw) return null; const p = JSON.parse(raw); return p?.data && !p.now ? p.data : p; } catch { return null; } };
    const read = async (name, fn, ms = 12_000) => {
      if (typeof fn !== 'function') return null;
      try { return await Promise.race([Promise.resolve().then(fn), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }
      catch (e) { errors.push({ source: name, error: e?.message ?? String(e) }); return null; }
    };
    const [iy, cr, cx, stress, fedPath, surprise, regime, creditQuality, globalRead, riskFlags, funding, nowcast, oiToday, cotState, volForecast] = await Promise.all([
      local('intl-yields'), local('crack'), local('chain-extra', 25_000), local('stress-shadow', 20_000), local('fed-path'), local('econ-surprise', 20_000),
      kvJson('macro_regime_fx_v1'), kvJson('credit_quality_v1'),
      read('global-read', readers.globalRead), read('risk-flags', readers.riskFlags, 20_000), read('funding-read', readers.funding),
      read('nowcast', readers.nowcast), read('oi-today', readers.oiToday), read('cot-state', readers.cotState, 30_000), read('vol-forecast', readers.volForecast),
    ]);
    for (const [name, v, ok] of [['intl-yields', iy, iy?.series], ['crack', cr, cr?.series], ['chain-extra', cx, cx?.series], ['stress-shadow', stress, stress?.conditions],
      ['fed-path', fedPath, fedPath?.ok], ['econ-surprise', surprise, surprise?.byCcy], ['macro-regime (KV)', regime, regime?.now], ['credit-quality (KV)', creditQuality, creditQuality?.quality != null]])
      if (!ok) errors.push({ source: name, error: v?.error ? String(v.error) : 'unavailable' });

    const { series, sources } = assembleChainSeries({ fredHist, prices, intlYields: iy?.series, chainExtra: cx?.series, crack: cr?.series });
    const doc = buildState(series, { sources });
    doc.global = summariseGlobal({ globalRead, riskFlags, regime, funding, creditQuality });
    doc.economies = summariseEconomies({ surprise, nowcast, fedPath, fredHist, intlYields: iy?.series, cot: cotState });
    doc.layers = summariseLayers({ volForecast, cot: cotState, oi: oiToday });
    const nq = series.nq; const nq5 = Array.isArray(nq) && nq.length > 6 ? (nq[nq.length - 1].value / nq[nq.length - 6].value - 1) * 100 : null;
    doc.edges = activeEdges({ stress, nq5, oi: oiToday });
    doc.errors = errors;
    return doc;
  }

  async function get(force = false) {
    if (!force && cache.doc && Date.now() - cache.at < TTL_MS) return { ...cache.doc, cached: true };
    if (!building) building = build().then(doc => { cache = { at: Date.now(), doc }; return doc; }).finally(() => { building = null; });
    return { ...(await building), cached: false };
  }

  function mount(app) {
    app.get('/api/state', async (req, res) => {
      try { res.json(await get(req.query.force === '1')); }
      catch (e) { log.error?.('[state]', e?.message); res.status(500).json({ ok: false, error: e?.message ?? String(e) }); }
    });
  }
  return { mount, get };
}
