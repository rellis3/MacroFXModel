/**
 * The vol forecast against what happened, for the Desk Terminal (plans/DESK_ANALYST_PIPELINE.md §9r, vol chart).
 *
 * The forecast's high-to-low range is for the London day: from the first H1 bar at or after London midnight to the
 * next London midnight, as a percent of that open (js/volForecastScheduler.js fetchMidnightAnchoredBar). The realised
 * range here is built the same way from H1 bars, so the two are the same quantity. A well-calibrated p50 is exceeded
 * on about half the days and the p75 on about a quarter.
 *
 * Pure. Tested in js/volCheck.test.mjs.
 */
import { londonMs } from './deskScore.js';

const nextDate = d => new Date(Date.parse(`${d}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);

/** Realised London-day ranges from H1 bars ({ time: sec, open, high, low, close }) for the given dates. */
export function realisedDays(bars, dates) {
  const out = {};
  for (const d of dates) {
    const a = londonMs(d, 0) / 1000, b = londonMs(nextDate(d), 0) / 1000;
    const w = (bars ?? []).filter(x => x.time >= a && x.time < b);
    if (w.length < 6) continue;   // a holiday or a gap: not a full London day
    const open = w[0].open, hi = Math.max(...w.map(x => x.high)), lo = Math.min(...w.map(x => x.low)), close = w.at(-1).close;
    if (!(open > 0)) continue;
    out[d] = { hl: +((hi - lo) / open * 100).toFixed(3), oc: +(Math.abs(close - open) / open * 100).toFixed(3), bars: w.length };
  }
  return out;
}

/** Each day's forecast against its realised range, and the coverage. forecasts: { date: { hl_median, hl_75 } }. */
export function compare(forecasts, realised) {
  const rows = Object.keys(forecasts).sort().filter(d => realised[d] && Number.isFinite(forecasts[d]?.hl_median) && Number.isFinite(forecasts[d]?.hl_75))
    .map(d => { const f = forecasts[d], r = realised[d]; return { date: d, p50: f.hl_median, p75: f.hl_75, hl: r.hl, over50: r.hl > f.hl_median, over75: r.hl > f.hl_75, ratio: +(r.hl / f.hl_median).toFixed(2) }; });
  const n = rows.length, share = k => (n ? +(rows.filter(r => r[k]).length / n).toFixed(2) : null);
  const ratios = rows.map(r => r.ratio).sort((a, b) => a - b);
  return { rows, n, over50: share('over50'), over75: share('over75'), medianRatio: n ? ratios[n >> 1] : null, targets: { over50: 0.5, over75: 0.25 } };
}
