// confluenceZoneExport.js
// Computes multi-layer confluence zones per instrument from daily OHLCV + vol forecast.
//
// Level types (10 distinct):
//   sr     — Swing pivot S/R: bar whose high/low is extreme vs ±PIVOT_CONFIRM surrounding bars
//   fib    — Fibonacci retracements from most recent swing pivot pairs (recursive, up to 3 pairs)
//   d_open — Previous daily opens (last 5 days)
//   vwap   — VWAP proxy: previous session pivot (H+L+C)/3  [best server-side approximation]
//   poc    — Approximate POC: daily range midpoint (H+L)/2, last 5 days
//   npoc   — Naked POC: daily midpoints not revisited by any subsequent bar's H-L range
//   w_piv  — Weekly pivots PP/R1/R2/S1/S2 (5-day window, 2 days back)
//   vol_m  — Vol forecast median absolute price levels (H-L and O-C legs from reference price)
//   vol_75 — Vol forecast 75th-pct absolute price levels
//   round  — Psychological round-number levels
//
// NOTE on VWAP/POC/NPOC: true values need tick or intraday volume data. These are
// the best approximations possible from daily OHLCV only. For intraday accuracy,
// use TradingView's native VWAP and a volume-profile indicator.
//
// Output format: "CZ {price} : {count} {type1},{type2},..."
// count = number of DISTINCT level types stacked within the cluster threshold.

// ── Config ────────────────────────────────────────────────────────────────────

const JPY_PAIRS  = new Set(['USDJPY', 'GBPJPY', 'EURJPY', 'AUDJPY', 'CADJPY', 'NZDJPY']);

// Cluster threshold (price units): how close two levels must be to merge into one zone
// ~0.065% of price across the board (GOLD 3/4650, NQ 15/29000, SPX 6/7650).
const CLUSTER_THRESH = {
  GOLD: 3.0, NQ: 15.0, SPX500: 6.0, DE30: 15.0, UK100: 8.0, US30: 15.0, US2000: 3.0,
  BTCUSD: 60.0,
};
const FX_CLUSTER_THRESH  = 0.0005;   // 5 pips standard FX
const JPY_CLUSTER_THRESH = 0.05;     // 5 pips JPY pairs

// Range filter: only emit levels within this many × the forecast daily range (the
// 75th-pct H-L) of the reference price. 1.5 keeps the zones close to the day's
// expected envelope — a small buffer past the expected high/low so boundary levels
// aren't clipped, without pulling in levels 2–3 daily ranges away that price can't
// realistically reach today. (Was 2.5 — tightened 2026-07 to hug the vol envelope.)
const RANGE_MULT = 1.5;

// Pivot confirmation: bars on each side that must be lower (for pivot high) or higher (for pivot low)
const PIVOT_CONFIRM = 2;

// Fibonacci ratios: retracement + two extensions
const FIB_RATIOS  = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
const FIB_EXTS    = [1.272, 1.618];

// Decimal places for price output
const PRICE_DP = {
  GOLD: 2, NQ: 2, SPX500: 2, DE30: 2, UK100: 2, US30: 2, US2000: 2,
  BTCUSD: 2,
};

// Round-number grid per instrument (psychological levels every N price units).
// Roughly 1% of price across the board: GOLD 50/4650, NQ 250/29000, SPX 100/7650.
// An instrument MISSING from here falls back to FX_ROUND_GRID (0.01), which is only
// sane for something priced near 1.0 — see the guard in roundNumberLevels().
const ROUND_GRID = {
  GOLD: 50.0, NQ: 250.0, SPX500: 100.0, DE30: 100.0,
  UK100: 100.0, US30: 250.0, US2000: 50.0,
  BTCUSD: 1000.0,
};
const FX_ROUND_GRID  = 0.01;    // every 100 pips FX
const JPY_ROUND_GRID = 1.0;     // every 100 pips JPY

