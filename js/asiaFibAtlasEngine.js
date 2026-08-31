/**
 * Asia Fib Atlas — the comprehensive per-touch REFERENCE engine for the Asia
 * range-extension fib ladder ("Asia Session Fib Retracement" Pine indicator /
 * education/range-extension-levels-notes.md). Level Atlas's sibling for range
 * lines, not forecast lines — same template (MD files/REFERENCE_ENGINE_PLAYBOOK.md),
 * genuinely different unit (§2 of that doc: don't force a new question into an
 * existing unit just because the plumbing is there).
 *
 * ── THE UNIT (one sentence) ───────────────────────────────────────────────────
 * One row = one touch of one Asia-range extension rung (a fib multiple outside
 * [0,1] — the 0/0.25/0.5/0.75/1 KEY_LEVELS are the range box itself, not
 * extension zones, and are deliberately excluded from the walk), on a given
 * side, at a given re-arm definition, with everything true at that instant
 * plus what happened next (does price reach the next rung further out, or
 * revert to the rung/boundary just inside it).
 *
 * ── WHAT THIS IS, AND ISN'T ───────────────────────────────────────────────────
 * A QUANT REFERENCE BOOK, not a signal search — see levelAtlasEngine.js's own
 * header for the same disclaimer, which applies identically here. No after-cost
 * filter, no "is this tradeable" gate. A cell that fires 38% of the time is a
 * complete, useful entry, not a rejected hypothesis.
 *
 * ── COMPOSES, COPIES NOTHING (Lego Principle, MD files/CLAUDE.md) ────────────
 *   `sessionRanges.js`        — the Asia (00:00-06:00 London, body hi/lo) and
 *                                Monday (full Monday, body hi/lo) ranges,
 *                                canonical, "closes = acceptance" per the
 *                                lesson notes
 *   `fibProjection.js`        — the 45-level extension grid + `low+range×level`
 *                                projection, the SAME grid the Pine indicator draws
 *   `confluence-core.js`      — `detectConfluencesCore`, the Pine-Script-matching
 *                                confluence matcher (clusterMerge:false,
 *                                priceMode:'lowest', the same session-range-capped
 *                                tolerance formula) — never a local re-derivation
 *   `confluenceFeatures.js`   — VuManChu MTF/1h/4h, VWAP side, structural
 *                                confluence, ADX, candle reject, volume climax,
 *                                round number — the SAME touch-feature pack
 *                                Level Atlas uses, at the touch bar only
 *   `rangeLineAnalyser.js`    — `sessionConfluenceLevels`/`DAILY_CONFLUENCE_SOURCES`,
 *                                structural (pivot/prior-hilo/volume-profile) confluence
 *   `forecastLadder`/`forecastSigma` — the SAME daily vol estimate Level Atlas
 *                                fits, reused here for `dayVol` and `rangeBudgetUsedPct`
 *   `instrumentRegistry.js`   — pip size (fixes the gold 1.0-vs-0.1 inconsistency
 *                                documented in LEGO_MODULES.md between asiaRangeEngine
 *                                and rangeFibEngine — this engine has ONE pip source)
 *   `cvolLoader.js`           — CVOL implied-vol settle, the SAME parquet reader
 *                                and one-day-lag discipline levelAtlasEngine.js uses
 *   `rangeBiasCore.js`        — `computeWeeklyPivots` (classic PP/R1/R2/S1/S2, a
 *                                second structural level family), `computeHurst`
 *                                (trailing R/S estimator), `featureSwingRegime`
 *                                (HTF CHoCH/BOS structure) — three bricks already
 *                                live in `levels.js`/`asiaRangeEngine`, none
 *                                previously wired into this engine
 *   `barUtils.js`             — `resamplePacked` for the once-per-instrument 30m
 *                                series `featureSwingRegime` reads (same pattern
 *                                `confluenceFeatures.createHtfContext` uses for its
 *                                15m/1h/4h series — never a per-touch resample,
 *                                which would be O(n²) over a multi-year walk)
 *   `calendarLoader.js`       — `majorEventEpochs()`, the local economic-calendar
 *                                CSV — SCHEDULE ONLY (date/time/currency/impact
 *                                tier), never the outcome columns; see that
 *                                file's own header for why a future scheduled
 *                                date is not lookahead the way future price is
 *
 * ── DELIBERATELY *NOT* REUSED — a documented near-miss, not an oversight ─────
 * `levelAtlasEngine.js`'s own `sessionRangeSeries`/`sessionVolBucket` measure a
 * UTC 22:00-07:00 "Asia" window (that engine's own session-classification
 * convention). The range-extension lesson's Asia window is LONDON 00:00-06:00
 * (`sessionRanges.buildAsiaSessions`) — a genuinely different boundary. Reusing
 * Level Atlas's helpers here would silently label this engine's vol regime
 * against the WRONG window (same numbers, wrong session), so `asiaVolBucket`
 * below is a small fresh implementation over THIS engine's own Asia sessions,
 * not a copy of the same formula on the same data (§3.4 of the Lego Principle
 * is about not duplicating the same computation — this is a different one that
 * happens to share a name).
 *
 * ── CONFLUENCE: TWO INDEPENDENT TRACKS, NOT A CROSS-COMPARISON ────────────────
 * Corrected 2026-08-26 (owner review): the original Pine indicator computes
 * TWO SEPARATE confluence checks — Asia(today) vs Asia(previous day), and
 * Monday(this week) vs Monday(the week before) — it never cross-compares
 * Asia fibs to the Monday ladder. An earlier version of this engine did
 * exactly that (checked today's Asia rungs against the Monday ladder AND
 * folded the result into one conflated `confluenceGrade`), which is a real
 * mismatch from the source strategy, not a refinement of it. Now:
 *   (1) `confluenceGrade`/`asiaConfPips` — Asia vs previous Asia ONLY, the
 *       core track, matching the indicator exactly.
 *   (2) `mondayWeekTightestPips`/`mondayWeekZone` — Monday vs the previous
 *       Monday, entirely independent of Asia, computed once per WEEK (same
 *       value for every touch Mon-Fri that week — drawn once, persists).
 *   (3) `mondayCrossPips`/`mondayCrossZone` — does today's Asia rung land
 *       near the Monday ladder anyway? Real, kept as an EXPLORATORY field,
 *       but deliberately never blended into (1)'s grade.
 * `asiaConfPips`/`mondayCrossPips`/`mondayWeekTightestPips` are the actual
 * pip gap to the nearest matching prior-cycle level, always reported (never
 * threshold-gated) — the real "zone for analysis of activity": the book can
 * show reaction as a smooth function of tightness, not a pre-filtered
 * yes/no. `confluenceGrade` stays as a categorical companion (mirrors the
 * indicator's own green/orange distinction) but is one dimension among many
 * below, never the sole thing a finding gets attributed to.
 *
 * ── NO-LOOKAHEAD CONTRACT ─────────────────────────────────────────────────────
 * The extension ladder for day D is fixed at Asia's own close (06:00 London) —
 * every rung price is known before any touch in the walk window can occur, so
 * (unlike Level Atlas's forecast lines, which exist before the session starts)
 * there is no "touch inside an incomplete session" case for TODAY's own Asia
 * range: the ladder simply doesn't exist yet during Asia itself. The two
 * REMAINING lookahead risks this engine must still guard, both handled below:
 *   - Monday's range is only read once Monday has itself fully closed, and on
 *     a Monday touch the PREVIOUS week's (fully complete) Monday is used
 *     instead of the current, still-forming one — exactly the Pine script's
 *     own `is_current_monday ? prev_monday : curr_monday` rule.
 *   - `dayVol`/`rangeBudgetUsedPct` fit σ on `d1.slice(0, i)` (days strictly
 *     before today), never on today's own eventual range.
 * `prevAsiaVolBucket`/`asiaVolBucket` use only Asia ranges STRICTLY BEFORE the
 * one being walked (today's Asia range is deliberately excluded from its own
 * trailing-median history).
 *
 * Pure: no network, no I/O, no `Date.now()`/`Math.random()`. Callers supply
 * packed M1 (+ instrument/assetClass config), same contract as levelAtlasEngine.
 */

