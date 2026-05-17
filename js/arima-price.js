// ARIMA(1,1,1) on price closes — regime stability via residual predictability
//
// Core insight: when the market is in a clear, stable regime the ARIMA model
// can explain most price movement — residuals are small and consistent.
// When a regime is breaking down, price does things the model can't predict —
// residuals spike or become erratic. That divergence IS the transition signal.
//
// residualStability (0–1) feeds directly into computeRegimeConfidence():
//   0.85+ — residuals normal, regime behaving as expected
//   0.65   — residuals slightly elevated, some uncertainty
//   0.45   — residuals well above norm, possible regime shift
//   0.25   — residuals very erratic, regime likely transitioning

import { getPipSize } from './utils.js';

/**
 * Fit ARIMA(1,1,1) on daily close prices.
 *
 * @param {Array} bars  Newest-first OHLC bar array (from S.ohlcData).
 * @returns {object|null}
 */
export function fitArimaPrice(bars) {
  if (!bars || bars.length < 30) return null;

  const barsChron = [...bars].reverse();
  const closes    = barsChron.map(b => parseFloat(b.close));

  // d=1: first difference → stationarity
  const diff = [];
  for (let i = 1; i < closes.length; i++) diff.push(closes[i] - closes[i - 1]);
  if (diff.length < 20) return null;

  const mu       = diff.reduce((a, b) => a + b, 0) / diff.length;
  const demeaned = diff.map(d => d - mu);

  // AR(1) via OLS on demeaned differences
  let num = 0, den = 0;
  for (let i = 1; i < demeaned.length; i++) {
    num += demeaned[i] * demeaned[i - 1];
    den += demeaned[i - 1] ** 2;
  }
  const phi = den > 0 ? Math.max(-0.95, Math.min(0.95, num / den)) : 0;

  // MA(1) residuals
  const residuals = [demeaned[0]];
  for (let i = 1; i < demeaned.length; i++) {
    residuals.push(demeaned[i] - phi * demeaned[i - 1]);
  }

  let rNum = 0, rDen = 0;
  for (let i = 1; i < residuals.length; i++) {
    rNum += residuals[i] * residuals[i - 1];
    rDen += residuals[i - 1] ** 2;
  }
  const theta   = rDen > 0 ? Math.max(-0.95, Math.min(0.95, rNum / rDen)) : 0;
  const resSigma = Math.sqrt(residuals.reduce((a, r) => a + r ** 2, 0) / residuals.length);

  // Historical baseline: 60-bar rolling RMS
  const histWindow = Math.min(60, residuals.length);
  const histSlice  = residuals.slice(-histWindow);
  const histSigma  = Math.sqrt(histSlice.reduce((a, r) => a + r ** 2, 0) / histWindow);

  // Recent residuals (last 5 bars) vs historical norm
  const recentSlice = residuals.slice(-5);
  const recentRMS   = Math.sqrt(recentSlice.reduce((a, r) => a + r ** 2, 0) / recentSlice.length);
  const ratio       = histSigma > 0 ? recentRMS / histSigma : 1.0;

  // Map ratio → stability score
  // ratio >2.0: price doing things model can't explain at all
  // ratio 0.5–0.6: suspiciously quiet (low-vol persistence risk)
  // ratio ~1.0: normal, regime stable
  const residualStability =
    ratio > 2.0  ? 0.20 :
    ratio > 1.5  ? 0.45 :
    ratio > 1.2  ? 0.65 :
    ratio > 0.8  ? 0.85 :
    ratio > 0.5  ? 0.75 :   // suspiciously quiet — danger of shock
                   0.60;

  // 1-step-ahead forecast
  const lastDiff  = demeaned[demeaned.length - 1];
  const lastResid = residuals[residuals.length - 1];
  const forecastDiff  = mu + phi * lastDiff + theta * lastResid;
  const lastClose     = closes[closes.length - 1];
  const forecastPrice = lastClose + forecastDiff;

  // How far is the current price from the 1-step forecast (z-score)?
  // Positive = price ran ahead of model (potential mean-reversion)
  const fairValueDev = resSigma > 0 ? forecastDiff / resSigma : 0;

  return {
    phi:               parseFloat(phi.toFixed(3)),
    theta:             parseFloat(theta.toFixed(3)),
    mu,
    resSigma,
    residualRatio:     parseFloat(ratio.toFixed(2)),
    residualStability: parseFloat(residualStability.toFixed(2)),
    forecastDiff,
    forecastPrice:     parseFloat(forecastPrice.toFixed(5)),
    forecastCI68:      resSigma,
    fairValueDev:      parseFloat(fairValueDev.toFixed(2)),
    lastClose,
  };
}

/**
 * High-level ARIMA context — pips-denominated outputs for dashboard and alerts.
 *
 * @param {Array}  bars      Newest-first daily OHLC bars.
 * @param {string} sym       Pair symbol for pip size lookup.
 * @returns {object|null}
 */
export function computeArimaContext(bars, sym) {
  const result = fitArimaPrice(bars);
  if (!result) return null;

  const pip          = getPipSize(sym);
  const forecastPips = parseFloat((result.forecastDiff / pip).toFixed(1));
  const ci68Pips     = parseFloat((result.resSigma     / pip).toFixed(1));

  return {
    ...result,
    forecastPips,
    ci68Pips,
    narrative: _buildNarrative(result),
  };
}

function _buildNarrative(r) {
  const parts = [];
  if      (r.residualRatio > 1.5) parts.push(`Residuals ${(r.residualRatio * 100).toFixed(0)}% above norm — price unpredictable`);
  else if (r.residualRatio < 0.6) parts.push('Very quiet residuals — low-vol shock risk');
  else                             parts.push('Residuals within normal range — regime stable');

  if (Math.abs(r.fairValueDev) > 1.5) {
    const dir = r.fairValueDev > 0 ? 'above' : 'below';
    parts.push(`Price ${Math.abs(r.fairValueDev).toFixed(1)}σ ${dir} ARIMA fair value — mean reversion bias`);
  }

  return parts.join('; ');
}
