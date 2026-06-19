// Yield Spread Z-Score Backtester
//
// Strategy: each pair in ZSCORE_PAIRS mean-reverts back into the Asia session range
// after the US-vs-local 2Y/short-rate yield spread z-score overshoots an asymmetric
// threshold and price extends to a Fibonacci projection level outside that range.
//
// Spread definition (per pair): spread = US2Y - <local short rate>. z > +threshold
// => LONG, z < -threshold => SHORT. Only USDJPY's sign has been validated against
// live results — every other pair's convention is unconfirmed, so
// `opts.invert.<pairKey>` lets the UI flip any of them without a redeploy.
import { loadM1ForPair } from './volBacktestM1Engine.js';

export const ZSCORE_PAIRS = {
  usdjpy: {
    label: 'USDJPY', pairDisplay: 'USD/JPY',
    baseSeries: 'GS2', quoteSeries: 'IRSTCI01JPM156N',
    pip: 0.01, defaultThreshold: 2.0,
  },
  eurusd: {
    label: 'EURUSD', pairDisplay: 'EUR/USD',
    baseSeries: 'GS2', quoteSeries: 'IRSTCI01DEM156N',
    pip: 0.0001, defaultThreshold: 2.5,
  },
  gbpusd: {
    label: 'GBPUSD', pairDisplay: 'GBP/USD',
    baseSeries: 'GS2', quoteSeries: 'IR3TIB01GBM156N',
    pip: 0.0001, defaultThreshold: 2.5,
  },
  audusd: {
    label: 'AUDUSD', pairDisplay: 'AUD/USD',
    baseSeries: 'GS2', quoteSeries: 'IR3TIB01AUM156N',
    pip: 0.0001, defaultThreshold: 2.5,
  },
  usdcad: {
    label: 'USDCAD', pairDisplay: 'USD/CAD',
    baseSeries: 'GS2', quoteSeries: 'IRSTCI01CAM156N',
    pip: 0.0001, defaultThreshold: 2.0,
  },
  usdchf: {
    label: 'USDCHF', pairDisplay: 'USD/CHF',
    baseSeries: 'GS2', quoteSeries: 'IRSTCI01CHM156N',
    pip: 0.0001, defaultThreshold: 2.0,
  },
};

const FIB_MULTS_ALL   = [0.25, 0.75, 1.25, 1.5, 2.0];
const FIB_MULTS_FIRST = [0.25];

// Asia session = 00:00-05:59 UTC. At 1m resolution that's 360 possible bars;
// require decent coverage (no large session-defining gap) before trusting the range.
const ASIA_MIN_BARS = 275;
const ASIA_MAX_HOUR_REQUIRED = 5;

// ── FRED ──────────────────────────────────────────────────────────────────────

async function fetchFredObservations(seriesId, fromDate, fredKey) {
  const url = `https://api.stlouisfed.org/fred/series/observations`
            + `?series_id=${seriesId}&api_key=${fredKey}&file_type=json`
            + `&observation_start=${fromDate}&sort_order=asc`;
  const r = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  if (!r.ok) throw new Error(`FRED ${seriesId} HTTP ${r.status}`);
  const json = await r.json();
  const out = new Map();
  for (const obs of json.observations ?? []) {
    if (obs.value === '.' || obs.value == null) continue;
    const v = parseFloat(obs.value);
    if (isFinite(v)) out.set(obs.date, v);
  }
  return out;
}

function _shiftDate(dateStr, deltaDays) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().substring(0, 10);
}

function _dateRangeDays(fromStr, toStr) {
  const out = [];
  let d = new Date(fromStr + 'T00:00:00Z');
  const end = new Date(toStr + 'T00:00:00Z');
  while (d <= end) {
    out.push(d.toISOString().substring(0, 10));
    d = new Date(d.getTime() + 86_400_000);
  }
  return out;
}

// Rolling z-score of (us - other), forward-filled across calendar days so monthly
// OECD short-rate series (JP/DE) carry forward between releases.
function buildRollingZSeries(usObs, otherObs, zWindow, dateFrom, dateTo) {
  const fredFrom = _shiftDate(dateFrom, -(zWindow + 14));
  const days = _dateRangeDays(fredFrom, dateTo);

  let lastUs = null, lastOther = null;
  const spread = new Array(days.length);
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    if (usObs.has(d)) lastUs = usObs.get(d);
    if (otherObs.has(d)) lastOther = otherObs.get(d);
    spread[i] = (lastUs != null && lastOther != null) ? lastUs - lastOther : null;
  }

  const zByDate = new Map();
  const win = [];
  let sum = 0, sumSq = 0;
  const warmup = Math.min(zWindow, 30);
  for (let i = 0; i < days.length; i++) {
    const v = spread[i];
    if (v != null) {
      win.push(v); sum += v; sumSq += v * v;
      if (win.length > zWindow) { const old = win.shift(); sum -= old; sumSq -= old * old; }
    }
    if (v != null && win.length >= warmup) {
      const n = win.length;
      const mean = sum / n;
      const variance = Math.max(0, sumSq / n - mean * mean);
      const std = Math.sqrt(variance);
      if (std > 1e-9) zByDate.set(days[i], { z: (v - mean) / std, spread: v });
    }
  }
  return zByDate;
}

