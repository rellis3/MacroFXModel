/**
 * Live OANDA intraday candle fetcher — extracted from server.js's weekly-vol
 * -backtest candle-viewer routes (_wbtFetchIntraday*) so the same tested fetch
 * logic can be reused by anything else that needs live bars at an arbitrary
 * granularity (M5/M15/M30/H1/H4/D...), not just those routes. Behavior is
 * unchanged from the original — this is a pure extraction, not a rewrite.
 */

import { WEEKLY_INSTRUMENTS } from './weeklyVolBacktestEngine.js';

// name.toLowerCase() -> OANDA instrument code, e.g. 'eurusd' -> 'EUR_USD'.
export const OANDA_INSTRUMENT_MAP = {
  ...Object.fromEntries(WEEKLY_INSTRUMENTS.map(i => [i.name.toLowerCase(), i.oanda])),
  us2000: 'US2000_USD',
};

function oandaBase() {
  return (process.env.OANDA_ENV || 'live') === 'practice'
    ? 'https://api-fxpractice.oanda.com'
    : 'https://api-fxtrade.oanda.com';
}

// OANDA rejects a `to` timestamp in the future with HTTP 400 — clamp to now.
export function clampToNow(toDate) {
  const iso = toDate + 'T23:59:59Z';
  return new Date(iso).getTime() > Date.now() ? new Date().toISOString().replace(/\.\d+Z$/, 'Z') : iso;
}

// Fetch intraday candles (epoch-second times) for one OANDA instrument.
// Throws on a non-OK response with OANDA's errorMessage included.
export async function fetchIntradayOnce(oanda, gran, { from, to, count } = {}) {
  const base = oandaBase();
  let url = `${base}/v3/instruments/${encodeURIComponent(oanda)}/candles?granularity=${gran}&price=M`;
  if (from) url += `&from=${encodeURIComponent(from)}`;
  if (to)   url += `&to=${encodeURIComponent(to)}`;
  // count is valid with a `from` (OANDA returns `count` candles forward) or
  // alone; it must NOT be combined with `to` (from+to defines the span).
  if (count && !to) url += `&count=${count}`;
  else if (!from && !to) url += '&count=200';
  const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) {
    let msg = `OANDA HTTP ${r.status}`;
    try { const j = await r.json(); if (j?.errorMessage) msg += ` — ${j.errorMessage}`; } catch { /* body not JSON */ }
    throw new Error(msg);
  }
  const data = await r.json();
  return (data.candles ?? [])
    .filter(c => c.complete !== false && c.mid)
    .map(c => ({ time: Math.floor(new Date(c.time).getTime() / 1000), open: +c.mid.o, high: +c.mid.h, low: +c.mid.l, close: +c.mid.c }));
}

// Fetch intraday candles (epoch-second times), PAGINATED past OANDA's 5000-
// candle/request cap: walks the [from, to] window forward in time chunks so a
// multi-month M15/M5 history stitches into one ascending, de-duplicated series.
export async function fetchIntraday(oanda, gran, { from, to, count } = {}) {
  const toMs = to ? new Date(clampToNow(to)).getTime() : Date.now();
  if (!from) return fetchIntradayOnce(oanda, gran, { count });   // count-only (no range)
  // OANDA rejects a from+to request spanning >5000 candles ("Maximum value for
  // 'count' exceeded") — it does NOT return the first 5000. So page with
  // from+count (5000 forward from the cursor), advancing until we pass `to`.
  let cursorMs = new Date(from + 'T00:00:00Z').getTime();
  const out = [];
  for (let page = 0; page < 24 && cursorMs < toMs; page++) {   // hard cap 24 pages
    const chunk = await fetchIntradayOnce(oanda, gran, {
      from: new Date(cursorMs).toISOString().replace(/\.\d+Z$/, 'Z'),
      count: 5000,
    });
    if (!chunk.length) break;
    let added = 0;
    for (const c of chunk) {
      if (c.time * 1000 > toMs) break;                                // past the window
      if (!out.length || c.time > out[out.length - 1].time) { out.push(c); added++; }
    }
    const lastMs = chunk[chunk.length - 1].time * 1000;
    if (lastMs >= toMs || chunk.length < 5000 || added === 0) break;  // reached `to` / caught up
    cursorMs = lastMs + 1000;
  }
  return out;
}
