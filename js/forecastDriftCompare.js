/**
 * Forecast drift comparator — measures the gap between the TWO forecasters the desk runs:
 *
 *   • PLAN forecaster  — `nextSigma` (volSigmaSeries: HV20 commodity / GARCH index /
 *     YZ-30 fx) + `computeBands` (forecastCore corrections). This is what the live
 *     volatility bot's entry LINES are built from — frozen to match the backtest.
 *   • REFERENCE forecaster — `computeForecast` (/api/vol-forecast: Yang-Zhang commodity+fx
 *     / GARCH index, with June-recalibrated corrections). This is what the dashboard chart
 *     the trader watches shows.
 *
 * They use DIFFERENT σ estimators (commodity is HV20 in the plan vs YZ in the reference —
 * the reference switched on 2026-06-30 because "HV20 was Δ+19.8% above ref") AND different
 * correction factors, so the bot's lines can sit systematically inside/outside the chart's
 * lines. This brick quantifies that per line instead of eyeballing one chart: it returns
 * each band's size (% of price) from both forecasters and the signed drift
 * (plan − ref)/ref, plus the underlying annualised-σ drift. Pure, no network, unit-tested.
 *
 * `driftPct > 0` ⇒ the plan band is WIDER (bot line further from the open — enters later);
 * `< 0` ⇒ NARROWER (bot line inside the reference — enters earlier, the "why did it fire
 * 22 points below the real resistance?" case).
 */

import { nextSigma, computeBands } from './forecastCore.js';
import { computeForecast } from './volForecast.js';

const LINES = ['hl50', 'hl75', 'ocMed', 'oc75'];
// Reference field names (computeForecast output, all % of price) ↔ our band keys.
const REF_FIELD = { hl50: 'hl_median', hl75: 'hl_75', ocMed: 'oc_median', oc75: 'oc_75' };

const pct = (a, b) => (b ? +(((a - b) / b) * 100).toFixed(2) : null);

export function compareForecastLines(bars, assetClass = 'fx', { newsMult = 1.0 } = {}) {
  if (!Array.isArray(bars) || bars.length < 60)
    throw new Error(`compareForecastLines: need ≥60 daily bars, got ${bars?.length ?? 0}`);

  // Plan bands as % of price (open=1 → fractions ×100). Same one-step-ahead σ the plan
  // producer ships to the bot, so this is exactly the bot's line geometry.
  const sigmaPlan = nextSigma(bars, assetClass);
  const b = computeBands(1, sigmaPlan, assetClass);
  const plan = { hl50: b.hl50 * 100, hl75: b.hl75 * 100, ocMed: b.ocMed * 100, oc75: b.oc75 * 100 };

  // Reference bands (already % of price).
  const fc = computeForecast(bars, assetClass, newsMult);
  const ref = {};
  for (const k of LINES) ref[k] = fc[REF_FIELD[k]];

  const driftPct = {};
  for (const k of LINES) driftPct[k] = pct(plan[k], ref[k]);

  const planVol = +(sigmaPlan * 100 * Math.sqrt(252)).toFixed(2);   // annualised %
  const refVol = fc.vol_annual;

  return {
    assetClass,
    sigma: { planVol, refVol, driftPct: pct(planVol, refVol) },
    bandsPct: { plan: round4(plan), ref: round4(ref) },
    driftPct,
    // A single headline number: the average |line drift| — how far, on average, the bot's
    // lines sit from the chart's. Big ⇒ the two forecasters disagree materially.
    avgAbsDriftPct: +(LINES.reduce((s, k) => s + Math.abs(driftPct[k] ?? 0), 0) / LINES.length).toFixed(2),
  };
}

function round4(o) { const r = {}; for (const k of Object.keys(o)) r[k] = +(+o[k]).toFixed(4); return r; }
