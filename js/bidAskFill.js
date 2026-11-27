/**
 * Bid/ask bracket fill — prices one bracket trade (entry order + fixed stop and
 * target) on 1-minute BID and ASK bars instead of mid prices.
 *
 * Built 2026-11-01 for atlas-honest-gonogo (forge/ATLAS_HONEST_GONOGO_PREREG.md).
 * The Atlas backtests fill every entry and exit exactly at the level on mid
 * prices. That ignores the spread, a limit that is touched but never traded
 * through, and stops that gap past their level. On random-walk data the
 * exact-level assumption alone was worth +0.12R per trailed winner
 * (js/atlasNullCheck.js), so it is not a rounding error.
 *
 * Conventions (all conservative, fixed before any real-data run):
 *   - The order rests at `level` from `startIdx` (the bar the mid touched it).
 *   - LIMIT entry (a fade): fills at `level` only when the opposite side trades
 *     THROUGH it — a buy limit needs ask low < level, a sell limit bid high > level.
 *     No price improvement is credited.
 *   - STOP entry (a follow): a buy stop triggers when ask high >= level and fills
 *     at max(level, ask open); a sell stop when bid low <= level, at min(level, bid open).
 *   - Exits are bracket orders at prices fixed from `level` (not the fill price),
 *     as the live bots place them. A long exits on the BID, a short on the ASK.
 *     Stop: long when bid low <= stop, at min(stop, bid open); short when ask high
 *     >= stop, at max(stop, ask open). Target is a limit and needs trade-through:
 *     long when bid high > target, short when ask low < target.
 *   - If a bar reaches both, the stop is taken. On the fill bar the target is not
 *     credited (the order of that bar's prices is unknown) but the stop is, at the
 *     stop price.
 *   - Not stopped or targeted by `endIdx`: flattened at that bar's close on the
 *     exit side (bid for a long, ask for a short).
 *   - R = (exit - entry) x direction / stopDist, so the spread and any gap appear
 *     in R. `commission` (price units, round trip) is subtracted; 0 for the OANDA
 *     spread-only account.
 *
 *   d = { times, bid_o, bid_h, bid_l, bid_c, ask_o, ask_h, ask_l, ask_c } (parallel arrays)
 *   priceBracketBidAsk(d, { startIdx, endIdx, dir: 1|-1, entryType: 'limit'|'stop',
 *                           level, stopDist, targetDist, commission })
 *     -> { filled:false } | { filled:true, fillIdx, entryPx, exitIdx, exitPx, why:'stop'|'target'|'close', r, spreadAtFill }
 */
export function priceBracketBidAsk(d, { startIdx, endIdx, dir, entryType, level, stopDist, targetDist, commission = 0 }) {
  if (!(stopDist > 0) || !(targetDist > 0) || !(dir === 1 || dir === -1)) return { filled: false, invalid: true };
  const last = Math.min(endIdx, d.times.length - 1);
  let fillIdx = -1, entryPx = null;
  for (let k = startIdx; k <= last; k++) {
    if (entryType === 'limit') {
      if (dir === 1 ? d.ask_l[k] < level : d.bid_h[k] > level) { fillIdx = k; entryPx = level; break; }
    } else {
      if (dir === 1 ? d.ask_h[k] >= level : d.bid_l[k] <= level) {
        fillIdx = k;
        entryPx = dir === 1 ? Math.max(level, d.ask_o[k]) : Math.min(level, d.bid_o[k]);
        break;
      }
    }
  }
  if (fillIdx < 0) return { filled: false };
  const stop = level - dir * stopDist, target = level + dir * targetDist;
  const spreadAtFill = d.ask_c[fillIdx] - d.bid_c[fillIdx];
  const done = (exitIdx, exitPx, why) => ({
    filled: true, fillIdx, entryPx, exitIdx, exitPx, why,
    r: ((exitPx - entryPx) * dir - commission) / stopDist, spreadAtFill,
  });
  for (let k = fillIdx; k <= last; k++) {
    const onFill = k === fillIdx;
    if (dir === 1) {
      if (d.bid_l[k] <= stop) return done(k, onFill ? Math.min(stop, entryPx) : Math.min(stop, d.bid_o[k]), 'stop');
      if (!onFill && d.bid_h[k] > target) return done(k, target, 'target');
    } else {
      if (d.ask_h[k] >= stop) return done(k, onFill ? Math.max(stop, entryPx) : Math.max(stop, d.ask_o[k]), 'stop');
      if (!onFill && d.ask_l[k] < target) return done(k, target, 'target');
    }
  }
  return done(last, dir === 1 ? d.bid_c[last] : d.ask_c[last], 'close');
}