import { bucketM1IntoSessions } from './forecastAnalyser.js';
import { buildLadder } from './forecastLadder.js';
import { LADDER_PARAMS } from './forecastLadderParams.js';
import { forecastSigma } from './forecastSigma.js';
import { createHtfContext, createConfluenceFeatures } from './confluenceFeatures.js';
import { sessionConfluenceLevels, DAILY_CONFLUENCE_SOURCES } from './rangeLineAnalyser.js';
import { pipSize } from './instrumentRegistry.js';
import { extractBars, resamplePacked, bisect } from './barUtils.js';
import { buildAsiaSessions, buildMondayRanges, prevSession, mondayForDay, prevMonday, dowOf } from './sessionRanges.js';
import { FIB_LEVELS, KEY_LEVELS, calcFibs } from './fibProjection.js';
import { detectConfluencesCore } from './confluence-core.js';
import { computeWeeklyPivots, computeHurst, featureSwingRegime } from './rangeBiasCore.js';
import { cvolSeries } from './cvolLoader.js';

// ── Extension rungs, derived from the shared grid (never hand-copied) ────────
// "above" = extensions above the range (level > 1, short-consideration zones);
// "below" = extensions below the range (level < 0, long-consideration zones).
// Each ordered INNERMOST -> OUTERMOST so index i's neighbours are i-1 (inner)
// and i+1 (outer), same shape as levelAtlasEngine's RUNGS ladder.
export const RUNGS_ABOVE = FIB_LEVELS.filter(l => l > 1).sort((a, b) => a - b);
export const RUNGS_BELOW = FIB_LEVELS.filter(l => l < 0).sort((a, b) => b - a);
export const SIDES = ['above', 'below'];
export const REARM_FRACS = [0.15, 0.30, 0.50];

// Per-instrument confluence tolerance (pips, or "points" for gold/indices) —
// mirrors js/utils.js:getConfluenceThreshold's DEFAULT table. Not imported:
// that function reads a live DOM/settings global (`S._caps`), which is not a
// pure, Node-testable input — same "keep in sync if either changes" caveat
// the Pine indicator's own header already carries for this exact table.
const CONFLUENCE_PIPS_DEFAULT = {
  fx: 2, gold: 20, nas100: 100, spx500: 25, de30: 80, uk100: 40, us30: 60, us2000: 15,
};
function confluenceThresholdPips(instrument) {
  const s = String(instrument).toUpperCase();
  if (s.includes('XAU') || s.includes('GOLD')) return CONFLUENCE_PIPS_DEFAULT.gold;
  if (s.includes('NAS100') || s.includes('USTEC') || s.includes('NDX')) return CONFLUENCE_PIPS_DEFAULT.nas100;
  if (s.includes('SPX500') || s.includes('US500') || s.includes('SP500')) return CONFLUENCE_PIPS_DEFAULT.spx500;
  if (s.includes('DE30') || s.includes('DAX') || s.includes('GER40')) return CONFLUENCE_PIPS_DEFAULT.de30;
  if (s.includes('UK100') || s.includes('FTSE')) return CONFLUENCE_PIPS_DEFAULT.uk100;
  if (s.includes('US30') || s.includes('DJI') || s.includes('WALLST')) return CONFLUENCE_PIPS_DEFAULT.us30;
  if (s.includes('US2000') || s.includes('RUT') || s.includes('RUSSELL')) return CONFLUENCE_PIPS_DEFAULT.us2000;
  return CONFLUENCE_PIPS_DEFAULT.fx;
}

// Raw nearest-pip distance from one PRICE to ANY level in a fib grid (array
// of {price}) — always computed, never threshold-gated. This is the actual
// "zone" for analysis: the real pip gap between X and previous X, not a
// pre-filtered yes/no confluence flag. Returns null if the grid is
// unavailable (e.g. no previous Asia session yet, or no Monday resolved).
function nearestPipDist(price, grid, pip) {
  if (!grid?.length) return null;
  let best = Infinity;
  for (const g of grid) { const d = Math.abs(price - g.price); if (d < best) best = d; }
  return best / pip;
}

// Same idea, grid-vs-grid (both full fib ladders) — the tightest pair
// anywhere between two whole ladders. Used for the Monday-vs-previous-Monday
// week-level zone, which has no single "touched price" to anchor from.
function minGridDist(gridA, gridB, pip) {
  if (!gridA?.length || !gridB?.length) return null;
  let best = Infinity;
  for (const a of gridA) for (const b of gridB) { const d = Math.abs(a.price - b.price); if (d < best) best = d; }
  return best / pip;
}

// Fine pip bands so the book can show how reaction changes as a SMOOTH
// function of tightness ("together levels are a tighter pip") rather than a
// single binary tight/normal split.
function pipZoneBucket(pips) {
  if (pips == null) return null;
  if (pips <= 0.5) return '1·<0.5p';
  if (pips <= 1) return '2·0.5-1p';
  if (pips <= 2) return '3·1-2p';
  if (pips <= 5) return '4·2-5p';
  if (pips <= 10) return '5·5-10p';
  if (pips <= 20) return '6·10-20p';
  return '7·>20p';
}

// Which calendar currencies this instrument's macro-event proximity should
// read. FX pairs decompose into their two ISO codes; gold is USD-driven
// (XAU itself isn't a calendar currency in this feed).
function macroCurrencies(instrument) {
  const s = String(instrument).toUpperCase();
  if (s.includes('XAU') || s === 'GOLD') return ['USD'];
  if (s.length === 6) return [s.slice(0, 3), s.slice(3, 6)];
  return ['USD'];
}

// Hours to the NEAREST 'Major'-impact scheduled event in either direction —
// see calendarLoader.js's own header for why looking FORWARD at a
// calendar DATE is not lookahead here (the schedule is public knowledge),
// unlike looking forward at PRICE. `epochs` must be sorted ascending.
function nearestEventHours(epochs, t) {
  if (!epochs?.length) return null;
  const i = bisect(epochs, t);   // first index with epochs[i] >= t
  let best = Infinity;
  if (i < epochs.length) best = Math.min(best, Math.abs(epochs[i] - t));
  if (i > 0) best = Math.min(best, Math.abs(t - epochs[i - 1]));
  return best / 3600;
}

function macroEventBucket(hours) {
  if (hours == null) return null;
  if (hours <= 6) return '1·imminent';
  if (hours <= 24) return '2·same-day';
  if (hours <= 72) return '3·this-week';
  return '4·quiet';
}

