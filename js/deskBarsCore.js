/**
 * Desk bars, pure: the timeframes the Desk Terminal's candle charts offer and how OANDA candles become chart bars.
 *
 * Why native granularities, not client aggregation: OANDA serves M5, M15, M30, H1 and H4 itself, so every timeframe is ONE call that is cached for
 * every viewer, and a bar is exactly OANDA's bar (the same one the forecast lines and the strength board use). Aggregating M5 up would have to
 * guess OANDA's H4 anchor; asking for H4 does not.
 *
 * Stamping: a bar's `time` is its OPEN, in epoch seconds (OANDA stamps candles at their open). The last bar may still be FORMING (`complete:false`
 * on the wire): it is kept and flagged `forming:true` so a chart can say so, never silently dropped or passed off as a finished candle.
 *
 * H4 anchor: OANDA's own, never ours. OANDA aligns intraday candles to its daily roll (17:00 America/New_York) unless asked otherwise, so a 4h bar
 * opens at 17:00, 21:00, 01:00, 05:00, 09:00 and 13:00 New York (22:00, 02:00 ... London in winter, an hour earlier in the weeks the two cities are
 * out of step). That is the desk's FX day, and it is what the forecast session open is measured against. We do not re-anchor to London midnight
 * or UTC. (Checked against the live feed on 2026-11-15: see js/deskBarsCore.test.mjs header notes.)
 *
 * Tested by js/deskBarsCore.test.mjs.
 */

/** key = what the pill says; gran = OANDA's name; sec = bar length; defDays/maxDays = how far back; ttlMs = how long the server keeps an answer. */
export const TIMEFRAMES = [
  { key: '5m', gran: 'M5', sec: 300, defDays: 3, maxDays: 10, ttlMs: 60_000 },
  { key: '15m', gran: 'M15', sec: 900, defDays: 6, maxDays: 20, ttlMs: 2 * 60_000 },
  { key: '30m', gran: 'M30', sec: 1800, defDays: 10, maxDays: 20, ttlMs: 3 * 60_000 },
  { key: '1h', gran: 'H1', sec: 3600, defDays: 8, maxDays: 20, ttlMs: 10 * 60_000 },
  { key: '4h', gran: 'H4', sec: 14400, defDays: 20, maxDays: 20, ttlMs: 10 * 60_000 },
];
export const DEFAULT_TF = '1h';
export const TF_KEYS = TIMEFRAMES.map(t => t.key);
export const tfOf = key => TIMEFRAMES.find(t => t.key === String(key ?? '').toLowerCase()) ?? TIMEFRAMES.find(t => t.key === DEFAULT_TF);

/** The days to ask for: the request's, clamped to what that timeframe may carry (5m: 10 days is about 2,900 bars, well inside OANDA's 5,000). */
export function clampDays(tf, req) {
  const n = parseInt(req, 10), d = Number.isFinite(n) && n > 0 ? n : tf.defDays;
  return Math.min(Math.max(d, 1), tf.maxDays);
}

/** How many bars to ask OANDA for, counted back from now. Calendar days of bars is an overshoot (weekends have none), which is the point: the cut below trims it. Never over 5,000. */
export const barCount = (tf, days) => Math.min(5000, Math.ceil(days * 86400 / tf.sec) + 10);

/**
 * OANDA candles -> chart bars, ascending by open time, inside the last `days` calendar days of nowMs.
 *   [{ time (open, epoch s), open, high, low, close, forming? }]
 * A candle with no mid prices or a non-finite close is dropped; a duplicate open keeps the later one; the incomplete candle is kept and flagged.
 */
export function shapeCandles(candles, nowMs, days) {
  const cut = nowMs / 1000 - days * 86400, by = new Map();
  for (const c of candles ?? []) {
    const m = c?.mid; if (!m) continue;
    const t = Math.floor(Date.parse(c.time) / 1000), close = +m.c;
    if (!Number.isFinite(t) || !Number.isFinite(close) || t < cut || t > nowMs / 1000) continue;
    const b = { time: t, open: +m.o, high: +m.h, low: +m.l, close };
    if (c.complete === false) b.forming = true;
    by.set(t, b);
  }
  return [...by.values()].sort((a, b) => a.time - b.time);
}

/**
 * What the bars say about themselves, for the chip row: the last bar's open and close, whether it is still forming, and how stale the last bar is.
 * `forming` is only true when the last bar is flagged AND its close (open + sec) is still ahead of nowMs.
 */
export function describeBars(bars, tf, nowMs) {
  const last = bars?.[bars.length - 1];
  if (!last) return { n: 0, lastOpen: null, lastClose: null, forming: false, ageSec: null };
  const lastClose = last.time + tf.sec;
  return { n: bars.length, lastOpen: last.time, lastClose, forming: !!last.forming && lastClose * 1000 > nowMs, ageSec: Math.max(0, Math.round(nowMs / 1000 - lastClose)) };
}

export const candlesUrl = (base, sym, tf, days) => `${base}/v3/instruments/${encodeURIComponent(sym)}/candles?granularity=${tf.gran}&count=${barCount(tf, days)}&price=M`;