/**
 * Retest fade — the entry from the owner's "ForecastBandFade" sheet (2026-11-27):
 * never fade the touch itself. Arm a stop order at the line once price has
 * overshot it, and fill only when price comes back through the line.
 *
 *   1. Arm: price (mid high for a short, mid low for a long) goes at least
 *      `armFrac` x stopDist past the line, from `startIdx` on. Nothing is traded.
 *   2. Fill: from the bar AFTER the arm bar, a sell stop at the line triggers when
 *      bid low <= level (fills at min(level, bid open)); a buy stop when
 *      ask high >= level (at max(level, ask open)). The arm bar itself never
 *      fills, because the order of its prices is unknown.
 *   3. Cancel: before the fill, price (mid) reaching `cancelDist` past the line
 *      withdraws the order — no trade. The caller passes the nearer of the
 *      sheet's 1.2 x stopDist and the next line out (the sheet's "chase": the
 *      next line's own touch is a separate candidate). A bar that reaches both
 *      the cancel and the line is booked conservatively: filled at the line and
 *      stopped at the stop price.
 *   4. After the fill the bracket is managed exactly as `priceBracketBidAsk`
 *      (stop/target fixed from the line, target not credited on the fill bar,
 *      flattened at `endIdx`).
 *
 * `dir` is the TRADE direction: -1 shorts a line touched from below (an upper
 * band), +1 buys a line touched from above. Mid = (bid + ask) / 2.
 *
 *   priceRetestFadeBidAsk(d, { startIdx, endIdx, dir, level, stopDist, targetDist,
 *                              armFrac = 0.1, cancelDist = 1.2 * stopDist, commission })
 *     -> { filled:false, armed, armIdx?, cancelled? } | priceBracketBidAsk's filled result + { armIdx }
 */
export function priceRetestFadeBidAsk(d, { startIdx, endIdx, dir, level, stopDist, targetDist, armFrac = 0.1, cancelDist = null, commission = 0 }) {
  if (!(stopDist > 0) || !(targetDist > 0) || !(dir === 1 || dir === -1)) return { filled: false, invalid: true };
  const cancel = cancelDist > 0 ? cancelDist : 1.2 * stopDist;
  const last = Math.min(endIdx, d.times.length - 1);
  const away = -dir;   // the overshoot runs against the trade
  const beyond = k => (away === 1 ? (d.bid_h[k] + d.ask_h[k]) / 2 - level : level - (d.bid_l[k] + d.ask_l[k]) / 2);
  let armIdx = -1;
  for (let k = startIdx; k <= last; k++) if (beyond(k) >= armFrac * stopDist) { armIdx = k; break; }
  if (armIdx < 0) return { filled: false, armed: false };
  if (beyond(armIdx) >= cancel) return { filled: false, armed: true, armIdx, cancelled: true };
  for (let k = armIdx + 1; k <= last; k++) {
    const hit = dir === 1 ? d.ask_h[k] >= level : d.bid_l[k] <= level;
    const cancelled = beyond(k) >= cancel;
    if (hit && cancelled) {
      const entryPx = dir === 1 ? Math.max(level, d.ask_o[k]) : Math.min(level, d.bid_o[k]);
      const exitPx = level - dir * stopDist;
      return { filled: true, armIdx, fillIdx: k, entryPx, exitIdx: k, exitPx, why: 'stop', r: ((exitPx - entryPx) * dir - commission) / stopDist, spreadAtFill: d.ask_c[k] - d.bid_c[k], sameBarCancel: true };
    }
    if (cancelled) return { filled: false, armed: true, armIdx, cancelled: true };
    if (hit) return { ...priceBracketBidAsk(d, { startIdx: k, endIdx: last, dir, entryType: 'stop', level, stopDist, targetDist, commission }), armIdx };
  }
  return { filled: false, armed: true, armIdx, cancelled: false };
}
