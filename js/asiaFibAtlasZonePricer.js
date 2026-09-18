/**
 * asiaFibAtlasZonePricer.js — the pure rung-pricing core of Asia Fib Atlas's
 * live plan, extracted (2026-09-18) out of `asiaFibAtlasRoutes.js` so it can
 * be imported WITHOUT pulling in that file's kv.js/r2Store.js/OANDA-touching
 * transitive dependencies. `asiaFibAtlasRoutes.js` re-exports everything
 * here unchanged, so this is a pure relocation, not a behavior change —
 * every existing importer (`botAuditRoutes.js`, `mondayFibAtlasRoutes.js`,
 * `server.js`) keeps working exactly as before.
 *
 * WHY THIS SPLIT EXISTS: `fib_local_decision_engine/` (the same fix already
 * built for Vote Atlas — see `MD files/LOCAL_DECISION_ENGINE_ARCHITECTURE.md`)
 * runs on the trading machine next to MT5 and must NEVER hold a Railway/KV/
 * R2/OANDA credential. It needs `zonesFromLiveAndBook` — the exact function
 * the live bot's plan is priced with — without dragging in anything
 * credentialed. Moving the pure function here (rather than reimplementing
 * it a second time) means the local engine and the Railway plan producer
 * can never silently drift apart.
 */
import { voteDecision } from './asiaFibAtlasVoteReview.js';
import { asiaRungBarrierPips } from './asiaFibAtlasEngine.js';

export const DEFAULT_REARM = 0.3;

export const FIB_ATLAS_MIN_MARGIN = 2;                 // best-config frozen value (asia-fib-atlas-vote-portfolio.html's loadBestConfigBtn)
export const FIB_ATLAS_MIN_COST_RATIO = 3;              // Asia's own frozen ratio (fib_atlas_cost_efficiency_filter.mjs)
export const FIB_ATLAS_STOP_TIGHTEN_FRAC = 0.9;         // frozen fraction (fib_atlas_sl_tightening_backtest.mjs)
// Whiplash-gap filter (2026-09-03, owner-validated — see LEGO_MODULES.md's
// fib_atlas_gap_filter_backtest.mjs entry): requires a rung's touch to fall
// within this many minutes of that SAME rung's own prior touch this
// session, on top of the existing margin>=2 vote. Asia's own optimum (26/26
// pairs agree, pooled Sharpe peaks here and falls at every wider cutoff
// tested) — Monday's is a different, much wider value (its own ladder
// trades far less densely), see mondayFibAtlasZonePricer.js.
export const FIB_ATLAS_MAX_GAP_MIN = 30;

// Pure core: given an ALREADY-COMPUTED `live` (the shape asiaFibAtlasLiveLadder/
// getFastLive returns: {date, currentPrice, boundary, ladder}) and `book`,
// price every rung into zones. Extracted (2026-09-01) so a SECOND caller —
// the nightly rebuild, which already builds a fresh `live`+`book` inside
// `runOne` and can seed the bot's plan straight from that, no live-
// cache round-trip needed — can reuse the EXACT same scoring/pricing rules
// `asiaLivePlanZones` (the live-cache-backed wrapper in asiaFibAtlasRoutes.js)
// uses, never a second implementation to drift out of sync. A THIRD caller
// (2026-09-18) is `fib_local_decision_engine/lib/zonePricer.mjs`, for the
// same reason.
export function zonesFromLiveAndBook(live, book, cost, { minMargin = FIB_ATLAS_MIN_MARGIN, minCostRatio = FIB_ATLAS_MIN_COST_RATIO, stopTightenFrac = FIB_ATLAS_STOP_TIGHTEN_FRAC, maxGapMin = FIB_ATLAS_MAX_GAP_MIN } = {}) {
  const nowSec = Date.now() / 1000;
  const zones = [];
  for (const rung of live.ladder) {
    const vd = voteDecision(book, rung);
    if (!vd || vd.margin < minMargin) continue;
    // `lastTouchTime` is null exactly when prevOutcomeSameDay is null (same
    // lookup, asiaFibAtlasEngine.js's own asiaFibAtlasLiveLadder) — and
    // margin>=2 structurally requires prevOutcomeSameDay to hold (it's one
    // of only two VOTE_DIMS), so a zone reaching this point always HAS a
    // real lastTouchTime. Still guarded with `!= null` rather than assumed,
    // same defensive style as every other field read off `rung` here.
    if (maxGapMin != null && rung.lastTouchTime != null) {
      const gapMin = (nowSec - rung.lastTouchTime) / 60;
      if (gapMin > maxGapMin) continue;
    }
    const { innerDistPips, outerDistPips } = asiaRungBarrierPips(rung.side, rung.level, live.boundary, rung.pip);
    const targetPips = vd.decision === 'fade' ? innerDistPips : outerDistPips;
    const sizingStopPips = vd.decision === 'fade' ? outerDistPips : innerDistPips;
    if (targetPips == null || sizingStopPips == null) continue;   // 'follow' at the outermost rung -- no real stop, don't publish it
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
      // Short, stable per-(side,level) tag for Mt5Broker.enter's dedupe_tag —
      // "a" prefix disambiguates from Monday's own zones on the SAME pair
      // (asiaLivePlanZones/mondayLivePlanZones share nothing else that would
      // collide, but a live bot trading BOTH ladders on one instrument needs
      // this). Well under MT5's 31-char comment cap.
      dedupeTag: `a_${rung.side[0]}${rung.level}`,
      rationale: `${vd.decision} · margin ${vd.margin} (${vd.outVotes} out / ${vd.backVotes} back)`,
    });
  }
  return zones;
}
