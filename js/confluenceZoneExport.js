// confluenceZoneExport.js
// Computes multi-layer confluence zones per instrument from daily OHLCV + vol forecast.
//
// Levels computed per instrument:
//   fib    — Fibonacci retracements from 3/5/10-day swing high-low (recursive)
//   prev_h — Previous daily highs (last 3 days)
//   prev_l — Previous daily lows (last 3 days)
//   d_open — Previous daily opens (last 5 days)
//   prev_c — Previous daily closes (last 2 days)
//   w_piv  — Weekly pivot PP/R1/R2/S1/S2 (traditional, from ~5-day prior window)
//   vol_m  — Vol forecast median absolute levels (from reference price)
//   vol_75 — Vol forecast 75th-pct absolute levels
//   round  — Psychological round number levels
//
// Output format per CZ line: "CZ {price} : {count} {type1},{type2},..."
// count = number of DISTINCT level types stacked in the zone.

// ── Pip/threshold config ──────────────────────────────────────────────────────

const JPY_PAIRS = new Set(['USDJPY', 'GBPJPY', 'EURJPY', 'AUDJPY', 'CADJPY']);
const INDEX_INSTS = new Set(['NQ', 'SPX500', 'DE30', 'UK100', 'US30', 'US2000']);

// Cluster threshold (price units): how close two levels must be to join one zone
const CLUSTER_THRESH = {
  GOLD: 3.0, NQ: 15.0, SPX500: 6.0, DE30: 15.0, UK100: 8.0, US30: 15.0, US2000: 3.0,
};
const FX_CLUSTER_THRESH  = 0.0005;   // 5 pips standard FX
const JPY_CLUSTER_THRESH = 0.05;     // 5 pips JPY

// How many daily-range multiples out from reference price we still emit levels
const RANGE_MULT = 2.5;

// Fibonacci ratios used for retracement
const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0, 1.272, 1.618];

// Decimal places for price formatting
const PRICE_DP = {
  GOLD: 2, NQ: 2, SPX500: 2, DE30: 2, UK100: 2, US30: 2, US2000: 2,
};

// Round-number grid size per instrument (price units between round levels)
const ROUND_GRID = {
  GOLD: 50.0, NQ: 250.0, SPX500: 100.0, DE30: 100.0,
  UK100: 100.0, US30: 250.0, US2000: 50.0,
};
const FX_ROUND_GRID  = 0.01;   // every 100 pips
const JPY_ROUND_GRID = 1.0;    // every 100 pips for JPY

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

function swingHL(bars, n) {
  const slice = bars.slice(-n);
  return {
    high: Math.max(...slice.map(b => b.high)),
    low:  Math.min(...slice.map(b => b.low)),
  };
}

// ── Level generators ──────────────────────────────────────────────────────────

function fibLevels(high, low, refPrice, rangeFilter) {
  const range = high - low;
  if (range <= 0) return [];
  const levels = [];

  // Standard retracement from high downward
  for (const r of FIB_RATIOS) {
    const p = high - r * range;
    if (p > 0 && Math.abs(p - refPrice) <= rangeFilter) {
      levels.push({ price: p, type: 'fib' });
    }
  }
  // Extension below the low
  for (const r of [1.272, 1.618]) {
    const p = low - (r - 1.0) * range;
    if (p > 0 && Math.abs(p - refPrice) <= rangeFilter) {
      levels.push({ price: p, type: 'fib' });
    }
  }
  return levels;
}

function prevDailyLevels(bars, refPrice, rangeFilter) {
  const levels = [];
  const recent = bars.slice(-6);   // last 5 complete days
  for (let i = 0; i < recent.length; i++) {
    const b   = recent[i];
    const age = recent.length - 1 - i;  // 0 = yesterday, 1 = day before, …
    const add = (price, type) => {
      if (price > 0 && Math.abs(price - refPrice) <= rangeFilter) {
        levels.push({ price, type });
      }
    };
    if (age < 5) add(b.open,  'd_open');
    if (age < 3) add(b.high,  'prev_h');
    if (age < 3) add(b.low,   'prev_l');
    if (age < 2) add(b.close, 'prev_c');
  }
  return levels;
}

