/**
 * Band-Calc A/B — is the forecaster's range calc right, and is there a better one?
 *
 * The production band is Feller/driftless-BM: HL_median = BM_P50 × corr × σ, with
 * BM_P50 = 1.572 a fixed theoretical constant and `corr` a per-class fudge. Price
 * reacts to the lines daily, but the page's bands read WIDE (exceed-median ~34% vs
 * a 50% target). This asks whether a different calc is naturally better calibrated.
 *
 * For each candidate calc it walks FORWARD (no lookahead): forecast the day's
 * median & 75th H-L from data < i, then score against the realized H-L:
 *   • calibration — exceed-median% (target 50), exceed-75% (target 25); the honest
 *     "are the bands the right width" test, OUT OF THE BOX (no fudge).
 *   • sharpness — corr(forecast median, realized H-L): does a bigger forecast
 *     precede a bigger day (a well-calibrated but flat band is useless).
 *   • MAE, bias.
 * Best calc = smallest calibration miss with competitive sharpness.
 *
 * Pure, synthetic-testable. Reuses the σ estimators + BM constants (never copies).
 */
import { ewmaVarSeries, hvVarSeries, yzVolSeries, BM_P50, BM_P75, ASSET_PARAMS } from './volBacktestEngine.js';

const _mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const _median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const _pctile = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const i = p / 100 * (s.length - 1); const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const _corr = (xs, ys) => { const n = xs.length; if (n < 3) return 0; const mx = _mean(xs), my = _mean(ys); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; } return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0; };
const _logReturns = closes => { const r = []; for (let i = 1; i < closes.length; i++) r.push(Math.log(closes[i] / closes[i - 1])); return r; };

// Causal daily σ (%) series aligned so σPct[i] predicts day i using data < i.
// Var/vol series are computed on the FULL history (causal by construction — each
// value uses only prior returns); we then shift by one so day i never sees itself.
function _sigmaPctSeries(bars, method) {
  const closes = bars.map(b => b.close);
  const lr = _logReturns(closes);
  let sig;   // per-return σ (fraction), length = lr.length
  if (method === 'yz') { const v = yzVolSeries(bars); sig = v.map(x => x); }        // already σ
  else if (method === 'hv20') sig = hvVarSeries(lr, 20).map(x => Math.sqrt(Math.max(x, 1e-12)));
  else if (method === 'ewma094') sig = ewmaVarSeries(lr, 0.94).map(x => Math.sqrt(Math.max(x, 1e-12)));
  else if (method === 'ewma090') sig = ewmaVarSeries(lr, 0.90).map(x => Math.sqrt(Math.max(x, 1e-12)));
  else throw new Error(`unknown σ method ${method}`);
  // Map to per-BAR index (bars length): σ for day i = last σ using returns < i.
  const out = new Array(bars.length).fill(null);
  for (let i = 1; i < bars.length; i++) { const idx = Math.min(sig.length - 1, i - 1); out[i] = sig[idx] != null ? sig[idx] * 100 : null; }
  return out;
}

