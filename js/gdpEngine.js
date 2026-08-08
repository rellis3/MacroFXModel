// js/gdpEngine.js — GDP / Growth Numeric-Composition Engine.
//
// Same shape and philosophy as js/laborMarketEngine.js and js/cpiEngine.js:
// a pure numeric score built from FRED series, not a text-reading engine.
//
// UNLIKE CPI (which had a real unit mismatch between USD's index-level
// series and the other 7 currencies' pre-computed YoY% series), GDP uses
// ONE uniform series family across all 8 currencies: OECD's `NAEXKP01`
// ("National Accounts: GDP by Expenditure: Constant Prices: Total"),
// `{cc}Q657S` suffix = "Growth rate previous period, Seasonally Adjusted"
// — quarter-over-quarter, NOT annualized. This deliberately uses the OECD
// series for USD too (`NAEXKP01USQ657S`) rather than the more commonly
// headlined BEA annualized print (`GDPC1`/`A191RL1Q225SBEA`) — the US
// convention of annualizing QoQ growth (compounding to an implied annual
// rate) is NOT directly comparable to the other 7 currencies' raw QoQ
// prints, and mixing methodologies would produce a currency-strength
// comparison that looks meaningful but silently isn't. One series family,
// one methodology, genuinely comparable across the board — worth the
// tradeoff of reporting a less commonly-quoted number for USD.
//
// EUR uses Germany (`NAEXKP01DEQ657S`), consistent with ECON_UNIVERSE's
// existing EUR-via-Germany convention for rate/y10/unemp/CPI.
//
// Series verified via web search (all 8, including a live-updating check
// on JPY/CHF/NZD showing recent real prints) — this sandbox can't reach
// api.stlouisfed.org directly, same constraint as every other fetch module
// here; re-verify the first time this actually runs against FRED.
import { fetchFredObservations } from './zscoreSpreadEngine.js';

export const GDP_UNIVERSE = {
  USD: 'NAEXKP01USQ657S',
  EUR: 'NAEXKP01DEQ657S',
  GBP: 'NAEXKP01GBQ657S',
  JPY: 'NAEXKP01JPQ657S',
  AUD: 'NAEXKP01AUQ657S',
  CAD: 'NAEXKP01CAQ657S',
  CHF: 'NAEXKP01CHQ657S',
  NZD: 'NAEXKP01NZQ657S',
};

// ── Pure stats helpers (identical shape to laborMarketEngine.js's) ─────────

export function toSeries(obsMap) {
  if (!obsMap) return [];
  return [...obsMap.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
}

export function latestZScore(values, lookback = 12, minBaseline = 6) {
  const clean = values.filter(v => v != null && Number.isFinite(v));
  if (clean.length < minBaseline + 1) return null;
  const latest = clean.at(-1);
  const baseline = clean.slice(Math.max(0, clean.length - 1 - lookback), clean.length - 1);
  if (baseline.length < minBaseline) return null;
  const mean = baseline.reduce((s, v) => s + v, 0) / baseline.length;
  const variance = baseline.reduce((s, v) => s + (v - mean) ** 2, 0) / baseline.length;
  const sd = Math.sqrt(variance);
  const flatFloor = Math.max(1e-9, Math.abs(mean) * 1e-9);
  if (sd < flatFloor) return Math.abs(latest - mean) < flatFloor ? 0 : (latest > mean ? 4 : -4);
  return +((latest - mean) / sd).toFixed(2);
}

const clip = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));
const zToScore = z => (z == null ? null : clip(z / 2.5));

// ── Composite ────────────────────────────────────────────────────────────

// Growth trend: is the latest QoQ print running hot or cold relative to
// its OWN trailing history — same "relative cycle strength" framing as
// labor market's unemployment/participation trend, just applied to growth
// directly rather than needing a sign flip. A shorter 12-quarter (~3yr)
// lookback than CPI/labor's 24-point default — quarterly cadence means 24
// points would reach back 6 years, diluting "recent" past the point of
// being a useful comparison base.
//
// `recessionFlag` is the standard, widely-understood "two consecutive
// quarters of negative growth" technical-recession framing — reported
// alongside the z-score rather than folded into it, since it's a binary,
// universally-recognized signal a reader looks for directly regardless of
// how unusual the print is relative to its own history.
// Raw OECD values arrive with long floating-point tails (e.g.
// 0.518254492928838) — round to 2dp for anything surfaced as a headline
// "latest" reading; the underlying z-score math still runs on the raw value.
const round2 = v => (v == null ? null : +v.toFixed(2));

export function gdpScore(obsMap) {
  const series = toSeries(obsMap);
  const latest = series.at(-1);
  const prev = series.at(-2);
  if (series.length < 8) return { latestGrowth: round2(latest?.value), latestDate: latest?.date ?? null, z: null, score: null, recessionFlag: false };
  const z = latestZScore(series.map(p => p.value));
  const recessionFlag = latest?.value < 0 && prev?.value < 0;
  return { latestGrowth: round2(latest?.value), latestDate: latest?.date ?? null, z, score: zToScore(z), recessionFlag };
}

// Fetch the one configured series for one currency. Never throws — a
// failed fetch just reports via availability, same pattern as every other
// engine here.
export async function fetchGdpData(ccy, fredKey, fromDate = '1995-01-01') {
  const seriesId = GDP_UNIVERSE[ccy];
  if (!seriesId) throw new Error(`No GDP series configured for ${ccy}`);
  try {
    const obs = await fetchFredObservations(seriesId, fromDate, fredKey);
    return { data: obs, availability: [{ series: seriesId, n: obs.size }] };
  } catch (e) {
    return { data: null, availability: [{ series: seriesId, n: 0, error: e.message }] };
  }
}
