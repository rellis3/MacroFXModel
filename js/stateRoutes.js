// Market State Engine — API (logic: js/stateEngine.js + js/stateSources.js; plan: plans/MARKET_STATE_ENGINE_PLAN.md).
//
// READ-ONLY. One document for state.html: the hierarchy tiers, the chain with evidence status per link, the
// first-move order and data health. Inputs are the caches the rest of the server already keeps:
//   FRED      KV fredhistory_series_<key> (refreshFredHistory, ~90 prints each)
//   prices    OANDA New York-close daily bars via fetchD1 (session-dated), 400 bars per instrument
//   extras    /api/intl-yields, /api/crack, /api/chain-extra, /api/global-read over a local self-call (their own caches)
// A failed input is listed in `errors` and its nodes come out unmeasured; nothing is filled in.
//
//   GET /api/state            the state document (cached 10 minutes; ?force=1 rebuilds)
import { buildState } from './stateEngine.js';
import { assembleChainSeries, CHAIN_OHLC, FRED_KEYS } from './stateSources.js';

const TTL_MS = 10 * 60e3, PRICE_BARS = 400;

export function createStateRoutes({ kv, port, fetchD1, log = console }) {
  let cache = { at: 0, doc: null }, building = null;
  const local = async (p, ms = 15_000) => {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/${p}`, { signal: AbortSignal.timeout(ms) }); return r.ok ? await r.json() : null; }
    catch { return null; }
  };

  async function build() {
    const errors = [];
    const fredHist = {};
    await Promise.all([...FRED_KEYS, 'gb10y', 'de10y', 'jp10y'].map(async k => {
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

    const [iy, cr, cx, gr] = await Promise.all([local('intl-yields'), local('crack'), local('chain-extra', 25_000), local('global-read', 10_000)]);
    if (!iy?.series) errors.push({ source: 'intl-yields', error: 'unavailable' });
    if (!cr?.series) errors.push({ source: 'crack', error: 'unavailable' });
    if (!cx?.series) errors.push({ source: 'chain-extra', error: 'unavailable' });

    const { series, sources } = assembleChainSeries({ fredHist, prices, intlYields: iy?.series, chainExtra: cx?.series, crack: cr?.series });
    const globalRead = gr ? { headline: gr.headline ?? null, envLabel: gr.envLabel ?? null, conviction: gr.conviction ?? null, asOf: gr.meta?.asOf ?? null } : null;
    const doc = buildState(series, { extras: { globalRead }, sources });
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