// Candidate calcs. Each returns { med, p75 } in % of price for day i, from data < i.
// ctx: { realizedHL, sigYZ, sigHV20, sigEWMA, corr50, corr75, win }.
const CALCS = {
  page_approx: { label: 'Current page (Feller×corr, YZ σ)', fn: (i, c) => c.sigYZ[i] == null ? null : ({ med: BM_P50 * c.corr50 * c.sigYZ[i], p75: BM_P75 * c.corr75 * c.sigYZ[i] }) },
  feller_yz:   { label: 'Feller, YZ σ (no fudge)',          fn: (i, c) => c.sigYZ[i] == null ? null : ({ med: BM_P50 * c.sigYZ[i], p75: BM_P75 * c.sigYZ[i] }) },
  feller_hv20: { label: 'Feller, HV20 σ (no fudge)',        fn: (i, c) => c.sigHV20[i] == null ? null : ({ med: BM_P50 * c.sigHV20[i], p75: BM_P75 * c.sigHV20[i] }) },
  feller_ewma: { label: 'Feller, EWMA0.94 σ (no fudge)',    fn: (i, c) => c.sigEWMA[i] == null ? null : ({ med: BM_P50 * c.sigEWMA[i], p75: BM_P75 * c.sigEWMA[i] }) },
  climatology: { label: 'Climatology (trailing HL quantiles)', fn: (i, c) => { const w = c.realizedHL.slice(Math.max(0, i - c.win), i).filter(v => v != null); if (w.length < 20) return null; return { med: _median(w), p75: _pctile(w, 75) }; } },
  ratio_yz:    { label: 'Empirical ratio × YZ σ (self-scaling)', fn: (i, c) => { if (c.sigYZ[i] == null) return null; const rows = []; for (let j = Math.max(1, i - c.win); j < i; j++) if (c.realizedHL[j] != null && c.sigYZ[j] > 0) rows.push(c.realizedHL[j] / c.sigYZ[j]); if (rows.length < 20) return null; return { med: c.sigYZ[i] * _median(rows), p75: c.sigYZ[i] * _pctile(rows, 75) }; } },
};

// bars: daily OHLC (London-anchored recommended), oldest→newest, { open, high, low, close }.
export function bandCalcAB(bars, assetClass = 'fx', opts = {}) {
  const { minLookback = 120, win = 120, keys = Object.keys(CALCS) } = opts;
  if (!bars || bars.length < minLookback + 40) return { insufficient: true, nDays: bars?.length ?? 0 };
  const realizedHL = bars.map(b => (b.open > 0 ? (b.high - b.low) / b.open * 100 : null));
  const p = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;
  const ctx = {
    realizedHL, win,
    sigYZ: _sigmaPctSeries(bars, 'yz'), sigHV20: _sigmaPctSeries(bars, 'hv20'), sigEWMA: _sigmaPctSeries(bars, 'ewma094'),
    corr50: p.hl_50_corr ?? 1, corr75: p.hl_75_corr ?? 1,
  };
  const results = keys.filter(k => CALCS[k]).map(key => {
    const medF = [], actF = [], exMed = [], ex75 = [], absErr = [];
    for (let i = minLookback; i < bars.length; i++) {
      const act = realizedHL[i]; if (act == null) continue;
      let f; try { f = CALCS[key].fn(i, ctx); } catch { f = null; }
      if (!f || !(f.med > 0)) continue;
      medF.push(f.med); actF.push(act);
      exMed.push(act > f.med ? 1 : 0); ex75.push(act > f.p75 ? 1 : 0); absErr.push(Math.abs(act - f.med));
    }
    const n = medF.length;
    const exceedMedianPct = n ? +(_mean(exMed) * 100).toFixed(1) : null;
    const exceed75Pct = n ? +(_mean(ex75) * 100).toFixed(1) : null;
    const sharpness = n ? +_corr(medF, actF).toFixed(3) : null;
    const mae = n ? +_mean(absErr).toFixed(4) : null;
    const bias = n ? +(_mean(actF) - _mean(medF)).toFixed(4) : null;   // +ve ⇒ realized > forecast (too tight)
    const calibMiss = (exceedMedianPct != null && exceed75Pct != null) ? +(Math.abs(exceedMedianPct - 50) + Math.abs(exceed75Pct - 25)).toFixed(1) : null;
    return { key, label: CALCS[key].label, n, exceedMedianPct, exceed75Pct, sharpness, mae, bias, calibMiss };
  }).filter(r => r.n > 0);
  // Rank: best calibration first, then higher sharpness as a tiebreak.
  const ranked = [...results].sort((a, b) => (a.calibMiss - b.calibMiss) || (b.sharpness - a.sharpness));
  return { nDays: bars.length, assetClass, ranked, results };
}

export { CALCS };
