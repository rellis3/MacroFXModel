/**
 * Book Stress — the liquidity-contraction replay and allocation geometry
 * (`ANALYTICS_ENGINE_DESIGN.md` §4 Phase 4; `SYSTEM_ASSESSMENT.md` §2.4 /
 * punch-list #6).
 *
 * The claim under test is the one the assessment flags: a book of N sleeves
 * has materially fewer than N independent bets, and the shortfall is WORST
 * exactly when it matters — correlations converge in a liquidity contraction,
 * so per-sleeve drawdowns that look independent in the full sample arrive
 * together in a crisis. This measures that instead of assuming it, by
 * recomputing the effective number of bets INSIDE each crisis window and
 * comparing it to the calm-period number.
 *
 * Risk diagnostic, not a signal: nothing here claims edge. Allocation modes
 * are compared on realized geometry (vol, drawdown, effective bets), and a
 * mode "winning" on past data is not evidence it will — the same OOS rules
 * apply before any allocation is adopted.
 *
 * Input contract: sleeves = { name: { dates: string[], returns: number[] } },
 * dates ISO 'YYYY-MM-DD', returns per-period fractional (0.01 = +1%). Series
 * need not be aligned — `alignSleeves` intersects on dates so every
 * cross-sectional number is computed on a common calendar.
 */

import { sharpeRatio, maxDrawdownFromPnls } from './metricsCore.js';
import { diversificationSummary } from './diversificationCore.js';
import { stdev, mean } from './statsCore.js';

// Named liquidity-contraction windows. These are DECLARED, not discovered —
// picking windows after seeing the returns would be the selection bias this
// exists to guard against.
export const STRESS_WINDOWS = [
  { key: 'gfc',        label: 'GFC (2008)',              from: '2008-09-01', to: '2009-03-31' },
  { key: 'taper',      label: 'Taper tantrum (2013)',    from: '2013-05-01', to: '2013-09-30' },
  { key: 'cny2015',    label: 'CNY deval / Aug 2015',    from: '2015-08-01', to: '2015-09-30' },
  { key: 'q4_2018',    label: 'Q4 2018 tightening',      from: '2018-10-01', to: '2018-12-31' },
  { key: 'covid',      label: 'COVID crash (2020)',      from: '2020-02-15', to: '2020-04-15' },
  { key: 'y2022',      label: '2022 hiking cycle',       from: '2022-01-01', to: '2022-10-31' },
];

// Intersect sleeves onto a common date axis. Returns { dates, cols, names }
// where cols[j][i] is sleeve j's return on dates[i].
export function alignSleeves(sleeves) {
  const names = Object.keys(sleeves ?? {}).filter(k => Array.isArray(sleeves[k]?.dates) && Array.isArray(sleeves[k]?.returns));
  if (!names.length) return { dates: [], cols: [], names: [] };
  const maps = names.map(n => {
    const { dates, returns } = sleeves[n];
    const m = new Map();
    for (let i = 0; i < Math.min(dates.length, returns.length); i++) {
      if (Number.isFinite(returns[i])) m.set(String(dates[i]), returns[i]);
    }
    return m;
  });
  let common = [...maps[0].keys()];
  for (let j = 1; j < maps.length; j++) common = common.filter(d => maps[j].has(d));
  common.sort();
  return { dates: common, cols: maps.map(m => common.map(d => m.get(d))), names };
}

// Per-series stats on a return slice. periodsPerYear is stated by the caller
// (daily books = 252) rather than hidden in a default — metricsCore convention.
export function seriesStats(rets, periodsPerYear = 252) {
  const v = rets.filter(Number.isFinite);
  if (!v.length) return { n: 0, total: NaN, mean: NaN, vol: NaN, sharpe: NaN, maxDD: NaN, worst: NaN, best: NaN, hitRate: NaN };
  const sd = stdev(v, 1);
  return {
    n: v.length,
    total: v.reduce((s, x) => s + x, 0),
    mean: mean(v),
    vol: sd * Math.sqrt(periodsPerYear),
    sharpe: sharpeRatio(v, periodsPerYear),
    maxDD: maxDrawdownFromPnls(v),
    worst: Math.min(...v),
    best: Math.max(...v),
    hitRate: v.filter(x => x > 0).length / v.length,
  };
}

