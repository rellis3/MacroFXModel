/**
 * Volatility-Forecast Research Engine — evaluate the forecast, don't optimise a
 * strategy.
 *
 * Treats every trading day as one experiment: on day i, build the forecast from
 * data STRICTLY BEFORE i (computeForecast on bars[0..i-1] — the live-forecaster
 * math, the same engine that draws the dashboard levels), then compare it to
 * what day i (and the next 5 / 20 sessions) ACTUALLY did. No lookahead: the
 * forecast never sees the bar it is scored against.
 *
 * Reframe (per the research brief): this is a "Daily Market Expectation Model".
 * Its outputs describe the expected DISTRIBUTION and SHAPE of the day — range
 * (H-L), body (O-C), directional legs (O-H up / O-L down), multi-day context —
 * so the questions are about the model's quality, not about entries/exits.
 *
 * What it measures (v1):
 *   • Accuracy   — MAE / RMSE / bias / MAPE of each component vs its median.
 *   • Calibration— exceedance rates: realized should exceed the MEDIAN 50% of
 *                  the time and the 75th 25%. Over-exceedance ⇒ forecast too
 *                  tight (underestimates vol); under ⇒ too wide.
 *   • Sharpness  — corr(forecast, realized): does a higher forecast actually
 *                  precede a higher realized range? (informative, not just
 *                  unbiased). A calibrated-but-flat forecast is useless.
 *   • Skill      — vs a climatology benchmark (trailing mean realized range).
 *                  skill = 1 − MAE_model / MAE_naive. The honest "is it good".
 *   • Shape      — efficiency |O-C|/(H-L) (trend vs chop) and the O-H/O-L
 *                  asymmetry (a hidden directional tilt).
 *   • Context    — regime (classifyRegime), day-of-week, month, vol-of-vol —
 *                  so every metric can be sliced (the interesting part).
 *
 * Pure + synthetic-testable: bars in, rows + aggregates out. No network, no DOM.
 * The offline job (M1 parquet → D1) and the page render sit on top of this.
 *
 * Deferred to v2 (need the intraday M1 path / full CDF): session contributions
 * & sequencing, intraday completion dynamics + Bayesian update, CRPS/PIT,
 * conditional-coverage (Christoffersen), path clustering.
 */

import { computeForecast } from './volForecast.js';
import { classifyRegime }  from './volBacktestEngine.js';

// ── Component registry ────────────────────────────────────────────────────────
// Each maps a realized value (from the outcome window) to the forecast's median
// and 75th fields. `dir` marks the two directional legs (for the asymmetry study).
const COMPONENTS = {
  daily: [
    { key: 'hl', label: 'H-L range',   med: 'hl_median', p75: 'hl_75' },
    { key: 'oc', label: 'O-C move',    med: 'oc_median', p75: 'oc_75' },
    { key: 'oh', label: 'O-H up',      med: 'oh_median', p75: 'oh_75', dir: 'up'   },
    { key: 'ol', label: 'O-L down',    med: 'ol_median', p75: 'ol_75', dir: 'down' },
  ],
  d5:  [
    { key: 'hl', label: '5d H-L', med: 'hl_5d', p75: 'hl_5d_75' },
    { key: 'oc', label: '5d O-C', med: 'oc_5d', p75: 'oc_5d_75' },
  ],
  d20: [
    { key: 'hl', label: '20d H-L', med: 'hl_20d', p75: 'hl_20d_75' },
    { key: 'oc', label: '20d O-C', med: 'oc_20d', p75: 'oc_20d_75' },
  ],
};

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const getDow   = d => DOW[new Date(d + 'T12:00:00Z').getUTCDay()];
const getMonth = d => d.substring(5, 7);

