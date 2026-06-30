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

// Compounded-equity max drawdown as a % OF THE RUNNING PEAK (negative). Unlike
// ddStats (additive % points on a cumulative SUM), this compounds the per-period
// returns into an equity curve and measures peak-to-trough as a fraction of
// capital — the SAME basis as the geometric CAGR, so Calmar = CAGR/|maxDD| is a
// like-for-like ratio and the number is a true "% of starting capital" drawdown.
function compoundedMaxDD(returnsPct) {
  let eq = 1, peak = 1, maxDD = 0;
  for (const r of returnsPct) {
    eq *= (1 + r / 100);
    if (eq > peak) peak = eq;
    const dd = (eq - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }
  return maxDD * 100;
}
function resample(arr, rng) { const n = arr.length, out = new Array(n); for (let i = 0; i < n; i++) out[i] = arr[(rng() * n) | 0]; return out; }
function shuffle(arr, rng) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
function skewKurt(a) {
  const n = a.length; if (n < 3) return { skew: 0, kurt: 3 };
  const m = mean(a), sd = stdev(a); if (sd < 1e-12) return { skew: 0, kurt: 3 };
  let s = 0, k = 0; for (const x of a) { const z = (x - m) / sd; s += z ** 3; k += z ** 4; }
  return { skew: s / n, kurt: k / n };
}
// Standard normal CDF (Abramowitz-Stegun erf).
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
// Probabilistic Sharpe Ratio (López de Prado): P(true Sharpe > benchmark) given
// the sample's length, skew and kurtosis. `sr`/`srBench` are PER-OBSERVATION
// (non-annualised) Sharpes. Penalises short samples, negative skew and fat tails.
function probabilisticSharpe(sr, n, skew, kurt, srBench = 0) {
  if (n < 3) return 0;
  const denom = Math.sqrt(Math.max(1e-12, 1 - skew * sr + (kurt - 1) / 4 * sr * sr));
  return +normCdf((sr - srBench) * Math.sqrt(n - 1) / denom).toFixed(3);
}

// Inverse standard-normal CDF (Acklam's rational approximation, |err| < 1.15e-9).
function invNormCdf(p) {
  if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
  const a = [-3.969683028665376e+1, 2.209460984245205e+2, -2.759285104469687e+2, 1.383577518672690e+2, -3.066479806614716e+1, 2.506628277459239e+0];
  const b = [-5.447609879822406e+1, 1.615858368580409e+2, -1.556989798598866e+2, 6.680131188771972e+1, -1.328068155288572e+1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e+0, -2.549732539343734e+0, 4.374664141464968e+0, 2.938163982698783e+0];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e+0, 3.754408661907416e+0];
  const pl = 0.02425, ph = 1 - pl;
  if (p < pl)  { const q = Math.sqrt(-2 * Math.log(p));     return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  if (p <= ph) { const q = p - 0.5, r = q*q;                return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1); }
  const q = Math.sqrt(-2 * Math.log(1 - p));                return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
}

// Deflated Sharpe Ratio (López de Prado 2014) — the multiple-testing correction.
// Given the chosen series' daily PnL and the per-observation Sharpes of EVERY
// config tried (`trialSRs`), it computes the expected MAXIMUM Sharpe achievable
// by chance across that many trials (sr0) and returns P(true Sharpe > sr0),
// penalised for sample length, skew and kurtosis. A book that clears its own
// search's noise has DSR near 1; one perched on a lucky setting has DSR near 0.
export function deflatedSharpe(daily, trialSRs = []) {
  const T = daily.length, N = trialSRs.length;
  if (N < 2 || T < 3) return null;
  const sd = stdev(daily); if (sd < 1e-12) return null;
  const sr = mean(daily) / sd;                              // per-observation Sharpe of the chosen series
  const tm = mean(trialSRs);
  const tv = trialSRs.reduce((s, x) => s + (x - tm) ** 2, 0) / (N - 1);   // sample variance of trial Sharpes
  if (!(tv > 0)) return null;
  const EM = 0.5772156649015329;                            // Euler-Mascheroni
  const sr0 = Math.sqrt(tv) * ((1 - EM) * invNormCdf(1 - 1 / N) + EM * invNormCdf(1 - 1 / (N * Math.E)));
  const { skew, kurt } = skewKurt(daily);
  const denom = Math.sqrt(Math.max(1e-12, 1 - skew * sr + (kurt - 1) / 4 * sr * sr));
  return { dsr: +normCdf((sr - sr0) * Math.sqrt(T - 1) / denom).toFixed(3),
           sr: +sr.toFixed(4), sr0: +sr0.toFixed(4), nTrials: N, trialSharpeStd: +Math.sqrt(tv).toFixed(4) };
}

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
  // Collect drawdown MAGNITUDES so the reported percentiles are worst-case-correct:
  // p99 = the 99th-percentile DEEPEST drawdown, not the shallowest. (Reporting
  // pctile on the signed negatives put the mildest ordering at p99 — a bug that
  // made the worst-case DD look benign.)
  const mcDD = new Array(mcRuns);
  for (let r = 0; r < mcRuns; r++) mcDD[r] = Math.abs(ddStats(shuffle(pnls, rng)).maxDD);

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
    // Negate the magnitude percentiles back to signed drawdowns so the UI still
    // shows negatives, but now p50→p95→p99 DEEPEN (p99 = near-worst ordering).
    montecarlo: { maxDD: (() => { const m = pctile(mcDD, [50, 95, 99]); return { p50: -m.p50, p95: -m.p95, p99: -m.p99 }; })() },
  };
}

