/**
 * fetchM1Range.mjs — local OANDA M1 fetcher for the local decision engine.
 * A direct copy of js/volBacktestEngine.js's own `fetchM1Range`/`_oandaBase`
 * (not imported from there — that file pulls in the full backtest-engine
 * dependency graph, unnecessary weight for a small local process). Keep
 * this in sync by hand if the source ever changes shape.
 *
 * Requires OANDA_KEY (and optionally OANDA_ENV=practice|live, default live)
 * in the local process's environment — the same credentials the bot's own
 * MT5/OANDA setup already uses, just read locally instead of on Railway.
 */

function oandaBase() {
  return (process.env.OANDA_ENV || 'live') === 'practice'
    ? 'https://api-fxpractice.oanda.com'
    : 'https://api-fxtrade.oanda.com';
}

// One [from,to] window (epoch SECONDS), must be <=5000 bars (OANDA's cap) —
// js/m1GapFill.js's chunkMinuteRange handles splitting a larger range into
// calls of this shape; this function is the `fetchCandles` it expects.
export async function fetchM1Range(instrument, fromSec, toSec) {
  const fromIso = new Date(fromSec * 1000).toISOString();
  const toIso = new Date(toSec * 1000).toISOString();
  const url = `${oandaBase()}/v3/instruments/${encodeURIComponent(instrument)}/candles`
    + `?granularity=M1&price=M&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`Oanda M1 ${instrument}: HTTP ${r.status}`);
  const data = await r.json();
  return (data.candles ?? [])
    .filter(c => c.complete !== false && c.mid)
    .map(c => ({
      time: Math.floor(new Date(c.time).getTime() / 1000),
      open: parseFloat(c.mid.o),
      high: parseFloat(c.mid.h),
      low: parseFloat(c.mid.l),
      close: parseFloat(c.mid.c),
      volume: Number(c.volume ?? 0),
    }))
    .filter(c => c.close > 0);
}
