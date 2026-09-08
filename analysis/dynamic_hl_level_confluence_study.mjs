// Dynamic HL Level Study — CONFLUENCE / VOTE-MARGIN study — 2026-09-07
//
// Follows up analysis/dynamic_hl_level_study.mjs (Stage 1 — read that file's header
// FIRST: it has the full BM_P90 derivation, the no-lookahead anchor-lag decision, and
// the baseline out/back/neither rates this script's book is built on top of). This is
// the SAME two-stage shape as the daily-open-retest work
// (analysis/daily_open_retest_study.mjs -> analysis/daily_open_retest_confluence_study.mjs):
// Stage 1 measured the unconditional rates; this stage asks whether AT-THE-MOMENT
// CONTEXT (the same dimension vocabulary the live Level Atlas vote system already
// uses) lets a vote margin beat the unconditional baseline, the actual bar the live
// OH/OL rungs were validated against (margin>=3, IS-held + OOS-confirmed dimensions).
//
// ── SELF-CONTAINED BY DESIGN, NOT DRY ────────────────────────────────────────────────
// Per the exact precedent daily_open_retest_confluence_study.mjs itself set (its own
// header: "re-walks the SAME... logic as the original null study (copied, not
// imported)"), this script duplicates Stage 1's small `computeHlFractions`/`BM_P90`
// and re-implements the touch/rearm/race walk itself (now carrying the FULL context
// vector), rather than importing Stage 1 as a module — each analysis script here
// stays independently runnable without depending on a sibling script's internals not
// changing under it.
//
// ── WHAT'S NEW vs STAGE 1: FULL CONTEXT + THE REAL VOTE ─────────────────────────────
// At every touch, computes the full js/levelAtlasReport.js `DIMENSIONS` vocabulary
// using the EXACT SAME bricks atlasWalk itself calls — touchFeatures/confluenceFeatures
// (approachVel, approachER, wtState, wtMtf, wtSlow, vwapSide, momAdx, htfTrend,
// volClimax, roundNum, confluence, candleReject), sessionVolBucket/prevSessionVolBucket
// (asiaVol, londonVol, prevSessionVol), sessionConfluenceLevels (structural confluence,
// AT THE SESSION OPEN — same reference price atlasWalk itself uses, not per-rung),
// cvolLoader (ivRegime/vrp/ivSkewDir) — never reimplemented. Unlike the daily-open
// confluence study, NO dimension needs dropping and NO approach-direction flip is
// needed: an HL "up" touch (proj-high) really is approached from below moving up, and
// BOTH sides exist as genuine concurrent ladders (unlike the single degenerate open
// level), so `churn` (drive from open toward the touch) and `otherSideTouchedBefore`
// (was the down ladder's same rung already tagged today) transfer completely
// unmodified from atlasWalk's own definitions — this dynamic-HL ladder is structurally
// MUCH closer to atlasWalk's own OH/OL geometry than the daily-open single-level study
// was, precisely because it retains three concentric rungs on each of two sides.
//
// Since every record ends up the exact same SHAPE atlasWalk's own touches have
// (instrument, side, rung ∈ {p50,p75,p90}, rearmFrac, outcome ∈ {out,back,neither},
// fadePips, runPips, pullbackFrac, minsToResolve, plus every DIMENSIONS field),
// js/levelAtlasReport.js's tableFor/annotateHolds/summarizeAll/matchLiveContext and
// js/levelAtlasVoteReview.js's voteDecision are imported and called COMPLETELY
// UNMODIFIED below — this is the actual reuse the task requires, not a lookalike
// rebuild of the vote arithmetic. The one thing NOT reused verbatim is
// `buildAtlasBook` itself, because it assumes a SINGLE instrument's touches
// (`pool[0].instrument`) — this study pools ACROSS ALL 17 PAIRS for statistical power
// (same design choice, and the same trade-off, daily_open_retest_confluence_study.mjs
// already made and flagged), so `buildPooledBook` below reproduces buildAtlasBook's
// OWN cell-building loop verbatim, just keyed to iterate every (side,rung) pair
// pooled across instruments instead of one instrument's own touches.
//
// ── THE LOOKAHEAD CLASS THE TASK SAYS TO RE-CHECK ────────────────────────────────────
// The SAME bug daily_open_retest_confluence_study.mjs found and fixed for its own
// prevOutcomeSameDay field applies here too, independently re-verified: because a
// touch's own outcome is resolved by scanning FORWARD through the rest of the
// session's bars (needed — that's how you find out what actually happened next), the
// code can know a touch's full resolution the INSTANT it fires, even though that
// resolution's calendar time (`resolveTime`) may fall AFTER a LATER, re-armed touch of
// the SAME (side,rung) that happens sooner in bar order. Handing that later touch the
// earlier one's outcome unconditionally would leak the future into "context available
// at this instant". Fixed the same way here: `prevOutcomeSameDay` for a touch at
// `bar.time` scans that key's OWN same-day history backward for the most recent entry
// whose `resolveTime <= bar.time` (i.e. was actually knowable by then), skipping any
// entry that hasn't resolved yet in real time — not just `hist.at(-1)`.
// `prevOutcomeCrossDay` needs no such gate: a PRIOR day's session is always fully
// finished (any resolution, including 'neither', is a closed historical fact) before
// today's session starts, so reading yesterday's last visit is safe by construction —
// same reasoning the daily-open study gives for its own `lastCrossDayVisit`.
//
// margin>=3 (the live system's own validated threshold) is reported against the
// unconditional Stage-1 baseline with non-overlapping-CI as the bar for "genuinely
// different from a coin flip" — same discipline, same CI formula, same MIN_SAMPLE=30
// floor as every other study this session. p90 is EXCLUDED from the vote-margin table
// (not from the baseline book) because 'out' is structurally impossible there (no
// outer rung to break through) — same default (`excludeRungs=['p90']`) js/
// levelAtlasVoteReview.js's own `reviewVoteBacktest` uses, for the identical reason.
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
import { computeBands, ASSET_PARAMS } from '../js/forecastCore.js';
import { sessionRangeSeries, sessionVolBucket, prevSessionVolBucket } from '../js/levelAtlasEngine.js';
import { createHtfContext, createConfluenceFeatures } from '../js/confluenceFeatures.js';
import { sessionConfluenceLevels, DAILY_CONFLUENCE_SOURCES } from '../js/rangeLineAnalyser.js';
import { DIMENSIONS, tableFor, annotateHolds, summarizeAll, splitAt, matchLiveContext } from '../js/levelAtlasReport.js';
import { voteDecision } from '../js/levelAtlasVoteReview.js';
import { cvolSeries, CVOL_PRODUCTS } from '../js/cvolLoader.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { pipSize } from '../js/instrumentRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');