// Sanity ceiling on the round-number ladder. A correctly-gridded instrument needs a
// handful of steps (GOLD 4, NQ 4, worst FX cross ~168). Anything wildly past that means
// the grid is wrong for this instrument's price scale, not that the market has thousands
// of psychological levels — so contribute NO round levels rather than a wall of junk.
const MAX_ROUND_STEPS = 400;

// Append every element of `src` to `dst`. Deliberately NOT `dst.push(...src)`: the
// spread passes each element as a separate ARGUMENT, so a large generator result
// overflows the call stack (V8 caps at ~65-125k args) and throws RangeError. That
// turned one mis-gridded instrument into a 500 on the entire zones export. A loop
// has no argument limit, so a bad array is now just a bad array.
function pushAll(dst, src) {
  if (!Array.isArray(src)) return dst;
  for (let i = 0; i < src.length; i++) dst.push(src[i]);
  return dst;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clusterThreshFor(name) {
  if (JPY_PAIRS.has(name)) return JPY_CLUSTER_THRESH;
  return CLUSTER_THRESH[name] ?? FX_CLUSTER_THRESH;
}

function fmtPrice(price, name) {
  const dp = PRICE_DP[name];
  if (dp !== undefined) return price.toFixed(dp);
  if (JPY_PAIRS.has(name)) return price.toFixed(3);
  return price.toFixed(5);
}

// ── S/R: Proper pivot high/low detection ─────────────────────────────────────
// A bar is a pivot high if its high > all PIVOT_CONFIRM bars on each side.
// A bar is a pivot low  if its low  < all PIVOT_CONFIRM bars on each side.
// Uses last `lookback` complete bars; skips the rightmost PIVOT_CONFIRM bars
// (they don't yet have right-side confirmation).

function pivotSRLevels(bars, refPrice, rangeFilter, lookback = 30) {
  const c     = PIVOT_CONFIRM;
  const slice = bars.slice(-(lookback + c));          // enough room for right-side confirmation
  const end   = slice.length - c;                     // last bar with right-side confirmation
  const levels = [];

  for (let i = c; i < end; i++) {
    const b = slice[i];
    let isHigh = true, isLow = true;

    for (let j = 1; j <= c; j++) {
      if (slice[i - j].high >= b.high || slice[i + j].high >= b.high) isHigh = false;
      if (slice[i - j].low  <= b.low  || slice[i + j].low  <= b.low)  isLow  = false;
    }

    if (isHigh && b.high > 0 && Math.abs(b.high - refPrice) <= rangeFilter) {
      levels.push({ price: b.high, type: 'sr' });
    }
    if (isLow && b.low > 0 && Math.abs(b.low - refPrice) <= rangeFilter) {
      levels.push({ price: b.low, type: 'sr' });
    }
  }

  return levels;
}

// ── Fibs: from identified swing pivot pairs (recursive) ──────────────────────
// Detects the same pivot highs/lows as pivotSRLevels, assembles them in
// time order, then iterates consecutive alternating pairs (H→L or L→H swings).
// Computes fibs from up to `maxPairs` most recent valid swing pairs.
// Falls back to simple window max/min if no confirmed pivot pairs found.

function fibFromSwingPairs(bars, refPrice, rangeFilter, lookback = 25, maxPairs = 3) {
  const c     = PIVOT_CONFIRM;
  const slice = bars.slice(-(lookback + c));
  const end   = slice.length - c;
  const pivots = [];

  for (let i = c; i < end; i++) {
    const b = slice[i];
    let isHigh = true, isLow = true;
    for (let j = 1; j <= c; j++) {
      if (slice[i - j].high >= b.high || slice[i + j].high >= b.high) isHigh = false;
      if (slice[i - j].low  <= b.low  || slice[i + j].low  <= b.low)  isLow  = false;
    }
    if (isHigh) pivots.push({ price: b.high, isHigh: true,  idx: i });
    if (isLow)  pivots.push({ price: b.low,  isHigh: false, idx: i });
  }

  // Work backwards from most recent pivot, collect alternating pairs
  const levels = [];
  let pairsUsed = 0;

  for (let i = pivots.length - 1; i > 0 && pairsUsed < maxPairs; i--) {
    const p1 = pivots[i];
    const p0 = pivots[i - 1];
    if (p1.isHigh !== p0.isHigh) {      // alternating = valid swing
      const high = Math.max(p1.price, p0.price);
      const low  = Math.min(p1.price, p0.price);
      pushAll(levels, _fibLevels(high, low, refPrice, rangeFilter));
      pairsUsed++;
    }
  }

  // Fallback: if no confirmed swing pairs, use the overall 5-day and 10-day windows
  if (pairsUsed === 0) {
    for (const n of [5, 10]) {
      if (bars.length > n) {
        const sl   = bars.slice(-n);
        const high = Math.max(...sl.map(b => b.high));
        const low  = Math.min(...sl.map(b => b.low));
        pushAll(levels, _fibLevels(high, low, refPrice, rangeFilter));
      }
    }
  }

  return levels;
}

function _fibLevels(high, low, refPrice, rangeFilter) {
  const range = high - low;
  if (range <= 0) return [];
  const levels = [];
  for (const r of FIB_RATIOS) {
    const p = high - r * range;
    if (p > 0 && Math.abs(p - refPrice) <= rangeFilter) {
      levels.push({ price: p, type: 'fib' });
    }
  }
  for (const r of FIB_EXTS) {
    // Extension projects below the low (down-move context) and above the high (up-move context)
    const pDn = low  - (r - 1.0) * range;
    const pUp = high + (r - 1.0) * range;
    if (pDn > 0 && Math.abs(pDn - refPrice) <= rangeFilter) levels.push({ price: pDn, type: 'fib' });
    if (pUp > 0 && Math.abs(pUp - refPrice) <= rangeFilter) levels.push({ price: pUp, type: 'fib' });
  }
  return levels;
}

// ── Previous daily opens ──────────────────────────────────────────────────────

function prevOpenLevels(bars, refPrice, rangeFilter, nDays = 5) {
  return bars.slice(-(nDays + 1), -1)    // last nDays complete bars, skip today's incomplete
    .map(b => ({ price: b.open, type: 'd_open' }))
    .filter(l => l.price > 0 && Math.abs(l.price - refPrice) <= rangeFilter);
}

// ── VWAP proxy: previous session pivot (H+L+C)/3 ─────────────────────────────
// The traditional pivot point is the standard offline VWAP approximation used
// in interbank/institutional analysis. True VWAP needs intraday volume data.

function vwapProxyLevel(bars, refPrice, rangeFilter) {
  if (bars.length < 2) return [];
  const prev  = bars.at(-1);              // last complete day = "previous session"
  const pivot = (prev.high + prev.low + prev.close) / 3;
  if (pivot > 0 && Math.abs(pivot - refPrice) <= rangeFilter) {
    return [{ price: pivot, type: 'vwap' }];
  }
  return [];
}

// ── POC approximation: daily range midpoints ──────────────────────────────────
// True POC requires volume-at-price data. Midpoint (H+L)/2 is the best
// approximation from OHLC alone — it represents where price spent the most
// geometric time within the day's range.

function pocLevels(bars, refPrice, rangeFilter, nDays = 5) {
  return bars.slice(-(nDays + 1), -1)
    .map(b => ({ price: (b.high + b.low) / 2, type: 'poc' }))
    .filter(l => l.price > 0 && Math.abs(l.price - refPrice) <= rangeFilter);
}

// ── NPOC: Naked (unvisited) POC approximation ─────────────────────────────────
// A previous session's POC (midpoint) is "naked" if no subsequent bar's H-L
// range has traded through it. These are high-value magnets for price.

function npocLevels(bars, refPrice, rangeFilter, lookback = 20) {
  const levels = [];
  const start  = Math.max(0, bars.length - lookback - 1);

  for (let i = start; i < bars.length - 1; i++) {
    const poc = (bars[i].high + bars[i].low) / 2;
    if (poc <= 0 || Math.abs(poc - refPrice) > rangeFilter) continue;

    // Check if any bar after day i has traded through this POC
    let revisited = false;
    for (let j = i + 1; j < bars.length; j++) {
      if (bars[j].low <= poc && bars[j].high >= poc) {
        revisited = true;
        break;
      }
    }
    if (!revisited) levels.push({ price: poc, type: 'npoc' });
  }
  return levels;
}

// ── Weekly pivots: PP/R1/R2/S1/S2 ────────────────────────────────────────────

function weeklyPivotLevels(bars, refPrice, rangeFilter) {
  const wBars = bars.slice(-8, -2);      // ~5 bars from 2–8 days back as "previous week"
  if (wBars.length < 3) return [];
  const wH  = Math.max(...wBars.map(b => b.high));
  const wL  = Math.min(...wBars.map(b => b.low));
  const wC  = wBars.at(-1).close;
  const pp  = (wH + wL + wC) / 3;
  const rng = wH - wL;
  return [
    { price: pp,         type: 'w_piv' },   // PP
    { price: 2*pp - wL, type: 'w_piv' },   // R1
    { price: pp + rng,   type: 'w_piv' },   // R2
    { price: 2*pp - wH, type: 'w_piv' },   // S1
    { price: pp - rng,   type: 'w_piv' },   // S2
  ].filter(l => l.price > 0 && Math.abs(l.price - refPrice) <= rangeFilter);
}

// ── Vol forecast: absolute price levels ──────────────────────────────────────
// The vol forecast defines the expected trading range — these are the TARGET levels
// the dashboard is built around. Any technical zone that stacks near a vol level
// is prioritised by the confluence count automatically.

function volForecastAbsLevels(refPrice, fc, rangeFilter) {
  if (!fc) return [];
  const levels = [];
  const add = (pct, type) => {
    if (!pct || pct <= 0) return;
    const up = refPrice * (1 + pct / 100);
    const dn = refPrice * (1 - pct / 100);
    if (up > 0 && Math.abs(up - refPrice) <= rangeFilter) levels.push({ price: up, type });
    if (dn > 0 && Math.abs(dn - refPrice) <= rangeFilter) levels.push({ price: dn, type });
  };
  add(fc.hl_median, 'vol_m');
  add(fc.hl_75,     'vol_75');
  add(fc.oc_median, 'vol_m');
  add(fc.oc_75,     'vol_75');
  return levels;
}

// ── Round (psychological) levels ─────────────────────────────────────────────

function roundNumberLevels(refPrice, name, rangeFilter) {
  const grid = JPY_PAIRS.has(name) ? JPY_ROUND_GRID : (ROUND_GRID[name] ?? FX_ROUND_GRID);
  if (!(grid > 0) || !(refPrice > 0) || !(rangeFilter >= 0)) return [];
  const base  = Math.round(refPrice / grid) * grid;
  const steps = Math.ceil(rangeFilter / grid) + 1;
  // Grid/price-scale mismatch — an instrument with no ROUND_GRID entry inheriting the
  // 0.01 FX grid. BTCUSD did exactly this: rangeFilter ~5,220 over a 0.01 grid asked for
  // a million levels, and `pushAll(all, levels)` then blew the call stack and took the
  // WHOLE export down (500 "Maximum call stack size exceeded"), including the OI section
  // that has its own try/catch and would have succeeded. Drop the round-number layer for
  // this instrument; every other level type still contributes.
  if (steps > MAX_ROUND_STEPS) return [];
  const levels = [];
  for (let i = -steps; i <= steps; i++) {
    const p = base + i * grid;
    if (p > 0 && Math.abs(p - refPrice) <= rangeFilter) {
      levels.push({ price: p, type: 'round' });
    }
  }
  return levels;
}

// ── Clustering ────────────────────────────────────────────────────────────────

function clusterLevels(allLevels, thresh) {
  if (!allLevels.length) return [];
  allLevels.sort((a, b) => a.price - b.price);

  const zones = [];
  let i = 0;
  while (i < allLevels.length) {
    const cluster = [allLevels[i]];
    let j = i + 1;
    while (j < allLevels.length) {
      const centre = cluster.reduce((s, l) => s + l.price, 0) / cluster.length;
      if (allLevels[j].price - centre <= thresh) {
        cluster.push(allLevels[j]);
        j++;
      } else break;
    }

    const types = [...new Set(cluster.map(l => l.type))];
    if (types.length >= 2) {
      const price    = cluster.reduce((s, l) => s + l.price, 0) / cluster.length;
      const rawCount = cluster.length;
      zones.push({ price, count: types.length, types, rawCount });
    }
    i = j > i + 1 ? j : i + 1;
  }

  return zones.sort((a, b) => b.count - a.count || b.rawCount - a.rawCount);
}

// ── Per-instrument computation ────────────────────────────────────────────────

export function computeZonesForInstrument(name, bars, fc, todayOpen = null) {
  if (!bars || bars.length < 10) return [];

  // Reference price: today's open if passed in, else last complete bar's close
  const refPrice    = todayOpen ?? bars.at(-1).close;

  // Range filter: only include levels within RANGE_MULT × forecast daily range.
  // This keeps the vol forecast as the spatial "basis" — everything outside the
  // expected daily move is irrelevant for today's trading.
  const hlPct       = Math.max(fc?.hl_75 ?? 0, fc?.hl_median ?? 0, 0.5);
  const rangeFilter = refPrice * hlPct * RANGE_MULT / 100;
  const thresh      = clusterThreshFor(name);
  const all         = [];

  // 1. Swing pivot S/R — proper pivot detection (2-bar confirmation each side, 30-day lookback)
  pushAll(all, pivotSRLevels(bars, refPrice, rangeFilter));

  // 2. Fibonacci from identified swing pivot pairs (recursive, most recent 3 pairs)
  pushAll(all, fibFromSwingPairs(bars, refPrice, rangeFilter));

  // 3. Previous daily opens (last 5 days) — key magnet levels
  pushAll(all, prevOpenLevels(bars, refPrice, rangeFilter));

  // 4. VWAP proxy — previous session pivot (H+L+C)/3
  pushAll(all, vwapProxyLevel(bars, refPrice, rangeFilter));

  // 5. POC approximation — daily range midpoints (last 5 days)
  pushAll(all, pocLevels(bars, refPrice, rangeFilter));

  // 6. NPOC — unvisited daily midpoints (20-day lookback)
  pushAll(all, npocLevels(bars, refPrice, rangeFilter));

  // 7. Weekly pivots PP/R1/R2/S1/S2
  pushAll(all, weeklyPivotLevels(bars, refPrice, rangeFilter));

  // 8. Vol forecast absolute levels — medians and 75th pct from reference price
  pushAll(all, volForecastAbsLevels(refPrice, fc, rangeFilter));

  // 9. Psychological round numbers
  pushAll(all, roundNumberLevels(refPrice, name, rangeFilter));

  return clusterLevels(all, thresh);
}

// ── Text block builder ────────────────────────────────────────────────────────

export function buildConfluenceZoneText(ohlcCache, forecastData, todayOpens = {}) {
  const LW   = 38;
  const hdr  = '──── CONFLUENCE ZONES ' + '─'.repeat(Math.max(0, LW - 22));
  const date = forecastData?.session_date ?? new Date().toISOString().split('T')[0];

  const lines = [hdr, `Generated: ${date}`, ''];

  const instruments = forecastData?.instruments ?? {};
  for (const [name, fc] of Object.entries(instruments)) {
    const bars = ohlcCache?.[name];
    if (!bars || bars.length < 10) continue;

    const zones = computeZonesForInstrument(name, bars, fc, todayOpens[name] ?? null);
    if (!zones.length) continue;

    lines.push(name);
    for (const z of zones.slice(0, 12)) {
      lines.push(`CZ ${fmtPrice(z.price, name)} : ${z.count} ${z.types.join(',')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
