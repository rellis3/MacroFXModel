/**
 * Asia Range Fibonacci Confluence Backtester — engine.
 *
 * Asia session range:   5m body high/low  (00:00–06:00 UTC)
 * Monday range:         15m body high/low  (full Monday UTC)
 * Confluence:           current session fib ≈ previous session fib within threshold
 * Cross-alignment:      Asia fib ≈ Monday fib within confluenceThresh → strongest zone
 * Trade:                limit order at confluence levels outside (or inside) Asia range
 *                       after Asia close (06:00 UTC), within configurable time window
 *
 * levelSource:  'asia'    — trade Asia session fib levels (default)
 *               'monday'  — trade Monday weekly fib levels
 *               'both'    — Asia fibs + any Monday fibs not already covered by an Asia fib
 * levelFilter:  'tight'       — Asia fib × prev-Asia fib tight alignment
 *               'confluence'  — Asia fib × prev-Asia fib any alignment
 *               'asia_monday' — fib must align with a level from the other set (cross-session)
 *               'all'         — all key levels
 */

import path             from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair, BT_M1_DIR } from './volBacktestM1Engine.js';
import {
  buildAllPairCaches,
  buildDayStates,
  runModuleChecks,
  collectModuleLevels,
} from './confluenceModules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Lego baseplate: M1 packed-array helpers + the fib level set / projection are
// shared bricks now, not private copies. See js/barUtils.js, js/fibProjection.js.
import { bisect as _bisect, extractBars, resampleTo, bodyRange, calcATR } from './barUtils.js';
import { FIB_LEVELS, calcFibs } from './fibProjection.js';
import { waveTrendSeries } from './vumanchuCore.js';
// Use the SAME confluence matcher the live engine (levels.js) trades on, so the
// backtest's notion of "confluence" matches what fires on the bot — including the
// session-range distance cap + clustering (density) the old local copy lacked.
import { detectConfluencesCore } from './confluence-core.js';

// ── Constants ─────────────────────────────────────────────────────────────────

// FIB_LEVELS imported from the fibProjection brick; re-exported so existing
// callers of asiaRangeEngine.FIB_LEVELS keep working.
export { FIB_LEVELS };

const PIP_SIZE = {
  eurusd: 0.0001, gbpusd: 0.0001, audusd: 0.0001, nzdusd: 0.0001,
  usdcad: 0.0001, usdchf: 0.0001, eurgbp: 0.0001, euraud: 0.0001,
  eurcad: 0.0001, eurchf: 0.0001, eurnzd: 0.0001, audnzd: 0.0001,
  audcad: 0.0001, audchf: 0.0001, gbpaud: 0.0001, gbpcad: 0.0001,
  gbpchf: 0.0001, gbpnzd: 0.0001,
  usdjpy: 0.01, eurjpy: 0.01, gbpjpy: 0.01, audjpy: 0.01,
  cadjpy: 0.01, chfjpy: 0.01, nzdjpy: 0.01,
  gold:   1.0,
};

export const ASIA_INSTRUMENTS = [
  'eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf', 'gbpjpy',
  'eurjpy', 'eurgbp', 'euraud', 'eurcad', 'eurchf', 'eurnzd',
  'audjpy', 'audnzd', 'audcad', 'audchf',
  'gbpaud', 'gbpcad', 'gbpchf', 'gbpnzd',
  'cadjpy', 'chfjpy', 'nzdjpy', 'gold',
];

// ── M1 packed-array helpers / ATR / session ranges ───────────────────────────
// _bisect / extractBars / resampleTo / bodyRange / calcATR come from the
// barUtils brick. The Asia (5m), Monday (15m) and ATR-30 conveniences are thin
// aliases over it — same numbers, one implementation.

const calcATR30      = (m1, periods = 14) => calcATR(m1, 30, periods);  // 30m true-range avg
const asiaBodyRange  = (m1) => bodyRange(m1, 5);                        // 5m bodies, Asia window
const mondayWickRange = (m1) => bodyRange(m1, 15);                      // 15m bodies, full Monday

// ── Per-pair caches (built once, used O(log N) per day) ──────────────────────

// Pre-index every Asia session range across the full dataset.
// Calling code does: _prevAsia(asiaSessions, dayEpoch) → O(log N) instead of 7 × O(N).
function _buildAsiaSessions(packed) {
  const { n, times } = packed;
  const daySet = new Set();
  for (let i = 0; i < n; i++) {
    if ((Math.floor(times[i] / 3600) % 24) < 6) daySet.add(times[i] - (times[i] % 86400));
  }
  const sessions = [];
  for (const epoch of [...daySet].sort((a, b) => a - b)) {
    const bars = extractBars(packed, epoch, epoch + 6 * 3600);
    if (bars.length < 10) continue;
    const r = asiaBodyRange(bars);
    if (r) sessions.push({ epoch, high: r.high, low: r.low, range: r.range });
  }
  return sessions; // sorted ascending by epoch
}