// Realized outcome over a window of daily bars, anchored at the first bar's open.
// window[0].open is the anchor; H/L across the window; close = last bar's close.
function realizedWindow(window) {
  const o = window[0].open;
  if (!(o > 0)) return null;
  let H = -Infinity, L = Infinity;
  for (const b of window) { if (b.high > H) H = b.high; if (b.low < L) L = b.low; }
  const c = window[window.length - 1].close;
  return {
    hl: (H - L) / o * 100,
    oc: Math.abs(c - o) / o * 100,
    oh: (H - o) / o * 100,
    ol: (o - L) / o * 100,
    signedOc: (c - o) / o * 100,          // signed body — for the direction study
  };
}

// ── Core: walk forward, one row per evaluable day ─────────────────────────────
// bars: daily OHLC, oldest→newest, each { date:'YYYY-MM-DD', open, high, low, close }.
// Returns { rows, summary }.
export function evaluateForecast(bars, assetClass = 'fx', opts = {}) {
  const { minLookback = 60, climWin = 20 } = opts;
  const n = bars.length;
  const closes = bars.map(b => b.close);
  const rows = [];

  // Trailing realized daily H-L, for the climatology benchmark (no lookahead:
  // uses realized ranges strictly before the day being scored).
  const realizedHlHist = [];

  for (let i = minLookback; i < n; i++) {
    // Forecast from data BEFORE day i — the bar i is never seen by the forecast.
    let fc;
    try { fc = computeForecast(bars.slice(0, i), assetClass); }
    catch { realizedHlHist.push(null); continue; }

    const rDaily = realizedWindow([bars[i]]);
    if (!rDaily) { realizedHlHist.push(null); continue; }

    // Climatology naive median = trailing mean of realized daily H-L.
    const climWindow = realizedHlHist.filter(v => v != null).slice(-climWin);
    const climHl = climWindow.length >= Math.ceil(climWin * 0.5)
      ? climWindow.reduce((s, v) => s + v, 0) / climWindow.length : null;

    const realized = { daily: rDaily };
    if (i + 4  < n) realized.d5  = realizedWindow(bars.slice(i, i + 5));
    if (i + 19 < n) realized.d20 = realizedWindow(bars.slice(i, i + 20));

    const row = {
      date: bars[i].date,
      regime: classifyRegime(closes, i, 20, 5, 0.002, 1.0),
      dow: getDow(bars[i].date),
      month: getMonth(bars[i].date),
      volAnnual: fc.vol_annual,
      vov: fc.vol_vov,
      efficiency: rDaily.hl > 0 ? Math.min(1, rDaily.oc / rDaily.hl) : null, // trend↔chop
      dailyDir: Math.sign(rDaily.signedOc),
      // forecast's own directional tilt (O-H median vs O-L median): >0 ⇒ upside skew
      fcSkew: +(((fc.oh_median ?? 0) - (fc.ol_median ?? 0))).toFixed(4),
      climHl,
      comp: {},   // per-horizon per-component { realized, med, p75, err, absErr, exMed, ex75 }
    };

    for (const [horizon, comps] of Object.entries(COMPONENTS)) {
      const r = realized[horizon];
      if (!r) continue;
      row.comp[horizon] = {};
      for (const c of comps) {
        const actual = r[c.key];
        const med = fc[c.med], p75 = fc[c.p75];
        if (actual == null || med == null) continue;
        const err = actual - med;
        row.comp[horizon][c.key] = {
          actual: +actual.toFixed(4), med: +med.toFixed(4), p75: +(p75 ?? 0).toFixed(4),
          err: +err.toFixed(4), absErr: +Math.abs(err).toFixed(4),
          exMed: actual > med  ? 1 : 0,
          ex75:  actual > p75  ? 1 : 0,
        };
      }
    }

    rows.push(row);
    realizedHlHist.push(rDaily.hl);
  }

  return { rows, summary: summarize(rows) };
}

