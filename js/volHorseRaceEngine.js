/**
 * Vol Horse Race — the gold workbook's estimator comparison, generalised to
 * EVERY instrument. Does HAR-RV's win on gold hold for FX and indices, or does
 * the ranking flip? Scores 8 σ-forecasters against the SAME target — next-day
 * DAILY realised volatility (√Σ intraday r², a daily % move) — pooled OOS, the
 * way the workbook does: whole-sample scores, never a median.
 *
 * MODELS (each a causal forecast of day i's realised vol from data < i):
 *   • RW           — yesterday's realised vol (the naïve floor everything must beat)
 *   • EWMA         — RiskMetrics λ=0.94 on squared daily returns
 *   • HV           — rolling close-to-close variance (the platform's commodity σ)
 *   • Yang-Zhang   — range-based OHLC estimator, 30-day (the platform's FX σ)
 *   • GARCH        — GARCH(1,1) (the platform's index σ)
 *   • HAR-RV       — heterogeneous-AR on daily/weekly/monthly realised var (the workhorse)
 *   • Combo-5050   — fixed ½ HAR + ½ GARCH
 *   • Combo-optimal— Granger-Ramanathan learned weights (rolling regress realised
 *                    vol on HAR & GARCH forecasts, past data only — always OOS)
 *
 * SCORES (all whole-sample, over OOS days where every model + target exist):
 *   • QLIKE   — variance loss log(f²)+y²/f², penalises under-forecasting vol; RANK ON THIS
 *   • MSE_var — mean sq error of VARIANCE   • RMSE_vol — RMS error in vol points
 *   • MZ R²/slope — regress realised on forecast (slope 1 = unbiased)
 *   • corr, mean_forecast, mean_realised
 *
 * Reuses buildLondonDaily/realizedSigmaSeries/harSigmaSeries (volEstimatorAB),
 * yzVolSeries/garchSigmas/ewmaVarSeries/hvVarSeries (volBacktestEngine). No new
 * vol math — same σ bricks the forecaster and backtests already use.
 */
import { buildLondonDaily, realizedSigmaSeries, harSigmaSeries } from './volEstimatorAB.js';
import { yzVolSeries, garchSigmas, ewmaVarSeries, hvVarSeries } from './volBacktestEngine.js';

export const HR_MODELS = ['HAR-RV', 'Combo-optimal', 'Combo-5050', 'RW', 'EWMA', 'Yang-Zhang', 'GARCH', 'HV'];
// which model IS the platform's current σ for this asset class (for the "did we
// pick the best?" read). fx→YZ, index→GARCH, commodity→HV.
export const PLATFORM_MODEL = { fx: 'Yang-Zhang', index: 'GARCH', commodity: 'HV', gold: 'HV' };

const _mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const r = (x, d = 4) => x == null || !isFinite(x) ? null : +x.toFixed(d);