// UTC-hour session classification — SAME 3-way convention as levelAtlasEngine
// (Asia 22-7 / London 7-13 / NY 13-22 UTC), re-derived rather than imported for
// the same reason that file gives: it's private there. NOTE this describes
// which of the three standard trading sessions a touch's CLOCK TIME falls in —
// a different concept from "the Asia range window" (00:00-06:00 London) used
// to build the ladder itself; a touch very early in this engine's walk window
// can still classify as 'Asia' by this clock-time convention even though the
// Asia RANGE has already closed.
// Exported (2026-08-27) so mondayFibAtlasEngine.js can read the SAME session
// cut instead of a second copy.
export function sessionOf(hourUtc) {
  if (hourUtc >= 22 || hourUtc < 7) return 'Asia';
  if (hourUtc < 13) return 'London';
  return 'NY';
}

// Finer cut than plain session — the Asia-close breakout window, the deep-
// liquidity London/NY overlap, and the NY-only/late/pre-Asia stretches each
// have a documented distinct character (education/jordan_video_transcripts —
// VWAP session-transition entry; VOLATILITY_INTELLIGENCE_NOTES.md §4.4).
// Exported (2026-08-27) so `asiaFibAtlasLiveLadder` below and the live route
// can read the CURRENT bucket without re-deriving the same hour cuts.
export function sessionHandoffPhase(hourUtc) {
  if (hourUtc >= 5 && hourUtc < 7) return '1·asia-close-breakout';
  if (hourUtc >= 7 && hourUtc < 12) return '2·london-morning';
  if (hourUtc >= 12 && hourUtc < 16) return '3·london-ny-overlap';
  if (hourUtc >= 16 && hourUtc < 20) return '4·ny-afternoon';
  return '5·ny-late-preasia';
}

// Causal trailing median of THIS engine's own Asia-range history (index-based,
// strictly prior sessions only — see header for why this is NOT
// levelAtlasEngine.sessionVolBucket). `idx` is this session's own index into
// `asiaSessions`; only sessions at index < idx are ever read.
function asiaVolBucketAt(asiaSessions, idx, lookback = 20) {
  const hist = [];
  for (let k = idx - 1; k >= 0 && hist.length < lookback; k--) {
    const r = asiaSessions[k]?.range;
    if (r > 0) hist.push(r);
  }
  if (hist.length < 8) return null;
  const sorted = [...hist].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  const today = asiaSessions[idx]?.range;
  if (!(today > 0) || !(med > 0)) return null;
  const r = today / med;
  return r < 0.7 ? '1·quiet' : r > 1.4 ? '3·wild' : '2·normal';
}

/**
 * Walk one instrument's full history and emit one record per touch of every
 * extension rung, on every side, at every re-arm definition.
 *
 *   asiaFibAtlasWalk(packed, { instrument, assetClass })
 *     -> { touches: [...], pending: [...], coverage: {from,to,sessions,estimator} }
 *
 * `extendResolutionDays` (2026-08-31, default 0 = off, fully backward
 * compatible): the outcome race below is normally bounded to the SAME
 * calendar day (Asia-close -> midnight local) -- a touch that hits neither
 * the inner nor outer barrier by then is `outcome:'neither'` and gets
 * DROPPED entirely by buildBarrierTrades (asiaFibAtlasVoteReview.js), not
 * counted as a win or a loss. Empirically ~3.5-4% of touches (analysis/
 * fib_atlas_neither_extend_test.mjs, LEGO_MODULES.md 2026-08-31): given
 * more time, 99.8% of those eventually DO hit a real barrier, with a win
 * rate close to (just under) the already-counted trades' own -- so the
 * current same-day cutoff isn't hiding a landmine, but it is a real,
 * measurable simplification. Setting this > 0 continues the SAME race
 * logic into `extendResolutionDays` more days of bars (a SEPARATE bars
 * array, fetched once per date -- the same-day `bars` used for every
 * other feature/confluence computation in this function is UNCHANGED, so
 * extension only ever affects outcome/resolveTime, never a touch's
 * features or vote inputs). `nextSessionBuildHrs` (default 6, matching
 * `asiaHrs`) sets `concurrencyResolveTime` -- capped at that many hours
 * past midnight regardless of how long the real resolution search took,
 * so a still-open extended trade can never block a fresh touch on the
 * FOLLOWING day's freshly-built Asia range (that range isn't built until
 * `asiaHrs` in anyway) from opening. Downstream callers that want the
 * extended behavior should use `concurrencyResolveTime` (when present) as
 * the trade's own `resolveTime` for `applyConcurrencyCap` purposes, while
 * `resolveTime` itself always stays the REAL (possibly multi-day-later)
 * resolution time for date/mfe/maepips bookkeeping.
 */
