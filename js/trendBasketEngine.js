/**
 * Trend Basket Engine — a diversified cross-sectional / time-series momentum
 * basket across G10 currencies vs USD. The HONEST version of a factor strategy:
 * many small, vol-scaled, diversified bets — not a single-pair timing signal.
 *
 * This is the "managed futures" / trend-following premium: for each currency,
 * go long if its 12-month trend is up, short if down; size each position by
 * inverse volatility (equal risk budget); rebalance weekly; net of costs. It is
 * deliberately boring — small Sharpe, real drawdowns — and it's the first thing
 * in this repo with decades of academic + practitioner evidence BEFORE testing.
 *
 * Pure & offline-testable — the caller fetches prices and passes them in. Reuses
 * `statsCore` (moments) and `metricsCore` (Sharpe, drawdown). No network/DOM.
 *
 * NOTE on honesty: this measures whether a diversified trend premium exists in
 * FX after costs, IS/OOS. It is NOT financial advice; a positive result is a
 * modest, drawdown-heavy diversifier, not a wealth engine (see the daily-brief
 * note and the session working agreement).
 */

import { mean, stdev } from './statsCore.js';
import { sharpeRatio, maxDrawdownFromEquity } from './metricsCore.js';

// Align { ccy: [{t, v}] } daily series onto their common dates (inner join).
export function alignSeries(seriesByCcy) {
  const ccys = Object.keys(seriesByCcy);
  if (!ccys.length) return { dates: [], cols: {}, ccys };
  const maps = ccys.map(c => new Map(seriesByCcy[c].map(p => [p.t, p.v])));
  const dates = [...maps[0].keys()]
    .filter(t => maps.every(m => m.has(t) && Number.isFinite(m.get(t))))
    .sort();
  const cols = {};
  ccys.forEach((c, i) => { cols[c] = dates.map(t => maps[i].get(t)); });
  return { dates, cols, ccys };
}

function sampleEquity(dates, eq, target) {
  const n = eq.length;
  if (n <= target) return dates.map((d, i) => ({ t: d, v: +eq[i].toFixed(4) }));
  const step = (n - 1) / (target - 1), out = [];
  for (let k = 0; k < target; k++) { const i = Math.round(k * step); out.push({ t: dates[i], v: +eq[i].toFixed(4) }); }
  return out;
}

function perYearReturns(dates, portRet) {
  const byYear = {};
  for (let i = 0; i < dates.length; i++) { const y = dates[i].slice(0, 4); byYear[y] = (byYear[y] || 0) + portRet[i]; }
  return Object.entries(byYear).map(([year, r]) => ({ year, ret: +((Math.exp(r) - 1) * 100).toFixed(1) }));
}

// Metrics on a daily log-return series (annualised where relevant).
function stats(r) {
  const rr = r;
  const sh = sharpeRatio(rr, 252);
  const e = []; let c = 0; for (const x of rr) { c += x; e.push(Math.exp(c)); }
  const dd = maxDrawdownFromEquity(e);
  const cagr = rr.length > 1 ? Math.exp(mean(rr) * 252) - 1 : 0;
  const vol = stdev(rr, 0) * Math.sqrt(252);
  const nz = rr.filter(x => x !== 0);
  const win = nz.length ? nz.filter(x => x > 0).length / nz.length : 0;
  return {
    days: rr.length,
    sharpe: +sh.toFixed(2), cagr: +(cagr * 100).toFixed(1), vol: +(vol * 100).toFixed(1),
    maxDD: +(dd * 100).toFixed(1), calmar: dd < 0 ? +(cagr / -dd).toFixed(2) : 0,
    winRate: +(win * 100).toFixed(1),
  };
}

// seriesByCcy: { EUR:[{t,v}], JPY:[{t,v}], … } — daily close of each currency vs USD.
// directionAt (optional): (iDecision, {dates, cols, ccys, rets}) => { ccy: -1|0|+1 } —
// swaps the per-ccy direction source (e.g. a fundamentals score) while keeping the
// sizing/cost/metrics machinery identical. null ⇒ the default 12-mo price trend.
export function runTrendBasket(seriesByCcy, {
  lookback = 252, volWindow = 60, targetVol = 0.10, rebalDays = 5, costBps = 2, isFrac = 0.7,
  directionAt = null,
} = {}) {
  const { dates, cols, ccys } = alignSeries(seriesByCcy);
  const n = dates.length;
  const nC = ccys.length;
  if (n < lookback + 30 || nC < 2) return { error: `insufficient data (${n} days, ${nC} ccys)`, nDays: n, ccys };

  // daily log returns
  const rets = {};
  for (const c of ccys) { const p = cols[c]; const r = new Array(n).fill(0); for (let i = 1; i < n; i++) r[i] = p[i - 1] > 0 && p[i] > 0 ? Math.log(p[i] / p[i - 1]) : 0; rets[c] = r; }

  const perCcyRisk = targetVol / Math.sqrt(nC);         // equal risk budget, ~uncorrelated
  let weights = Object.fromEntries(ccys.map(c => [c, 0]));
  const portRet = new Array(n).fill(0), bmRet = new Array(n).fill(0);

  for (let i = 1; i < n; i++) {
    if ((i - 1) % rebalDays === 0 && i - 1 >= lookback) {     // rebalance using data ≤ i-1 (no lookahead)
      const dirs = directionAt ? (directionAt(i - 1, { dates, cols, ccys, rets }) || {}) : null;
      const newW = {}; let turnover = 0;
      for (const c of ccys) {
        const p = cols[c];
        const trend = dirs ? (dirs[c] || 0) : Math.sign(p[i - 1] / p[i - 1 - lookback] - 1);       // 12-mo trend
        const win = rets[c].slice(i - 1 - volWindow, i - 1).filter(Number.isFinite);
        const vol = stdev(win, 0) * Math.sqrt(252);
        const w = vol > 1e-6 ? trend * perCcyRisk / vol : 0;
        newW[c] = w; turnover += Math.abs(w - (weights[c] || 0));
      }
      portRet[i] -= turnover * (costBps / 10000);            // charge round-trip cost on rebalance
      weights = newW;
    }
    let pr = 0, bm = 0;
    for (const c of ccys) { pr += (weights[c] || 0) * rets[c][i]; bm += (1 / nC) * rets[c][i]; }
    portRet[i] += pr; bmRet[i] = bm;
  }

  const eq = []; { let c = 0; for (let i = 0; i < n; i++) { c += portRet[i]; eq.push(Math.exp(c)); } }
  const split = Math.floor(n * isFrac);
  const curDirs = directionAt ? (directionAt(n - 1, { dates, cols, ccys, rets }) || {}) : null;
  const current = ccys.map(c => {
    const p = cols[c];
    const trend = curDirs ? (curDirs[c] || 0)
      : (p.length > lookback ? Math.sign(p[n - 1] / p[n - 1 - lookback] - 1) : 0);
    return { ccy: c, trend };
  });
  return {
    params: { lookback, volWindow, targetVol, rebalDays, costBps, isFrac },
    ccys, nDays: n, first: dates[0], last: dates[n - 1], splitDate: dates[split] ?? null,
    all: stats(portRet), is: stats(portRet.slice(0, split)), oos: stats(portRet.slice(split)),
    benchmark: stats(bmRet),                               // equal-weight long-currency basket (short USD)
    equity: sampleEquity(dates, eq, 400),
    perYear: perYearReturns(dates, portRet),
    current,
  };
}
