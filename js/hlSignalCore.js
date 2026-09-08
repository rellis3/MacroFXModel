/**
 * HL Signal Core — the reusable pieces of the dynamic-HL early-reaction study
 * (analysis/causal_early_reaction_study.mjs / analysis/hl_early_reaction_tradeable_study.mjs,
 * 2026-09-08), extracted so both the one-off analysis scripts AND the live
 * backtest route (js/levelAtlasRoutes.js's /api/level-atlas/hl-vote-portfolio)
 * import the SAME band definitions and pricing formula — one definition,
 * not a route-side reimplementation that could drift from what was actually
 * validated.
 *
 * Finding this prices: a dynamic HL50/HL75 touch (see js/forecastCore.js's
 * computeBands for the level geometry) where the pullback stays SHALLOW by a
 * fixed checkpoint after the touch continues MORE than fair two-barrier-race
 * odds predict — real, OOS-confirmed, cost-positive at the 60min checkpoint's
 * <15% band specifically (see hl_early_reaction_tradeable_study.mjs's own
 * header for the full derivation and the honest caveat that the >60%
 * "reversal" band did NOT clear cost at any checkpoint tested).
 */

// Only band the tradeable study found cost-positive is '<15%' (continuation).
// '15-35%' showed a real but weaker effect and DID clear cost at 15/30/60min
// checkpoints (see that study's per-band table) so it's included as an
// optional, clearly-labelled-weaker lever, not hidden. '35-60%' has no edge
// (skip). '>60%' (reversal) is included ONLY for completeness/comparison —
// the tradeable study found it does NOT clear cost at any checkpoint and it
// defaults OFF everywhere it's offered as a toggle.
export const BANDS = [
  { key: '<15%', test: f => f < 0.15, bet: 'continuation' },
  { key: '15-35%', test: f => f >= 0.15 && f < 0.35, bet: 'continuation' },
  { key: '35-60%', test: f => f >= 0.35 && f < 0.6, bet: null },   // skip — no edge found
  { key: '>60%', test: f => f >= 0.6, bet: 'reversal' },           // real deviation, does NOT clear cost — off by default
];
export function bandOf(frac) { for (const b of BANDS) if (b.test(frac)) return b; return null; }

export const CHECKPOINTS_MIN = [5, 15, 30, 60];

// costForPair is injected (not imported here) so this module has zero
// dependency on js/perLineStrategy.js's own import chain — callers already
// import costForPair for their own use, this just takes the number.
export function priceTradeFromTouch(touch, cp, bet, cost) {
  const snap = touch.checks[cp];
  if (!snap) return null;
  const entryPrice = snap.ckPrice;
  const targetPrice = bet === 'continuation' ? touch.contTarget : touch.revTarget;
  const stopPrice = bet === 'continuation' ? touch.revTarget : touch.contTarget;
  const win = (bet === 'continuation' && touch.outcome === 'continuation') || (bet === 'reversal' && touch.outcome === 'reversal');
  const distToTarget = Math.abs(targetPrice - entryPrice);
  const distToStop = Math.abs(stopPrice - entryPrice);
  if (!(entryPrice > 0) || !(distToTarget > 0) || !(distToStop > 0)) return null;
  const pnlPct = +(((win ? distToTarget : -distToStop) / entryPrice * 100) - cost).toFixed(4);
  return {
    instrument: touch.instrument, pair: touch.pair, assetClass: touch.assetClass, date: touch.date,
    side: touch.side, rung: touch.rung, decision: bet, margin: null,
    time: snap.ckTime, resolveTime: touch.resolveTime, frac: snap.frac, win, pnlPct,
    entry: +entryPrice.toFixed(6), pip: touch.pip,
    targetPips: +(distToTarget / touch.pip).toFixed(1), stopPips: +(distToStop / touch.pip).toFixed(1),
  };
}
