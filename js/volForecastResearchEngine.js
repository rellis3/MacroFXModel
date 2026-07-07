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

  // Generic slice of a daily component's cells by a key function → compact stats.
  const sliceComp = (compKey, keyFn) => {
    const g = {};
    for (const r of rows) {
      const cell = r.comp.daily?.[compKey]; if (!cell) continue;
      const k = keyFn(r); if (k == null) continue;
      (g[k] = g[k] || []).push(cell);
    }
    return Object.fromEntries(Object.entries(g).map(([k, cs]) => [k, {
      n: cs.length,
      mae: +_mean(cs.map(x => x.absErr)).toFixed(4),
      bias: +_mean(cs.map(x => x.err)).toFixed(4),
      exceedMedianPct: +(_mean(cs.map(x => x.exMed)) * 100).toFixed(1),
    }]));
  };

  // Regime × component matrix (the decision-relevant daily legs), day-of-week,
  // and vol-of-vol terciles — where the forecast is reliable vs where it breaks.
  const regimeMatrix = {};
  for (const comp of ['hl', 'oc', 'oh', 'ol']) regimeMatrix[comp] = sliceComp(comp, r => r.regime);
  const byDow = sliceComp('hl', r => r.dow);
  const vovs  = rows.map(r => r.vov).filter(v => v != null).sort((a, b) => a - b);
  const vLo = vovs[Math.floor(vovs.length / 3)], vHi = vovs[Math.floor(2 * vovs.length / 3)];
  const byVov = sliceComp('hl', r => r.vov == null ? null : r.vov <= vLo ? '1·low' : r.vov >= vHi ? '3·high' : '2·mid');

  // Forecast completion (brief Q7): realized daily H-L as a % of the forecast
  // MEDIAN H-L. Buckets show how often the day never reaches / matches / blows
  // through the expected range. The median is calibrated to ~50% exceedance, so
  // ~half of days land >100% by construction — the informative part is the SHAPE
  // of the tail (how many days barely move vs how many blow through). No lookahead:
  // uses the same walk-forward cells as everything else.
  const complCells = rows.map(r => r.comp.daily?.hl).filter(Boolean)
    .map(x => x.med > 0 ? x.actual / x.med * 100 : null).filter(v => v != null);
  const complBuckets = ['<40', '40-65', '65-92', '92-118', '118-165', '>165'];
  const _bucket = v => v < 40 ? '<40' : v < 65 ? '40-65' : v < 92 ? '65-92'
    : v < 118 ? '92-118' : v < 165 ? '118-165' : '>165';
  const complHist = Object.fromEntries(complBuckets.map(b => [b, 0]));
  for (const v of complCells) complHist[_bucket(v)]++;
  const complN = complCells.length || 1;
  const _median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  // Completion sliced by a condition (regime / vol-of-vol) — "what conditions
  // produce each outcome" (Q7): mean completion % and how often the median is met.
  const complBy = keyFn => {
    const g = {};
    for (const r of rows) { const c = r.comp.daily?.hl; if (!c || !(c.med > 0)) continue; const k = keyFn(r); if (k == null) continue; (g[k] = g[k] || []).push(c.actual / c.med * 100); }
    return Object.fromEntries(Object.entries(g).map(([k, a]) => [k, { n: a.length, meanPct: +_mean(a).toFixed(1), reachedMedianPct: +(_mean(a.map(v => v >= 100 ? 1 : 0)) * 100).toFixed(1) }]));
  };

  // Persistence / vol-clustering: after an above-75th day, is the NEXT day more
  // likely to exceed its own median than the unconditional base rate?
  let baseEx = 0, baseN = 0, condEx = 0, condN = 0;
  for (let i = 0; i < rows.length - 1; i++) {
    const t = rows[i].comp.daily?.hl, nx = rows[i + 1].comp.daily?.hl;
    if (!t || !nx) continue;
    baseEx += nx.exMed; baseN++;
    if (t.ex75) { condEx += nx.exMed; condN++; }
  }
  const persistence = {
    baseExceedMedianPct: +(baseN ? baseEx / baseN * 100 : 0).toFixed(1),
    afterAbove75Pct:     +(condN ? condEx / condN * 100 : 0).toFixed(1),
    n: condN,
  };

  // Error distribution (brief Q1: "distribution of errors", median error). Signed
  // percentage error of the daily H-L forecast: (actual − median) / median × 100.
  // A calibrated median sits near the centre; a left-heavy mass ⇒ the forecast
  // routinely over-states the range (bands too wide). Reuses the walk-forward cells.
  const errCells = rows.map(r => r.comp.daily?.hl).filter(c => c && c.med > 0)
    .map(c => (c.actual - c.med) / c.med * 100);
  const errBuckets = ['<-50', '-50..-25', '-25..0', '0..25', '25..50', '50..100', '>100'];
  const _errBucket = v => v < -50 ? '<-50' : v < -25 ? '-50..-25' : v < 0 ? '-25..0'
    : v < 25 ? '0..25' : v < 50 ? '25..50' : v <= 100 ? '50..100' : '>100';
  const errHist = Object.fromEntries(errBuckets.map(b => [b, 0]));
  for (const v of errCells) errHist[_errBucket(v)]++;
  const errN = errCells.length || 1;
  const errorDist = {
    n: errCells.length,
    meanPctErr:   +_mean(errCells).toFixed(1),
    medianPctErr: +_median(errCells).toFixed(1),
    overStatePct: +(_mean(errCells.map(v => v < 0 ? 1 : 0)) * 100).toFixed(1),   // days the range fell short of the median forecast
    hist: Object.fromEntries(errBuckets.map(b => [b, +(errHist[b] / errN * 100).toFixed(1)])),
  };

  const completion = {
    n: complCells.length,
    meanPct:          +_mean(complCells).toFixed(1),
    medianPct:        +_median(complCells).toFixed(1),
    reachedMedianPct: +(_mean(complCells.map(v => v >= 100 ? 1 : 0)) * 100).toFixed(1),  // day makes the full median forecast
    neverHalfPct:     +(_mean(complCells.map(v => v <  50 ? 1 : 0)) * 100).toFixed(1),   // day fails to make even ½ the forecast
    blewThroughPct:   +(_mean(complCells.map(v => v > 165 ? 1 : 0)) * 100).toFixed(1),   // day blows through 165% (expansion tail)
    hist: Object.fromEntries(complBuckets.map(b => [b, +(complHist[b] / complN * 100).toFixed(1)])),
    byRegime: complBy(r => r.regime),
    byVov:    complBy(r => r.vov == null ? null : r.vov <= vLo ? '1·low' : r.vov >= vHi ? '3·high' : '2·mid'),
  };

  // ══ PR-B daily aggregations (no intraday needed) ═══════════════════════════
  // Per-row daily-H-L features, in chronological order, for the miss / multi-day /
  // confidence / day-type studies. completion = realized ÷ median forecast (%);
  // errP = signed % error; all derived from the same walk-forward cells.
  const feats = [];
  for (let i = 0; i < rows.length; i++) {
    const c = rows[i].comp.daily?.hl; if (!c || !(c.med > 0)) continue;
    feats.push({
      i, date: rows[i].date, regime: rows[i].regime, dow: rows[i].dow,
      month: rows[i].month, dom: +rows[i].date.slice(8, 10),
      vov: rows[i].vov, eff: rows[i].efficiency,
      completion: c.actual / c.med * 100, errP: (c.actual - c.med) / c.med * 100,
      absErrP: Math.abs((c.actual - c.med) / c.med * 100),
      exMed: c.exMed, hlActual: c.actual,
    });
  }

  // ── Forecast MISSES — profile the big-error tail (brief: "what do big-miss
  //    days have in common"). Overshoot = realized ≥150% of median (expansion the
  //    forecast missed low); undershoot = realized ≤50% (a dead day it missed high).
  const _profile = (grp) => {
    if (!grp.length) return { n: 0 };
    const regCount = {}; for (const f of grp) regCount[f.regime] = (regCount[f.regime] || 0) + 1;
    const dowCount = {}; for (const f of grp) dowCount[f.dow] = (dowCount[f.dow] || 0) + 1;
    const topReg = Object.entries(regCount).sort((a, b) => b[1] - a[1])[0];
    const topDow = Object.entries(dowCount).sort((a, b) => b[1] - a[1])[0];
    // prior-day completion (does a big day follow a big day?)
    const priorCompl = grp.map(f => feats.find(x => x.i === f.i - 1)?.completion).filter(v => v != null);
    return {
      n: grp.length, pctOfDays: +(grp.length / feats.length * 100).toFixed(1),
      meanEff: +_mean(grp.map(f => f.eff).filter(v => v != null)).toFixed(3),
      meanVov: +_mean(grp.map(f => f.vov).filter(v => v != null)).toFixed(4),
      topRegime: topReg ? `${topReg[0]} (${+(topReg[1] / grp.length * 100).toFixed(0)}%)` : '—',
      topDow: topDow ? `${topDow[0]} (${+(topDow[1] / grp.length * 100).toFixed(0)}%)` : '—',
      priorDayComplMean: priorCompl.length ? +_mean(priorCompl).toFixed(0) : null,
    };
  };
  const misses = {
    overshoot: _profile(feats.filter(f => f.completion >= 150)),   // day much bigger than forecast
    undershoot: _profile(feats.filter(f => f.completion <= 50)),   // day much smaller than forecast
    // baseline for comparison
    all: { meanEff: +_mean(feats.map(f => f.eff).filter(v => v != null)).toFixed(3), meanVov: +_mean(feats.map(f => f.vov).filter(v => v != null)).toFixed(4) },
  };

  // ── SEASONAL — by calendar month + a few named periods (summer, December,
  //    month-end, quarter-end). Compact stats: n, H-L MAE (price-%), exceedance.
  const _seasBucket = (sel) => {
    const g = feats.filter(sel); if (!g.length) return null;
    return { n: g.length, mae: +_mean(g.map(f => f.absErrP)).toFixed(1), exceedMedianPct: +(_mean(g.map(f => f.exMed)) * 100).toFixed(1), meanCompletion: +_mean(g.map(f => f.completion)).toFixed(0) };
  };
  const byMonth = {};
  for (let m = 1; m <= 12; m++) { const b = _seasBucket(f => +f.month === m); if (b) byMonth[String(m).padStart(2, '0')] = b; }
  const seasonal = {
    byMonth,
    periods: {
      summer:     _seasBucket(f => f.month === '07' || f.month === '08'),
      december:   _seasBucket(f => f.month === '12'),
      monthEnd:   _seasBucket(f => f.dom >= 26),
      quarterEnd: _seasBucket(f => ['03', '06', '09', '12'].includes(f.month) && f.dom >= 24),
    },
  };

  // ── MULTI-DAY relationships. (a) Do forecast errors predict tomorrow's vol?
  //    corr(today signed %err, tomorrow realized H-L). (b) After ≥3 consecutive
  //    quiet (below-median) days, is the next day more likely to expand?
  const errNextHl = { xs: [], ys: [] };
  for (let k = 0; k < feats.length - 1; k++) if (feats[k + 1].i === feats[k].i + 1) { errNextHl.xs.push(feats[k].errP); errNextHl.ys.push(feats[k + 1].hlActual); }
  let quietRun = 0, afterQuietEx = 0, afterQuietN = 0;
  for (let k = 0; k < feats.length; k++) {
    if (quietRun >= 3) { afterQuietEx += feats[k].exMed; afterQuietN++; }
    quietRun = feats[k].exMed ? 0 : quietRun + 1;   // exMed=0 ⇒ below median ⇒ quiet
  }
  const baseExMed = _mean(feats.map(f => f.exMed)) * 100;
  const multiDay = {
    errorPredictsNextVolCorr: +_corr(errNextHl.xs, errNextHl.ys).toFixed(3),
    baseExceedMedianPct: +baseExMed.toFixed(1),
    afterThreeQuietExpandPct: afterQuietN ? +(afterQuietEx / afterQuietN * 100).toFixed(1) : null,
    afterThreeQuietN: afterQuietN,
  };

  // ── CONFIDENCE — does RECENT forecast accuracy predict FORWARD accuracy?
  //    Walk-forward: for each day, trailing mean |%err| over the previous 20 days
  //    (its own past only). Bin into terciles; a real confidence signal ⇒ the
  //    low-trailing-error tercile also has lower error TODAY. No lookahead.
  const CW = 20, trailing = [];
  for (let k = 0; k < feats.length; k++) {
    const hist = feats.slice(Math.max(0, k - CW), k).map(f => f.absErrP);
    trailing.push(hist.length >= 10 ? _mean(hist) : null);
  }
  const withTrail = feats.map((f, k) => ({ f, t: trailing[k] })).filter(x => x.t != null);
  const tsorted = withTrail.map(x => x.t).sort((a, b) => a - b);
  const tLo = tsorted[Math.floor(tsorted.length / 3)], tHi = tsorted[Math.floor(2 * tsorted.length / 3)];
  const confBin = (lab, sel) => { const g = withTrail.filter(sel); return { label: lab, n: g.length, fwdMae: +_mean(g.map(x => x.f.absErrP)).toFixed(1), fwdExceedMedianPct: +(_mean(g.map(x => x.f.exMed)) * 100).toFixed(1) }; };
  const confidence = {
    window: CW,
    terciles: [
      confBin('high (low recent error)', x => x.t <= tLo),
      confBin('mid', x => x.t > tLo && x.t < tHi),
      confBin('low (high recent error)', x => x.t >= tHi),
    ],
  };
  confidence.spreadMae = +((confidence.terciles[2].fwdMae ?? 0) - (confidence.terciles[0].fwdMae ?? 0)).toFixed(1);

  // ── DAY-TYPE clustering — group days into recurring "volatility day types" by
  //    [efficiency, completion(÷100, capped 3), log1p(vov·1e4)]. Deterministic
  //    k-means (k=4, quantile-seeded init, no RNG) so it's reproducible/testable.
  //    Descriptive, not predictive — a taxonomy of how days actually resolve.
  const dpts = feats.filter(f => f.eff != null && f.vov != null).map(f => ({
    f, x: [f.eff, Math.min(3, f.completion / 100), Math.log1p((f.vov || 0) * 1e4)],
  }));
  let dayTypes = { insufficient: true, n: dpts.length };
  if (dpts.length >= 80) {
    const D = 3, K = 4;
    const mean = Array(D).fill(0), sd = Array(D).fill(0);
    for (const p of dpts) for (let d = 0; d < D; d++) mean[d] += p.x[d]; for (let d = 0; d < D; d++) mean[d] /= dpts.length;
    for (const p of dpts) for (let d = 0; d < D; d++) sd[d] += (p.x[d] - mean[d]) ** 2; for (let d = 0; d < D; d++) sd[d] = Math.sqrt(sd[d] / dpts.length) || 1;
    const Z = dpts.map(p => p.x.map((v, d) => (v - mean[d]) / sd[d]));
    // Seed centroids at the 12.5/37.5/62.5/87.5 quantiles of the completion dim (index 1).
    const order = Z.map((z, idx) => [z[1], idx]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    let cent = [0.125, 0.375, 0.625, 0.875].map(q => Z[order[Math.floor(q * (order.length - 1))]].slice());
    const assign = new Array(Z.length).fill(0);
    for (let iter = 0; iter < 12; iter++) {
      for (let n2 = 0; n2 < Z.length; n2++) {
        let best = 0, bd = Infinity;
        for (let c = 0; c < K; c++) { let dist = 0; for (let d = 0; d < D; d++) dist += (Z[n2][d] - cent[c][d]) ** 2; if (dist < bd) { bd = dist; best = c; } }
        assign[n2] = best;
      }
      const sum = Array.from({ length: K }, () => Array(D).fill(0)), cnt = Array(K).fill(0);
      for (let n2 = 0; n2 < Z.length; n2++) { cnt[assign[n2]]++; for (let d = 0; d < D; d++) sum[assign[n2]][d] += Z[n2][d]; }
      for (let c = 0; c < K; c++) if (cnt[c]) for (let d = 0; d < D; d++) cent[c][d] = sum[c][d] / cnt[c];
    }
    const clusters = Array.from({ length: K }, () => []);
    dpts.forEach((p, idx) => clusters[assign[idx]].push(p.f));
    const label = (eff, compl) => compl >= 130 && eff >= 0.55 ? 'trend expansion'
      : compl >= 130 && eff < 0.45 ? 'wide reversal'
      : compl <= 70 && eff < 0.45 ? 'quiet chop'
      : compl <= 70 ? 'quiet directional' : 'normal';
    dayTypes = {
      n: dpts.length, k: K,
      clusters: clusters.map(g => {
        const eff = +_mean(g.map(f => f.eff)).toFixed(3), compl = +_mean(g.map(f => f.completion)).toFixed(0);
        return { n: g.length, sharePct: +(g.length / dpts.length * 100).toFixed(1), meanEfficiency: eff, meanCompletion: compl, meanVov: +_mean(g.map(f => f.vov)).toFixed(4), label: label(eff, compl) };
      }).sort((a, b) => b.meanCompletion - a.meanCompletion),
    };
  }

  // ── Auto-generated findings (the readable layer — not a hit dump) ───────────
  const findings = [];
  const add = (sev, text) => findings.push({ sev, text });
  const H = perComponent.daily?.hl;
  if (H) {
    const exM = H.exceedMedianPct;
    if (Math.abs(exM - 50) > 8)
      add('warn', `H-L forecast is ${exM < 50 ? 'HIGH-biased (median runs too wide)' : 'LOW-biased (median runs too tight)'}: realized exceeds the median ${exM}% of days vs a 50% target (bias ${H.bias >= 0 ? '+' : ''}${H.bias}%).`);
    else
      add('good', `H-L median is well-calibrated — realized exceeds it ${exM}% of days (target 50%).`);
    if (H.sharpnessCorr >= 0.4)
      add('good', `Forecast is INFORMATIVE: corr(forecast, realized H-L) = ${H.sharpnessCorr} — bigger forecasts genuinely precede bigger days.`);
    else if (H.sharpnessCorr < 0.15)
      add('warn', `Forecast may be FLAT: corr(forecast, realized H-L) = ${H.sharpnessCorr} — it barely separates big days from small ones.`);
    else
      add('info', `Forecast sharpness is moderate: corr(forecast, realized H-L) = ${H.sharpnessCorr}.`);
  }
  if (hlSkill > 0.05) add('good', `Beats climatology: skill = ${hlSkill} vs a trailing-mean benchmark.`);
  else if (hlSkill <= 0) add('warn', `No skill over climatology (skill = ${hlSkill}) — a trailing average forecasts the range about as well.`);
  const effTrend = +(_mean(effs.map(e => e >= 0.5 ? 1 : 0)) * 100).toFixed(1);
  add('info', `${effTrend}% of days are "efficient" (O-C ≥ ½ H-L, trend-like); mean efficiency ${+_mean(effs).toFixed(3)} — the fade-vs-follow split.`);
  if (dirHit != null)
    add(dirHit > 55 ? 'good' : 'info', `The forecast's O-H/O-L skew predicts the day's direction ${+dirHit.toFixed(1)}% of the time (vs 50% base rate).`);
  if (persistence.afterAbove75Pct - persistence.baseExceedMedianPct > 8)
    add('good', `Vol CLUSTERS: after an above-75th day the next day exceeds its median ${persistence.afterAbove75Pct}% vs ${persistence.baseExceedMedianPct}% base — expansion persists.`);
  if (completion.n)
    add('info', `Forecast completion: the day makes the FULL median range ${completion.reachedMedianPct}% of days, falls short of even half ${completion.neverHalfPct}% of days, and blows through 165% ${completion.blewThroughPct}% of days (median completion ${completion.medianPct}% of forecast).`);
  const vh = byVov['3·high'], vl = byVov['1·low'];
  if (vh && vl && vh.mae > vl.mae * 1.3)
    add('info', `Trust the forecast LESS when vol-of-vol is high: H-L MAE ${vh.mae} (high-VoV) vs ${vl.mae} (low-VoV).`);
  if (misses.overshoot?.n)
    add('info', `Big-miss days: the forecast most under-calls the range in ${misses.overshoot.topRegime} regimes; overshoot days run trend-like (efficiency ${misses.overshoot.meanEff} vs ${misses.all.meanEff} overall)${misses.overshoot.priorDayComplMean != null ? `, and tend to follow an already-large prior day (${misses.overshoot.priorDayComplMean}% completion)` : ''}.`);
  if (multiDay.afterThreeQuietExpandPct != null && multiDay.afterThreeQuietExpandPct - multiDay.baseExceedMedianPct > 6)
    add('good', `Mean-reversion of quiet: after 3+ below-median days, the next day exceeds its median ${multiDay.afterThreeQuietExpandPct}% vs ${multiDay.baseExceedMedianPct}% base — compressed ranges tend to expand.`);
  if (Math.abs(multiDay.errorPredictsNextVolCorr) >= 0.1)
    add('info', `Forecast errors carry information: corr(today's %error, tomorrow's realized range) = ${multiDay.errorPredictsNextVolCorr} — a big surprise today ${multiDay.errorPredictsNextVolCorr > 0 ? 'precedes a bigger' : 'precedes a smaller'} tomorrow.`);
  if (confidence.spreadMae > 0.05)
    add('good', `A confidence signal exists: days following LOW recent error have H-L MAE ${confidence.terciles[0].fwdMae} vs ${confidence.terciles[2].fwdMae} for days following high recent error — recent accuracy predicts forward accuracy.`);
  if (dayTypes.clusters?.length)
    add('info', `Days cluster into ${dayTypes.k} recurring types: ${dayTypes.clusters.map(c => `${c.label} (${c.sharePct}%)`).join(', ')}.`);

  return {
    nDays: rows.length,
    dateFrom: rows[0]?.date ?? null, dateTo: rows.at(-1)?.date ?? null,
    perComponent,
    dailyHlSkillVsClimatology: hlSkill,
    efficiencyMean: +_mean(effs).toFixed(3),
    efficiencyTrendPct: effTrend,
    fcSkewDirHitPct: dirHit == null ? null : +dirHit.toFixed(1),
    persistence,
    completion,
    errorDist,
    misses,
    seasonal,
    multiDay,
    confidence,
    dayTypes,
    regimeMatrix,
    byDow,
    byVov,
    byRegime: regimeMatrix.hl,   // back-compat: daily H-L by regime
    findings,
  };
}

export { COMPONENTS };