// Return the most recent Asia session entry strictly before dayEpoch.
function _prevAsia(sessions, dayEpoch) {
  let lo = 0, hi = sessions.length;
  while (lo < hi) { const m = (lo + hi) >>> 1; sessions[m].epoch < dayEpoch ? lo = m + 1 : hi = m; }
  return lo > 0 ? sessions[lo - 1] : null;
}

// Pre-index every Monday wick range across the full dataset.
// Per-day lookup: _mondayForDay(mondayRanges, dayEpoch) → O(log N).
function _buildMondayRanges(packed) {
  const { n, times } = packed;
  const monSet = new Set();
  // Epoch arithmetic: Jan 1 1970 was a Thursday (day 4). (floor(epoch/86400) + 4) % 7 → 0=Sun,1=Mon…
  for (let i = 0; i < n; i++) {
    if ((Math.floor(times[i] / 86400) + 4) % 7 === 1)
      monSet.add(times[i] - (times[i] % 86400));
  }
  const ranges = [];
  for (const epoch of [...monSet].sort((a, b) => a - b)) {
    const bars = extractBars(packed, epoch, epoch + 86400);
    if (bars.length < 20) continue;
    const r = mondayWickRange(bars);
    if (r) ranges.push({ epoch, high: r.high, low: r.low, range: r.range });
  }
  return ranges;
}

// Return the Monday range entry whose epoch matches this week's Monday.
function _mondayForDay(mondayRanges, dayEpoch) {
  const dow      = (Math.floor(dayEpoch / 86400) + 4) % 7;
  const daysBack = dow === 1 ? 7 : (dow === 0 ? 6 : dow - 1);
  const target   = dayEpoch - daysBack * 86400;
  // Find nearest entry — allow ±90s for DST edge cases
  let lo = 0, hi = mondayRanges.length;
  while (lo < hi) { const m = (lo + hi) >>> 1; mondayRanges[m].epoch < target ? lo = m + 1 : hi = m; }
  if (lo < mondayRanges.length && Math.abs(mondayRanges[lo].epoch - target) <= 90) return mondayRanges[lo];
  if (lo > 0 && Math.abs(mondayRanges[lo - 1].epoch - target) <= 90) return mondayRanges[lo - 1];
  return null;
}

// ── Fibonacci levels ──────────────────────────────────────────────────────────
// calcFibs imported from the fibProjection brick (same signature & output).

// Mark each current fib with hasConfluence / isTight / density using the LIVE
// confluence matcher (confluence-core.detectConfluencesCore), instead of the old
// bespoke per-fib threshold check. This brings the backtest in line with what the
// bot trades: the Pine-style session-range distance cap and the cluster merge
// (so two stacked prior fibs register as density ≥ 2, the live "dense zone").
// confluence-core keys on `.fib`; our fibs carry the ratio on `.level`.
function markConfluence(currFibs, prevFibs, { pipSize, normalDistance, tightDistance, mergeDistance, sessionRange }) {
  const today = currFibs.map(f => ({ price: f.price, fib: f.level }));
  const prev  = prevFibs.map(f => ({ price: f.price, fib: f.level }));
  const clusters = detectConfluencesCore(today, prev, {
    pipSize, normalDistance, tightDistance, mergeDistance,
    priceMode: 'midpoint', clusterMerge: true, sessionRange,
  });
  return currFibs.map(f => {
    const cl = clusters.find(c => (c.todayFibs ?? [c.todayFib]).includes(f.level));
    return cl
      ? { ...f, hasConfluence: true, isTight: cl.isTight, density: cl.density, confPrice: cl.price }
      : { ...f, hasConfluence: false, isTight: false, density: 0 };
  });
}

// ── WaveTrend 1 (WT1) ─────────────────────────────────────────────────────────
// VuManChu Cipher B core, now imported from the shared vumanchuCore brick so the
// backtest and the live signal share ONE implementation. `waveTrendSeries`
// returns one WT1 value per bar and is bit-identical to the previous private copy
// (same 1e-10 divide guard) — see js/vumanchuCore.test.mjs.
const _computeWT1Series = (bars, n1 = 10, n2 = 21) => waveTrendSeries(bars, { n1, n2 });

