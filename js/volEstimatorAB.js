/**
 * Volatility-Estimator A/B — old (Yang-Zhang on daily OHLC) vs new (5-min
 * Realized Variance → HAR-RV forecast), scored day-by-day on the SAME bands.
 *
 * The question: is a realized-variance + HAR-RV vol input a more accurate daily
 * forecast than the current Yang-Zhang estimator? We isolate the σ input — both
 * methods feed the identical band math (BM/HN range constants × asset correction
 * × σ) — so any difference is the estimator, not the geometry. If New beats Old
 * out-of-sample, it's a drop-in swap for the σ series that feeds computeBands.
 *
 * EVERYTHING is anchored at LONDON MIDNIGHT (00:00 Europe/London), matching the
 * live engine's day definition — not UTC and not OANDA's 22:00-UTC D1. The daily
 * bars are rebuilt from intraday grouped by London calendar date (_londonParts),
 * and realized variance is summed within each London day. This makes the A/B
 * both fair and directly swappable into the engine.
 *
 * No lookahead anywhere: the forecast for London-day i uses only data < i
 *   • YZ:  yzVolSeries[i-1]  (rolling window over prior bars)
 *   • HAR: OLS coefficients accumulated from days < i, features from RV < i
 * Metrics: MAE/bias/exceedance-calibration/sharpness + pinball loss (a proper
 * quantile score) at the 50th & 75th; plus a PAIRED day-by-day win-rate and
 * pinball skill (New vs Old on the very same days).
 *
 * Pure + synthetic-testable. Intraday bars in, A/B aggregates out.
 */

import { yzVolSeries, BM_P50, BM_P75, HN_P50, HN_P75, ASSET_PARAMS } from './volBacktestEngine.js';
import { _londonParts } from './sessionStats.js';

function _toDate(t) {
  if (t instanceof Date) return t;
  if (typeof t === 'number') return new Date(t < 1e12 ? t * 1000 : t);
  return new Date(String(t).replace(' ', 'T').replace(/Z?$/, 'Z'));
}

// ── London-midnight daily OHLC from intraday bars ─────────────────────────────
// Groups by London calendar date (= London-midnight day boundary), so the "day"
// matches the live engine, not OANDA's 22:00-UTC D1.
export function buildLondonDaily(intraday, { minBarsPerDay = 6 } = {}) {
  const byDate = new Map();
  for (const b of intraday) {
    const d = _toDate(b.time);
    const { date } = _londonParts(d);
    const rec = byDate.get(date);
    const bar = { open: b.open, high: b.high, low: b.low, close: b.close, _t: d.getTime() };
    if (!rec) byDate.set(date, [bar]); else rec.push(bar);
  }
  const out = [];
  for (const [date, bars] of byDate) {
    if (bars.length < minBarsPerDay) continue;
    bars.sort((a, b) => a._t - b._t);
    out.push({
      date,
      open:  bars[0].open,
      high:  Math.max(...bars.map(x => x.high)),
      low:   Math.min(...bars.map(x => x.low)),
      close: bars.at(-1).close,
      bars,                        // kept for the RV pass, stripped before return
    });
  }
  out.sort((a, b) => a.date < b.date ? -1 : 1);
  return out;
}

// Realized variance per London day = Σ (intraday log return)² within the day
// (excludes the cross-day gap). Input is whatever intraday granularity is given;
// finer (5-min) → more accurate. Returns σ (= √RV), a daily-return fraction —
// same units as the YZ σ, so both feed the bands identically.
export function realizedSigmaSeries(londonDaily) {
  return londonDaily.map(day => {
    const b = day.bars;
    let rv = 0, n = 0;
    for (let k = 1; k < b.length; k++) {
      if (b[k - 1].close > 0 && b[k].close > 0) { const r = Math.log(b[k].close / b[k - 1].close); rv += r * r; n++; }
    }
    return n >= 3 ? Math.sqrt(rv) : null;
  });
}

