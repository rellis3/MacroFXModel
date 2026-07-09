/**
 * Range-Line CONFLUENCE producer — ships today's structural-confluence LEVELS to
 * the live range_line_bot (PYTHON_LEGO.md "ship it a file"), so the bot's optional
 * confluence entry-gate is checked against the EXACT levels the OOS result was
 * validated on (RANGE_EXTENSION_GUIDE — the confluence quality-filter §, held-
 * position chandelier, per-year + walk-forward green on the ≥2 book).
 *
 * WHY ship levels, not port the sources: the level sources (pivots / POC-VAH-VAL /
 * swing-fib / round / VWAP / 15m-fib) live in the validated JS (`levelSources` via
 * `rangeLineAnalyser.sessionConfluenceLevels`). Porting all of them to Python is
 * high drift risk; instead the dashboard computes the level PRICES here with that
 * exact code and the bot only does the trivial proximity count (`confluence_bucket`,
 * parity-tested). One source of truth → the live gate can't silently disagree with
 * the backtest.
 *
 * NO LOOKAHEAD: `dailyBars` = completed prior D1 (yesterday back), `intraday` = the
 * prior sessions' M1 — the same as-of point the backtest used (levels are known at
 * the session open, before any trade). Pure + synthetic-testable; the server wires
 * the real OANDA D1 + M1 loaders and the KV write.
 */

import { sessionConfluenceLevels, CONFLUENCE_SOURCES } from './rangeLineAnalyser.js';

// Build the confluence artifact from per-instrument bar data. `dataByInstrument`:
//   { pair: { dailyBars:[{time,open,high,low,close}], intraday:[{time,o,h,l,c,volume?}],
//             pip, price } }
// Returns { strategy, generatedAt, tolFrac, fib15ClusterPips, sources,
//           instruments: { pair: { pip, levels:[{price,source}] } } }. The bot pairs
// each ladder level with these via tol = tolFrac × ITS range (so "on the line"
// auto-scales exactly as the backtest's per-range tolerance).
export function buildConfluenceArtifact(dataByInstrument = {}, {
  sources = CONFLUENCE_SOURCES, tolFrac = 0.1, fib15 = true, fib15Lookback = 5, fib15ClusterPips = 8,
  now = () => new Date().toISOString(), onLog = () => {},
} = {}) {
  const instruments = {};
  let ok = 0;
  for (const [pair, d] of Object.entries(dataByInstrument)) {
    const key = String(pair).toLowerCase();
    try {
      const levels = sessionConfluenceLevels({
        dailyBars: d.dailyBars || [], intraday: d.intraday || [], pip: d.pip || 0,
        price: d.price ?? null, sources, fib15, fib15Lookback, fib15ClusterPips,
      });
      // Keep only finite prices; round to kill float noise; tag by source.
      const clean = [];
      for (const lv of levels) if (Number.isFinite(lv.price)) clean.push({ price: +lv.price.toFixed(6), source: lv.source || lv.kind });
      instruments[key] = { pip: d.pip ?? null, levels: clean };
      onLog(`${key}: ${clean.length} confluence level(s)`);
      ok++;
    } catch (e) { onLog(`${key}: ${e.message}`); }
  }
  return {
    strategy: 'range-line-confluence', generatedAt: now(),
    tolFrac, fib15ClusterPips, sources,
    instruments,
  };
}