export function asiaFibAtlasWalk(packed, { instrument, assetClass = 'fx', rearmFracs = REARM_FRACS,
                                            minLookback = 60, htfMinBars, structural = true, confLookback = 5,
                                            asiaHrs = 6, pendingRearmFrac = null, liveWindowDays = null,
                                            ivByDate = null, macroEvents = null,
                                            extendResolutionDays = 0, nextSessionBuildHrs = 6 } = {}) {
  const sym = String(instrument).toUpperCase();

  // Calendar-day OHLC + trailing-σ index — SAME construction as levelAtlasEngine,
  // so the two engines' `dayVol` reads share one causal definition (Lego §3.4).
  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const dates = [...sessions.keys()].sort().filter(d => (sessions.get(d)?.length ?? 0) >= 200);
  const d1 = dates.map(d => {
    const b = sessions.get(d); let hi = -Infinity, lo = Infinity;
    for (const x of b) { if (x.high > hi) hi = x.high; if (x.low < lo) lo = x.low; }
    return { date: d, open: b[0].open, high: hi, low: lo, close: b[b.length - 1].close };
  });
  const dateIdx = new Map(dates.map((d, i) => [d, i]));
  const est = LADDER_PARAMS.pairs?.[sym]?.estimator ?? LADDER_PARAMS.classDefaults?.[assetClass]?.estimator ?? 'yz_30';

  let pip = 1; try { pip = pipSize(instrument) || 1; } catch { /* unknown symbol -> raw price units */ }
  const threshPips = confluenceThresholdPips(sym);
  const normalDistPrice = threshPips * pip;
  const tightDistPrice = normalDistPrice * 0.10;   // matches Pine's default 10% "tight" fraction

  const asiaSessions = buildAsiaSessions(packed, 'london', asiaHrs, 5);
  const mondayRanges = buildMondayRanges(packed, 'london');
  if (asiaSessions.length <= minLookback) return { touches: [], pending: [], coverage: null };

  const startIdx = liveWindowDays != null ? Math.max(minLookback, asiaSessions.length - liveWindowDays) : minLookback;

  const htf = createHtfContext(packed, htfMinBars ? { minHtfBars: htfMinBars } : {});
  const tf = createConfluenceFeatures({ htf });
  const wt1Cache = new Map();

  // ── 30m swing-structure series, built ONCE per instrument (same pattern as
  // confluenceFeatures.createHtfContext's own byTf series) — NOT per touch.
  // rangeBiasCore.featureSwingRegime does its own internal O(60) pivot scan
  // on whatever slice it's handed; recomputing the resample+scan from a
  // growing prefix on every touch would be O(n) per touch = O(n²) over a
  // multi-year walk. Instead: resample the whole instrument to 30m once
  // (`resamplePacked`, the same brick createHtfContext uses), then a bisect
  // per touch (O(log n)) finds the trailing 60-bar window to hand the brick.
  const bars30m = resamplePacked(packed, 30);
  const closeTimes30m = new Float64Array(bars30m.length);
  for (let k = 0; k < bars30m.length; k++) closeTimes30m[k] = bars30m[k].time + 30 * 60;

  // ── Macro-calendar proximity — 'Major'-impact scheduled events (FOMC/ECB/
  // BoE decisions, NFP, CPI, etc.) in this instrument's relevant currencies
  // only. `macroEvents` (from calendarLoader.js's `majorEventEpochs()`) is
  // caller-loaded, same pure-engine/I/O-boundary-in-the-caller contract as
  // `ivByDate`. Filtered + sorted once per instrument.
  const relevantCcys = macroEvents ? new Set(macroCurrencies(sym)) : null;
  const macroEpochs = macroEvents
    ? new Float64Array(macroEvents.filter(e => relevantCcys.has(e.ccy)).map(e => e.epoch).sort((a, b) => a - b))
    : null;

  const lastVisit = {};   // `${side}|${level}|${rearmFrac}` -> last <=5 visits (repeatability)

  const touches = [];
  const pending = [];

  for (let i = startIdx; i < asiaSessions.length; i++) {
    const asia = asiaSessions[i];
    const date = asia.date;
    const di = dateIdx.get(date);
    if (di == null || di < 1) continue;   // need at least yesterday's close for gap/sigma

    let sigma = 0;
    try { sigma = forecastSigma(d1.slice(0, di), est); } catch { continue; }
    const dayVol = (() => {
      if (!(sigma > 0)) return null;
      const hist = []; for (let k = Math.max(0, di - 20); k < di; k++) { try { const s = forecastSigma(d1.slice(0, k), est); if (s > 0) hist.push(s); } catch {} }
      if (hist.length < 8) return null;
      const sorted = [...hist].sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
      if (!(med > 0)) return null;
      const r = sigma / med;
      return r < 0.85 ? '1·quiet' : r > 1.25 ? '3·heavy' : '2·normal';
    })();
    // `sessionRanges.buildAsiaSessions` returns {epoch,date,high,low,range} —
    // no `open` (it's built on `barUtils.bodyRange`, which only tracks the
    // body extremes). Two genuinely different "open" anchors are needed below:
    // `dayOpen` (the calendar day's 00:00 open, from `d1` — matches what the
    // forecast ladder's %-of-open figures are calibrated against, and what a
    // structural pivot/round-number read should be relative to) and `winOpen`
    // (bars[0].open of the POST-ASIA walk window, defined once bars are
    // extracted below — matches what confluenceFeatures' cumulative VWAP is
    // relative to, since that VWAP only ever sums over `bars`, which start at
    // Asia close, not midnight). MUST be defined before expectedDayRangePrice
    // below, which reads it.
    const dayOpen = d1[di].open;
    const prevClose = d1[di - 1].close;
    const gapSig = (sigma > 0 && prevClose > 0 && dayOpen > 0) ? (dayOpen - prevClose) / prevClose / sigma : 0;
    const gapBucket = Math.abs(gapSig) < 0.25 ? 'flat' : gapSig > 0 ? 'gap-up' : 'gap-down';

    // Expected full-day range at the median, for rangeBudgetUsedPct below —
    // same ladder Level Atlas fits, a genuinely new use of it (how much of
    // today's TYPICAL day-range has already been consumed by the time price
    // reaches this rung — education/FORECASTER_WALKTHROUGH_NOTES.md Part 5).
    let expectedDayRangePrice = null;
    if (sigma > 0) {
      try {
        const lad = buildLadder(sigma, { instrument: sym, assetClass, horizon: 'daily', eventTag: 'none' });
        if (lad?.oh?.p50 != null && lad?.ol?.p50 != null && dayOpen > 0) {
          expectedDayRangePrice = dayOpen * ((lad.oh.p50 + lad.ol.p50) / 100);
        }
      } catch { /* leave null */ }
    }

    const dow = dowOf(date);
    const asiaVolBucket = asiaVolBucketAt(asiaSessions, i);
    const prevA = prevSession(asiaSessions, asia.epoch);
    const prevAsiaVolBucket = prevA ? asiaVolBucketAt(asiaSessions, i - 1) : null;

    // ── CVOL (CME's implied-vol settle) — the one FORWARD-LOOKING signal in
    // the book; everything else here is realized. SAME one-day-lag
    // discipline as levelAtlasEngine.js: `ivByDate` is keyed by date and is
    // an EOD settle, so the causally correct read for day `di` is
    // YESTERDAY's settle (`dates[di-1]`) — today's own settle isn't
    // published until today's own close. `ivByDate` may be null (no CVOL
    // coverage for this instrument) — every downstream field then stays
    // null, never thrown. Reuses `cvolLoader.js` verbatim, never a second
    // parquet reader.
    const ivYesterday = (ivByDate && di > 0) ? ivByDate.get(dates[di - 1]) : null;
    const ivRegime = (() => {
      if (!ivByDate || !ivYesterday) return null;
      const hist = [];
      for (let k = Math.max(0, di - 21); k < di; k++) { const v = ivByDate.get(dates[k])?.cvol; if (v > 0) hist.push(v); }
      if (hist.length < 8) return null;
      const sorted = [...hist].sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
      if (!(med > 0)) return null;
      const r = ivYesterday.cvol / med;
      return r < 0.85 ? '1·iv-low' : r > 1.25 ? '3·iv-high' : '2·iv-normal';
    })();
    const vrp = (() => {
      if (!ivYesterday || !(sigma > 0)) return null;
      const realizedAnnualPct = sigma * Math.sqrt(252) * 100;
      if (!(realizedAnnualPct > 0)) return null;
      const r = ivYesterday.cvol / realizedAnnualPct;
      return r < 0.9 ? '1·iv-cheap' : r > 1.3 ? '3·iv-rich' : '2·fair';
    })();

    // ── Weekly pivots (rangeBiasCore.computeWeeklyPivots) — a genuinely
    // separate structural level family from the fib grid (classic
    // PP/R1/R2/S1/S2, from the prior ~5 completed days). Causal by the
    // function's own construction (`dailyBars.slice(-7,-2)` — a built-in
    // 2-day lag buffer), reused verbatim, never re-derived.
    const weeklyPivots = computeWeeklyPivots(d1.slice(0, di));
    const weeklyPivotGrid = weeklyPivots ? Object.values(weeklyPivots).map(price => ({ price })) : null;

    // ── Hurst exponent (rangeBiasCore.computeHurst) — trailing 80 daily
    // closes, same window `featureHurst` uses elsewhere. CAVEAT, carried
    // forward honestly rather than hidden: this exact estimator was DROPPED
    // from the live entry-conviction aggregate (2026-07-25, see
    // LEGO_MODULES.md §3) after saturating near ~0.88 on EVERY tested
    // instrument with zero exceptions — a guaranteed vote, not a real read,
    // in that context. Wired in fresh here anyway because this is a
    // genuinely different question (touch-level rung behaviour, not entry
    // conviction) — the OOS-holding gate below will show plainly if it's
    // similarly uninformative here, which is itself a useful, honest
    // confirmation rather than a wasted addition.
    const hurstVal = computeHurst(d1.slice(Math.max(0, di - 80), di).map(d => d.close));
    const hurstBucket = hurstVal < 0.4 ? '1·reverting' : hurstVal > 0.6 ? '3·trending' : '2·random-walk';

    // ── Asia's own internal shape — did the Asia session build its range by
    // a clean one-sided drive, or by chopping both ways? SAME bucket
    // thresholds/labels as the post-Asia `churn` field below (0.80/0.55,
    // '1·churned'/'2·mixed'/'3·driven') for direct comparability, but a
    // DIFFERENT formula, not a copy: post-Asia churn measures one-sided
    // travel TOWARD an external touched rung; Asia's own formation has no
    // such external target, so this uses Asia's own close-vs-open direction
    // as the reference instead.
    const asiaShape = (() => {
      const asiaBars = extractBars(packed, asia.epoch, asia.epoch + asiaHrs * 3600);
      if (asiaBars.length < 10) return null;
      let wickHi = -Infinity, wickLo = Infinity;
      for (const b of asiaBars) { if (b.high > wickHi) wickHi = b.high; if (b.low < wickLo) wickLo = b.low; }
      const totalTravel = wickHi - wickLo;
      if (!(totalTravel > 0)) return null;
      const closedUp = asiaBars.at(-1).close >= asiaBars[0].open;
      const dirTravel = closedUp ? (wickHi - asiaBars[0].open) : (asiaBars[0].open - wickLo);
      const ratio = Math.min(1, Math.max(0, dirTravel / totalTravel));
      return ratio >= 0.80 ? '3·driven' : ratio >= 0.55 ? '2·mixed' : '1·churned';
    })();

    // ── Today's extension ladder (fixed at Asia close — nothing after this
    // point in the day-setup block reads anything dated later than `asia`) ──
    const todayFibs = calcFibs(asia.low, asia.range);              // {level, price, isKey}
    const todayForConf = todayFibs.map(f => ({ price: f.price, fib: f.level }));

    // ── Confluence: TWO INDEPENDENT tracks, matching the original indicator
    // exactly — re-reading the Pine script's own two confluence blocks side
    // by side (not just skimming) shows it NEVER cross-compares Asia fibs to
    // Monday fibs; an earlier version of this engine did exactly that
    // (comparing today's Asia rungs against the Monday ladder) and folded it
    // into one conflated "confluenceGrade" — a real design bug, fixed here:
    //   (1) Asia (today) vs Asia (previous day) — daily, the CORE track,
    //       feeds `confluenceGrade` below, same as always.
    //   (2) Monday (this week, causally resolved) vs Monday (the week
    //       before) — weekly, its OWN track, entirely independent of Asia.
    //       `mon`/`mon2` depend only on which WEEK it is, so this is
    //       computed once and is the same value for every touch Mon-Fri
    //       that week — "drawn once, persists the week", never re-derived
    //       per day.
    // A THIRD, genuinely different question this engine also answers — does
    // today's Asia rung land near the Monday ladder anyway — is real and
    // worth keeping (see `mondayCrossPips` below), but it is NOT part of the
    // original strategy and must stay a clearly separate, secondary field,
    // never blended into `confluenceGrade`.
    const prevAsiaFibs = prevA ? calcFibs(prevA.low, prevA.range).map(f => ({ price: f.price, fib: f.level })) : null;
    const isMonday = dow === 1;
    let mon = mondayForDay(mondayRanges, asia.epoch);
    if (isMonday && mon) mon = prevMonday(mondayRanges, mon.epoch);   // Pine: is_current_monday ? prev_monday : curr_monday
    const mon2 = mon ? prevMonday(mondayRanges, mon.epoch) : null;    // the Monday immediately before `mon` — track (2)'s "previous Monday"
    const mondayFibs = mon ? calcFibs(mon.low, mon.range).map(f => ({ price: f.price, fib: f.level })) : null;
    const prevMondayFibs = mon2 ? calcFibs(mon2.low, mon2.range).map(f => ({ price: f.price, fib: f.level })) : null;

    // Track (1)'s canonical, threshold-gated match — reuses the SAME
    // Pine-matching matcher + range-capped tolerance as the live indicator,
    // never re-derived. Feeds `confluenceGrade` (categorical) below.
    const confAsia = prevAsiaFibs ? detectConfluencesCore(todayForConf, prevAsiaFibs, {
      pipSize: pip, normalDistance: normalDistPrice, tightDistance: tightDistPrice,
      mergeDistance: normalDistPrice, priceMode: 'lowest', clusterMerge: false, sessionRange: asia.range,
    }) : [];
    const asiaMatch = new Set(confAsia.map(c => c.todayFib));
    const asiaTight = new Set(confAsia.filter(c => c.isTight).map(c => c.todayFib));

    // Track (2), week-level (constant for every touch this week): how
    // tightly does THIS week's Monday ladder sit against LAST week's? This
    // IS the "Monday vs previous Monday, its own zone" — never touches Asia
    // at all. Continuous pip gap, not threshold-gated (see `nearestPipDist`
    // — the owner's actual ask: the raw pip distance between X and previous
    // X is the zone worth analysing, not a pre-filtered yes/no).
    const mondayWeekTightestPips = (mondayFibs && prevMondayFibs) ? minGridDist(mondayFibs, prevMondayFibs, pip) : null;
    const mondayWeekZone = pipZoneBucket(mondayWeekTightestPips);

    // ── Structural confluence (pivots/prior-hilo/volume-profile/swing/round) —
    // same builder + tolerance the range-line book was validated on, reused
    // verbatim (Level Atlas does the same). Intraday sources added at the
    // touch itself inside confluenceFeatures.
    let confLevels = null;
    if (structural) {
      let intraday = [];
      for (let j = Math.max(0, di - confLookback); j < di; j++) { const pb = sessions.get(dates[j]); if (pb) intraday = intraday.concat(pb); }
      confLevels = sessionConfluenceLevels({ dailyBars: d1.slice(0, di), intraday, pip, price: dayOpen,
        sources: DAILY_CONFLUENCE_SOURCES, fib15: false });
    }

    // ── Walk window: Asia close -> next local midnight (mirrors the Pine
    // indicator drawing lines from curr_end_tf to end_time_market_close). ──
    const winStart = asia.epoch + asiaHrs * 3600;
    const winEnd = asia.epoch + 24 * 3600;
    const bars = extractBars(packed, winStart, winEnd);
    if (bars.length < 10) continue;
    const winOpen = bars[0].open;   // confluenceFeatures' VWAP/tolerance anchor — see dayOpen/winOpen note above

    // Extended-resolution search bars (2026-08-31, see this function's own
    // doc) -- ONLY the outcome race below reads this; every feature/
    // confluence computation in this iteration still uses the unchanged
    // same-day `bars`. Fetched once per date (shared by every side/rung/
    // rearmFrac combination below), not per touch.
    const extBars = extendResolutionDays > 0 ? extractBars(packed, winEnd, winEnd + extendResolutionDays * 86400) : null;
    const concurrencyResolveCap = winEnd + nextSessionBuildHrs * 3600;

    let wt1 = wt1Cache.get(date);
    if (!wt1) { wt1 = tf.wtSeries(bars); wt1Cache.set(date, wt1); }

    const winSpanMins = (winEnd - winStart) / 60;

    for (const side of SIDES) {
      const isAbove = side === 'above';
      const rungLevels = isAbove ? RUNGS_ABOVE : RUNGS_BELOW;
      const boundaryPrice = isAbove ? asia.high : asia.low;   // the range's own edge — the innermost barrier
      const rungPrice = lv => asia.low + asia.range * lv;
      const lv = [boundaryPrice, ...rungLevels.map(rungPrice)];
      const reach = (px, target) => (isAbove ? px >= target : px <= target);
      const otherSide = isAbove ? 'below' : 'above';

      for (const rearmFrac of rearmFracs) {
        for (let ri = 0; ri < rungLevels.length; ri++) {
          const level = rungLevels[ri];
          const here = lv[ri + 1], inner = lv[ri], outer = lv[ri + 2] ?? null;
          const rungSpan = Math.abs(here - inner);
          if (!(rungSpan > 0)) continue;
          const rearmDist = rearmFrac * rungSpan;

          let armed = true, ordinal = 0, runHi = bars[0].high, runLo = bars[0].low, closeHi = bars[0].close, closeLo = bars[0].close;
          for (let k = 0; k < bars.length; k++) {
            const bar = bars[k];
            if (bar.high > runHi) runHi = bar.high;
            if (bar.low < runLo) runLo = bar.low;
            if (bar.close > closeHi) closeHi = bar.close;
            if (bar.close < closeLo) closeLo = bar.close;
            const px = isAbove ? bar.high : bar.low;
            if (!armed) {
              const away = isAbove ? (here - bar.close) : (bar.close - here);
              if (away >= rearmDist) armed = true;
              continue;
            }
            if (!reach(px, here)) continue;
            ordinal++;
            armed = false;

            // levelFlipState: has price already CLOSED beyond this rung
            // (body, not wick) earlier in this SAME window, before this
            // touch? A fresh touch (reversal candidate) vs a retest of an
            // already-broken line (continuation candidate) —
            // education/jordan_video_transcripts: "level-flip-and-retest".
            // closeHi/closeLo are running values through bar k INCLUSIVE, so
            // this reads "at or before now", strictly causal.
            const levelFlipState = (isAbove ? closeHi > here : closeLo < here) ? 'retest' : 'fresh';

            // ── Outcome: race the two real neighbours from this touch ──────
            let outcome = 'neither', deepest = here, resolveTime = null, resolveIdx = null, extreme = here;
            for (let j = k; j < bars.length; j++) {
              const b2 = bars[j];
              const fwd = isAbove ? b2.high : b2.low, bwd = isAbove ? b2.low : b2.high;
              if (isAbove ? bwd < deepest : bwd > deepest) deepest = bwd;
              if (isAbove ? fwd > extreme : fwd < extreme) extreme = fwd;
              if (outer != null && reach(fwd, outer)) { outcome = 'out'; resolveTime = b2.time; resolveIdx = j; break; }
              if (isAbove ? bwd <= inner : bwd >= inner) { outcome = 'back'; resolveTime = b2.time; resolveIdx = j; break; }
            }
            // Extended search (2026-08-31): only reached when the same-day
            // race above never resolved AND extension is enabled. Same race
            // logic, continuing into subsequent days' bars -- deepest/extreme
            // keep accumulating (a real MFE/MAE can happen on day 2, not just
            // day 1). `resolveIdx` stays null here (it indexes into `bars`,
            // meaningless for `extBars`) -- nothing downstream reads it for
            // an extended resolution.
            if (outcome === 'neither' && extBars) {
              for (const b2 of extBars) {
                const fwd = isAbove ? b2.high : b2.low, bwd = isAbove ? b2.low : b2.high;
                if (isAbove ? bwd < deepest : bwd > deepest) deepest = bwd;
                if (isAbove ? fwd > extreme : fwd < extreme) extreme = fwd;
                if (outer != null && reach(fwd, outer)) { outcome = 'out'; resolveTime = b2.time; break; }
                if (isAbove ? bwd <= inner : bwd >= inner) { outcome = 'back'; resolveTime = b2.time; break; }
              }
            }
            const concurrencyResolveTime = resolveTime != null ? Math.min(resolveTime, concurrencyResolveCap) : null;
            const sgn = isAbove ? 1 : -1;
            const pullbackFrac = rungSpan > 0 ? Math.min(1, Math.abs(here - deepest) / rungSpan) : null;
            const fadePips = (here - deepest) / pip * sgn;
            const runPips = (extreme - here) / pip * sgn;
            const innerDistPips = rungSpan / pip;
            const outerDistPips = outer != null ? Math.abs(outer - here) / pip : null;
            const minsToResolve = resolveTime != null ? (resolveTime - bar.time) / 60 : null;
            const minsIntoWindow = (bar.time - winStart) / 60;
            const minsRemaining = winSpanMins - minsIntoWindow;
            const windowFrac = winSpanMins > 0 ? minsIntoWindow / winSpanMins : null;
            const windowPos = windowFrac == null ? null : windowFrac < 0.33 ? '1·early' : windowFrac < 0.67 ? '2·mid' : '3·late';

            const totalTravel = runHi - runLo;
            const dirTravel = isAbove ? (runHi - asia.high) : (asia.low - runLo);
            const churnRatio = totalTravel > 0 ? Math.min(1, Math.max(0, dirTravel / totalTravel)) : null;
            const churn = churnRatio == null ? null : churnRatio >= 0.80 ? '3·driven' : churnRatio >= 0.55 ? '2·mixed' : '1·churned';

            const rangeBudgetUsedPct = expectedDayRangePrice > 0 ? Math.min(3, totalTravel / expectedDayRangePrice) : null;
            const rangeBudgetBucket = rangeBudgetUsedPct == null ? null
              : rangeBudgetUsedPct < 0.5 ? '1·low' : rangeBudgetUsedPct <= 1.0 ? '2·mid' : '3·high';

            // Track (1), continuous — the actual pip gap from THIS touched
            // rung to the NEAREST previous-Asia level, always reported. The
            // real "zone for analysis of activity": lets the book show
            // reaction as a function of how tight the two ladders' levels
            // land together, not a pre-filtered yes/no.
            const asiaConfPips = nearestPipDist(here, prevAsiaFibs, pip);
            const asiaConfZone = pipZoneBucket(asiaConfPips);
            // Track (1), categorical — same threshold/tight distinction the
            // live indicator draws (green vs orange). One dimension among
            // many below; never the sole reason a cell's behaviour gets
            // explained.
            const confluenceGrade = !asiaMatch.has(level) ? '0·none' : asiaTight.has(level) ? '2·tight' : '1·match';

            // EXPLORATORY, secondary — does this Asia rung ALSO land near
            // the (causally-resolved) Monday ladder? Real signal, kept
            // separate on purpose: not part of the original strategy, so it
            // never feeds confluenceGrade above.
            const mondayCrossPips = nearestPipDist(here, mondayFibs, pip);
            const mondayCrossZone = pipZoneBucket(mondayCrossPips);

            // Distance to the nearest weekly pivot level — a genuinely
            // different structural family from the fib grid, same
            // always-on continuous-pip-gap treatment as the confluence
            // tracks above.
            const weeklyPivotPips = nearestPipDist(here, weeklyPivotGrid, pip);
            const weeklyPivotZone = pipZoneBucket(weeklyPivotPips);

            // Options-market directional lean (CVOL skew), oriented to the
            // touch — same construction as levelAtlasEngine.js: positive
            // skew = upside implied vol priced richer, so for an ABOVE touch
            // that's "with", for a BELOW touch it's "against". Same 1-day
            // settle lag as ivRegime/vrp above (computed day-level).
            const ivSkewDir = (() => {
              if (!ivYesterday || !Number.isFinite(ivYesterday.skew)) return null;
              const oriented = isAbove ? ivYesterday.skew : -ivYesterday.skew;
              return Math.abs(oriented) < 0.15 ? '2·neutral' : oriented > 0 ? '3·with' : '1·against';
            })();

            // HTF swing structure (CHoCH/BOS) — a qualitative break-state
            // read (trend_up/trend_down/range) that ADX/EMA-slope alone
            // can't give (those are magnitude-of-trend, not
            // structure-of-trend). `featureSwingRegime` needs only bars
            // STRICTLY AT-OR-BEFORE the touch, found via the once-per-
            // instrument bisect index above — strictly causal, O(log n).
            const swingRegime = (() => {
              const i30 = bisect(closeTimes30m, bar.time + 1) - 1;
              if (i30 < 19) return '2·neutral';   // brick's own minimum (20 bars)
              const window30 = bars30m.slice(Math.max(0, i30 - 59), i30 + 1);
              const swing = featureSwingRegime(window30);
              if (!swing?.signal) return '2·neutral';
              // Range-extension framing (education/range-extension-levels-notes.md):
              // above the range = short consideration, below = long.
              const wantDir = isAbove ? 'short' : 'long';
              return swing.signal === wantDir ? '3·agree' : '1·conflict';
            })();

            // Macro-calendar proximity — schedule-only, see calendarLoader.js
            // and `nearestEventHours` above for why looking forward at a
            // known future calendar date isn't lookahead here.
            const macroEventHours = nearestEventHours(macroEpochs, bar.time);
            const macroEventBucketVal = macroEventBucket(macroEventHours);

            const feats = tf.compute({ bars, touchIdx: k, open: winOpen, sigma, side: isAbove ? 'up' : 'dn', wt1, level: here, pip, confLevels });

            const hourUtc = new Date(bar.time * 1000).getUTCHours();
            const touchSession = sessionOf(hourUtc);
            const key = `${side}|${level}|${rearmFrac}`;
            const hist = lastVisit[key] ?? [];
            const prev = hist.at(-1) ?? null;
            const daysSincePrevN = prev ? (i - prev.sessIdx) : null;
            const rollOut = hist.filter(h => h.outcome === 'out').length;
            const rollBack = hist.filter(h => h.outcome === 'back').length;
            const rollingRate = hist.length >= 3
              ? { n: hist.length, outPct: +(rollOut / hist.length * 100).toFixed(0), backPct: +(rollBack / hist.length * 100).toFixed(0) }
              : null;

            const record = {
              instrument: sym, assetClass, date, side, level, rearmFrac, ordinal,
              hourUtc, minute: new Date(bar.time * 1000).getUTCMinutes(),
              minsIntoWindow: +minsIntoWindow.toFixed(0), minsRemaining: +minsRemaining.toFixed(0),
              windowPos, session: touchSession, sessionHandoff: sessionHandoffPhase(hourUtc),
              dowSession: `${dow}|${touchSession}`, dow,
              gapBucket, gapSig: +gapSig.toFixed(3),
              dayVol, asiaVolBucket, prevAsiaVolBucket,
              rangeBudgetUsedPct: rangeBudgetUsedPct != null ? +rangeBudgetUsedPct.toFixed(3) : null,
              rangeBudgetBucket,
              churn, churnRatio: churnRatio != null ? +churnRatio.toFixed(3) : null,
              levelFlipState,
              confluenceGrade,
              asiaConfPips: asiaConfPips != null ? +asiaConfPips.toFixed(2) : null, asiaConfZone,
              mondayCrossPips: mondayCrossPips != null ? +mondayCrossPips.toFixed(2) : null, mondayCrossZone,
              mondayWeekTightestPips: mondayWeekTightestPips != null ? +mondayWeekTightestPips.toFixed(2) : null, mondayWeekZone,
              weeklyPivotPips: weeklyPivotPips != null ? +weeklyPivotPips.toFixed(2) : null, weeklyPivotZone,
              ivRegime, vrp, ivSkewDir,
              hurstBucket, asiaShape, swingRegime,
              macroEventHours: macroEventHours != null ? +macroEventHours.toFixed(1) : null,
              macroEventBucket: macroEventBucketVal,
              otherSideTouchedBefore: null,   // filled in a post-pass below (needs both sides' first-touch times)
              price: +here.toFixed(6), pip,
              dayOpen, asiaHigh: asia.high, asiaLow: asia.low, asiaRange: asia.range,
              time: bar.time, resolveTime, concurrencyResolveTime, outcome, resolveIdx,
              minsToResolve: minsToResolve != null ? +minsToResolve.toFixed(0) : null,
              pullbackFrac: pullbackFrac != null ? +pullbackFrac.toFixed(3) : null,
              fadePips: +fadePips.toFixed(1), runPips: +runPips.toFixed(1),
              innerDistPips: +innerDistPips.toFixed(1), outerDistPips: outerDistPips != null ? +outerDistPips.toFixed(1) : null,
              approachVel: feats.approachVel?.bucket ?? null,
              approachER: feats.approachER?.bucket ?? null,
              wtState: feats.wtState?.bucket ?? null,
              wtMtf: feats.wtMtf?.bucket ?? null,
              wtSlow: feats.wtSlow?.bucket ?? null,
              vwapSide: feats.vwapSide?.bucket ?? null,
              momAdx: feats.momAdx?.bucket ?? null,
              structConfluence: feats.confluence?.bucket ?? null,
              candleReject: feats.candleReject?.bucket ?? null,
              htfTrend: feats.htfTrend?.bucket ?? null,
              volClimax: feats.volClimax?.bucket ?? null,
              roundNum: feats.roundNum?.bucket ?? null,
              prevOutcome: prev?.outcome ?? null,
              prevWtState: prev?.wtState ?? null,
              wtStateRepeated: (prev?.wtState != null && feats.wtState?.bucket != null) ? (prev.wtState === feats.wtState.bucket) : null,
              outcomeRepeated: (prev?.outcome != null) ? (prev.outcome === outcome) : null,
              daysSincePrev: daysSincePrevN,
              // Same split as levelAtlasEngine's prevOutcomeSameDay/CrossDay,
              // for the same reason (§6.4 of the playbook — a same-day
              // 'neither' re-arm repeat is close to a tautology, not a finding).
              prevOutcomeSameDay: (daysSincePrevN === 0 && prev.outcome !== 'neither') ? prev.outcome : null,
              prevOutcomeCrossDay: (daysSincePrevN > 0) ? prev.outcome : null,
              rollingRate,
            };
            touches.push(record);
            lastVisit[key] = [...hist, { outcome, wtState: feats.wtState?.bucket ?? null, sessIdx: i }].slice(-5);
          }
        }
      }
    }
  }

  // ── otherSideTouchedBefore post-pass — needs both sides' first-touch times
  // per (date, level-magnitude, rearmFrac), computed after the main walk so
  // the main loop stays a single forward pass per side (matches
  // levelAtlasEngine's own two-phase approach, just done after instead of
  // before since rung SETS differ in size between sides here). Strictly
  // causal: only compares to touches on the SAME date, using each side's
  // real first-touch time — never a later touch.
  {
    const firstTouch = new Map();   // `${date}|${side}|${rearmFrac}` -> earliest time
    for (const r of touches) {
      const k = `${r.date}|${r.side}|${r.rearmFrac}`;
      const cur = firstTouch.get(k);
      if (cur == null || r.time < cur) firstTouch.set(k, r.time);
    }
    for (const r of touches) {
      const otherKey = `${r.date}|${r.side === 'above' ? 'below' : 'above'}|${r.rearmFrac}`;
      const otherFirst = firstTouch.get(otherKey);
      r.otherSideTouchedBefore = otherFirst != null ? (otherFirst < r.time) : false;
    }
  }

  return { touches, pending, coverage: { from: asiaSessions[startIdx]?.date, to: asiaSessions.at(-1)?.date, sessions: asiaSessions.length, estimator: est } };
}

