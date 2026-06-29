/**
 * confluenceModules.js — Pluggable confluence checkers for the Asia Range Fib backtest.
 *
 * Module interface:
 *   { id, label, description, defaultWeight, defaultEnabled,
 *     buildPairCache(packed, pipSize) → cache,               // once per pair (null = not needed)
 *     buildDayState(packed, dayEpoch, pipSize, cache, opts) → state | null,  // once per day
 *     check(price, side, state, opts) → { hit, detail }      // per fib level
 *   }
 *
 * Design: expensive work is front-loaded.
 *   buildPairCache — precomputes dataset-wide structures (e.g. swing levels) once per pair.
 *   buildDayState  — per-day prep (e.g. vol profile, EWMA). Fast because it reads from cache.
 *   check          — pure lookup, called per fib level — must be O(1) or O(small constant).
 */

// Lego baseplate: M1 packed-array helpers + the fib level set are shared bricks.
// See js/barUtils.js and js/fibProjection.js — the local `_bisect`/`_extractFast`/
// `_resample30m`/`_FIB_LEVELS`/`_fibs` copies were lifted out to one source.
import { bisect as _bisect, extractBars as _extractFast, resampleTo } from './barUtils.js';
import { FIB_LEVELS as _FIB_LEVELS, calcFibs } from './fibProjection.js';

// ── Utility ───────────────────────────────────────────────────────────────────

const _resample30m = (bars) => resampleTo(bars, 30);

function _asiaBodyRange(packed, dayEpoch) {
  const bars = _extractFast(packed, dayEpoch, dayEpoch + 6 * 3600);
  if (bars.length < 5) return null;
  const secs = 5 * 60;
  const map = new Map();
  for (const b of bars) {
    const t0 = b.time - (b.time % secs);
    if (!map.has(t0)) map.set(t0, { open: b.open, close: b.close });
    else { const r = map.get(t0); r.close = b.close; }
  }
  let hi = -Infinity, lo = Infinity;
  for (const { open, close } of map.values()) {
    hi = Math.max(hi, Math.max(open, close));
    lo = Math.min(lo, Math.min(open, close));
  }
  return isFinite(hi) && hi > lo ? { high: hi, low: lo, range: hi - lo } : null;
}

// _FIB_LEVELS imported from the fibProjection brick. _fibs keeps its original
// {level, price} shape (the brick's calcFibs also returns isKey, dropped here).
function _fibs(low, range) {
  return calcFibs(low, range).map(({ level, price }) => ({ level, price }));
}

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 1 — Fib Repeat
// "2+ of the last N prior Asia sessions have a fib level within zone radius"
// ══════════════════════════════════════════════════════════════════════════════