// ── M1 day grouping & session analysis ──────────────────────────────────────────

function buildDayIndex(times) {
  const dayIndex = new Map();
  let dayStart = 0, curDate = null;
  for (let i = 0; i < times.length; i++) {
    const dateStr = new Date(times[i] * 1000).toISOString().substring(0, 10);
    if (dateStr !== curDate) {
      if (curDate !== null) dayIndex.set(curDate, { start: dayStart, end: i });
      curDate = dateStr;
      dayStart = i;
    }
  }
  if (curDate !== null) dayIndex.set(curDate, { start: dayStart, end: times.length });
  return dayIndex;
}

// One pass over a day's bars: Asia body range, entry-window bounds, and the
// hour>=22 time-exit cutoff index.
function analyzeDay(times, opens, highs, lows, closes, start, end, entryWindow) {
  let aHi = -Infinity, aLo = Infinity, aCount = 0, aMaxHour = -1;
  let winStart = -1, winEnd = end, exitIdx = end;
  for (let i = start; i < end; i++) {
    const hour = new Date(times[i] * 1000).getUTCHours();
    if (hour <= 5) {
      const bodyHi = Math.max(opens[i], closes[i]);
      const bodyLo = Math.min(opens[i], closes[i]);
      if (bodyHi > aHi) aHi = bodyHi;
      if (bodyLo < aLo) aLo = bodyLo;
      aCount++; aMaxHour = hour;
    }
    if (winStart === -1 && hour >= 6) winStart = i;
    if (winStart !== -1 && winEnd === end && hour >= 6 + entryWindow) winEnd = i;
    if (exitIdx === end && hour >= 22) exitIdx = i;
  }
  const complete = aCount >= ASIA_MIN_BARS && aMaxHour >= ASIA_MAX_HOUR_REQUIRED;
  return { asia: { hi: aHi, lo: aLo, range: aHi - aLo, count: aCount, complete }, winStart, winEnd, exitIdx };
}

function buildFibLevels(asia, dir, fibLevelMode) {
  const mults = fibLevelMode === 'first' ? FIB_MULTS_FIRST : FIB_MULTS_ALL;
  return mults.map(mult => ({
    mult,
    price: dir === 'LONG' ? asia.lo - mult * asia.range : asia.hi + mult * asia.range,
  }));
}

function walkTrade(times, highs, lows, opens, closes, entryIdx, exitDeadlineIdx, dir, entry, sl, tp) {
  for (let i = entryIdx; i < exitDeadlineIdx; i++) {
    if (dir === 'LONG') {
      if (lows[i] <= sl) return { result: 'SL', exitPrice: sl, exitIdx: i };
      if (highs[i] >= tp) return { result: 'TP', exitPrice: tp, exitIdx: i };
    } else {
      if (highs[i] >= sl) return { result: 'SL', exitPrice: sl, exitIdx: i };
      if (lows[i] <= tp) return { result: 'TP', exitPrice: tp, exitIdx: i };
    }
  }
  if (exitDeadlineIdx < times.length && opens[exitDeadlineIdx] != null) {
    return { result: 'EXPIRED', exitPrice: opens[exitDeadlineIdx], exitIdx: exitDeadlineIdx };
  }
  const lastIdx = Math.max(entryIdx, exitDeadlineIdx - 1);
  return { result: 'EXPIRED', exitPrice: closes[lastIdx] ?? entry, exitIdx: lastIdx };
}

