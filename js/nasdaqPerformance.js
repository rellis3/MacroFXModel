// js/nasdaqPerformance.js
//
// Performance statistics + robustness checks for the NASDAQ Liquidity
// Continuation Framework. Operates purely on the {dates, equityCurve, trades}
// output of nasdaqBacktest.runFullBacktest — no I/O, no gate logic, no
// re-fitting of any threshold (the framework's thresholds are fixed/
// pre-specified, so "robustness" here means checking whether the SAME fixed
// rules hold up across time and across resampled trade order, not searching
// for better parameters).
//
// Self-contained: does not import from, or share logic with, any other
// backtest/reporting system already in this repository.

import { PERFORMANCE } from './nasdaqConfig.js';
import { mean, std, mulberry32 } from './nasdaqTransforms.js';

const TRADING_DAYS = PERFORMANCE.tradingDaysPerYear;

// ── Daily return series ─────────────────────────────────────────────────────

export function computeDailyReturns(equityCurve) {
  const out = new Array(equityCurve.length).fill(NaN);
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1];
    out[i] = (Number.isFinite(prev) && prev !== 0 && Number.isFinite(equityCurve[i])) ? (equityCurve[i] - prev) / prev : NaN;
  }
  return out;
}

// Simple (biased) population skewness / excess kurtosis of a return series —
// favors an auditable formula over a small-sample bias correction, per the
// framework's "simple over complex" mandate.
export function skewness(arr) {
  const f = arr.filter(Number.isFinite);
  if (f.length < 3) return NaN;
  const m = mean(f), sd = std(f);
  return sd > 0 ? mean(f.map(x => ((x - m) / sd) ** 3)) : NaN;
}

export function excessKurtosis(arr) {
  const f = arr.filter(Number.isFinite);
  if (f.length < 4) return NaN;
  const m = mean(f), sd = std(f);
  return sd > 0 ? mean(f.map(x => ((x - m) / sd) ** 4)) - 3 : NaN;
}

// ── Drawdown ─────────────────────────────────────────────────────────────────

// Underwater curve: running fractional distance below the running peak,
// re-evaluated at every bar (not just at the single worst drawdown).
export function rollingDrawdown(equityCurve) {
  const out = new Array(equityCurve.length).fill(NaN);
  let peak = -Infinity;
  for (let i = 0; i < equityCurve.length; i++) {
    const v = equityCurve[i];
    if (!Number.isFinite(v)) continue;
    peak = Math.max(peak, v);
    out[i] = peak > 0 ? (v - peak) / peak : 0;
  }
  return out;
}

// The single worst peak-to-trough drawdown, plus how long it took to recover
// (recoveryIndex is null if the curve never closes back above that peak).
export function maxDrawdownDetail(equityCurve) {
  let peak = NaN, peakIndex = -1;
  let maxDD = 0, ddPeakIndex = -1, ddTroughIndex = -1;
  for (let i = 0; i < equityCurve.length; i++) {
    const v = equityCurve[i];
    if (!Number.isFinite(v)) continue;
    if (!Number.isFinite(peak) || v > peak) { peak = v; peakIndex = i; }
    const dd = peak > 0 ? (v - peak) / peak : 0;
    if (dd < maxDD) { maxDD = dd; ddPeakIndex = peakIndex; ddTroughIndex = i; }
  }
  if (ddPeakIndex < 0) return { maxDrawdown: 0, peakIndex: null, troughIndex: null, recoveryIndex: null, durationBars: 0, recoveryBars: null };

  const peakValue = equityCurve[ddPeakIndex];
  let recoveryIndex = null;
  for (let i = ddTroughIndex; i < equityCurve.length; i++) {
    if (Number.isFinite(equityCurve[i]) && equityCurve[i] >= peakValue) { recoveryIndex = i; break; }
  }
  return {
    maxDrawdown: maxDD, // negative fraction, e.g. -0.18 for an 18% drawdown
    peakIndex: ddPeakIndex, troughIndex: ddTroughIndex, recoveryIndex,
    durationBars: ddTroughIndex - ddPeakIndex,
    recoveryBars: recoveryIndex != null ? recoveryIndex - ddTroughIndex : null,
  };
}

