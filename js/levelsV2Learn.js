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
    policy:     book.policy,                       // { cell: { decision, n, expectancy, revRate, ... } }
  };
}

// Light sanity check for a loaded artifact (used by the live engine before trusting it).
export function isUsablePolicy(frozen) {
  return !!(frozen && frozen.policy && typeof frozen.policy === 'object'
    && Object.values(frozen.policy).some(p => p && (p.decision === 'fade' || p.decision === 'follow')));
}
