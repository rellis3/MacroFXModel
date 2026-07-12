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
 *   1. Zone      — `level` (+ `inner`/`outer` neighbours, for the initial stop),
 *                  supplied.
 *   2. Direction — fade vs follow is the policy cell's learned `decision`; mapped to
 *                  long/short with the SAME isBuy rule as perLineStrategy.pnlFor so
 *                  the live trade matches the backtested one bit-for-bit.
 *   3. Confidence— the cell's `expectancy` (% of price, after costs) + sample `n`;
 *                  unseen / skip cells return SKIP. Grade bands are on expectancy.
 *
 * Exit — HELD-POSITION CHANDELIER TRAIL, not a fixed TP (RANGE_EXTENSION_GUIDE.md
 * §12/§13: the fixed adjacent-line barrier LOSES to the chandelier, Sharpe 3.16 vs
 * 6.11 @2x cost eurusd OOS). The policy's `expectancy` is priced on that same trail
 * (perLineStrategy.pnlHeld), so there's no separate fixed target to display — only
 * the initial protective stop (`sl`, same geometry as before) plus the trail's
 * give-back (`rung`/`trailFrac`).
 *
 * The cell key is reproduced EXACTLY as perLineStrategy.extractTouches builds it
 * (`${name}_${side}|${condKey}`) so the policy learned offline is the policy applied
 * live — that is the whole point (kills the live↔backtest grade drift, LEGO §3 #8).
 *
 * Pure: no network, no DOM. Unit-tested on a synthetic policy in js/telegramV2.test.mjs.
 */

// Default expectancy grade bands (units = % of price after costs, the unit
// perLineStrategy.pnlHeld returns). Calibrated for FX session-fib cells; override
// per asset class via opts. A cell only reaches here if the frozen policy already
// gated it above its cost margin, so every graded cell has positive expectancy.
// These are the FALLBACK — the live engine prefers per-policy bands derived from
// the actual expectancy distribution at learn time (levelsV2Learn.freezePolicy →
// frozen.bands), so the grade always fits the policy rather than a hard-coded
// number that may leave A+ unreachable.
//
// No `rrFloor` here (removed): that was a geometric proxy for "is the payoff any
// good" back when the exit was a fixed adjacent-line target with a roughly-1:1
// R:R by construction. Now `expectancy` is priced directly off the REALIZED
// chandelier-trail PnL (perLineStrategy.pnlHeld), so it already prices the real
// payoff — a poor trail outcome shows up as low/negative expectancy and gets
// filtered by buildPolicy's marginPct gate, making a separate geometric floor
// redundant.
export const DEFAULT_GRADE_BANDS = {
  eAplus: 0.08, // ≥ this expectancy (and nFull) → A+
  eA:     0.05, // ≥ this expectancy (and nMin) → A
  eB:     0.02, // ≥ this expectancy → B
  nFull:  50,   // sample size for full confidence / A+
  nMin:   30,   // minimum sample to earn an A (matches the OOS ≥30 floor)
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

// Initial protective stop for a decision: FADE risks to the outer line (away from
// the range mid); FOLLOW risks to the inner (back toward the mid) — same geometry
// as before. There is no fixed target: the position is held with a chandelier
// trail (RANGE_EXTENSION_GUIDE.md §13) that ratchets in from `rung` (the ladder
// step — ladder lines are evenly spaced, so |outer-level| == |level-inner|) by
// `trailFrac` of a rung as price moves favourably.
export function exitsFor(decision, { level, inner, outer }) {
  const sl = decision === 'fade' ? outer : inner;
  const rung = Math.abs(outer - level);
  return { sl, rung: +rung.toFixed(6) };
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
    // 'notSignificant' = buildPolicy's t-gate: mean edge positive but within
    // sampling noise at this n (mean/SE ≤ tStat) — treated exactly like any
    // other policy skip, just with an honest label.
    return { action: 'skip', cell, grade: 'SKIP', verdict: 'SKIP',
             reason: p.reason === 'lowN' ? 'low-N in IS'
                   : p.reason === 'notSignificant' ? 'edge within noise (t-gate)'
                   : 'edge below cost',
             n: p.n, expectancy: p.expectancy ?? null };
  }

  const decision  = p.decision;                 // 'fade' | 'follow'
  const direction = directionFor(decision, touch.side);
  const { sl, rung } = exitsFor(decision, touch);
  const expectancy = p.expectancy ?? 0;
  const n          = p.n ?? 0;
  const winRate    = p.winRate ?? null;          // decision-aware win% under the held trail (buildPolicy)
  const revRate    = p.revRate ?? null;          // direction-only reversion% (kept for back-compat display)

  // Grade off expectancy + breadth (NOT a 0-100 heuristic).
  let grade;
  if      (expectancy >= bands.eAplus && n >= bands.nFull) grade = 'A+';
  else if (expectancy >= bands.eA     && n >= bands.nMin)  grade = 'A';
  else if (expectancy >= bands.eB)                         grade = 'B';
  else if (expectancy >  0)                                grade = 'C';
  else                                                     grade = 'SKIP';

  const verdict = grade === 'A+' || grade === 'A' ? 'TAKE'
                : grade === 'B'                    ? 'WATCH'
                : grade === 'C'                    ? 'CAUTION'
                :                                    'SKIP';

  const reasons = [
    `Edge +${expectancy.toFixed(3)}% after costs (n=${n})`,
    winRate != null ? `${decision} · ${winRate}% win (held trail)` : decision,
  ];

  return {
    action: 'enter', cell, decision, direction,
    grade, verdict, reasons, warnings: [],
    expectancy: +expectancy.toFixed(4), n, winRate, revRate,
    confidence: confidenceScore(expectancy, n, winRate ?? revRate, bands),
    sl: +sl.toFixed(6), rung: +rung.toFixed(6), trailFrac: 0.5, exit: 'chandelier',
  };
}