/**
 * Live snapshot — today's touches-so-far, no resolution yet. Same
 * "a live touch is just outcome:'neither' with more bars to come" reuse
 * levelAtlasEngine.atlasLiveToday relies on — see that function's own header.
 */
export function asiaFibAtlasLiveToday(packed, opts = {}) {
  const { touches, coverage } = asiaFibAtlasWalk(packed, { ...opts, rearmFracs: [opts.rearmFrac ?? 0.3] });
  const lastDate = coverage?.to ?? null;
  const today = lastDate ? touches.filter(t => t.date === lastDate) : [];
  return { touches: today, date: lastDate, coverage };
}

/**
 * Live ladder (2026-08-27) — the FULL fib-extension grid for TODAY's Asia
 * range (every rung, touched or not), each annotated with what a live
 * confidence lookup needs: current distance from price, plus the two
 * signals the level-by-level widen check (LEGO_MODULES.md §1aq) found
 * dominate the OOS-held confidence read at ~73% of levels tested across all
 * 4 core instruments — `prevOutcomeSameDay` (did THIS exact rung already
 * resolve today) and the CURRENT `sessionHandoff` bucket. Deliberately does
 * NOT attempt to replicate this engine's other ~20 touch-time-only context
 * fields (candleReject, wtState, structConfluence, macroEventBucket, ...)
 * for rungs that haven't been touched yet — those are only meaningful at the
 * moment of an actual touch, and faking them live would need a full
 * feature-computation port (levelAtlasEngine.atlasWalk's `pending` block
 * does exactly that for its own 3-rung ladder). Building the live score
 * around the two dimensions the widen check proved general is the honest
 * v1 scope, not an arbitrary shortcut — the other dimensions stay real,
 * level-specific reads in the historical book, just not wired into live yet.
 *
 * `matchLiveContext` (levelAtlasReport.js, generalized `keyField` 2026-08-27
 * specifically for this reuse) does the actual base-rate + held-dimension
 * lookup against a precomputed book — this function only builds the rung
 * list and the two live signals it needs, so the route layer does:
 *   const { ladder } = asiaFibAtlasLiveLadder(packed, opts);
 *   const scored = ladder.map(r => matchLiveContext(book, r, { keyField: 'level', dimLabels: ASIA_DIM_LABEL }));
 */
