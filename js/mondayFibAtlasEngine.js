/**
 * Monday Fib Atlas engine (2026-08-27) — Asia Fib Atlas's own sibling for
 * the WEEKLY range-extension ladder ("Monday to Monday is its own levels
 * which only needs drawing once a week and persist the week" — the owner's
 * own framing). Flagged as a deferred next layer since the original Asia
 * Fib Atlas build ("Monday's own ladder never gets its OWN touch events
 * here — it's only ever read as context for an Asia-rung touch") — this is
 * that layer, built now for the vote-margin trade backtest.
 *
 * One row = one touch of one Monday-range extension rung (mirrors Asia Fib
 * Atlas's own unit exactly — same fib grid via `RUNGS_ABOVE`/`RUNGS_BELOW`,
 * same race-to-neighbour barrier resolution, same rearm mechanics). NOT a
 * copy-paste of `asiaFibAtlasWalk` — that function's per-DAY re-derivation
 * (dayVol/CVOL/HTF/confluence/macro-event context, ~30 dimensions) doesn't
 * apply to a ladder that only forms once a week, and re-deriving it all here
 * would risk drifting from that already-validated, tested engine for no
 * benefit. This engine is DELIBERATELY leaner — it computes only the fields
 * the vote-margin backtest actually needs (`prevOutcomeSameDay`,
 * `sessionHandoff`, plus the barrier-pricing fields every touch needs), not
 * the full ~30-dimension reference-book richness Asia Fib Atlas ships. A
 * richer Monday reference book (weekly-vol regime, its own confluence track,
 * etc.) is a real future layer, not built here — this is scoped to exactly
 * what was asked: widen the vote backtest to the Monday ladder.
 *
 * `prevOutcomeSameDay` REUSES Level Atlas's/Asia Fib Atlas's own field name
 * on purpose (not `prevOutcomeSameWeek`) — `js/asiaFibAtlasVoteReview.js`'s
 * `voteDecision`/`buildBarrierTrades`/`runBarrierWalkForward` all read that
 * exact field name and are otherwise completely engine-agnostic (same trick
 * `matchLiveContext`'s `keyField` generalization already established), so
 * this engine's touches plug straight into that SAME module — no
 * `mondayFibAtlasVoteReview.js` needed. The field's MEANING here is "did
 * this exact rung already resolve earlier in the SAME REFERENCE WEEK", the
 * weekly analogue of Asia's "same day" — see the walk-window comment below
 * for exactly which week that is.
 *
 * Reused, never re-derived: `buildMondayRanges` (sessionRanges.js — the
 * SAME weekly range builder Asia Fib Atlas's own `mondayWeekTightestPips`
 * context already uses), `calcFibs`/`FIB_LEVELS` (fibProjection.js),
 * `RUNGS_ABOVE`/`RUNGS_BELOW`/`SIDES`/`sessionOf`/`sessionHandoffPhase`
 * (imported straight from `asiaFibAtlasEngine.js`, all now exported
 * specifically for this reuse), `pipSize` (instrumentRegistry.js),
 * `extractBars` (barUtils.js).
 */
import { pipSize } from './instrumentRegistry.js';
import { extractBars } from './barUtils.js';
import { buildMondayRanges } from './sessionRanges.js';
import { RUNGS_ABOVE, RUNGS_BELOW, SIDES, sessionOf, sessionHandoffPhase } from './asiaFibAtlasEngine.js';

/**
 * mondayFibAtlasWalk(packed, opts) -> { touches, coverage }
 *
 * `opts`: { instrument, assetClass='fx', rearmFracs=[0.3], minLookback=5,
 *   extendResolutionDays=0 }
 *
 * `extendResolutionDays` (2026-08-31, default 0 = off, fully backward
 * compatible — see asiaFibAtlasWalk's own doc for the full mechanism and
 * reasoning, mirrored here): a touch unresolved even after the existing
 * ~8-day window is currently `outcome:'neither'` and dropped entirely
 * (~3.3-3.5% of touches, analysis/fib_atlas_monday_neither_extend_test.mjs).
 * Setting this > 0 continues the SAME race logic that many more days
 * beyond the existing window. Unlike Asia's `nextSessionBuildHrs`, Monday's
 * concurrency cap doesn't need a separate parameter — the EXISTING `winEnd`
 * (this Monday's own 8-day window) already sits almost exactly at the next
 * Monday's own fresh-range boundary, so `concurrencyResolveTime` always
 * caps there regardless of extension length, letting a still-open extended
 * trade keep searching for a real resolution without ever blocking next
 * week's fresh touches.
 */
