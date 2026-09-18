/**
 * zonePricer.mjs — Fib Atlas's own copy of the local decision engine's core,
 * mirroring `local_decision_engine/lib/zonePricer.mjs` (built for Vote Atlas
 * v3, 2026-09-18 — see MD files/LOCAL_DECISION_ENGINE_ARCHITECTURE.md for
 * the full rationale and the "For the Fib Atlas session" handoff).
 *
 * Option A from that handoff (fork sideways, not a shared multi-strategy
 * engine): Fib Atlas already keeps its live-plan pricing in a genuinely pure
 * function — `zonesFromLiveAndBook` — in `js/asiaFibAtlasZonePricer.js` /
 * `js/mondayFibAtlasZonePricer.js` (extracted 2026-09-18 FROM
 * asiaFibAtlasRoutes.js/mondayFibAtlasRoutes.js specifically so this file
 * could import them without dragging in kv.js/r2Store.js/OANDA — see those
 * two files' own header doc). This file imports them VERBATIM, same
 * discipline as Vote Atlas's build: no second implementation of
 * voteDecision/asiaRungBarrierPips/mondayRungBarrierPips to silently drift.
 *
 * Two ladders, not one — every export here takes a `ladder` ('asia' |
 * 'monday') as its first argument.
 */
import { asiaFibAtlasLiveLadder } from '../../js/asiaFibAtlasEngine.js';
import { mondayFibAtlasLiveLadder } from '../../js/mondayFibAtlasEngine.js';
import { zonesFromLiveAndBook as asiaZonesFromLiveAndBook } from '../../js/asiaFibAtlasZonePricer.js';
import { zonesFromLiveAndBook as mondayZonesFromLiveAndBook } from '../../js/mondayFibAtlasZonePricer.js';
import { assetClass as assetClassOf } from '../../js/instrumentRegistry.js';
import { costForPair } from '../../js/perLineStrategy.js';
import { majorEventEpochs } from '../../js/calendarLoader.js';

export const DEFAULT_REARM = 0.3;

// KNOWN, DELIBERATE GAP (2026-09-18, disclosed rather than silently
// approximated): Asia's server-side live ladder (getFastLive,
// asiaFibAtlasRoutes.js) also feeds `ivByDate` (CVOL implied-vol series,
// js/cvolLoader.js) into `asiaFibAtlasLiveToday`'s touch classification.
// cvolLoader.js reads a local parquet file via hyparquet — vendoring that
// data file onto the trading machine is a real option, just not done in
// this first cut. Omitting it here only affects TODAY's already-resolved
// touches' dimension classification (prevOutcomeSameDay itself is still
// exact — it's read from the SAME walk, just without one contributing
// dimension being available for it) — never the rung price/level/side
// math. Same category of residual gap Vote Atlas v3's own parity_test.mjs
// found and deferred to paper-validation to characterize (~1-margin-point
// discrepancy on one touch) rather than chase before any real data existed.
// `majorEventEpochs()` (below) reads a local static file (no R2/network),
// so that one IS included.

function computeLiveLadder(ladder, pair, packed) {
  const sym = pair.toUpperCase();
  const assetCls = (() => { try { return assetClassOf(pair); } catch { return 'fx'; } })();
  if (ladder === 'asia') {
    const macroEvents = majorEventEpochs();
    return asiaFibAtlasLiveLadder(packed, { instrument: sym, assetClass: assetCls, rearmFrac: DEFAULT_REARM, ivByDate: null, macroEvents });
  }
  return mondayFibAtlasLiveLadder(packed, { instrument: sym, assetClass: assetCls, rearmFrac: DEFAULT_REARM });
}

// Mirrors asiaLivePlanZones/mondayLivePlanZones (js/asiaFibAtlasRoutes.js,
// js/mondayFibAtlasRoutes.js) exactly, given a LOCAL book + LOCAL packed M1
// series instead of R2 + getFastLive's remote warm cache — the whole point:
// a decision computed fresh at call time, not served from the 45-second
// snapshot `fib_atlas_bot_plan` normally carries.
export function computeZones(ladder, pair, { book, packed, opts = {} } = {}) {
  if (ladder !== 'asia' && ladder !== 'monday') throw new Error(`unknown ladder: ${ladder}`);
  if (!packed?.n) return { skipped: 'no local M1 cached — run sync.mjs first', zones: [], zoneCount: 0 };
  const live = computeLiveLadder(ladder, pair, packed);
  if (!live.date) return { skipped: 'no live coverage yet', zones: [], zoneCount: 0 };
  if (!book?.cells) return { skipped: 'no local book cached — run sync.mjs first', zones: [], zoneCount: 0 };

  const assetCls = (() => { try { return assetClassOf(pair); } catch { return 'fx'; } })();
  const cost = (() => { try { return costForPair(pair, assetCls); } catch { return 0; } })();
  const zonesFromLiveAndBook = ladder === 'asia' ? asiaZonesFromLiveAndBook : mondayZonesFromLiveAndBook;
  const zones = zonesFromLiveAndBook(live, book, cost, opts);
  return { spot: live.currentPrice, date: live.date, boundary: live.boundary, zones, zoneCount: zones.length };
}
