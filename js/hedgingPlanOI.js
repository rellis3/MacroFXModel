/**
 * DEALER-HEDGING PLAN, OI-LEVEL VERSION. A shadow of js/hedgingPlan.js: same playbook, but the orders sit on the OI map's own levels (walls, zero gamma,
 * max pain, the next wall) instead of the volatility-forecast percentile lines, so the entries are where the hedging actually changes. Pure; no I/O.
 *
 * THE PLAYBOOK (what dealer hedging does, and the way the OI course frames it: Lessons 5 and 6 of the Open Interest series)
 *   • Dealers LONG gamma (price sits above zero gamma, "PIN"): they sell rallies and buy dips, so moves are damped and the big strikes act as edges.
 *       -> FADE the walls: sell the nearest call wall above, buy the nearest put wall below.
 *   • Dealers SHORT gamma (price sits below zero gamma, "BREAKOUT"): they chase, so a move through a big strike is fed, not absorbed.
 *       -> FOLLOW breaks: buy a confirmed break of the nearest call wall, sell a confirmed break of the nearest put wall.
 *   • The wall is where the trade is wrong, so the stop is a small buffer beyond it (a fraction of the day's σ, not a forecast percentile).
 *   • The target is the next structure toward where price is meant to go: another level on the map, at least `minRR` times the risk away.
 *   • A level the day cannot plausibly reach (beyond `reach` σ) is not an order. Fewer, nearer orders: it can actually fill.
 *
 * This is the textbook structure, NOT a validated edge: walls and flips did not beat placebo levels in this repo's own tests (oi_research_book/WALL_PLACEBO_PREREG.md),
 * and the forecast-line version of this plan averaged -0.03R after costs (forge/GAMMA_REGIME_TRADES_PREREG.md). It exists to be paper-scored side by side
 * (forge/HEDGING_PLAN_OI_PREREG.md). Hedging direction also rests on the usual assumption that dealers are long calls and short puts.
 */
export const OI_PLAN = {
  reach: 1.5,        // an entry level must sit within this many day-σ of spot
  buffer: 0.25,      // stop sits this many σ beyond the level (about 0.2% on an index day of ~0.9%)
  trigger: 0.05,     // a follow entry needs the break confirmed this many σ beyond the level
  minRR: 1.0,        // target must be at least this many times the risk away, else the next level is tried
  fallbackσ: 1.0,    // no level far enough: project the target this many σ from entry (labelled projected)
  window: [8 * 60, 20 * 60],   // entries, London minutes
  cost: 0.0001,      // round trip, fraction of price
};

const ENTRY_TYPES = new Set(['call_wall', 'put_wall']);
// levels that can be a TARGET: structure on the map (the edges of the expected move included, they are the day's own range)
const TARGET_TYPES = new Set(['call_wall', 'put_wall', 'zero_gamma', 'gex_flip', 'max_pain', 'gamma_peak', 'short_gamma_node', 'long_gamma_node', 'exp_hi', 'exp_lo']);

/**
 * @param m { spot, sigma (day σ in price units), regime: 'PIN'|'BREAKOUT', levels: [{type, price, label, strength}] }
 * @returns { mode, spot, sigma, orders, skipped, notes } or null
 */