// Equal-weight book return series from aligned columns.
export function bookSeries(cols, weights = null) {
  if (!cols.length) return [];
  const n = cols[0].length;
  const w = weights ?? new Array(cols.length).fill(1 / cols.length);
  const wsum = w.reduce((s, x) => s + Math.abs(x), 0) || 1;
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let j = 0; j < cols.length; j++) acc += (w[j] / wsum) * (cols[j][i] ?? 0);
    out[i] = acc;
  }
  return out;
}

function sliceByDate(dates, cols, from, to) {
  const idx = [];
  for (let i = 0; i < dates.length; i++) if (dates[i] >= from && dates[i] <= to) idx.push(i);
  return { dates: idx.map(i => dates[i]), cols: cols.map(c => idx.map(i => c[i])) };
}

/**
 * The headline: replay each declared window and compare it to the calm
 * baseline (all dates OUTSIDE every stress window). Reports per-sleeve and
 * book stats inside the window, plus the effective number of bets computed
 * IN-window vs calm — the diversification-evaporation measurement.
 */
export function stressReplay(sleeves, { windows = STRESS_WINDOWS, periodsPerYear = 252, weights = null } = {}) {
  const { dates, cols, names } = alignSleeves(sleeves);
  if (!dates.length) return { ok: false, error: 'no overlapping dates across sleeves' };

  const inAnyWindow = new Set();
  for (const w of windows) for (let i = 0; i < dates.length; i++) if (dates[i] >= w.from && dates[i] <= w.to) inAnyWindow.add(i);
  const calmIdx = dates.map((_, i) => i).filter(i => !inAnyWindow.has(i));
  const calmCols = cols.map(c => calmIdx.map(i => c[i]));

  const calmDiv = calmCols[0]?.length >= 20 ? diversificationSummary(calmCols, weights ?? undefined) : null;
  const calmBook = seriesStats(bookSeries(calmCols, weights), periodsPerYear);

  const out = [];
  for (const w of windows) {
    const s = sliceByDate(dates, cols, w.from, w.to);
    if (!s.dates.length) { out.push({ ...w, covered: false, n: 0 }); continue; }
    const div = s.cols[0].length >= 20 ? diversificationSummary(s.cols, weights ?? undefined) : null;
    const book = seriesStats(bookSeries(s.cols, weights), periodsPerYear);
    out.push({
      ...w,
      covered: true,
      n: s.dates.length,
      firstDate: s.dates[0], lastDate: s.dates[s.dates.length - 1],
      book,
      perSleeve: names.map((nm, j) => ({ name: nm, ...seriesStats(s.cols[j], periodsPerYear) })),
      // How many sleeves lost money in this window — "did diversification help?"
      sleevesNegative: names.filter((_, j) => s.cols[j].reduce((a, b) => a + b, 0) < 0).length,
      effectiveBets: div ? div.pca : null,
      effectiveBetsRatio: div ? div.ratio : null,
      avgCorr: div ? avgOffDiag(div.corr) : null,
    });
  }

  return {
    ok: true,
    names,
    nSleeves: names.length,
    dates: { first: dates[0], last: dates[dates.length - 1], n: dates.length },
    calm: {
      n: calmIdx.length,
      book: calmBook,
      effectiveBets: calmDiv ? calmDiv.pca : null,
      effectiveBetsRatio: calmDiv ? calmDiv.ratio : null,
      avgCorr: calmDiv ? avgOffDiag(calmDiv.corr) : null,
    },
    windows: out,
  };
}

function avgOffDiag(corr) {
  if (!Array.isArray(corr) || corr.length < 2) return null;
  let s = 0, c = 0;
  for (let i = 0; i < corr.length; i++) for (let j = i + 1; j < corr.length; j++) { const v = corr[i][j]; if (Number.isFinite(v)) { s += v; c++; } }
  return c ? s / c : null;
}

/**
 * Allocation geometry. Compares weighting schemes on the SAME sleeve returns:
 *   equal      — 1/N, the honest default
 *   inverseVol — w ∝ 1/σ (the standard risk-normaliser)
 *   riskParity — iterative equal-risk-contribution (converges for a PSD
 *                covariance; falls back to inverseVol if it does not)
 * Reports realized book vol/Sharpe/maxDD and effective bets under each.
 *
 * Vol weights are computed on a TRAILING window per rebalance (no lookahead);
 * `lookback` bars of history are consumed before the book starts.
 */
