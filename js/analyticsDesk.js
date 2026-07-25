/**
 * Analytics Desk — the per-instrument desk-view snapshot
 * (`ANALYTICS_ENGINE_DESIGN.md` §3, Phase 3). One pure function that COMPOSES
 * the existing bricks into the institutional questions — it computes nothing
 * novel itself, which is the point: every number on the desk is the same
 * number the backtests and the forecaster use, imported, never copied.
 *
 *   Question                     Brick
 *   expected range today       → forecastCore.nextSigma + computeBands
 *   which regime               → volBacktestEngine.classifyRegime
 *   trend-day-ness             → dayTypeCore.dayTypeScore (T = drift ÷ diffusion)
 *   trending or reverting      → rangeBiasCore.computeHurst + ouCore.ouFit (half-life)
 *   is this move normal        → statsCore.rollingZAt on the daily range
 *   distribution changed?      → entropyCore.normalizedEntropy + regimeShiftSeries
 *   how fat is the tail        → extremesCore.potFit / gpdQuantile / returnLevel
 *
 * Everything except the bands is CONTEXT (measurement, no edge claim); the
 * bands are the platform's validated input. The page renders those labels —
 * this module just reports the numbers, with n and null for "can't say"
 * (never a fake 0).
 */

import { nextSigma, computeBands } from './forecastCore.js';
import { classifyRegime } from './volBacktestEngine.js';
import { dayTypeScore } from './dayTypeCore.js';
import { ouFit } from './ouCore.js';
import { normalizedEntropy, regimeShiftSeries } from './entropyCore.js';
import { potFit, gpdQuantile, gpdES, returnLevel } from './extremesCore.js';
import { rollingZAt, hurstDFA } from './statsCore.js';

const finiteOrNull = (x) => (Number.isFinite(x) ? x : null);

// bars: oldest-first D1 [{date, open, high, low, close}].
export function deskSnapshot(bars, assetClass, {
  ouWindow = 250, hurstWindow = 500, entropyWindow = 60,
  shiftWindow = 60, shiftRef = 250, rangeZWindow = 60,
} = {}) {
  const n = bars?.length ?? 0;
  if (n < 320) return { ok: false, n, error: 'need ≥320 D1 bars' };
  const last = bars[n - 1];
  const closes = bars.map(b => b.close);
  const logs = closes.map(Math.log);
  const rets = [];
  for (let i = 1; i < n; i++) rets.push(logs[i] - logs[i - 1]);

  // Expected range — the validated input. σ for the NEXT session (no
  // lookahead: nextSigma reads completed bars only); bands off the last close
  // as the reference (the true session open isn't known from D1).
  const sigma = nextSigma(bars, assetClass);
  const bands = sigma > 0 ? computeBands(last.close, sigma, assetClass) : null;

  // Regime + trend-day-ness.
  const regime = classifyRegime(closes, n - 1);
  const T = dayTypeScore(closes, n - 1, 14);

  // Trending or reverting: Hurst on RETURNS (the increment series — passing
  // price levels returns ≈H+1 and makes every instrument look "trending";
  // measured 2026-07-25, see statsCore.hurstDFA); OU on the log-price level.
  const hurst = hurstDFA(rets.slice(-hurstWindow));
  const ou = ouFit(logs.slice(-ouWindow));
  let ouRead = null;
  if (ou) {
    const stationarySd = ou.ok ? ou.sigma / Math.sqrt(2 * ou.kappa) : null;
    ouRead = {
      ok: ou.ok,
      halfLifeDays: ou.ok ? finiteOrNull(ou.halfLife) : null,
      tStat: finiteOrNull(ou.tStat),
      // Current stretch vs the fitted long-run mean, in stationary σ units.
      z: ou.ok && stationarySd > 0 ? finiteOrNull((logs[n - 1] - ou.mu) / stationarySd) : null,
      n: ou.n,
    };
  }

  // Is yesterday's move statistically normal? z of the daily range fraction
  // vs the trailing window (rollingZAt includes the day itself — indicator
  // convention, same as every other consumer of the brick).
  const rangeFracs = bars.map(b => (b.high - b.low) / b.open);
  const rangeZ = finiteOrNull(rollingZAt(rangeFracs, n - 1, rangeZWindow));

  // Has the distribution changed? Disorder of recent returns + JS-divergence
  // shift of the trailing window vs the reference before it, located as a
  // percentile of the instrument's own shift history.
  const entropyNorm = finiteOrNull(normalizedEntropy(rets.slice(-entropyWindow), { bins: 10 }));
  const shiftSeries = regimeShiftSeries(rets, { window: shiftWindow, ref: shiftRef, bins: 10 });
  const shifts = shiftSeries.filter(Number.isFinite);
  const shiftNow = shifts.length ? shifts[shifts.length - 1] : null;
  const shiftPctile = shiftNow != null && shifts.length >= 20
    ? shifts.filter(v => v <= shiftNow).length / shifts.length
    : null;

  // Tail geometry of daily LOSSES (signed: gains are negative inputs, so the
  // POT threshold is the true 95th percentile of the loss distribution).
  const losses = rets.map(r => -r);
  const fit = potFit(losses, { q: 0.95 });
  const tail = fit ? {
    xi: finiteOrNull(fit.xi),
    nExc: fit.nExc,
    var99: finiteOrNull(gpdQuantile(0.99, fit)),      // daily loss, log-return units
    es99: finiteOrNull(gpdES(0.99, fit)),
    loss1in250: finiteOrNull(returnLevel(250, fit)),  // the 1-in-a-trading-year day
  } : null;

  return {
    ok: true,
    n,
    lastDate: last.date,
    lastClose: last.close,
    assetClass,
    sigma: finiteOrNull(sigma),
    bands,
    regime,
    dayTypeT: finiteOrNull(T),
    hurst: finiteOrNull(hurst),
    ou: ouRead,
    rangeZ,
    entropy: { normalized: entropyNorm, shiftNow: finiteOrNull(shiftNow), shiftPctile: finiteOrNull(shiftPctile), n: shifts.length },
    tail,
  };
}
