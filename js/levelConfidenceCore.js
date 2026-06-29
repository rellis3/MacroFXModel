/**
 * Level-Confidence Core — the v2 "confidence at the entry zone" decision, as ONE
 * pure brick. This is the heart of Telegram-v2 (see TELEGRAM_V2.md).
 *
 * It answers the three questions of ENTRY_ZONE_CONFIDENCE.md for a LIVE confluence
 * level, but the v1 way (hand-weighted 0-100 score) is replaced by the research
 * engine's discipline: confidence is **after-cost expectancy** looked up from a
 * FROZEN, OOS-learned per-cell policy (built offline by perLineStrategy.buildPolicy
 * over M1 history — never re-fit live). The grade is a function of money + breadth,
 * not a vibe.
 *
 *   1. Zone      — `level` (+ `inner`/`outer` triple-barrier neighbours), supplied.
 *   2. Direction — fade vs follow is the policy cell's learned `decision`; mapped to
 *                  long/short with the SAME isBuy rule as perLineStrategy.pnlFor so
 *                  the live trade matches the backtested one bit-for-bit.
 *   3. Confidence— the cell's `expectancy` (% of price, after costs) + sample `n`;
 *                  unseen / skip cells return SKIP. Grade bands are on expectancy.
 *
 * The cell key is reproduced EXACTLY as perLineStrategy.extractTouches builds it
 * (`${name}_${side}|${condKey}`) so the policy learned offline is the policy applied
 * live — that is the whole point (kills the live↔backtest grade drift, LEGO §3 #8).
 *
 * Pure: no network, no DOM. Unit-tested on a synthetic policy in js/telegramV2.test.mjs.
 */

// Default expectancy grade bands (units = % of price after costs, the unit
// perLineStrategy.pnlFor returns). Calibrated for FX session-fib cells; override
// per asset class via opts. A cell only reaches here if the frozen policy already
// gated it above its cost margin, so every graded cell has positive expectancy.
//
// NOTE on R:R: the triple-barrier exits are ADJACENT ladder lines, which on the
// half-integer fib grid are ~equidistant ⇒ rr is structurally ~1:1. Crucially the
// cell's `expectancy` ALREADY encodes that 1:1 payoff (perLineStrategy.pnlFor sizes
// wins/losses by the inner/outer distances). So the grade is on expectancy, NOT rr
// — an rr≥1.5 gate would just make A+ unreachable by construction. We keep only a
// floor demotion when rr is genuinely poor (`rrFloor`), as a sanity guard.
// Defaults calibrated to the observed session-fib expectancy scale (best cells
// ~+0.09%/touch after costs). These are the FALLBACK — the live engine prefers
// per-policy bands derived from the actual expectancy distribution at learn time
// (levelsV2Learn.freezePolicy → frozen.bands), so the grade always fits the policy
// rather than a hard-coded number that may leave A+ unreachable.
export const DEFAULT_GRADE_BANDS = {
  eAplus: 0.08, // ≥ this expectancy (and nFull) → A+
  eA:     0.05, // ≥ this expectancy (and nMin) → A
  eB:     0.02, // ≥ this expectancy → B
  nFull:  50,   // sample size for full confidence / A+
  nMin:   30,   // minimum sample to earn an A (matches the OOS ≥30 floor)
  rrFloor: 1.0, // demote a top grade only if rr falls below this (sanity, not the gate)
};

const clamp01 = x => Math.max(0, Math.min(1, x));

// Build the policy cell key the same way perLineStrategy.extractTouches does:
//   line = `${name}_${side}`, cell = `${line}|${condKey}`.
// `name` is the ladder label (e.g. "A_1.5" / "M_-2"); `condKey` is the join of the
// gating conditions (default the OOS-proven approachVel bucket).
export function cellKey({ name, side, condKey }) {
  return `${name}_${side}|${condKey}`;
}

// Map a learned fade/follow decision + line side → trade direction, matching
// perLineStrategy.pnlFor's isBuy rule exactly.
//   BUY  when fading a down-line OR following an up-line; else SELL.
export function directionFor(decision, side) {
  const isBuy = (decision === 'fade' && side === 'dn') || (decision === 'follow' && side === 'up');
  return isBuy ? 'long' : 'short';
}

