/**
 * Trade Lab Data Source — merges the frozen R2 M1 archive (`loadM1ForPair`,
 * 2016 → last sync) with LIVE OANDA and Yahoo Finance fetches for windows the
 * archive doesn't reach yet, so a requested [from,to] window always resolves
 * to the freshest real data available wherever this code runs:
 *
 *   - Sandbox/local dev: OANDA and Yahoo are typically both network-blocked
 *     here — archive-only windows still resolve exactly; live-only windows
 *     fail with a clearly REPORTED reason (never silently return empty).
 *   - Railway (production): OANDA is reachable, so live/recent windows —
 *     including anything after the archive's last sync — resolve for real.
 *     Yahoo (`GC=F`/`NQ=F`, real futures tickers) is the fallback if OANDA
 *     errors, since Yahoo's own 1m retention is short (~7-8 days).
 *
 * Pure composition — no new fetch logic. `loadM1ForPair` (js/volBacktestM1Engine.js),
 * `fetchM1Range` (js/volBacktestEngine.js) and `fetchYahooChart`
 * (js/nasdaqDataSources.js) already exist; this brick's only job is deciding
 * WHICH of them can answer a given window and stitching the result.
 *
 * Contract: loadTradeLabBars(instrumentKey, fromSec, toSec) → {
 *   bars: [{time,open,high,low,close}]  (ascending, deduped by time, seconds),
 *   source: 'cache' | 'cache+oanda' | 'cache+yahoo' | 'oanda' | 'yahoo' | 'none',
 *   archiveTo: epoch seconds | null,     // last bar in the frozen archive
 *   liveStatus: 'not-needed' | 'oanda-ok' | 'yahoo-fallback-ok' | 'failed',
 *   liveError: string | null,            // diagnostic detail when live was attempted
 * }
 */

import { loadM1ForPair } from './volBacktestM1Engine.js';
import { extractBars } from './barUtils.js';
import { fetchM1Range } from './volBacktestEngine.js';
import { fetchYahooChart } from './nasdaqDataSources.js';
import { oandaSymbol, yahooSymbol } from './instrumentRegistry.js';

// nq's frozen archive lives in a different local dir than the FX/gold set
// (js/volBacktestM1Engine.js's default BT_M1_DIR only has the FX pairs + gold;
// see js/weeklyVolBacktestEngine.js's BT_WEEKLY_M1_DIR for the reasoning).
const M1_DIR_OVERRIDE = { nq: './portfolioBacktest/cache' };

function yahooBarsToStandard(yBars) {
  return yBars
    .map(b => ({ time: Math.floor(b.t / 1000), open: b.open, high: b.high, low: b.low, close: b.close }))
    .filter(b => Number.isFinite(b.open) && Number.isFinite(b.high) && Number.isFinite(b.low) && Number.isFinite(b.close));
}

function dedupeSorted(bars) {
  bars.sort((a, b) => a.time - b.time);
  const out = [];
  for (const b of bars) { if (!out.length || out[out.length - 1].time !== b.time) out.push(b); }
  return out;
}

// `loadM1ForPair` checks R2 BEFORE local disk on every call (see its own
// file-header priority comment) — fine for a one-shot backtest run, fatal for
// a page a user reloads/re-queries repeatedly (a fresh ~90MB/65MB R2 fetch
// per request, observed ~48s locally). This module's own callers are
// interactive, so cache the packed archive per instrument for this process's
// lifetime — deliberately NOT touching `loadM1ForPair` itself, which other
// production code depends on behaving exactly as it does today.
const _archiveCache = new Map();   // key -> Promise<packed|null>
function loadArchiveCached(key, m1Dir) {
  if (!_archiveCache.has(key)) {
    _archiveCache.set(key, (m1Dir ? loadM1ForPair(key, m1Dir) : loadM1ForPair(key)).catch(err => { _archiveCache.delete(key); throw err; }));
  }
  return _archiveCache.get(key);
}

// Exposes the same cached packed archive `loadTradeLabBars` uses internally,
// for callers that need the FULL series (e.g. scanning the whole archive for
// impulse occurrences to browse) rather than one bounded window.
export function loadFullArchivePacked(instrumentKey) {
  const key = instrumentKey === 'nq' ? 'nq' : 'gold';
  return loadArchiveCached(key, M1_DIR_OVERRIDE[key]);
}

export async function loadTradeLabBars(instrumentKey, fromSec, toSec) {
  const key = instrumentKey === 'nq' ? 'nq' : 'gold';
  const m1Dir = M1_DIR_OVERRIDE[key];

  let archiveBars = [], archiveTo = null;
  try {
    const packed = await loadArchiveCached(key, m1Dir);
    if (packed && packed.n) {
      archiveTo = packed.times[packed.n - 1];
      archiveBars = extractBars(packed, fromSec, Math.min(toSec, archiveTo) + 1);
    }
  } catch { /* archive missing/unreachable — fall through to live-only */ }

  const needLive = toSec > (archiveTo ?? -Infinity);
  if (!needLive) {
    return { bars: archiveBars, source: 'cache', archiveTo, liveStatus: 'not-needed', liveError: null };
  }

  const liveFrom = Math.max(fromSec, (archiveTo ?? fromSec) + 1);
  let liveBars = [], liveStatus = 'failed', liveError = null;

  try {
    const oandaBars = await fetchM1Range(oandaSymbol(key), liveFrom, toSec);
    liveBars = oandaBars.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }));
    liveStatus = 'oanda-ok';
  } catch (oandaErr) {
    const oandaMsg = `OANDA: ${oandaErr.message}`;
    try {
      const yc = await fetchYahooChart(yahooSymbol(key), { interval: '1m', period1: liveFrom, period2: toSec });
      liveBars = yahooBarsToStandard(yc);
      liveStatus = 'yahoo-fallback-ok';
      liveError = `${oandaMsg} — fell back to Yahoo OK`;
    } catch (yahooErr) {
      liveStatus = 'failed';
      liveError = `${oandaMsg} | Yahoo: ${yahooErr.message}`;
    }
  }

  const bars = dedupeSorted([...archiveBars, ...liveBars]);
  const source = archiveBars.length && liveBars.length ? (liveStatus === 'oanda-ok' ? 'cache+oanda' : 'cache+yahoo')
    : liveBars.length ? (liveStatus === 'oanda-ok' ? 'oanda' : 'yahoo')
    : archiveBars.length ? 'cache' : 'none';

  return { bars, source, archiveTo, liveStatus, liveError };
}