function weeklyPivotLevels(bars, refPrice, rangeFilter) {
  // Treat the 5 bars from 2–7 days ago as the "previous week" reference window
  const wBars = bars.slice(-8, -2);
  if (wBars.length < 3) return [];
  const wH   = Math.max(...wBars.map(b => b.high));
  const wL   = Math.min(...wBars.map(b => b.low));
  const wC   = wBars.at(-1).close;
  const pp   = (wH + wL + wC) / 3;
  const rng  = wH - wL;
  const pivots = [
    { price: pp,          type: 'w_piv' },
    { price: 2*pp - wL,  type: 'w_piv' },   // R1
    { price: pp + rng,    type: 'w_piv' },   // R2
    { price: 2*pp - wH,  type: 'w_piv' },   // S1
    { price: pp - rng,    type: 'w_piv' },   // S2
  ];
  return pivots.filter(l => l.price > 0 && Math.abs(l.price - refPrice) <= rangeFilter);
}

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

function roundNumberLevels(refPrice, name, rangeFilter) {
  const grid =
    JPY_PAIRS.has(name)  ? JPY_ROUND_GRID  :
    ROUND_GRID[name]     ?? FX_ROUND_GRID;

  const base  = Math.round(refPrice / grid) * grid;
  const steps = Math.ceil(rangeFilter / grid) + 1;
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
    // Grow cluster: keep adding while next level is within thresh of running centre
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

  // Sort by type count descending, then raw density as tiebreaker
  return zones.sort((a, b) => b.count - a.count || b.rawCount - a.rawCount);
}

// ── Per-instrument computation ────────────────────────────────────────────────

export function computeZonesForInstrument(name, bars, fc, todayOpen = null) {
  if (!bars || bars.length < 10) return [];

  const refPrice    = todayOpen ?? bars.at(-1).close;
  const hlPct       = Math.max(fc?.hl_75 ?? 0, fc?.hl_median ?? 0, 0.5);
  const rangeFilter = refPrice * hlPct * RANGE_MULT / 100;
  const thresh      = clusterThreshFor(name);
  const allLevels   = [];

  // 1. Fibonacci retracements — three overlapping swing windows
  for (const n of [3, 5, 10]) {
    if (bars.length >= n + 1) {
      const { high, low } = swingHL(bars, n);
      allLevels.push(...fibLevels(high, low, refPrice, rangeFilter));
    }
  }

  // 2. Previous daily highs, lows, opens, closes
  allLevels.push(...prevDailyLevels(bars, refPrice, rangeFilter));

  // 3. Weekly pivot levels
  allLevels.push(...weeklyPivotLevels(bars, refPrice, rangeFilter));

  // 4. Vol forecast absolute levels from reference open
  allLevels.push(...volForecastAbsLevels(refPrice, fc, rangeFilter));

  // 5. Round (psychological) number levels
  allLevels.push(...roundNumberLevels(refPrice, name, rangeFilter));

  return clusterLevels(allLevels, thresh);
}

// ── Text block builder ────────────────────────────────────────────────────────
// Builds the structured text block for TradingView paste import.
//
// Section header:  "──── CONFLUENCE ZONES ──────…"
// Per-instrument:  symbol name on its own line, then CZ lines, then blank line.
// CZ line format:  "CZ {price} : {count} {type1},{type2},..."

export function buildConfluenceZoneText(ohlcCache, forecastData, todayOpens = {}) {
  const LW   = 38;
  const hdr  = '──── CONFLUENCE ZONES ' + '─'.repeat(Math.max(0, LW - 22));
  const date = forecastData?.session_date ?? new Date().toISOString().split('T')[0];

  const lines = [hdr, `Generated: ${date}`, ''];

  const instruments = forecastData?.instruments ?? {};
  for (const [name, fc] of Object.entries(instruments)) {
    const bars = ohlcCache?.[name];
    if (!bars || bars.length < 10) continue;

    const todayOpen = todayOpens[name] ?? null;
    const zones     = computeZonesForInstrument(name, bars, fc, todayOpen);
    if (!zones.length) continue;

    lines.push(name);
    // Cap at 12 zones; minimum 2 distinct level types
    for (const z of zones.slice(0, 12)) {
      const priceStr = fmtPrice(z.price, name);
      const typesStr = z.types.join(',');
      lines.push(`CZ ${priceStr} : ${z.count} ${typesStr}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
