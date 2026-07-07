/**
 * Levels-v2 Offline Learner — build and FREEZE the per-cell confidence policy from
 * M1 history, so the live producer (levelsV2Engine.js) only ever APPLIES it.
 *
 * v3 (RANGE_EXTENSION_GUIDE.md §13, the locked best spec): learns PER INSTRUMENT —
 * §15 found that's the honest unit, not a pooled cross-pair map — with NO live
 * touch-feature condition (§14: `approachVel` and five other live-approach reads
 * were tested and ALL lost to the unconditioned read on the honest single-pair
 * unit), gated + priced on the HELD-POSITION CHANDELIER trail (§12: the fixed
 * adjacent-line "zone-walk" barrier LOSES to the chandelier — Sharpe 3.16 vs 6.11
 * @2x cost, eurusd OOS). `perLineStrategy.buildPolicy({pricer:pnlHeld})` reuses the
 * exact per-touch trail PnL (`fChand`/`fChandFade`) the §13 book and the LIVE
 * `range_line_bot` (`js/rangeLineBotProducer.js`) already compute — this learner no
 * longer runs a second, drifted policy over the same touches (the v2-vs-bot split
 * `LEGO_MODULES.md` flagged is closed: same bricks, same exit, same condition).
 *
 * "Offline first, then push out" — the runtime never re-fits; it loads this frozen
 * artifact. Re-learn deliberately (a new M1 run) and version the file.
 *
 * Pure orchestration: the only impurity is whoever supplies `getTouches` (the
 * server route wires the M1 loader + its 7-day touch cache).
 */

import { buildPolicy, pnlHeld, costForPair, DEFAULT_SLIP_PCT } from './perLineStrategy.js';

export const POLICY_VERSION = 3;

const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/**
 * Learn + freeze, ONE INSTRUMENT AT A TIME (each learns on its own history — no
 * cross-pair pooling). `getTouches(pair, assetClass)` is INJECTED — must resolve
 * to the analyser's touch array (`rangeLineAnalyser.touchesForPair`'s shape,
 * trail fields (`fChand`/`fChandFade`/`rung`) included) — so the caller can serve
 * from a touch cache instead of reloading M1 for a resumed/re-run learn.
 * An instrument with no tradeable (non-skip) cell is dropped, same rule
 * `rangeLineBotProducer`/`buildRangeLineBotPlan` use for the live bot's plan.
 */
export async function learnAndFreeze(universe, getTouches, opts = {}, stampISO = null) {
  const { assetClassFor = () => 'fx', pipFor = () => null,
          minN = 50, marginPct = 0, splitFrac = 0.6,
          sources = ['asia', 'monday'], conditions = [] } = opts;
  const perInstrument = {};
  for (const instr of universe) {
    const key = String(instr).toLowerCase();
    const ac = assetClassFor(key) || 'fx';
    const touches = await getTouches(key, ac);
    if (!touches?.length) continue;
    const cost = costForPair(key, ac), slip = DEFAULT_SLIP_PCT[ac] ?? DEFAULT_SLIP_PCT.fx;
    const sorted = touches.slice().sort(byDate);
    for (const t of sorted) { t.cost = cost; t.slip = slip; }
    const splitDate = sorted[Math.floor(sorted.length * splitFrac)]?.date ?? null;
    const policy = buildPolicy(sorted.filter(t => t.date < splitDate), { minN, marginPct, pricer: pnlHeld });
    if (!Object.values(policy).some(p => p.decision !== 'skip')) continue;   // no tradeable cell
    perInstrument[key] = { assetClass: ac, pip: pipFor(key), cost, slip, splitDate, policy };
  }
  const frozen = freezePolicy(perInstrument, { ...opts, sources, conditions, minN, marginPct, splitFrac }, stampISO);
  return { frozen, perInstrument };
}