// ── Portfolio stats — the HONEST headline for a concurrent multi-asset book ────
// Per-trade Sharpe × √(trades/yr) assumes every trade is an independent bet — false
// for 33 pairs trading one signal at the same time. Aggregating to a TIME series
// (daily) and annualising by √252 captures same-day concurrency + cross-pair
// correlation, so this is the Sharpe that's real. `daily` = summed per-trade PnL
// per trading day (% units, equal unit per trade). Also returns a vol-targeted
// view so CAGR/DD are at a fixed, comparable risk level (leverage-invariant).
export function portfolioStats(daily, { targetVol = 10, periodsPerYear = 252, mc = false, mcRuns = 1000 } = {}) {
  const n = daily.length;
  if (!n) return { days: 0 };
  const m = mean(daily), sd = stdev(daily);
  const sharpe = sd > 1e-9 ? m / sd * Math.sqrt(periodsPerYear) : 0;
  const annVol = sd * Math.sqrt(periodsPerYear);          // % units
  const years  = n / periodsPerYear;
  // CAGR and maxDD are BOTH measured on the same compounded equity curve, so they
  // are like-for-like "% of capital" and Calmar = CAGR/|maxDD| is a real ratio.
  const cagrOf = series => {
    let eq = 1; for (const r of series) eq *= (1 + r / 100);
    return years > 0 ? (Math.pow(Math.max(1e-9, eq), 1 / years) - 1) * 100 : 0;
  };
  const cagr = cagrOf(daily), maxDD = compoundedMaxDD(daily);
  // Scale the daily series to a fixed annual vol so the curve is comparable.
  const scale = annVol > 1e-9 ? targetVol / annVol : 0;
  const scaled = daily.map(x => x * scale);
  const vtCagr = cagrOf(scaled), vtDD = compoundedMaxDD(scaled);
  // Monte-Carlo worst-case drawdown (opt-in — it's 1000 reshuffles, skip in the
  // hot rigor sub-calls). The headline maxDD above is ONE historical ordering; this
  // shuffles the daily returns to show the drawdown you could have lived through at
  // the same vol. Reported as signed, deepening p50→p95→p99.
  let mcMaxDD = null;
  if (mc && scale > 0) {
    const rng = mulberry32(0x9e3779b9);
    const mags = new Array(mcRuns);
    for (let i = 0; i < mcRuns; i++) mags[i] = Math.abs(compoundedMaxDD(shuffle(scaled, rng)));
    const p = pctile(mags, [50, 95, 99]);
    mcMaxDD = { p50: -p.p50, p95: -p.p95, p99: -p.p99 };
  }
  // Probabilistic Sharpe (P true Sharpe > 0) on the per-day Sharpe — penalises
  // short samples, negative skew and fat tails.
  const { skew, kurt } = skewKurt(daily);
  const psr = probabilisticSharpe(sd > 1e-9 ? m / sd : 0, n, skew, kurt, 0);
  return {
    days: n,
    sharpe: +sharpe.toFixed(2),
    psr,
    skew: +skew.toFixed(2),
    annVol: +annVol.toFixed(2),
    cagr:   +cagr.toFixed(2),
    maxDD:  +maxDD.toFixed(2),
    calmar: maxDD < 0 ? +(cagr / Math.abs(maxDD)).toFixed(2) : 0,
    volTarget: { target: targetVol, cagr: +vtCagr.toFixed(2), maxDD: +vtDD.toFixed(2),
                 calmar: vtDD < 0 ? +(vtCagr / Math.abs(vtDD)).toFixed(2) : 0,
                 ...(mcMaxDD ? { mcMaxDD } : {}) },
  };
}
