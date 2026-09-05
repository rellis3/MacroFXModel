// Daily-Open Retest — CONFLUENCE / VOTE-MARGIN study — 2026-09-03
//
// Follows up analysis/daily_open_retest_study.mjs, which found the UNCONDITIONAL
// continuation rate at a daily-open retest is a clean 49.1% coin flip (n=39,484
// OOS). The user's response: "retreating and reversing and restarting and
// contingency continuing are still valid trades... hoping you could find a
// confluence to use the level" — i.e. a flat unconditional lean doesn't mean
// untradeable, it means direction should be decided by CONTEXT at the specific
// touch, exactly the premise js/levelAtlasEngine.js's atlasWalk + the Level
// Atlas Vote system (js/levelAtlasReport.js, js/levelAtlasVoteReview.js) are
// already built on for forecast-ladder rungs.
//
// This script re-walks the SAME breakaway→rearm→retest→race logic as the
// original null study (copied, not imported — the walk is a purpose-built
// single-level walk, same reason the original gives for not calling atlasWalk
// directly: the daily open has no natural inner/outer neighbour of its own).
// What's NEW here: at each RETEST touch bar (the decision point), it computes
// the full at-the-moment context vector using the SAME feature bricks
// atlasWalk itself calls — touchFeatures/confluenceFeatures (approachVel,
// approachER, wtState, wtMtf, wtSlow, vwapSide, momAdx, htfTrend, volClimax,
// roundNum, confluence), sessionVolBucket/prevSessionVolBucket (asiaVol,
// londonVol, prevSessionVol), sessionConfluenceLevels (structural confluence
// AT THE OPEN), and cvolLoader (ivRegime/vrp/ivSkewDir) — never reimplemented.
//
// ── ORIENTATION, THE PART THAT ISN'T A COPY-PASTE ───────────────────────────
// atlasWalk's directional features (wtState, wtMtf, wtSlow, htfTrend, vwapSide,
// candleReject, ivSkewDir) are folded by `isUp` = the PHYSICAL direction of
// approach into the touched level (an upper rung is always approached from
// below, moving up). A daily-open RETEST is approached from the AWAY side,
// moving BACK toward open — i.e. the physical approach direction is the
// OPPOSITE of the day's breakaway `side`. So every call into these bricks below
// uses `approachSide = side === 'up' ? 'dn' : 'up'`, NOT `side` itself.
//
// That flip has a direct, testable consequence for outcome vocabulary too.
// atlasWalk's 'out' = price continues FURTHER in the approach direction
// (breaks past the touched line, away from origin) — which, at a daily-open
// retest, means punching THROUGH the open into the opposite p50 rung, i.e.
// this script's 'reversal'. atlasWalk's 'back' = price reverts AGAINST the
// approach direction, back toward origin — which here means bouncing off open
// back toward the ORIGINAL breakaway rung, i.e. this script's 'continuation'.
// So: reversal↔'out', continuation↔'back'. Every record stores BOTH:
// `outcome` ('out'|'back'|'neither', the vocabulary `js/levelAtlasReport.js`'s
// tableFor/annotateHolds/matchLiveContext/js/levelAtlasVoteReview.js's
// voteDecision all already speak, imported and called UNMODIFIED below) and
// `displayOutcome` ('continuation'|'reversal'|'neither', human-readable).
//
// ── DROPPED, NOT FORCED ──────────────────────────────────────────────────────
// Two of atlasWalk's DIMENSIONS are genuinely rung-specific and don't have an
// honest analogue here, so they're dropped rather than adapted:
//   • churn — measures one-sided vs two-sided DRIVE FROM ORIGIN (open) TOWARD
//     the touched rung. Here the touched level IS open, so "drive from open
//     toward open" is degenerate (not a redefinition — a divide-by-nothing).
//   • otherSideTouchedBefore — "was the opposite line tagged today" requires
//     TWO simultaneous lines (up rung + down rung existing at once). A day's
//     breakaway `side` is fixed for the whole day by construction (see the
//     original study's header, step 4) — there is no "other side" to check.
// prevOutcomeSameDay/CrossDay DO transfer, and transfer well: the "last visit
// to this exact rung" concept in atlasWalk becomes "last retest of open, same
// day / a different day" here — tracked via the same rolling ≤5-visit history
// pattern, kept as ONE sequence per pair (there's only one level).
//
// ── THE VOTE, THE ACTUAL REUSE ───────────────────────────────────────────────
// Every dimension bucket must clear js/levelAtlasReport.js's `annotateHolds`
// (IS lift ≥3pp, SAME SIGN in OOS, n≥30 both halves) before it's allowed to
// vote at all — the exact discipline `buildAtlasBook` uses, called with the
// SAME defaults (minN=30, minDelta=3). Per OOS touch, `matchLiveContext` (this
// script's book is shaped `{ cells: { 'up|p50': {...}, 'down|p50': {...} } }`
// — same shape `buildAtlasCard` builds, so the function needs zero shimming)
// and `voteDecision` are called UNMODIFIED, imported straight from
// js/levelAtlasReport.js / js/levelAtlasVoteReview.js. `voteDecision` itself
// returns null on a tie (by design, for the live "no trade" case); this study
// additionally needs the margin=0 rows for the distribution table, so ties are
// tallied separately here rather than dropped.
//
// Sample-size floor MIN_SAMPLE=30 per reported cell, same convention as every
// other study this session. IS/OOS split 60/40 by date, per pair (splitAt,
// same as the original null study) — pooled ACROSS PAIRS afterward for the
// book itself (more power to actually clear the OOS-holds gate; a live
// deployment would likely build one book per instrument the way
// buildAtlasBook normally is — flagged as a real design choice, not hidden).
//
// Pure historical re-walk of real M1 — no synthetic data, no lookahead.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { bucketM1IntoSessions } from '../js/forecastAnalyser.js';
import { forecastSigma } from '../js/forecastSigma.js';
import { buildLadder } from '../js/forecastLadder.js';
import { LADDER_PARAMS } from '../js/forecastLadderParams.js';
import { rungLevelsForLadder, sessionRangeSeries, sessionVolBucket, prevSessionVolBucket } from '../js/levelAtlasEngine.js';
import { createHtfContext, createConfluenceFeatures } from '../js/confluenceFeatures.js';
import { sessionConfluenceLevels, DAILY_CONFLUENCE_SOURCES } from '../js/rangeLineAnalyser.js';
import { DIMENSIONS, tableFor, annotateHolds, summarizeAll, splitAt, matchLiveContext, leanOf } from '../js/levelAtlasReport.js';
import { voteDecision } from '../js/levelAtlasVoteReview.js';
import { cvolSeries, CVOL_PRODUCTS } from '../js/cvolLoader.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { pipSize } from '../js/instrumentRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');