const fibRepeat = {
  id: 'fib_repeat',
  label: 'Prev Session Fib Repeat',
  description: 'Level appears in 2+ of the last 5 prior Asia sessions',
  defaultWeight: 1.5,
  defaultEnabled: true,
  buildPairCache: null,

  buildDayState(packed, dayEpoch, pipSize, _cache, opts) {
    const lookback = opts.fibRepeatDays ?? 5;
    const results = [];
    for (let d = 1; d <= lookback + 4 && results.length < lookback; d++) {
      const ar = _asiaBodyRange(packed, dayEpoch - d * 86400);
      if (!ar) continue;
      const date = new Date((dayEpoch - d * 86400) * 1000).toISOString().substring(0, 10);
      results.push({ date, fibs: _fibs(ar.low, ar.range) });
    }
    return { prevSessions: results, pipSize };
  },

  check(price, side, state, opts) {
    if (!state?.prevSessions?.length) return { hit: false, detail: null };
    const radius = (opts.zoneRadiusPips ?? 3) * state.pipSize;
    const minSessions = opts.fibRepeatMinSessions ?? 2;
    let count = 0;
    const labels = [];
    for (const { date, fibs } of state.prevSessions) {
      const near = fibs.find(f => Math.abs(f.price - price) <= radius);
      if (near) { count++; labels.push(`${date} lv${near.level.toFixed(2)}`); }
    }
    const hit = count >= minSessions;
    return { hit, detail: hit ? `${count}/${state.prevSessions.length} sessions · ${labels.slice(0, 2).join(', ')}` : null };
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 2 — Previously Reacted
// "Price bounced ≥5 pips at this level in a prior session's trade window"
// ══════════════════════════════════════════════════════════════════════════════

const prevReacted = {
  id: 'prev_reacted',
  label: 'Previously Reacted Level',
  description: 'Price reversed ≥5 pips at this level in a prior session',
  defaultWeight: 2.0,
  defaultEnabled: true,
  buildPairCache: null,

  buildDayState(packed, dayEpoch, pipSize, _cache, opts) {
    const lookback     = opts.prevReactedDays ?? 5;
    const hourFrom     = opts.tradeHourFrom ?? 6;
    const hourTo       = opts.tradeHourTo   ?? 14;
    const windows = [];
    let found = 0;
    for (let d = 1; d <= lookback + 4 && found < lookback; d++) {
      const prevEpoch = dayEpoch - d * 86400;
      const bars = _extractFast(packed, prevEpoch + hourFrom * 3600, prevEpoch + hourTo * 3600);
      if (bars.length < 5) continue;
      found++;
      windows.push({ date: new Date(prevEpoch * 1000).toISOString().substring(0, 10), bars });
    }
    return { windows, pipSize };
  },

  check(price, side, state, opts) {
    if (!state?.windows?.length) return { hit: false, detail: null };
    const radius   = (opts.zoneRadiusPips ?? 3) * state.pipSize;
    const minReact = 5 * state.pipSize;
    let reactions  = 0;
    let lastDetail = null;

    for (const { date, bars } of state.windows) {
      let touchIdx = -1;
      for (let i = 0; i < bars.length; i++) {
        if (bars[i].low <= price + radius && bars[i].high >= price - radius) { touchIdx = i; break; }
      }
      if (touchIdx < 0) continue;

      const after  = bars.slice(touchIdx + 1, touchIdx + 26);
      if (!after.length) continue;
      const maxH   = Math.max(...after.map(b => b.high));
      const minL   = Math.min(...after.map(b => b.low));
      const upMove = maxH - price;
      const dnMove = price - minL;
      const rxSize = Math.max(upMove, dnMove);

      if (rxSize >= minReact) {
        reactions++;
        const dir = upMove > dnMove ? '↑' : '↓';
        lastDetail = `${date} ${dir}${(rxSize / state.pipSize).toFixed(0)}p`;
      }
    }

    return { hit: reactions >= 1, detail: reactions >= 1 ? `${reactions} rxn · ${lastDetail}` : null };
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 3 — Swing S&R
// "A 30m pivot high/low (N=5 each side) from the last 20 days is within zone radius"
// ══════════════════════════════════════════════════════════════════════════════

const srLevel = {
  id: 'sr_level',
  label: 'Swing S&R Level',
  description: '30m pivot high/low (5-bar swing) within zone radius, last 20 days',
  defaultWeight: 1.0,
  defaultEnabled: true,

  buildPairCache(packed, _pipSize) {
    const { times, highs, lows, n } = packed;
    // Resample M1 → 30m across full dataset
    const secs = 30 * 60;
    const map  = new Map();
    for (let i = 0; i < n; i++) {
      const t0 = times[i] - (times[i] % secs);
      if (!map.has(t0)) map.set(t0, { time: t0, high: highs[i], low: lows[i] });
      else { const b = map.get(t0); b.high = Math.max(b.high, highs[i]); b.low = Math.min(b.low, lows[i]); }
    }
    const bars = [...map.values()].sort((a, b) => a.time - b.time);

    // Find pivot highs/lows with N=5 on each side
    const N = 5;
    const swingH = [], swingL = [];
    for (let i = N; i < bars.length - N; i++) {
      const b = bars[i];
      let isH = true, isL = true;
      for (let j = -N; j <= N; j++) {
        if (j === 0) continue;
        if (bars[i + j].high >= b.high) isH = false;
        if (bars[i + j].low  <= b.low)  isL = false;
      }
      if (isH) swingH.push({ time: b.time, price: b.high });
      if (isL) swingL.push({ time: b.time, price: b.low  });
    }
    return { swingH, swingL };
  },

  buildDayState(_packed, dayEpoch, pipSize, cache) {
    if (!cache) return null;
    const windowStart = dayEpoch - 20 * 86400;
    // Binary search instead of .filter() — O(log N + window) not O(N)
    const slice = (arr) => {
      let lo = 0, hi = arr.length;
      while (lo < hi) { const m = (lo + hi) >>> 1; arr[m].time < windowStart ? lo = m + 1 : hi = m; }
      const start = lo;
      lo = start; hi = arr.length;
      while (lo < hi) { const m = (lo + hi) >>> 1; arr[m].time < dayEpoch ? lo = m + 1 : hi = m; }
      return arr.slice(start, lo);
    };
    return { swings: [...slice(cache.swingH), ...slice(cache.swingL)], pipSize };
  },

  check(price, _side, state, opts) {
    if (!state?.swings?.length) return { hit: false, detail: null };
    const radius = (opts.zoneRadiusPips ?? 3) * state.pipSize;
    const near = state.swings.filter(s => Math.abs(s.price - price) <= radius);
    if (!near.length) return { hit: false, detail: null };
    near.sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price));
    const best = near[0];
    const dist = (Math.abs(best.price - price) / state.pipSize).toFixed(1);
    return { hit: true, detail: `Swing ${best.price.toFixed(5)} (${dist}p, ${near.length} nearby)` };
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 4 — Session Volume Profile (VAH / VAL / POC)
// Uses M1 bar count as volume proxy; computes profile from prior full calendar day
// ══════════════════════════════════════════════════════════════════════════════

const vahVal = {
  id: 'vah_val',
  label: 'Volume Profile (VAH/VAL/POC)',
  description: 'Prior session VAH, VAL, or POC (70% value area) within zone radius',
  defaultWeight: 1.5,
  defaultEnabled: true,
  buildPairCache: null,

  buildDayState(packed, dayEpoch, pipSize, _cache, opts) {
    const lookbackDays = opts.vahValDays ?? 5; // look back across multiple prior sessions
    const levels = []; // collects { vah, val, poc } per session found

    for (let d = 1; d <= lookbackDays + 3 && levels.length < lookbackDays; d++) {
      const ep   = dayEpoch - d * 86400;
      const bars = _extractFast(packed, ep, ep + 86400);
      if (bars.length < 20) continue;

      // Body midpoint per bar — O(bars) not O(bars × pip_range), ~40x faster
      const hist = new Map();
      let total  = 0;
      for (const b of bars) {
        const key = Math.round((b.open + b.close) / 2 / pipSize);
        hist.set(key, (hist.get(key) ?? 0) + 1);
        total++;
      }
      if (!hist.size) continue;

      let pocKey = 0, pocCount = 0;
      for (const [k, cnt] of hist) { if (cnt > pocCount) { pocCount = cnt; pocKey = k; } }

      const sorted = [...hist.entries()].sort((a, b) => a[0] - b[0]);
      const target = total * 0.70;
      let pocIdx   = sorted.findIndex(([k]) => k === pocKey);
      if (pocIdx < 0) pocIdx = Math.floor(sorted.length / 2);
      let lo = pocIdx, hi = pocIdx, captured = pocCount;

      while (captured < target && (lo > 0 || hi < sorted.length - 1)) {
        const addLo = lo > 0                  ? sorted[lo - 1][1] : -1;
        const addHi = hi < sorted.length - 1  ? sorted[hi + 1][1] : -1;
        if (addLo >= addHi && addLo > 0) { lo--; captured += addLo; }
        else if (addHi > 0)              { hi++; captured += addHi; }
        else break;
      }

      levels.push({
        vah: sorted[hi][0] * pipSize,
        val: sorted[lo][0] * pipSize,
        poc: pocKey * pipSize,
        date: new Date(ep * 1000).toISOString().substring(0, 10),
      });
    }

    if (!levels.length) return null;
    return { levels, pipSize };
  },

  check(price, _side, state, opts) {
    if (!state?.levels?.length) return { hit: false, detail: null };
    const radius = (opts.zoneRadiusPips ?? 3) * state.pipSize;
    const hits = [];

    for (const sess of state.levels) {
      for (const [lbl, lvlPrice] of [['VAH', sess.vah], ['VAL', sess.val], ['POC', sess.poc]]) {
        if (Math.abs(lvlPrice - price) <= radius) {
          hits.push({ lbl, price: lvlPrice, date: sess.date, dist: Math.abs(lvlPrice - price) });
        }
      }
    }

    if (!hits.length) return { hit: false, detail: null };
    hits.sort((a, b) => a.dist - b.dist);
    const best = hits[0];
    const dist = (best.dist / state.pipSize).toFixed(1);
    return { hit: true, detail: `${best.lbl} ${best.date} @${best.price.toFixed(5)} (${dist}p)${hits.length > 1 ? ` +${hits.length - 1}` : ''}` };
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 5 — Vol Forecast HL75 Boundary
// Computes EWMA(λ=0.94) daily vol → HL75 forecast range; hit if fib is near edge
// ══════════════════════════════════════════════════════════════════════════════

const volForecast = {
  id: 'vol_forecast',
  label: 'Vol Forecast HL75 Boundary',
  description: 'Fib near EWMA-forecast HL 75th-percentile High or Low for the day',
  defaultWeight: 1.0,
  defaultEnabled: true,

  // Precompute sorted [epoch, close] pairs once per pair — replaces 28 M1 extractions per day
  buildPairCache(packed, _pipSize) {
    const { times, closes, n } = packed;
    const dailyClose = new Map();
    for (let i = 0; i < n; i++) {
      const day = times[i] - (times[i] % 86400);
      dailyClose.set(day, closes[i]); // last close wins per day
    }
    const arr = [...dailyClose.entries()].sort((a, b) => a[0] - b[0]);
    return { arr }; // [[epoch, close], ...]
  },

  buildDayState(packed, dayEpoch, pipSize, cache, _opts) {
    if (!cache?.arr?.length) return null;

    // Binary-search to find last index before dayEpoch, then slice back 22 closes
    const arr = cache.arr;
    let hi = arr.length;
    let lo = 0;
    while (lo < hi) { const m = (lo + hi) >>> 1; arr[m][0] < dayEpoch ? lo = m + 1 : hi = m; }
    const end = lo; // first index >= dayEpoch
    if (end < 6) return null;
    const slice = arr.slice(Math.max(0, end - 22), end);
    const closes = slice.map(e => e[1]);
    if (closes.length < 6) return null;

    // Asia session open as forecast anchor (more relevant than prior close)
    const asiaOpen = _extractFast(packed, dayEpoch, dayEpoch + 300);
    const anchor = asiaOpen.length ? asiaOpen[0].open : closes.at(-1);

    // EWMA variance on prior closes
    const lambda = 0.94;
    let variance = 0;
    for (let i = 1; i < closes.length; i++) {
      const r = Math.log(closes[i] / closes[i - 1]);
      variance = lambda * variance + (1 - lambda) * r * r;
    }
    const sigma = Math.sqrt(variance);
    const hl75_mult = 2.049 * 0.894; // BM P75 × FX correction
    const halfRange = anchor * hl75_mult * sigma / 2;

    return {
      forecastHigh: anchor + halfRange,
      forecastLow:  anchor - halfRange,
      hl75Pct:      +(hl75_mult * sigma * 100).toFixed(3),
      pipSize,
    };
  },

  check(price, _side, state, opts) {
    if (!state) return { hit: false, detail: null };
    const radius = (opts.zoneRadiusPips ?? 3) * state.pipSize;
    const nearH  = Math.abs(price - state.forecastHigh) <= radius;
    const nearL  = Math.abs(price - state.forecastLow)  <= radius;
    if (!nearH && !nearL) return { hit: false, detail: null };
    const which  = nearH ? 'HL75H' : 'HL75L';
    const target = nearH ? state.forecastHigh : state.forecastLow;
    const dist   = (Math.abs(price - target) / state.pipSize).toFixed(1);
    return { hit: true, detail: `${which}=${target.toFixed(5)} ±${dist}p (σ range ${state.hl75Pct}%)` };
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 6 — 52-Week High / Low
// Precomputes daily extremes for O(log N) per-day lookup
// ══════════════════════════════════════════════════════════════════════════════

const ath52wk = {
  id: 'ath_52wk',
  label: '52-Week High / Low',
  description: 'Fib within zone radius of the rolling 52-week high or low',
  defaultWeight: 1.0,
  defaultEnabled: false, // off by default — most useful for Gold

  buildPairCache(packed, _pipSize) {
    const { times, highs, lows, n } = packed;
    const dailyMap = new Map();
    for (let i = 0; i < n; i++) {
      const day = times[i] - (times[i] % 86400);
      if (!dailyMap.has(day)) dailyMap.set(day, { high: highs[i], low: lows[i] });
      else { const d = dailyMap.get(day); d.high = Math.max(d.high, highs[i]); d.low = Math.min(d.low, lows[i]); }
    }
    const arr = [...dailyMap.entries()].sort((a, b) => a[0] - b[0]).map(([epoch, hl]) => ({ epoch, ...hl }));
    return { arr };
  },

  buildDayState(_packed, dayEpoch, pipSize, cache) {
    if (!cache?.arr?.length) return null;
    const arr = cache.arr;
    const since = dayEpoch - 252 * 86400;
    // Binary search for window bounds — O(log N + window) not O(N)
    let lo = 0, hi = arr.length;
    while (lo < hi) { const m = (lo + hi) >>> 1; arr[m].epoch < since ? lo = m + 1 : hi = m; }
    const startIdx = lo;
    lo = startIdx; hi = arr.length;
    while (lo < hi) { const m = (lo + hi) >>> 1; arr[m].epoch < dayEpoch ? lo = m + 1 : hi = m; }
    const endIdx = lo;
    if (endIdx <= startIdx) return null;
    let high52wk = -Infinity, low52wk = Infinity;
    for (let i = startIdx; i < endIdx; i++) {
      if (arr[i].high > high52wk) high52wk = arr[i].high;
      if (arr[i].low  < low52wk)  low52wk  = arr[i].low;
    }
    return { high52wk, low52wk, pipSize };
  },

  check(price, _side, state, opts) {
    if (!state) return { hit: false, detail: null };
    const radius = (opts.zoneRadiusPips ?? 3) * state.pipSize;
    const nearH  = Math.abs(price - state.high52wk) <= radius;
    const nearL  = Math.abs(price - state.low52wk)  <= radius;
    if (!nearH && !nearL) return { hit: false, detail: null };
    const which  = nearH ? '52wkH' : '52wkL';
    const target = nearH ? state.high52wk : state.low52wk;
    const dist   = (Math.abs(price - target) / state.pipSize).toFixed(1);
    return { hit: true, detail: `${which}=${target.toFixed(5)} (${dist}p)` };
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 7 — Monday Range H/L (formalised as a proper module)
// ══════════════════════════════════════════════════════════════════════════════

const mondayRange = {
  id: 'monday_range',
  label: 'Monday Range H/L',
  description: 'Within 10 pips of current week\'s Monday high or low',
  defaultWeight: 0.75,
  defaultEnabled: true,
  buildPairCache: null,

  buildDayState(packed, dayEpoch, pipSize, _cache, _opts) {
    const dow      = (Math.floor(dayEpoch / 86400) + 4) % 7;
    const daysBack = dow === 1 ? 7 : dow === 0 ? 6 : dow - 1;
    const monEpoch = dayEpoch - daysBack * 86400;
    const bars     = _extractFast(packed, monEpoch, monEpoch + 86400);
    if (bars.length < 10) return null;

    // Resample to 15m, use body high/low (max/min of open,close)
    const secs = 15 * 60;
    const map  = new Map();
    for (const b of bars) {
      const t0 = b.time - (b.time % secs);
      if (!map.has(t0)) map.set(t0, { open: b.open, close: b.close });
      else { const r = map.get(t0); r.close = b.close; } // open stays as first bar's open
    }
    let high = -Infinity, low = Infinity;
    for (const { open, close } of map.values()) {
      high = Math.max(high, Math.max(open, close));
      low  = Math.min(low,  Math.min(open, close));
    }
    if (!isFinite(high) || high <= low) return null;
    return { monHigh: high, monLow: low, pipSize };
  },

  check(price, _side, state, _opts) {
    if (!state) return { hit: false, detail: null };
    const tol  = 10 * state.pipSize;
    const nearH = Math.abs(price - state.monHigh) <= tol;
    const nearL = Math.abs(price - state.monLow)  <= tol;
    if (!nearH && !nearL) return { hit: false, detail: null };
    const which  = nearH ? 'Mon H' : 'Mon L';
    const target = nearH ? state.monHigh : state.monLow;
    const dist   = (Math.abs(price - target) / state.pipSize).toFixed(1);
    return { hit: true, detail: `${which}=${target.toFixed(5)} (${dist}p)` };
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 8 — Previous Day High / Low (PDH / PDL)
// Precomputes daily extremes once; O(log N) lookup per day
// ══════════════════════════════════════════════════════════════════════════════

const pdhPdl = {
  id: 'pdh_pdl',
  label: 'Prev Day High / Low',
  description: 'Fib within zone radius of yesterday\'s high or low (most-watched institutional level)',
  defaultWeight: 2.0,
  defaultEnabled: true,

  buildPairCache(packed, _pipSize) {
    const { times, highs, lows, n } = packed;
    const dailyMap = new Map();
    for (let i = 0; i < n; i++) {
      const day = times[i] - (times[i] % 86400);
      if (!dailyMap.has(day)) dailyMap.set(day, { high: highs[i], low: lows[i] });
      else { const d = dailyMap.get(day); d.high = Math.max(d.high, highs[i]); d.low = Math.min(d.low, lows[i]); }
    }
    return { arr: [...dailyMap.entries()].sort((a, b) => a[0] - b[0]).map(([epoch, hl]) => ({ epoch, ...hl })) };
  },

  buildDayState(_packed, dayEpoch, pipSize, cache) {
    if (!cache?.arr?.length) return null;
    const arr = cache.arr;
    let lo = 0, hi = arr.length;
    while (lo < hi) { const m = (lo + hi) >>> 1; arr[m].epoch < dayEpoch ? lo = m + 1 : hi = m; }
    const idx = lo - 1;
    if (idx < 0) return null;
    return { pdh: arr[idx].high, pdl: arr[idx].low, date: new Date(arr[idx].epoch * 1000).toISOString().substring(0, 10), pipSize };
  },

  check(price, _side, state, opts) {
    if (!state) return { hit: false, detail: null };
    const radius = (opts.zoneRadiusPips ?? 3) * state.pipSize;
    const nearH = Math.abs(price - state.pdh) <= radius;
    const nearL = Math.abs(price - state.pdl) <= radius;
    if (!nearH && !nearL) return { hit: false, detail: null };
    const which = nearH ? 'PDH' : 'PDL', target = nearH ? state.pdh : state.pdl;
    return { hit: true, detail: `${which} ${state.date} @${target.toFixed(5)} (${(Math.abs(price - target) / state.pipSize).toFixed(1)}p)` };
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 9 — Previous Week High / Low (PWH / PWL)
// ══════════════════════════════════════════════════════════════════════════════

const pwhPwl = {
  id: 'pwh_pwl',
  label: 'Prev Week High / Low',
  description: 'Fib within zone radius of last week\'s high or low',
  defaultWeight: 1.5,
  defaultEnabled: true,

  buildPairCache(packed, _pipSize) {
    const { times, highs, lows, n } = packed;
    const weekMap = new Map();
    // Epoch arithmetic avoids creating Date objects inside the hot loop.
    // Jan 1 1970 was Thursday (UTC day 4). (floor(t/86400) + 4) % 7 → 0=Sun,1=Mon…6=Sat.
    for (let i = 0; i < n; i++) {
      const daysSinceEpoch = Math.floor(times[i] / 86400);
      const dow    = (daysSinceEpoch + 4) % 7;
      const dToMon = dow === 0 ? 6 : dow - 1;
      const monEp  = daysSinceEpoch * 86400 - dToMon * 86400;
      if (!weekMap.has(monEp)) weekMap.set(monEp, { high: highs[i], low: lows[i] });
      else { const w = weekMap.get(monEp); w.high = Math.max(w.high, highs[i]); w.low = Math.min(w.low, lows[i]); }
    }
    return { arr: [...weekMap.entries()].sort((a, b) => a[0] - b[0]).map(([epoch, hl]) => ({ epoch, ...hl })) };
  },

  buildDayState(_packed, dayEpoch, pipSize, cache) {
    if (!cache?.arr?.length) return null;
    // Find Monday of current week, then look up the prior week
    const dow     = (Math.floor(dayEpoch / 86400) + 4) % 7;
    const dToMon  = dow === 0 ? 6 : dow - 1;
    const thisMonEp = dayEpoch - dToMon * 86400 - ((dayEpoch - dToMon * 86400) % 86400);
    const arr = cache.arr;
    let lo = 0, hi = arr.length;
    while (lo < hi) { const m = (lo + hi) >>> 1; arr[m].epoch < thisMonEp ? lo = m + 1 : hi = m; }
    const idx = lo - 1;
    if (idx < 0) return null;
    return { pwh: arr[idx].high, pwl: arr[idx].low, pipSize };
  },

  check(price, _side, state, opts) {
    if (!state) return { hit: false, detail: null };
    const radius = (opts.zoneRadiusPips ?? 3) * state.pipSize;
    const nearH = Math.abs(price - state.pwh) <= radius;
    const nearL = Math.abs(price - state.pwl) <= radius;
    if (!nearH && !nearL) return { hit: false, detail: null };
    const which = nearH ? 'PWH' : 'PWL', target = nearH ? state.pwh : state.pwl;
    return { hit: true, detail: `${which} @${target.toFixed(5)} (${(Math.abs(price - target) / state.pipSize).toFixed(1)}p)` };
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 10 — Round Number / Big Figure
// ══════════════════════════════════════════════════════════════════════════════

const roundNumber = {
  id: 'round_number',
  label: 'Round Number',
  description: 'Fib within zone radius of a psychological big figure or half-figure',
  defaultWeight: 1.0,
  defaultEnabled: true,
  buildPairCache: null,

  buildDayState(_packed, _dayEpoch, pipSize, _cache, _opts) {
    return { pipSize }; // no data needed — pure price arithmetic
  },

  check(price, _side, state, opts) {
    if (!state) return { hit: false, detail: null };
    const radius     = (opts.zoneRadiusPips ?? 3) * state.pipSize;
    const majorUnit  = state.pipSize * 1000; // 100 pips — e.g. 1.3000
    const minorUnit  = state.pipSize * 100;  // 10 pips  — e.g. 1.3050
    const nearestMaj = Math.round(price / majorUnit) * majorUnit;
    const nearestMin = Math.round(price / minorUnit) * minorUnit;
    if (Math.abs(price - nearestMaj) <= radius)
      return { hit: true, detail: `Big figure ${nearestMaj.toFixed(5)} (${(Math.abs(price - nearestMaj) / state.pipSize).toFixed(1)}p)` };
    if (Math.abs(price - nearestMin) <= radius)
      return { hit: true, detail: `Half-figure ${nearestMin.toFixed(5)} (${(Math.abs(price - nearestMin) / state.pipSize).toFixed(1)}p)` };
    return { hit: false, detail: null };
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 11 — Fair Value Gap (FVG / Imbalance) on 15m bars
// Scans recent sessions for unfilled 3-candle imbalances
// ══════════════════════════════════════════════════════════════════════════════

const fvgLevel = {
  id: 'fvg_level',
  label: 'Fair Value Gap (FVG)',
  description: 'Fib sits inside an unfilled 15m imbalance from the last 5 days',
  defaultWeight: 1.5,
  defaultEnabled: false,
  buildPairCache: null,

  buildDayState(packed, dayEpoch, pipSize, _cache, opts) {
    const lookbackDays = opts.fvgDays ?? 5;
    const bars = _extractFast(packed, dayEpoch - lookbackDays * 86400, dayEpoch);
    if (bars.length < 30) return null;

    const secs = 15 * 60;
    const map  = new Map();
    for (const b of bars) {
      const t0 = b.time - (b.time % secs);
      if (!map.has(t0)) map.set(t0, { time: t0, high: b.high, low: b.low });
      else { const r = map.get(t0); r.high = Math.max(r.high, b.high); r.low = Math.min(r.low, b.low); }
    }
    const bars15 = [...map.values()].sort((a, b) => a.time - b.time);

    const fvgs = [];
    for (let i = 0; i < bars15.length - 2; i++) {
      const a = bars15[i], c = bars15[i + 2];
      if (c.low > a.high) {
        // Bullish FVG: gap from a.high to c.low
        const fvgLo = a.high, fvgHi = c.low;
        if (!bars15.slice(i + 3).some(b => b.low <= fvgHi && b.high >= fvgLo))
          fvgs.push({ type: 'bull', lo: fvgLo, hi: fvgHi });
      } else if (c.high < a.low) {
        // Bearish FVG: gap from c.high to a.low
        const fvgLo = c.high, fvgHi = a.low;
        if (!bars15.slice(i + 3).some(b => b.high >= fvgLo && b.low <= fvgHi))
          fvgs.push({ type: 'bear', lo: fvgLo, hi: fvgHi });
      }
    }
    return { fvgs, pipSize };
  },

  check(price, _side, state, _opts) {
    if (!state?.fvgs?.length) return { hit: false, detail: null };
    for (const fvg of state.fvgs) {
      if (price >= fvg.lo && price <= fvg.hi) {
        const size = ((fvg.hi - fvg.lo) / state.pipSize).toFixed(1);
        return { hit: true, detail: `${fvg.type === 'bull' ? 'Bull' : 'Bear'} FVG ${fvg.lo.toFixed(5)}–${fvg.hi.toFixed(5)} (${size}p)` };
      }
    }
    return { hit: false, detail: null };
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 12 — Session Opening Range H/L (first 30m of Asia session, 00:00 UTC)
// Complete before London opens — no lookahead bias
// ══════════════════════════════════════════════════════════════════════════════

const sessionOpenRange = {
  id: 'session_open_range',
  label: 'Asia Open Range H/L',
  description: 'Fib within zone radius of today\'s 00:00–00:30 UTC opening range high or low',
  defaultWeight: 1.0,
  defaultEnabled: false,
  buildPairCache: null,

  buildDayState(packed, dayEpoch, pipSize, _cache, opts) {
    const orMinutes = opts.orMinutes ?? 30;
    const bars = _extractFast(packed, dayEpoch, dayEpoch + orMinutes * 60);
    if (bars.length < 3) return null;
    let high = -Infinity, low = Infinity;
    for (const b of bars) { high = Math.max(high, b.high); low = Math.min(low, b.low); }
    if (!isFinite(high) || high <= low) return null;
    return { orH: high, orL: low, pipSize };
  },

  check(price, _side, state, opts) {
    if (!state) return { hit: false, detail: null };
    const radius = (opts.zoneRadiusPips ?? 3) * state.pipSize;
    const nearH = Math.abs(price - state.orH) <= radius;
    const nearL = Math.abs(price - state.orL) <= radius;
    if (!nearH && !nearL) return { hit: false, detail: null };
    const which = nearH ? 'OR-H' : 'OR-L', target = nearH ? state.orH : state.orL;
    return { hit: true, detail: `Asia ${which} @${target.toFixed(5)} (${(Math.abs(price - target) / state.pipSize).toFixed(1)}p)` };
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 13 — Daily Opens (previous N days)
// If a fib coincides with where price opened multiple times, it's a key level
// ══════════════════════════════════════════════════════════════════════════════

const dailyOpens = {
  id: 'daily_opens',
  label: 'Daily Opens (10d)',
  description: 'Fib within zone radius of any of the last 10 daily opens',
  defaultWeight: 1.0,
  defaultEnabled: true,

  buildPairCache(packed, _pipSize) {
    const { times, opens, n } = packed;
    const dailyOpen = new Map();
    for (let i = 0; i < n; i++) {
      const day = times[i] - (times[i] % 86400);
      if (!dailyOpen.has(day)) dailyOpen.set(day, opens[i]);
    }
    return { arr: [...dailyOpen.entries()].sort((a, b) => a[0] - b[0]) }; // [[epoch, open], ...]
  },

  buildDayState(_packed, dayEpoch, pipSize, cache, opts) {
    if (!cache?.arr?.length) return null;
    const lookback = opts.dailyOpenDays ?? 10;
    const arr = cache.arr;
    let lo = 0, hi = arr.length;
    while (lo < hi) { const m = (lo + hi) >>> 1; arr[m][0] < dayEpoch ? lo = m + 1 : hi = m; }
    const end = lo;
    if (end < 1) return null;
    const slice = arr.slice(Math.max(0, end - lookback), end);
    return {
      opens: slice.map(([epoch, open]) => ({ date: new Date(epoch * 1000).toISOString().substring(0, 10), open })),
      pipSize,
    };
  },

  check(price, _side, state, opts) {
    if (!state?.opens?.length) return { hit: false, detail: null };
    const radius = (opts.zoneRadiusPips ?? 3) * state.pipSize;
    const near = state.opens
      .map(({ date, open }) => ({ date, open, dist: Math.abs(open - price) }))
      .filter(x => x.dist <= radius)
      .sort((a, b) => a.dist - b.dist);
    if (!near.length) return { hit: false, detail: null };
    const best = near[0];
    return { hit: true, detail: `Daily open ${best.date} @${best.open.toFixed(5)} (${(best.dist / state.pipSize).toFixed(1)}p)${near.length > 1 ? ` +${near.length - 1}` : ''}` };
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 14 — Naked POC (NPOC)
// A daily POC that price has never revisited since it was formed.
// Built once per pair as a full-dataset scan; per-day lookup is O(log N).
// ══════════════════════════════════════════════════════════════════════════════

const nakedPoc = {
  id: 'naked_poc',
  label: 'Naked POC (NPOC)',
  description: 'Daily POC (body-midpoint volume profile) that price has never retested since formation',
  defaultWeight: 2.0,
  defaultEnabled: true,

  buildPairCache(packed, pipSize) {
    const { times, opens, closes, highs, lows, n } = packed;

    // Step 1: compute daily POC (body-midpoint histogram, same method as vahVal)
    const dailyBars = new Map(); // epoch → [bars]
    for (let i = 0; i < n; i++) {
      const day = times[i] - (times[i] % 86400);
      if (!dailyBars.has(day)) dailyBars.set(day, { hist: new Map(), total: 0, hi: highs[i], lo: lows[i] });
      const d = dailyBars.get(day);
      const key = Math.round((opens[i] + closes[i]) / 2 / pipSize);
      d.hist.set(key, (d.hist.get(key) ?? 0) + 1);
      d.total++;
      d.hi = Math.max(d.hi, highs[i]);
      d.lo = Math.min(d.lo, lows[i]);
    }

    const days = [...dailyBars.entries()].sort((a, b) => a[0] - b[0]);

    // Step 2: compute POC for each day
    const pocs = []; // { epoch, poc, hi, lo } sorted ascending
    for (const [epoch, { hist, hi, lo }] of days) {
      let pocKey = 0, pocCount = 0;
      for (const [k, cnt] of hist) { if (cnt > pocCount) { pocCount = cnt; pocKey = k; } }
      pocs.push({ epoch, poc: pocKey * pipSize, hi, lo });
    }

    // Step 3: mark each POC as filled/naked.
    // A POC at price P formed on day D is "filled" if any subsequent day's range (hi/lo) crosses P.
    // We scan forward — O(N days²) worst case but N≈1000-2000 so total ≈ 1M iterations per pair.
    const naked = []; // NPOCs: { epoch, poc } sorted ascending
    for (let i = 0; i < pocs.length; i++) {
      const { epoch, poc } = pocs[i];
      let touched = false;
      for (let j = i + 1; j < pocs.length; j++) {
        if (pocs[j].lo <= poc && pocs[j].hi >= poc) { touched = true; break; }
      }
      if (!touched) naked.push({ epoch, poc });
    }

    return { naked }; // sorted ascending by epoch
  },

  buildDayState(_packed, dayEpoch, pipSize, cache) {
    if (!cache?.naked?.length) return null;
    // Return only NPOCs formed before today (no lookahead)
    const arr = cache.naked;
    let lo = 0, hi = arr.length;
    while (lo < hi) { const m = (lo + hi) >>> 1; arr[m].epoch < dayEpoch ? lo = m + 1 : hi = m; }
    return { npocs: arr.slice(0, lo), pipSize };
  },

  check(price, _side, state, opts) {
    if (!state?.npocs?.length) return { hit: false, detail: null };
    const radius = (opts.zoneRadiusPips ?? 3) * state.pipSize;
    const near = state.npocs.filter(n => Math.abs(n.poc - price) <= radius);
    if (!near.length) return { hit: false, detail: null };
    near.sort((a, b) => Math.abs(a.poc - price) - Math.abs(b.poc - price));
    const best = near[0];
    const dist = (Math.abs(best.poc - price) / state.pipSize).toFixed(1);
    const date = new Date(best.epoch * 1000).toISOString().substring(0, 10);
    return { hit: true, detail: `NPOC ${date} @${best.poc.toFixed(5)} (${dist}p)${near.length > 1 ? ` +${near.length - 1} more` : ''}` };
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 15 — Z-Score Confluence (Overbought / Oversold)
// Computes rolling Z-Score on 5m resampled closes at Asia close (06:00 UTC).
// ══════════════════════════════════════════════════════════════════════════════

const zscoreConf = {
  id: 'zscore_conf',
  label: 'Z-Score OB/OS',
  description: 'BUY when Z-Score < −1.5 · SELL when > +1.5 · measured at Asia close on 5m bars',
  defaultWeight: 1.5,
  defaultEnabled: false,
  buildPairCache: null,

  buildDayState(packed, dayEpoch, pipSize, _cache, opts) {
    const len  = opts.zScoreLength ?? 20;
    const tf   = 5;  // 5-minute resampling (fixed)
    const secs = tf * 60;
    const from = dayEpoch + 6 * 3600 - len * secs * 4; // generous lookback
    const m1   = _extractFast(packed, from, dayEpoch + 6 * 3600 + 60);
    if (m1.length < len * tf) return null;

    // Resample to 5m — last close per bar
    const map = new Map();
    for (const b of m1) {
      const t0 = b.time - (b.time % secs);
      map.set(t0, b.close);
    }
    const closes = [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c);
    if (closes.length < len) return null;

    const sl = closes.slice(-len);
    const mu = sl.reduce((a, v) => a + v, 0) / len;
    const sd = Math.sqrt(sl.reduce((a, v) => a + (v - mu) ** 2, 0) / len);
    const z  = sd === 0 ? 0 : (sl.at(-1) - mu) / sd;

    return { z: +z.toFixed(3), pipSize };
  },

  check(_price, side, state, opts) {
    if (!state) return { hit: false, detail: null };
    const buyT  = opts.zScoreBuyThresh  ?? -1.5;
    const sellT = opts.zScoreSellThresh ??  1.5;
    const z = state.z;
    if (side === 'BUY'  && z <= buyT)  return { hit: true, detail: `Z=${z.toFixed(2)} ≤ ${buyT} (oversold)` };
    if (side === 'SELL' && z >= sellT) return { hit: true, detail: `Z=${z.toFixed(2)} ≥ ${sellT} (overbought)` };
    return { hit: false, detail: null };
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 16 — SMI Confluence (Stochastic Momentum Index OB/OS)
// Computes SMI(10,3,3) on 5m bars at Asia close.  Range −100 … +100.
// ══════════════════════════════════════════════════════════════════════════════

const smiConf = {
  id: 'smi_conf',
  label: 'SMI OB/OS',
  description: 'BUY when SMI < −40 · SELL when > +40 · 5m bars at Asia close · range −100..+100',
  defaultWeight: 1.5,
  defaultEnabled: false,
  buildPairCache: null,

  buildDayState(packed, dayEpoch, pipSize, _cache, opts) {
    const kLen = opts.smiKLength ?? 10;
    const dLen = opts.smiDLength ??  3;
    const eLen = opts.smiELength ??  3;
    const secs = 5 * 60;  // 5-minute bars
    const minBars = kLen + dLen * 6 + eLen * 6 + 15; // EMA warm-up
    const from = dayEpoch + 6 * 3600 - minBars * secs * 2;
    const m1   = _extractFast(packed, from, dayEpoch + 6 * 3600 + 60);
    if (m1.length < minBars * 5) return null;

    // Resample to 5m OHLC
    const map = new Map();
    for (const b of m1) {
      const t0 = b.time - (b.time % secs);
      if (!map.has(t0)) map.set(t0, { h: b.high, l: b.low, c: b.close });
      else { const r = map.get(t0); r.h = Math.max(r.h, b.high); r.l = Math.min(r.l, b.low); r.c = b.close; }
    }
    const tfB = [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    if (tfB.length < minBars) return null;

    const _ema = (arr, n) => {
      const k = 2 / (n + 1), out = new Array(arr.length).fill(NaN);
      let p = NaN, ok = false;
      for (let i = 0; i < arr.length; i++) {
        if (!isFinite(arr[i])) continue;
        if (!ok) { p = arr[i]; out[i] = p; ok = true; continue; }
        p = arr[i] * k + p * (1 - k); out[i] = p;
      }
      return out;
    };

    const N = tfB.length;
    const rr = new Array(N).fill(NaN), hl = new Array(N).fill(NaN);
    for (let i = kLen - 1; i < N; i++) {
      let hh = -Infinity, ll = Infinity;
      for (let j = i - kLen + 1; j <= i; j++) {
        if (tfB[j].h > hh) hh = tfB[j].h;
        if (tfB[j].l < ll) ll = tfB[j].l;
      }
      rr[i] = tfB[i].c - (hh + ll) / 2;
      hl[i] = hh - ll;
    }
    const rrEE = _ema(_ema(rr, dLen), dLen);
    const hlEE = _ema(_ema(hl, dLen), dLen);
    const raw  = rrEE.map((v, i) => (!isFinite(v) || !isFinite(hlEE[i]) || hlEE[i] === 0) ? NaN : 200 * (v / hlEE[i]));

    // Last valid SMI value (at Asia close)
    let smi = NaN;
    for (let i = raw.length - 1; i >= 0; i--) {
      if (isFinite(raw[i])) { smi = raw[i]; break; }
    }
    if (!isFinite(smi)) return null;

    return { smi: +smi.toFixed(2), pipSize };
  },

  check(_price, side, state, opts) {
    if (!state) return { hit: false, detail: null };
    const buyT  = opts.smiBuyThresh  ?? -40;
    const sellT = opts.smiSellThresh ??  40;
    const s = state.smi;
    if (side === 'BUY'  && s <= buyT)  return { hit: true, detail: `SMI=${s.toFixed(1)} ≤ ${buyT} (oversold)` };
    if (side === 'SELL' && s >= sellT) return { hit: true, detail: `SMI=${s.toFixed(1)} ≥ ${sellT} (overbought)` };
    return { hit: false, detail: null };
  },
};

// ── Module level extractors for chart overlay ────────────────────────────────
// Each module that produces independent structural price levels gets a
// getLevels(state, opts) → [{price, label, minor?}]  method patched on here.

srLevel.getLevels = (state, opts) => {
  if (!state?.swings?.length) return [];
  const center = opts?.asiaCenter ?? 0, range = opts?.asiaRange ?? 0;
  const buf = Math.max(range * 3, state.pipSize * 80);
  const ded = state.pipSize * 3;
  const deduped = [];
  for (const s of state.swings) {
    if (center && (s.price < center - buf || s.price > center + buf)) continue;
    if (!deduped.some(d => Math.abs(d.price - s.price) <= ded)) deduped.push(s);
  }
  return deduped.slice(0, 20).map(s => ({ price: s.price, label: 'SR' }));
};

vahVal.getLevels = (state) => {
  if (!state?.levels?.length) return [];
  return state.levels.slice(0, 2).flatMap(s => [
    { price: s.vah, label: `VAH ${s.date.slice(5)}` },
    { price: s.poc, label: `POC ${s.date.slice(5)}` },
    { price: s.val, label: `VAL ${s.date.slice(5)}` },
  ]);
};

volForecast.getLevels = (state) => {
  if (!state) return [];
  return [
    { price: state.forecastHigh, label: 'VF Hi' },
    { price: state.forecastLow,  label: 'VF Lo' },
  ];
};

ath52wk.getLevels = (state) => {
  if (!state) return [];
  return [
    { price: state.high52wk, label: '52wk H' },
    { price: state.low52wk,  label: '52wk L' },
  ];
};

mondayRange.getLevels = (state) => {
  if (!state) return [];
  return [
    { price: state.monHigh, label: 'Mon H' },
    { price: state.monLow,  label: 'Mon L' },
  ];
};

pdhPdl.getLevels = (state) => {
  if (!state) return [];
  return [
    { price: state.pdh, label: `PDH ${state.date?.slice(5) ?? ''}` },
    { price: state.pdl, label: `PDL ${state.date?.slice(5) ?? ''}` },
  ];
};

pwhPwl.getLevels = (state) => {
  if (!state) return [];
  return [
    { price: state.pwh, label: 'PWH' },
    { price: state.pwl, label: 'PWL' },
  ];
};

roundNumber.getLevels = (state, opts) => {
  if (!state) return [];
  const center = opts?.asiaCenter ?? 0, range = opts?.asiaRange ?? 0;
  if (!center) return [];
  const buf = Math.max(range * 3, state.pipSize * 150);
  const lo = center - buf, hi = center + buf;
  const majorUnit = state.pipSize * 1000, minorUnit = state.pipSize * 100;
  const levels = [];
  for (let p = Math.ceil(lo / majorUnit) * majorUnit; p <= hi + 1e-9; p += majorUnit)
    levels.push({ price: +p.toFixed(6), label: p.toFixed(5) });
  for (let p = Math.ceil(lo / minorUnit) * minorUnit; p <= hi + 1e-9; p += minorUnit) {
    if (Math.abs(p - Math.round(p / majorUnit) * majorUnit) < state.pipSize * 5) continue;
    levels.push({ price: +p.toFixed(6), label: p.toFixed(5), minor: true });
  }
  return levels;
};

// Nearest big-figure / half-figure to a price, with SIGNED distance in pips.
// Single source for the round-number arithmetic (same units as check()); the
// round-number fade/follow adapter (js/roundNumberLean.js) consumes this so the
// figure math is never duplicated.
roundNumber.nearest = (price, state) => {
  if (!state?.pipSize) return null;
  const majorUnit = state.pipSize * 1000, minorUnit = state.pipSize * 100;
  const maj = Math.round(price / majorUnit) * majorUnit;
  const min = Math.round(price / minorUnit) * minorUnit;
  // Prefer the big figure on a tie, or when the half-figure coincides with it.
  if (Math.abs(min - maj) < state.pipSize * 5 || Math.abs(price - maj) <= Math.abs(price - min))
    return { figure: +maj.toFixed(6), type: 'major', distPips: (price - maj) / state.pipSize };
  return { figure: +min.toFixed(6), type: 'minor', distPips: (price - min) / state.pipSize };
};

fvgLevel.getLevels = (state) => {
  if (!state?.fvgs?.length) return [];
  return state.fvgs.flatMap(g => [
    { price: g.hi, label: `FVG${g.type === 'bull' ? '▲' : '▼'}H` },
    { price: g.lo, label: `FVG${g.type === 'bull' ? '▲' : '▼'}L` },
  ]);
};

sessionOpenRange.getLevels = (state) => {
  if (!state) return [];
  return [
    { price: state.orH, label: 'OR H' },
    { price: state.orL, label: 'OR L' },
  ];
};

dailyOpens.getLevels = (state) => {
  if (!state?.opens?.length) return [];
  return state.opens.map(o => ({ price: o.open, label: `DO ${o.date.slice(5)}` }));
};

nakedPoc.getLevels = (state, opts) => {
  if (!state?.npocs?.length) return [];
  const center = opts?.asiaCenter ?? 0, range = opts?.asiaRange ?? 0;
  const buf = Math.max(range * 10, state.pipSize * 500);
  return state.npocs
    .filter(n => !center || Math.abs(n.poc - center) <= buf)
    .slice(-20)
    .map(n => ({ price: n.poc, label: `NPOC ${new Date(n.epoch * 1000).toISOString().substring(5, 10)}` }));
};

/**
 * Collect per-module structural price levels for chart overlay rendering.
 * Only modules that implement getLevels() are included.
 * @returns [{id, name, levels:[{price,label,minor?}]}]
 */
export function collectModuleLevels(dayStates, enabledMods, opts) {
  const out = [];
  for (const mod of enabledMods) {
    if (typeof mod.getLevels !== 'function') continue;
    const state = dayStates?.[mod.id];
    if (!state) continue;
    try {
      const levels = mod.getLevels(state, opts);
      if (levels?.length) out.push({ id: mod.id, name: mod.label, levels });
    } catch { /* skip */ }
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// Registry & runner
// ══════════════════════════════════════════════════════════════════════════════

export const CONFLUENCE_MODULES = [
  fibRepeat,
  prevReacted,
  srLevel,
  vahVal,
  nakedPoc,
  volForecast,
  ath52wk,
  mondayRange,
  pdhPdl,
  pwhPwl,
  roundNumber,
  fvgLevel,
  sessionOpenRange,
  dailyOpens,
  zscoreConf,
  smiConf,
];

export const MODULE_MAP = Object.fromEntries(CONFLUENCE_MODULES.map(m => [m.id, m]));

/**
 * Build once-per-pair caches. Call before the day loop.
 * Only modules with buildPairCache defined are included.
 */
// Only build caches for enabled modules — avoids full-dataset swing scans for disabled modules
export function buildAllPairCaches(packed, pipSize, enabledMods = CONFLUENCE_MODULES) {
  const caches = {};
  for (const mod of enabledMods) {
    if (mod.buildPairCache) {
      try { caches[mod.id] = mod.buildPairCache(packed, pipSize); }
      catch { caches[mod.id] = null; }
    }
  }
  return caches;
}

/**
 * Build once-per-day states for all enabled modules.
 * @param enabledIds  Set of module IDs to run
 */
export function buildDayStates(packed, dayEpoch, pipSize, pairCaches, opts, enabledIds) {
  const states = {};
  for (const mod of CONFLUENCE_MODULES) {
    if (!enabledIds.has(mod.id)) continue;
    try {
      states[mod.id] = mod.buildDayState(packed, dayEpoch, pipSize, pairCaches[mod.id] ?? null, opts);
    } catch {
      states[mod.id] = null;
    }
  }
  return states;
}

/**
 * Run all enabled modules against a single fib price.
 * @returns { results, hits, total, score, pct }
 *   results: { [id]: { hit, detail, weight } }
 *   hits:    raw count of modules that fired
 *   total:   number of enabled modules
 *   score:   weighted fraction (0–1)
 *   pct:     Math.round(score * 100)
 */
export function runModuleChecks(price, side, dayStates, enabledModules, opts) {
  const results = {};
  let weightedHits = 0, totalWeight = 0;

  for (const mod of enabledModules) {
    const weight = opts.moduleWeights?.[mod.id] ?? mod.defaultWeight;
    totalWeight += weight;
    let result = { hit: false, detail: null };
    try {
      const state = dayStates[mod.id];
      result = mod.check(price, side, state, opts);
    } catch { /* swallow per-module errors */ }
    results[mod.id] = { hit: result.hit, detail: result.detail ?? null, weight };
    if (result.hit) weightedHits += weight;
  }

  const score = totalWeight > 0 ? weightedHits / totalWeight : 0;
  return {
    results,
    hits:  Object.values(results).filter(r => r.hit).length,
    total: enabledModules.length,
    score: +score.toFixed(3),
    pct:   Math.round(score * 100),
  };
}