// Quantile of a sorted-ascending numeric array (linear interpolation).
function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Grade bands derived from the policy's OWN expectancy distribution, so A+/A/B
// always fit this policy's scale instead of a hard-coded number.
//
// PURELY percentile-based (33rd → eB, 66th → eA, 85th → eA+). The earlier version
// clamped each band with an absolute floor (`Math.max(0.02, …)` + 0.005 steps) that
// was calibrated for a ~0.05–0.10% edge scale. This policy's after-cost edges are
// much smaller (best cells ~0.02%), so those floors sat ABOVE the whole distribution
// and forced eB/eA/eA+ past every cell → literally everything graded C. Percentiles
// can't do that: by construction ~1/3 of positive cells clear eB, ~15% clear eA+,
// so the grades always spread across whatever scale the policy actually has (which
// is exactly what "grade = relative confidence within this policy" means — and what
// the page legend promises). A tiny epsilon keeps the three bands strictly
// increasing when the distribution is flat; NO absolute floor.
//
// `policy` here is a FLAT `{cell: {decision,expectancy,...}}` map — pass
// `flattenPolicy(frozen.perInstrument)` to fit bands across every instrument's
// cells (one global scale so grades are comparable pair-to-pair).
export function deriveBands(policy, base = {}) {
  const exps = Object.values(policy)
    .filter(p => p && p.decision && p.decision !== 'skip' && Number.isFinite(p.expectancy) && p.expectancy > 0)
    .map(p => p.expectancy).sort((a, b) => a - b);
  if (exps.length < 4) return null;               // too few to fit — fall back to defaults
  const eps = Math.max(1e-5, (exps[exps.length - 1] - exps[0]) * 0.01);  // scale-relative tie-break
  let eB     = +quantile(exps, 0.33).toFixed(5);
  let eA     = +quantile(exps, 0.66).toFixed(5);
  let eAplus = +quantile(exps, 0.85).toFixed(5);
  if (eA <= eB) eA = +(eB + eps).toFixed(5);
  if (eAplus <= eA) eAplus = +(eA + eps).toFixed(5);
  return { eAplus, eA, eB, nFull: base.nFull ?? 50, nMin: base.nMin ?? 30 };
}

// Flatten a per-instrument policy map into one flat object (instrument-prefixed
// keys, so cross-instrument collisions can't merge two different cells) purely so
// callers that only care about the UNION of cells — band-fitting, usability
// checks — don't need to know about the per-instrument nesting.
export function flattenPolicy(perInstrument) {
  const out = {};
  for (const [instr, rec] of Object.entries(perInstrument || {}))
    for (const [cell, p] of Object.entries(rec?.policy || {})) out[`${instr}::${cell}`] = p;
  return out;
}

// Snapshot what the live grader needs, per instrument, + a globally-fit band.
export function freezePolicy(perInstrument, opts = {}, stampISO = null) {
  if (!perInstrument || typeof perInstrument !== 'object') throw new Error('freezePolicy: perInstrument required');
  const coverage = { fadeCells: 0, followCells: 0, skipCells: 0 };
  let nCells = 0;
  for (const rec of Object.values(perInstrument)) {
    for (const p of Object.values(rec?.policy || {})) {
      nCells++;
      coverage[p.decision === 'fade' ? 'fadeCells' : p.decision === 'follow' ? 'followCells' : 'skipCells']++;
    }
  }
  return {
    version:    POLICY_VERSION,
    builtAt:    stampISO,                         // pass new Date().toISOString() at the call site
    conditions: opts.conditions ?? [],            // §14: empty = no live touch-feature gate (the winner)
    sources:    opts.sources ?? ['asia', 'monday'],
    minN:       opts.minN ?? 50,
    marginPct:  opts.marginPct ?? 0,
    chandFrac:  opts.chandFrac ?? 0.5,            // §13 chandelier give-back, shared with rangeLineBotPlan
    coverage,                                      // fade/follow/skip cell counts, summed over all instruments
    nCells,                                        // total cells learned, summed over all instruments
    bands:      deriveBands(flattenPolicy(perInstrument), opts.bands ?? {}),  // null → grader uses DEFAULT_GRADE_BANDS
    perInstrument,                                 // { instr: { assetClass, pip, cost, slip, splitDate, policy } }
  };
}

// Light sanity check for a loaded artifact (used by the live engine before trusting it).
export function isUsablePolicy(frozen) {
  return !!(frozen && frozen.perInstrument && typeof frozen.perInstrument === 'object'
    && Object.values(frozen.perInstrument).some(rec =>
        rec?.policy && Object.values(rec.policy).some(p => p && (p.decision === 'fade' || p.decision === 'follow'))));
}