// Triple-barrier exits for a decision: FADE targets the inner line (toward the
// range mid) with the outer as stop; FOLLOW is the reverse. Same as the geometry
// perLineStrategy logs per trade.
export function exitsFor(decision, { level, inner, outer }) {
  const tp = decision === 'fade' ? inner : outer;
  const sl = decision === 'fade' ? outer : inner;
  const rr = Math.abs(level - sl) > 0 ? Math.abs(tp - level) / Math.abs(level - sl) : 0;
  return { tp, sl, rr: +rr.toFixed(2) };
}

// A readable 0-1 confidence for display only — the DECISION variable is expectancy,
// this just blends expectancy magnitude, sample adequacy and reversion rate so the
// alert can show "how sure". Not used for gating.
function confidenceScore(expectancy, n, revRate, bands) {
  const e = clamp01(expectancy / bands.eAplus);
  const s = clamp01(n / bands.nFull);
  const r = revRate != null ? clamp01((revRate - 50) / 30) : 0.5;
  return +clamp01(0.5 * e + 0.3 * s + 0.2 * r).toFixed(3);
}

/**
 * Decide whether (and how) to trade a touched level, from the frozen policy.
 *
 * touch  = { name, side, condKey, level, inner, outer }
 * policy = the frozen { cell: { decision, n, expectancy, revRate, ... } } map
 * opts   = { bands? }
 *
 * Returns the full graded decision, or an `action:'skip'` record when the cell is
 * unseen-in-IS or the policy skipped it (low-N / edge below cost).
 */
export function decide(touch, policy, opts = {}) {
  const bands = { ...DEFAULT_GRADE_BANDS, ...(opts.bands ?? {}) };
  const cell  = cellKey(touch);
  const p     = policy?.[cell] ?? null;

  if (!p) return { action: 'skip', cell, grade: 'SKIP', verdict: 'SKIP', reason: 'unseen-in-IS' };
  if (p.decision === 'skip') {
    return { action: 'skip', cell, grade: 'SKIP', verdict: 'SKIP',
             reason: p.reason === 'lowN' ? 'low-N in IS' : 'edge below cost',
             n: p.n, expectancy: p.expectancy ?? null };
  }

  const decision  = p.decision;                 // 'fade' | 'follow'
  const direction = directionFor(decision, touch.side);
  const { tp, sl, rr } = exitsFor(decision, touch);
  const expectancy = p.expectancy ?? 0;
  const n          = p.n ?? 0;
  const revRate    = p.revRate ?? null;

  // Grade off expectancy + breadth (NOT a 0-100 heuristic; NOT rr — see bands note).
  let grade;
  if      (expectancy >= bands.eAplus && n >= bands.nFull) grade = 'A+';
  else if (expectancy >= bands.eA     && n >= bands.nMin)  grade = 'A';
  else if (expectancy >= bands.eB)                         grade = 'B';
  else if (expectancy >  0)                                grade = 'C';
  else                                                     grade = 'SKIP';

  // Sanity floor only: a genuinely poor payoff (rr below the floor) can't be a top
  // grade. With the equidistant ladder rr≈1.0 so this rarely fires — it guards the
  // extreme/edge cases, it is NOT the grading gate.
  const warnings = [];
  if (rr > 0 && rr < bands.rrFloor && (grade === 'A+' || grade === 'A')) {
    grade = 'B';
    warnings.push(`R:R 1:${rr} — below floor`);
  }

  const verdict = grade === 'A+' || grade === 'A' ? 'TAKE'
                : grade === 'B'                    ? 'WATCH'
                : grade === 'C'                    ? 'CAUTION'
                :                                    'SKIP';

  const reasons = [
    `Edge +${expectancy.toFixed(3)}% after costs (n=${n})`,
    revRate != null ? `${decision} · ${revRate}% reversion` : decision,
  ];

  return {
    action: 'enter', cell, decision, direction,
    grade, verdict, reasons, warnings,
    expectancy: +expectancy.toFixed(4), n, revRate,
    confidence: confidenceScore(expectancy, n, revRate, bands),
    tp: +tp.toFixed(6), sl: +sl.toFixed(6), rr,
  };
}
