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

// ── Utility ───────────────────────────────────────────────────────────────────

function _bisect(times, target) {
  let lo = 0, hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (times[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Binary-search based extraction — O(log N + window) instead of O(N)
function _extractFast(packed, fromEpoch, toEpoch) {
  const { times, opens, highs, lows, closes, n } = packed;
  const start = _bisect(times, fromEpoch);
  const bars = [];
  for (let i = start; i < n && times[i] < toEpoch; i++) {
    bars.push({ time: times[i], open: opens[i], high: highs[i], low: lows[i], close: closes[i] });
  }
  return bars;
}

function _resample30m(bars) {
  const secs = 30 * 60;
  const map = new Map();
  for (const b of bars) {
    const t0 = b.time - (b.time % secs);
    if (!map.has(t0)) map.set(t0, { time: t0, open: b.open, high: b.high, low: b.low, close: b.close });
    else {
      const r = map.get(t0);
      r.high  = Math.max(r.high, b.high);
      r.low   = Math.min(r.low,  b.low);
      r.close = b.close;
    }
  }
  return [...map.values()].sort((a, b) => a.time - b.time);
}

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

const _FIB_LEVELS = [
  -9.5,-9,-8.5,-8,-7.5,-7,-6.5,-6,-5.5,-5,-4.5,-4,-3.5,-3,-2.5,-2,-1.5,-1,-0.5,-0.25,
  0,0.25,0.5,0.75,1,1.25,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8,8.5,9,9.5,10,10.5,
];

function _fibs(low, range) {
  return _FIB_LEVELS.map(lv => ({ level: lv, price: low + range * lv }));
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
    const swings = [
      ...cache.swingH.filter(s => s.time >= windowStart && s.time < dayEpoch),
      ...cache.swingL.filter(s => s.time >= windowStart && s.time < dayEpoch),
    ];
    return { swings, pipSize };
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
    const bars = _extractFast(packed, dayEpoch - 86400, dayEpoch);
    if (bars.length < 20) return null;

    // Price histogram: integer pip keys → count
    const hist = new Map();
    let total  = 0;
    for (const b of bars) {
      const loKey = Math.round(b.low  / pipSize);
      const hiKey = Math.round(b.high / pipSize);
      for (let k = loKey; k <= hiKey; k++) {
        hist.set(k, (hist.get(k) ?? 0) + 1);
        total++;
      }
    }
    if (!hist.size) return null;

    // POC = key with highest count
    let pocKey = 0, pocCount = 0;
    for (const [k, cnt] of hist) { if (cnt > pocCount) { pocCount = cnt; pocKey = k; } }

    // Expand from POC outward to capture 70% of volume
    const sorted  = [...hist.entries()].sort((a, b) => a[0] - b[0]);
    const target  = total * 0.70;
    let   pocIdx  = sorted.findIndex(([k]) => k === pocKey);
    if (pocIdx < 0) pocIdx = Math.floor(sorted.length / 2);
    let lo = pocIdx, hi = pocIdx, captured = pocCount;

    while (captured < target && (lo > 0 || hi < sorted.length - 1)) {
      const addLo = lo > 0              ? sorted[lo - 1][1] : -1;
      const addHi = hi < sorted.length - 1 ? sorted[hi + 1][1] : -1;
      if (addLo >= addHi && addLo > 0) { lo--; captured += addLo; }
      else if (addHi > 0)              { hi++; captured += addHi; }
      else break;
    }

    return {
      vah:     sorted[hi][0] * pipSize,
      val:     sorted[lo][0] * pipSize,
      poc:     pocKey * pipSize,
      pipSize,
    };
  },

  check(price, _side, state, opts) {
    if (!state) return { hit: false, detail: null };
    const radius = (opts.zoneRadiusPips ?? 3) * state.pipSize;
    const checks = [
      { lbl: 'VAH', price: state.vah },
      { lbl: 'VAL', price: state.val },
      { lbl: 'POC', price: state.poc },
    ];
    const near = checks.filter(c => Math.abs(c.price - price) <= radius);
    if (!near.length) return { hit: false, detail: null };
    near.sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price));
    const dist = (Math.abs(near[0].price - price) / state.pipSize).toFixed(1);
    return { hit: true, detail: `${near.map(c => c.lbl).join('+')} @ ${near[0].price.toFixed(5)} (${dist}p)` };
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
  buildPairCache: null,

  buildDayState(packed, dayEpoch, pipSize, _cache, _opts) {
    // Collect last 22 daily closes (close of last M1 bar each UTC day)
    const closes = [];
    for (let d = 28; d >= 1 && closes.length < 22; d--) {
      const ep  = dayEpoch - d * 86400;
      const bars = _extractFast(packed, ep, ep + 86400);
      if (bars.length) closes.push(bars.at(-1).close);
    }
    if (closes.length < 6) return null;

    // EWMA variance
    const lambda = 0.94;
    let variance = 0;
    for (let i = 1; i < closes.length; i++) {
      const r = Math.log(closes[i] / closes[i - 1]);
      variance = lambda * variance + (1 - lambda) * r * r;
    }
    const sigma = Math.sqrt(variance);

    // HL 75th pct = BM_P75 × FX_correction × sigma × price
    const hl75_mult = 2.049 * 0.894; // BM P75 × FX correction
    const refClose  = closes.at(-1);
    const halfRange = refClose * hl75_mult * sigma / 2;

    return {
      forecastHigh: refClose + halfRange,
      forecastLow:  refClose - halfRange,
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
    const since = dayEpoch - 252 * 86400;
    const window = cache.arr.filter(d => d.epoch >= since && d.epoch < dayEpoch);
    if (!window.length) return null;
    return {
      high52wk: Math.max(...window.map(d => d.high)),
      low52wk:  Math.min(...window.map(d => d.low)),
      pipSize,
    };
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
    const dow      = new Date(dayEpoch * 1000).getUTCDay();
    const daysBack = dow === 1 ? 7 : dow === 0 ? 6 : dow - 1;
    const monEpoch = dayEpoch - daysBack * 86400;
    const bars     = _extractFast(packed, monEpoch, monEpoch + 86400);
    if (bars.length < 10) return null;

    // Resample to 15m, use wick high/low
    const secs = 15 * 60;
    const map  = new Map();
    for (const b of bars) {
      const t0 = b.time - (b.time % secs);
      if (!map.has(t0)) map.set(t0, { high: b.high, low: b.low });
      else { const r = map.get(t0); r.high = Math.max(r.high, b.high); r.low = Math.min(r.low, b.low); }
    }
    let high = -Infinity, low = Infinity;
    for (const { high: h, low: l } of map.values()) { high = Math.max(high, h); low = Math.min(low, l); }
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
// Registry & runner
// ══════════════════════════════════════════════════════════════════════════════

export const CONFLUENCE_MODULES = [
  fibRepeat,
  prevReacted,
  srLevel,
  vahVal,
  volForecast,
  ath52wk,
  mondayRange,
];

export const MODULE_MAP = Object.fromEntries(CONFLUENCE_MODULES.map(m => [m.id, m]));

/**
 * Build once-per-pair caches. Call before the day loop.
 * Only modules with buildPairCache defined are included.
 */
export function buildAllPairCaches(packed, pipSize) {
  const caches = {};
  for (const mod of CONFLUENCE_MODULES) {
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
