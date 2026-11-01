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
import { assembleChainSeries, CHAIN_OHLC, FRED_KEYS, YAHOO_FALLBACK } from './stateSources.js';
import { summariseGlobal, summariseEconomies, summariseLayers, activeEdges, todayRegimes, edgeRegimeContext } from './stateLayers.js';
import { summariseLiquidity } from './stateLiquidity.js';
import { longContext, fxBoard, surpriseHistory, cotBoard } from './stateHistory.js';
import { playbook } from './statePlaybook.js';

const TTL_MS = 10 * 60e3, PRICE_BARS = 400;

// `readers` (optional) hand over state the server already holds in memory, so this route never triggers a heavy
// build: { globalRead, riskFlags, funding, nowcast, oiToday, cotState, volForecast } → value | Promise<value>.
export function createStateRoutes({ kv, port, fetchD1, readers = {}, log = console, keylessPauseMs = 400 }) {
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
    // Deep history: the R2 archive (js/dataArchive.js) holds each series at full FRED depth; the KV copy is 90 prints.
    // Prefer the deep copy so percentiles and context cover real history; fall back to KV.
    const deepUsed = [];
    if (typeof readers.deepFred === 'function') {
      await Promise.all(Object.keys(fredHist).concat(['us10y', 'us2y', 'us30y', 'tips', 'bei', 'vix', 'hy', 'dxy']).filter((k, i, a) => a.indexOf(k) === i).map(async k => {
        try { const deep = await readers.deepFred(k); if (Array.isArray(deep) && deep.length > (fredHist[k]?.length ?? 0)) { fredHist[k] = deep; deepUsed.push(k); } }
        catch { /* KV copy stays */ }
      }));
    }

    // Keyless fallback (owner, 2026-11-01: "use real data"): any FRED series still missing comes from FRED's public CSV.
    const fallback = {};
    if (typeof readers.fredKeyless === 'function') {
      // One at a time with retries: FRED's public CSV answers a burst of 20 parallel requests with HTTP 503.
      for (const k of [...FRED_KEYS, 'gb10y', 'de10y', 'jp10y', 'au10y', 'ca10y', 'ch10y'].filter(k => !fredHist[k]?.length)) {
        let lastErr = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try { const pts = await readers.fredKeyless(k); if (Array.isArray(pts) && pts.length) { fredHist[k] = pts; fallback[k] = 'FRED public CSV (no KV copy)'; } lastErr = null; break; }
          catch (e) { lastErr = e; await new Promise(r => setTimeout(r, keylessPauseMs * 4 * (attempt + 1))); }
        }
        if (lastErr) errors.push({ source: `FRED ${k} (public CSV)`, error: lastErr.message });
        await new Promise(r => setTimeout(r, keylessPauseMs));
      }
    }

    const prices = {};
    if (process.env.OANDA_KEY) {
      for (const [node, sym] of Object.entries(CHAIN_OHLC)) {
        try { prices[node] = (await fetchD1(sym, PRICE_BARS)).map(b => ({ date: b.date, value: b.close })); }
        catch (e) { errors.push({ source: `OANDA ${sym}`, error: e.message }); }
        await new Promise(r => setTimeout(r, 80));      // gentle on the OANDA rate limit
      }
    } else errors.push({ source: 'OANDA', error: 'OANDA_KEY not configured — using Yahoo daily instead' });
    // Price nodes OANDA did not deliver: Yahoo daily, labelled.
    if (typeof readers.yahooDaily === 'function') {
      for (const [node, t] of Object.entries(YAHOO_FALLBACK)) {
        if (prices[node]?.length) continue;
        try { const pts = await readers.yahooDaily(t); if (pts?.length) { prices[node] = pts; fallback[node] = `Yahoo ${t} (fallback: OANDA unavailable)`; } }
        catch (e) { errors.push({ source: `Yahoo ${t}`, error: e.message }); }
      }
    }

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
    for (const [k, v] of Object.entries(fallback)) {                     // say where every fallback number came from
      const node = { tips: 'real' }[k] ?? k;
      if (sources[node]) sources[node] = v.startsWith('Yahoo') ? v : `${sources[node]} — ${v}`;
    }
    const doc = buildState(series, { sources });
    doc.global = summariseGlobal({ globalRead, riskFlags, regime, funding, creditQuality });
    doc.economies = summariseEconomies({ surprise, nowcast, fedPath, fredHist, intlYields: iy?.series, cot: cotState });
    doc.layers = summariseLayers({ volForecast, cot: cotState, oi: oiToday });
    // Liquidity & banking: keyed FRED (public CSV only without a key), Treasury DTS, BIS store. Missing stays missing.
    const liqRaw = await read('liquidity', readers.liquidity, 120_000);
    if (liqRaw) {
      for (const e of liqRaw.errors ?? []) errors.push({ source: 'liquidity', error: e });
      doc.layers.liquidity = summariseLiquidity({ raw: liqRaw.raw ?? {}, tgaDaily: liqRaw.tgaDaily, bis: liqRaw.bis, via: liqRaw.via ?? {} });
      for (const w of doc.layers.liquidity.warnings) errors.push({ source: 'liquidity units', error: w });
    } else doc.layers.liquidity = null;
    const nq = series.nq; const nq5 = Array.isArray(nq) && nq.length > 6 ? (nq[nq.length - 1].value / nq[nq.length - 6].value - 1) * 100 : null;
    // Next weekday session (London date) for the calendar-only month-end rule when stress-shadow is not loaded.
    const sessionDate = (() => { const d = new Date(); if (d.getUTCHours() >= 22) d.setUTCDate(d.getUTCDate() + 1); while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
    const vixTerm = (() => { const v = fredHist.vix ?? [], m = new Map((fredHist.vix3m ?? []).map(p => [p.date, p.value]));
      for (let i = v.length - 1; i >= Math.max(0, v.length - 5); i--) { const d = m.get(v[i].date); if (Number.isFinite(v[i].value) && Number.isFinite(d) && d > 0) return { value: v[i].value / d, date: v[i].date }; } return null; })();
    doc.edges = activeEdges({ stress, nq5, oi: oiToday, sessionDate, vixTerm });
    // Edges by regime (EXPLORATORY, analysis/output/edges-by-regime): what each edge did in regimes like today's.
    const regimeResults = await read('edges-by-regime', readers.edgeRegimes);
    // Credit regime on Moody's BAA − 10Y, the series edges-by-regime used (Amendment 1); HY OAS only if BAA is missing.
    const baa = liqRaw?.raw?.BAA10Y;
    doc.regimes = todayRegimes({ vix: series.vix, hy: baa?.length ? baa : series.hy, us10y: series.us10y, us2y: series.us2y });
    doc.regimes.creditSeries = baa?.length ? 'BAA10Y' : 'HY OAS (BAA10Y not loaded)';
    if (regimeResults) {
      doc.regimeStudy = { generated: regimeResults.generated, lockbox: regimeResults.lockbox, status: regimeResults.status, data: regimeResults.data ?? null, doc: 'analysis/output/edges-by-regime/RESULTS.md' };
      for (const e of doc.edges) e.regime = edgeRegimeContext(regimeResults, e.id, doc.regimes);
    }
    doc.deepHistory = deepUsed.sort();
    // Long-history context (committed seeds + R2 archive) and the institutional playbook (DATA_ASSET_MAP §4C).
    const hist = await read('history', readers.history, 60_000);
    if (hist) {
      const sh = surpriseHistory(hist.backfill);
      doc.history = {
        long: longContext(hist.series), fx: fxBoard(hist.series), cot: cotBoard(hist.cot),
        surprises: Object.fromEntries(Object.entries(sh).map(([c, pts]) => [c, pts.slice(-180)])),
        surpriseNote: 'ForexFactory backfill 2007-01 → 2025-04: each release (actual − consensus) scaled by that event\'s own prior spread, monthly mean. Read as above / below consensus, not good / bad.',
        sources: hist.from, builtAt: hist.builtAt,
      };
    }
    doc.playbook = playbook(doc);
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