function findDayTrades(times, opens, highs, lows, closes, asia, dir, winStart, winEnd, exitIdx, dayEnd,
                        fibLevels, fibProx, pip, pairKey, pairDisplay, z, zTier, dateStr) {
  const trades = [];
  const traded = new Set();
  const prox = fibProx * pip;
  for (let i = winStart; i < winEnd; i++) {
    for (const lvl of fibLevels) {
      if (traded.has(lvl.mult)) continue;
      const touched = lows[i] <= lvl.price + prox && highs[i] >= lvl.price - prox;
      if (!touched) continue;
      traded.add(lvl.mult);

      const entry = lvl.price;
      const tp = dir === 'LONG' ? asia.lo : asia.hi;
      const sl = dir === 'LONG' ? lvl.price - 0.25 * asia.range : lvl.price + 0.25 * asia.range;
      const rewardPips = Math.abs(tp - entry) / pip;
      const riskPips   = Math.abs(sl - entry) / pip;
      if (rewardPips < riskPips * 0.8) continue;

      const walk = walkTrade(times, highs, lows, opens, closes, i, exitIdx === dayEnd ? dayEnd : exitIdx, dir, entry, sl, tp);
      const pips = dir === 'LONG' ? (walk.exitPrice - entry) / pip : (entry - walk.exitPrice) / pip;

      trades.push({
        date: dateStr, pair: pairKey.toUpperCase(), pairDisplay, dir,
        z: +z.toFixed(2), zTier, fibLevel: lvl.mult,
        entry: +entry.toFixed(6), sl: +sl.toFixed(6), tp: +tp.toFixed(6),
        rr: +(rewardPips / riskPips).toFixed(2),
        asia_low: +asia.lo.toFixed(6), asia_high: +asia.hi.toFixed(6),
        result: walk.result, pips: +pips.toFixed(1),
        won: walk.result === 'TP', expired: walk.result === 'EXPIRED',
        fill_time: new Date(times[i] * 1000).toISOString(),
        exit_time: new Date(times[walk.exitIdx] * 1000).toISOString(),
      });
    }
  }
  return trades;
}