export function asiaFibAtlasLiveLadder(packed, opts = {}) {
  const { instrument, rearmFrac = 0.3 } = opts;
  if (!packed?.n) return { date: null, currentPrice: null, sessionHandoff: null, boundary: null, ladder: [] };

  const asiaHrs = opts.asiaHrs ?? 6;
  const asiaSessions = buildAsiaSessions(packed, 'london', asiaHrs, 5);
  const asia = asiaSessions.at(-1);
  if (!asia) return { date: null, currentPrice: null, sessionHandoff: null, boundary: null, ladder: [] };

  const lastBarTime = packed.times[packed.n - 1];
  const currentPrice = packed.closes[packed.n - 1];
  const hourUtc = new Date(lastBarTime * 1000).getUTCHours();
  const currentSessionHandoff = sessionHandoffPhase(hourUtc);
  const pip = pipSize(instrument ?? '');

  // Today's touches-so-far — only need each rung's LAST resolved outcome
  // today (the exact `prevOutcomeSameDay` input a NEXT touch at that rung
  // would carry), reusing the same walk rather than re-deriving it.
  const { touches: todayTouches, date } = asiaFibAtlasLiveToday(packed, { ...opts, rearmFrac });
  const lastOutcomeByKey = new Map();
  for (const t of todayTouches) {
    if (t.outcome === 'neither') continue;   // unresolved — carries no signal yet
    lastOutcomeByKey.set(`${t.side}|${t.level}`, t.outcome);
  }

  const ladder = [];
  for (const side of SIDES) {
    const rungLevels = side === 'above' ? RUNGS_ABOVE : RUNGS_BELOW;
    for (const level of rungLevels) {
      const price = asia.low + asia.range * level;   // same formula the walk itself uses — never a second derivation
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
    date, currentPrice: +currentPrice.toFixed(6), sessionHandoff: currentSessionHandoff,
    boundary: { asiaHigh: asia.high, asiaLow: asia.low, asiaRange: asia.range },
    ladder,
  };
}

/**
 * The SAME `here`/`inner`/`outer` neighbour-rung construction
 * `asiaFibAtlasWalk`'s hot loop uses inline (this file, "Walk window" section
 * above) — factored out here as a pure, exported function because a SECOND
 * caller now needs it: a live-plan producer pricing a rung that hasn't been
 * touched yet (no `touch` record to read `innerDistPips`/`outerDistPips`
 * off), the same "not-yet-touched rungs are just as priceable" situation
 * `_volatilityV2PriceZone`'s own doc describes for Level Atlas's
 * `rungLevelsForLadder`. Pure function of the CURRENT session's Asia
 * boundary (`{asiaHigh, asiaLow, asiaRange}`, e.g. `asiaFibAtlasLiveLadder`'s
 * own `boundary` return field) + which rung — no touch/bar data needed, so
 * it's identical whether the rung has been touched today or not.
 *
 *   asiaRungBarrierPips('above', 1.272, boundary, pip) -> { innerDistPips, outerDistPips }
 *   outerDistPips is null at the outermost rung (no further neighbour to
 *   measure a 'follow' target/stop against — same null Walk's own outer does).
 */
export function asiaRungBarrierPips(side, level, boundary, pip) {
  const isAbove = side === 'above';
  const rungLevels = isAbove ? RUNGS_ABOVE : RUNGS_BELOW;
  const boundaryPrice = isAbove ? boundary.asiaHigh : boundary.asiaLow;
  const rungPrice = lv => boundary.asiaLow + boundary.asiaRange * lv;
  const lv = [boundaryPrice, ...rungLevels.map(rungPrice)];
  const ri = rungLevels.indexOf(level);
  if (ri < 0) return { innerDistPips: null, outerDistPips: null };
  const here = lv[ri + 1], inner = lv[ri], outer = lv[ri + 2] ?? null;
  const rungSpan = Math.abs(here - inner);
  return {
    innerDistPips: pip > 0 ? +(rungSpan / pip).toFixed(1) : null,
    outerDistPips: outer != null && pip > 0 ? +(Math.abs(outer - here) / pip).toFixed(1) : null,
  };
}