// ── Small dense linear solver (Gaussian elimination, partial pivot) ───────────
function _solve(A, y) {
  const n = y.length;
  const M = A.map((row, i) => [...row, y[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((row, i) => row[n] / row[i]);
}

// ── Walk-forward HAR-RV: predict RV_i from daily/weekly/monthly avg RV < i ─────
// Uses variance (RV = σ²) as the HAR target (the standard). Coefficients are fit
// by expanding-window OLS accumulated ONLY from days strictly before i (a training
// pair (features_t, RV_t) is added after day t completes), so predicting day i
// never sees its own outcome. Returns a σ (=√predicted-RV) series aligned to days.
export function harSigmaSeries(sigmaRV, { minTrain = 60 } = {}) {
  const n = sigmaRV.length;
  // Daily variance is tiny (~σ²≈3e-5); scale to O(1) so the [1, RV_d, RV_w, RV_m]
  // design matrix is well-conditioned (intercept vs RV columns otherwise differ
  // by ~1e4 and the normal-equations solve goes singular). Linear, so unscale by
  // the same factor after predicting.
  const SCALE = 1e4;
  const rv = sigmaRV.map(s => s == null ? null : s * s * SCALE);
  const feat = i => {                                         // [1, RV_d, RV_w, RV_m], all < i
    if (i < 22 || rv[i - 1] == null) return null;
    const avg = (a, b) => { let s = 0, c = 0; for (let k = a; k < b; k++) if (rv[k] != null) { s += rv[k]; c++; } return c ? s / c : null; };
    const d = rv[i - 1], w = avg(i - 5, i), m = avg(i - 22, i);
    return (d != null && w != null && m != null) ? [1, d, w, m] : null;
  };

  // Accumulators for X'X (4×4) and X'y (4).
  const XtX = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]], Xty = [0,0,0,0];
  // HAR's daily/weekly/monthly RV columns are strongly collinear, so X'X is
  // near-singular → a RELATIVE Tikhonov ridge (λ × the column's own scale)
  // regularises it without materially biasing the fit.
  const RIDGE = 1e-3;
  let trained = 0;
  const out = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const f = feat(i);
    if (f && trained >= minTrain) {
      const A = XtX.map((r, k) => r.map((v, j) => v + (k === j ? RIDGE * (XtX[k][k] + 1e-9) : 0)));
      const beta = _solve(A, [...Xty]);
      if (beta) { const pred = f[0]*beta[0] + f[1]*beta[1] + f[2]*beta[2] + f[3]*beta[3]; if (pred > 0) out[i] = Math.sqrt(pred / SCALE); }
    }
    // After predicting i, fold the (features_i, RV_i) training pair into the
    // accumulators for FUTURE days (target RV_i only known once day i completes).
    if (f && rv[i] != null) {
      for (let a = 0; a < 4; a++) { Xty[a] += f[a] * rv[i]; for (let b = 0; b < 4; b++) XtX[a][b] += f[a] * f[b]; }
      trained++;
    }
  }
  return out;
}

// ── Bands from a σ, holding the geometry constant across both estimators ──────
function bands(sigma, p) {
  return {
    hlMed: BM_P50 * p.hl_50_corr * sigma * 100,
    hl75:  BM_P75 * p.hl_75_corr * sigma * 100,
    ocMed: HN_P50 * p.oc_corr    * sigma * 100,
    oc75:  HN_P75 * p.oc_75_corr * sigma * 100,
  };
}
// Pinball (quantile) loss — a proper scoring rule for the q-quantile forecast f.
const pinball = (y, f, q) => (y >= f ? q * (y - f) : (q - 1) * (y - f));

