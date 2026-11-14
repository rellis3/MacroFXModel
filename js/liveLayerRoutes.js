/**
 * GET /api/live-layer: the intraday overlay for the Desk Terminal's daily boards, in one small payload (js/liveLayerCore.js has the maths).
 *
 *   em        live EM prices against the EM gauges' last daily close
 *   indices   Nasdaq / S&P / Dow / Russell against the last completed daily close, small-vs-big and tech-vs-broad
 *   yields    implied intraday US 2/5/10/30y and Bund 10y beside the last official prints, implied slopes, the Bund gap
 *   state     range used so far against the forecast day (the vol-forecast session tracker) and the majors' correlation regime from hourly bars
 *
 * COST. One OANDA pricing call covers every EM and index price. The index reference closes are four D-candle calls cached two hours. The yields reuse
 * the Chain Live window's own functions (a handful of calls for one EUR/USD reference and five bond CFDs; the official series are cached six hours).
 * The range state is the vol-forecast session tracker's own 90-second cache and the correlation regime reads the strength feed's hourly bars: both free.
 * One in-flight build serves every viewer; the result is cached 75 s while the FX week is open and 10 min while it is shut (no point re-asking a shut market).
 * Nothing is fetched while no tab is open: the route is only called by a visible terminal. Egress: about 3 KB per call.
 *
 *   mountLiveLayer(app, deps)  deps = { fetchCandles, pricing, selfJson, clMarket, clYield, ylOfficial, YL, getSession, isFxOpen, now }
 */
import { overlayEm, overlayIndices, overlayYields, rangeState, corrRegime, parsePricing, quotesClosed, pricingList, INDEX_LIVE, YIELD_LIVE } from './liveLayerCore.js';

export const OPEN_TTL_MS = 75e3, CLOSED_TTL_MS = 10 * 60e3, REF_TTL_MS = 2 * 3600e3;

export function makeLiveLayer(d) {
  const now = d.now ?? (() => Date.now());
  const st = { at: 0, data: null, inflight: null, refs: { at: 0, v: null }, lastOkAt: null, lastError: null, builds: 0, parts: {} };

  async function indexRefs() {
    if (st.refs.v && now() - st.refs.at < REF_TTL_MS) return st.refs.v;
    const out = {};
    await Promise.all(INDEX_LIVE.map(async x => {
      try { const bars = (await d.fetchCandles(x.oanda, 'D', 3)).filter(b => b.complete !== false); const b = bars.at(-1); if (b) out[x.id] = { close: b.close, date: String(b.time).slice(0, 10) }; } catch { /* that index is simply not overlaid */ }
    }));
    if (Object.keys(out).length) st.refs = { at: now(), v: out };
    return st.refs.v ?? out;
  }

  async function yields(nowS) {
    const m = await d.clMarket('EUR_USD'), tRef = m.refOpen + 86400, mvs = {}, official = {}, errors = {};
    await Promise.all(YIELD_LIVE.map(async ([name]) => {
      try { mvs[name] = await d.clYield(name, tRef, nowS); } catch (e) { errors[name] = e.message; }
      try { const o = (await d.ylOfficial(d.YL[name].daily)).at(-1); if (o) official[name] = o; } catch { /* no official print beside it */ }
    }));
    return { ...overlayYields({ mvs, official }), errors, refAt: new Date(tRef * 1000).toISOString() };
  }

  async function build() {
    const t = now(), nowS = Math.floor(t / 1000), part = {};
    const safe = async (k, f) => { try { const v = await f(); part[k] = { ok: true }; return v; } catch (e) { part[k] = { ok: false, error: e.message }; return null; } };
    const [rawPx, em, refs, ylds, session] = await Promise.all([
      safe('pricing', () => d.pricing(pricingList())),
      safe('em', () => d.selfJson('/api/em-gauges')),
      safe('refs', indexRefs),
      safe('yields', () => yields(nowS)),
      safe('session', () => d.getSession()),
    ]);
    const px = rawPx ? parsePricing(rawPx) : {};
    const closedByQuotes = quotesClosed(px, t), open = d.isFxOpen ? d.isFxOpen(t) : null;
    const closed = open === false ? true : closedByQuotes === true;
    const h1 = d.strengthState?.()?.h1 ?? null;
    const data = {
      ok: true, builtAt: new Date(t).toISOString(), closed, quoteAt: Object.values(px).length ? new Date(Math.max(...Object.values(px).map(x => x.at ?? 0))).toISOString() : null,
      em: rawPx && em ? overlayEm(em, px) : { ok: false, error: part.pricing?.error ?? part.em?.error ?? 'no EM data' },
      indices: rawPx && refs ? overlayIndices({ refs, px }) : { ok: false, error: part.pricing?.error ?? part.refs?.error ?? 'no index data' },
      yields: ylds ?? { ok: false, error: part.yields?.error ?? 'no yields' },
      state: { range: session ? rangeState(session) : { ok: false, error: part.session?.error ?? 'no session status' }, corr: h1 ? corrRegime(h1) : { ok: false, error: 'the hourly bars are not loaded yet' } },
      label: 'price-based and live; the daily boards stay the reference',
    };
    data.ok = [data.em, data.indices, data.yields, data.state.range, data.state.corr].some(x => x?.ok);
    st.parts = part;
    return data;
  }

  async function get() {
    // a copy built while the market was shut is only kept for ten minutes while it STAYS shut: the moment the clock says open again it is stale
    const t = now(), shut = st.data?.closed && (d.isFxOpen ? d.isFxOpen(t) === false : true), ttl = shut ? CLOSED_TTL_MS : OPEN_TTL_MS;
    const reopened = st.data?.closed && d.isFxOpen?.(t) === true;
    if (st.data && !reopened && t - st.at < ttl) return st.data;
    if (!st.inflight) {
      st.inflight = build().then(v => { st.data = v; st.at = now(); st.builds++; st.lastError = null; if (v.ok) st.lastOkAt = st.at; return v; })
        .catch(e => { st.lastError = e.message; if (st.data) return { ...st.data, warning: e.message }; throw e; })
        .finally(() => { st.inflight = null; });
    }
    return st.inflight;
  }

  return { get, state: st, status: () => ({ lastOkAt: st.lastOkAt, lastError: st.lastError, builds: st.builds, closed: st.data?.closed ?? null, parts: st.parts }) };
}

export function mountLiveLayer(app, d) {
  const layer = makeLiveLayer(d);
  app.get('/api/live-layer', async (_req, res) => {
    try { res.set('Cache-Control', 'no-store'); res.json(await layer.get()); } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
  });
  return layer;
}
