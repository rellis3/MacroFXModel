/**
 * Today's trade plan from the dealer-hedging state + the chosen daily lines (OI Lab v2, section 00), and its paper
 * scoring. Pure; no I/O.
 *
 * The playbook (textbook dynamic hedging, the shape of C.OG's 2026-10-16 ES example):
 *   hedging SPEEDS moves (price on the short-gamma side) -> FOLLOW breaks:
 *       buy stop at the up p75 line (stop at up p50, target up p90); sell stop at the down p75 (stop down p50, target down p90)
 *   hedging CALMS moves (long-gamma side) -> FADE the edges:
 *       sell limit at the up p75 (stop up p90, target up p50); buy limit at the down p75 (stop down p90, target down p50)
 * First touch only, one trade per day (whichever side triggers first), entries 08:00-20:00 London, flat at 22:00.
 * Lines are % of the London open (oh/ol from /api/vol-forecast/persist-ladder/json), so stops and targets scale
 * with the day's forecast volatility.
 *
 * Evidence, shown with every plan: on NQ 2020-2026 with the CME book (forge/GAMMA_REGIME_TRADES_PREREG.md, fresh-
 * regime run) fading on long-gamma days averaged -0.03 R and following on short-gamma days -0.03 R after costs.
 * The plan is a starting point to track, not a proven edge.
 */
export const PLAN_EVIDENCE = {
  doc: 'forge/GAMMA_REGIME_TRADES_PREREG.md',
  fade_long_gamma_R: -0.028, follow_short_gamma_R: -0.025, n: 353,
  fx_R: -0.081, fx_n: 1963,
  text: 'Backtests of these exact rules after costs: NQ 2020-2026 (CME book) -0.03 R per trade; EUR/USD, GBP/USD, AUD/USD 2020-2026 -0.08 R per trade (losing on all three). Not an edge on the CME books; the paper record is its live test on the full Cboe book (indices and gold).',
};
export const PLAN_COST = 0.0001;                    // round trip, fraction of price (as the backtest)
export const PLAN_WINDOW = [8 * 60, 20 * 60];       // entries, London minutes

const lvl = (open, pct, sign) => open * (1 + sign * pct / 100);

/**
 * @param m { state: 'speeds'|'calms', switchPoint, switchDir, flowUp1pct, flowDown1pct }
 * @param lines { oh: {p50,p75,p90}, ol: {p50,p75,p90} } (% of open)
 * @param open London 00:00 open (same price terms as switchPoint)
 */
export function buildPlan(m, lines, open) {
  if (!m || !m.state || !lines?.oh?.p75 || !lines?.ol?.p75 || !(open > 0)) return null;
  const U = { p50: lvl(open, lines.oh.p50, 1), p75: lvl(open, lines.oh.p75, 1), p90: lvl(open, lines.oh.p90, 1) };
  const D = { p50: lvl(open, lines.ol.p50, -1), p75: lvl(open, lines.ol.p75, -1), p90: lvl(open, lines.ol.p90, -1) };
  const follow = m.state === 'speeds';
  const orders = follow
    ? [{ side: 'buy', type: 'stop', entry: U.p75, stop: U.p50, target: U.p90, trigger: 'up' },
       { side: 'sell', type: 'stop', entry: D.p75, stop: D.p50, target: D.p90, trigger: 'down' }]
    : [{ side: 'sell', type: 'limit', entry: U.p75, stop: U.p90, target: U.p50, trigger: 'up' },
       { side: 'buy', type: 'limit', entry: D.p75, stop: D.p90, target: D.p50, trigger: 'down' }];
  for (const o of orders) {
    o.riskPts = Math.abs(o.entry - o.stop);
    o.rewardPts = Math.abs(o.target - o.entry);
    o.rr = o.riskPts > 0 ? o.rewardPts / o.riskPts : null;
  }
  const notes = [];
  const up = Math.abs(m.flowUp1pct ?? 0), dn = Math.abs(m.flowDown1pct ?? 0);
  if (follow && up > 0 && dn / up >= 1.5) notes.push(`Falls get ${(dn / up).toFixed(1)}x more dealer push than rises: the sell stop is the side the hedging favours.`);
  if (follow && dn > 0 && up / dn >= 1.5) notes.push(`Rises get ${(up / dn).toFixed(1)}x more dealer push than falls: the buy stop is the side the hedging favours.`);
  if (Number.isFinite(m.switchPoint) && m.switchPoint > D.p75 && m.switchPoint < U.p75) {
    const dp = m.switchPoint < 10 ? 5 : m.switchPoint < 1000 ? 3 : 2;
    notes.push(`The switch point (${m.switchPoint.toFixed(dp)}) sits inside today's p75 lines: if price crosses it, the hedging state flips and this plan is the wrong one for the rest of the day.`);
  }
  notes.push('First touch only, one trade a day (whichever side triggers first), entries 08:00-20:00 London, flat by 22:00.');
  return { mode: follow ? 'follow' : 'fade', open, lines: { U, D }, orders, notes, evidence: PLAN_EVIDENCE.text };
}

/**
 * Paper-score a plan on the session's 1-minute bars [{t, o, h, l, c, lmin}] (lmin = London minutes since midnight).
 * Whichever order's entry is touched first inside the window is the trade. Stop checked on the entry minute; same
 * minute stop-and-target = stop. Returns { triggered, side, R, exit, minutes } (R net of PLAN_COST).
 */
export function scorePlan(plan, bars) {
  if (!plan || !Array.isArray(bars) || !bars.length) return { triggered: false, reason: 'no bars' };
  const [buy, sell] = [plan.orders.find(o => o.trigger === 'up'), plan.orders.find(o => o.trigger === 'down')];
  let i0 = -1, ord = null;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const hitUp = b.h >= buy.entry, hitDn = b.l <= sell.entry;
    if (!hitUp && !hitDn) continue;
    if (b.lmin < PLAN_WINDOW[0] || b.lmin >= PLAN_WINDOW[1]) return { triggered: false, reason: b.lmin < PLAN_WINDOW[0] ? 'line touched before 08:00' : 'first touch after 20:00' };
    ord = hitUp && !hitDn ? buy : hitDn && !hitUp ? sell : (Math.abs(b.o - buy.entry) <= Math.abs(b.o - sell.entry) ? buy : sell);
    i0 = i;
    break;
  }
  if (!ord) return { triggered: false, reason: 'no p75 touch' };
  const long = ord.side === 'buy';
  let exit = bars.at(-1).c, how = 'close 22:00', at = bars.length - 1;
  for (let i = i0; i < bars.length; i++) {
    const b = bars[i];
    const sHit = long ? b.l <= ord.stop : b.h >= ord.stop;
    const tHit = i > i0 && (long ? b.h >= ord.target : b.l <= ord.target);
    if (sHit) { exit = ord.stop; how = 'stop'; at = i; break; }
    if (tHit) { exit = ord.target; how = 'target'; at = i; break; }
  }
  const pnl = long ? exit - ord.entry : ord.entry - exit;
  const R = ord.riskPts > 0 ? (pnl - PLAN_COST * ord.entry) / ord.riskPts : null;
  return { triggered: true, side: ord.side, type: ord.type, entry: ord.entry, exit, how, R: R == null ? null : +R.toFixed(3), minutes: at - i0 };
}