// ── Aggregation ───────────────────────────────────────────────────────────────
// Per horizon×component: MAE, RMSE, bias, MAPE, exceedance rates, sharpness corr,
// and (for daily H-L) climatology skill. Plus efficiency & direction-hit summaries
// and by-regime / by-dow slices of the headline daily H-L error.
function summarize(rows) {
  const _mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
  const _corr = (xs, ys) => {
    const n = xs.length; if (n < 2) return 0;
    const mx = _mean(xs), my = _mean(ys);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
  };

  const perComponent = {};
  for (const [horizon, comps] of Object.entries(COMPONENTS)) {
    perComponent[horizon] = {};
    for (const c of comps) {
      const cells = rows.map(r => r.comp[horizon]?.[c.key]).filter(Boolean);
      if (!cells.length) continue;
      const abs = cells.map(x => x.absErr);
      const err = cells.map(x => x.err);
      const act = cells.map(x => x.actual);
      const med = cells.map(x => x.med);
      const mape = _mean(cells.map(x => x.med > 0 ? Math.abs(x.err) / x.actual : 0).filter(v => isFinite(v))) * 100;
      const nCell = cells.length;
      perComponent[horizon][c.key] = {
        label: c.label, n: nCell,
        mae:  +_mean(abs).toFixed(4),
        rmse: +Math.sqrt(_mean(err.map(e => e * e))).toFixed(4),
        bias: +_mean(err).toFixed(4),                       // +ve ⇒ forecast too low
        mape: +mape.toFixed(1),
        exceedMedianPct: +(_mean(cells.map(x => x.exMed)) * 100).toFixed(1),  // target 50
        exceed75Pct:     +(_mean(cells.map(x => x.ex75))  * 100).toFixed(1),  // target 25
        sharpnessCorr:   +_corr(med, act).toFixed(3),        // forecast vs realized
        medMean: +_mean(med).toFixed(4), actMean: +_mean(act).toFixed(4),
      };
    }
  }

  // Climatology skill on daily H-L: 1 − MAE_model / MAE_naive.
  const hlCells = rows.filter(r => r.comp.daily?.hl && r.climHl != null)
    .map(r => ({ actual: r.comp.daily.hl.actual, med: r.comp.daily.hl.med, clim: r.climHl }));
  const maeModel = _mean(hlCells.map(x => Math.abs(x.actual - x.med)));
  const maeNaive = _mean(hlCells.map(x => Math.abs(x.actual - x.clim)));
  const hlSkill = maeNaive > 0 ? +(1 - maeModel / maeNaive).toFixed(3) : 0;

  // Shape: efficiency distribution + direction hit-rate of the forecast's skew.
  const effs = rows.map(r => r.efficiency).filter(v => v != null);
  const dirCells = rows.filter(r => Math.abs(r.fcSkew) > 1e-6 && r.dailyDir !== 0);
  const dirHit = dirCells.length
    ? _mean(dirCells.map(r => (Math.sign(r.fcSkew) === r.dailyDir ? 1 : 0))) * 100 : null;

  // Slices of the daily H-L absolute error / exceedance by regime and day-of-week.
  const sliceBy = keyFn => {
    const g = {};
    for (const r of rows) {
      const cell = r.comp.daily?.hl; if (!cell) continue;
      const k = keyFn(r); (g[k] = g[k] || []).push(cell);
    }
    return Object.fromEntries(Object.entries(g).map(([k, cs]) => [k, {
      n: cs.length,
      mae: +_mean(cs.map(x => x.absErr)).toFixed(4),
      bias: +_mean(cs.map(x => x.err)).toFixed(4),
      exceedMedianPct: +(_mean(cs.map(x => x.exMed)) * 100).toFixed(1),
    }]));
  };

  return {
    nDays: rows.length,
    dateFrom: rows[0]?.date ?? null, dateTo: rows.at(-1)?.date ?? null,
    perComponent,
    dailyHlSkillVsClimatology: hlSkill,
    efficiencyMean: +_mean(effs).toFixed(3),
    efficiencyTrendPct: +(_mean(effs.map(e => e >= 0.5 ? 1 : 0)) * 100).toFixed(1), // O-C≥½H-L
    fcSkewDirHitPct: dirHit == null ? null : +dirHit.toFixed(1),  // vs 50 base rate
    byRegime: sliceBy(r => r.regime),
    byDow:    sliceBy(r => r.dow),
  };
}

export { COMPONENTS };
