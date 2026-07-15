// Bennett z-mean-reversion — I/O engine.
//
// The clean replication of Bennett's ACTUAL bot: enter on |spread-z| ≥ threshold in the
// z-direction, exit on z-reversion to ±zExit (or a max-hold), NO price levels. Reuses the
// z-engine's FRED fetch + rolling-z + M1→daily-close (no copies) and the pure core.
//
// DATA LOAD is separated from SIMULATION so a parameter sweep loads each pair's M1 + FRED
// ONCE and re-runs the (cheap, in-memory) walk per grid cell — no repeated FRED fetches
// (which rate-limit) and no repeated M1 loads.

import { loadM1ForPair } from './volBacktestM1Engine.js';
import { ZSCORE_PAIRS, fetchFredObservations, _shiftDate, buildRollingZSeries, buildDayIndex } from './zscoreSpreadEngine.js';
import {
  BENNETT_DEFAULTS, directionFromZ, resolveInverted, zTierSize, zTierLabel, shouldExit, summarizeBennett, splitByDate, perYearBreakdown, sharpeFromDaily,
} from './bennettZCore.js';
import { usdRole } from './macroDirectionCore.js';

export { ZSCORE_PAIRS, BENNETT_DEFAULTS };

// Shift a FRED observation Map's dates FORWARD by `days` to model publication lag —
// a value nominally dated D is not KNOWN until D+lag.
function shiftObsForward(obs, days) {
  if (!days) return obs;
  const out = new Map();
  for (const [d, v] of obs) out.set(_shiftDate(d, days), v);
  return out;
}

