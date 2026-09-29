// js/travelRead.js — "has price actually been travelling in one direction?"
//
// WHY THIS EXISTS. The direction tag's only structural driver was the daily HMM, and
// that HMM separates its two states by RETURN VARIANCE, not by direction — hmm.js says
// so in its own header ("0 = RANGE, small return variance"), and labels the states with
// `rangeState = B[0].sigma <= B[1].sigma`. So "RANGE" means QUIET, not DIRECTIONLESS.
//
// A slow relentless grind is simultaneously the most efficient trend and the least
// volatile tape there is, so a variance classifier is guaranteed to file exactly that
// move under RANGE. On 2026-09-29 USDCHF was +8.45% since March, sitting at 99% of its
// seven-month range with a 20-day efficiency ratio of 0.66, in the 7th percentile of
// volatility — and the card said "HMM daily says RANGE, no structural direction". Eight
// of the fourteen RANGE-labelled instruments were pinned at an extreme of their own
// 3-month range that day, and it was one coherent move: broad dollar strength.
//
// So this brick answers the structural question from price alone. It is DESCRIPTIVE —
// what price HAS done, not what it will do — which puts it in the same evidential class
// as the HMM trend and today's tape, and keeps directionTag's rule intact: a
// non-validated input may subtract confidence but never add it. Nothing here is
// backtested and nothing here is a forecast.
//
// TWO MEASURES, WITH DIFFERENT JOBS:
//
//   position in range  sets the DIRECTION. "Price is at the top of its 3-month range"
//                      needs no statistics to be true or useful.
//   efficiency ratio   sets the WEIGHT. It says HOW price got there — one way, or by
//                      chopping to the edge — and is judged against the value a RANDOM
//                      WALK would produce over the same window, because the raw number
//                      is meaningless without it.
//
// THE RANDOM-WALK BASELINE. For n steps, E|net| = sigma*sqrt(n)*sqrt(2/pi) and
// E[path] = n*sigma*sqrt(2/pi), so the expected ratio is 1/sqrt(n). Over 42 bars that is
// 0.154 — which means an "efficiency ratio of 0.20" is barely distinguishable from noise
// and a bare threshold like that would have been false precision. Everything here is
// expressed as a MULTIPLE of that baseline instead.
//
// Pure: numbers in, plain object out. No DOM, no globals, no fetch.

/** Expected efficiency ratio of a driftless random walk over n steps. */
export const rwEfficiency = n => (n > 0 ? 1 / Math.sqrt(n) : 1);

/** Net travel over total travel. 1 = straight line, ~1/sqrt(n) = coin flips. */
export function efficiency(closes) {
  if (!Array.isArray(closes) || closes.length < 3) return null;
  let path = 0;
  for (let i = 1; i < closes.length; i++) path += Math.abs(closes[i] - closes[i - 1]);
  if (!(path > 0)) return null;
  return Math.abs(closes[closes.length - 1] - closes[0]) / path;
}

/**
 * Read structural travel out of a series of daily closes (OLDEST FIRST).
 *
 * Orientation matters and is not guessable: OANDA v3 returns candles ascending, while
 * /api/ohlc hands back NEWEST first. Passing the wrong way round inverts the answer
 * silently, so callers must pass oldest-first — the same order hmm.js is fitted on.
 *
 * @param {number[]} closes      daily closes, oldest first
 * @param {object}   [o]
 * @param {number}   [o.rangeWin=63]  bars for the range position (~3 months)
 * @param {number}   [o.effWin=42]    bars for the efficiency ratio (~2 months)
 * @param {number}   [o.edge=0.20]    how close to an extreme counts as "at" it
 * @param {number}   [o.minMult=1.15] efficiency must beat the random walk by this much
 * @returns {{dir:'up'|'down'|'flat', pos:number, eff:number, rw:number, mult:number,
 *            weight:number, bars:number, detail:string}|null}
 */
export function travelRead(closes, o = {}) {
  const { rangeWin = 63, effWin = 42, edge = 0.20, minMult = 1.15 } = o;
  const px = (Array.isArray(closes) ? closes : []).filter(v => typeof v === 'number' && isFinite(v));
  // 30 is the floor at which a 3-month position read means anything at all; below it the
  // honest answer is nothing rather than a read off nine bars.
  if (px.length < 30) return null;

  const rw = px.slice(-Math.min(rangeWin, px.length));
  const hi = Math.max(...rw), lo = Math.min(...rw);
  // A dead-flat window (pegged rate, bad feed) has no position to report and would
  // otherwise divide by zero.
  if (!(hi > lo)) return null;
  const last = px[px.length - 1];
  const pos = (last - lo) / (hi - lo);

  const ew = px.slice(-Math.min(effWin + 1, px.length));
  const eff = efficiency(ew);
  if (eff == null) return null;
  const base = rwEfficiency(ew.length - 1);
  const mult = eff / base;

  // Direction comes from position only. Efficiency decides whether it is worth anything.
  const atTop = pos >= 1 - edge, atBottom = pos <= edge;
  const beatsNoise = mult >= minMult;
  const dir = !beatsNoise ? 'flat' : atTop ? 'up' : atBottom ? 'down' : 'flat';

  // Ramp from "no better than a coin flip" to "clean one-way move" over a 0.8x band, so
  // a marginal trend counts for a little and a straight line counts for all of it.
  const weight = dir === 'flat' ? 0 : Math.max(0.15, Math.min(1, (mult - 1) / 0.8));

  const pctPos = Math.round(pos * 100);
  const detail = dir === 'flat'
    ? (atTop || atBottom)
        ? `at ${pctPos}% of its ${rw.length}-bar range, but it chopped there (travel only ${mult.toFixed(2)}x a random walk)`
        : `mid-range at ${pctPos}% of its ${rw.length}-bar range — no structural edge either way`
    : `${pctPos}% of its ${rw.length}-bar range, travelling ${mult.toFixed(2)}x as directly as a random walk`;

  return { dir, pos: +pos.toFixed(4), eff: +eff.toFixed(4), rw: +base.toFixed(4),
           mult: +mult.toFixed(3), weight: +weight.toFixed(3), bars: rw.length, detail };
}
