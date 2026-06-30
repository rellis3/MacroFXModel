/**
 * Range-Line Bot — the frozen "plan" the live bot consumes (Category-A contract).
 *
 * Mirrors `volatilityBotPlan.js` for the range-line strategy (RANGE_EXTENSION_GUIDE
 * §11/§13/§15). PYTHON_LEGO.md doctrine: the trading bot must NOT re-implement the
 * strategy math or call live dashboard endpoints in its loop — it consumes the
 * frozen artifact the JS offline learner produces.
 *
 * Unlike the volatility plan (which ships today's σ/open band fractions, because
 * the bot can't compute σ), the range-line levels are a fib ladder off TODAY's
 * London-session range — which the bot CAN compute from its own session bars. So
 * the plan ships only the FROZEN per-instrument policy + the ladder spec; the bot
 * builds the range and the ladder live with the SAME `buildRangeLadder` labels →
 * same cell keys → no backtest/live drift.
 *
 *   { strategy:'range-line', sources, ladderFibs, boundaryHour, asiaHrs, chandFrac,
 *     minN, marginPct,
 *     universe:    [instrument,...],                       // instruments with >=1 tradeable cell
 *     instruments: { instr: { assetClass, pip, cost, slip,
 *                             policy: { cell: { decision } } } } }  // fade/follow only, skips dropped
 *
 * Per-instrument policy is the honest unit §15 validated (each instrument learns on
 * its OWN history), NOT a pooled universal map. Cell keys are `${label}_${side}|`
 * (condition 'none' → empty condKey), e.g. `A_-0.5_dn|`, `M_1_up|`.
 *
 * Pure + synthetic-testable (no network): the per-instrument frozen policies are
 * passed in; the producer (rangeLineBotProducer) computes them from M1 and stamps
 * generatedAt.
 */

// Build the plan from per-instrument frozen policies + ladder meta.
//   policyByInstrument — { instr: { policy:{cell:{decision,...}}, assetClass, pip,
//                          cost, slip, coverage } } (from buildPolicy per instrument)
//   meta — { sources, ladderFibs, boundaryHour, asiaHrs, chandFrac, minN, marginPct }
// Returns the plan object (caller stamps generatedAt). An instrument is included
// only if it has >=1 tradeable (non-skip) cell; only non-skip cells are kept.
export function buildRangeLineBotPlan(policyByInstrument = {}, meta = {}) {
  if (!policyByInstrument || typeof policyByInstrument !== 'object')
    throw new Error('buildRangeLineBotPlan: policyByInstrument required');

  const instruments = {};
  for (const [instr, rec] of Object.entries(policyByInstrument)) {
    if (!rec || typeof rec.policy !== 'object') continue;
    // Trim to the cells the bot can act on (fade/follow). A touched cell absent
    // from this map is a skip by construction → the bot does nothing.
    const policy = {};
    for (const [cell, p] of Object.entries(rec.policy)) {
      if (p && p.decision && p.decision !== 'skip') policy[cell] = { decision: p.decision };
    }
    if (!Object.keys(policy).length) continue;          // no tradeable cell → drop instrument
    instruments[String(instr).toLowerCase()] = {
      assetClass: rec.assetClass || 'fx',
      pip: rec.pip ?? null,
      cost: rec.cost ?? null,
      slip: rec.slip ?? null,
      policy,
    };
  }

  return {
    strategy: 'range-line',
    sources: meta.sources ?? ['asia', 'monday'],
    ladderFibs: meta.ladderFibs ?? [],
    boundaryHour: meta.boundaryHour ?? 0,
    asiaHrs: meta.asiaHrs ?? 6,
    chandFrac: meta.chandFrac ?? 0.5,
    minN: meta.minN ?? 50,
    marginPct: meta.marginPct ?? 0,
    universe: Object.keys(instruments),
    instruments,
  };
}
