/**
 * Grade-Level v2 — the single live grader: turn a session-fib range ladder + the
 * current intraday path into GRADED entries, using the frozen offline policy.
 *
 * This is the live mirror of rangeLineAnalyser.analyseRangeWindow: it builds the
 * SAME ladder, finds levels near the current price, derives each level's side +
 * inner/outer triple-barrier neighbours, computes the SAME approachVel bucket via
 * the shared touchFeatures brick, then asks levelConfidenceCore.decide() what the
 * frozen per-cell expectancy policy says. Same ladder + same feature + same cell
 * key ⇒ the live grade equals the backtested grade by construction.
 *
 * Live↔offline asymmetry (documented honestly): offline scores approachVel at the
 * actual first-touch bar within a completed session; live scores it at "now", as
 * price comes within proximity of the level. Same code computes the bucket, so the
 * cell key is faithful; the approach window is the closest live analogue of a touch.
 *
 * Pure given its inputs (bars/ladders/policy/tf passed in). No network, no DOM.
 * Reuses: rangeLineAnalyser.buildRangeLadder, touchFeatures, levelConfidenceCore.
 */

import { buildRangeLadder } from './rangeLineAnalyser.js';
import { decide } from './levelConfidenceCore.js';

// Inner = next ladder price toward the range mid (TP for a fade); outer = next away
// (SL for a fade). Identical neighbour rule to analyseRangeWindow.
function neighbours(prices, level, side) {
  let belowP = null, aboveP = null;
  for (const p of prices) {
    if (p < level - 1e-12) belowP = p;
    else if (p > level + 1e-12 && aboveP == null) aboveP = p;
  }
  return side === 'up' ? { inner: belowP, outer: aboveP } : { inner: aboveP, outer: belowP };
}

/**
 * Grade every near-price level across one or more session ladders.
 *
 * args:
 *   ladders : [{ srcTag, low, high }] — Asia ('A') / Monday ('M') body ranges.
 *             Pass the raw range; this builds the level grid itself (shared builder).
 *   bars    : the current session's intraday path [{time,high,low,close,open}],
 *             oldest-first. The last bar is "now".
 *   open    : session open (for approachVel σ-units).
 *   sigma   : daily σ for this session (forecastCore.volSigmaSeries), for vel units.
 *   pip     : pip size (instrumentRegistry).
 *   price   : current price.
 *   proxDist: only grade levels within this price distance of `price`.
 *   tf      : a createTouchFeatures(...) instance (shared brick).
 *   policy  : frozen per-cell policy (from the offline learner).
 *   condFields : condition fields forming the cell key (default ['approachVel']).
 *   opts    : { bands } forwarded to decide().
 *
 * Returns graded entries (action:'enter'), sorted by expectancy desc. `includeSkips`
 * also returns the skipped/near levels (for the dashboard's "why not" view).
 */
export function gradeLevelV2(args) {
  const { ladders = [], bars = [], open, sigma = 0, pip = 0, price, proxDist = Infinity,
          tf = null, policy = {}, condFields = ['approachVel'], includeSkips = false, opts = {} } = args;
  if (!bars.length || price == null) return includeSkips ? { entries: [], skips: [] } : [];

  const touchIdx = bars.length - 1;          // "now" is the touch for the live approach
  const wt1 = tf ? tf.wtSeries(bars) : null;
  const entries = [], skips = [];

  for (const lad of ladders) {
    const grid   = buildRangeLadder(lad.low, lad.high - lad.low, lad.srcTag);
    const prices = grid.map(g => g.level);   // sorted ascending
    const mid    = (lad.low + lad.high) / 2;

    for (const g of grid) {
      const level = g.level;
      if (Math.abs(level - price) > proxDist) continue;     // not near → not actionable now
      const side = level > mid ? 'up' : 'dn';
      const { inner, outer } = neighbours(prices, level, side);
      if (inner == null || outer == null) continue;          // extreme line, no barrier

      // Same approachVel bucket the offline cell was keyed on.
      let condKey = 'na';
      if (tf) {
        const f = tf.compute({ bars, touchIdx, open, sigma, side, wt1, level, pip });
        condKey = condFields.map(c => f[c]?.bucket ?? 'na').join('|');
      }
      if (condKey.includes('na')) continue;                  // missing a gating condition

      const touch = { name: g.label, side, condKey, level, inner, outer };
      const d = decide(touch, policy, opts);

      if (d.action !== 'enter') { if (includeSkips) skips.push({ ...touch, ...d }); continue; }

      entries.push({
        srcTag:     lad.srcTag,
        fib:        g.fibL,
        price:      +level.toFixed(6),
        direction:  d.direction,
        decision:   d.decision,
        grade:      d.grade,
        verdict:    d.verdict,
        expectancy: d.expectancy,
        n:          d.n,
        revRate:    d.revRate,
        confidence: d.confidence,
        sl:         d.sl,
        tp:         d.tp,
        rrRatio:    d.rr,
        cell:       d.cell,
        reasons:    d.reasons,
        warnings:   d.warnings,
        tags:       [`${lad.srcTag === 'A' ? 'Asia' : 'Monday'} Fib ${g.fibL}`, d.decision],
      });
    }
  }

  entries.sort((a, b) => b.expectancy - a.expectancy);
  return includeSkips ? { entries, skips } : entries;
}