const REARM_FRAC = 0.3;
const MIN_LOOKBACK = 60;
const MIN_SAMPLE = 30;
const SPLIT_FRAC = 0.6;
const CONF_LOOKBACK = 5;   // same default atlasWalk uses for its intraday confluence window

const ALL_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const PAIRS = process.env.LA_PAIRS
  ? process.env.LA_PAIRS.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  : ALL_PAIRS;

const CVOL_PRODUCT_MAP = { gold: 'XAUUSD' };
function cvolProductFor(pair) { return CVOL_PRODUCT_MAP[pair] ?? pair.toUpperCase(); }

// Two dimensions genuinely don't transfer — see header. Everything else in
// DIMENSIONS is either directly reusable (session/vol/day-type facts) or
// reusable via the same feature bricks atlasWalk itself calls.
const DROP_DIMS = new Set(['churn', 'otherSideTouchedBefore']);
const DIMENSIONS_USED = DIMENSIONS.filter(([k]) => !DROP_DIMS.has(k));

function dowOf(dateStr) { return new Date(dateStr + 'T00:00:00Z').getUTCDay(); }
function sessionOf(hourUtc) {
  if (hourUtc >= 22 || hourUtc < 7) return 'Asia';
  if (hourUtc < 13) return 'London';
  return 'NY';
}
function pct(n, d) { return d > 0 ? +(n / d * 100).toFixed(1) : null; }
function propCI(k, n) {
  if (!(n > 0)) return null;
  const p = k / n, se = Math.sqrt(p * (1 - p) / n);
  return { p: +(p * 100).toFixed(1), lo: +Math.max(0, (p - 1.96 * se) * 100).toFixed(1), hi: +Math.min(100, (p + 1.96 * se) * 100).toFixed(1), n };
}