export function buildOiPlan(m, cfg = {}) {
  const C = { ...OI_PLAN, ...cfg };
  if (!m || !(m.spot > 0) || !(m.sigma > 0) || !Array.isArray(m.levels)) return null;
  const { spot, sigma } = m, follow = m.regime === 'BREAKOUT';
  const lv = m.levels.filter(l => Number.isFinite(l.price)).map(l => ({ ...l }));
  const walls = side => lv.filter(l => (side === 'up' ? l.type === 'call_wall' && l.price > spot : l.type === 'put_wall' && l.price < spot))
    .sort((a, b) => Math.abs(a.price - spot) - Math.abs(b.price - spot));
  const orders = [], skipped = [];
  for (const side of ['up', 'down']) {
    const up = side === 'up', dir = up ? 1 : -1;
    const cand = walls(side).filter(l => ENTRY_TYPES.has(l.type));
    const w = cand[0];
    if (!w) { skipped.push({ trigger: side, reason: `no ${up ? 'call' : 'put'} wall ${up ? 'above' : 'below'} spot` }); continue; }
    if (Math.abs(w.price - spot) > C.reach * sigma) { skipped.push({ trigger: side, reason: `${w.label} is ${(Math.abs(w.price - spot) / sigma).toFixed(1)}σ away, beyond reach (${C.reach}σ)` }); continue; }
    let entry, stop, direction, type;
    if (follow) { entry = w.price + dir * C.trigger * sigma; stop = w.price - dir * C.buffer * sigma; direction = up ? 'buy' : 'sell'; type = 'stop'; }
    else { entry = w.price; stop = w.price + dir * C.buffer * sigma; direction = up ? 'sell' : 'buy'; type = 'limit'; }
    const risk = Math.abs(entry - stop);
    // target: the nearest structure beyond the entry in the intended direction (follow: further out; fade: back toward spot), at least minRR x risk away
    const tdir = follow ? dir : -dir;
    const beyond = lv.filter(l => TARGET_TYPES.has(l.type) && l !== w && (tdir > 0 ? l.price > entry : l.price < entry) && Math.abs(l.price - entry) >= C.minRR * risk)
      .sort((a, b) => Math.abs(a.price - entry) - Math.abs(b.price - entry));
    let target, targetName, projected = false;
    if (beyond[0]) { target = beyond[0].price; targetName = beyond[0].label; }
    else { target = entry + tdir * C.fallbackσ * sigma; targetName = `${C.fallbackσ}σ projected`; projected = true; }
    orders.push({ side: direction, type, entry, stop, target, trigger: side, level: w.label, targetName, projected,
      riskPts: risk, rewardPts: Math.abs(target - entry), rr: risk > 0 ? Math.abs(target - entry) / risk : null,
      distSigma: Math.abs(entry - spot) / sigma, riskSigma: risk / sigma });
  }
  if (!orders.length) return { mode: follow ? 'follow' : 'fade', spot, sigma, orders, skipped, notes: ['No wall within reach today: no order.'] };
  const notes = [];
  const zg = lv.find(l => l.type === 'zero_gamma');
  if (zg && orders.some(o => (zg.price - spot) * (o.entry - spot) > 0 && Math.abs(zg.price - spot) < Math.abs(o.entry - spot)))
    notes.push(`Zero gamma (${zg.price}) sits between spot and an entry: if price crosses it the hedging state flips and this plan is the wrong one.`);
  notes.push('First touch only, one trade a day (whichever side triggers first), entries 08:00-20:00 London, flat by 22:00.');
  return { mode: follow ? 'follow' : 'fade', spot, sigma, orders, skipped, notes };
}

/**
 * Paper-score a plan on the session's 1-minute bars [{t,o,h,l,c,lmin}]. Whichever order's entry is touched first inside the window is the trade.
 * Stop is checked on the entry minute; stop and target in the same minute = stop. R is net of the round-trip cost.
 */
export function scoreOiPlan(plan, bars, cfg = {}) {
  const C = { ...OI_PLAN, ...cfg };
  if (!plan?.orders?.length || !Array.isArray(bars) || !bars.length) return { triggered: false, reason: plan?.orders?.length ? 'no bars' : 'no order' };
  const buyish = plan.orders.find(o => o.trigger === 'up'), sellish = plan.orders.find(o => o.trigger === 'down');
  let i0 = -1, ord = null;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const hitUp = buyish && b.h >= buyish.entry, hitDn = sellish && b.l <= sellish.entry;
    if (!hitUp && !hitDn) continue;
    if (b.lmin < C.window[0] || b.lmin >= C.window[1]) return { triggered: false, reason: b.lmin < C.window[0] ? 'level touched before 08:00' : 'first touch after 20:00' };
    ord = hitUp && !hitDn ? buyish : hitDn && !hitUp ? sellish : (Math.abs(b.o - buyish.entry) <= Math.abs(b.o - sellish.entry) ? buyish : sellish);
    i0 = i; break;
  }
  if (!ord) return { triggered: false, reason: 'no entry touched' };
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
  const R = ord.riskPts > 0 ? (pnl - C.cost * ord.entry) / ord.riskPts : null;
  return { triggered: true, side: ord.side, type: ord.type, level: ord.level, entry: ord.entry, exit, how, R: R == null ? null : +R.toFixed(3), minutes: at - i0 };
}
