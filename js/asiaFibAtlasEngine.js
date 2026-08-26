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
import { extractBars } from './barUtils.js';
import { buildAsiaSessions, buildMondayRanges, prevSession, mondayForDay, prevMonday, dowOf } from './sessionRanges.js';
import { FIB_LEVELS, KEY_LEVELS, calcFibs } from './fibProjection.js';
import { detectConfluencesCore } from './confluence-core.js';

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

// UTC-hour session classification — SAME 3-way convention as levelAtlasEngine
// (Asia 22-7 / London 7-13 / NY 13-22 UTC), re-derived rather than imported for
// the same reason that file gives: it's private there. NOTE this describes
// which of the three standard trading sessions a touch's CLOCK TIME falls in —
// a different concept from "the Asia range window" (00:00-06:00 London) used
// to build the ladder itself; a touch very early in this engine's walk window
// can still classify as 'Asia' by this clock-time convention even though the
// Asia RANGE has already closed.
function sessionOf(hourUtc) {
  if (hourUtc >= 22 || hourUtc < 7) return 'Asia';
  if (hourUtc < 13) return 'London';
  return 'NY';
}

// Finer cut than plain session — the Asia-close breakout window, the deep-
// liquidity London/NY overlap, and the NY-only/late/pre-Asia stretches each
// have a documented distinct character (education/jordan_video_transcripts —
// VWAP session-transition entry; VOLATILITY_INTELLIGENCE_NOTES.md §4.4).
function sessionHandoffPhase(hourUtc) {
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
 */
export function asiaFibAtlasWalk(packed, { instrument, assetClass = 'fx', rearmFracs = REARM_FRACS,
                                            minLookback = 60, htfMinBars, structural = true, confLookback = 5,
                                            asiaHrs = 6, pendingRearmFrac = null, liveWindowDays = null } = {}) {
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

    // ── Today's extension ladder (fixed at Asia close — nothing after this
    // point in the day-setup block reads anything dated later than `asia`) ──
    const todayFibs = calcFibs(asia.low, asia.range);              // {level, price, isKey}
    const todayForConf = todayFibs.map(f => ({ price: f.price, fib: f.level }));

    // ── Confluence vs previous Asia & (causally-gated) Monday ────────────────
    const prevAsiaFibs = prevA ? calcFibs(prevA.low, prevA.range).map(f => ({ price: f.price, fib: f.level })) : null;
    const isMonday = dow === 1;
    let mon = mondayForDay(mondayRanges, asia.epoch);
    if (isMonday && mon) mon = prevMonday(mondayRanges, mon.epoch);   // Pine: is_current_monday ? prev_monday : curr_monday
    const mondayFibs = mon ? calcFibs(mon.low, mon.range).map(f => ({ price: f.price, fib: f.level })) : null;

    const confAsia = prevAsiaFibs ? detectConfluencesCore(todayForConf, prevAsiaFibs, {
      pipSize: pip, normalDistance: normalDistPrice, tightDistance: tightDistPrice,
      mergeDistance: normalDistPrice, priceMode: 'lowest', clusterMerge: false, sessionRange: asia.range,
    }) : [];
    const confMonday = mondayFibs ? detectConfluencesCore(todayForConf, mondayFibs, {
      pipSize: pip, normalDistance: normalDistPrice, tightDistance: tightDistPrice,
      mergeDistance: normalDistPrice, priceMode: 'lowest', clusterMerge: false, sessionRange: asia.range,
    }) : [];
    const asiaMatch = new Set(confAsia.map(c => c.todayFib));
    const asiaTight = new Set(confAsia.filter(c => c.isTight).map(c => c.todayFib));
    const monMatch = new Set(confMonday.map(c => c.todayFib));
    const monTight = new Set(confMonday.filter(c => c.isTight).map(c => c.todayFib));

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

            const confluenceGrade = (() => {
              const matchAsia = asiaMatch.has(level), tightAsia = asiaTight.has(level);
              const matchMon = monMatch.has(level), tightMon = monTight.has(level);
              const count = (matchAsia ? 1 : 0) + (matchMon ? 1 : 0);
              const isTight = tightAsia || tightMon;
              if (count === 0) return '0·none';
              if (count === 2) return isTight ? '3·tight-multi' : '2·multi';
              return isTight ? '2·tight-single' : '1·single';
            })();
            const confluenceSources = [asiaMatch.has(level) ? 'prevAsia' : null, monMatch.has(level) ? 'monday' : null].filter(Boolean).join('+') || null;

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
              confluenceGrade, confluenceSources,
              otherSideTouchedBefore: null,   // filled in a post-pass below (needs both sides' first-touch times)
              price: +here.toFixed(6), pip,
              dayOpen, asiaHigh: asia.high, asiaLow: asia.low, asiaRange: asia.range,
              time: bar.time, resolveTime, outcome, resolveIdx,
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