// BM_P90 — see analysis/dynamic_hl_level_study.mjs's header for the full derivation
// (exact Feller range-distribution closed form, validated against the theoretical
// mean, extrapolated consistently with the already-adopted BM_P50/BM_P75, cross-
// checked against forecastLadderParams.js's fitted fx "hl" p90/p75 ratio). Duplicated
// here as a plain constant (not imported) so this script stays independently runnable
// — same self-containment convention as the daily-open pair of scripts.
const BM_P90 = 2.555;
const HL_RUNGS = ['p50', 'p75', 'p90'];
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

function computeHlFractions(sigma, assetClass) {
  const b = computeBands(1, sigma, assetClass);
  const p = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;
  const hl90 = BM_P90 * p.hl_75_corr * sigma;
  return { hl50: b.hl50, hl75: b.hl75, hl90 };
}

// First touch time of each rung on one side — a single pass, rearm-independent
// (mirrors levelAtlasEngine.js's own `firstTouchTimes`, adapted for a PER-BAR dynamic
// level instead of a static array). Powers `otherSideTouchedBefore`.
function firstTouchTimesDynamic(bars, lvFn, isUp) {
  const out = { p50: null, p75: null, p90: null };
  for (let ri = 0; ri < 3; ri++) {
    const rung = HL_RUNGS[ri];
    for (let k = 0; k < bars.length; k++) {
      const lv = lvFn(k)[ri + 1];
      const px = isUp ? bars[k].high : bars[k].low;
      if (isUp ? px >= lv : px <= lv) { out[rung] = bars[k].time; break; }
    }
  }
  return out;
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

  // ── Context machinery, built ONCE per pair — same bricks atlasWalk uses ──────────
  const rangeMap = sessionRangeSeries(packed);
  const htf = createHtfContext(packed);
  const tf = createConfluenceFeatures({ htf });
  const wt1Cache = new Map();
  const cvolProduct = cvolProductFor(pair);
  const ivByDate = CVOL_PRODUCTS.includes(cvolProduct) ? await cvolSeries(cvolProduct) : null;
  if (!ivByDate) console.log(`  (no CVOL coverage for ${sym} — ivRegime/vrp/ivSkewDir will read null)`);

  const t0 = Date.now();
  const records = [];
  // Cross-day "last visit" per (side,rung) key — always safe (a prior day's session
  // is fully finished before today's starts). Same pattern as the daily-open
  // confluence study's `lastCrossDayVisit`, just keyed per rung too since this ladder
  // has three real rungs, not one degenerate level.
  const crossDayLastVisit = {};   // key -> { outcome, dayIdx }

  for (let i = MIN_LOOKBACK; i < dates.length; i++) {
    const date = dates[i];
    const bars = sessions.get(date);
    const open = bars[0].open;
    let sigma = 0;
    try { sigma = forecastSigma(d1.slice(0, i), est); } catch { continue; }
    if (!(sigma > 0)) continue;

    const hl = computeHlFractions(sigma, assetClass);
    if (!(hl.hl50 > 0 && hl.hl75 > hl.hl50 && hl.hl90 > hl.hl75)) continue;

    const dayVol = (() => {
      const hist = [];
      for (let k = Math.max(0, i - 20); k < i; k++) { try { const s = forecastSigma(d1.slice(0, k), est); if (s > 0) hist.push(s); } catch {} }
      if (hist.length < 8) return null;
      const sorted = [...hist].sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
      if (!(med > 0)) return null;
      const r = sigma / med;
      return r < 0.85 ? '1·quiet' : r > 1.25 ? '3·heavy' : '2·normal';
    })();

    // Yesterday's close vs ITS OWN fitted OH/OL forecast bands — verbatim atlasWalk
    // logic (buildLadder here is the FITTED OH/OL ladder from js/forecastLadder.js,
    // a different quantity from this file's own dynamic HL ladder — reused exactly
    // as atlasWalk reuses it, purely for this one "exhaustion carried over" feature).
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

    // Structural confluence for THIS session — same builder + tolerance + reference
    // price (the OPEN, not a per-rung level) atlasWalk itself uses.
    let intraday = [];
    for (let j = Math.max(0, i - CONF_LOOKBACK); j < i; j++) { const pb = sessions.get(dates[j]); if (pb) intraday = intraday.concat(pb); }
    const confLevels = sessionConfluenceLevels({ dailyBars: d1.slice(0, i), intraday, pip, price: open, sources: DAILY_CONFLUENCE_SOURCES, fib15: false });

    let wt1 = wt1Cache.get(date);
    if (!wt1) { wt1 = tf.wtSeries(bars); wt1Cache.set(date, wt1); }

    // ── Dynamic ladders for both sides, once per day ─────────────────────────────
    const anchorLagUp = new Array(bars.length), anchorLagDn = new Array(bars.length);
    { let extUp = open, extDn = open;
      for (let k = 0; k < bars.length; k++) {
        anchorLagUp[k] = extUp; anchorLagDn[k] = extDn;
        if (bars[k].low < extUp) extUp = bars[k].low;
        if (bars[k].high > extDn) extDn = bars[k].high;
      }
    }
    const lvUp = k => { const a = anchorLagUp[k]; return [a, a * (1 + hl.hl50), a * (1 + hl.hl75), a * (1 + hl.hl90)]; };
    const lvDn = k => { const a = anchorLagDn[k]; return [a, a * (1 - hl.hl50), a * (1 - hl.hl75), a * (1 - hl.hl90)]; };
    const firstTouchBySide = { up: firstTouchTimesDynamic(bars, lvUp, true), down: firstTouchTimesDynamic(bars, lvDn, false) };

    for (const side of ['up', 'down']) {
      const isUp = side === 'up';
      const lvFn = isUp ? lvUp : lvDn;
      const otherSide = isUp ? 'down' : 'up';

      for (let ri = 0; ri < 3; ri++) {
        const rung = HL_RUNGS[ri];
        const key = `${side}|${rung}`;
        const dayHist = [];   // this key's own touches SO FAR TODAY: {touchTime, resolveTime, outcome}
        let armed = true, ordinal = 0, runHi = bars[0].high, runLo = bars[0].low;

        for (let k = 0; k < bars.length; k++) {
          const bar = bars[k];
          if (bar.high > runHi) runHi = bar.high;
          if (bar.low < runLo) runLo = bar.low;
          const L = lvFn(k);
          const here = L[ri + 1], inner = L[ri], outer = L[ri + 2] ?? null;
          const rungSpan = Math.abs(here - inner);
          const rearmDist = REARM_FRAC * rungSpan;

          if (!armed) {
            const away = isUp ? (here - bar.close) : (bar.close - here);
            if (away >= rearmDist) armed = true;
            continue;
          }
          const px = isUp ? bar.high : bar.low;
          const reach = isUp ? px >= here : px <= here;
          if (!reach) continue;
          ordinal++;
          armed = false;

          let outcome = 'neither', resolveTime = null, deepest = here, extreme = here;
          for (let j = k; j < bars.length; j++) {
            const b2 = bars[j];
            const fwd = isUp ? b2.high : b2.low, bwd = isUp ? b2.low : b2.high;
            if (isUp ? bwd < deepest : bwd > deepest) deepest = bwd;
            if (isUp ? fwd > extreme : fwd < extreme) extreme = fwd;
            if (outer != null && (isUp ? fwd >= outer : fwd <= outer)) { outcome = 'out'; resolveTime = b2.time; break; }
            if (isUp ? bwd <= inner : bwd >= inner) { outcome = 'back'; resolveTime = b2.time; break; }
          }
          const sgn = isUp ? 1 : -1;
          const fadePips = (here - deepest) / pip * sgn;
          const runPips = (extreme - here) / pip * sgn;
          const pullbackFrac = rungSpan > 0 ? Math.min(1, Math.abs(here - deepest) / rungSpan) : null;
          const minsToResolve = resolveTime != null ? (resolveTime - bar.time) / 60 : null;

          const touchHourUtc = new Date(bar.time * 1000).getUTCHours();
          const touchSession = sessionOf(touchHourUtc);
          const minsIntoSession = (bar.time - bars[0].time) / 60;
          const sessionFrac = minsIntoSession / 1440;
          const sessionPos = sessionFrac < 0.33 ? '1·early' : sessionFrac < 0.67 ? '2·mid' : '3·late';
          const asiaVolSafe = (touchSession === 'London' || touchSession === 'NY') ? asiaVolCandidate?.bucket ?? null : null;
          const londonVolSafe = (touchSession === 'NY') ? londonVolCandidate?.bucket ?? null : null;
          const prevSessionVol = prevSessionVolBucket(rangeMap, date, touchSession, dates);
          const overlapWindow = touchHourUtc >= 12 && touchHourUtc < 16;

          const totalTravel = runHi - runLo;
          const dirTravel = isUp ? (runHi - open) : (open - runLo);
          const churnRatio = totalTravel > 0 ? Math.min(1, Math.max(0, dirTravel / totalTravel)) : null;
          const churn = churnRatio == null ? null : churnRatio >= 0.80 ? '3·driven' : churnRatio >= 0.55 ? '2·mixed' : '1·churned';

          const otherFirst = firstTouchBySide[otherSide]?.[rung] ?? null;
          const otherSideTouchedBefore = otherFirst != null ? (otherFirst < bar.time) : false;

          const ivSkewDir = (() => {
            if (!ivYesterday || !Number.isFinite(ivYesterday.skew)) return null;
            const oriented = isUp ? ivYesterday.skew : -ivYesterday.skew;
            return Math.abs(oriented) < 0.15 ? '2·neutral' : oriented > 0 ? '3·with' : '1·against';
          })();

          const feats = tf.compute({ bars, touchIdx: k, open, sigma, side: isUp ? 'up' : 'dn', wt1, level: here, pip, confLevels });

          // ── prevOutcomeSameDay — CAUSALLY GATED (see file header). Scan this
          // key's own day-so-far history backward for the most recent entry that
          // (a) wasn't 'neither' and (b) had ALREADY resolved by this bar's time.
          let prevOutcomeSameDay = null;
          for (let x = dayHist.length - 1; x >= 0; x--) {
            const cand = dayHist[x];
            if (cand.outcome !== 'neither' && cand.resolveTime != null && cand.resolveTime <= bar.time) { prevOutcomeSameDay = cand.outcome; break; }
          }
          const priorVisit = crossDayLastVisit[key] ?? null;
          const prevOutcomeCrossDay = priorVisit ? priorVisit.outcome : null;

          records.push({
            instrument: sym, assetClass, date, dow, side, rung, rearmFrac: REARM_FRAC, ordinal,
            hourUtc: touchHourUtc, minsIntoSession: +minsIntoSession.toFixed(0), sessionPos,
            session: touchSession, dowSession: `${dow}|${touchSession}`,
            gapBucket, gapSig: +gapSig.toFixed(3),
            dayVol, asiaVol: asiaVolSafe, londonVol: londonVolSafe, prevSessionVol,
            churn, churnRatio: churnRatio != null ? +churnRatio.toFixed(3) : null,
            otherSideTouchedBefore,
            level: +here.toFixed(6), pip, open,
            time: bar.time, touchTime: bar.time, resolveTime,
            outcome, minsToResolve: minsToResolve != null ? +minsToResolve.toFixed(0) : null,
            pullbackFrac: pullbackFrac != null ? +pullbackFrac.toFixed(3) : null,
            fadePips: +fadePips.toFixed(1), runPips: +runPips.toFixed(1),
            innerDistPips: +(rungSpan / pip).toFixed(1), outerDistPips: outer != null ? +(Math.abs(outer - here) / pip).toFixed(1) : null,
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
          dayHist.push({ touchTime: bar.time, resolveTime, outcome });
        }
        if (dayHist.length) crossDayLastVisit[key] = { outcome: dayHist.at(-1).outcome, dayIdx: i };
      }
    }
  }

  if (!records.length) { console.log('  no touches found, skipping'); return null; }
  const { split } = splitAt(records, SPLIT_FRAC);
  for (const r of records) r.isOos = r.date >= split ? 'oos' : 'is';

  console.log(`  ${dates.length} sessions (${dates[MIN_LOOKBACK]}→${dates.at(-1)}), ${records.length} touches total, split ${split} — ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  return { pair: sym, assetClass, coverage: { from: dates[MIN_LOOKBACK], to: dates.at(-1), sessions: dates.length }, splitDate: split, records };
}

// ── Book building — pooled ACROSS PAIRS, one cell per (side,rung) — reproduces
// buildAtlasBook's OWN cell loop (js/levelAtlasReport.js) verbatim, just pooled
// across instruments (buildAtlasBook itself is single-instrument-only — see header).
function buildPooledBook(allRecords) {
  const is = allRecords.filter(r => r.isOos === 'is');
  const oos = allRecords.filter(r => r.isOos === 'oos');
  const cells = {};
  for (const side of ['up', 'down']) {
    for (const rung of HL_RUNGS) {
      const key = `${side}|${rung}`;
      const cellIS = is.filter(t => t.side === side && t.rung === rung);
      const cellOOS = oos.filter(t => t.side === side && t.rung === rung);
      if (!cellIS.length) continue;
      const base = { is: summarizeAll(cellIS), oos: cellOOS.length ? summarizeAll(cellOOS) : null };
      const dims = {};
      for (const [dimKey] of DIMENSIONS) {
        const tIs = tableFor(cellIS, dimKey), tOos = tableFor(cellOOS, dimKey);
        if (!Object.keys(tIs).length) continue;
        dims[dimKey] = { is: tIs, oos: tOos };
      }
      if (base.oos) annotateHolds(dims, base.is, base.oos, { minN: MIN_SAMPLE, minDelta: 3 });
      cells[key] = { n: { is: cellIS.length, oos: cellOOS.length }, base, dims };
    }
  }
  return { cells };
}

function summarizeGroup(rows) {
  const n = rows.length;
  const out = rows.filter(r => r.outcome === 'out').length;
  const back = rows.filter(r => r.outcome === 'back').length;
  return { n, out, back, neither: n - out - back, outPct: pct(out, n), backPct: pct(back, n), resolved: out + back };
}

async function main() {
  const allRecords = [];
  const perPairMeta = [];

  for (const pair of PAIRS) {
    console.log(`\n=== ${pair.toUpperCase()} ===`);
    const r = await processPair(pair);
    if (!r) continue;
    allRecords.push(...r.records);
    perPairMeta.push({ pair: r.pair, assetClass: r.assetClass, coverage: r.coverage, splitDate: r.splitDate, nTouches: r.records.length });
  }

  const oosAll = allRecords.filter(r => r.isOos === 'oos');
  console.log(`\n\nPooled: ${perPairMeta.length} pairs, ${allRecords.length} total touches (${oosAll.length} OOS).`);

  // ── Sanity check vs Stage 1's own headline (excluding p90, since Stage 1's
  // headline pools it in — recomputed here on the SAME resolved-touch definition
  // the vote table below uses, so the two numbers are comparable) ─────────────────
  const baselineRows = oosAll.filter(r => r.rung !== 'p90');
  const baseline = summarizeGroup(baselineRows);
  const baselineCI = propCI(baseline.out, baseline.resolved);
  console.log(`\n================ UNCONDITIONAL BASELINE (OOS, p50+p75 only, sanity check vs Stage 1) ================`);
  console.log(`  P(out|resolved) = ${baselineCI?.p}% [${baselineCI?.lo}-${baselineCI?.hi}%], n=${baselineCI?.n}`);

  // ── Build the held-dimension book, pooled across pairs, one cell per side×rung ──
  const book = buildPooledBook(allRecords);
  console.log(`\n================ HELD DIMENSIONS (cleared holdsOOS: n>=${MIN_SAMPLE} both halves, |delta|>=3pp, same sign) ================`);
  for (const [cellKey, cell] of Object.entries(book.cells)) {
    console.log(`  ${cellKey}  (n IS=${cell.n.is} OOS=${cell.n.oos})  base IS out=${cell.base.is.outPct}%/back=${cell.base.is.backPct}%  OOS out=${cell.base.oos?.outPct}%/back=${cell.base.oos?.backPct}%`);
    for (const [dimKey, dim] of Object.entries(cell.dims)) {
      for (const [bucket, g] of Object.entries(dim.is)) {
        if (!g.holdsOOS) continue;
        const o = dim.oos[bucket];
        console.log(`    HELD  ${dimKey.padEnd(20)} ${String(bucket).padEnd(16)} IS out=${g.outPct}% (n=${g.n}, Δ${g.deltaOut > 0 ? '+' : ''}${g.deltaOut})   OOS out=${o.outPct}% (n=${o.n}, Δ${o.deltaOut > 0 ? '+' : ''}${o.deltaOut})`);
      }
    }
  }

  // ── Vote every resolved OOS touch, p50/p75 only (see header: p90 structurally
  // can never win a 'follow'/'out' vote — same exclusion js/levelAtlasVoteReview.js's
  // reviewVoteBacktest uses by default) ────────────────────────────────────────────
  const resolvedOos = oosAll.filter(r => r.outcome !== 'neither' && r.rung !== 'p90');
  const votes = resolvedOos.map(r => {
    const vd = voteDecision(book, r);   // real production function, unmodified
    if (!vd) return { r, margin: 0, predicted: null, correct: null };
    const predicted = vd.decision === 'follow' ? 'out' : 'back';
    return { r, margin: vd.margin, predicted, correct: r.outcome === predicted };
  });

  console.log(`\n================ WIN RATE BY VOTE MARGIN (OOS, resolved p50/p75 touches only) ================`);
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

  const m3 = votes.filter(v => v.margin >= 3 && v.correct != null);
  const m3CorrectN = m3.filter(v => v.correct).length;
  const m3CI = propCI(m3CorrectN, m3.length);
  console.log(`\n================ HEADLINE: margin>=3 vs unconditional baseline ================`);
  console.log(`  margin>=3: n=${m3.length}, winRate=${m3CI ? `${m3CI.p}% [${m3CI.lo}-${m3CI.hi}%]` : 'n/a (insufficient sample)'}`);
  console.log(`  unconditional baseline: ${baselineCI?.p}% [${baselineCI?.lo}-${baselineCI?.hi}%]`);
  if (m3CI && baselineCI) {
    const clearsBand = m3CI.lo > baselineCI.hi || m3CI.hi < baselineCI.lo;
    console.log(`  => ${clearsBand ? 'CIs are NON-OVERLAPPING — margin>=3 is genuinely different from baseline.' : 'CIs OVERLAP — margin>=3 is NOT distinguishable from the unconditional rate.'}`);
  }

  console.log(`\n================ BY RUNG (margin>=3, OOS) ================`);
  const byRung = {};
  for (const rung of ['p50', 'p75']) {
    const rows = m3.filter(v => v.r.rung === rung);
    const c = rows.filter(v => v.correct).length;
    const ci = propCI(c, rows.length);
    byRung[rung] = { n: rows.length, winRateCI: ci, thin: rows.length < MIN_SAMPLE };
    if (rows.length) console.log(`  ${rung.padEnd(6)} n=${String(rows.length).padStart(5)}  winRate=${ci ? `${ci.p}% [${ci.lo}-${ci.hi}%]` : 'n/a'}${rows.length < MIN_SAMPLE ? '  [THIN]' : ''}`);
  }

  console.log(`\n================ BY ASSET CLASS (margin>=3, OOS) ================`);
  const byAssetClass = {};
  for (const ac of ['fx', 'commodity', 'index']) {
    const rows = m3.filter(v => v.r.assetClass === ac);
    const c = rows.filter(v => v.correct).length;
    const ci = propCI(c, rows.length);
    byAssetClass[ac] = { n: rows.length, winRateCI: ci, thin: rows.length < MIN_SAMPLE };
    if (rows.length) console.log(`  ${ac.padEnd(10)} n=${String(rows.length).padStart(5)}  winRate=${ci ? `${ci.p}% [${ci.lo}-${ci.hi}%]` : 'n/a'}${rows.length < MIN_SAMPLE ? '  [THIN]' : ''}`);
  }
  console.log(`\n================ BY INSTRUMENT (margin>=3, OOS) ================`);
  const byInstrument = {};
  for (const m of perPairMeta) {
    const rows = m3.filter(v => v.r.instrument === m.pair);
    const c = rows.filter(v => v.correct).length;
    const ci = propCI(c, rows.length);
    byInstrument[m.pair] = { n: rows.length, winRateCI: ci, thin: rows.length < MIN_SAMPLE };
    if (rows.length) console.log(`  ${m.pair.padEnd(10)} n=${String(rows.length).padStart(5)}  winRate=${ci ? `${ci.p}% [${ci.lo}-${ci.hi}%]` : 'n/a'}${rows.length < MIN_SAMPLE ? '  [THIN]' : ''}`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'dynamic_hl_level_confluence_study.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), pairs: PAIRS, bmP90: BM_P90, rearmFrac: REARM_FRAC, splitFrac: SPLIT_FRAC, minSample: MIN_SAMPLE,
    dimensionsUsed: DIMENSIONS.map(([k]) => k),
    perPairMeta,
    baseline: { oos: baseline, oosCI: baselineCI },
    book,
    marginStats, headlineMargin3: { n: m3.length, winRateCI: m3CI },
    byRung, byAssetClass, byInstrument,
    votesDetail: votes.map(v => ({
      instrument: v.r.instrument, date: v.r.date, side: v.r.side, rung: v.r.rung, ordinal: v.r.ordinal,
      outcome: v.r.outcome, margin: v.margin, predicted: v.predicted, correct: v.correct,
    })),
  }));
  console.log(`\nWrote full detail to ${OUT_DIR}/dynamic_hl_level_confluence_study.json`);
}

main();