// Returns bar index of the first touch of `entry` for `side`, or -1 if never touched.
function findFirstTouch(bars, side, entry) {
  const isSell = side === 'SELL';
  for (let i = 0; i < bars.length; i++) {
    if (isSell ? bars[i].high >= entry : bars[i].low <= entry) return i;
  }
  return -1;
}

// ── Trade simulation ──────────────────────────────────────────────────────────

function walkLimitOrder(bars, side, entry, tp, sl, refOpen) {
  const isSell  = side === 'SELL';
  let filled    = false, fillTime = null;
  let mfeDist   = 0, maeDist = 0;  // track in price units after fill

  for (const bar of bars) {
    if (!filled) {
      const hit = isSell ? bar.high >= entry : bar.low <= entry;
      if (!hit) continue;
      filled   = true;
      fillTime = bar.time;
      // Same-bar both-hit tie-break is PESSIMISTIC: the stop is tested BEFORE the
      // target on every bar (incl. the fill bar), so a bar whose range spans both
      // SL and TP is booked as a loss. The intrabar path is unknown, so this must
      // stay SL-first — do not reorder these checks.
      if (isSell) {
        if (bar.high >= sl) return { outcome: 'loss', pnlPct: -(sl - entry) / refOpen * 100, fillTime, exitTime: bar.time, mfeDist: 0, maeDist: sl - entry };
        if (bar.low  <= tp) return { outcome: 'win',  pnlPct:  (entry - tp) / refOpen * 100, fillTime, exitTime: bar.time, mfeDist: entry - tp, maeDist: 0 };
        mfeDist = Math.max(0, entry - bar.low);
        maeDist = Math.max(0, bar.high - entry);
      } else {
        if (bar.low  <= sl) return { outcome: 'loss', pnlPct: -(entry - sl) / refOpen * 100, fillTime, exitTime: bar.time, mfeDist: 0, maeDist: entry - sl };
        if (bar.high >= tp) return { outcome: 'win',  pnlPct:  (tp - entry) / refOpen * 100, fillTime, exitTime: bar.time, mfeDist: tp - entry, maeDist: 0 };
        mfeDist = Math.max(0, bar.high - entry);
        maeDist = Math.max(0, entry - bar.low);
      }
    } else {
      if (isSell) {
        mfeDist = Math.max(mfeDist, entry - bar.low);
        maeDist = Math.max(maeDist, bar.high - entry);
        if (bar.high >= sl) return { outcome: 'loss', pnlPct: -(sl - entry) / refOpen * 100, fillTime, exitTime: bar.time, mfeDist, maeDist: sl - entry };
        if (bar.low  <= tp) return { outcome: 'win',  pnlPct:  (entry - tp) / refOpen * 100, fillTime, exitTime: bar.time, mfeDist: entry - tp, maeDist };
      } else {
        mfeDist = Math.max(mfeDist, bar.high - entry);
        maeDist = Math.max(maeDist, entry - bar.low);
        if (bar.low  <= sl) return { outcome: 'loss', pnlPct: -(entry - sl) / refOpen * 100, fillTime, exitTime: bar.time, mfeDist, maeDist: entry - sl };
        if (bar.high >= tp) return { outcome: 'win',  pnlPct:  (tp - entry) / refOpen * 100, fillTime, exitTime: bar.time, mfeDist: tp - entry, maeDist };
      }
    }
  }

  if (!filled) return null;
  const eod    = bars.at(-1)?.close ?? entry;
  const eodPnl = isSell ? (entry - eod) / refOpen * 100 : (eod - entry) / refOpen * 100;
  return { outcome: 'open', pnlPct: eodPnl, fillTime, exitTime: bars.at(-1)?.time ?? null, mfeDist, maeDist };
}

// ── Single-day backtest ───────────────────────────────────────────────────────