function zTierOf(absZ) {
  if (absZ >= 3.0) return '3.0+';
  if (absZ >= 2.5) return '2.5-3.0';
  return '2.0-2.5';
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export function computeZScoreStats(trades) {
  const total = trades.length;
  if (total === 0) {
    return {
      total: 0, wins: 0, losses: 0, exps: 0, winRate: 0, totalPips: 0, profitFactor: 0,
      sharpe: 0, maxDrawdown: 0, tradesPerYear: 0, avgRR: 0, expectancy: 0,
      zTiers: {}, monthly: {}, equityCurve: [],
    };
  }

  const wins   = trades.filter(t => t.result === 'TP');
  const losses = trades.filter(t => t.result === 'SL');
  const exps   = trades.filter(t => t.result === 'EXPIRED');

  const totalPips = trades.reduce((s, t) => s + t.pips, 0);
  const grossW    = wins.reduce((s, t) => s + t.pips, 0);
  const grossL    = Math.abs(losses.reduce((s, t) => s + t.pips, 0));
  const profitFactor = grossL > 0 ? grossW / grossL : (grossW > 0 ? 999 : 0);
  const avgRR = trades.reduce((s, t) => s + t.rr, 0) / total;

  const dailyMap = new Map();
  for (const t of trades) dailyMap.set(t.date, (dailyMap.get(t.date) ?? 0) + t.pips);
  const dailyPips = [...dailyMap.values()];
  const nDaily = dailyPips.length;
  const dailyMean = dailyPips.reduce((s, p) => s + p, 0) / nDaily;
  const dailyStd  = Math.sqrt(dailyPips.reduce((s, p) => s + (p - dailyMean) ** 2, 0) / Math.max(1, nDaily - 1));
  const sharpe = dailyStd > 0 ? dailyMean / dailyStd * Math.sqrt(252) : 0;

  const sortedDates = [...dailyMap.keys()].sort();
  let cum = 0, peak = 0, maxDd = 0;
  const equityCurve = [];
  for (const d of sortedDates) {
    cum += dailyMap.get(d);
    if (cum > peak) peak = cum;
    const dd = cum - peak;
    if (dd < maxDd) maxDd = dd;
    equityCurve.push({ date: d, cum: +cum.toFixed(1) });
  }

  const dates = trades.map(t => new Date(t.date)).filter(d => !isNaN(d)).sort((a, b) => a - b);
  const years = dates.length > 1 ? Math.max((dates[dates.length - 1] - dates[0]) / (365.25 * 86_400_000), 1 / 365.25) : 1;
  const tradesPerYear = total / years;

  const zTiers = {};
  for (const tier of ['2.0-2.5', '2.5-3.0', '3.0+']) {
    const tt = trades.filter(t => t.zTier === tier);
    const tWins = tt.filter(t => t.result === 'TP').length;
    const tLosses = tt.filter(t => t.result === 'SL').length;
    const tPips = tt.reduce((s, t) => s + t.pips, 0);
    const tGrossW = tt.filter(t => t.pips > 0).reduce((s, t) => s + t.pips, 0);
    const tGrossL = Math.abs(tt.filter(t => t.pips < 0).reduce((s, t) => s + t.pips, 0));
    zTiers[tier] = {
      count: tt.length, wins: tWins, losses: tLosses,
      winRate: tt.length ? +(tWins / tt.length * 100).toFixed(1) : 0,
      totalPips: +tPips.toFixed(1),
      profitFactor: tGrossL > 0 ? +(tGrossW / tGrossL).toFixed(2) : (tGrossW > 0 ? 999 : 0),
    };
  }

  const monthly = {};
  for (const t of trades) {
    const ym = t.date.substring(0, 7);
    if (!monthly[ym]) monthly[ym] = { pips: 0, trades: 0 };
    monthly[ym].pips += t.pips;
    monthly[ym].trades++;
  }
  for (const k in monthly) monthly[k].pips = +monthly[k].pips.toFixed(1);

  return {
    total, wins: wins.length, losses: losses.length, exps: exps.length,
    winRate: +(wins.length / total * 100).toFixed(1),
    totalPips: +totalPips.toFixed(1),
    profitFactor: +profitFactor.toFixed(2),
    sharpe: +sharpe.toFixed(2),
    maxDrawdown: +maxDd.toFixed(1),
    tradesPerYear: +tradesPerYear.toFixed(1),
    avgRR: +avgRR.toFixed(2),
    expectancy: +(totalPips / total).toFixed(2),
    zTiers, monthly, equityCurve,
  };
}

// ── Per-pair / full runner ───────────────────────────────────────────────────

export async function runZScoreBacktest(pairKey, opts = {}) {
  const cfg = ZSCORE_PAIRS[pairKey];
  if (!cfg) throw new Error(`Unknown pair: ${pairKey}`);

  const {
    dateFrom = '2018-01-01',
    dateTo = new Date().toISOString().substring(0, 10),
    zWindow = 90, fibLevelMode = 'all', fibProx = 5, entryWindow = 6,
    thresholds = {}, invert = {},
    fredKey = process.env.FRED_KEY,
  } = opts;

  if (!fredKey) throw new Error('FRED_KEY not set — cannot fetch yield data');
  const threshold = thresholds[pairKey] ?? cfg.defaultThreshold;

  const packed = await loadM1ForPair(pairKey);
  if (!packed) throw new Error(`No M1 data available for ${pairKey} — check R2 credentials or local parquet cache`);

  const fredFrom = _shiftDate(dateFrom, -(zWindow + 14));
  const [usObs, otherObs] = await Promise.all([
    fetchFredObservations(cfg.baseSeries, fredFrom, fredKey),
    fetchFredObservations(cfg.quoteSeries, fredFrom, fredKey),
  ]);
  const zByDate = buildRollingZSeries(usObs, otherObs, zWindow, dateFrom, dateTo);

  const dayIndex = buildDayIndex(packed.times);
  const trades = [];
  let daysConsidered = 0, daysSkippedIncomplete = 0, daysNoSignal = 0;

  for (const [dateStr, { start, end }] of dayIndex) {
    if (dateStr < dateFrom || dateStr > dateTo) continue;
    const zInfo = zByDate.get(dateStr);
    if (zInfo == null) continue;
    daysConsidered++;
    if (Math.abs(zInfo.z) < threshold) { daysNoSignal++; continue; }

    let dir = zInfo.z > 0 ? 'LONG' : 'SHORT';
    if (invert[pairKey]) dir = dir === 'LONG' ? 'SHORT' : 'LONG';

    const { asia, winStart, winEnd, exitIdx } = analyzeDay(
      packed.times, packed.opens, packed.highs, packed.lows, packed.closes, start, end, entryWindow,
    );
    if (!asia.complete || winStart === -1) { daysSkippedIncomplete++; continue; }

    const fibLevels = buildFibLevels(asia, dir, fibLevelMode);
    const zTier = zTierOf(Math.abs(zInfo.z));
    const dayTrades = findDayTrades(
      packed.times, packed.opens, packed.highs, packed.lows, packed.closes,
      asia, dir, winStart, winEnd, exitIdx, end,
      fibLevels, fibProx, cfg.pip, pairKey, cfg.pairDisplay, zInfo.z, zTier, dateStr,
    );
    trades.push(...dayTrades);
  }

  const stats = computeZScoreStats(trades);
  return {
    trades, stats,
    log: { pair: cfg.label, threshold, daysConsidered, daysSkippedIncomplete, daysNoSignal, totalTrades: trades.length },
  };
}

export async function runFullZScoreBacktest(opts = {}, pairKeys = Object.keys(ZSCORE_PAIRS)) {
  const allTrades = [];
  const perPair = {};
  const log = [];
  for (const pairKey of pairKeys) {
    try {
      const { trades, stats, log: pairLog } = await runZScoreBacktest(pairKey, opts);
      perPair[pairKey] = stats;
      allTrades.push(...trades);
      log.push(pairLog);
    } catch (e) {
      log.push({ pair: pairKey, error: e?.message || String(e) });
    }
  }
  const combined = computeZScoreStats(allTrades);
  return { trades: allTrades, perPair, combined, log };
}