// ── The A/B ───────────────────────────────────────────────────────────────────
export function evaluateEstimatorAB(intraday, assetClass = 'fx', opts = {}) {
  const { minLookback = 60 } = opts;
  const daily = buildLondonDaily(intraday);
  if (daily.length < minLookback + 40) return { insufficient: true, nDays: daily.length };
  const p = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;

  const sigRV  = realizedSigmaSeries(daily);
  const sigHAR = harSigmaSeries(sigRV);
  const d1     = daily.map(d => ({ open: d.open, high: d.high, low: d.low, close: d.close }));
  const sigYZ  = yzVolSeries(d1, 30);   // rolling YZ; sigYZ[i-1] predicts day i (causal)

  // Accumulators per method for H-L (headline) and O-C.
  const mk = () => ({ n: 0, absHL: 0, errHL: 0, exMedHL: 0, ex75HL: 0, pin50: 0, pin75: 0, fHL: [], yHL: [], absOC: 0 });
  const M = { yz: mk(), har: mk() };
  let paired = 0, harWinsHL = 0, pinYZ = 0, pinHAR = 0;

  for (let i = minLookback; i < daily.length; i++) {
    const o = daily[i].open; if (!(o > 0)) continue;
    const realHL = (daily[i].high - daily[i].low) / o * 100;
    const realOC = Math.abs(daily[i].close - o) / o * 100;

    const sYZ  = sigYZ[i - 1];               // YZ as of prior close → predicts i
    const sHAR = sigHAR[i];                   // HAR prediction for i (from data < i)
    const rows = [];
    if (sYZ  > 0) rows.push(['yz',  bands(sYZ, p)]);
    if (sHAR > 0) rows.push(['har', bands(sHAR, p)]);

    for (const [k, b] of rows) {
      const m = M[k];
      m.n++;
      m.absHL += Math.abs(realHL - b.hlMed); m.errHL += realHL - b.hlMed;
      m.exMedHL += realHL > b.hlMed ? 1 : 0;  m.ex75HL += realHL > b.hl75 ? 1 : 0;
      m.pin50 += pinball(realHL, b.hlMed, 0.5); m.pin75 += pinball(realHL, b.hl75, 0.75);
      m.fHL.push(b.hlMed); m.yHL.push(realHL);
      m.absOC += Math.abs(realOC - b.ocMed);
    }
    // Paired comparison — only on days BOTH produced a forecast.
    if (sYZ > 0 && sHAR > 0) {
      paired++;
      const bYZ = bands(sYZ, p), bHAR = bands(sHAR, p);
      if (Math.abs(realHL - bHAR.hlMed) < Math.abs(realHL - bYZ.hlMed)) harWinsHL++;
      pinYZ  += pinball(realHL, bYZ.hlMed, 0.5)  + pinball(realHL, bYZ.hl75, 0.75);
      pinHAR += pinball(realHL, bHAR.hlMed, 0.5) + pinball(realHL, bHAR.hl75, 0.75);
    }
  }

  const _corr = (xs, ys) => {
    const n = xs.length; if (n < 2) return 0;
    const mx = xs.reduce((s,v)=>s+v,0)/n, my = ys.reduce((s,v)=>s+v,0)/n;
    let sxy=0,sxx=0,syy=0; for (let i=0;i<n;i++){const dx=xs[i]-mx,dy=ys[i]-my;sxy+=dx*dy;sxx+=dx*dx;syy+=dy*dy;}
    return sxx>0&&syy>0 ? +(sxy/Math.sqrt(sxx*syy)).toFixed(3) : 0;
  };
  const stat = m => m.n ? {
    n: m.n,
    maeHL:  +(m.absHL / m.n).toFixed(4),
    biasHL: +(m.errHL / m.n).toFixed(4),
    exceedMedianPct: +(m.exMedHL / m.n * 100).toFixed(1),
    exceed75Pct:     +(m.ex75HL  / m.n * 100).toFixed(1),
    sharpness: _corr(m.fHL, m.yHL),
    pinball:  +((m.pin50 + m.pin75) / m.n).toFixed(4),
    maeOC:    +(m.absOC / m.n).toFixed(4),
  } : null;

  const yz = stat(M.yz), har = stat(M.har);
  const winRate = paired ? +(harWinsHL / paired * 100).toFixed(1) : null;
  const pinSkill = pinYZ > 0 ? +(1 - pinHAR / pinYZ).toFixed(3) : 0;   // >0 ⇒ HAR better

  // ── Verdict findings ────────────────────────────────────────────────────────
  const findings = [];
  const add = (sev, text) => findings.push({ sev, text });
  if (yz && har) {
    add('info', `Anchored at London midnight · ${daily.length} days. Both estimators feed the identical band geometry — the difference is the σ input only.`);
    const better = pinSkill > 0.02;
    add(better ? 'good' : pinSkill < -0.02 ? 'warn' : 'info',
      `Proper-score verdict: RV+HAR ${better ? 'BEATS' : pinSkill < -0.02 ? 'LOSES TO' : 'ties'} Yang-Zhang — pinball skill ${pinSkill} (paired win-rate ${winRate}% of days).`);
    add('info', `Calibration (median-exceed, target 50%): YZ ${yz.exceedMedianPct}% vs HAR ${har.exceedMedianPct}%. Sharpness: YZ ${yz.sharpness} vs HAR ${har.sharpness}.`);
    if (har.sharpness > yz.sharpness + 0.03) add('good', `RV+HAR is more informative (sharpness ${har.sharpness} vs ${yz.sharpness}) — it tracks big-vs-small days better, likely from faster reaction to vol spikes.`);
  } else {
    add('warn', `Could not run both estimators (YZ n=${M.yz.n}, HAR n=${M.har.n}) — insufficient intraday history for RV.`);
  }

  return {
    nDays: daily.length, dateFrom: daily[0].date, dateTo: daily.at(-1).date,
    anchor: 'london-midnight',
    yz, har, paired, winRateHAR: winRate, pinballSkill: pinSkill, findings,
  };
}