function simulateDay(packed, dateStr, opts) {
  const {
    confluenceThreshPips = 2.0,
    tightPct             = 10.0,
    levelFilter          = 'tight',    // 'tight' | 'confluence' | 'asia_monday' | 'all'
    levelSource          = 'asia',    // 'asia' | 'monday' | 'both'
    tradeZone            = 'outside',  // 'outside' | 'both'
    slMult               = 0.5,        // SL dist = asiaRange × slMult  (range_mult mode)
    tpMode               = '0.5',      // '0.5' | 'range_edge'
    tradeHourFrom        = 6,
    tradeHourTo          = 14,
    pipSize              = 0.0001,
    fibLevels            = FIB_LEVELS,
    showMonday           = true,
    // ATR-based SL/TP
    slMode               = 'range_mult', // 'range_mult' | 'atr30'
    atrSlMult            = 1.5,          // SL = atrSlMult × ATR30
    atrTpMult            = 2.0,          // TP = atrTpMult × SL distance
    atrPeriods           = 14,
    // Confluence module system
    confluenceMods       = [],           // enabled module objects
    pairCaches           = {},           // pre-built pair-level caches
    zoneRadiusPips       = 3,
    minConfluenceScore   = 0,            // 0–1 gate; 0 = off
    // Pre-built pair-level session caches (populated by runAsiaRangeBacktest)
    _asiaSessions        = null,         // sorted array of {epoch,high,low,range}
    _mondayRanges        = null,         // sorted array of {epoch,high,low,range}
    // ── Confluence Priority mode ─────────────────────────────────────────────
    confluencePriorityMode = false,      // rank all zones by hit count, take top N
    priorityTopN           = 5,          // how many top-ranked zones to simulate
    // ── WaveTrend at-touch confirmation ──────────────────────────────────────
    wtConfirmMode          = false,      // gate entry on WT1 OB/OS at zone touch
    wtDivergenceMode       = false,      // gate entry on price/WT1 divergence at touch
    wtBuyThresh            = -40,        // WT1 ≤ this → confirms BUY entry
    wtSellThresh           =  40,        // WT1 ≥ this → confirms SELL entry
    wtN1                   =  10,        // EMA period for ESA/D (channel index)
    wtN2                   =  21,        // EMA period for WT1 line
    wtDivLookback          =  30,        // bars to look back for divergence swing
  } = opts;

  const dayEpoch = Math.floor(new Date(dateStr + 'T00:00:00Z').getTime() / 1000);

  // Current Asia session bars (00:00–06:00 UTC)
  const asiaM1 = extractBars(packed, dayEpoch, dayEpoch + 6 * 3600);
  if (asiaM1.length < 10) return [];

  const asia = asiaBodyRange(asiaM1);
  if (!asia || asia.range < pipSize * 5) return [];

  // Previous Asia session — O(log N) binary search on pre-built cache, or fallback scan
  let prevAsia = null;
  if (_asiaSessions) {
    prevAsia = _prevAsia(_asiaSessions, dayEpoch);
  } else {
    for (let d = 1; d <= 7; d++) {
      const prevFrom = dayEpoch - d * 86400;
      const prevBars = extractBars(packed, prevFrom, prevFrom + 6 * 3600);
      if (prevBars.length >= 10) { prevAsia = asiaBodyRange(prevBars); if (prevAsia) break; }
    }
  }

  // Fibonacci levels for both sessions
  const currFibs = calcFibs(asia.low, asia.range, fibLevels);
  const prevFibs = prevAsia ? calcFibs(prevAsia.low, prevAsia.range, fibLevels) : [];

  // Confluence thresholds in price terms (match the live engine's caps config).
  const threshold      = confluenceThreshPips * pipSize;   // normalDistance
  const tightThreshold = threshold * (tightPct / 100);
  const mergeDistance  = threshold * (opts.mergeFactor ?? 0.30);  // live default mergeFactor

  const fibs = prevFibs.length
    ? markConfluence(currFibs, prevFibs, {
        pipSize, normalDistance: threshold, tightDistance: tightThreshold,
        mergeDistance, sessionRange: asia.range,   // ← the live distance cap (was missing)
      })
    : currFibs.map(f => ({ ...f, hasConfluence: false, isTight: false, density: 0 }));

  // Monday range + Monday fibs — O(log N) lookup if cache available
  let mondayRange = null;
  let mondayFibs  = [];
  {
    if (_mondayRanges) {
      mondayRange = _mondayForDay(_mondayRanges, dayEpoch);
    } else {
      const dow      = new Date(dateStr + 'T00:00:00Z').getUTCDay();
      const daysBack = dow === 1 ? 7 : (dow === 0 ? 6 : dow - 1);
      const monEpoch = dayEpoch - daysBack * 86400;
      const monBars  = extractBars(packed, monEpoch, monEpoch + 24 * 3600);
      if (monBars.length >= 20) mondayRange = mondayWickRange(monBars);
    }
    if (mondayRange) mondayFibs = calcFibs(mondayRange.low, mondayRange.range, fibLevels);
  }

  // Cross-alignment: flag each Asia fib that sits within confluenceThresh of a Monday fib
  // and each Monday fib that sits within confluenceThresh of an Asia fib.
  // Re-use the same confluenceThreshPips threshold — these are the zone boundaries.
  for (const af of fibs) {
    af.source        = 'asia';
    af.crossAligned  = mondayFibs.length > 0 && mondayFibs.some(mf => Math.abs(af.price - mf.price) <= threshold);
  }
  for (const mf of mondayFibs) {
    const asiaMatch  = fibs.some(af => Math.abs(af.price - mf.price) <= threshold);
    const asiaTight  = fibs.some(af => Math.abs(af.price - mf.price) <= tightThreshold);
    // For Monday fibs: treat Asia-fib alignment as the "confluence" signal so that
    // the existing levelFilter logic (tight/confluence/all) applies naturally.
    mf.hasConfluence = asiaMatch;
    mf.isTight       = asiaTight;
    mf.crossAligned  = asiaMatch;
    mf.source        = 'monday';
  }

  // Build candidate level list according to levelSource
  let candidates;
  let _bypassLevelFilter = false; // set true when levelSource handles its own per-source filtering
  if (levelSource === 'monday') {
    candidates = mondayFibs;
  } else if (levelSource === 'both') {
    // Union: all Asia fibs + Monday fibs not already covered by an Asia fib
    candidates = [...fibs];
    for (const mf of mondayFibs) {
      if (!fibs.some(af => Math.abs(af.price - mf.price) <= threshold)) {
        candidates.push(mf);
      }
    }
  } else if (levelSource === 'asia_tight_monday') {
    // Asia fibs filtered to tight only, PLUS Monday key fibs not already covered
    // levelFilter is bypassed — this mode has its own built-in per-source logic
    _bypassLevelFilter = true;
    const asiaT = fibs.filter(f => f.isTight);
    candidates = [...asiaT];
    for (const mf of mondayFibs) {
      if (mf.isKey && !asiaT.some(af => Math.abs(af.price - mf.price) <= threshold)) {
        candidates.push(mf);
      }
    }
  } else {
    candidates = fibs; // 'asia' default
  }

  // Trade window bars (06:00–14:00 UTC default)
  const tradeFrom = dayEpoch + tradeHourFrom * 3600;
  const tradeTo   = dayEpoch + tradeHourTo   * 3600;
  const tradeBars = extractBars(packed, tradeFrom, tradeTo);
  if (tradeBars.length < 5) return [];

  const refOpen  = tradeBars[0]?.open ?? asia.low + asia.range * 0.5;
  const asiaMid  = asia.low + asia.range * 0.5;

  // ATR30 — computed from 24h of bars ending at Asia close
  let atr30 = null;
  if (slMode === 'atr30') {
    const atrBars = extractBars(packed, dayEpoch + 6 * 3600 - 24 * 3600, dayEpoch + 6 * 3600);
    atr30 = calcATR30(atrBars, atrPeriods);
  }
  const slDist = (slMode === 'atr30' && atr30 != null)
    ? atr30 * atrSlMult
    : asia.range * slMult;

  // Confluence modules — build once-per-day states
  const enabledIds = new Set(confluenceMods.map(m => m.id));
  const dayStates  = confluenceMods.length > 0
    ? buildDayStates(packed, dayEpoch, pipSize, pairCaches, { ...opts, zoneRadiusPips }, enabledIds)
    : {};

  // Collect structural levels per module for chart overlay (stored on every trade)
  const _modOpts = {
    ...opts, zoneRadiusPips,
    asiaLow:    asia.low,
    asiaHigh:   asia.high,
    asiaCenter: asia.low + asia.range * 0.5,
    asiaRange:  asia.range,
  };
  const moduleLevels = confluenceMods.length > 0
    ? collectModuleLevels(dayStates, confluenceMods, _modOpts)
    : [];

  // Fib data for chart rendering — Asia fibs + Monday fibs (tagged by source)
  const fibData = [
    ...fibs.map(f => ({
      level: f.level, price: +f.price.toFixed(6),
      hasConfluence: f.hasConfluence, isTight: f.isTight, isKey: f.isKey,
      crossAligned: f.crossAligned, source: 'asia',
    })),
    ...mondayFibs.map(f => ({
      level: f.level, price: +f.price.toFixed(6),
      hasConfluence: f.hasConfluence, isTight: f.isTight, isKey: f.isKey,
      crossAligned: f.crossAligned, source: 'monday',
    })),
  ];

  // ── WaveTrend precomputation (one per day, shared across all fib candidates) ──
  // Build a WT1 value for every M1 bar in the trade window, with enough warmup bars
  // prepended so the EMA is properly seeded before the window starts.
  let _tradeBarsWt = null;
  if (wtConfirmMode || wtDivergenceMode) {
    const wtWarmup  = (wtN1 + wtN2) * 4;          // extra bars before trade window
    const wtAllBars = extractBars(packed, tradeFrom - wtWarmup * 60, tradeTo);
    if (wtAllBars.length >= wtN1 + wtN2) {
      const wtAll    = _computeWT1Series(wtAllBars, wtN1, wtN2);
      const timeToWt = new Map(wtAllBars.map((b, i) => [b.time, wtAll[i]]));
      _tradeBarsWt   = tradeBars.map(b => timeToWt.get(b.time) ?? NaN);
    }
  }

  const trades = [];

  // ── PASS 1: filter candidates and score every valid zone ─────────────────────
  // (module checks run once here; result reused in pass 3 — no double computation)
  const _scored = [];
  for (const fib of candidates) {
    if (!_bypassLevelFilter) {
      if (levelFilter === 'tight'       && !fib.isTight)      continue;
      if (levelFilter === 'confluence'  && !fib.hasConfluence) continue;
      if (levelFilter === 'asia_monday' && !fib.crossAligned)  continue;
      if (levelFilter !== 'all' && levelFilter !== 'asia_monday' && !fib.hasConfluence && !fib.isKey) continue;
    }
    const price   = fib.price;
    const isAbove = price > asia.high + pipSize;
    const isBelow = price < asia.low  - pipSize;
    if (tradeZone === 'outside' && !isAbove && !isBelow) continue;
    const pSide = isAbove ? 'SELL' : isBelow ? 'BUY' : (price > asiaMid ? 'SELL' : 'BUY');
    const mc    = confluenceMods.length > 0
      ? runModuleChecks(price, pSide, dayStates, confluenceMods, { ...opts, zoneRadiusPips })
      : { results: {}, hits: 0, total: 0, score: 0, pct: 0 };
    _scored.push({ fib, pSide, mc, isAbove, isBelow });
  }

  // ── PASS 2: rank by confluence density (priority mode) or preserve order ──────
  let _ranked;
  if (confluencePriorityMode && confluenceMods.length > 0) {
    _ranked = [..._scored]
      .sort((a, b) => b.mc.hits - a.mc.hits || b.mc.score - a.mc.score)
      .slice(0, priorityTopN)
      .map((s, i) => ({ ...s, priorityRank: i + 1 }));
  } else {
    _ranked = _scored.map(s => ({ ...s, priorityRank: null }));
  }

  // ── PASS 3: simulate entry for each ranked candidate ─────────────────────────
  for (const { fib, pSide: prelimSide, mc: modChecks, isAbove, isBelow, priorityRank } of _ranked) {
    // Score gate applies in non-priority mode only (priority mode already selected top N)
    if (!confluencePriorityMode && confluenceMods.length > 0 && minConfluenceScore > 0 && modChecks.score < minConfluenceScore) continue;

    const price  = fib.price;
    let side, tp, sl;
    const useAtr = slMode === 'atr30' && atr30 != null;
    const tpDist = useAtr ? slDist * atrTpMult : null;

    if (isAbove) {
      side = 'SELL';
      tp   = useAtr ? price - tpDist : (tpMode === 'range_edge' ? asia.high : asiaMid);
      sl   = price + slDist;
    } else if (isBelow) {
      side = 'BUY';
      tp   = useAtr ? price + tpDist : (tpMode === 'range_edge' ? asia.low : asiaMid);
      sl   = price - slDist;
    } else {
      if (price > asiaMid) { side = 'SELL'; tp = asiaMid; sl = asia.high + slDist; }
      else                 { side = 'BUY';  tp = asiaMid; sl = asia.low  - slDist; }
    }

    if (side === 'SELL' && tp >= price) continue;
    if (side === 'BUY'  && tp <= price) continue;
    if (side === 'SELL' && sl <= price) continue;
    if (side === 'BUY'  && sl >= price) continue;

    // ── WaveTrend at-touch confirmation ────────────────────────────────────────
    // Checks WT1 value at the FIRST bar where price reaches the zone.
    // wtConfirmMode: only enter if WT1 shows OB/OS (market momentum exhausted at touch).
    // wtDivergenceMode: only enter if price makes a new extreme but WT1 does NOT confirm
    //   (classic reversal divergence — strongest version of exhaustion signal).
    // Both modes can be stacked: OB/OS check runs first, divergence check second.
    let wtAtTouch = null, wtConfirmed = null, wtDivDetected = null;
    if ((wtConfirmMode || wtDivergenceMode) && _tradeBarsWt) {
      const touchIdx = findFirstTouch(tradeBars, side, price);
      if (touchIdx < 0 || isNaN(_tradeBarsWt[touchIdx])) continue;

      const wt  = _tradeBarsWt[touchIdx];
      wtAtTouch = +wt.toFixed(2);

      if (wtConfirmMode) {
        wtConfirmed = side === 'BUY' ? wt <= wtBuyThresh : wt >= wtSellThresh;
        if (!wtConfirmed) continue;
      }

      if (wtDivergenceMode) {
        const lbStart = Math.max(0, touchIdx - wtDivLookback);
        const pSlice  = tradeBars.slice(lbStart, touchIdx);
        const wSlice  = _tradeBarsWt.slice(lbStart, touchIdx);
        if (pSlice.length >= 5) {
          if (side === 'BUY') {
            // Bullish divergence: price lower low, WT1 higher low
            let lIdx = 0;
            for (let i = 1; i < pSlice.length; i++) if (pSlice[i].low < pSlice[lIdx].low) lIdx = i;
            wtDivDetected = !isNaN(wSlice[lIdx]) && tradeBars[touchIdx].low <= pSlice[lIdx].low && wt > wSlice[lIdx];
          } else {
            // Bearish divergence: price higher high, WT1 lower high
            let hIdx = 0;
            for (let i = 1; i < pSlice.length; i++) if (pSlice[i].high > pSlice[hIdx].high) hIdx = i;
            wtDivDetected = !isNaN(wSlice[hIdx]) && tradeBars[touchIdx].high >= pSlice[hIdx].high && wt < wSlice[hIdx];
          }
        } else {
          wtDivDetected = false;
        }
        if (!wtDivDetected) continue;
      }
    }

    const result = walkLimitOrder(tradeBars, side, price, tp, sl, refOpen);
    if (!result) continue;

    const riskDist   = Math.abs(price - sl);
    const rewardDist = Math.abs(tp - price);
    const rr         = riskDist > 0 ? rewardDist / riskDist : 0;
    const mfeR       = riskDist > 0 ? +(result.mfeDist / riskDist).toFixed(3) : 0;
    const maeR       = riskDist > 0 ? +(result.maeDist / riskDist).toFixed(3) : 0;

    const rangePips   = +(asia.range / pipSize).toFixed(1);
    const rangeBucket = rangePips < 20 ? 'tiny' : rangePips < 40 ? 'small' : rangePips < 70 ? 'medium' : rangePips < 120 ? 'large' : 'huge';
    const lvl         = fib.level;
    const levelZone   = lvl < -2 ? 'deep_neg' : lvl < 0 ? 'outer_neg' : lvl <= 1 ? 'inner' : lvl <= 2 ? 'outer_pos' : 'deep_pos';

    const fillHour      = result.fillTime ? new Date(result.fillTime * 1000).getUTCHours() : -1;
    const sessionFilled = fillHour < 0 ? null : fillHour < 6 ? 'Asia' : fillHour < 13 ? 'London' : fillHour < 16 ? 'Overlap' : 'NY';

    const DOW_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const dow       = DOW_NAMES[new Date(dateStr + 'T12:00:00Z').getUTCDay()];

    const mondayAligned = mondayRange
      ? (Math.abs(price - mondayRange.high) <= pipSize * 10 || Math.abs(price - mondayRange.low) <= pipSize * 10)
      : false;

    trades.push({
      date:             dateStr,
      side,
      outcome:          result.outcome,
      pnl_pct:          +result.pnlPct.toFixed(5),
      filled:           true,
      fib_level:        fib.level,
      entry_price:      +price.toFixed(6),
      tp_price:         +tp.toFixed(6),
      sl_price:         +sl.toFixed(6),
      fill_time:        result.fillTime ? new Date(result.fillTime  * 1000).toISOString().substring(0, 19) : null,
      exit_time:        result.exitTime ? new Date(result.exitTime  * 1000).toISOString().substring(0, 19) : null,
      has_confluence:   fib.hasConfluence,
      is_tight:         fib.isTight,
      is_key:           fib.isKey,
      level_source:     fib.source ?? 'asia',
      monday_fib_align: fib.crossAligned ?? false,
      asia_high:        +asia.high.toFixed(6),
      asia_low:         +asia.low.toFixed(6),
      asia_range:       +asia.range.toFixed(6),
      asia_mid:         +asiaMid.toFixed(6),
      rr:               +rr.toFixed(2),
      mfe_r:            mfeR,
      mae_r:            maeR,
      asia_range_pips:  rangePips,
      range_bucket:     rangeBucket,
      level_zone:       levelZone,
      dow,
      session_filled:   sessionFilled,
      monday_aligned:   mondayAligned,
      monday_high:      mondayRange ? +mondayRange.high.toFixed(6) : null,
      monday_low:       mondayRange ? +mondayRange.low.toFixed(6)  : null,
      fib_data:         fibData,
      sl_mode:          slMode,
      atr30:            atr30 != null ? +atr30.toFixed(6) : null,
      confluences:          modChecks.results,
      confluence_hits:      modChecks.hits,
      confluence_total:     modChecks.total,
      confluence_score:     modChecks.score,
      confluence_pct:       modChecks.pct,
      module_levels:        moduleLevels,
      // Confluence Priority mode
      priority_rank:        priorityRank,
      // WaveTrend at-touch
      wt_at_touch:          wtAtTouch,
      wt_confirmed:         wtConfirmed,
      wt_divergence:        wtDivDetected,
    });
  }

  return trades;
}

