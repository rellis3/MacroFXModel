/**
 * Range-Fib Backtester — STRIPPED engine.
 *
 * The bare range-extension strategy, nothing else. No confluence requirement,
 * no WaveTrend, no confluence modules, no priority ranking, no ATR modes.
 *
 *   Asia range:   5m  body high/low  (00:00–06:00 UTC)
 *   Monday range: 15m body high/low  (full Monday UTC)   — optional level source
 *   Fib levels:   range EXTENSIONS — price = low + range × level   (45-level set)
 *   Entry:        limit order at a fib level, inside the trade window
 *                   • extension level ABOVE the range  → SELL (fade the extension)
 *                   • extension level BELOW the range  → BUY
 *                   • inside-range level (tradeZone='both') → context by midpoint
 *   Stop:         range-based — SL dist = asiaRange × slMult, floored at minSlPips
 *   Target:       'structural' (next enabled fib level toward target, minus buffer)
 *                 | 'rr' (fixed R multiple) | 'midpoint' (back to range mid)
 *   Exit:         walked on 1-minute bars, chronologically, ONE position at a time.
 *                 SL checked before TP within a bar (pessimistic). EOD close at window end.
 *   Costs:        (spread + slippage) pips deducted from every trade.
 *
 * This is intentionally small (range calc + fib projection + entry/exit walk) so the
 * base edge can be validated honestly before any selectivity layer is added back.
 */

import { loadM1ForPair, BT_M1_DIR } from './volBacktestM1Engine.js';

// ── Constants ─────────────────────────────────────────────────────────────────

// Range-extension multiples (NOT statistical SDs). 0 = range low, 1 = range high.
export const FIB_LEVELS = [
  -9.5, -9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5,
  -4.5, -4, -3.5, -3, -2.5, -2, -1.5, -1, -0.5, -0.25,
  0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3,
  3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8,
  8.5, 9, 9.5, 10, 10.5,
];
const KEY_LEVELS = new Set([0, 0.25, 0.5, 0.75, 1.0]);

export const PIP_SIZE = {
  eurusd: 0.0001, gbpusd: 0.0001, audusd: 0.0001, nzdusd: 0.0001,
  usdcad: 0.0001, usdchf: 0.0001, eurgbp: 0.0001, euraud: 0.0001,
  eurcad: 0.0001, eurchf: 0.0001, eurnzd: 0.0001, audnzd: 0.0001,
  audcad: 0.0001, audchf: 0.0001, gbpaud: 0.0001, gbpcad: 0.0001,
  gbpchf: 0.0001, gbpnzd: 0.0001,
  usdjpy: 0.01, eurjpy: 0.01, gbpjpy: 0.01, audjpy: 0.01,
  cadjpy: 0.01, chfjpy: 0.01, nzdjpy: 0.01,
  gold:   0.1,
};

export const RANGE_FIB_INSTRUMENTS = [
  'eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf', 'gbpjpy',
  'eurjpy', 'eurgbp', 'euraud', 'eurcad', 'eurchf', 'eurnzd',
  'audjpy', 'audnzd', 'audcad', 'audchf',
  'gbpaud', 'gbpcad', 'gbpchf', 'gbpnzd',
  'cadjpy', 'chfjpy', 'nzdjpy', 'gold',
];

// ── M1 packed-array helpers (self-contained copies) ───────────────────────────

