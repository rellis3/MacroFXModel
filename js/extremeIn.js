/**
 * "This running high / low is in" probability — SHADOW module (forge/LIVE_RANGE_SHADOW_PREREG.md, part 1).
 *
 * P(the day's final high exceeds the running high by <= 0.05 sigma) from hour, range used and price's pullback from the extreme,
 * as a count table (fitted in the page's own sigma basis, shrunk toward coarser cells). Validated walk-forward in
 * analysis/output/live_range_shadow/RESULTS_p1.md: Brier skill +21% (FX/gold) / +18% (indices) over the hour x used x pace base rate,
 * largest decile gap 0.3pp / 1.4pp. A take-profit / stand-aside read, never a direction. Pure (browser + node).
 */
import { EXTREME_IN_PARAMS } from './extremeInParams.js';
import { classOf } from './intradayRange.js';

const bin = (d, edges) => { let n = 0; for (const e of edges) if (d >= e) n++; return n; };    // = numpy.digitize(d, edges)

/** class key used by the table: reuse the intraday engine's own instrument -> class mapping. */
export function extremeClass(instrument) { return classOf(instrument) ?? null; }

/**
 * @param st { h, runHigh, runLow, close }  state at hour h (bars before h; close = last close before h, or live)
 * @returns { pHigh, pLow, dHigh, dLow, used } or null when there is no table for this class / hour
 */
export function extremeIn(st, { instrument, open, sigmaDailyPct, params = EXTREME_IN_PARAMS }) {
  const cls = extremeClass(instrument);
  const C = cls && params.classes?.[cls];
  const h = st.h;
  const P = C?.p?.[String(h)], ue = C?.used_edges?.[String(h)];
  if (!P || !ue || !(sigmaDailyPct > 0) || !(open > 0)) return null;
  const unit = sigmaDailyPct / 100 * open;
  const used = (st.runHigh - st.runLow) / unit;
  const ut = used < ue[0] ? 0 : used < ue[1] ? 1 : 2;
  const dHigh = Math.max(0, (st.runHigh - st.close) / unit), dLow = Math.max(0, (st.close - st.runLow) / unit);
  return { pHigh: P[bin(dHigh, params.d_edges)][ut], pLow: P[bin(dLow, params.d_edges)][ut], dHigh, dLow, used };
}

/** Plain-English read of one probability. */
export function readIn(p, what) {
  if (p == null) return '—';
  return p >= 0.8 ? `${what} probably in` : p <= 0.4 ? `${what} still live` : `${what} open`;
}