function dailyClosesFrom(packed) {
  const out = [];
  for (const [date, { end }] of buildDayIndex(packed.times)) {
    const c = packed.closes[end - 1];
    if (Number.isFinite(c)) out.push({ date, close: c });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

// Resolve the per-run config from opts (defaults + orientation).
function cfFromOpts(opts) {
  return {
    zWindow: opts.zWindow ?? 252,
    entryThreshold: opts.entryThreshold ?? BENNETT_DEFAULTS.entryThreshold,
    zExit: opts.zExit ?? BENNETT_DEFAULTS.zExit,
    maxHoldDays: opts.maxHoldDays ?? BENNETT_DEFAULTS.maxHoldDays,
    costPct: opts.costPct ?? BENNETT_DEFAULTS.costPct,
    splitFrac: opts.splitFrac ?? BENNETT_DEFAULTS.splitFrac,
    tiers: opts.tiers ?? BENNETT_DEFAULTS.tiers,
    autoOrient: opts.autoOrient !== false,
    invert: opts.invert || {},
  };
}

// Load a pair's data ONCE (M1 → daily closes + pub-lag-shifted FRED obs). Independent of
// the sweep parameters (window/threshold), so it's reused across grid cells.
async function loadPairData(pairKey, opts) {
  const cfg = ZSCORE_PAIRS[pairKey];
  if (!cfg) throw new Error(`Unknown pair: ${pairKey}`);
  const fredKey = opts.fredKey ?? process.env.FRED_KEY;
  if (!fredKey) throw new Error('FRED_KEY not set — cannot fetch yield-spread data');
  const dateFrom = opts.dateFrom || '2015-01-01';
  const dateTo   = opts.dateTo   || new Date().toISOString().substring(0, 10);

  const packed = await loadM1ForPair(pairKey);
  if (!packed) throw new Error(`No M1 data available for ${pairKey} — check R2 credentials or local parquet cache`);
  const daily = dailyClosesFrom(packed).filter(d => d.date >= dateFrom && d.date <= dateTo);
  if (daily.length < 60) throw new Error(`Too few daily closes for ${pairKey}`);

  // Fetch enough history for the largest z-window we might sweep (~300d back).
  const fredFrom = _shiftDate(daily[0].date, -300);
  const pubLagUsDays = opts.pubLagUsDays ?? 2;
  const pubLagForeignDays = opts.pubLagForeignDays ?? 45;
  const [usRaw, forRaw] = await Promise.all([
    fetchFredObservations(cfg.baseSeries, fredFrom, fredKey),
    fetchFredObservations(cfg.quoteSeries, fredFrom, fredKey),
  ]);
  return {
    pairKey, cfg, dateFrom, dateTo, daily,
    usObs: shiftObsForward(usRaw, pubLagUsDays),
    forObs: shiftObsForward(forRaw, pubLagForeignDays),
  };
}

// Simulate ONE pair given pre-loaded data + a config. Pure of I/O.
function simulatePair(pd, cf) {
  const { pairKey, cfg, dateFrom, dateTo, daily, usObs, forObs } = pd;
  const pip = cfg.pip;
  const inverted = resolveInverted(usdRole(pairKey), { autoOrient: cf.autoOrient, manualInvert: !!cf.invert[pairKey] });
  const zByDate = buildRollingZSeries(usObs, forObs, cf.zWindow, dateFrom, dateTo);

  const trades = [];
  const dailyRet = {};
  const costFrac = cf.costPct / 100;
  let pos = null;
  for (let i = 0; i < daily.length; i++) {
    const { date, close } = daily[i];
    if (pos && i > 0) {
      const prev = daily[i - 1].close;
      if (prev > 0) {
        const r = (pos.dir === 'LONG' ? (close - prev) / prev : (prev - close) / prev) * pos.size;
        dailyRet[date] = (dailyRet[date] || 0) + r;
      }
    }
    const zInfo = zByDate.get(date);
    if (zInfo == null) continue;
    const z = zInfo.z, absZ = Math.abs(z);
    if (pos) {
      const holdDays = i - pos.entryIdx;
      const ex = shouldExit(absZ, holdDays, { zExit: cf.zExit, maxHoldDays: cf.maxHoldDays });
      if (ex.exit) {
        dailyRet[date] = (dailyRet[date] || 0) - costFrac * pos.size;
        trades.push({
          pair: cfg.label, date: pos.entryDate, exitDate: date, dir: pos.dir,
          size: pos.size, tierLabel: pos.tierLabel, entryClose: pos.entryClose, exitClose: close,
          entryZ: +pos.entryZ.toFixed(2), exitZ: +z.toFixed(2), holdDays, exitReason: ex.reason,
        });
        pos = null;
        continue;
      }
    }
    if (!pos && absZ >= cf.entryThreshold) {
      pos = {
        dir: directionFromZ(z, inverted), size: zTierSize(absZ, cf.tiers), tierLabel: zTierLabel(absZ, cf.tiers),
        entryClose: close, entryDate: date, entryIdx: i, entryZ: z,
      };
    }
  }
  if (pos) {
    const last = daily[daily.length - 1];
    dailyRet[last.date] = (dailyRet[last.date] || 0) - costFrac * pos.size;
    trades.push({
      pair: cfg.label, date: pos.entryDate, exitDate: last.date, dir: pos.dir,
      size: pos.size, tierLabel: pos.tierLabel, entryClose: pos.entryClose, exitClose: last.close,
      entryZ: +pos.entryZ.toFixed(2), exitZ: null, holdDays: daily.length - 1 - pos.entryIdx, exitReason: 'mark-out',
    });
  }

  const yrs = Math.max(0.25, (new Date(dateTo) - new Date(dateFrom)) / (365.25 * 86_400_000));
  const ppy = Math.max(1, trades.length / yrs);
  const { splitDate, is, oos } = splitByDate(trades, cf.splitFrac);
  const summ = recs => summarizeBennett(recs, { costPct: cf.costPct, periodsPerYear: ppy });
  const dates = daily.map(d => d.date);
  const retAll = dates.map(d => dailyRet[d] || 0);
  const retOos = dates.filter(d => splitDate && d >= splitDate).map(d => dailyRet[d] || 0);
  return {
    pair: cfg.label, pairDisplay: cfg.pairDisplay,
    all: summ(trades), is: summ(is), oos: summ(oos),
    splitDate, trades, dates, dailyByDate: dailyRet,
    portfolioSharpe: { all: sharpeFromDaily(retAll), oos: sharpeFromDaily(retOos) },
  };
}

// Aggregate a book of pre-loaded pairs at one config → { perPair, combined }.
function simulateBook(pairDataList, cf) {
  const perPair = {};
  const allTrades = [];
  const combinedDaily = {};
  const dateSet = new Set();
  for (const pd of pairDataList) {
    const r = simulatePair(pd, cf);
    perPair[pd.pairKey] = { pair: r.pair, pairDisplay: r.pairDisplay, all: r.all, is: r.is, oos: r.oos, splitDate: r.splitDate, portfolioSharpe: r.portfolioSharpe };
    allTrades.push(...r.trades);
    for (const d of r.dates) dateSet.add(d);
    for (const dt in r.dailyByDate) combinedDaily[dt] = (combinedDaily[dt] || 0) + r.dailyByDate[dt];
  }
  const { splitDate, is, oos } = splitByDate(allTrades, cf.splitFrac);
  const pd0 = pairDataList[0];
  const yrs = pd0 ? Math.max(0.25, (new Date(pd0.dateTo) - new Date(pd0.dateFrom)) / (365.25 * 86_400_000)) : 8;
  const ppy = Math.max(1, allTrades.length / yrs);
  const summ = recs => summarizeBennett(recs, { costPct: cf.costPct, periodsPerYear: ppy });
  const sortedDates = [...dateSet].sort();
  const cRetAll = sortedDates.map(d => combinedDaily[d] || 0);
  const cRetOos = sortedDates.filter(d => splitDate && d >= splitDate).map(d => combinedDaily[d] || 0);
  return {
    perPair,
    combined: {
      all: summ(allTrades), is: summ(is), oos: summ(oos), splitDate, nTrades: allTrades.length,
      portfolioSharpe: { all: sharpeFromDaily(cRetAll), oos: sharpeFromDaily(cRetOos) },
      perYear: perYearBreakdown(allTrades, { costPct: cf.costPct }),
      perYearOos: perYearBreakdown(oos, { costPct: cf.costPct }),
    },
  };
}

export async function runBennettZ(pairKey, opts = {}) {
  const pd = await loadPairData(pairKey, opts);
  return simulatePair(pd, cfFromOpts(opts));
}

export async function runFullBennettZ(opts = {}, pairKeys = Object.keys(ZSCORE_PAIRS)) {
  const pairDataList = [];
  const log = [];
  for (const pairKey of pairKeys) {
    try { pairDataList.push(await loadPairData(pairKey, opts)); log.push({ pair: pairKey, ok: true }); }
    catch (e) { log.push({ pair: pairKey, error: e?.message || String(e) }); }
  }
  const { perPair, combined } = simulateBook(pairDataList, cfFromOpts(opts));
  return { perPair, combined, log };
}

// Robustness sweep: load each pair's data ONCE, then re-simulate the book across a grid
// of (entry threshold × z-window). The point is NOT to pick the best cell (p-hacking) —
// it's to see whether a chosen cell sits on a BROAD profitable plateau vs a lucky spike.
export async function runBennettZSweep(opts = {}, grid = {}) {
  const thresholds = grid.thresholds ?? [2.0, 2.25, 2.5, 2.75];
  const windows = grid.windows ?? [90, 126, 252];
  const pairKeys = Object.keys(ZSCORE_PAIRS);
  const pairDataList = [];
  for (const pairKey of pairKeys) {
    try { pairDataList.push(await loadPairData(pairKey, opts)); } catch { /* skip unavailable pair */ }
  }
  const base = cfFromOpts(opts);
  const cells = [];
  for (const zWindow of windows) {
    for (const entryThreshold of thresholds) {
      try {
        const { combined } = simulateBook(pairDataList, { ...base, zWindow, entryThreshold });
        const o = combined.oos;
        const years = Object.values(combined.perYearOos || {});
        cells.push({
          zWindow, entryThreshold,
          n: o.n, winRate: o.winRate, profitFactor: o.profitFactor, totalRetPct: o.totalRetPct,
          portfolioSharpeOos: combined.portfolioSharpe?.oos ?? 0,
          yearsPositive: years.filter(y => y.totalRetPct > 0).length, yearsTotal: years.length,
        });
      } catch (e) {
        cells.push({ zWindow, entryThreshold, error: e?.message || String(e) });
      }
    }
  }
  return { cells, thresholds, windows };
}