// Binary search: first index where times[i] >= target. O(log N).
function _bisect(times, target) {
  let lo = 0, hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (times[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function extractBars(packed, fromEpoch, toEpoch) {
  const { n, times, opens, highs, lows, closes } = packed;
  const start = _bisect(times, fromEpoch);
  const bars  = [];
  for (let i = start; i < n && times[i] < toEpoch; i++) {
    bars.push({ time: times[i], open: opens[i], high: highs[i], low: lows[i], close: closes[i] });
  }
  return bars;
}

function resampleTo(bars, minutes) {
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

// ── Session range calculators (bodies only) ───────────────────────────────────

function bodyRange(m1Bars, minutes) {
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

const asiaBodyRange = (m1) => bodyRange(m1, 5);    // 5m bodies, Asia window

// ── ATR (resampled to a higher timeframe, true-range average) ─────────────────

function calcATR(m1Bars, tfMin, period = 14) {
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

// ── Timezone (Europe/London, DST-aware) ───────────────────────────────────────
// London is UTC in winter and UTC+1 (BST) from the last Sunday of March to the
// last Sunday of October. Transitions happen at 01:00 UTC; we treat the offset
// as constant across each calendar day (≤1h imprecision on the 2 switch days/yr).

function _lastSundayDate(year, monthIdx0) {
  const lastDay = new Date(Date.UTC(year, monthIdx0 + 1, 0));
  return lastDay.getUTCDate() - lastDay.getUTCDay();
}
function _londonOffsetHours(y, mo /*1-12*/, d) {
  const marSun = _lastSundayDate(y, 2);   // March
  const octSun = _lastSundayDate(y, 9);   // October
  const afterMar  = mo > 3  || (mo === 3  && d >= marSun);
  const beforeOct = mo < 10 || (mo === 10 && d <  octSun);
  return (afterMar && beforeOct) ? 1 : 0;
}
// UTC epoch (seconds) of local midnight for `dateStr` ('YYYY-MM-DD') in tz.
function dayStartEpoch(dateStr, tz) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const utcMidnight = Date.UTC(y, mo - 1, d) / 1000;
  if (tz === 'london') return utcMidnight - _londonOffsetHours(y, mo, d) * 3600;
  return utcMidnight;
}
// Day-of-week (0=Sun..6=Sat) of a calendar date in tz (date-only → tz-agnostic).
function _dowOf(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}
function _isoDate(epochSec) { return new Date(epochSec * 1000).toISOString().substring(0, 10); }

// ── Fib projection ────────────────────────────────────────────────────────────

function calcFibs(low, range, levels) {
  return levels.map(lv => ({ level: lv, price: low + range * lv, isKey: KEY_LEVELS.has(lv) }));
}

// ── Pre-built session caches (fast previous-Asia / Monday lookup) ─────────────

// Iterate every calendar date spanned by the data (in `tz`).
function _eachDate(packed, fn) {
  const { n, times } = packed;
  if (!n) return;
  let cur = Date.UTC(...(_isoDate(times[0]).split('-').map((v, i) => i === 1 ? +v - 1 : +v)));
  const end = Date.UTC(...(_isoDate(times[n - 1]).split('-').map((v, i) => i === 1 ? +v - 1 : +v)));
  for (; cur <= end; cur += 86400 * 1000) fn(new Date(cur).toISOString().substring(0, 10));
}

function _buildAsiaSessions(packed, tz) {
  // One Asia range per calendar date (00:00–06:00 local).
  const out = [];
  _eachDate(packed, (ds) => {
    const start = dayStartEpoch(ds, tz);
    const bars  = extractBars(packed, start, start + 6 * 3600);
    if (bars.length < 10) return;
    const r = asiaBodyRange(bars);
    if (r) out.push({ epoch: start, date: ds, ...r });
  });
  return out.sort((a, b) => a.epoch - b.epoch);
}

function _buildMondayRanges(packed, tz, mondayTfMin) {
  // One range per Monday (full local Monday), bodies on the chosen timeframe.
  const out = [];
  _eachDate(packed, (ds) => {
    if (_dowOf(ds) !== 1) return; // 1 = Monday
    const start = dayStartEpoch(ds, tz);
    const bars  = extractBars(packed, start, start + 24 * 3600);
    if (bars.length < 20) return;
    const r = bodyRange(bars, mondayTfMin);
    if (r) out.push({ epoch: start, date: ds, ...r });
  });
  return out.sort((a, b) => a.epoch - b.epoch);
}

function _prevAsia(sessions, dayEpoch) {
  let prev = null;
  for (const s of sessions) { if (s.epoch >= dayEpoch) break; prev = s; }
  return prev;
}

function _mondayForDay(ranges, dayEpoch) {
  // Most recent Monday on/before this day, within the same week.
  let mon = null;
  for (const m of ranges) { if (m.epoch > dayEpoch) break; mon = m; }
  if (!mon) return null;
  return (dayEpoch - mon.epoch) < 7 * 86400 ? mon : null;
}

function _prevMonday(ranges, mondayEpoch) {
  // The Monday range immediately before the given Monday.
  let prev = null;
  for (const m of ranges) { if (m.epoch >= mondayEpoch) break; prev = m; }
  return prev;
}

function _minAdjacentGap(levels) {
  const sorted = [...levels].sort((a, b) => a - b);
  let min = Infinity;
  for (let i = 1; i < sorted.length; i++) min = Math.min(min, sorted[i] - sorted[i - 1]);
  return isFinite(min) && min > 0 ? min : 0.25;
}

// ── Single-day simulation (chronological, one position at a time) ─────────────

function simulateDay(packed, dateStr, opts) {
  const {
    levelSource   = 'asia',     // 'asia' | 'monday' | 'both'
    tradeZone     = 'outside',  // 'outside' (extensions only) | 'both' (incl. inside levels)
    enabledFibs   = null,       // Set of allowed fib multiples, or null = all
    slMult        = 0.5,        // SL dist = asiaRange × slMult
    minSlPips     = 5,          // SL floor in pips
    tpMode        = 'structural', // 'structural' | 'rr' | 'midpoint'
    tpR           = 2.0,        // R multiple when tpMode='rr'
    tpBufPips     = 5,          // buffer subtracted from structural TP level
    tradeHourFrom = 6,          // entry window start (local session hour)
    tradeHourTo   = 22,         // entry window end   (local session hour)
    spreadPips    = 0.8,
    slippagePips  = 0.5,
    // ── Stop-loss mode ────────────────────────────────────────────────────────
    slMode        = 'range',    // 'range' (asiaRange × slMult) | 'atr' (ATR × atrMult)
    atrPeriod     = 14,
    atrMult       = 1.5,
    atrTfMin      = 30,         // ATR timeframe in minutes (indicator default 30m)
    // ── Session timezone / Monday timeframe ───────────────────────────────────
    sessionTz     = 'utc',      // 'utc' | 'london' (DST-aware, matches indicator)
    mondayTfMin   = 15,         // Monday range timeframe in minutes (15 or 30)
    // ── Confluence filter (today's fib ≈ previous session's fib) ──────────────
    // Mirrors the indicator's Display Mode:
    //   'all'       — trade every level (confluence off; the bare baseline)
    //   'strong'    — only levels with a standard (orange) confluence
    //   'strongest' — only levels with a tight (green) confluence
    confluenceMode    = 'all',
    confluenceThreshPips = 2.0,   // standard tolerance (pips); auto-set to 200 for gold upstream
    tightPct          = 10.0,     // tight tolerance = threshold × tightPct%  (green)
    confluencePrice   = 'lowest', // 'lowest' | 'highest' | 'midpoint' — which of the pair to enter at
    pipSize       = 0.0001,
    fibLevels     = FIB_LEVELS,
    _asiaSessions = null,
    _mondayRanges = null,
  } = opts;

  const dayEpoch = dayStartEpoch(dateStr, sessionTz);   // local midnight (UTC epoch)

  // Asia range (current day)
  const asiaM1 = extractBars(packed, dayEpoch, dayEpoch + 6 * 3600);
  if (asiaM1.length < 10) return [];
  const asia = asiaBodyRange(asiaM1);
  if (!asia || asia.range < pipSize * 5) return [];

  // Monday range (if used)
  let monday = null;
  if (levelSource !== 'asia') {
    monday = _mondayRanges ? _mondayForDay(_mondayRanges, dayEpoch) : null;
    if (!monday && !_mondayRanges) {
      const dow      = _dowOf(dateStr);
      const daysBack = dow === 1 ? 7 : (dow === 0 ? 6 : dow - 1);
      const monEpoch = dayStartEpoch(_isoDate(dayEpoch - daysBack * 86400), sessionTz);
      const monBars  = extractBars(packed, monEpoch, monEpoch + 24 * 3600);
      if (monBars.length >= 20) monday = bodyRange(monBars, mondayTfMin);
    }
  }

  // Build the level list (price-sorted) from the requested source(s)
  const sources = [];
  if (levelSource === 'asia' || levelSource === 'both') {
    for (const f of calcFibs(asia.low, asia.range, fibLevels)) sources.push({ ...f, source: 'asia' });
  }
  if ((levelSource === 'monday' || levelSource === 'both') && monday) {
    for (const f of calcFibs(monday.low, monday.range, fibLevels)) sources.push({ ...f, source: 'monday' });
  }
  if (!sources.length) return [];

  // ── Confluence prep: previous-session fib prices + distance thresholds ───────
  let prevAsiaPrices = [], prevMondayPrices = [];
  let asiaConfDist = 0, monConfDist = 0, tightDist = 0;
  if (confluenceMode !== 'all') {
    const threshPrice = confluenceThreshPips * pipSize;
    tightDist = threshPrice * (tightPct / 100);          // green — uses uncapped threshold
    const minGap = _minAdjacentGap(fibLevels);           // 0.25 for the default set
    // Standard (orange) tolerance is capped at 0.5× the min adjacent fib gap so a
    // level can't match more than one neighbour on small ranges (mirrors the indicator).
    asiaConfDist = Math.min(threshPrice, asia.range * minGap * 0.5);

    // Previous Asia session fib prices
    let prevAsia = _asiaSessions ? _prevAsia(_asiaSessions, dayEpoch) : null;
    if (!prevAsia && !_asiaSessions) {
      for (let d = 1; d <= 7; d++) {
        const pf = dayEpoch - d * 86400;
        const pb = extractBars(packed, pf, pf + 6 * 3600);
        if (pb.length >= 10) { prevAsia = asiaBodyRange(pb); if (prevAsia) break; }
      }
    }
    if (prevAsia) prevAsiaPrices = fibLevels.map(lv => prevAsia.low + prevAsia.range * lv);

    // Previous Monday fib prices (cache path only)
    if (levelSource !== 'asia' && monday && monday.epoch != null && _mondayRanges) {
      const prevMon = _prevMonday(_mondayRanges, monday.epoch);
      if (prevMon) {
        monConfDist = Math.min(threshPrice, monday.range * minGap * 0.5);
        prevMondayPrices = fibLevels.map(lv => prevMon.low + prevMon.range * lv);
      }
    }
  }

  // Stop distance: range-based or ATR-based (ATR taken from the 24h ending at Asia close)
  let slDist;
  if (slMode === 'atr') {
    const atrBars = extractBars(packed, dayEpoch + 6 * 3600 - 24 * 3600, dayEpoch + 6 * 3600);
    const atr = calcATR(atrBars, atrTfMin, atrPeriod);
    slDist = Math.max((atr != null ? atr * atrMult : asia.range * slMult), minSlPips * pipSize);
  } else {
    slDist = Math.max(asia.range * slMult, minSlPips * pipSize);
  }
  const asiaMid = asia.low + asia.range * 0.5;
  const above   = asia.high + pipSize;   // strictly outside thresholds
  const below   = asia.low  - pipSize;

  // ── PASS 1: gather qualifying levels (zone + confluence filter), assign side/SL ──
  const cands = [];
  for (const f of sources) {
    if (enabledFibs && !enabledFibs.has(f.level)) continue;

    // Confluence filter — today's fib vs previous session's fib
    let hasConf = false, isTight = false, confDistPips = null, price = f.price;
    if (confluenceMode !== 'all') {
      const prevPrices = f.source === 'monday' ? prevMondayPrices : prevAsiaPrices;
      const confDist   = f.source === 'monday' ? monConfDist : asiaConfDist;
      if (!prevPrices.length) continue; // no prior session → no confluence possible
      let best = Infinity, bestPrev = null;
      for (const pp of prevPrices) { const d = Math.abs(f.price - pp); if (d < best) { best = d; bestPrev = pp; } }
      hasConf = best <= confDist;
      isTight = best <= tightDist;
      if (confluenceMode === 'strong'    && !hasConf) continue;
      if (confluenceMode === 'strongest' && !isTight) continue;
      confDistPips = +(best / pipSize).toFixed(2);
      // Enter at the selected price of the confluent pair
      price = confluencePrice === 'highest'  ? Math.max(f.price, bestPrev)
            : confluencePrice === 'midpoint' ? (f.price + bestPrev) / 2
            :                                  Math.min(f.price, bestPrev);
    }

    const isAbove = price >= above;
    const isBelow = price <= below;
    if (tradeZone === 'outside' && !isAbove && !isBelow) continue; // skip inside-range levels

    let side, sl;
    if (isAbove)      { side = 'SELL'; sl = price + slDist; }
    else if (isBelow) { side = 'BUY';  sl = price - slDist; }
    else { // inside range, context by midpoint
      if (price > asiaMid) { side = 'SELL'; sl = asia.high + slDist; }
      else                 { side = 'BUY';  sl = asia.low  - slDist; }
    }
    cands.push({ ...f, side, entry: price, sl, riskDist: Math.abs(price - sl), hasConf, isTight, confDistPips });
  }
  if (!cands.length) return [];

  // ── PASS 2: structural TP targets the next QUALIFYING level (confluence zone)
  //    when a confluence mode is active; otherwise every fib level. ─────────────
  const tpTargets = (confluenceMode === 'all' ? sources.map(s => s.price) : cands.map(c => c.entry))
    .slice().sort((a, b) => a - b);
  const levels = [];
  for (const c of cands) {
    const { side, entry: price, sl, riskDist } = c;
    let tp;
    if (tpMode === 'rr') {
      tp = side === 'SELL' ? price - riskDist * tpR : price + riskDist * tpR;
    } else if (tpMode === 'midpoint') {
      tp = asiaMid;
    } else { // structural — next qualifying level toward target, minus buffer
      const buf = tpBufPips * pipSize;
      if (side === 'SELL') {
        const below_ = tpTargets.filter(p => p < price - buf);
        tp = below_.length ? below_[below_.length - 1] + buf : price - riskDist * tpR;
      } else {
        const above_ = tpTargets.filter(p => p > price + buf);
        tp = above_.length ? above_[0] - buf : price + riskDist * tpR;
      }
    }

    // Sanity: TP must be in profit direction, SL in loss direction
    if (side === 'SELL' && (tp >= price || sl <= price)) continue;
    if (side === 'BUY'  && (tp <= price || sl >= price)) continue;

    levels.push({ ...c, tp });
  }
  if (!levels.length) return [];

  // Trade-window 1m bars
  const tradeFrom = dayEpoch + tradeHourFrom * 3600;
  const tradeTo   = dayEpoch + tradeHourTo   * 3600;
  const bars      = extractBars(packed, tradeFrom, tradeTo);
  if (bars.length < 5) return [];
  const refOpen = bars[0].open;

  const DOW_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dow       = DOW_NAMES[new Date(dateStr + 'T12:00:00Z').getUTCDay()];
  const costPips  = spreadPips + slippagePips;

  // Chronological single-position walk. First untouched level reached gets entered;
  // hold until SL/TP/EOD; then go flat and look for the next level. Each level once/day.
  const trades = [];
  const usedLevels = new Set();
  let pos = null; // { ...level, fillTime, mfe, mae }

  const closeTrade = (exitPrice, exitTime, outcome) => {
    const isSell  = pos.side === 'SELL';
    const grossPips = (isSell ? (pos.entry - exitPrice) : (exitPrice - pos.entry)) / pipSize;
    const netPips   = grossPips - costPips;
    const slPips    = pos.riskDist / pipSize;
    trades.push({
      instrument:  null, // filled in by caller
      date:        dateStr,
      side:        pos.side,
      outcome,
      fib_level:   pos.level,
      level_source: pos.source,
      is_key:      pos.isKey,
      has_confluence: pos.hasConf ?? false,
      is_tight:       pos.isTight ?? false,
      conf_dist_pips: pos.confDistPips ?? null,
      entry_price: +pos.entry.toFixed(6),
      sl_price:    +pos.sl.toFixed(6),
      tp_price:    +pos.tp.toFixed(6),
      exit_price:  +exitPrice.toFixed(6),
      gross_pips:  +grossPips.toFixed(1),
      net_pips:    +netPips.toFixed(1),
      sl_pips:     +slPips.toFixed(1),
      r:           slPips > 0 ? +(netPips / slPips).toFixed(3) : 0,
      mfe_r:       slPips > 0 ? +(pos.mfe / pos.riskDist).toFixed(3) : 0,
      mae_r:       slPips > 0 ? +(pos.mae / pos.riskDist).toFixed(3) : 0,
      fill_time:   new Date(pos.fillTime * 1000).toISOString().substring(0, 19),
      exit_time:   new Date(exitTime     * 1000).toISOString().substring(0, 19),
      asia_high:   +asia.high.toFixed(6),
      asia_low:    +asia.low.toFixed(6),
      asia_range:  +asia.range.toFixed(6),
      asia_mid:    +asiaMid.toFixed(6),
      asia_range_pips: +(asia.range / pipSize).toFixed(1),
      dow,
    });
    pos = null;
  };

  const lvlKey = (lv) => lv.level + ':' + lv.source;

  for (const bar of bars) {
    // 1) Manage an open position first (SL before TP within a bar — pessimistic).
    if (pos) {
      const isSell = pos.side === 'SELL';
      pos.mfe = Math.max(pos.mfe, isSell ? pos.entry - bar.low  : bar.high - pos.entry);
      pos.mae = Math.max(pos.mae, isSell ? bar.high - pos.entry : pos.entry - bar.low);
      if (isSell) {
        if (bar.high >= pos.sl)      closeTrade(pos.sl, bar.time, 'loss');
        else if (bar.low <= pos.tp)  closeTrade(pos.tp, bar.time, 'win');
      } else {
        if (bar.low <= pos.sl)       closeTrade(pos.sl, bar.time, 'loss');
        else if (bar.high >= pos.tp) closeTrade(pos.tp, bar.time, 'win');
      }
    }

    // 2) Consume every level whose price traded inside this bar's range.
    //    A resting limit fills the FIRST time price trades AT the level (low ≤ L ≤ high).
    //    If we're flat, fill the in-bar level nearest the bar open (first reached);
    //    any other in-bar level is marked used (its limit would also have filled → missed).
    const inBar = levels.filter(lv => !usedLevels.has(lvlKey(lv)) && bar.low <= lv.entry && bar.high >= lv.entry);
    if (inBar.length) {
      inBar.sort((a, b) => Math.abs(a.entry - bar.open) - Math.abs(b.entry - bar.open));
      for (const lv of inBar) usedLevels.add(lvlKey(lv)); // consume all that traded
      if (!pos) {
        const lv = inBar[0];
        const isSell = lv.side === 'SELL';
        pos = { ...lv, fillTime: bar.time, mfe: 0, mae: 0, refOpen };
        // same-bar SL/TP resolution (SL first)
        if (isSell) {
          if (bar.high >= pos.sl)      closeTrade(pos.sl, bar.time, 'loss');
          else if (bar.low <= pos.tp)  closeTrade(pos.tp, bar.time, 'win');
        } else {
          if (bar.low <= pos.sl)       closeTrade(pos.sl, bar.time, 'loss');
          else if (bar.high >= pos.tp) closeTrade(pos.tp, bar.time, 'win');
        }
      }
    }
  }

  // EOD: close any still-open position at the last bar's close
  if (pos) {
    const last = bars[bars.length - 1];
    closeTrade(last.close, last.time, 'open');
  }

  return trades;
}

// ── Stats + equity ────────────────────────────────────────────────────────────

export function computeStats(trades) {
  const filled = trades.filter(t => t.outcome !== undefined);
  const n = filled.length;
  if (!n) return { trades: 0 };

  const wins   = filled.filter(t => t.net_pips > 0);
  const losses = filled.filter(t => t.net_pips <= 0);
  const grossWin  = wins.reduce((a, t) => a + t.net_pips, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.net_pips, 0));
  const netPips   = filled.reduce((a, t) => a + t.net_pips, 0);

  // R-based equity curve + max drawdown
  let cum = 0, peak = 0, maxDD = 0;
  const equity = [];
  for (const t of filled) {
    cum += t.r;
    peak = Math.max(peak, cum);
    maxDD = Math.min(maxDD, cum - peak);
    equity.push({ date: t.date, cumR: +cum.toFixed(3) });
  }

  // Sharpe of per-trade R (annualised-ish, per-trade basis)
  const rs   = filled.map(t => t.r);
  const mean = rs.reduce((a, b) => a + b, 0) / n;
  const sd   = Math.sqrt(rs.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || 1e-9;
  const sharpe = (mean / sd) * Math.sqrt(n); // total-sample Sharpe

  // Edge concentration — top-5 days' share of net pips
  const byDay = new Map();
  for (const t of filled) byDay.set(t.date, (byDay.get(t.date) || 0) + t.net_pips);
  const dayPnls = [...byDay.values()].filter(v => v > 0).sort((a, b) => b - a);
  const top5 = dayPnls.slice(0, 5).reduce((a, b) => a + b, 0);
  const totalPos = dayPnls.reduce((a, b) => a + b, 0) || 1e-9;
  const edgeConc = top5 / totalPos;

  return {
    trades:       n,
    wins:         wins.length,
    winRate:      +(wins.length / n * 100).toFixed(1),
    profitFactor: grossLoss > 0 ? +(grossWin / grossLoss).toFixed(2) : Infinity,
    netPips:      +netPips.toFixed(1),
    avgR:         +mean.toFixed(3),
    sharpe:       +sharpe.toFixed(2),
    maxDD_R:      +maxDD.toFixed(2),
    edgeConc:     +(edgeConc * 100).toFixed(1), // % of positive P&L from top-5 days
    equity,
  };
}

// ── Public: single pair backtest ──────────────────────────────────────────────

const _pairCache    = new Map(); // pairKey → { packed, ts }              (raw M1, immutable)
const _sessionCache = new Map(); // `${pairKey}:${tz}:${mondayTf}` → { asiaSessions, mondayRanges }
const _TTL = 6 * 3600 * 1000;

async function _getPacked(pairKey, m1Dir) {
  const now = Date.now();
  const c = _pairCache.get(pairKey);
  if (c && now - c.ts < _TTL) return c.packed;
  const packed = await loadM1ForPair(pairKey, m1Dir);
  if (!packed) return null;
  _pairCache.set(pairKey, { packed, ts: now });
  return packed;
}

function _getSessions(pairKey, packed, tz, mondayTfMin) {
  const key = `${pairKey}:${tz}:${mondayTfMin}`;
  if (_sessionCache.has(key)) return _sessionCache.get(key);
  const built = {
    asiaSessions: _buildAsiaSessions(packed, tz),
    mondayRanges: _buildMondayRanges(packed, tz, mondayTfMin),
  };
  _sessionCache.set(key, built);
  return built;
}

export function clearPairCache(pairKey) {
  if (pairKey) { _pairCache.delete(pairKey); for (const k of _sessionCache.keys()) if (k.startsWith(pairKey + ':')) _sessionCache.delete(k); }
  else { _pairCache.clear(); _sessionCache.clear(); }
}

// Test seam — exposes the pure per-day simulator for unit tests (no data layer).
export const _test = { simulateDay, asiaBodyRange, calcFibs, resampleTo };

export async function runRangeFibBacktest(pairKey, opts = {}, m1Dir = BT_M1_DIR) {
  const { dateFrom = '', dateTo = '', progressCb = null } = opts;
  const packed = await _getPacked(pairKey, m1Dir);
  if (!packed) throw new Error(`No M1 data for ${pairKey}`);

  const sessionTz   = opts.sessionTz   || 'utc';
  const mondayTfMin = opts.mondayTfMin || 15;
  const { asiaSessions, mondayRanges } = _getSessions(pairKey, packed, sessionTz, mondayTfMin);

  const pipSize = PIP_SIZE[pairKey] ?? 0.0001;
  const enabledFibs = Array.isArray(opts.enabledFibs) && opts.enabledFibs.length
    ? new Set(opts.enabledFibs) : null;
  // Auto confluence threshold: 200 "pips" for gold, 2 for FX (mirrors the indicator).
  const confluenceThreshPips = opts.confluenceThreshPips != null
    ? opts.confluenceThreshPips : (pairKey === 'gold' ? 200 : 2.0);
  const config = { ...opts, pipSize, enabledFibs, confluenceThreshPips, sessionTz, mondayTfMin,
    _asiaSessions: asiaSessions, _mondayRanges: mondayRanges };

  // Dates that have an Asia session (label = local calendar date)
  const dates = asiaSessions.map(s => s.date);

  const trades = [];
  let processed = 0;
  for (const date of dates) {
    if (dateFrom && date < dateFrom) { processed++; continue; }
    if (dateTo   && date > dateTo)   { processed++; continue; }
    const dayTrades = simulateDay(packed, date, config);
    for (const t of dayTrades) { t.instrument = pairKey.toUpperCase(); trades.push(t); }
    processed++;
    if (progressCb && processed % 100 === 0) progressCb(processed, dates.length);
  }

  return { trades, stats: computeStats(trades), params: { ...opts, pair: pairKey } };
}
