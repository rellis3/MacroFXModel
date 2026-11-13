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
}