// ── Rolling Sharpe ───────────────────────────────────────────────────────────

export function rollingSharpe(dailyReturns, windowDays = PERFORMANCE.rollingSharpeWindowDays) {
  const out = new Array(dailyReturns.length).fill(NaN);
  for (let i = windowDays - 1; i < dailyReturns.length; i++) {
    const win = dailyReturns.slice(i - windowDays + 1, i + 1).filter(Number.isFinite);
    if (win.length < windowDays * 0.8) continue;
    const sd = std(win);
    out[i] = sd > 0 ? (mean(win) / sd) * Math.sqrt(TRADING_DAYS) : NaN;
  }
  return out;
}

// ── Calendar aggregation ─────────────────────────────────────────────────────

// One entry per calendar month touched by `dates`, each month's return
// compounded from where the previous month's equity left off (the very
// first month starts from the backtest's baseline equity of 1).
export function monthlyReturns(dates, equityCurve) {
  const out = [];
  if (!dates.length) return out;
  let monthStartEquity = 1;
  let curMonth = dates[0].slice(0, 7);
  let lastEquity = monthStartEquity;
  for (let i = 0; i < dates.length; i++) {
    const month = dates[i].slice(0, 7);
    if (month !== curMonth) {
      out.push({ month: curMonth, return: monthStartEquity > 0 ? (lastEquity - monthStartEquity) / monthStartEquity : NaN });
      monthStartEquity = lastEquity;
      curMonth = month;
    }
    if (Number.isFinite(equityCurve[i])) lastEquity = equityCurve[i];
  }
  out.push({ month: curMonth, return: monthStartEquity > 0 ? (lastEquity - monthStartEquity) / monthStartEquity : NaN });
  return out;
}

function bestWorstByDate(values, dates) {
  let bestIdx = -1, worstIdx = -1, best = -Infinity, worst = Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    if (v > best) { best = v; bestIdx = i; }
    if (v < worst) { worst = v; worstIdx = i; }
  }
  return {
    best: bestIdx >= 0 ? { date: dates[bestIdx], value: best } : null,
    worst: worstIdx >= 0 ? { date: dates[worstIdx], value: worst } : null,
  };
}

function bestWorstMonth(months) {
  let best = null, worst = null;
  for (const m of months) {
    if (!Number.isFinite(m.return)) continue;
    if (!best || m.return > best.return) best = m;
    if (!worst || m.return < worst.return) worst = m;
  }
  return { bestMonth: best, worstMonth: worst };
}

// ── Trade-level stats ────────────────────────────────────────────────────────

// END_OF_HISTORY_OPEN trades are a reporting convenience (marking a still-open
// position to the last close so the equity curve has a defined endpoint) —
// they were never actually closed by a gate or stop, so they're excluded from
// every trade-level stat below.
function completedOnly(trades) {
  return trades.filter(t => t.reason !== 'END_OF_HISTORY_OPEN');
}

function tradeStats(completedTrades) {
  const n = completedTrades.length;
  if (n === 0) {
    return {
      tradeCount: 0, winCount: 0, lossCount: 0, winRate: NaN, profitFactor: NaN,
      avgWinnerR: NaN, avgLoserR: NaN, expectancyR: NaN, avgHoldingBars: NaN,
    };
  }
  const winners = completedTrades.filter(t => t.pnlR > 0);
  const losers = completedTrades.filter(t => t.pnlR <= 0);
  const grossWin = winners.reduce((a, t) => a + t.pnlR, 0);
  const grossLoss = Math.abs(losers.reduce((a, t) => a + t.pnlR, 0));
  return {
    tradeCount: n,
    winCount: winners.length,
    lossCount: losers.length,
    winRate: winners.length / n,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : NaN),
    avgWinnerR: winners.length ? grossWin / winners.length : NaN,
    avgLoserR: losers.length ? -grossLoss / losers.length : NaN,
    expectancyR: mean(completedTrades.map(t => t.pnlR)),
    avgHoldingBars: mean(completedTrades.map(t => t.barsHeld)),
  };
}

