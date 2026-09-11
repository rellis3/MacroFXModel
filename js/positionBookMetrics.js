/**
 * js/positionBookMetrics.js — turn an OANDA positionBook snapshot into numbers
 * that mean what they say.
 *
 * THE BUG THIS REPLACES. `_worker.js` served /api/oanda_book by counting the
 * BUCKETS where longCountPercent > shortCountPercent and calling that "longPct".
 * On 2026-09-11 every one of EUR_USD, XAU_USD, USD_JPY, GBP_USD and AUD_USD read
 * `longPct: 100, sentiment: "bullish"` — the uniformity-across-unrelated-markets
 * signature this repo has already learned to distrust. The real figures at the
 * same moment were about 62% long for EUR_USD and 73% for gold.
 *
 * Why bucket-counting fails: a book spans the entire price range ever traded.
 * Buckets far from spot hold positions opened years ago and never closed (gold
 * had "long clusters" at 1286 and 1810 against a 4353 spot), and those are almost
 * all longs, so nearly every bucket is long-dominated regardless of what anyone
 * is doing today. The count measures how much abandoned history there is, not
 * sentiment.
 *
 * WHAT THESE PERCENTAGES ARE. Per OANDA's docs, each bucket's longCountPercent /
 * shortCountPercent is that bucket's share of the TOTAL number of positions on
 * the instrument, so summing across buckets gives the long share of the whole
 * book directly. Head COUNTS, not notional — a micro lot and a $10m position each
 * count once. And it is OANDA's retail clients only: not the market, not
 * institutional, not COT.
 *
 * Three reads, each answering a different question:
 *   • crowding  — how one-sided the book is NEAR spot (the abandoned tail is
 *                 excluded by a price window, and reported as `staleShare` so the
 *                 pollution is visible rather than silently discarded)
 *   • pain      — what share of each side is underwater. Crowded AND underwater
 *                 is the setup behind squeezes; crowded and in profit is not
 *   • overhead  — longs sitting ABOVE spot are sellers waiting for break-even, a
 *                 mechanical reason rallies stall at prior congestion (and the
 *                 mirror for shorts below spot)
 *
 * All of it is CONTEXT. Nothing here has been tested against forward returns;
 * the folklore that retail is always wrong is a claim, not a finding, and this
 * module makes no attempt to turn it into one.
 */

export const DEFAULT_WINDOW_PCT = 0.10;   // ±10% of spot — wide enough for gold's swings, tight enough to drop 2019's positions

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const pct = (a, b) => (a + b) > 0 ? +(100 * a / (a + b)).toFixed(1) : null;

/**
 * @param pb   the `positionBook` object from OANDA: { price, bucketWidth, buckets, time }
 * @returns    null when there is nothing to summarise, never a fake neutral
 */
export function summarisePositionBook(pb, { windowPct = DEFAULT_WINDOW_PCT } = {}) {
  const spot = num(pb?.price);
  const buckets = Array.isArray(pb?.buckets) ? pb.buckets : [];
  if (!(spot > 0) || !buckets.length) return null;

  let allL = 0, allS = 0;               // whole book
  let nearL = 0, nearS = 0, nearN = 0;  // within the window of spot
  let longAbove = 0, shortBelow = 0;    // underwater / break-even overhead, whole book
  let nearLongAbove = 0, nearShortBelow = 0;

  for (const b of buckets) {
    const p = num(b.price), l = num(b.longCountPercent), s = num(b.shortCountPercent);
    if (!(p > 0) || (l === 0 && s === 0)) continue;
    allL += l; allS += s;
    if (p > spot) longAbove += l; else if (p < spot) shortBelow += s;
    if (Math.abs(p - spot) / spot <= windowPct) {
      nearL += l; nearS += s; nearN++;
      if (p > spot) nearLongAbove += l; else if (p < spot) nearShortBelow += s;
    }
  }
  const allTotal = allL + allS;
  if (allTotal <= 0) return null;

  const nearTotal = nearL + nearS;
  // Share of all position mass that sits OUTSIDE the window -- i.e. how much of
  // this book is abandoned history. Reported so a reader (and the AI) can see how
  // polluted the raw figure is instead of being handed a clean-looking number.
  const staleShare = +(100 * (1 - nearTotal / allTotal)).toFixed(1);

  const near = nearTotal > 0
    ? { longPct: pct(nearL, nearS), shortPct: pct(nearS, nearL), buckets: nearN, positionsShare: +(100 * nearTotal / allTotal).toFixed(1) }
    : null;

  const crowd = near?.longPct ?? pct(allL, allS);   // fall back to the whole book if the window is empty, and say so below
  const sentiment = crowd == null ? 'unknown' : crowd >= 60 ? 'crowded long' : crowd <= 40 ? 'crowded short' : 'balanced';

  return {
    spot,
    time: pb.time ?? null,
    bucketWidth: num(pb.bucketWidth) || null,
    windowPct,
    // Crowding, near spot. THE number the old route was trying to be.
    longPct: crowd,
    shortPct: crowd == null ? null : +(100 - crowd).toFixed(1),
    sentiment,
    usedWindow: near != null,
    near,
    // The whole-book figure, kept for comparison: the gap between this and `near`
    // IS the pollution.
    all: { longPct: pct(allL, allS), shortPct: pct(allS, allL), buckets: buckets.length },
    staleShare,
    // Pain: share of each side that is underwater, whole book and near spot.
    pain: {
      longsUnderwaterPct: allL > 0 ? +(100 * longAbove / allL).toFixed(1) : null,
      shortsUnderwaterPct: allS > 0 ? +(100 * shortBelow / allS).toFixed(1) : null,
      nearLongsUnderwaterPct: nearL > 0 ? +(100 * nearLongAbove / nearL).toFixed(1) : null,
      nearShortsUnderwaterPct: nearS > 0 ? +(100 * nearShortBelow / nearS).toFixed(1) : null,
    },
    // Break-even overhead: the same longs-above-spot number, named for what it does
    // to price rather than what it does to the holder.
    overhead: {
      longsAboveSpotPct: allL > 0 ? +(100 * longAbove / allL).toFixed(1) : null,
      shortsBelowSpotPct: allS > 0 ? +(100 * shortBelow / allS).toFixed(1) : null,
    },
    // Head counts, retail only, standing book, 0-20 min stale. Carried on the
    // payload so no consumer can quietly forget it.
    caveats: 'OANDA retail head-counts (not notional, not the market, not COT); standing book on a 20-minute grid, 0-20 min stale; CONTEXT only, untested against forward returns',
  };
}

/** The old bucket-count metric, kept ONLY so the two can be compared in tests. */
export function legacyBucketCount(pb) {
  let longDom = 0, shortDom = 0;
  for (const b of pb?.buckets ?? []) {
    const lp = num(b.longCountPercent), sp = num(b.shortCountPercent);
    if (lp > sp + 0.1) longDom++; else if (sp > lp + 0.1) shortDom++;
  }
  const total = longDom + shortDom || 1;
  return Math.round(longDom / total * 100);
}