async function processPair(pair) {
  const sym = pair.toUpperCase();
  let packed;
  try { packed = await loadM1ForPair(pair); } catch (e) { console.log(`  M1 load failed: ${e.message}`); return null; }
  if (!packed?.n) { console.log('  no M1 data, skipping'); return null; }
  const assetClass = assetClassFor(pair);
  let pip = 1; try { pip = pipSize(pair) || 1; } catch { /* raw units */ }

  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const dates = [...sessions.keys()].sort().filter(d => (sessions.get(d)?.length ?? 0) >= 200);
  if (dates.length <= MIN_LOOKBACK) { console.log('  too little history, skipping'); return null; }

  const d1 = dates.map(d => {
    const b = sessions.get(d); let hi = -Infinity, lo = Infinity;
    for (const x of b) { if (x.high > hi) hi = x.high; if (x.low < lo) lo = x.low; }
    return { date: d, open: b[0].open, high: hi, low: lo, close: b[b.length - 1].close };
  });
  const est = LADDER_PARAMS.pairs?.[sym]?.estimator ?? LADDER_PARAMS.classDefaults?.[assetClass]?.estimator ?? 'yz_30';

  // ── Context machinery, built ONCE per pair — same bricks atlasWalk uses ────
  const rangeMap = sessionRangeSeries(packed);
  const htf = createHtfContext(packed);
  const tf = createConfluenceFeatures({ htf });
  const wt1Cache = new Map();
  const cvolProduct = cvolProductFor(pair);
  const ivByDate = CVOL_PRODUCTS.includes(cvolProduct) ? await cvolSeries(cvolProduct) : null;
  if (!ivByDate) console.log(`  (no CVOL coverage for ${sym} — ivRegime/vrp/ivSkewDir will read null)`);

  const t0 = Date.now();
  const records = [];
  let daysWithBreakaway = 0;
  // `lastCrossDayVisit` — the most recent COMPLETED day's own last retest
  // outcome. Safe by construction: a retest's race is bounded to bars.length
  // (THIS day's session only — see the race loop below), so a prior day's
  // resolution is always fully known before today's session even starts.
  // Snapshotted ONCE per day (below), not updated until the day's bar loop
  // finishes, so every touch within a day sees the SAME (safe) cross-day read.
  let lastCrossDayVisit = null;

  for (let i = MIN_LOOKBACK; i < dates.length; i++) {
    const date = dates[i];
    const bars = sessions.get(date);
    const open = bars[0].open;
    let sigma = 0;
    try { sigma = forecastSigma(d1.slice(0, i), est); } catch { continue; }
    if (!(sigma > 0)) continue;
    const lad = buildLadder(sigma, { instrument: sym, assetClass, horizon: 'daily', eventTag: 'none' });
    if (!lad?.oh?.p50 || !lad?.ol?.p50) continue;

    const lvBySide = rungLevelsForLadder(lad, open);
    const pUp = lvBySide.up?.[1], pDown = lvBySide.down?.[1];
    if (!(pUp > open) || !(pDown < open) || !(pDown > 0)) continue;
    const rungSpanUp = pUp - open, rungSpanDown = open - pDown;
    const rearmUp = REARM_FRAC * rungSpanUp, rearmDown = REARM_FRAC * rungSpanDown;

    const dayVol = (() => {
      const hist = [];
      for (let k = Math.max(0, i - 20); k < i; k++) { try { const s = forecastSigma(d1.slice(0, k), est); if (s > 0) hist.push(s); } catch {} }
      if (hist.length < 8) return null;
      const sorted = [...hist].sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
      if (!(med > 0)) return null;
      const r = sigma / med;
      return r < 0.85 ? '1·quiet' : r > 1.25 ? '3·heavy' : '2·normal';
    })();

    // Yesterday's close vs ITS OWN forecast bands — verbatim atlasWalk logic.
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

    const dow = dowOf(date);
    const priorDates = dates.slice(0, i);
    const asiaVolCandidate = sessionVolBucket(rangeMap, date, 'Asia', priorDates);
    const londonVolCandidate = sessionVolBucket(rangeMap, date, 'London', priorDates);

    const prevClose = i > 0 ? d1[i - 1].close : open;
    const gapSig = (sigma > 0 && prevClose > 0) ? (open - prevClose) / prevClose / sigma : 0;
    const gapBucket = Math.abs(gapSig) < 0.25 ? 'flat' : gapSig > 0 ? 'gap-up' : 'gap-down';

    const ivYesterday = (ivByDate && i > 0) ? ivByDate.get(dates[i - 1]) : null;
    const ivRegime = (() => {
      if (!ivByDate || !ivYesterday) return null;
      const hist = [];
      for (let k = Math.max(0, i - 21); k < i; k++) { const v = ivByDate.get(dates[k])?.cvol; if (v > 0) hist.push(v); }
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

    // Structural confluence AT THE OPEN — same builder + tolerance atlasWalk
    // uses, pointed at `price: open` instead of a rung.
    let intraday = [];
    for (let j = Math.max(0, i - CONF_LOOKBACK); j < i; j++) { const pb = sessions.get(dates[j]); if (pb) intraday = intraday.concat(pb); }
    const confLevels = sessionConfluenceLevels({ dailyBars: d1.slice(0, i), intraday, pip, price: open, sources: DAILY_CONFLUENCE_SOURCES, fib15: false });

    let wt1 = wt1Cache.get(date);
    if (!wt1) { wt1 = tf.wtSeries(bars); wt1Cache.set(date, wt1); }

    // Snapshot for the WHOLE day — constant, safe (see comment at declaration).
    const priorDayVisit = lastCrossDayVisit;
    const dayRetests = [];   // this day's own retests so far: {touchTime, resolveTime, outcome}

    let hasBrokenAway = false, side = null, armed = false, ordinal = 0;

    for (let k = 0; k < bars.length; k++) {
      const bar = bars[k];
      const upAway = bar.high - open, downAway = open - bar.low;

      if (!hasBrokenAway) {
        if (upAway >= rearmUp) { hasBrokenAway = true; side = 'up'; armed = true; }
        else if (downAway >= rearmDown) { hasBrokenAway = true; side = 'down'; armed = true; }
        continue;
      }
      if (!armed) {
        if (upAway >= rearmUp || downAway >= rearmDown) armed = true;
        continue;
      }
      if (!(bar.low <= open && bar.high >= open)) continue;

      ordinal++;
      armed = false;

      // ── PHYSICAL approach direction is the OPPOSITE of the day's breakaway
      // `side` — see header. This is the ONLY orientation flip in the whole
      // script; everything downstream (features, outcome vocabulary mapping)
      // follows directly from it.
      const approachSide = side === 'up' ? 'dn' : 'up';
      const isApproachUp = approachSide === 'up';

      const contTarget = side === 'up' ? pUp : pDown;
      const revTarget = side === 'up' ? pDown : pUp;
      let outcome = 'neither', resolveTime = null;
      let deepest = open, extreme = open;
      for (let j = k; j < bars.length; j++) {
        const b2 = bars[j];
        const fwd = isApproachUp ? b2.high : b2.low;   // continuing IN the approach direction (→ punches through open → reversal)
        const bwd = isApproachUp ? b2.low : b2.high;    // reverting AGAINST the approach direction (→ bounces off open → continuation)
        if (isApproachUp ? bwd < deepest : bwd > deepest) deepest = bwd;
        if (isApproachUp ? fwd > extreme : fwd < extreme) extreme = fwd;
        const contHit = side === 'up' ? b2.high >= contTarget : b2.low <= contTarget;
        const revHit = side === 'up' ? b2.low <= revTarget : b2.high >= revTarget;
        if (contHit) { outcome = 'continuation'; resolveTime = b2.time; break; }
        if (revHit) { outcome = 'reversal'; resolveTime = b2.time; break; }
      }
      // atlasWalk vocabulary: 'out' = continues in approach direction = reversal here; 'back' = reverts = continuation here.
      const bookOutcome = outcome === 'reversal' ? 'out' : outcome === 'continuation' ? 'back' : 'neither';

      const sgn = isApproachUp ? 1 : -1;
      const fadePips = (open - deepest) / pip * sgn;
      const runPips = (extreme - open) / pip * sgn;
      const rungSpanCont = side === 'up' ? rungSpanUp : rungSpanDown;   // distance to the CONTINUATION target — the direction `deepest` moves in
      const pullbackFrac = rungSpanCont > 0 ? Math.min(1, Math.abs(open - deepest) / rungSpanCont) : null;

      const touchHourUtc = new Date(bar.time * 1000).getUTCHours();
      const touchSession = sessionOf(touchHourUtc);
      const minsIntoSession = (bar.time - bars[0].time) / 60;
      const sessionFrac = minsIntoSession / 1440;
      const sessionPos = sessionFrac < 0.33 ? '1·early' : sessionFrac < 0.67 ? '2·mid' : '3·late';
      const asiaVolSafe = (touchSession === 'London' || touchSession === 'NY') ? asiaVolCandidate?.bucket ?? null : null;
      const londonVolSafe = (touchSession === 'NY') ? londonVolCandidate?.bucket ?? null : null;
      const prevSessionVol = prevSessionVolBucket(rangeMap, date, touchSession, dates);
      const overlapWindow = touchHourUtc >= 12 && touchHourUtc < 16;

      const ivSkewDir = (() => {
        if (!ivYesterday || !Number.isFinite(ivYesterday.skew)) return null;
        const oriented = isApproachUp ? ivYesterday.skew : -ivYesterday.skew;
        return Math.abs(oriented) < 0.15 ? '2·neutral' : oriented > 0 ? '3·with' : '1·against';
      })();

      // ── The at-the-moment conditioning stack — SAME bricks atlasWalk calls,
      // level = open, side = the PHYSICAL approach direction (not breakaway side).
      const feats = tf.compute({ bars, touchIdx: k, open, sigma, side: approachSide, wt1, level: open, pip, confLevels });

      // ── prevOutcomeSameDay — CAUSALLY GATED, not just "the previous ordinal".
      // A same-day retest's own race is bounded to bars.length (this day's
      // remaining bars), so an EARLIER retest's resolution can land AFTER a
      // LATER retest's touch bar (found empirically: ~80% of consecutive
      // same-day retest pairs on EURUSD alone) — using it unconditionally
      // would tell the current touch something about the future. Scan
      // backward through this day's retests SO FAR for the most recent one
      // that (a) wasn't 'neither' and (b) had ALREADY resolved (resolveTime
      // <= this touch's bar.time) — i.e. was genuinely knowable at this
      // instant. `dayRetests` is chronological by touch order.
      let prevOutcomeSameDay = null;
      for (let x = dayRetests.length - 1; x >= 0; x--) {
        const cand = dayRetests[x];
        if (cand.outcome !== 'neither' && cand.resolveTime != null && cand.resolveTime <= bar.time) { prevOutcomeSameDay = cand.outcome; break; }
      }
      // prevOutcomeCrossDay — always safe (see `lastCrossDayVisit` comment).
      const prevOutcomeCrossDay = priorDayVisit ? priorDayVisit.outcome : null;

      records.push({
        instrument: sym, assetClass, date, dow, side, rung: 'p50', ordinal, rearmFrac: REARM_FRAC,
        hourUtc: touchHourUtc, minsIntoSession: +minsIntoSession.toFixed(0), sessionPos,
        session: touchSession, dowSession: `${dow}|${touchSession}`,
        gapBucket, dayVol, asiaVol: asiaVolSafe, londonVol: londonVolSafe, prevSessionVol,
        level: +open.toFixed(6), pip, open,
        touchTime: bar.time, resolveTime,
        outcome: bookOutcome, displayOutcome: outcome,
        minsToResolve: resolveTime != null ? +((resolveTime - bar.time) / 60).toFixed(0) : null,
        pullbackFrac: pullbackFrac != null ? +pullbackFrac.toFixed(3) : null,
        fadePips: +fadePips.toFixed(1), runPips: +runPips.toFixed(1),
        contDistPips: +((side === 'up' ? rungSpanUp : rungSpanDown) / pip).toFixed(1),
        revDistPips: +((side === 'up' ? rungSpanDown : rungSpanUp) / pip).toFixed(1),
        approachVel: feats.approachVel?.bucket ?? null,
        approachER: feats.approachER?.bucket ?? null,
        wtState: feats.wtState?.bucket ?? null,
        wtMtf: feats.wtMtf?.bucket ?? null,
        wtSlow: feats.wtSlow?.bucket ?? null,
        vwapSide: feats.vwapSide?.bucket ?? null,
        momAdx: feats.momAdx?.bucket ?? null,
        confluence: feats.confluence?.bucket ?? null,
        candleReject: feats.candleReject?.bucket ?? null,
        htfTrend: feats.htfTrend?.bucket ?? null,
        volClimax: feats.volClimax?.bucket ?? null,
        roundNum: feats.roundNum?.bucket ?? null,
        prevCloseLoc, ivRegime, vrp, ivSkewDir,
        overlapWindow,
        prevOutcomeSameDay, prevOutcomeCrossDay,
      });
      dayRetests.push({ touchTime: bar.time, resolveTime, outcome: bookOutcome });
    }
    if (hasBrokenAway) daysWithBreakaway++;
    // Feed cross-day state for FUTURE days only once this day's own bar loop
    // (and therefore every one of its retests' races, all bounded to this
    // day) is fully finished — the day's OWN last retest, if any.
    if (dayRetests.length) lastCrossDayVisit = { outcome: dayRetests.at(-1).outcome, dayIdx: i };
  }

  if (!records.length) { console.log('  no retests found, skipping'); return null; }
  const { split } = splitAt(records, SPLIT_FRAC);
  for (const r of records) r.isOos = r.date >= split ? 'oos' : 'is';

  console.log(`  ${dates.length} sessions (${dates[MIN_LOOKBACK]}→${dates.at(-1)}), ${daysWithBreakaway} days had a breakaway, ${records.length} retests total, split ${split} — ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  return { pair: sym, coverage: { from: dates[MIN_LOOKBACK], to: dates.at(-1), sessions: dates.length }, splitDate: split, records };
}

// ── Book building — pooled ACROSS PAIRS, one cell per breakaway `side` ──────
// Shaped exactly like buildAtlasBook's `cells` map ('up|p50' / 'down|p50') so
// matchLiveContext/voteDecision need zero shimming to consume it.
function buildSideBook(allRecords, side) {
  const sideRecs = allRecords.filter(r => r.side === side);
  const is = sideRecs.filter(r => r.isOos === 'is');
  const oos = sideRecs.filter(r => r.isOos === 'oos');
  if (!is.length || !oos.length) return null;
  const baseIS = summarizeAll(is), baseOOS = summarizeAll(oos);
  const dims = {};
  for (const [dimKey] of DIMENSIONS_USED) {
    const tIs = tableFor(is, dimKey), tOos = tableFor(oos, dimKey);
    if (!Object.keys(tIs).length) continue;
    dims[dimKey] = { is: tIs, oos: tOos };
  }
  annotateHolds(dims, baseIS, baseOOS, { minN: MIN_SAMPLE, minDelta: 3 });
  return { n: { is: is.length, oos: oos.length }, base: { is: baseIS, oos: baseOOS }, dims };
}

// voteDecision (js/levelAtlasVoteReview.js) returns null on a tie by design
// (the live "no trade" case) — this study also needs the margin=0 rows, so
// this wrapper reuses matchLiveContext directly and tallies margin itself,
// while ALSO calling the real voteDecision so `decision` matches production
// exactly whenever it returns non-null.
function voteForRecord(book, record) {
  const m = matchLiveContext(book, record);
  if (!m) return { outVotes: 0, backVotes: 0, margin: 0, matched: [], decision: null };
  const all = [...m.supports, ...m.challenges, ...m.context];
  const outVotes = all.filter(x => x.favors === 'out').length;
  const backVotes = all.filter(x => x.favors === 'back').length;
  const decision = voteDecision(book, record);   // real production function — null on tie
  return { outVotes, backVotes, margin: Math.abs(outVotes - backVotes), matched: all, decision };
}

function summarizeGroup(rows) {
  const n = rows.length;
  const cont = rows.filter(r => r.displayOutcome === 'continuation').length;
  const rev = rows.filter(r => r.displayOutcome === 'reversal').length;
  const neither = n - cont - rev;
  return { n, cont, rev, neither, contPct: pct(cont, n), revPct: pct(rev, n), neitherPct: pct(neither, n), resolved: cont + rev };
}

async function main() {
  const allRecords = [];
  const perPairMeta = [];

  for (const pair of PAIRS) {
    console.log(`\n=== ${pair.toUpperCase()} ===`);
    const r = await processPair(pair);
    if (!r) continue;
    allRecords.push(...r.records);
    perPairMeta.push({ pair: r.pair, coverage: r.coverage, splitDate: r.splitDate, nRetests: r.records.length });
  }

  const oosAll = allRecords.filter(r => r.isOos === 'oos');
  console.log(`\n\nPooled: ${perPairMeta.length} pairs, ${allRecords.length} total retests (${oosAll.length} OOS).`);

  // ── Sanity check vs the original null study's headline ──────────────────
  const baseline = summarizeGroup(oosAll);
  const baselineCI = propCI(baseline.cont, baseline.resolved);
  console.log(`\n================ UNCONDITIONAL BASELINE (OOS, sanity check vs original null) ================`);
  console.log(`  P(continuation|resolved) = ${baselineCI?.p}% [${baselineCI?.lo}-${baselineCI?.hi}%], n=${baselineCI?.n} (original study: 49.1%, n=39,484)`);

  // ── Build the held-dimension book, one cell per breakaway side ──────────
  const cells = {};
  const bookUp = buildSideBook(allRecords, 'up');
  const bookDown = buildSideBook(allRecords, 'down');
  if (bookUp) cells['up|p50'] = bookUp;
  if (bookDown) cells['down|p50'] = bookDown;
  const book = { cells };

  console.log(`\n================ HELD DIMENSIONS (cleared holdsOOS: n>=${MIN_SAMPLE} both halves, |delta|>=3pp, same sign) ================`);
  for (const [cellKey, cell] of Object.entries(cells)) {
    console.log(`  ${cellKey}  (n IS=${cell.n.is} OOS=${cell.n.oos})  base IS out=${cell.base.is.outPct}%/back=${cell.base.is.backPct}%  OOS out=${cell.base.oos.outPct}%/back=${cell.base.oos.backPct}%`);
    for (const [dimKey, dim] of Object.entries(cell.dims)) {
      for (const [bucket, g] of Object.entries(dim.is)) {
        if (!g.holdsOOS) continue;
        const o = dim.oos[bucket];
        console.log(`    HELD  ${dimKey.padEnd(20)} ${String(bucket).padEnd(16)} IS out=${g.outPct}% (n=${g.n}, Δ${g.deltaOut>0?'+':''}${g.deltaOut})   OOS out=${o.outPct}% (n=${o.n}, Δ${o.deltaOut>0?'+':''}${o.deltaOut})`);
      }
    }
  }

  // ── Vote every resolved OOS touch ────────────────────────────────────────
  const resolvedOos = oosAll.filter(r => r.displayOutcome !== 'neither');
  const votes = resolvedOos.map(r => {
    const cellKey = `${r.side}|p50`;
    const cell = cells[cellKey];
    if (!cell) return { r, margin: 0, matched: [], predicted: null, correct: null };
    const v = voteForRecord(book, r);
    const predicted = v.outVotes > v.backVotes ? 'reversal' : v.backVotes > v.outVotes ? 'continuation' : null;
    const correct = predicted != null ? (r.displayOutcome === predicted) : null;
    return { r, margin: v.margin, matched: v.matched, outVotes: v.outVotes, backVotes: v.backVotes, predicted, correct };
  });

  console.log(`\n================ WIN RATE BY VOTE MARGIN (OOS, resolved touches only) ================`);
  const marginBuckets = [0, 1, 2, 3, '4+'];
  const marginStats = {};
  for (const mb of marginBuckets) {
    const rows = mb === '4+' ? votes.filter(v => v.margin >= 4) : votes.filter(v => v.margin === mb);
    const decided = rows.filter(v => v.correct != null);
    const correctN = decided.filter(v => v.correct).length;
    const ci = propCI(correctN, decided.length);
    const thin = decided.length < MIN_SAMPLE;
    marginStats[mb] = { n: rows.length, nDecided: decided.length, correctN, winRateCI: ci, thin };
    console.log(`  margin=${String(mb).padEnd(3)}  n=${String(rows.length).padStart(6)}  decided=${String(decided.length).padStart(6)}  winRate=${ci ? `${ci.p}% [${ci.lo}-${ci.hi}%]` : 'n/a'}${thin ? '  [THIN n<' + MIN_SAMPLE + ']' : ''}`);
  }

  // margin>=3 — the live system's own validated threshold
  const m3 = votes.filter(v => v.margin >= 3 && v.correct != null);
  const m3CorrectN = m3.filter(v => v.correct).length;
  const m3CI = propCI(m3CorrectN, m3.length);
  console.log(`\n================ HEADLINE: margin>=3 vs unconditional baseline ================`);
  console.log(`  margin>=3: n=${m3.length}, winRate=${m3CI ? `${m3CI.p}% [${m3CI.lo}-${m3CI.hi}%]` : 'n/a (insufficient sample)'}`);
  console.log(`  unconditional baseline: ${baselineCI?.p}% [${baselineCI?.lo}-${baselineCI?.hi}%]`);
  if (m3CI && baselineCI) {
    const clearsBand = m3CI.lo > baselineCI.hi || m3CI.hi < baselineCI.lo;
    console.log(`  => ${clearsBand ? 'CIs are NON-OVERLAPPING — margin>=3 is genuinely different from baseline.' : 'CIs OVERLAP — margin>=3 is NOT distinguishable from the unconditional coin flip.'}`);
  }

  // ── By asset class / instrument at margin>=3 ─────────────────────────────
  console.log(`\n================ BY ASSET CLASS (margin>=3, OOS) ================`);
  const byAssetClass = {};
  for (const ac of ['fx', 'commodity', 'index']) {
    const rows = m3.filter(v => v.r.assetClass === ac);
    const correctN2 = rows.filter(v => v.correct).length;
    const ci = propCI(correctN2, rows.length);
    byAssetClass[ac] = { n: rows.length, winRateCI: ci, thin: rows.length < MIN_SAMPLE };
    if (rows.length) console.log(`  ${ac.padEnd(10)} n=${String(rows.length).padStart(5)}  winRate=${ci ? `${ci.p}% [${ci.lo}-${ci.hi}%]` : 'n/a'}${rows.length < MIN_SAMPLE ? '  [THIN]' : ''}`);
  }
  console.log(`\n================ BY INSTRUMENT (margin>=3, OOS) ================`);
  const byInstrument = {};
  for (const m of perPairMeta) {
    const rows = m3.filter(v => v.r.instrument === m.pair);
    const correctN2 = rows.filter(v => v.correct).length;
    const ci = propCI(correctN2, rows.length);
    byInstrument[m.pair] = { n: rows.length, winRateCI: ci, thin: rows.length < MIN_SAMPLE };
    if (rows.length) console.log(`  ${m.pair.padEnd(10)} n=${String(rows.length).padStart(5)}  winRate=${ci ? `${ci.p}% [${ci.lo}-${ci.hi}%]` : 'n/a'}${rows.length < MIN_SAMPLE ? '  [THIN]' : ''}`);
  }

  // ── Concentration check: which dims actually show up in margin>=3 votes ──
  console.log(`\n================ DIMENSION CONTRIBUTION (margin>=3 votes, OOS) ================`);
  const dimCount = {};
  let totalMatchedAtM1 = 0, nAtM1 = 0, totalMatchedAtM3 = 0, nAtM3 = 0;
  for (const v of votes) {
    if (v.margin >= 1) { totalMatchedAtM1 += v.matched.length; nAtM1++; }
    if (v.margin >= 3) {
      totalMatchedAtM3 += v.matched.length; nAtM3++;
      for (const mm of v.matched) dimCount[mm.dimKey] = (dimCount[mm.dimKey] ?? 0) + 1;
    }
  }
  const dimContribution = Object.entries(dimCount).sort((a, b) => b[1] - a[1]).map(([dimKey, count]) => ({ dimKey, count, pctOfM3Votes: pct(count, nAtM3) }));
  for (const d of dimContribution) console.log(`  ${d.dimKey.padEnd(20)} appears in ${d.count} of ${nAtM3} margin>=3 votes (${d.pctOfM3Votes}%)`);
  console.log(`  avg matched dims per vote: margin>=1 → ${nAtM1 ? (totalMatchedAtM1 / nAtM1).toFixed(2) : 'n/a'}, margin>=3 → ${nAtM3 ? (totalMatchedAtM3 / nAtM3).toFixed(2) : 'n/a'}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'daily_open_retest_confluence_study.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), pairs: PAIRS, rearmFrac: REARM_FRAC, splitFrac: SPLIT_FRAC, minSample: MIN_SAMPLE,
    dimensionsUsed: DIMENSIONS_USED.map(([k]) => k), dimensionsDropped: [...DROP_DIMS],
    perPairMeta,
    baseline: { oos: baseline, oosCI: baselineCI },
    book,
    marginStats, headlineMargin3: { n: m3.length, winRateCI: m3CI },
    byAssetClass, byInstrument, dimContribution,
    votesDetail: votes.map(v => ({
      instrument: v.r.instrument, date: v.r.date, side: v.r.side, ordinal: v.r.ordinal,
      displayOutcome: v.r.displayOutcome, margin: v.margin, outVotes: v.outVotes, backVotes: v.backVotes,
      predicted: v.predicted, correct: v.correct,
    })),
  }));
  console.log(`\nWrote full detail to ${OUT_DIR}/daily_open_retest_confluence_study.json`);
}

main();