// ── Module-level pair data cache ─────────────────────────────────────────────
// Keeps parsed M1 + session indices in memory across requests.
// M1 data is immutable for the day — 6h TTL is a safety net against stale data.

const _pairDataCache = new Map(); // pairKey → { packed, asiaSessions, mondayRanges, ts }
const _PAIR_CACHE_TTL = 6 * 3600 * 1000; // 6 hours in ms

async function _getOrBuildPairData(pairKey, m1Dir) {
  const now    = Date.now();
  const cached = _pairDataCache.get(pairKey);
  if (cached && now - cached.ts < _PAIR_CACHE_TTL) return cached;

  const packed = await loadM1ForPair(pairKey, m1Dir);
  if (!packed) return null;

  const entry = {
    packed,
    asiaSessions: _buildAsiaSessions(packed),
    mondayRanges: _buildMondayRanges(packed),
    ts: now,
  };
  _pairDataCache.set(pairKey, entry);
  return entry;
}

/** Force-invalidate the cache for a pair (or all pairs if pairKey omitted). */
export function clearPairDataCache(pairKey) {
  if (pairKey) _pairDataCache.delete(pairKey);
  else         _pairDataCache.clear();
}

// ── Public: single pair backtest ──────────────────────────────────────────────

export async function runAsiaRangeBacktest(pairKey, opts = {}, m1Dir = BT_M1_DIR) {
  const { dateFrom = '', dateTo = '', progressCb = null } = opts;

  const pairData = await _getOrBuildPairData(pairKey, m1Dir);
  if (!pairData) throw new Error(`No M1 data for ${pairKey}`);
  const { packed, asiaSessions: _asiaSessions, mondayRanges: _mondayRanges } = pairData;

  const pipSize    = PIP_SIZE[pairKey] ?? 0.0001;

  // Confluence module caches (swing levels, daily extremes, etc.)
  const pairCaches = (opts.confluenceMods?.length > 0)
    ? buildAllPairCaches(packed, pipSize, opts.confluenceMods)
    : {};

  const config = { ...opts, pipSize, pairCaches, _asiaSessions, _mondayRanges };

  // Collect UTC dates that have bars in the Asia session window
  const seenDates = new Set();
  const { n, times } = packed;
  for (let i = 0; i < n; i++) {
    const h = Math.floor(times[i] / 3600) % 24;
    if (h >= 0 && h < 6) seenDates.add(new Date(times[i] * 1000).toISOString().substring(0, 10));
  }

  const allDates = [...seenDates].sort();
  const trades   = [];
  let   processed = 0;

  for (const date of allDates) {
    if (dateFrom && date < dateFrom) { processed++; continue; }
    if (dateTo   && date > dateTo)   { processed++; continue; }

    const dayTrades = simulateDay(packed, date, config);
    for (const t of dayTrades) trades.push({ instrument: pairKey.toUpperCase(), ...t });

    processed++;
    if (progressCb && processed % 50 === 0) progressCb(processed, allDates.length);
  }

  return trades;
}

// ── Public: all pairs backtest ────────────────────────────────────────────────

export async function runFullAsiaRangeBacktest(opts = {}, pairs = ASIA_INSTRUMENTS, m1Dir = BT_M1_DIR) {
  const { onProgress = null } = opts;
  const allTrades = [];
  const log       = [];

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    if (onProgress) onProgress({ pair, i, total: pairs.length });
    try {
      log.push(`Processing ${pair.toUpperCase()}…`);
      const trades = await runAsiaRangeBacktest(pair, opts, m1Dir);
      allTrades.push(...trades);
      log.push(`  ${trades.filter(t => t.filled).length} filled trades`);
    } catch (e) {
      log.push(`  Error for ${pair}: ${e.message}`);
    }
  }

  return { trades: allTrades, log };
}
