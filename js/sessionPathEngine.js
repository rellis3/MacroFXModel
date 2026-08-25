/**
 * Session Path — the WHOLE-SESSION companion to Level Atlas.
 *
 * Level Atlas answers "price just touched a line — what happens next at THAT
 * line?" (one row per touch). This engine answers a different question: "how
 * far along has TODAY got toward a target band, and given that, does the
 * FULL SESSION go on to reach it?" (one row per day, walked forward hour by
 * hour). Same fitted ladder, same M1 archive, same OOS-holding discipline —
 * a second walk on shared bricks, not a duplicate engine (see
 * `MD files/LEGO_MODULES.md`).
 *
 * ── THE TRAP THIS EXISTS TO AVOID ────────────────────────────────────────────
 * The naive version of this idea buckets days by "% of the way to the band at
 * hour H" and stops there. That silently breaks the moment price reverses:
 * a day that raced 80% of the way to a band by 07:00 and a day that raced 80%
 * of the way there and then gave half of it back by 09:00 get the SAME bucket
 * under that scheme, even though they are opposite setups — the second one is
 * a FAILED extension, not an in-progress one, and empirically does not carry
 * the same (or even a positive) edge. So every checkpoint tracks TWO numbers,
 * not one:
 *   progressFrac      — how far along RIGHT NOW (0 = at open, 1 = at the band)
 *   peakProgressFrac  — the BEST progress made so far this session, causal
 *                        (a running max using only bars up to the checkpoint)
 * `reversalFrac = peakProgressFrac - progressFrac` is the "gave it back" read.
 * A day with a large peak and a large reversal is bucketed as FADED, separate
 * from a day still sitting near its peak (EXTENDING) — so the live query can
 * honestly report an edge BELOW the unconditional baseline for a faded setup,
 * not just a decayed version of the peak-day number.
 *
 * ── NO-LOOKAHEAD CONTRACT ─────────────────────────────────────────────────────
 * Every checkpoint's progress/peak/reversal reads ONLY bars up to and
 * including that checkpoint's own bar. The outcome (does the day reach the
 * band LATER) only ever scans bars strictly AFTER the checkpoint. A day that
 * had ALREADY reached the band by the checkpoint is excluded from that
 * checkpoint's conditioning set entirely — "will it reach the band" is a
 * moot question once it already has, and counting it would inflate the hit
 * rate for every later, harder checkpoint.
 *
 * Pure: no network, no I/O. Callers supply packed M1 + sessions.
 */

import { bucketM1IntoSessions } from './forecastAnalyser.js';
import { buildLadder } from './forecastLadder.js';
import { LADDER_PARAMS } from './forecastLadderParams.js';
import { forecastSigma } from './forecastSigma.js';
import { sessionRangeSeries, sessionVolBucket } from './levelAtlasEngine.js';
import { createHtfContext, createConfluenceFeatures } from './confluenceFeatures.js';
import { sessionConfluenceLevels, DAILY_CONFLUENCE_SOURCES } from './rangeLineAnalyser.js';
import { pipSize } from './instrumentRegistry.js';

function dowOf(dateStr) { return new Date(dateStr + 'T00:00:00Z').getUTCDay(); }
function sessionOf(hourUtc) {
  if (hourUtc >= 22 || hourUtc < 7) return 'Asia';
  if (hourUtc < 13) return 'London';
  return 'NY';
}

export const RUNGS = ['p50', 'p75', 'p90'];
export const SIDES = ['up', 'down'];

// Checkpoints are HOURS SINCE SESSION START (session = midnight Europe/London,
// same anchor the volatility forecast itself trades on) — "7" means "07:00
// London", matching how a trader would actually phrase a checkpoint, with no
// extra timezone convention to keep in sync with the rest of the site.
export const CHECKPOINT_HOURS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20];

// Progress-so-far buckets — "how far along toward the band right now".
function progressBucket(frac) {
  if (frac == null) return null;
  return frac < 0.30 ? '1·early' : frac < 0.70 ? '2·partway' : '3·most-of-the-way';
}
// Shape bucket — the reversal-aware read the module header explains. Only
// meaningful once there's been SOME progress to give back; a day that never
// got anywhere has nothing to "fade" from, so it's its own bucket rather than
// forced into "extending".
//
// Buckets on RELATIVE giveback (reversalFrac / peakFrac) — how much of the
// day's OWN peak progress has been surrendered — not an absolute distance.
// A first cut used an absolute threshold and it blurred two very different
// patterns together: a big move that gave back a little (still basically
// extending) landed in the same bucket as a big move that gave back MOST of
// itself (a failed extension) — checked against real EURUSD history, the
// absolute version showed the "faded" bucket at ABOVE-baseline odds, the
// opposite of the pattern it was meant to isolate. Splitting by relative
// giveback separates "extending"/"pulled back a bit" (normal pullback
// within an ongoing move) from "deep reversal" (gave back most of what it
// gained — the specific failure pattern to watch for).
function shapeBucket(peakFrac, reversalFrac) {
  if (peakFrac == null) return null;
  if (peakFrac < 0.15) return '1·flat';                                   // never really moved toward it
  const giveback = peakFrac > 0 ? reversalFrac / peakFrac : 0;
  if (giveback >= 0.65) return '4·deep-reversal';       // gave back most of its own peak progress
  if (giveback >= 0.25) return '3·pulled-back';         // a real, partial retracement
  return '2·extending';                                 // still sitting near its own peak
}

