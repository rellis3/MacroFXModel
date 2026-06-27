/**
 * Bar Utils — the M1 packed-array baseplate brick. Binary-search extraction,
 * timeframe resampling, body ranges and a resampled-ATR, lifted out of the THREE
 * places that each kept a private, byte-for-byte copy: asiaRangeEngine.js,
 * rangeFibEngine.js and confluenceModules.js (`_bisect` / `extractBars` /
 * `_extractFast` / `resampleTo` / `_resample30m` / `bodyRange` / `_asiaBodyRange`).
 *
 * The lego design
 *   • One copy of the hot path. These functions run inside every session-range
 *     backtest; three independent copies means an off-by-one in the binary
 *     search or a bucket-boundary bug could be fixed in one and not the others.
 *   • Packed columnar format is the contract. A "packed" series is
 *     { n, times[], opens[], highs[], lows[], closes[] } with `times` ascending
 *     in epoch SECONDS — the shape loadM1ForPair already returns.
 *   • A resampled "bar" is { time, open, high, low, close } with `time` the
 *     bucket-start epoch (seconds). OHLC aggregation: first open, max high,
 *     min low, last close — identical to the originals.
 *   • Pure & horizon-agnostic. Timeframe is a parameter (minutes); nothing is
 *     hard-coded to 5m/15m/30m.
 */

// ── Binary search ────────────────────────────────────────────────────────────
// First index i where times[i] >= target. O(log N).
export function bisect(times, target) {
  let lo = 0, hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (times[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// ── Window extraction ────────────────────────────────────────────────────────
// Bars with fromEpoch <= time < toEpoch as {time,open,high,low,close} objects.
// O(log N + window) via the binary search above.
export function extractBars(packed, fromEpoch, toEpoch) {
  const { n, times, opens, highs, lows, closes } = packed;
  const start = bisect(times, fromEpoch);
  const bars  = [];
  for (let i = start; i < n && times[i] < toEpoch; i++) {
    bars.push({ time: times[i], open: opens[i], high: highs[i], low: lows[i], close: closes[i] });
  }
  return bars;
}

// ── Resample ─────────────────────────────────────────────────────────────────
// Aggregate {time,open,high,low,close} bars up to `minutes` buckets keyed by
// bucket-start epoch. First open, max high, min low, last close.
export function resampleTo(bars, minutes) {
  const secs = minutes * 60;
  const buckets = new Map();
  for (const bar of bars) {
    const bucket = bar.time - (bar.time % secs);
    if (!buckets.has(bucket)) {
      buckets.set(bucket, { time: bucket, open: bar.open, high: bar.high, low: bar.low, close: bar.close });
    } else {
      const b = buckets.get(bucket);
      b.high  = Math.max(b.high, bar.high);
      b.low   = Math.min(b.low,  bar.low);
      b.close = bar.close;
    }
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

// ── Body range ───────────────────────────────────────────────────────────────
// max/min of (open,close) across bars resampled to `minutes`. Returns
// { high, low, range } or null if degenerate. asiaBodyRange = bodyRange(m1, 5).
export function bodyRange(m1Bars, minutes) {
  if (!m1Bars.length) return null;
  const bars = resampleTo(m1Bars, minutes);
  let high = -Infinity, low = Infinity;
  for (const bar of bars) {
    high = Math.max(high, Math.max(bar.open, bar.close));
    low  = Math.min(low,  Math.min(bar.open, bar.close));
  }
  if (!isFinite(high) || !isFinite(low) || low >= high) return null;
  return { high, low, range: high - low };
}

// ── Resampled ATR (true-range average) ───────────────────────────────────────
// Mean true range over the last `period` bars after resampling M1 to `tfMin`.
// Simple average (not Wilder) — matches asiaRangeEngine.calcATR30 / rangeFib
// calcATR. calcATR30 = calcATR(m1, 30). Returns null if too few bars.
export function calcATR(m1Bars, tfMin, period = 14) {
  const bars = resampleTo(m1Bars, tfMin);
  if (bars.length < 2) return null;
  const trs = [];
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i], p = bars[i - 1];
    trs.push(Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close)));
  }
  const slice = trs.slice(-Math.max(period, 1));
  return slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : null;
}

// ── Group packed rows by UTC date ────────────────────────────────────────────
// rows: [{time, open, high, low, close}] with epoch-second `time`. Returns a
// Map<'YYYY-MM-DD', rows[]> preserving chronological order within each day.
export function groupByDate(rows) {
  const byDate = new Map();
  for (const r of rows) {
    const ds = new Date(r.time * 1000).toISOString().substring(0, 10);
    if (!byDate.has(ds)) byDate.set(ds, []);
    byDate.get(ds).push(r);
  }
  return byDate;
}
