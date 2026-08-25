/**
 * Ladder path stats — "price is at the p50 line; what happens next?"
 *
 * Turns the fitted ladder's exceedance rates into the CONDITIONAL chain a human
 * actually wants at the chart:
 *
 *     reach p50  →  of those, X% go on to p75  →  of those, Y% go on to p90
 *
 * ── WHY THIS NEEDS NO BACKTEST ───────────────────────────────────────────────
 * `forecastLadderParams.js` already carries `oos_exceed` — the WALK-FORWARD
 * out-of-sample rate at which each rung was actually exceeded, fit per
 * instrument by `forge/vol.py` over n folds. The O-H rungs are NESTED (p90 >
 * p75 > p50, all measured from the same open in the same direction), so a day
 * whose high cleared p90 necessarily cleared p75 and p50. That makes the
 * conditional exact, not an approximation:
 *
 *     P(reach p75 | reached p50) = P(p75) / P(p50)
 *
 * So this brick is a pure re-expression of numbers the project already
 * validated — NOT a second measurement that could drift from the fit. If the
 * ladder is refit, these numbers move with it automatically.
 *
 * ── WHAT THE NUMBERS SAY (checked across the fitted set, 2026-08) ────────────
 * The chain sits close to its nominal 50%→40% on every instrument, i.e. getting
 * further out does NOT make the next leg less likely — there is no "each band
 * is harder to break" effect. Independently corroborated by a symmetric-barrier
 * σ-ladder walk over M1 (EURUSD/Gold/NQ), which found the advance rate flat
 * across depth. What IS real and per-instrument is the UP/DOWN asymmetry: on
 * EURUSD a down-side p75 tag stalls before p90 72% of the time vs 57% on the
 * up-side. That asymmetry is the tradeable content here, not the depth.
 *
 * ── HONESTY NOTES ────────────────────────────────────────────────────────────
 * • These are UNCONDITIONED on the event calendar. The live ladder widens σ on
 *   an FOMC/NFP day (`eventMultiplier`), and the exceedance fit is pooled across
 *   all days, so today's chain is the all-days average, not an event-day chain.
 *   Same deliberate limitation as `/api/vol-forecast/ladder/frozen`.
 * • A rung whose realized rate is non-monotone vs the rung inside it means a
 *   broken fit; that returns null rather than a >100% conditional.
 * • `oos_exceed` carries no sample count, so no n is reported — don't invent one.
 *
 * Pure: params in, numbers out. No network, no clock, no I/O.
 */

import { RUNGS, RUNG_TARGET, paramsFor } from './forecastLadder.js';

// The two directional quantities a trader stands in front of: the HIGH reaching
// open+x (up-side exhaustion levels) and the LOW reaching open−x.
export const PATH_SIDES = { oh: 'up', ol: 'down' };

const pct = v => (Number.isFinite(v) ? Math.round(v * 1000) / 10 : null);   // 0.4643 → 46.4

// Nominal chain implied by the rung targets themselves (50/25/10 → 50%, 40%).
export function nominalChain() {
  const [a, b, c] = RUNGS.map(r => RUNG_TARGET[r]);
  return { reach: { p50: pct(a), p75: pct(b), p90: pct(c) },
           given: { p75_given_p50: pct(b / a), p90_given_p75: pct(c / b) } };
}

// One side's chain from a flat exceedance map ({oh_p50, oh_p75, oh_p90, …}).
function sideChain(exceed, q) {
  const a = exceed?.[`${q}_p50`], b = exceed?.[`${q}_p75`], c = exceed?.[`${q}_p90`];
  if (![a, b, c].every(Number.isFinite)) return null;
  // Nested rungs must be non-increasing. If they aren't, the fit is broken for
  // this instrument — say so instead of emitting a conditional above 100%.
  const monotone = a >= b && b >= c;
  const g1 = monotone && a > 0 ? b / a : null;
  const g2 = monotone && b > 0 ? c / b : null;
  return {
    reach: { p50: pct(a), p75: pct(b), p90: pct(c) },
    given: { p75_given_p50: pct(g1), p90_given_p75: pct(g2) },
    // The fade read: having tagged p75, how often does it stall before p90?
    stall: { at_p75: g2 == null ? null : pct(1 - g2) },
    monotone,
  };
}

/**
 * Full path chain for one instrument.
 *   ladderPathChain('EURUSD')                    → daily
 *   ladderPathChain('EURUSD', {horizon:'weekly'})
 * Returns { instrument, horizon, fitted, trainedThrough, nFolds, oh, ol, nominal }.
 * `fitted:false` means no per-instrument OOS record was found — the caller
 * should show the nominal chain and label it as the design target, not evidence.
 */
export function ladderPathChain(instrument, { horizon = 'daily', assetClass = 'fx' } = {}) {
  const params = paramsFor(instrument, assetClass);
  const exceed = horizon === 'daily'
    ? params?.oos_exceed
    : (params?.horizons?.[horizon]?.oos_exceed ?? null);
  const oh = sideChain(exceed, 'oh'), ol = sideChain(exceed, 'ol');
  return {
    instrument: String(instrument || '').toUpperCase(),
    horizon,
    fitted: !!(oh || ol),
    trainedThrough: params?.trained_through ?? null,
    nFolds: horizon === 'daily' ? (params?.n_folds ?? null) : (params?.horizons?.[horizon]?.n_train ?? null),
    paramsSource: params?.source ?? null,
    oh, ol,
    nominal: nominalChain(),
  };
}

/**
 * Plain-English lines for one side — the "human usable format".
 * levels: optional { p50, p75, p90 } PRICES for today, so the sentence names the
 * actual number on the chart rather than an abstract rung.
 */
export function describeSide(chain, side = 'oh', levels = null, digits = 5) {
  const c = chain?.[side];
  const dir = PATH_SIDES[side] ?? side;
  if (!c) return [`No fitted path stats for the ${dir}-side ladder.`];
  const px = r => (levels && Number.isFinite(levels[r]) ? ` (${levels[r].toFixed(digits)})` : '');
  const out = [
    `Reaches the p50 ${dir} line${px('p50')} on ${c.reach.p50}% of days.`,
  ];
  if (c.given.p75_given_p50 != null) {
    out.push(`Once it does, ${c.given.p75_given_p50}% carry on to p75${px('p75')} — so it stalls at p50 ${Math.round(100 - c.given.p75_given_p50)}% of the time.`);
  }
  if (c.given.p90_given_p75 != null) {
    out.push(`From p75, ${c.given.p90_given_p75}% reach p90${px('p90')} — it stalls at p75 ${c.stall.at_p75}% of the time.`);
  }
  if (!c.monotone) out.push('⚠ This instrument\'s fitted rungs are non-monotone — treat the chain as unreliable and refit.');
  return out;
}
