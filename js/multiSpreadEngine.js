// multi-spread sleeve — I/O engine. ISOLATED: not imported by server.js, no API
// route, no dashboard link — same safety posture as js/mve/ (MD files/MVE_RUN_GUIDE.md
// §"Safety"). Stays isolated until MD files/MULTI_SPREAD_SLEEVE.md's Bar A and Bar B
// both clear on real data; going live is a deliberate, separate step.
//
// Reuses the validated sleeve's exact mechanism (entry |z| ≥ threshold → z-direction,
// USD-role orientation, z-exit or max-hold, daily mark-to-market, publication-lag
// shift) from js/yieldSpreadEngine.js's own logic — NOT reimplemented independently,
// NOT modified. The only new code is looping it over MULTIPLE spread tenors
// (SPREAD_DEFS, from js/multiSpreadCore.js) and computing the diversification
// diagnostics against the validated y2 baseline.
//
//   node analysis/multi_spread_sleeve.mjs     (needs FRED_KEY + OANDA/R2 — Railway)

import { loadM1ForPair } from './volBacktestM1Engine.js';
import { ZSCORE_PAIRS, fetchFredObservations, _shiftDate, buildRollingZSeries, buildDayIndex } from './zscoreSpreadEngine.js';
import { usdRole } from './macroDirectionCore.js';
import {
  buildSpreadDefs, directionFromZ, resolveInverted, zTierSize, zTierLabel, shouldExit,
  summarizeYieldSpread, sharpeFromDaily, perYearBreakdown, splitByDate,
  tradeOverlap, correlation, combinedPortfolioStats, YIELD_SPREAD_DEFAULTS,
} from './multiSpreadCore.js';

export { ZSCORE_PAIRS, YIELD_SPREAD_DEFAULTS };
export const SPREAD_DEFS = buildSpreadDefs(ZSCORE_PAIRS);
export const SPREAD_TYPES = Object.keys(SPREAD_DEFS);

// Shift a FRED observation Map's dates FORWARD by `days` to model publication lag —
// a value nominally dated D is not KNOWN until D+lag. (Identical logic to
// js/yieldSpreadEngine.js's own private helper — kept local rather than exported
// from there, since that file is validated/frozen and this isn't a public API of it.)
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

function cfFromOpts(opts) {
  return {
    zWindow: opts.zWindow ?? 252,
    entryThreshold: opts.entryThreshold ?? YIELD_SPREAD_DEFAULTS.entryThreshold,
    zExit: opts.zExit ?? YIELD_SPREAD_DEFAULTS.zExit,
    maxHoldDays: opts.maxHoldDays ?? YIELD_SPREAD_DEFAULTS.maxHoldDays,
    costPct: opts.costPct ?? YIELD_SPREAD_DEFAULTS.costPct,
    splitFrac: opts.splitFrac ?? YIELD_SPREAD_DEFAULTS.splitFrac,
    tiers: opts.tiers ?? YIELD_SPREAD_DEFAULTS.tiers,
    autoOrient: opts.autoOrient !== false,
    invert: opts.invert || {},
  };
}

// Load ONE (pair, spreadType)'s data once — M1 daily closes + pub-lag-shifted FRED —
// independent of the sweep parameters, so a grid sweep reuses it across cells.
async function loadSpreadPairData(pairKey, spreadType, opts) {
  const def = SPREAD_DEFS[spreadType]?.[pairKey];
  if (!def) throw new Error(`No spread def for ${spreadType}/${pairKey}`);
  const fredKey = opts.fredKey ?? process.env.FRED_KEY;
  if (!fredKey) throw new Error('FRED_KEY not set — cannot fetch multi-spread data');
  const dateFrom = opts.dateFrom || '2015-01-01';
  const dateTo   = opts.dateTo   || new Date().toISOString().substring(0, 10);

  const packed = await loadM1ForPair(pairKey);
  if (!packed) throw new Error(`No M1 data available for ${pairKey} — check R2 credentials or local parquet cache`);
  const daily = dailyClosesFrom(packed).filter(d => d.date >= dateFrom && d.date <= dateTo);
  if (daily.length < 60) throw new Error(`Too few daily closes for ${pairKey}`);

  const fredFrom = _shiftDate(daily[0].date, -300);
  const pubLagUsDays = opts.pubLagUsDays ?? 2;
  const pubLagForeignDays = opts.pubLagForeignDays ?? 45;
  const [usRaw, forRaw] = await Promise.all([
    fetchFredObservations(def.baseSeries, fredFrom, fredKey),
    fetchFredObservations(def.quoteSeries, fredFrom, fredKey),
  ]);
  return {
    pairKey, spreadType, def, dateFrom, dateTo, daily,
    usObs: shiftObsForward(usRaw, pubLagUsDays),
    forObs: shiftObsForward(forRaw, pubLagForeignDays),
  };
}

