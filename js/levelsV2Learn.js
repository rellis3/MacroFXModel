/**
 * Levels-v2 Offline Learner — build and FREEZE the per-cell confidence policy from
 * M1 history, so the live producer (levelsV2Engine.js) only ever APPLIES it.
 *
 * This is deliberately thin: the policy machinery already exists and is OOS-honest
 * (rangeLineAnalyser → perLineStrategy.runPerLine, pooled-IS → per-pair-OOS, gated
 * on after-cost expectancy). We run that book and snapshot its `.policy` plus the
 * metadata the live side needs to reproduce cells (conditions, splitFrac, costs).
 *
 * "Offline first, then push out" — the runtime never re-fits; it loads this frozen
 * artifact. Re-learn deliberately (a new M1 run) and version the file.
 *
 * Pure orchestration: the only impurity is whoever passes in the packed M1.
 */

import { runRangeLineBook } from './rangeLineAnalyser.js';

export const POLICY_VERSION = 2;

/**
 * Learn + freeze. packedByPair = { pair: packedM1 }; opts forwarded to the book
 * (sources, conditions, minN, splitFrac, marginPct, costByPair, …). Returns the
 * frozen artifact AND the full book (so a route can also surface the OOS card).
 */
export function learnAndFreeze(packedByPair, opts = {}, stampISO = null) {
  const book = runRangeLineBook(packedByPair, opts);
  const frozen = freezePolicy(book, opts, stampISO);
  return { frozen, book };
}

// Quantile of a sorted-ascending numeric array (linear interpolation).
function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Grade bands derived from the policy's OWN expectancy distribution, so A+/A/B
// always fit this policy's scale instead of a hard-coded number (which left A+
// unreachable when the best cell was ~+0.09% vs a 0.15% gate). Percentile-based
// with a small absolute floor so a weak policy can't inflate its own grades.
export function deriveBands(policy, base = {}) {
  const exps = Object.values(policy)
    .filter(p => p && p.decision && p.decision !== 'skip' && Number.isFinite(p.expectancy) && p.expectancy > 0)
    .map(p => p.expectancy).sort((a, b) => a - b);
  if (exps.length < 4) return null;               // too few to fit — fall back to defaults
  const eB     = Math.max(0.02, +quantile(exps, 0.33).toFixed(4));
  const eA     = Math.max(eB + 0.005, +quantile(exps, 0.66).toFixed(4));
  const eAplus = Math.max(eA + 0.005, +quantile(exps, 0.85).toFixed(4));
  return { eAplus, eA, eB, nFull: base.nFull ?? 50, nMin: base.nMin ?? 30, rrFloor: base.rrFloor ?? 1.0 };
}

// Snapshot just what the live grader needs from a runPerLine result.
export function freezePolicy(book, opts = {}, stampISO = null) {
  if (!book || !book.policy) throw new Error('freezePolicy: book has no policy');
  return {
    version:    POLICY_VERSION,
    builtAt:    stampISO,                         // pass new Date().toISOString() at the call site
    splitDate:  book.splitDate ?? null,
    conditions: opts.conditions ?? ['approachVel'],
    sources:    opts.sources ?? ['asia', 'monday'],
    minN:       opts.minN ?? 50,
    marginPct:  opts.marginPct ?? 0,
    coverage:   book.coverage ?? null,            // fade/follow/skip cell counts
    nCells:     Object.keys(book.policy).length,
    bands:      deriveBands(book.policy, opts.bands ?? {}),  // null → grader uses DEFAULT_GRADE_BANDS
    policy:     book.policy,                       // { cell: { decision, n, expectancy, revRate, ... } }
  };
}

// Light sanity check for a loaded artifact (used by the live engine before trusting it).
export function isUsablePolicy(frozen) {
  return !!(frozen && frozen.policy && typeof frozen.policy === 'object'
    && Object.values(frozen.policy).some(p => p && (p.decision === 'fade' || p.decision === 'follow')));
}
