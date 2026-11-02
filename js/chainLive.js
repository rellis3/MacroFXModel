// js/chainLive.js — the chain's LIVE window: the last COMPLETED daily close -> now.
//
// Why: the chain's market chips come from daily bars that end at the last completed candle, so on a Monday the "1D"
// gold move was Friday's session while gold was up since Friday's close. Live prices each node from now back to the
// same reference instant (the close of the last completed OANDA daily candle, 17:00 New York):
//   - a market with a live OANDA price: last price vs the last completed daily close  (basis 'live')
//   - US 2Y / 10Y / 30Y and the Bund 10Y: IMPLIED from the bond CFD through js/yieldLegs.js (the last official yield
//     moved by the CFD's price change through a fitted duration)  (basis 'implied')
//   - real yield: the 10Y's implied move, breakevens assumed flat  (basis 'implied, breakevens assumed flat')
//   - dollar: a basket of EUR, JPY, GBP, CAD with ICE DXY weights renormalised  (basis 'implied basket')
//   - Bund − UST gap: implied Bund minus implied UST  (basis 'implied')
// Everything else has no live price and stays at its last print (basis 'last-print', merged in by the page).
// Pure: no fetch, no DOM. Approximate and UNTESTED for the chain: the implied yield drifts ~1-2bp between official
// anchors, which is why macroChain.js floors implied bp nodes at 3bp. Tested by js/chainLive.test.mjs.
import { anchors, priceAt } from './yieldLegs.js';

/** ICE DXY weights of the four dollar legs we can price live (EUR 57.6, JPY 13.6, GBP 11.9, CAD 9.1), sign = dollar direction. */
export const DOLLAR_BASKET = [
  { node: 'eurusd', w: 57.6, sign: -1 },
  { node: 'usdjpy', w: 13.6, sign: +1 },
  { node: 'gbpusd', w: 11.9, sign: -1 },
  { node: 'usdcad', w: 9.1, sign: +1 },
];

/** Close of the last COMPLETED candle's end: candles are stamped by their OPEN, so the close instant is open + one step. */
export const dailyCloseInstant = (lastCompleteOpenEpoch, stepSec = 86400) => lastCompleteOpenEpoch + stepSec;

/** Percent move of a live price against its reference close; null if either is unusable. */
export function pctMove(price, ref) {
  if (!(price > 0) || !(ref > 0)) return null;
  return (price / ref - 1) * 100;
}

/** Dollar basket move in percent from the four legs' { price, ref }; needs all four. Up = the dollar up. */
export function dollarBasketPct(legs) {
  let num = 0, den = 0;
  for (const b of DOLLAR_BASKET) {
    const L = legs?.[b.node];
    if (!L || !(L.price > 0) || !(L.ref > 0)) return null;
    num += b.w * b.sign * Math.log(L.price / L.ref) * 100; den += b.w;
  }
  return num / den;
}

/** The anchor in force at instant t: the latest anchor at or before t. */
export function anchorAt(anc, t) {
  let k = null;
  for (const a of anc) if (a.t <= t && (k == null || a.t > k.t)) k = a;
  return k;
}

/** Implied yield (%) at instant t from a CFD price p, using the anchor in force at t. */
export function impliedYield(anc, D, t, p) {
  const a = anchorAt(anc, t);
  if (!a || !(p > 0) || !(D > 0)) return null;
  return a.y - 100 * Math.log(p / a.p) / D;
}

/**
 * Implied yield move since the reference instant, in bp.
 *   bars   : CFD bars [{t,o,h,l,c}] (open-stamped, step seconds)
 *   official: [{date, value}] official yields (the page's FRED / Bundesbank prints)
 *   fix    : date -> epoch seconds the official value is struck (yieldLegs US_FIX / DE_FIX)
 *   D      : duration; pNow: the CFD price now; now / tRef: epoch seconds
 * Both ends use the anchor in force AT THEIR OWN INSTANT, so an official print landing between tRef and now corrects the
 * live end the way it does on the cog chart, and with no new print the delta is the pure CFD move.
 * Returns { now, ref, deltaBp, anchorNow, anchorRef } or null.
 */
export function liveYieldMove({ bars, step, official, fix, D, pNow, now, tRef }) {
  const anc = anchors(official, bars, step, fix);
  const pRef = priceAt(bars, tRef, step);
  const yNow = impliedYield(anc, D, now, pNow), yRef = impliedYield(anc, D, tRef, pRef);
  if (yNow == null || yRef == null) return null;
  return { now: yNow, ref: yRef, deltaBp: (yNow - yRef) * 100, anchorNow: anchorAt(anc, now)?.t ?? null, anchorRef: anchorAt(anc, tRef)?.t ?? null };
}

/**
 * Assemble the live node map from priced inputs.
 *   markets: { <node>: { price, ref, asOf, closed } }   (OANDA live price and last completed daily close)
 *   yields : { us2y|us10y|us30y|bund10: { now, ref, deltaBp, asOf } }   (liveYieldMove results)
 *   tipsLast: last TIPS print (%) for the real-yield level, optional
 * Returns { <node>: { delta, last, ref, asOf, basis, closed } } with only the nodes that CAN be priced live.
 */
export function buildLiveNodes({ markets = {}, yields = {}, tipsLast = null }) {
  const out = {};
  for (const [node, m] of Object.entries(markets)) {
    const d = pctMove(m?.price, m?.ref);
    if (d == null) continue;
    out[node] = { delta: d, last: m.price, ref: m.ref, asOf: m.asOf ?? null, basis: 'live', closed: !!m.closed };
  }
  for (const k of ['us2y', 'us10y', 'us30y']) {
    const y = yields[k]; if (!y || !Number.isFinite(y.deltaBp)) continue;
    out[k] = { delta: y.deltaBp, last: y.now, ref: y.ref, asOf: y.asOf ?? null, basis: 'implied', closed: !!y.closed };
  }
  const u10 = yields.us10y;
  if (u10 && Number.isFinite(u10.deltaBp)) {
    out.real = { delta: u10.deltaBp, last: tipsLast != null ? tipsLast + u10.deltaBp / 100 : null, ref: null, asOf: u10.asOf ?? null, basis: 'implied, breakevens assumed flat', closed: !!u10.closed };
  }
  const bd = yields.bund10;
  if (bd && u10 && Number.isFinite(bd.deltaBp) && Number.isFinite(u10.deltaBp)) {
    out.bundgap = { delta: bd.deltaBp - u10.deltaBp, last: bd.now - u10.now, ref: bd.ref - u10.ref, asOf: bd.asOf ?? null, basis: 'implied', closed: !!(bd.closed && u10.closed) };
  }
  const legs = Object.fromEntries(DOLLAR_BASKET.map(b => [b.node, markets[b.node]]));
  const dx = dollarBasketPct(legs);
  if (dx != null) out.dxy = { delta: dx, last: null, ref: null, asOf: markets.eurusd?.asOf ?? null, basis: 'implied basket', closed: DOLLAR_BASKET.every(b => markets[b.node]?.closed) };
  return out;
}

/**
 * Page side: the live node map on top of the page's last-print values. A node with no live price keeps its 1-day
 * last-print value tagged basis 'last-print' (shown dated, never judged live).
 */
export function mergeLive(liveNodes, printVals) {
  const out = {};
  for (const [k, v] of Object.entries(printVals ?? {})) {
    if (liveNodes?.[k]) continue;
    out[k] = v ? { ...v, basis: 'last-print' } : null;
  }
  for (const [k, v] of Object.entries(liveNodes ?? {})) out[k] = v;
  return out;
}
