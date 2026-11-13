/**
 * The slim routes behind the Desk Terminal's newer Macro boards. Each builds a few-KB payload from caches the server already keeps (the market
 * state document, FRED, the in-memory rates) and a fail-soft self-call for the few feeds that only exist as routes. Nothing here fetches a paid
 * feed, runs a backtest or triggers a heavy build; each route is cached in memory and falls back to its last good copy if a rebuild fails.
 *
 *   mountDeskBoards(app, deps)   deps = { mbCached, fredKey, getState, selfJson, buildCsiInputs, buildCsi, CSI_DEFAULTS, ratesSeries, ... }
 *
 * The shaping lives in pure modules (js/creditLiquidityCore.js ...), tested on their own; this file is wiring only.
 */
import { buildCreditLiquidity } from './creditLiquidityCore.js';
import { buildCurveBoard } from './curveBoardCore.js';
import { buildRegimeBoard } from './regimeBoardCore.js';
import { buildReleasesBoard } from './releasesBoardCore.js';
import { buildStrength, PAIRS } from './ccyStrengthCore.js';

// Currency strength keeps two layers of OANDA bars so a per-minute refresh stays cheap: hourly and daily history (15 minutes, for each pair's normal
// move and the 1D / 1W anchors) and the latest five-minute bars (50 seconds). One in-flight refresh serves every viewer; nothing is fetched while no
// one is looking, because the route is only called by an open tab.
const toBar = c => ({ t: Date.parse(c.time), c: c.close });
export function makeStrengthFeed(fetchCandles, { slowMs = 15 * 60e3, fastMs = 50e3, now = () => Date.now() } = {}) {
  const st = { slowAt: 0, fastAt: 0, h1: {}, d: {}, m5: {}, inflight: null, errors: {} };
  const each = async (fn) => { for (let i = 0; i < PAIRS.length; i += 7) await Promise.all(PAIRS.slice(i, i + 7).map(async p => { try { await fn(p); } catch (e) { st.errors[p] = e.message; } })); };
  async function refresh() {
    const t = now();
    if (t - st.slowAt > slowMs) { await each(async p => { st.h1[p] = (await fetchCandles(p, 'H1', 600)).map(toBar); st.d[p] = (await fetchCandles(p, 'D', 260)).map(toBar); }); st.slowAt = t; }
    if (t - st.fastAt > fastMs) { await each(async p => { st.m5[p] = (await fetchCandles(p, 'M5', 100)).map(toBar); }); st.fastAt = t; }
  }
  return { async get() {
    if (!st.inflight) st.inflight = refresh().finally(() => { st.inflight = null; });
    await st.inflight;
    return buildStrength({ bars: Object.fromEntries(PAIRS.map(p => [p, { m5: st.m5[p] ?? [], h1: st.h1[p] ?? [], d: st.d[p] ?? [] }])), now: now() });
  }, state: st };
}

export function mountDeskBoards(app, d) {
  const route = (path, key, hours, build) => app.get(path, async (_req, res) => {
    try { res.set('Cache-Control', 'no-store'); res.json(await d.mbCached(key, hours, build)); }
    catch (e) { res.status(502).json({ ok: false, error: e.message }); }
  });

  // Credit & liquidity: the CSI + Baa-10Y (FRED), global liquidity and net liquidity (state document), the gate's z-scores and the pulse stats (self-calls)
  route('/api/credit-liquidity', 'creditliq', 3, async () => {
    const { components } = await d.buildCsiInputs(d.fredKey, '2004-01-01');
    const csi = d.buildCsi(components, { zWindow: d.CSI_DEFAULTS.zWindow });
    const [state, gate, pulse] = await Promise.all([
      d.getState().catch(() => null),
      d.selfJson('/api/liquidity-gate/live').catch(() => null),
      d.selfJson('/api/liquidity-pulse/data').catch(() => null),
    ]);
    return buildCreditLiquidity({ components, csi, state, gate, pulse });
  });

  // The curve through time: the Treasury series the Rates & policy board holds (12 years, in memory), the yield-vs-EURUSD coupling and the spread-turn log
  route('/api/curve-board', 'curveboard', 1, async () => {
    const S = await d.ratesSeries();
    if (!S) throw new Error('no rates yet');
    const [coupling, episodes] = await Promise.all([d.selfJson('/api/yield-coupling').catch(() => null), d.selfJson('/api/spread-episodes/live').catch(() => null)]);
    return buildCurveBoard({ S, coupling, episodes });
  });

  // Where the market is: the state document's regime lenses, risk flags, vol and registered edges, the daily two-state HMM, the pair-correlation regime
  route('/api/regime-board', 'regimeboard', 0.17, async () => {
    const [state, hmm, hist, hedge] = await Promise.all([d.getState().catch(() => null), d.selfJson('/api/hmm/regimes').catch(() => null), d.selfJson('/api/hmm-daily-history').catch(() => null), d.selfJson('/api/hedge-alerts').catch(() => null)]);
    return buildRegimeBoard({ state, hmm, hist, hedge });
  });

  // Currency strength (σ): price-based and live, from OANDA bars already pulled elsewhere (no new feed)
  if (d.fetchCandles) {
    const feed = makeStrengthFeed(d.fetchCandles);
    app.get('/api/ccy-strength', async (_req, res) => {
      try { res.set('Cache-Control', 'no-store'); res.json(await feed.get()); } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
    });
  }

  // Releases and who is positioned: the calendar, the COT crowding, the measured reactions and the front-end rate legs (self-calls, all cached feeds)
  route('/api/releases-board', 'releasesboard', 0.1, async () => {
    const [events, cot, reactions, eventDay] = await Promise.all(['/api/events', '/api/cot-extremes', '/api/release-reactions', '/api/event-day'].map(p => d.selfJson(p).catch(() => null)));
    return buildReleasesBoard({ events: Array.isArray(events) ? events : (events?.events ?? []), cot, reactions, eventDay });
  });
}