export function allocationCompare(sleeves, { periodsPerYear = 252, lookback = 60, rebalance = 20 } = {}) {
  const { dates, cols, names } = alignSleeves(sleeves);
  const n = dates.length, k = cols.length;
  if (n < lookback + 40 || k < 2) return { ok: false, error: 'need ≥2 sleeves and enough history' };

  const modes = ['equal', 'inverseVol', 'riskParity'];
  const series = Object.fromEntries(modes.map(m => [m, []]));
  const weightTrace = Object.fromEntries(modes.map(m => [m, []]));
  let w = Object.fromEntries(modes.map(m => [m, new Array(k).fill(1 / k)]));

  for (let i = lookback; i < n; i++) {
    if ((i - lookback) % rebalance === 0) {
      const win = cols.map(c => c.slice(i - lookback, i));   // strictly past
      const vols = win.map(v => stdev(v.filter(Number.isFinite), 1) || 1e-9);
      w.equal = new Array(k).fill(1 / k);
      const inv = vols.map(v => 1 / v), invSum = inv.reduce((a, b) => a + b, 0);
      w.inverseVol = inv.map(v => v / invSum);
      w.riskParity = riskParityWeights(win) ?? w.inverseVol;
      for (const m of modes) weightTrace[m].push({ date: dates[i], w: w[m].slice() });
    }
    for (const m of modes) {
      let acc = 0;
      for (let j = 0; j < k; j++) acc += w[m][j] * (cols[j][i] ?? 0);
      series[m].push(acc);
    }
  }

  const liveCols = cols.map(c => c.slice(lookback));
  const result = {};
  for (const m of modes) {
    const div = diversificationSummary(liveCols, w[m]);
    result[m] = {
      ...seriesStats(series[m], periodsPerYear),
      effectiveBetsWeighted: div.weighted,
      effectiveBetsPCA: div.pca,
      finalWeights: names.map((nm, j) => ({ name: nm, w: w[m][j] })),
    };
  }
  return { ok: true, names, n: series.equal.length, periodsPerYear, modes: result, weightTrace, nBets: k };
}

// Equal-risk-contribution weights by fixed-point iteration on the sample
// covariance. Returns null if it fails to converge (caller falls back).
export function riskParityWeights(windows, { iters = 500, tol = 1e-8 } = {}) {
  const k = windows.length;
  if (!k) return null;
  const cov = [];
  const mus = windows.map(v => mean(v.filter(Number.isFinite)));
  for (let a = 0; a < k; a++) {
    cov.push([]);
    for (let b = 0; b < k; b++) {
      const va = windows[a], vb = windows[b];
      const m = Math.min(va.length, vb.length);
      let s = 0, c = 0;
      for (let i = 0; i < m; i++) if (Number.isFinite(va[i]) && Number.isFinite(vb[i])) { s += (va[i] - mus[a]) * (vb[i] - mus[b]); c++; }
      cov[a].push(c > 1 ? s / (c - 1) : 0);
    }
  }
  // Multiplicative update w_i ← w_i·√(target / RC_i), where RC_i = w_i·(Σw)_i
  // and target = portfolio variance / k. At the fixed point every asset
  // contributes equal risk. Sanity check for UNCORRELATED assets:
  // RC_i = w_i²σ_i², so one step gives w_i ∝ 1/σ_i — the known ERC answer.
  // (Using w_i ← target/(Σw)_i instead converges to 1/σ², which is wrong.)
  let w = new Array(k).fill(1 / k);
  for (let it = 0; it < iters; it++) {
    const mrc = w.map((_, a) => w.reduce((s, wb, b) => s + cov[a][b] * wb, 0));   // Σw
    const port = w.reduce((s, wa, a) => s + wa * mrc[a], 0);
    if (!(port > 0)) return null;
    const target = port / k;
    let next = w.map((wa, a) => {
      const rc = wa * mrc[a];
      return rc > 0 ? wa * Math.sqrt(target / rc) : wa;
    });
    const sum = next.reduce((s, x) => s + Math.abs(x), 0);
    if (!(sum > 0)) return null;
    next = next.map(x => x / sum);
    const delta = next.reduce((s, x, i) => s + Math.abs(x - w[i]), 0);
    w = next;
    if (delta < tol) break;
  }
  return w.every(Number.isFinite) ? w : null;
}
