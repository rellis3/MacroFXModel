/**
 * "How much": stop and size from the chosen forecast's σ (forge/HOW_MUCH_SPEC.md, Lesson 03 §02–§03, Lesson 01 §06).
 *
 *   stop      ≥ the class's minimum stop: the smallest distance a single 5-minute bar crosses on ≤ 5% of days.
 *               Closer than that, a stop is jumped by one bar, not reached.
 *   allowance = p90 of how far that one bar carried past the stop (+ the p90 Monday gap if held over a weekend).
 *   size      = risk budget ÷ (stop + allowance), so the planned loss already includes the step past the stop.
 *
 * Side matters: a long's stop is crossed by falling bars, a short's by rising ones (indices jump mostly upward).
 * σ is the chosen forecast's daily σ in % of price (ladder.sigma_used_pct of /api/vol-forecast/persist-ladder/json).
 * Pure, no I/O. The risk budget is in the instrument's quote currency per unit; currency conversion is the caller's.
 */
import { HOW_MUCH } from './howMuchParams.js';

const MAJORS = new Set(['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD']);
const INDICES = new Set(['NQ', 'SPX500', 'SPX', 'US30', 'DOW', 'US2000', 'DE30', 'UK100']);

export function howMuchClass(instrument) {
  const n = String(instrument ?? '').toUpperCase();
  return n === 'GOLD' ? 'gold' : INDICES.has(n) ? 'indices' : MAJORS.has(n) ? 'fx_majors' : 'fx_crosses';
}

/**
 * @param {object} o
 *   instrument, price, sigmaPct (daily σ, % of price), side 'long'|'short', riskBudget (quote ccy),
 *   weekend (held over a weekend), stopSigma (a wider stop the trader wants; never allowed below the minimum)
 * @returns {object|null}
 */
export function stopAndSize({ instrument, price, sigmaPct, side = 'long', riskBudget = null, weekend = false,
                              stopSigma = null, params = HOW_MUCH } = {}) {
  const P = params.classes?.[howMuchClass(instrument)];
  const S = P?.[side === 'short' ? 'short' : 'long'];
  if (!S || !(price > 0) || !(sigmaPct > 0)) return null;
  const unit = price * sigmaPct / 100;                                  // 1σ in price
  const stop = Math.max(S.min_stop_sigma, Number.isFinite(stopSigma) ? stopSigma : 0);
  const over = S.overshoot_p90_sigma;
  const wk = weekend ? P.weekend_gap_p90_sigma : 0;
  const loss = stop + over + wk;                                        // planned loss per unit, σ
  const dir = side === 'short' ? 1 : -1;                                // stop sits below a long, above a short
  const out = {
    class: howMuchClass(instrument), side: side === 'short' ? 'short' : 'long',
    min_stop_sigma: S.min_stop_sigma, stop_sigma: stop, overshoot_sigma: over, weekend_sigma: wk, planned_loss_sigma: Math.round(loss * 1000) / 1000,
    stop_distance: stop * unit, stop_price: price + dir * stop * unit, loss_per_unit: loss * unit,
    stop_clamped: Number.isFinite(stopSigma) && stopSigma < S.min_stop_sigma,
  };
  if (riskBudget > 0) out.size = riskBudget / out.loss_per_unit;
  return out;
}