// 3×3 Gaussian solve (Granger-Ramanathan normal equations) — null if singular.
function _solve3(A, y) {
  const M = A.map((row, i) => [...row, y[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c; for (let rI = c + 1; rI < 3; rI++) if (Math.abs(M[rI][c]) > Math.abs(M[p][c])) p = rI;
    if (Math.abs(M[p][c]) < 1e-14) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let rI = 0; rI < 3; rI++) { if (rI === c) continue; const f = M[rI][c] / M[c][c]; for (let k = c; k <= 3; k++) M[rI][k] -= f * M[c][k]; }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}

// Mincer-Zarnowitz: regress y on f → { slope, r2 }. slope 1 = unbiased.
function _mz(f, y) {
  const n = f.length; if (n < 3) return { slope: null, r2: null };
  const mf = _mean(f), my = _mean(y);
  let sff = 0, sfy = 0, syy = 0;
  for (let i = 0; i < n; i++) { const df = f[i] - mf, dy = y[i] - my; sff += df * df; sfy += df * dy; syy += dy * dy; }
  if (!(sff > 0) || !(syy > 0)) return { slope: null, r2: null };
  const slope = sfy / sff;
  const r2 = (sfy * sfy) / (sff * syy);   // == corr² for a simple regression
  return { slope, r2 };
}

/**
 * @param intraday packed/plain M1 (or intraday) bars {time,open,high,low,close}
 * @param assetClass 'fx' | 'index' | 'commodity' | 'gold'
 * @param opts { minLookback=90 }
 */
export function volHorseRace(intraday, assetClass = 'fx', opts = {}) {
  const { minLookback = 90 } = opts;
  const daily = buildLondonDaily(intraday);
  if (daily.length < minLookback + 60) return { insufficient: true, nDays: daily.length };

  const n = daily.length;
  const sigRV = realizedSigmaSeries(daily);                    // TARGET: realised vol per day
  const d1 = daily.map(d => ({ open: d.open, high: d.high, low: d.low, close: d.close }));
  const closes = d1.map(d => d.close);
  const lr = new Array(n).fill(0);
  for (let i = 1; i < n; i++) if (closes[i] > 0 && closes[i - 1] > 0) lr[i] = Math.log(closes[i] / closes[i - 1]);

  // ── causal forecast series: f[i] predicts day i's realised vol from data < i ──
  const yzSig = yzVolSeries(d1, 30);                           // out[i] uses ≤ i → shift by 1
  const garchSig = garchSigmas(d1, 4.76e-6);                   // out[i] already predicts i
  const ewmaV = ewmaVarSeries(lr, 0.94);                       // out[i] uses ≤ i → shift
  const hvV = hvVarSeries(lr, 20);
  const harSig = harSigmaSeries(sigRV);                        // out[i] predicts i from < i

  const f = { 'HAR-RV': [], 'Combo-optimal': [], 'Combo-5050': [], RW: [], EWMA: [], 'Yang-Zhang': [], GARCH: [], HV: [] };
  const fHAR = new Array(n).fill(null), fGARCH = new Array(n).fill(null);
  const per = new Array(n).fill(null);                         // per-day forecast bundle for combos
  for (let i = 1; i < n; i++) {
    const rw = sigRV[i - 1], ew = ewmaV[i - 1] > 0 ? Math.sqrt(ewmaV[i - 1]) : null,
      hv = hvV[i - 1] > 0 ? Math.sqrt(hvV[i - 1]) : null, yz = yzSig[i - 1] > 0 ? yzSig[i - 1] : null,
      ga = garchSig[i] > 0 ? garchSig[i] : null, ha = harSig[i] > 0 ? harSig[i] : null;
    fHAR[i] = ha; fGARCH[i] = ga;
    per[i] = { rw, ew, hv, yz, ga, ha, y: sigRV[i] };
  }

  // Combo-optimal: rolling Granger-Ramanathan on [1, HAR, GARCH] using days < i.
  const comboOpt = new Array(n).fill(null);
  {
    let A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0], trained = 0;
    for (let i = 0; i < n; i++) {
      const p = per[i];
      if (p && p.ha > 0 && p.ga > 0 && trained >= 60) {
        const beta = _solve3(A.map(row => [...row]), [...b]);
        if (beta) { const pred = beta[0] + beta[1] * p.ha + beta[2] * p.ga; if (pred > 0) comboOpt[i] = pred; }
      }
      if (p && p.ha > 0 && p.ga > 0 && p.y > 0) {              // fold (features_i, y_i) in AFTER predicting
        const x = [1, p.ha, p.ga];
        for (let aI = 0; aI < 3; aI++) { b[aI] += x[aI] * p.y; for (let bI = 0; bI < 3; bI++) A[aI][bI] += x[aI] * x[bI]; }
        trained++;
      }
    }
  }

  // ── score every model on the SAME OOS days (all forecasts + target present) ──
  const acc = {}; for (const m of HR_MODELS) acc[m] = { f: [], y: [] };
  for (let i = minLookback; i < n; i++) {
    const p = per[i]; if (!p || !(p.y > 0)) continue;
    const c50 = (p.ha > 0 && p.ga > 0) ? 0.5 * p.ha + 0.5 * p.ga : null;
    const row = { 'HAR-RV': p.ha, 'Combo-optimal': comboOpt[i], 'Combo-5050': c50, RW: p.rw, EWMA: p.ew, 'Yang-Zhang': p.yz, GARCH: p.ga, HV: p.hv };
    // require ALL models present so scores are on an identical day set (fair race)
    if (HR_MODELS.some(m => !(row[m] > 0))) continue;
    for (const m of HR_MODELS) { acc[m].f.push(row[m]); acc[m].y.push(p.y); }
  }

  const nScored = acc['HAR-RV'].f.length;
  if (nScored < 40) return { insufficient: true, nDays: n, nScored };

  const scores = {};
  for (const m of HR_MODELS) {
    const F = acc[m].f, Y = acc[m].y, N = F.length;
    let qlike = 0, mseVar = 0, sse = 0;
    for (let i = 0; i < N; i++) {
      const f2 = F[i] * F[i], y2 = Y[i] * Y[i];
      qlike += Math.log(f2) + y2 / f2;
      mseVar += (f2 - y2) ** 2;
      sse += (F[i] - Y[i]) ** 2;
    }
    const { slope, r2 } = _mz(F, Y);
    scores[m] = {
      n: N,
      qlike: r(qlike / N, 4),
      mseVar: r(mseVar / N * 1e6, 4),                          // ×1e6: raw variance² is ~1e-9
      rmseVol: r(Math.sqrt(sse / N) * 100, 4),                 // vol POINTS (%), matches workbook
      mzR2: r(r2, 4), mzSlope: r(slope, 4),
      corr: r(Math.sqrt(Math.max(r2, 0)) * Math.sign(slope ?? 1), 4),
      meanForecast: r(_mean(F) * 100, 4), meanRealised: r(_mean(Y) * 100, 4),
    };
  }

  // rank by QLIKE (lower = better)
  const ranked = [...HR_MODELS].sort((a, b) => scores[a].qlike - scores[b].qlike);
  const winner = ranked[0];
  const platform = PLATFORM_MODEL[assetClass] || 'Yang-Zhang';
  const harRank = ranked.indexOf('HAR-RV') + 1;
  const platRank = ranked.indexOf(platform) + 1;
  const harBeatsPlatform = scores['HAR-RV'].qlike < scores[platform].qlike;

  return {
    assetClass, nDays: n, nScored, models: HR_MODELS, scores, ranked, winner,
    platform, harRank, platformRank: platRank, harBeatsPlatform,
    // QLIKE improvement of HAR vs the platform's own estimator (>0 ⇒ HAR better)
    harVsPlatformQlike: r(scores[platform].qlike - scores['HAR-RV'].qlike, 4),
  };
}