// Simulate one (pair, spreadType) — mechanism identical to js/yieldSpreadEngine.js's
// simulatePair, generalized to read def.baseSeries/quoteSeries instead of assuming
// the validated 2Y table.
function simulateSpreadPair(pd, cf) {
  const { pairKey, spreadType, def, dateFrom, dateTo, daily, usObs, forObs } = pd;
  const inverted = resolveInverted(usdRole(pairKey), { autoOrient: cf.autoOrient, manualInvert: !!cf.invert[pairKey] });
  const zByDate = buildRollingZSeries(usObs, forObs, cf.zWindow, dateFrom, dateTo);

  const trades = [];
  const dailyRet = {};
  const flatRet = {};
  const costFrac = cf.costPct / 100;
  let pos = null;
  for (let i = 0; i < daily.length; i++) {
    const { date, close } = daily[i];
    if (pos && i > 0) {
      const prev = daily[i - 1].close;
      if (prev > 0) {
        const base = pos.dir === 'LONG' ? (close - prev) / prev : (prev - close) / prev;
        dailyRet[date] = (dailyRet[date] || 0) + base * pos.size;
        flatRet[date]  = (flatRet[date]  || 0) + base;
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
        flatRet[date]  = (flatRet[date]  || 0) - costFrac;
        trades.push({
          pair: def.label, spreadType, date: pos.entryDate, exitDate: date, dir: pos.dir,
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
    flatRet[last.date]  = (flatRet[last.date]  || 0) - costFrac;
    trades.push({
      pair: def.label, spreadType, date: pos.entryDate, exitDate: last.date, dir: pos.dir,
      size: pos.size, tierLabel: pos.tierLabel, entryClose: pos.entryClose, exitClose: last.close,
      entryZ: +pos.entryZ.toFixed(2), exitZ: null, holdDays: daily.length - 1 - pos.entryIdx, exitReason: 'mark-out',
    });
  }

  const yrs = Math.max(0.25, (new Date(dateTo) - new Date(dateFrom)) / (365.25 * 86_400_000));
  const ppy = Math.max(1, trades.length / yrs);
  const { splitDate, is, oos } = splitByDate(trades, cf.splitFrac);
  const summ = recs => summarizeYieldSpread(recs, { costPct: cf.costPct, periodsPerYear: ppy });
  const dates = daily.map(d => d.date);
  const retAll = dates.map(d => dailyRet[d] || 0);
  const retOos = dates.filter(d => splitDate && d >= splitDate).map(d => dailyRet[d] || 0);
  return {
    pair: def.label, pairDisplay: def.pairDisplay, spreadType,
    all: summ(trades), is: summ(is), oos: summ(oos),
    splitDate, trades, dates, dailyByDate: dailyRet, flatDailyByDate: flatRet, zByDate,
    portfolioSharpe: { all: sharpeFromDaily(retAll), oos: sharpeFromDaily(retOos) },
  };
}

// Run ONE spread type's book across all its pairs (mirrors js/yieldSpreadEngine.js's
// runFullYieldSpread, generalized to spreadType).
export async function runSpreadBook(spreadType, opts = {}, pairKeys = Object.keys(SPREAD_DEFS[spreadType] || {})) {
  const cf = cfFromOpts(opts);
  const perPair = {};
  const allTrades = [];
  const combinedDaily = {};
  const combinedFlat = {};
  const dateSet = new Set();
  const log = [];
  for (const pairKey of pairKeys) {
    try {
      const pd = await loadSpreadPairData(pairKey, spreadType, opts);
      const r = simulateSpreadPair(pd, cf);
      perPair[pairKey] = {
        pair: r.pair, pairDisplay: r.pairDisplay, all: r.all, is: r.is, oos: r.oos,
        splitDate: r.splitDate, portfolioSharpe: r.portfolioSharpe, zByDate: r.zByDate,
      };
      allTrades.push(...r.trades);
      for (const d of r.dates) dateSet.add(d);
      for (const dt in r.dailyByDate) combinedDaily[dt] = (combinedDaily[dt] || 0) + r.dailyByDate[dt];
      for (const dt in r.flatDailyByDate) combinedFlat[dt] = (combinedFlat[dt] || 0) + r.flatDailyByDate[dt];
      log.push({ pair: pairKey, spreadType, ok: true, trades: r.trades.length });
    } catch (e) {
      log.push({ pair: pairKey, spreadType, error: e?.message || String(e) });
    }
  }
  const { splitDate, is, oos } = splitByDate(allTrades, cf.splitFrac);
  const sortedDates = [...dateSet].sort();
  const yrs = sortedDates.length
    ? Math.max(0.25, (new Date(sortedDates[sortedDates.length - 1]) - new Date(sortedDates[0])) / (365.25 * 86_400_000))
    : 8;
  const ppy = Math.max(1, allTrades.length / yrs);
  const summ = recs => summarizeYieldSpread(recs, { costPct: cf.costPct, periodsPerYear: ppy });
  const cRetAll = sortedDates.map(d => combinedDaily[d] || 0);
  const cRetOos = sortedDates.filter(d => splitDate && d >= splitDate).map(d => combinedDaily[d] || 0);
  return {
    spreadType, perPair, trades: allTrades, log,
    combined: {
      all: summ(allTrades), is: summ(is), oos: summ(oos), splitDate, nTrades: allTrades.length,
      portfolioSharpe: { all: sharpeFromDaily(cRetAll), oos: sharpeFromDaily(cRetOos) },
      perYear: perYearBreakdown(allTrades, { costPct: cf.costPct }),
      perYearOos: perYearBreakdown(oos, { costPct: cf.costPct }),
      daily: { dates: sortedDates, dailyReturns: sortedDates.map(d => combinedFlat[d] || 0) },
    },
  };
}

// Robustness sweep for ONE spread type — mirrors js/yieldSpreadEngine.js's
// runYieldSpreadSweep. Not p-hacking for a best cell; checking for a plateau
// (MD files/MULTI_SPREAD_SLEEVE.md §2 Bar A).
export async function runSpreadSweep(spreadType, opts = {}, grid = {}) {
  const thresholds = grid.thresholds ?? [2.0, 2.25, 2.5, 2.75];
  const windows = grid.windows ?? [90, 126, 252];
  const pairKeys = Object.keys(SPREAD_DEFS[spreadType] || {});
  const pairDataList = [];
  for (const pairKey of pairKeys) {
    try { pairDataList.push(await loadSpreadPairData(pairKey, spreadType, opts)); } catch { /* skip unavailable pair */ }
  }
  const base = cfFromOpts(opts);
  const dateFrom = opts.dateFrom || '2015-01-01';
  const dateTo   = opts.dateTo   || new Date().toISOString().substring(0, 10);
  const yrs = Math.max(0.25, (new Date(dateTo) - new Date(dateFrom)) / (365.25 * 86_400_000));
  const cells = [];
  for (const zWindow of windows) {
    for (const entryThreshold of thresholds) {
      const cf = { ...base, zWindow, entryThreshold };
      const allTrades = [];
      for (const pd of pairDataList) allTrades.push(...simulateSpreadPair(pd, cf).trades);
      const { oos } = splitByDate(allTrades, cf.splitFrac);
      const ppy = Math.max(1, allTrades.length / yrs);
      const o = summarizeYieldSpread(oos, { costPct: cf.costPct, periodsPerYear: ppy });
      const years = Object.values(perYearBreakdown(oos, { costPct: cf.costPct }));
      cells.push({
        zWindow, entryThreshold,
        n: o.n, winRate: o.winRate, profitFactor: o.profitFactor, totalRetPct: o.totalRetPct,
        yearsPositive: years.filter(y => y.totalRetPct > 0).length, yearsTotal: years.length,
      });
    }
  }
  return { spreadType, cells, thresholds, windows };
}

// Run the FULL multi-spread sleeve: every spread type's book, plus the
// diversification diagnostics (per-pair z-correlation, trade overlap, honest
// equal-risk combined-portfolio Sharpe) comparing each new tenor against the
// validated `y2` baseline. This is what MD files/MULTI_SPREAD_SLEEVE.md's Bar A/B
// are graded against.
export async function runMultiSpreadSleeve(opts = {}) {
  const books = {};
  for (const spreadType of SPREAD_TYPES) books[spreadType] = await runSpreadBook(spreadType, opts);

  const dailyStreamsByType = {};
  for (const t of SPREAD_TYPES) dailyStreamsByType[t] = books[t].combined.daily;
  const portfolio = combinedPortfolioStats(dailyStreamsByType, { periodsPerYear: opts.periodsPerYear ?? 26 });

  // Trade-overlap of every non-baseline tenor against the validated y2 sleeve.
  const overlapVsBaseline = {};
  const baselineTrades = books.y2?.trades ?? [];
  for (const t of SPREAD_TYPES) {
    if (t === 'y2') continue;
    overlapVsBaseline[t] = tradeOverlap(books[t].trades, baselineTrades, { windowDays: opts.overlapWindowDays ?? 2 });
  }

  // Per-pair z-series correlation between y2 and each other tenor — a cheap
  // intuition check alongside the trade-level overlap (are the SIGNALS related,
  // independent of exact entry timing).
  const zCorrelationByPair = {};
  for (const pairKey of Object.keys(SPREAD_DEFS.y2 || {})) {
    const z2 = books.y2?.perPair?.[pairKey]?.zByDate;
    if (!z2) continue;
    for (const t of SPREAD_TYPES) {
      if (t === 'y2') continue;
      const zt = books[t]?.perPair?.[pairKey]?.zByDate;
      if (!zt) continue;
      const dates = [...new Set([...z2.keys(), ...zt.keys()])].sort();
      const a = dates.map(d => z2.get(d)?.z ?? null);
      const b = dates.map(d => zt.get(d)?.z ?? null);
      zCorrelationByPair[`${pairKey}:y2_${t}`] = correlation(a, b);
    }
  }

  return { books, portfolio, overlapVsBaseline, zCorrelationByPair };
}
