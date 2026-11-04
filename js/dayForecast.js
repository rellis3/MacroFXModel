/**
 * Phase 3's day-forecast writer (plans/DESK_ANALYST_PIPELINE.md §9aa). After the morning book, one model call
 * (desk/roles/day_forecaster.md) calls the shape of the day for the main markets; the evening scores it. It never
 * changes the book and is not part of the pre-registered test: it is scored descriptively against base rates.
 *
 * For each market, three calls, all on 08:00 to 21:00 London (the scored window):
 *   range     narrow | normal | wide: the day's high-to-low against the market's own ladder that morning. Narrow is
 *             inside the p50 lines' span (up p50 minus down p50), wide is beyond the p75 span, normal between.
 *   type      trend | range: a trend day closes at least half its high-to-low range away from where it opened.
 *   extremes  london | ny | split: whether both the day's high and low were set in London hours (08:00-13:00), both
 *             in New York hours (13:00-21:00), or one in each.
 *
 * Pure. Tested in js/dayForecast.test.mjs.
 */
import { windowFor, londonMs } from './deskScore.js';

export const DAY_MARKETS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'EURJPY', 'GOLD', 'NQ', 'SPX500', 'DE30', 'WTI'];
const RANGE = ['narrow', 'normal', 'wide'], TYPE = ['trend', 'range'], EXT = ['london', 'ny', 'split'];

/** What the day did, for one market. bars: M1 { time (s), open, high, low, close }; levels: the card's ladder. */
export function realisedShape(bars, levels, date) {
  const { entryMs, exitMs } = windowFor(date), split = londonMs(date, 13);
  const w = (bars ?? []).filter(b => b.time * 1000 >= entryMs && b.time * 1000 < exitMs);
  if (w.length < 30 || !levels?.up?.p50 || !levels?.down?.p50 || !levels?.up?.p75 || !levels?.down?.p75) return null;
  let hi = -Infinity, lo = Infinity, hiT = 0, loT = 0;
  for (const b of w) { if (b.high > hi) { hi = b.high; hiT = b.time * 1000; } if (b.low < lo) { lo = b.low; loT = b.time * 1000; } }
  const o = w[0].open, c = w.at(-1).close, rng = hi - lo, p50 = levels.up.p50 - levels.down.p50, p75 = levels.up.p75 - levels.down.p75;
  return {
    range: rng < p50 ? 'narrow' : rng > p75 ? 'wide' : 'normal',
    type: rng > 0 && Math.abs(c - o) / rng >= 0.5 ? 'trend' : 'range',
    extremes: hiT < split && loT < split ? 'london' : hiT >= split && loT >= split ? 'ny' : 'split',
    detail: { range: +rng.toPrecision(6), p50Span: +p50.toPrecision(6), p75Span: +p75.toPrecision(6), bodyShare: rng > 0 ? +(Math.abs(c - o) / rng).toFixed(2) : null },
  };
}

const str = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
/** The writer's reply: { headline, markets: { INST: { range, type, extremes, confidence, why } } }. */
export function validateDayForecast(obj, markets = DAY_MARKETS) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['reply is not a JSON object'] };
  const out = {};
  for (const n of markets) {
    const m = obj.markets?.[n]; if (!m) continue;
    const f = { range: RANGE.includes(m.range) ? m.range : null, type: TYPE.includes(m.type) ? m.type : null, extremes: EXT.includes(m.extremes) ? m.extremes : null,
      confidence: ['low', 'medium', 'high'].includes(m.confidence) ? m.confidence : 'low', why: str(m.why, 300) ?? '' };
    if (f.range || f.type || f.extremes) out[n] = f;
  }
  if (Object.keys(out).length < Math.ceil(markets.length / 2)) return { ok: false, errors: [`calls for only ${Object.keys(out).length} of ${markets.length} markets`] };
  return { ok: true, value: { headline: str(obj.headline, 240) ?? '', markets: out } };
}

/** The day's score: hits per field, and per market what was called against what happened. */
export function scoreDayForecast(forecast, realised) {
  const rows = [], hits = { range: [0, 0], type: [0, 0], extremes: [0, 0] };
  for (const [n, f] of Object.entries(forecast?.markets ?? {})) {
    const r = realised?.[n]; if (!r) continue;
    const row = { inst: n };
    for (const k of ['range', 'type', 'extremes']) if (f[k]) { const hit = f[k] === r[k]; hits[k][0] += hit ? 1 : 0; hits[k][1] += 1; row[k] = { called: f[k], was: r[k], hit }; }
    rows.push(row);
  }
  const share = ([h, n]) => (n ? +(h / n).toFixed(2) : null);
  return { markets: rows.length, hits: { range: { hit: hits.range[0], of: hits.range[1], share: share(hits.range) }, type: { hit: hits.type[0], of: hits.type[1], share: share(hits.type) }, extremes: { hit: hits.extremes[0], of: hits.extremes[1], share: share(hits.extremes) } }, rows };
}

/**
 * The running record against two base rates: chance (1/3, 1/2, 1/3) and "always the most common outcome so far"
 * (from the realised outcomes in the record). days: [{ score, realised }].
 */
export function dayForecastRecord(days) {
  const counts = { range: {}, type: {}, extremes: {} }, tot = { range: [0, 0], type: [0, 0], extremes: [0, 0] };
  for (const d of days ?? []) {
    for (const k of Object.keys(tot)) { tot[k][0] += d.score?.hits?.[k]?.hit ?? 0; tot[k][1] += d.score?.hits?.[k]?.of ?? 0; }
    for (const r of Object.values(d.realised ?? {})) for (const k of Object.keys(counts)) if (r?.[k]) counts[k][r[k]] = (counts[k][r[k]] ?? 0) + 1;
  }
  const out = {};
  for (const k of Object.keys(tot)) {
    const n = Object.values(counts[k]).reduce((a, b) => a + b, 0), top = Object.entries(counts[k]).sort((a, b) => b[1] - a[1])[0];
    out[k] = { hit: tot[k][0], of: tot[k][1], share: tot[k][1] ? +(tot[k][0] / tot[k][1]).toFixed(2) : null, chance: k === 'type' ? 0.5 : 0.33, mostCommon: top ? { outcome: top[0], share: +(top[1] / n).toFixed(2) } : null };
  }
  return { days: (days ?? []).length, ...out };
}