export function mondayFibAtlasWalk(packed, { instrument, assetClass = 'fx', rearmFracs = [0.3], minLookback = 5, extendResolutionDays = 0 } = {}) {
  const sym = String(instrument).toUpperCase();
  let pip = 1; try { pip = pipSize(instrument) || 1; } catch { /* unknown symbol -> raw price units */ }

  const mondayRanges = buildMondayRanges(packed, 'london');
  if (mondayRanges.length <= minLookback) return { touches: [], coverage: null };

  const touches = [];
  // `${side}|${level}|${rearmFrac}` -> last <=3 visits, for the same-
  // reference-week repeat check below.
  const lastVisit = {};

  for (let i = minLookback; i < mondayRanges.length; i++) {
    const mon = mondayRanges[i];

    // ── Walk window: Tuesday 00:00 (Monday's own 24h box has just closed)
    // through the END of the FOLLOWING Monday — a full 7-day reference
    // week, matching the SAME "Tuesday -> following Monday inclusive"
    // cycle `asiaFibAtlasEngine.js`'s own `mondayForDay`/`isMonday`
    // redirect already establishes (a touch occurring on the following
    // Monday itself still reads as belonging to THIS week's box, since
    // that day's own new box isn't resolved until ITS OWN close — see that
    // engine's header for the full reasoning; this window matches it
    // exactly rather than re-deriving a different convention). ──
    const winStart = mon.epoch + 24 * 3600;
    const winEnd = mon.epoch + 8 * 86400;
    const bars = extractBars(packed, winStart, winEnd);
    if (bars.length < 10) continue;
    // Extended-resolution search bars (2026-08-31) -- ONLY the outcome race
    // below reads this. Fetched once per Monday index (shared by every
    // side/rung/rearmFrac combination), not per touch.
    const extBars = extendResolutionDays > 0 ? extractBars(packed, winEnd, winEnd + extendResolutionDays * 86400) : null;

    for (const side of SIDES) {
      const isAbove = side === 'above';
      const rungLevels = isAbove ? RUNGS_ABOVE : RUNGS_BELOW;
      const boundaryPrice = isAbove ? mon.high : mon.low;
      const rungPrice = lv => mon.low + mon.range * lv;
      const lv = [boundaryPrice, ...rungLevels.map(rungPrice)];
      const reach = (px, target) => (isAbove ? px >= target : px <= target);

      for (const rearmFrac of rearmFracs) {
        for (let ri = 0; ri < rungLevels.length; ri++) {
          const level = rungLevels[ri];
          const here = lv[ri + 1], inner = lv[ri], outer = lv[ri + 2] ?? null;
          const rungSpan = Math.abs(here - inner);
          if (!(rungSpan > 0)) continue;
          const rearmDist = rearmFrac * rungSpan;

          let armed = true;
          for (let k = 0; k < bars.length; k++) {
            const bar = bars[k];
            const px = isAbove ? bar.high : bar.low;
            if (!armed) {
              const away = isAbove ? (here - bar.close) : (bar.close - here);
              if (away >= rearmDist) armed = true;
              continue;
            }
            if (!reach(px, here)) continue;
            armed = false;

            // ── Outcome: race the two real neighbours from this touch —
            // IDENTICAL mechanics to asiaFibAtlasWalk's own resolution loop.
            let outcome = 'neither', deepest = here, resolveTime = null, extreme = here;
            for (let j = k; j < bars.length; j++) {
              const b2 = bars[j];
              const fwd = isAbove ? b2.high : b2.low, bwd = isAbove ? b2.low : b2.high;
              if (isAbove ? bwd < deepest : bwd > deepest) deepest = bwd;
              if (isAbove ? fwd > extreme : fwd < extreme) extreme = fwd;
              if (outer != null && reach(fwd, outer)) { outcome = 'out'; resolveTime = b2.time; break; }
              if (isAbove ? bwd <= inner : bwd >= inner) { outcome = 'back'; resolveTime = b2.time; break; }
            }
            // Extended search (2026-08-31) -- only reached when the
            // existing-window race above never resolved AND extension is
            // enabled. Same race logic, continuing into bars beyond winEnd.
            if (outcome === 'neither' && extBars) {
              for (const b2 of extBars) {
                const fwd = isAbove ? b2.high : b2.low, bwd = isAbove ? b2.low : b2.high;
                if (isAbove ? bwd < deepest : bwd > deepest) deepest = bwd;
                if (isAbove ? fwd > extreme : fwd < extreme) extreme = fwd;
                if (outer != null && reach(fwd, outer)) { outcome = 'out'; resolveTime = b2.time; break; }
                if (isAbove ? bwd <= inner : bwd >= inner) { outcome = 'back'; resolveTime = b2.time; break; }
              }
            }
            // Concurrency occupancy caps at the EXISTING winEnd regardless
            // of extension -- that boundary already sits almost exactly at
            // next week's fresh-range start, so it's always the right cap.
            const concurrencyResolveTime = resolveTime != null ? Math.min(resolveTime, winEnd) : null;
            const sgn = isAbove ? 1 : -1;
            const fadePips = (here - deepest) / pip * sgn;
            const runPips = (extreme - here) / pip * sgn;
            const innerDistPips = rungSpan / pip;
            const outerDistPips = outer != null ? Math.abs(outer - here) / pip : null;
            const minsToResolve = resolveTime != null ? (resolveTime - bar.time) / 60 : null;
            const pullbackFrac = rungSpan > 0 ? Math.min(1, Math.abs(here - deepest) / rungSpan) : null;

            const hourUtc = new Date(bar.time * 1000).getUTCHours();
            const session = sessionOf(hourUtc);
            const sessionHandoff = sessionHandoffPhase(hourUtc);
            const barDate = new Date(bar.time * 1000).toISOString().slice(0, 10);

            const key = `${side}|${level}|${rearmFrac}`;
            const hist = lastVisit[key] ?? [];
            const prev = hist.at(-1) ?? null;
            // "Same reference week" = same Monday index `i`, not same
            // calendar date (a touch Wednesday and one the following
            // Monday can both belong to week `i`).
            const prevOutcomeSameDay = (prev && prev.weekIdx === i && prev.outcome !== 'neither') ? prev.outcome : null;

            touches.push({
              instrument: sym, assetClass, date: barDate, mondayDate: mon.date,
              side, level, rearmFrac,
              price: +here.toFixed(6), pip,
              time: bar.time, resolveTime, concurrencyResolveTime, outcome,
              minsToResolve: minsToResolve != null ? +minsToResolve.toFixed(0) : null,
              pullbackFrac: pullbackFrac != null ? +pullbackFrac.toFixed(3) : null,
              fadePips: +fadePips.toFixed(1), runPips: +runPips.toFixed(1),
              innerDistPips: +innerDistPips.toFixed(1), outerDistPips: outerDistPips != null ? +outerDistPips.toFixed(1) : null,
              session, sessionHandoff,
              prevOutcomeSameDay,
              mondayHigh: mon.high, mondayLow: mon.low, mondayRange: mon.range,
            });
            lastVisit[key] = [...hist, { outcome, weekIdx: i }].slice(-3);
          }
        }
      }
    }
  }

  return {
    touches,
    coverage: { from: mondayRanges[minLookback]?.date, to: mondayRanges.at(-1)?.date, weeks: mondayRanges.length - minLookback },
  };
}

