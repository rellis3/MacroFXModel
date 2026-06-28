/**
 * Backtest statistics brick — the standard battery for a trade-PnL series.
 *
 * Takes per-trade PnL (% of price, e.g. from perLineStrategy) + dates and returns
 * the full suite: headline metrics (Sharpe, Sortino, Calmar, PF, payoff, win rate,
 * expectancy, CAGR, max-DD + duration) plus resampling diagnostics:
 *   • Bootstrap (resample trades WITH replacement) → CI on total return & Sharpe,
 *     and P(profitable) — outcome uncertainty given the sample.
 *   • Monte-Carlo (shuffle trade ORDER) → distribution of max drawdown — the
 *     path-dependent risk you'd have seen had the same trades arrived differently.
 *
 * Deterministic: a seeded PRNG (mulberry32) so the same book reproduces exactly.
 * Reuses metricsCore for the shared metric definitions. Pure, unit-tested.
 */

import { sortinoRatio, profitFactor, maxDrawdownFromPnls } from './metricsCore.js';

const sum  = a => a.reduce((s, x) => s + x, 0);
const mean = a => (a.length ? sum(a) / a.length : 0);
const stdev = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function pctile(arr, ps) {
  const s = [...arr].sort((a, b) => a - b);
  const at = p => s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(p / 100 * s.length)))] : 0;
  return Object.fromEntries(ps.map(p => [`p${p}`, +at(p).toFixed(3)]));
}
function yearsBetween(d0, d1) {
  const a = new Date(d0 + 'T00:00:00Z').getTime(), b = new Date(d1 + 'T00:00:00Z').getTime();
  return (b > a) ? (b - a) / (365.25 * 86400_000) : 0;
}
// Max drawdown (additive, % units) of an equity path from a pnl series, plus the
// longest underwater run length (in trades).
function ddStats(pnls) {
  let cum = 0, peak = 0, maxDD = 0, under = 0, maxUnder = 0;
  for (const p of pnls) {
    cum += p;
    if (cum >= peak) { peak = cum; under = 0; }
    else { under++; if (under > maxUnder) maxUnder = under; }
    const dd = cum - peak; if (dd < maxDD) maxDD = dd;
  }
  return { maxDD, maxDDdur: maxUnder };
}
function resample(arr, rng) { const n = arr.length, out = new Array(n); for (let i = 0; i < n; i++) out[i] = arr[(rng() * n) | 0]; return out; }
function shuffle(arr, rng) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }

export function backtestStats(pnls, dates = [], { mcRuns = 1000, bootRuns = 1000, seed = 0x9e3779b9 } = {}) {
  const n = pnls.length;
  if (!n) return { trades: 0 };
  const rng = mulberry32(seed >>> 0);
  const m = mean(pnls), sd = stdev(pnls);
  const wins = pnls.filter(x => x > 0), losses = pnls.filter(x => x < 0);
  const avgWin = mean(wins), avgLoss = mean(losses);

  const ds = dates.length === n ? [...dates].sort() : [];
  const years = ds.length ? (yearsBetween(ds[0], ds[n - 1]) || n / 252) : n / 252;
  const tradesPerYr = n / Math.max(years, 0.25);
  const total  = sum(pnls);
  const cagr   = years > 0 ? (Math.pow(Math.max(1e-9, 1 + total / 100), 1 / years) - 1) * 100 : 0;
  const sharpe = sd > 1e-9 ? m / sd * Math.sqrt(tradesPerYr) : 0;
  const { maxDD, maxDDdur } = ddStats(pnls);

  // Bootstrap (resample with replacement) → outcome uncertainty.
  const bTot = new Array(bootRuns), bSh = new Array(bootRuns); let nPos = 0;
  for (let b = 0; b < bootRuns; b++) {
    const s = resample(pnls, rng); const t = sum(s);
    bTot[b] = t; if (t > 0) nPos++;
    const sm = mean(s), ss = stdev(s); bSh[b] = ss > 1e-9 ? sm / ss * Math.sqrt(tradesPerYr) : 0;
  }
  // Monte-Carlo (shuffle order) → path-dependent drawdown risk (sum is invariant).
  const mcDD = new Array(mcRuns);
  for (let r = 0; r < mcRuns; r++) mcDD[r] = ddStats(shuffle(pnls, rng)).maxDD;

  return {
    trades: n,
    winRate:    +(wins.length / n).toFixed(4),
    expectancy: +m.toFixed(4),
    profitFactor: +profitFactor(pnls).toFixed(3),
    payoff:     avgLoss < 0 ? +(avgWin / -avgLoss).toFixed(2) : 0,
    totalPnl:   +total.toFixed(2),
    cagr:       +cagr.toFixed(2),
    sharpe:     +sharpe.toFixed(3),
    sortino:    +sortinoRatio(pnls, tradesPerYr).toFixed(3),
    maxDD:      +maxDD.toFixed(2),
    maxDDdur,
    calmar:     maxDD < 0 ? +(cagr / Math.abs(maxDD)).toFixed(2) : 0,
    tradesPerYr: Math.round(tradesPerYr),
    bootstrap:  { total: pctile(bTot, [5, 50, 95]), sharpe: pctile(bSh, [5, 50, 95]), pPositive: +(nPos / bootRuns).toFixed(3) },
    montecarlo: { maxDD: pctile(mcDD, [50, 95, 99]) },
  };
}
