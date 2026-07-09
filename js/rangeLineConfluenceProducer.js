/**
 * Range-Line CONFLUENCE producer — ships today's structural-confluence LEVELS to
 * the live range_line_bot (PYTHON_LEGO.md "ship it a file"), so the bot's optional
 * confluence entry-gate is checked against the EXACT levels the OOS result was
 * validated on (RANGE_EXTENSION_GUIDE — the confluence quality-filter §, held-
 * position chandelier, per-year + walk-forward green on the ≥2 book).
 *
 * WHY ship levels, not port the sources: the level sources (pivots / POC-VAH-VAL /
 * swing-fib / round / VWAP / 15m-fib) live in the validated JS (`levelSources` via
 * `rangeLineAnalyser.sessionConfluenceLevels`/`latestSessionConfluence`). Porting
 * all of them to Python is high drift risk; instead the dashboard computes the level
 * PRICES here with that exact code and the bot only does the trivial proximity count
 * (`confluence_bucket`, parity-tested). One source of truth → the live gate can't
 * silently disagree with the backtest.
 *
 * Network/IO is INJECTED (getPacked/kvPut) so the core is offline-testable; the
 * server route wires the real M1 loader + KV. Mirrors `rangeLineBotProducer`.
 */

import { latestSessionConfluence } from './rangeLineAnalyser.js';

// ── Fresh-M1 packing (live path) ─────────────────────────────────────────────
// The backtest sources confluence from the M1 STORE (loadM1ForPair). Live, that
// store is stale (updated on a slow cadence), so the shipped confluence dates lag
// by weeks. These helpers pack FRESH OANDA M1 into the identical packed shape
// (`{n,times,opens,highs,lows,closes,volumes}`, epoch-second times) the store
// returns — so `latestSessionConfluence` runs the SAME validated path on current
// data, no drift.

// Start-of-current-session epoch (UTC), given the DST-aware London-midnight
// boundaryHour (23 in BST, 0 in GMT). Bars at/after this belong to the STILL-
// FORMING session and must be dropped — the confluence is "levels known at today's
// open", so it may only use completed prior sessions (the no-lookahead rule the
// touch-mode test enforces). boundaryHour=23,now=05:00Z → yesterday 23:00Z.
export function sessionStartEpoch(boundaryHour, nowSec) {
  const d = new Date(nowSec * 1000);
  const startToday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), boundaryHour, 0, 0) / 1000;
  return d.getUTCHours() >= boundaryHour ? startToday : startToday - 86400;
}

// Raw bars [{time(epochSec),open,high,low,close,volume}] → packed arrays, sorted,
// deduped by time, with the forming session dropped (see sessionStartEpoch). Pure
// — offline-testable, no network/clock (pass nowSec).
export function packLiveM1(bars, { boundaryHour = 0, nowSec = null } = {}) {
  const clean = (Array.isArray(bars) ? bars : []).filter(b => b && Number.isFinite(b.time));
  clean.sort((a, b) => a.time - b.time);
  const now = Number.isFinite(nowSec) ? nowSec : (clean.length ? clean[clean.length - 1].time : 0);
  const cut = sessionStartEpoch(boundaryHour, now);
  const kept = [];
  let lastT = null;
  for (const b of clean) {
    if (b.time >= cut) continue;             // drop the still-forming session
    if (b.time === lastT) continue;          // dedupe overlapping page boundaries
    lastT = b.time; kept.push(b);
  }
  const n = kept.length;
  const times = new Array(n), opens = new Array(n), highs = new Array(n),
        lows = new Array(n), closes = new Array(n), volumes = new Array(n);
  for (let i = 0; i < n; i++) {
    const b = kept[i];
    times[i] = b.time; opens[i] = b.open; highs[i] = b.high;
    lows[i] = b.low; closes[i] = b.close; volumes[i] = b.volume ?? 0;
  }
  return { n, times, opens, highs, lows, closes, volumes };
}

// Refresh the confluence artifact and persist it to KV. `getPacked(instr, ac)` must
// return the instrument's packed M1 (server wires loadM1ForPair). Instruments with
// no M1 / no levels are skipped. Writes `range_line_confluence`:
//   { strategy, generatedAt, tolFrac, boundaryHour, confLookback,
//     instruments: { instr: { pip, date, levels:[{price,source}] } } }
export async function refreshRangeLineConfluence({
  universe, getPacked, kvPut,
  assetClassFor = () => 'fx', pipFor = () => null,
  boundaryHour = 0, confLookback = 5, tolFrac = 0.1, fib15ClusterPips = 8,
  now = () => new Date().toISOString(), stamp = () => Date.now(), onLog = () => {},
} = {}) {
  if (!Array.isArray(universe) || !universe.length)
    throw new Error('refreshRangeLineConfluence: universe (instrument list) required');
  if ([getPacked, kvPut].some(f => typeof f !== 'function'))
    throw new Error('refreshRangeLineConfluence: getPacked/kvPut are required functions');

  const instruments = {};
  let ok = 0, fail = 0;
  for (const instr of universe) {
    const key = String(instr).toLowerCase();
    try {
      const ac = assetClassFor(key) || 'fx';
      const pip = pipFor(key) || 0;
      const packed = await getPacked(key, ac);
      if (!packed || !packed.n) { onLog(`${key}: no M1 — skipped`); fail++; continue; }
      const { date, levels } = latestSessionConfluence(packed, { boundaryHour, confLookback, pip, fib15ClusterPips });
      const clean = [];
      for (const lv of levels) if (Number.isFinite(lv.price)) clean.push({ price: +lv.price.toFixed(6), source: lv.source || lv.kind });
      if (!clean.length) { onLog(`${key}: 0 confluence levels — skipped`); fail++; continue; }
      instruments[key] = { pip: pip || null, date, levels: clean };
      onLog(`${key}: ${clean.length} level(s) as-of ${date}`);
      ok++;
    } catch (e) { onLog(`${key}: ${e.message}`); fail++; }
  }

  const artifact = {
    strategy: 'range-line-confluence', generatedAt: now(),
    tolFrac, boundaryHour, confLookback, instruments,
  };
  // Refuse to clobber a prior-good artifact with an empty one (M1 unreachable) —
  // an empty artifact + confluence_min>0 would silently halt the bot.
  if (!Object.keys(instruments).length)
    throw new Error(`range-line confluence has 0 instruments (${ok} ok, ${fail} skipped) — not publishing empty; check M1 reachability`);
  await kvPut('range_line_confluence', JSON.stringify({ data: artifact, timestamp: stamp() }));
  onLog(`confluence written: ${Object.keys(instruments).length} instruments (${ok} ok, ${fail} skipped)`);
  return artifact;
}