/**
 * mondayFibAtlasLiveToday(packed, opts) -> { touches, mondayDate, coverage }
 *
 * This WEEK's touches-so-far — mirrors `asiaFibAtlasLiveToday`'s exact
 * pattern (re-walk, filter down to the latest reference cycle) but keyed by
 * `mondayDate` (the governing Monday) instead of calendar `date`, since a
 * single reference week spans up to 7 different calendar dates.
 */
export function mondayFibAtlasLiveToday(packed, opts = {}) {
  const { touches } = mondayFibAtlasWalk(packed, { ...opts, rearmFracs: [opts.rearmFrac ?? 0.3] });
  const mondayRanges = buildMondayRanges(packed, 'london');
  const lastMondayDate = mondayRanges.at(-1)?.date ?? null;
  const thisWeek = lastMondayDate ? touches.filter(t => t.mondayDate === lastMondayDate) : [];
  return { touches: thisWeek, mondayDate: lastMondayDate };
}

/**
 * Live ladder (2026-08-28) — Asia Fib Atlas's own `asiaFibAtlasLiveLadder`,
 * mirrored for the weekly Monday range: the full fib-extension grid for the
 * CURRENT reference week's Monday range, each rung annotated with distance
 * from live price and this engine's own two live signals (`prevOutcomeSameDay`
 * — reused field name, means "already resolved earlier THIS WEEK" here — and
 * the current `sessionHandoff` bucket). Deliberately keeps `touchedToday` as
 * the field name too (not `touchedThisWeek`) so `asia-fib-atlas-live.html`'s
 * existing row-dimming/CSS logic works unchanged on either ladder — same
 * reused-field-name trick this whole engine is built around (see the module
 * header). `matchLiveContext(book, liveTouch, {keyField:'level', dimLabels})`
 * does the actual scoring against a precomputed Monday book, unchanged — it
 * already reads whatever dims are present, and this book only ever carries
 * the two Monday touches populate.
 */