/**
 * Walk one instrument's full history and emit one record per
 * (day, side, rung, checkpoint hour) — EXCLUDING any checkpoint where the
 * band was already reached by that hour (see the no-lookahead contract).
 *
 *   sessionPathWalk(packed, { instrument, assetClass })
 *     -> { rows: [...], coverage: { from, to, sessions } }
 */
export function sessionPathWalk(packed, { instrument, assetClass = 'fx', minLookback = 60,
                                           checkpointHours = CHECKPOINT_HOURS, liveWindowDays = null,
                                           htfMinBars, structural = true, confLookback = 5 } = {}) {
  const sym = String(instrument).toUpperCase();
  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const dates = [...sessions.keys()].sort().filter(d => (sessions.get(d)?.length ?? 0) >= 200);
  if (dates.length <= minLookback) return { rows: [], coverage: null };

  const d1 = dates.map(d => {
    const b = sessions.get(d); let hi = -Infinity, lo = Infinity;
    for (const x of b) { if (x.high > hi) hi = x.high; if (x.low < lo) lo = x.low; }
    return { date: d, open: b[0].open, high: hi, low: lo, close: b[b.length - 1].close };
  });
  const est = LADDER_PARAMS.pairs?.[sym]?.estimator ?? LADDER_PARAMS.classDefaults?.[assetClass]?.estimator ?? 'yz_30';
  const rangeMap = sessionRangeSeries(packed);
  const otherSide = { up: 'down', down: 'up' };

  // ── Momentum/VWAP-at-checkpoint context — SAME brick Level Atlas uses at a
  // touch (`createHtfContext`/`createConfluenceFeatures`), called here at each
  // checkpoint bar instead of at a touch. One `htf`/`tf` per instrument, one
  // WaveTrend series per day (cached), never a second copy of this math.
  let pip = 1; try { pip = pipSize(instrument) || 1; } catch { /* unknown symbol → raw price units */ }
  const htf = createHtfContext(packed, htfMinBars ? { minHtfBars: htfMinBars } : {});
  const tf = createConfluenceFeatures({ htf });
  const wt1Cache = new Map();   // date -> session M1 WaveTrend series (causal EMA, computed once)

  const startIdx = liveWindowDays != null ? Math.max(minLookback, dates.length - liveWindowDays) : minLookback;
  const rows = [];
  for (let i = startIdx; i < dates.length; i++) {
    const date = dates[i];
    const bars = sessions.get(date);
    const open = bars[0].open;
    let sigma = 0;
    try { sigma = forecastSigma(d1.slice(0, i), est); } catch { continue; }
    if (!(sigma > 0)) continue;
    const lad = buildLadder(sigma, { instrument: sym, assetClass, horizon: 'daily', eventTag: 'none' });
    if (!lad?.oh?.p90 || !lad?.ol?.p90) continue;

    // ── Day-level context — SAME formulas as levelAtlasEngine.js (reused,
    // not re-derived): a `dayVol`/`prevCloseLoc`/`gapBucket` computed one way
    // for touch-level and a subtly different way for session-level would be
    // exactly the "silently disagree" risk the whole project avoids.
    const dow = dowOf(date);
    const priorDates = dates.slice(0, i);
    const dayVol = (() => {
      const hist = []; for (let k = Math.max(0, i - 20); k < i; k++) { try { const s = forecastSigma(d1.slice(0, k), est); if (s > 0) hist.push(s); } catch {} }
      if (hist.length < 8) return null;
      const sorted = [...hist].sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
      if (!(med > 0)) return null;
      const r = sigma / med;
      return r < 0.85 ? '1·quiet' : r > 1.25 ? '3·heavy' : '2·normal';
    })();
    const prevClose = i > 0 ? d1[i - 1].close : open;
    const gapSig = (sigma > 0 && prevClose > 0) ? (open - prevClose) / prevClose / sigma : 0;
    const gapBucket = Math.abs(gapSig) < 0.25 ? 'flat' : gapSig > 0 ? 'gap-up' : 'gap-down';
    const prevCloseLoc = (() => {
      if (i < 1) return null;
      let ySigma; try { ySigma = forecastSigma(d1.slice(0, i - 1), est); } catch { return null; }
      if (!(ySigma > 0)) return null;
      const yLad = buildLadder(ySigma, { instrument: sym, assetClass, horizon: 'daily', eventTag: 'none' });
      if (!yLad?.oh?.p75 || !yLad?.ol?.p75) return null;
      const yOpen = d1[i - 1].open, yClose = d1[i - 1].close;
      if (!(yOpen > 0)) return null;
      const moveFrac = (yClose - yOpen) / yOpen * 100;
      if (moveFrac >= 0) return moveFrac >= yLad.oh.p75 ? '3·beyond-p75-up' : moveFrac >= yLad.oh.p50 ? '2·beyond-p50-up' : '1·inside';
      return -moveFrac >= yLad.ol.p75 ? '3·beyond-p75-dn' : -moveFrac >= yLad.ol.p50 ? '2·beyond-p50-dn' : '1·inside';
    })();
    const asiaVolCandidate = sessionVolBucket(rangeMap, date, 'Asia', priorDates);
    const londonVolCandidate = sessionVolBucket(rangeMap, date, 'London', priorDates);

    // ── Momentum/VWAP context, once per day (reused across sides/rungs/hours) ──
    let wt1 = wt1Cache.get(date);
    if (!wt1) { wt1 = tf.wtSeries(bars); wt1Cache.set(date, wt1); }
    let confLevels = null;
    if (structural) {
      let intraday = [];
      for (let j = Math.max(0, i - confLookback); j < i; j++) { const pb = sessions.get(dates[j]); if (pb) intraday = intraday.concat(pb); }
      confLevels = sessionConfluenceLevels({ dailyBars: d1.slice(0, i), intraday, pip, price: open,
        sources: DAILY_CONFLUENCE_SOURCES, fib15: false });
    }
    // Session boundaries here are in ELAPSED HOURS SINCE SESSION START
    // (≈ London local hour, since the session itself starts at London
    // midnight) rather than the UTC-hour convention levelAtlasEngine.js's
    // sessionOf() uses for a per-BAR touch time — a checkpoint is a fixed
    // offset from session start, not a UTC clock time, so this is the
    // correct axis for it. Same ~1hr DST-transition tolerance already
    // accepted for sessionSpanMins elsewhere in this codebase.

    // ── Pass 1: track BOTH sides' peakFrac at every checkpoint. Needed for
    // the two-way-day dimension (has the OPPOSITE side ALSO moved
    // meaningfully by now) — has to be a separate pass because the emission
    // loop below processes one side at a time and needs the OTHER side's
    // number at the SAME checkpoint, which doesn't exist yet on a single pass.
    const peakLookup = {};   // `${side}|${rung}|${checkpointHour}` -> peakFrac
    const levelsBySide = {};
    for (const side of SIDES) {
      const isUp = side === 'up';
      const q = isUp ? lad.oh : lad.ol;
      if (!(q.p50 && q.p75 && q.p90)) continue;
      const sgn = isUp ? 1 : -1;
      const levels = { p50: open * (1 + sgn * q.p50 / 100), p75: open * (1 + sgn * q.p75 / 100), p90: open * (1 + sgn * q.p90 / 100) };
      levelsBySide[side] = levels;
      let runExtreme = open, cpIdx = 0;
      const startTime = bars[0].time;
      for (let k = 0; k < bars.length && cpIdx < checkpointHours.length; k++) {
        const bar = bars[k];
        if (isUp ? bar.high > runExtreme : bar.low < runExtreme) runExtreme = isUp ? bar.high : bar.low;
        const elapsedHrs = (bar.time - startTime) / 3600;
        if (elapsedHrs < checkpointHours[cpIdx]) continue;
        for (const rung of RUNGS) {
          const level = levels[rung];
          const dist = isUp ? (level - open) : (open - level);
          if (!(dist > 0)) continue;
          peakLookup[`${side}|${rung}|${checkpointHours[cpIdx]}`] = +((isUp ? (runExtreme - open) : (open - runExtreme)) / dist).toFixed(3);
        }
        cpIdx++;
      }
    }
    function otherSideBucket(side, rung, hour) {
      const p = peakLookup[`${otherSide[side]}|${rung}|${hour}`];
      if (p == null) return null;
      return p < 0.15 ? '1·one-way-so-far' : p < 0.5 ? '2·some-two-way' : '3·both-sides-active';
    }

    for (const side of SIDES) {
      const isUp = side === 'up';
      const levels = levelsBySide[side];
      if (!levels) continue;

      // Running peak (causal — only bars up to and including index k) and,
      // separately, which checkpoint hours have already had their row
      // emitted (a checkpoint only fires once, at the FIRST bar at/after its
      // target minute — later bars within the same clock hour don't re-fire).
      //
      // `peakElapsedHrs` tracks WHEN runExtreme was actually set — a real
      // user caught, on real data, that reporting a session's peak/reversal
      // as if it happened AT the checkpoint hour that reports it is wrong:
      // the checkpoint is a fixed sampling grid (4,5,6,...), not the moment
      // the peak occurred. On the real example that was caught, the peak sat
      // at 1h40m into the session while the checkpoint reporting "already
      // reversing" was the 4h one — a checkpoint that fires 2+ hours after
      // the actual event and describes it with the checkpoint's OWN time
      // reads as flatly wrong once you check it against a real chart. Stored
      // per row so the UI can say "peaked ~1.7h in" instead of implying it
      // peaked at the checkpoint itself.
      let runExtreme = open;   // running high (up) / running low (down) so far
      let peakElapsedHrs = 0;
      let cpIdx = 0;
      const startTime = bars[0].time;
      for (let k = 0; k < bars.length && cpIdx < checkpointHours.length; k++) {
        const bar = bars[k];
        const elapsedHrs = (bar.time - startTime) / 3600;
        if (isUp ? bar.high > runExtreme : bar.low < runExtreme) { runExtreme = isUp ? bar.high : bar.low; peakElapsedHrs = elapsedHrs; }
        if (elapsedHrs < checkpointHours[cpIdx]) continue;
        const hour = checkpointHours[cpIdx];

        for (const rung of RUNGS) {
          const level = levels[rung];
          const dist = isUp ? (level - open) : (open - level);
          if (!(dist > 0)) continue;
          // Rounded BEFORE the exclusion check, not after: a raw peakFrac of
          // 0.9996 passes a "< 1" gate but rounds to a stored 1.000, which
          // would silently violate every downstream assumption that a row's
          // own peakFrac is strictly under 1. Round once, gate on that.
          const progressFrac = +((isUp ? (bar.close - open) : (open - bar.close)) / dist).toFixed(3);
          const peakFrac = +((isUp ? (runExtreme - open) : (open - runExtreme)) / dist).toFixed(3);
          if (peakFrac >= 1) continue;   // already reached by this checkpoint — moot, and would inflate the hit rate
          const reversalFrac = +Math.max(0, peakFrac - progressFrac).toFixed(3);

          // Outcome: scanning ONLY bars strictly after this checkpoint, does
          // the session go on to reach the band for the first time?
          let reachedLater = false;
          for (let j = k + 1; j < bars.length; j++) {
            const px = isUp ? bars[j].high : bars[j].low;
            if (isUp ? px >= level : px <= level) { reachedLater = true; break; }
          }

          // ── At-the-checkpoint momentum/VWAP conditioning — same call site
          // shape as Level Atlas's at-touch conditioning, just evaluated at a
          // fixed checkpoint bar (`k`) toward the STILL-PENDING band, rather
          // than at the bar where a touch actually occurred.
          const feats = tf.compute({ bars, touchIdx: k, open, sigma, side: isUp ? 'up' : 'dn', wt1, level, pip, confLevels });

          rows.push({
            instrument: sym, assetClass, date, side, rung, checkpointHour: hour,
            open: +open.toFixed(6), level: +level.toFixed(6), currentPrice: +bar.close.toFixed(6), pip,
            progressFrac, peakFrac, reversalFrac, peakElapsedHrs: +peakElapsedHrs.toFixed(2),
            progress: progressBucket(progressFrac), shape: shapeBucket(peakFrac, reversalFrac),
            dow, gapBucket, dayVol,
            asiaVol: hour >= 7 ? (asiaVolCandidate?.bucket ?? null) : null,
            londonVol: hour >= 13 ? (londonVolCandidate?.bucket ?? null) : null,
            prevCloseLoc,
            otherSideProgress: otherSideBucket(side, rung, hour),
            wtState: feats.wtState?.bucket ?? null,
            wtMtf: feats.wtMtf?.bucket ?? null,
            wtSlow: feats.wtSlow?.bucket ?? null,
            momAdx: feats.momAdx?.bucket ?? null,
            htfTrend: feats.htfTrend?.bucket ?? null,
            vwapSide: feats.vwapSide?.bucket ?? null,
            confluence: feats.confluence?.bucket ?? null,
            reachedLater,
          });
        }
        cpIdx++;
      }
    }
  }
  return { rows, coverage: { from: dates[startIdx], to: dates.at(-1), sessions: dates.length, estimator: est } };
}
