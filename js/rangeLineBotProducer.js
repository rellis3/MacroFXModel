/**
 * Range-Line Bot — plan PRODUCER.
 *
 * Mirrors `volatilityBotProducer.js`. Freezes the §13/§15 range-line policy
 * PER INSTRUMENT (each instrument learns on its OWN M1 history — the honest unit
 * §15 validated) and writes a compact `range_line_bot_plan` artifact to KV. The
 * Python `range_line_bot` reads that artifact each plan-refresh (PYTHON_LEGO.md
 * "ship it a file"), never calling this in its tight loop.
 *
 * The policy is learned with the SAME bricks the backtest used — `recordsForPair`
 * → `extractTouches` (condition 'none') → `buildPolicy` (after-cost expectancy
 * gate) — so the live cells match the backtested cells. The ladder labels are
 * frozen via `buildRangeLadder` parity (the bot imports the same builder), so the
 * backtest and the bot cannot silently disagree (TRADABILITY_REVIEW.md).
 *
 * Network/IO is INJECTED (getRecords/kvPut) so the core is offline-testable; the
 * server route wires the real M1 loader + KV.
 */

import { extractTouches, buildPolicy, costForPair, DEFAULT_COST_PCT, DEFAULT_SLIP_PCT } from './perLineStrategy.js';
import { LADDER_LEVELS } from './rangeLineAnalyser.js';

// Default per-instrument freeze: records → touches (no condition) → policy.
// Learns on the instrument's FULL history (production uses all data — the OOS
// split already proved it generalises). Returns the buildPolicy map.
function defaultFreeze(records, { assetClass, cost, slip, minN, marginPct }) {
  const touches = extractTouches(records, { conditions: [] });
  return buildPolicy(touches, { minN, marginPct, costPct: cost, slipPct: slip });
}

// Refresh the range-line bot plan and persist it to KV. Returns the plan (with
// generatedAt). `getRecords(instrument, assetClass)` must return the analyser's
// per-window line records (server wires loadM1 → recordsForPair, with the frozen
// boundaryHour/asiaHrs window). Instruments whose records are missing/empty, or
// whose policy has no tradeable cell, are skipped.
export async function refreshRangeLineBotPlan({
  universe, getRecords, kvPut,
  assetClassFor = () => 'fx',
  pipFor = () => null,
  freeze = defaultFreeze,
  sources = ['asia', 'monday'],
  boundaryHour = 0, asiaHrs = 6, chandFrac = 0.5,
  minN = 50, marginPct = 0,
  buildPlan,                                  // injected for testing (defaults to the real builder)
  now = () => new Date().toISOString(), stamp = () => Date.now(),
  onLog = () => {},
} = {}) {
  if (!Array.isArray(universe) || !universe.length)
    throw new Error('refreshRangeLineBotPlan: universe (instrument list) required');
  if ([getRecords, kvPut].some(f => typeof f !== 'function'))
    throw new Error('refreshRangeLineBotPlan: getRecords/kvPut are required functions');
  const build = buildPlan || (await import('./rangeLineBotPlan.js')).buildRangeLineBotPlan;

  const policyByInstrument = {};
  let ok = 0, fail = 0;
  for (const instr of universe) {
    const key = String(instr).toLowerCase();
    try {
      const assetClass = assetClassFor(key) || 'fx';
      const cost = costForPair(key, assetClass);
      const slip = DEFAULT_SLIP_PCT[assetClass] ?? DEFAULT_SLIP_PCT.fx;
      const records = await getRecords(key, assetClass);
      if (!records || !records.length) { onLog(`${key}: no records — skipped`); fail++; continue; }
      const policy = freeze(records, { assetClass, cost, slip, minN, marginPct });
      const tradeable = Object.values(policy).filter(p => p.decision && p.decision !== 'skip').length;
      if (!tradeable) { onLog(`${key}: 0 tradeable cells — skipped`); fail++; continue; }
      policyByInstrument[key] = { policy, assetClass, pip: pipFor(key), cost, slip };
      onLog(`${key}: ${tradeable} tradeable cell(s)`);
      ok++;
    } catch (e) { onLog(`${key}: ${e.message}`); fail++; }
  }

  const plan = {
    generatedAt: now(), source: 'range-line per-instrument book',
    ...build(policyByInstrument, { sources, ladderFibs: LADDER_LEVELS, boundaryHour, asiaHrs, chandFrac, minN, marginPct }),
  };
  // Refuse to publish an empty universe — a 0-instrument plan is never tradeable
  // and always means freezing failed (M1 unreachable, or every policy was all
  // skips). Writing it would strand the bot AND clobber a prior-good plan. Throw
  // so the failure is visible and any prior plan is left intact.
  if (!plan.universe.length)
    throw new Error(`range-line bot plan has 0 tradeable instruments (${ok} frozen, ${fail} skipped) — not publishing an empty plan; check M1 reachability`);
  await kvPut('range_line_bot_plan', JSON.stringify({ data: plan, timestamp: stamp() }));
  onLog(`plan written: ${plan.universe.length} instruments live (${ok} frozen, ${fail} skipped)`);
  return plan;
}

export { DEFAULT_COST_PCT };