export function mondayFibAtlasLiveLadder(packed, opts = {}) {
  const { instrument, rearmFrac = 0.3 } = opts;
  if (!packed?.n) return { date: null, currentPrice: null, sessionHandoff: null, boundary: null, ladder: [] };

  const mondayRanges = buildMondayRanges(packed, 'london');
  const mon = mondayRanges.at(-1);
  if (!mon) return { date: null, currentPrice: null, sessionHandoff: null, boundary: null, ladder: [] };

  const lastBarTime = packed.times[packed.n - 1];
  const currentPrice = packed.closes[packed.n - 1];
  const hourUtc = new Date(lastBarTime * 1000).getUTCHours();
  const currentSessionHandoff = sessionHandoffPhase(hourUtc);
  const pip = pipSize(instrument ?? '');

  const { touches: weekTouches, mondayDate } = mondayFibAtlasLiveToday(packed, { ...opts, rearmFrac });
  const lastOutcomeByKey = new Map();
  for (const t of weekTouches) {
    if (t.outcome === 'neither') continue;   // unresolved — carries no signal yet
    lastOutcomeByKey.set(`${t.side}|${t.level}`, t.outcome);
  }

  const ladder = [];
  for (const side of SIDES) {
    const rungLevels = side === 'above' ? RUNGS_ABOVE : RUNGS_BELOW;
    for (const level of rungLevels) {
      const price = mon.low + mon.range * level;   // same formula the walk itself uses — never a second derivation
      const prevOutcomeSameDay = lastOutcomeByKey.get(`${side}|${level}`) ?? null;
      const dist = Math.abs(currentPrice - price);
      ladder.push({
        instrument, side, level, price: +price.toFixed(6), pip,
        distance: +dist.toFixed(6), distancePips: pip > 0 ? +(dist / pip).toFixed(1) : null,
        touchedToday: prevOutcomeSameDay != null,
        prevOutcomeSameDay, sessionHandoff: currentSessionHandoff,
      });
    }
  }
  ladder.sort((a, b) => a.distance - b.distance);

  return {
    date: mondayDate, currentPrice: +currentPrice.toFixed(6), sessionHandoff: currentSessionHandoff,
    boundary: { mondayHigh: mon.high, mondayLow: mon.low, mondayRange: mon.range },
    ladder,
  };
}
