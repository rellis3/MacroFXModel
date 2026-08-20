/**
 * Range Percentile Core — ranks the CURRENT session's forming H-L range
 * against the empirical distribution of the trailing N sessions' full-day
 * H-L ranges (% of session open). Answers "how much of a typical day's
 * range has already printed?" — the Live / Median / 75th-Pct read a
 * discretionary trader eyeballs off a daily-range-histogram tool, used as an
 * exhaustion gate: once the live range is already past the historical
 * median, treat the move as more likely to be late/exhausted than early.
 *
 * Distinct from `VolRangeForecaster` (Feller/Brownian-motion THEORETICAL range
 * forecast off a vol estimate) — this is a plain EMPIRICAL percentile-rank off
 * realized daily H-L, no vol model. Pure; no I/O. Caller supplies D1 bars for
 * the trailing distribution and the running intraday high/low for the live
 * figure — no lookahead as long as `uptoIdx` excludes the current session and
 * the running high/low are read only from bars ≤ "now".
 */

// Sorted ascending array of trailing daily H-L ranges (fraction of that day's
// open), using D1 bars strictly BEFORE uptoIdx (today itself is excluded —
// callers pass `di`, the current day's index in the daily array).
export function trailingRangeDistribution(dailyBars, uptoIdx, lookback = 20) {
  const start = Math.max(0, uptoIdx - lookback);
  const out = [];
  for (let i = start; i < uptoIdx; i++) {
    const d = dailyBars[i];
    if (d && d.open > 0 && d.high >= d.low) out.push((d.high - d.low) / d.open);
  }
  return out.sort((a, b) => a - b);
}

// Fraction of `sortedArr` strictly below `value` (0..1). Null on empty input.
export function percentileOf(sortedArr, value) {
  if (!sortedArr.length) return null;
  let lo = 0, hi = sortedArr.length;
  while (lo < hi) { const m = (lo + hi) >>> 1; if (sortedArr[m] < value) lo = m + 1; else hi = m; }
  return lo / sortedArr.length;
}

// Linear-interpolated quantile (q in [0,1]) of a pre-sorted ascending array.
export function quantile(sortedArr, q) {
  if (!sortedArr.length) return null;
  if (sortedArr.length === 1) return sortedArr[0];
  const pos = (sortedArr.length - 1) * q;
  const base = Math.floor(pos), rest = pos - base;
  const next = sortedArr[base + 1];
  return next === undefined ? sortedArr[base] : sortedArr[base] + rest * (next - sortedArr[base]);
}

// The live read, shaped like the screenshot tool's "Live / Median / 75th Pct"
// table. `runningHigh`/`runningLow` must be computed from bars strictly ≤ the
// evaluation bar (caller's responsibility — this function has no bar loop of
// its own so it stays pure and reusable at any timeframe/instrument).
// Returns null if there isn't enough trailing history (< minSessions days) or
// sessionOpen is degenerate.
export function rangeExhaustionRead(dailyBars, uptoIdx, sessionOpen, runningHigh, runningLow, lookback = 20, minSessions = 5) {
  const dist = trailingRangeDistribution(dailyBars, uptoIdx, lookback);
  if (dist.length < minSessions || !(sessionOpen > 0) || !(runningHigh >= runningLow)) return null;
  const livePct = (runningHigh - runningLow) / sessionOpen;
  const medianPct = quantile(dist, 0.5);
  const p75Pct = quantile(dist, 0.75);
  return {
    livePct,
    medianPct,
    p75Pct,
    percentileRank: percentileOf(dist, livePct),          // 0..1, where livePct sits in the trailing distribution
    usedFracOfMedian: medianPct > 0 ? livePct / medianPct : null,  // 1.0 = "used up a typical day's range already"
    sessions: dist.length,
  };
}
