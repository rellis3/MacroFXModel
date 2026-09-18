/**
 * mondayFibAtlasZonePricer.js — Monday's own copy of
 * `asiaFibAtlasZonePricer.js`, extracted the same day for the same reason:
 * see that file's header. Imports the SAME `voteDecision` Asia uses (both
 * ladders share one vote-scoring function — only the rung geometry and the
 * frozen thresholds differ), and Monday's own `mondayRungBarrierPips`.
 */
import { voteDecision } from './asiaFibAtlasVoteReview.js';
import { mondayRungBarrierPips } from './mondayFibAtlasEngine.js';

export const DEFAULT_REARM = 0.3;

// Same "extracted so a local decision engine can price zones without a
// Railway/KV/R2/OANDA credential" reasoning as Asia's own copy — Monday's
// own frozen cost-efficiency ratio is 4x (Asia's is 3x —
// analysis/fib_atlas_cost_efficiency_filter.mjs, each ladder chose its own
// under the same pre-stated "maximize IS Sharpe" rule).
export const FIB_ATLAS_MONDAY_MIN_MARGIN = 2;
export const FIB_ATLAS_MONDAY_MIN_COST_RATIO = 4;
export const FIB_ATLAS_MONDAY_STOP_TIGHTEN_FRAC = 0.9;
// Whiplash-gap filter (2026-09-03, owner-validated — see LEGO_MODULES.md's
// fib_atlas_gap_filter_backtest.mjs entry) — same mechanism as Asia's own
// (asiaFibAtlasZonePricer.js's FIB_ATLAS_MAX_GAP_MIN), but Monday's optimum is
// MUCH wider: its ladder trades far less densely (a weekly range vs a daily
// session), so "recent" naturally means hours here, not minutes. Pooled
// Sharpe peaks at 180m and only THERE does per-pair agreement reach 26/26 —
// tighter cutoffs (30-150m) leave several pairs worse off, unlike Asia
// where the tightest cutoff tested was already unanimous.
export const FIB_ATLAS_MONDAY_MAX_GAP_MIN = 180;

// Pure core — Monday's own copy of asiaFibAtlasZonePricer.js's
// `zonesFromLiveAndBook`, extracted the same day for the same reason: the
// nightly rebuild (runOne, mondayFibAtlasRoutes.js) can seed the bot's plan
// straight from its own freshly-built `live`+`book`, reusing this EXACT
// scoring/pricing path instead of a second implementation. A THIRD caller
// (2026-09-18) is `fib_local_decision_engine/lib/zonePricer.mjs`, for the
// same reason.
export function zonesFromLiveAndBook(live, book, cost, { minMargin = FIB_ATLAS_MONDAY_MIN_MARGIN, minCostRatio = FIB_ATLAS_MONDAY_MIN_COST_RATIO, stopTightenFrac = FIB_ATLAS_MONDAY_STOP_TIGHTEN_FRAC, maxGapMin = FIB_ATLAS_MONDAY_MAX_GAP_MIN } = {}) {
  const nowSec = Date.now() / 1000;
  const zones = [];
  for (const rung of live.ladder) {
    const vd = voteDecision(book, rung);
    if (!vd || vd.margin < minMargin) continue;
    // See Asia's identical doc — lastTouchTime is always real here too,
    // since margin>=2 structurally requires prevOutcomeSameDay.
    if (maxGapMin != null && rung.lastTouchTime != null) {
      const gapMin = (nowSec - rung.lastTouchTime) / 60;
      if (gapMin > maxGapMin) continue;
    }
    const { innerDistPips, outerDistPips } = mondayRungBarrierPips(rung.side, rung.level, live.boundary, rung.pip);
    const targetPips = vd.decision === 'fade' ? innerDistPips : outerDistPips;
    const sizingStopPips = vd.decision === 'fade' ? outerDistPips : innerDistPips;
    if (targetPips == null || sizingStopPips == null) continue;
    if (cost > 0 && minCostRatio > 1) {
      const targetPnlPct = targetPips * rung.pip / rung.price * 100;
      if (targetPnlPct / cost < minCostRatio) continue;
    }
    const stopPips = (vd.decision === 'fade' && stopTightenFrac != null && stopTightenFrac < 1)
      ? +(sizingStopPips * stopTightenFrac).toFixed(1) : sizingStopPips;
    const sgn = rung.side === 'above' ? 1 : -1;
    const sl = rung.price - sgn * stopPips * rung.pip;
    const sizingSl = rung.price - sgn * sizingStopPips * rung.pip;
    const tp = rung.price + sgn * targetPips * rung.pip;
    zones.push({
      side: rung.side, rung: rung.level, decision: vd.decision, margin: vd.margin,
      entry: rung.price, sl: +sl.toFixed(6), sizingSl: +sizingSl.toFixed(6), tp: +tp.toFixed(6),
      targetPips, stopPips, sizingStopPips, pip: rung.pip, rearmFrac: DEFAULT_REARM,
      touchedToday: rung.touchedToday,
      dedupeTag: `m_${rung.side[0]}${rung.level}`,   // "m" prefix — see Asia's own dedupeTag doc
      rationale: `${vd.decision} · margin ${vd.margin} (${vd.outVotes} out / ${vd.backVotes} back)`,
    });
  }
  return zones;
}