function tradesPerWeek(tradeCount, tradingDayCount) {
  const weeks = tradingDayCount / 5; // this series is weekday-only daily bars
  return weeks > 0 ? tradeCount / weeks : NaN;
}

// Histogram of trade R-multiples, bucketed to `bucketSize` R and clipped to
// +/- maxAbsR so one outlier trade can't blow out the whole chart's scale.
export function pnlDistribution(completedTrades, bucketSize = 0.5, maxAbsR = 5) {
  const buckets = new Map();
  for (const t of completedTrades) {
    if (!Number.isFinite(t.pnlR)) continue;
    const clipped = Math.max(-maxAbsR, Math.min(maxAbsR, t.pnlR));
    const key = Math.round(clipped / bucketSize) * bucketSize;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  return [...buckets.entries()].map(([bucket, count]) => ({ bucket, count })).sort((a, b) => a.bucket - b.bucket);
}

// ── Full report ──────────────────────────────────────────────────────────────

// The single entry point for "give me every number in the spec" for one
// {dates, equityCurve, trades} slice — used for the full-history report, and
// reused unchanged (just fed a sub-slice) by walk-forward and OOS reporting
// below, so every sub-report is computed by the exact same code path.
export function computePerformanceReport({ dates, equityCurve, trades }) {
  const dailyReturns = computeDailyReturns(equityCurve);
  const finiteReturns = dailyReturns.filter(Number.isFinite);
  const startEquity = 1;
  const endEquity = equityCurve.length ? equityCurve[equityCurve.length - 1] : NaN;
  const totalReturn = Number.isFinite(endEquity) ? (endEquity - startEquity) / startEquity : NaN;

  const years = dates.length / TRADING_DAYS;
  const cagr = (years > 0 && Number.isFinite(endEquity) && endEquity > 0) ? Math.pow(endEquity / startEquity, 1 / years) - 1 : NaN;

  const annualVol = finiteReturns.length ? std(finiteReturns) * Math.sqrt(TRADING_DAYS) : NaN;
  const annualizedMeanReturn = finiteReturns.length ? mean(finiteReturns) * TRADING_DAYS : NaN;
  const sharpe = annualVol > 0 ? (annualizedMeanReturn - PERFORMANCE.riskFreeRate) / annualVol : NaN;

  const downside = finiteReturns.filter(r => r < 0);
  const downsideDevAnnualized = downside.length ? std(downside) * Math.sqrt(TRADING_DAYS) : NaN;
  const sortino = downsideDevAnnualized > 0 ? (annualizedMeanReturn - PERFORMANCE.riskFreeRate) / downsideDevAnnualized : NaN;

  const ddDetail = maxDrawdownDetail(equityCurve);
  const calmar = (ddDetail.maxDrawdown < 0 && Number.isFinite(cagr)) ? cagr / Math.abs(ddDetail.maxDrawdown) : NaN;

  const gainSum = finiteReturns.filter(r => r > PERFORMANCE.omegaThreshold).reduce((a, b) => a + (b - PERFORMANCE.omegaThreshold), 0);
  const lossSum = finiteReturns.filter(r => r < PERFORMANCE.omegaThreshold).reduce((a, b) => a + (PERFORMANCE.omegaThreshold - b), 0);
  const omega = lossSum > 0 ? gainSum / lossSum : (gainSum > 0 ? Infinity : NaN);

  const months = monthlyReturns(dates, equityCurve);
  const { bestMonth, worstMonth } = bestWorstMonth(months);
  const positiveMonths = months.filter(m => Number.isFinite(m.return) && m.return > 0).length;
  const negativeMonths = months.filter(m => Number.isFinite(m.return) && m.return < 0).length;

  const dayExtremes = bestWorstByDate(dailyReturns, dates);
  const completedTrades = completedOnly(trades);

  return {
    startDate: dates[0] ?? null, endDate: dates[dates.length - 1] ?? null, tradingDays: dates.length, years,
    totalReturn, cagr, annualVol, sharpe, sortino, calmar, omega,
    maxDrawdown: ddDetail,
    skewness: skewness(finiteReturns), excessKurtosis: excessKurtosis(finiteReturns),
    bestDay: dayExtremes.best, worstDay: dayExtremes.worst,
    bestMonth, worstMonth, positiveMonths, negativeMonths, monthCount: months.length,
    monthlyReturns: months,
    ...tradeStats(completedTrades),
    tradesPerWeek: tradesPerWeek(completedTrades.length, dates.length),
    pnlDistribution: pnlDistribution(completedTrades),
    rollingSharpeSeries: rollingSharpe(dailyReturns),
    rollingDrawdownSeries: rollingDrawdown(equityCurve),
    dailyReturns,
  };
}

// ── Monte Carlo bootstrap ────────────────────────────────────────────────────
//
// Resamples the completed trades' R-multiples (with replacement) to ask "how
// much of the result is one lucky/unlucky trade ORDER, given the same set of
// trade outcomes?" — not a test of the gate thresholds themselves (those are
// fixed), purely a trade-sequencing robustness check. Each resampled trade's
// equity contribution is approximated as riskPct% * pnlR (ignoring the
// secondary effect of mid-trade REDUCE timing, which the full bar-by-bar
// simulation captures but a trade-level resample necessarily cannot) —
// documented here, not hidden, per the framework's disclosure standard.
export function monteCarloBootstrap(trades, opts = {}) {
  const { resamples = PERFORMANCE.monteCarlo.resamples, seed = PERFORMANCE.monteCarlo.seed, percentiles = PERFORMANCE.monteCarlo.percentiles } = opts;
  const completedTrades = completedOnly(trades);
  const tradeReturns = completedTrades
    .map(t => (t.riskPct / 100) * t.pnlR)
    .filter(Number.isFinite);
  const n = tradeReturns.length;
  if (n === 0) return { resamples: 0, terminalEquity: {}, maxDrawdown: {}, sharpeLike: {} };

  const rng = mulberry32(seed);
  const terminalEquities = new Array(resamples);
  const maxDrawdowns = new Array(resamples);
  const sharpeLikes = new Array(resamples);

  for (let s = 0; s < resamples; s++) {
    let equity = 1, peak = 1, maxDD = 0;
    const path = new Array(n);
    for (let i = 0; i < n; i++) {
      const r = tradeReturns[Math.floor(rng() * n)];
      equity *= (1 + r);
      path[i] = r;
      peak = Math.max(peak, equity);
      maxDD = Math.min(maxDD, peak > 0 ? (equity - peak) / peak : 0);
    }
    terminalEquities[s] = equity;
    maxDrawdowns[s] = maxDD;
    const sd = std(path);
    sharpeLikes[s] = sd > 0 ? mean(path) / sd : NaN;
  }

  return {
    resamples, tradesPerPath: n,
    terminalEquity: percentileBands(terminalEquities, percentiles),
    maxDrawdown: percentileBands(maxDrawdowns, percentiles),
    sharpeLike: percentileBands(sharpeLikes.filter(Number.isFinite), percentiles),
  };
}

function percentileBands(values, percentiles) {
  const sorted = values.slice().sort((a, b) => a - b);
  const out = {};
  for (const p of percentiles) {
    if (!sorted.length) { out[`p${p}`] = NaN; continue; }
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
    out[`p${p}`] = sorted[idx];
  }
  return out;
}

// ── Walk-forward temporal stability ─────────────────────────────────────────
//
// Not a re-fit: the gates' thresholds never change. This splits the full
// backtest into `windowCount` equal-length, non-overlapping calendar windows
// and runs the SAME computePerformanceReport on each slice, so you can see
// whether the edge (if any) is concentrated in one era or holds up across
// sub-periods — a stability check, not a parameter search.
export function walkForwardStability({ dates, equityCurve, trades }, opts = {}) {
  const { windowCount = PERFORMANCE.walkForward.windowCount } = opts;
  const n = dates.length;
  if (n === 0 || windowCount < 1) return { windows: [] };

  const windows = [];
  const sizePerWindow = Math.floor(n / windowCount);
  for (let w = 0; w < windowCount; w++) {
    const startIdx = w * sizePerWindow;
    const endIdx = (w === windowCount - 1) ? n : startIdx + sizePerWindow;
    if (endIdx - startIdx < 2) continue;

    const windowDates = dates.slice(startIdx, endIdx);
    // Rebase the equity sub-curve to start at 1 so each window's CAGR/Sharpe/
    // drawdown describe that window in isolation, not the compounding effect
    // of whatever happened in earlier windows.
    const baseEquity = equityCurve[startIdx] || 1;
    const windowEquity = equityCurve.slice(startIdx, endIdx).map(e => Number.isFinite(e) ? e / baseEquity : NaN);
    const windowTrades = trades.filter(t => t.entryIndex >= startIdx && t.entryIndex < endIdx);

    const report = computePerformanceReport({ dates: windowDates, equityCurve: windowEquity, trades: windowTrades });
    windows.push({
      windowIndex: w, startDate: windowDates[0], endDate: windowDates[windowDates.length - 1],
      cagr: report.cagr, sharpe: report.sharpe, maxDrawdown: report.maxDrawdown.maxDrawdown,
      winRate: report.winRate, profitFactor: report.profitFactor, tradeCount: report.tradeCount,
      expectancyR: report.expectancyR,
    });
  }

  const cagrs = windows.map(w => w.cagr).filter(Number.isFinite);
  const sharpes = windows.map(w => w.sharpe).filter(Number.isFinite);
  return {
    windows,
    cagrStdDev: cagrs.length ? std(cagrs) : NaN,
    sharpeStdDev: sharpes.length ? std(sharpes) : NaN,
    positiveWindowCount: windows.filter(w => Number.isFinite(w.cagr) && w.cagr > 0).length,
    windowCount: windows.length,
  };
}

// ── Out-of-sample split ──────────────────────────────────────────────────────
//
// Holds out the final `oosFraction` of the backtest and reports it
// separately from the rest — the in-sample report covers everything before
// the split, the OOS report covers everything from the split forward. Same
// rebasing-to-1 logic as walk-forward, for the same reason.
export function outOfSampleSplit({ dates, equityCurve, trades }, opts = {}) {
  const { oosFraction = PERFORMANCE.outOfSample.oosFraction } = opts;
  const n = dates.length;
  const splitIdx = Math.floor(n * (1 - oosFraction));
  if (splitIdx <= 0 || splitIdx >= n) return { inSample: null, outOfSample: null, splitDate: null };

  const slice = (startIdx, endIdx) => {
    const baseEquity = equityCurve[startIdx] || 1;
    return {
      dates: dates.slice(startIdx, endIdx),
      equityCurve: equityCurve.slice(startIdx, endIdx).map(e => Number.isFinite(e) ? e / baseEquity : NaN),
      trades: trades.filter(t => t.entryIndex >= startIdx && t.entryIndex < endIdx),
    };
  };

  return {
    splitDate: dates[splitIdx],
    inSample: computePerformanceReport(slice(0, splitIdx)),
    outOfSample: computePerformanceReport(slice(splitIdx, n)),
  };
}
