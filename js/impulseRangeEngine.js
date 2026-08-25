/**
 * 4H Impulse Range + Lower-Timeframe Continuation/Fade research engine.
 *
 * Research question (colleague handoff, 2026-08-23): does a significant 4H
 * impulse candle function better as a REFERENCE RANGE — levels + extensions
 * that lower-timeframe price action tests for continuation vs fade — than as
 * a standalone directional signal? Conditioned on location (Asia/Monday
 * range confluence) and regime (VWAP context), not evaluated in isolation.
 *
 * This EXTENDS the Asia/Monday range-confluence work already built for
 * `entry-trigger-lab.html` rather than duplicating it: H4 resampling, Asia/
 * Monday ladder history, and the today-vs-yesterday confluence check are all
 * imported straight from `entryTriggerLabEngine.js` / `confluence-core.js` —
 * the same bricks that already match the group's live Pine indicator. VWAP
 * is `vwapReversionEngine.js`'s `computeSessionVwap`. Swing-structure
 * regime classification is `patternEngine.js`'s `classifySwingStructure` —
 * no structure-break/FVG detector existed anywhere in the repo before this;
 * `detectFVG` here is the first one (documented below), the rest is reuse.
 *
 * CAUSALITY (research spec §14): an impulse's own qualification (body/range/
 * close-position/structure-break/FVG) uses ONLY the impulse's own H4 bar and
 * STRICTLY PRIOR H4 bars — never a future bar. Lower-timeframe evidence and
 * outcome classification only ever look at bars at-or-after the impulse's
 * OWN close time, walked forward in bar order (never peeking past the point
 * a given check resolves) — standard backtest evaluation, same pattern as
 * `patternEngine.js`'s `computeOutcome`. Swing-structure classification
 * inside the reaction window looks at the FULL observed window at evaluation
 * time (patternEngine's pivot confirmation needs bars on both sides) — that
 * is fine because it is evaluation-only, exactly like MFE/MAE: none of it is
 * fed back as an input to a decision made before that data existed.
 *
 * Research-only (spec §16): this is deliberately NOT wired into any
 * execution signal. It answers "does this framework carry information" —
 * scoring weights (`scoreImpulse`) are an explicit, unvalidated experiment,
 * not a claim.
 */

import { bisect } from './barUtils.js';
import { getPipSize, getConfluenceThreshold } from './utils.js';
import { detectConfluencesCore } from './confluence-core.js';
import { computeSessionVwap } from './vwapReversionEngine.js';
import { computeATR, classifySwingStructure, regimeAt } from './patternEngine.js';
import {
  resampleToH4, buildAsiaRangeHistory, buildMondayRangeHistory, buildLevelTimeline, activeLevelsAt,
} from './entryTriggerLabEngine.js';

function round(x) { return Math.round(x * 1e6) / 1e6; }

// ── London calendar helpers (epoch-based — H4/reaction bars carry only
// `time`, not the `datetime` string barLondonHour/barLondonDay parse) ──────
function londonDateStr(epochSec) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(epochSec * 1000));
  const g = t => parts.find(p => p.type === t)?.value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
export function londonHourOf(epochSec) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hour12: false }).formatToParts(new Date(epochSec * 1000));
  const h = parts.find(p => p.type === 'hour')?.value;
  return h != null ? (parseInt(h, 10) % 24) : null;
}
export function londonWeekdayOf(epochSec) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short' }).formatToParts(new Date(epochSec * 1000));
  return parts.find(p => p.type === 'weekday')?.value ?? null;
}

// ── FVG (fair value gap) — new brick, none existed in the repo ─────────────
// Standard 3-candle imbalance: bars[i-2] and bars[i] don't overlap.
export function detectFVG(bars, i) {
  if (i < 2) return null;
  const a = bars[i - 2], c = bars[i];
  if (a.low > c.high) return { direction: 'down', top: a.low, bottom: c.high };
  if (a.high < c.low) return { direction: 'up', top: c.low, bottom: a.high };
  return null;
}

// Causal breakout check: does bar i's close clear the highest-high/lowest-low
// of the `lookback` STRICTLY PRIOR bars? Deliberately NOT patternEngine's
// pivotHighs/pivotLows here — pivot confirmation there looks `n` bars
// *forward*, which is correct for after-the-fact pattern scanning but wrong
// for "what did we actually know at the impulse bar itself" (spec §14).
function brokeRecentExtreme(bars, i, lookback, direction) {
  const start = Math.max(0, i - lookback);
  if (start >= i) return false;
  if (direction === 'up') {
    let hh = -Infinity;
    for (let k = start; k < i; k++) hh = Math.max(hh, bars[k].high);
    return bars[i].close > hh;
  }
  let ll = Infinity;
  for (let k = start; k < i; k++) ll = Math.min(ll, bars[k].low);
  return bars[i].close < ll;
}

// ── 1-2. H4 impulse detection ───────────────────────────────────────────────
// §1's two named presets. Not optimised — baseline assumptions to TEST, per
// the spec ("Do not optimise these values initially").
export const IMPULSE_PRESETS = {
  classic: { bodyLookback: 20, bodyMultiplier: 1.5, minBodyRangePct: 0.65, maxCloseFromExtremePct: 0.20, requireStructureBreak: false, requireFvg: false },
  displacement: { bodyLookback: 20, bodyMultiplier: 2.0, minBodyRangePct: 0.75, maxCloseFromExtremePct: 0.20, requireStructureBreak: false, requireFvg: false },
};

// h4Bars: pre-resampled {time,open,high,low,close} (see resampleToH4, reused
// from entryTriggerLabEngine.js). Returns one event per qualifying bar, each
// carrying everything §2 asks to be stored EXCEPT VWAP/Asia context (those
// need intraday data and are attached by runImpulseRangeScan/§2's "store as
// an event" fields land partly here, partly on the orchestrator's output).
export function detectH4Impulses(h4Bars, opts = {}) {
  const preset = IMPULSE_PRESETS[opts.preset ?? 'classic'];
  const o = { ...preset, ...opts };
  const out = [];
  for (let i = o.bodyLookback; i < h4Bars.length; i++) {
    const b = h4Bars[i];
    const range = b.high - b.low;
    if (!(range > 0)) continue;
    const body = Math.abs(b.close - b.open);
    let sumBody = 0;
    for (let k = i - o.bodyLookback; k < i; k++) sumBody += Math.abs(h4Bars[k].close - h4Bars[k].open);
    const avgBody = sumBody / o.bodyLookback;
    if (!(avgBody > 0)) continue;
    const direction = b.close > b.open ? 'up' : b.close < b.open ? 'down' : null;
    if (!direction) continue;
    const bodyPct = body / range;
    const bodyToAvg = body / avgBody;
    const closeFromExtremePct = direction === 'up' ? (b.high - b.close) / range : (b.close - b.low) / range;
    const fvg = detectFVG(h4Bars, i);
    const fvgAligned = !!fvg && fvg.direction === direction;
    const structureBreak = brokeRecentExtreme(h4Bars, i, o.structureLookback ?? o.bodyLookback, direction);
    const qualifies = bodyToAvg >= o.bodyMultiplier && bodyPct >= o.minBodyRangePct && closeFromExtremePct <= o.maxCloseFromExtremePct
      && (!o.requireStructureBreak || structureBreak) && (!o.requireFvg || fvgAligned);
    if (!qualifies) continue;
    out.push({
      idx: i, time: b.time, direction,
      open: b.open, high: b.high, low: b.low, close: b.close,
      body: round(body), range: round(range), bodyPct: round(bodyPct), bodyToAvg: round(bodyToAvg),
      closeFromExtremePct: round(closeFromExtremePct), structureBreak, fvgAligned, fvg,
    });
  }
  return out;
}

// ── 3. Impulse-as-range: levels + extensions ────────────────────────────────
// Same `price = low + range*fib` convention as ranges.js's projectFibLevels
// (fib 0=low, 1=high, <0 below low, >1 above high) — deliberately, not a new
// convention: it's what lets impulse levels and Asia/Monday levels be
// compared directly through the SAME detectConfluencesCore call (§3's "do
// impulse-derived levels overlap range-derived levels?").
const DEFAULT_EXTENSIONS = [0.25, 0.5, 0.75, 1.0];

export function impulseLevels(imp, opts = {}) {
  const exts = opts.extensions ?? DEFAULT_EXTENSIONS;
  const { open, low, range, close } = imp;
  const at = fib => low + range * fib;
  const levels = [
    { fib: 0, price: low, role: 'low' },
    { fib: 0.25, price: at(0.25), role: '25%' },
    { fib: 0.5, price: at(0.5), role: 'mid' },
    { fib: 0.75, price: at(0.75), role: '75%' },
    { fib: 1, price: imp.high, role: 'high' },
    { fib: (open - low) / range, price: open, role: 'open' },
    { fib: (close - low) / range, price: close, role: 'close' },
  ];
  for (const m of exts) {
    levels.push({ fib: round(1 + m), price: at(1 + m), role: `+${m}R` });
    levels.push({ fib: round(-m), price: at(-m), role: `-${m}R` });
  }
  return levels;
}

// ── VWAP context ─────────────────────────────────────────────────────────
// Per-day session VWAP (reset daily, same grouping convention as
// entryTriggerLabEngine.js's detectVwapTap) flattened into one time-sorted
// lookup so any impulse or reaction bar can ask "what was VWAP/its slope at
// this moment". bars need `.datetime` ("YYYY-MM-DD HH:MM:SS") for the daily
// reset grouping — the same normalizeBars shape used throughout this repo.
export function buildVwapContext(bars) {
  const byDate = new Map();
  for (const bar of bars) {
    const date = bar.datetime.split(' ')[0];
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(bar);
  }
  const rows = [];
  for (const [, dayBars] of byDate) {
    const { vwap, sd } = computeSessionVwap(dayBars);
    dayBars.forEach((bar, i) => rows.push({ time: bar.time, vwap: vwap[i], sd: sd[i] }));
  }
  rows.sort((a, b) => a.time - b.time);
  return { times: rows.map(r => r.time), rows };
}

// Nearest-at-or-before lookup + a simple slope over `slopeLookback` prior
// entries (in VWAP rows, not bars — fine since rows are one-per-bar).
export function vwapAt(ctx, time, opts = {}) {
  if (!ctx.rows.length) return null;
  const slopeLookback = opts.slopeLookback ?? 6;
  const i = bisect(ctx.times, time + 1) - 1;
  if (i < 0) return null;
  const row = ctx.rows[i];
  const j = Math.max(0, i - slopeLookback);
  const prev = ctx.rows[j];
  const slope = i > j ? (row.vwap - prev.vwap) / (i - j) : 0;
  return { vwap: row.vwap, sd: row.sd, slope, idx: i };
}

// ── Asia/Monday range confluence ────────────────────────────────────────
// Reuses activeLevelsAt (entryTriggerLabEngine.js) to fetch the SAME Asia/
// Monday ladders the Entry Trigger Lab already tests, for the impulse's own
// London-calendar date, then runs the impulse's levels against them through
// the exact same detectConfluencesCore call buildLevelTimeline uses —
// today's ladder vs yesterday's Pine-matching confluence math, applied here
// to impulse-vs-range instead of range-vs-range.
export function computeAsiaConfluence(levelsArr, impulseTime, asiaTimeline, mondayTimeline, symbol) {
  const fakeBar = { datetime: `${londonDateStr(impulseTime)} 00:00:00` };
  const ctxLevels = activeLevelsAt(fakeBar, asiaTimeline, mondayTimeline, { levelMode: 'all' });
  const pipSize = getPipSize(symbol);
  const normalDistance = getConfluenceThreshold(symbol) * pipSize;
  const tightDistance = normalDistance * 0.10;
  const confArgs = { pipSize, normalDistance, tightDistance, priceMode: 'lowest', clusterMerge: false, sessionRange: null };
  const asiaLevels = ctxLevels.filter(l => l.source === 'asia').map(l => ({ price: l.price, fib: l.fib }));
  const mondayLevels = ctxLevels.filter(l => l.source === 'monday').map(l => ({ price: l.price, fib: l.fib }));
  const asia = asiaLevels.length ? detectConfluencesCore(levelsArr, asiaLevels, { ...confArgs, source: 'asia' }) : [];
  const monday = mondayLevels.length ? detectConfluencesCore(levelsArr, mondayLevels, { ...confArgs, source: 'monday' }) : [];
  return { asia, monday, hasConfluence: asia.length > 0 || monday.length > 0 };
}

// ── 5-9. Lower-timeframe reaction: evidence + deterministic outcome ────────
// One forward walk over ltfBars strictly at-or-after the impulse's own
// close time. Two independent things come out of it:
//   - `outcome` — a single deterministic classification (§8/§9), from a
//     target-vs-stop RACE exactly like patternEngine.computeOutcome's
//     target/stop race, just with a second stage (extension → return/deepen)
//     added for the fade test. This is the label; never fed back as a
//     feature (§14).
//   - `evidence` — independent boolean flags (§5) used only by scoreImpulse.
export function classifyLtfReaction(ltfBars, impulse, levelsArr, opts = {}) {
  const horizonBars = opts.horizonBars ?? 60;
  // extensionTriggerFib MUST stay deeper than contTargetR: the extension/fade
  // zone (§7) is meant to be reached only after a more modest continuation
  // move (§9's "+0.5R before -0.25R" example) already would have resolved —
  // if the extension threshold sat shallower than the continuation target,
  // every clean continuation would trip the extension check first (since
  // `high`/`low` crosses it on the way to a `close` beyond contTarget) and
  // CONTINUATION would never be reachable. entry (impulse close) sits within
  // maxCloseFromExtremePct (<=0.20 by default) of the impulse extreme, so
  // extensionTriggerFib - contTargetR > 0.20 keeps this true regardless of
  // exactly how close the impulse closed to its own high/low.
  const contTargetR = opts.contTargetR ?? 0.25;
  const contStopR = opts.contStopR ?? 0.25;
  const extensionTriggerFib = opts.extensionTriggerFib ?? 0.5;
  const dispMult = opts.displacementAtrMult ?? 1.5;
  const rejectionWickFrac = opts.rejectionWickFrac ?? 0.5;
  const vwapExtendedAtrMult = opts.vwapExtendedAtrMult ?? 2;
  const vwapCtx = opts.vwapCtx ?? null;
  const asiaConfluenceLevels = opts.asiaConfluenceLevels ?? [];

  const entry = impulse.close;
  const dir = impulse.direction;
  const sign = dir === 'up' ? 1 : -1;
  const range = impulse.range;
  const closeTime = impulse.time + 4 * 3600;
  const window = ltfBars.filter(b => b.time >= closeTime).slice(0, horizonBars);
  if (!window.length) return null;

  const atrSeries = computeATR(window, Math.min(14, window.length));
  const contTarget = entry + sign * contTargetR * range;
  const contStop = entry - sign * contStopR * range;
  const extLevelPrice = dir === 'up' ? impulse.high + range * extensionTriggerFib : impulse.low - range * extensionTriggerFib;
  const mid = impulse.low + range * 0.5;

  let mfe = 0, mae = 0;
  let outcome = 'NO_CLEAR_EDGE', outcomeIdx = null, outcomeTime = null, exitPrice = null, resolved = false;
  let reachedExtensionAt = null, deeperTargetFib = 1 + extensionTriggerFib * 2;
  let extremeSincePullback = dir === 'up' ? Infinity : -Infinity;

  const contEvidence = { displacement: false, fvgAligned: false, structureBreakAligned: false, pullbackThenContinuation: false, vwapAligned: false, vwapSlopeAligned: false, notExtendedFromVwap: false };
  const fadeEvidence = { deepRetrace: false, breakoutFailedQuick: false, structureBreakAgainst: false, rejectionWick: false, returnedTowardVwap: false, vwapFlat: false, extendedFromVwap: false, rejectedExtensionLevel: false, rejectedAsiaLevel: false, asiaConfluencePresent: asiaConfluenceLevels.length > 0 };

  for (let i = 0; i < window.length; i++) {
    const bar = window[i];
    const fav = dir === 'up' ? bar.high - entry : entry - bar.low;
    const adv = dir === 'up' ? entry - bar.low : bar.high - entry;
    if (fav > mfe) mfe = fav;
    if (adv > mae) mae = adv;

    const atr = atrSeries[i] || atrSeries[atrSeries.length - 1] || 0;
    const body = Math.abs(bar.close - bar.open);
    if (atr > 0 && body / atr >= dispMult && Math.sign(bar.close - bar.open) === sign) contEvidence.displacement = true;

    const fvg = detectFVG(window, i);
    if (fvg && fvg.direction === dir) contEvidence.fvgAligned = true;

    if (dir === 'up') extremeSincePullback = Math.min(extremeSincePullback, bar.low);
    else extremeSincePullback = Math.max(extremeSincePullback, bar.high);
    const pulledDeep = dir === 'up' ? extremeSincePullback <= impulse.low + range * 0.75 : extremeSincePullback >= impulse.high - range * 0.75;
    if (pulledDeep) {
      const backBeyond = dir === 'up' ? bar.close > impulse.high : bar.close < impulse.low;
      if (backBeyond) contEvidence.pullbackThenContinuation = true;
    }

    for (const lvl of [...levelsArr, ...asiaConfluenceLevels]) {
      const touched = bar.high >= lvl.price && bar.low <= lvl.price;
      if (!touched) continue;
      const barRange = bar.high - bar.low;
      if (barRange <= 0) continue;
      const upperWick = (bar.high - Math.max(bar.open, bar.close)) / barRange;
      const lowerWick = (Math.min(bar.open, bar.close) - bar.low) / barRange;
      if (upperWick >= rejectionWickFrac || lowerWick >= rejectionWickFrac) {
        fadeEvidence.rejectionWick = true;
        if (lvl.fib < 0 || lvl.fib > 1) fadeEvidence.rejectedExtensionLevel = true;
        if (asiaConfluenceLevels.includes(lvl)) fadeEvidence.rejectedAsiaLevel = true;
      }
    }

    if (dir === 'up' && bar.high > impulse.high && bar.close < impulse.high) fadeEvidence.breakoutFailedQuick = true;
    if (dir === 'down' && bar.low < impulse.low && bar.close > impulse.low) fadeEvidence.breakoutFailedQuick = true;
    if (dir === 'up' && bar.low <= mid) fadeEvidence.deepRetrace = true;
    if (dir === 'down' && bar.high >= mid) fadeEvidence.deepRetrace = true;

    if (!resolved) {
      if (!reachedExtensionAt) {
        const touchedExt = dir === 'up' ? bar.high >= extLevelPrice : bar.low <= extLevelPrice;
        if (touchedExt) reachedExtensionAt = { idx: i, time: bar.time };
        else {
          const hitCont = dir === 'up' ? bar.close >= contTarget : bar.close <= contTarget;
          const hitStop = dir === 'up' ? bar.close <= contStop : bar.close >= contStop;
          if (hitCont) { outcome = 'CONTINUATION'; outcomeIdx = i; outcomeTime = bar.time; exitPrice = bar.close; resolved = true; }
          else if (hitStop) { outcome = 'FAILED_IMPULSE'; outcomeIdx = i; outcomeTime = bar.time; exitPrice = bar.close; resolved = true; }
        }
      }
      if (reachedExtensionAt && !resolved) {
        const backInside = dir === 'up' ? bar.close <= impulse.high : bar.close >= impulse.low;
        if (backInside) { outcome = 'REVERSION'; outcomeIdx = i; outcomeTime = bar.time; exitPrice = bar.close; resolved = true; }
        else {
          const deeperPrice = dir === 'up' ? impulse.low + range * deeperTargetFib : impulse.low + range * (1 - deeperTargetFib);
          const deeper = dir === 'up' ? bar.high >= deeperPrice : bar.low <= deeperPrice;
          if (deeper) deeperTargetFib += extensionTriggerFib;
        }
      }
    }
  }
  if (reachedExtensionAt && !resolved) { outcome = 'EXTENSION'; outcomeIdx = reachedExtensionAt.idx; outcomeTime = reachedExtensionAt.time; }
  // Never resolved within the horizon (EXTENSION held, or NO_CLEAR_EDGE) —
  // mark-to-last-close rather than a realized exit, and say so via `open`.
  const open = !resolved;
  if (exitPrice == null) exitPrice = window[window.length - 1].close;
  const returnPrice = round((exitPrice - entry) * sign);

  let vwapDistanceAtr = null;
  if (vwapCtx) {
    const atImpulse = vwapAt(vwapCtx, impulse.time);
    if (atImpulse) {
      const localAtr = atrSeries[0] || atrSeries.find(v => v > 0) || 0;
      vwapDistanceAtr = localAtr > 0 ? Math.abs(entry - atImpulse.vwap) / localAtr : null;
      contEvidence.vwapAligned = dir === 'up' ? entry > atImpulse.vwap : entry < atImpulse.vwap;
      contEvidence.vwapSlopeAligned = Math.sign(atImpulse.slope) === sign;
      contEvidence.notExtendedFromVwap = vwapDistanceAtr != null ? vwapDistanceAtr <= vwapExtendedAtrMult : false;
      fadeEvidence.extendedFromVwap = vwapDistanceAtr != null ? vwapDistanceAtr >= vwapExtendedAtrMult : false;
      fadeEvidence.vwapFlat = Math.abs(atImpulse.slope) < (opts.vwapFlatSlope ?? Math.abs(atImpulse.vwap) * 0.00002);
      const lastBar = window[window.length - 1];
      const atEnd = vwapAt(vwapCtx, lastBar.time);
      if (atEnd) {
        const localAtrEnd = atrSeries[atrSeries.length - 1] || localAtr;
        fadeEvidence.returnedTowardVwap = Math.abs(lastBar.close - atEnd.vwap) < Math.abs(entry - atImpulse.vwap) - localAtrEnd * 0.25;
      }
    }
  }

  // Structure evidence over the FULL observed window — evaluation-only, see
  // the causality note in the file header. classifySwingStructure/regimeAt
  // are patternEngine.js bricks, reused as-is.
  const structure = classifySwingStructure(window, opts.structurePivotN ?? 3);
  const endRegime = regimeAt(structure, window.length - 1);
  contEvidence.structureBreakAligned = !!(endRegime && endRegime.dir === dir);
  fadeEvidence.structureBreakAgainst = !!(endRegime && endRegime.dir && endRegime.dir !== dir);

  return {
    windowBars: window.length, entry, dir, mfe: round(mfe), mae: round(mae),
    outcome, outcomeIdx, outcomeTime, vwapDistanceAtr: vwapDistanceAtr != null ? round(vwapDistanceAtr) : null,
    contTarget: round(contTarget), contStop: round(contStop), extLevelPrice: round(extLevelPrice),
    // The hypothetical trade this analysis implies: enter at the impulse's
    // own close (`entry`) in `dir`, exit at `exitPrice` — the bar close that
    // actually resolved `outcome` (CONTINUATION → contTarget race won,
    // FAILED_IMPULSE → contStop race won, REVERSION → the close that came
    // back inside the impulse range), or a mark-to-last-close snapshot
    // (`open:true`) when EXTENSION/NO_CLEAR_EDGE never resolved within the
    // horizon. `returnPrice` is exit-minus-entry, direction-signed, in price
    // units — evaluation-only history (§14), never fed back as a feature.
    exitPrice: round(exitPrice), exitTime: outcomeTime ?? window[window.length - 1].time, open, returnPrice,
    evidence: { continuation: contEvidence, fade: fadeEvidence },
  };
}

// ── 11. Experimental confluence score ───────────────────────────────────────
// Explicitly NOT validated (spec §11/§16) — a documented weighted-count, not
// a claim. Weight tables are the whole "model"; keep them here, not scattered.
const CONT_WEIGHTS = { displacement: 20, fvgAligned: 15, structureBreakAligned: 20, pullbackThenContinuation: 15, vwapAligned: 10, vwapSlopeAligned: 10, notExtendedFromVwap: 10 };
const FADE_WEIGHTS = { extendedFromVwap: 20, rejectedExtensionLevel: 20, rejectionWick: 15, breakoutFailedQuick: 15, structureBreakAgainst: 15, asiaConfluencePresent: 10, vwapFlat: 5 };

export function scoreImpulse(evidence, opts = {}) {
  const edgeMargin = opts.edgeMargin ?? 15;
  let continuationScore = 0;
  for (const [k, w] of Object.entries(CONT_WEIGHTS)) if (evidence.continuation[k]) continuationScore += w;
  let fadeScore = 0;
  for (const [k, w] of Object.entries(FADE_WEIGHTS)) if (evidence.fade[k]) fadeScore += w;
  let edge = 'NO_CLEAR_EDGE';
  if (Math.abs(continuationScore - fadeScore) >= edgeMargin) edge = continuationScore > fadeScore ? 'CONTINUATION' : 'FADE';
  return { continuationScore, fadeScore, edge };
}

// ── Orchestration ────────────────────────────────────────────────────────
// h4SourceBars: any intraday bars (5m/15m) to resample up to H4 for impulse
// detection. asiaSourceBars: 5m bars (Asia session needs >=36 5m bars/day,
// see buildAsiaRangeHistory). mondaySourceBars: 15m bars, optional. ltfBars:
// the 3m/1m reaction bars — pass whatever granularity was fetched/resampled;
// this engine doesn't care which, it just walks whatever it's given (tag it
// via opts.ltfGranularityMin for aggregateImpulseStats' by-timeframe split).
export function runImpulseRangeScan({ h4SourceBars, asiaSourceBars, mondaySourceBars, ltfBars, symbol, opts = {} }) {
  const h4Bars = resampleToH4(h4SourceBars);
  const impulses = detectH4Impulses(h4Bars, opts);
  const asiaTimeline = asiaSourceBars?.length ? buildLevelTimeline(buildAsiaRangeHistory(asiaSourceBars), symbol, 'asia') : [];
  const mondayTimeline = mondaySourceBars?.length ? buildLevelTimeline(buildMondayRangeHistory(mondaySourceBars), symbol, 'monday') : [];
  const vwapCtx = buildVwapContext(ltfBars);

  const events = [];
  for (const imp of impulses) {
    const levelsArr = impulseLevels(imp, opts);
    const asiaConfluence = computeAsiaConfluence(levelsArr, imp.time, asiaTimeline, mondayTimeline, symbol);
    const asiaConfluenceLevels = asiaConfluence.asia.map(c => ({ price: c.price, fib: c.todayFib, source: 'asia' }))
      .concat(asiaConfluence.monday.map(c => ({ price: c.price, fib: c.todayFib, source: 'monday' })));
    const reaction = classifyLtfReaction(ltfBars, imp, levelsArr, { ...opts, vwapCtx, asiaConfluenceLevels });
    if (!reaction) continue;
    const scores = scoreImpulse(reaction.evidence, opts);
    events.push({
      ...imp, symbol, levels: levelsArr, asiaConfluence,
      londonHour: londonHourOf(imp.time), londonWeekday: londonWeekdayOf(imp.time),
      ltfGranularityMin: opts.ltfGranularityMin ?? null,
      reaction, scores,
    });
  }
  return events;
}

// ── 13. Aggregate stats ──────────────────────────────────────────────────
const OUTCOME_KEYS = ['CONTINUATION', 'REVERSION', 'FAILED_IMPULSE', 'EXTENSION', 'NO_CLEAR_EDGE'];
function avg(arr) { const v = arr.filter(x => x != null); return v.length ? round(v.reduce((a, b) => a + b, 0) / v.length) : null; }
function sessionOf(hour) {
  if (hour == null) return 'unknown';
  if (hour >= 0 && hour < 7) return 'asia';
  if (hour >= 7 && hour < 13) return 'london';
  if (hour >= 13 && hour < 21) return 'ny';
  return 'late';
}

function summarizeGroup(list) {
  const n = list.length;
  const outcomeCounts = Object.fromEntries(OUTCOME_KEYS.map(k => [k, list.filter(e => e.reaction.outcome === k).length]));
  return {
    count: n,
    outcomePct: Object.fromEntries(OUTCOME_KEYS.map(k => [k, n ? round((outcomeCounts[k] / n) * 100) : 0])),
    avgMfe: avg(list.map(e => e.reaction.mfe)),
    avgMae: avg(list.map(e => e.reaction.mae)),
  };
}

function groupBy(events, keyFn) {
  const map = new Map();
  for (const e of events) {
    const k = keyFn(e);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(e);
  }
  return [...map.entries()].map(([key, list]) => ({ key, ...summarizeGroup(list) }));
}

export function aggregateImpulseStats(events) {
  const n = events.length;
  const overall = {
    ...summarizeGroup(events),
    bullish: events.filter(e => e.direction === 'up').length,
    bearish: events.filter(e => e.direction === 'down').length,
    avgRange: avg(events.map(e => e.range)),
    avgBodyPct: avg(events.map(e => e.bodyPct)),
  };
  return {
    overall,
    bySession: groupBy(events, e => sessionOf(e.londonHour)),
    byDayOfWeek: groupBy(events, e => e.londonWeekday ?? 'unknown'),
    byInstrument: groupBy(events, e => e.symbol ?? 'unknown'),
    byAsiaConfluence: groupBy(events, e => e.asiaConfluence?.hasConfluence ? 'confluent' : 'no_confluence'),
    byEdge: groupBy(events, e => e.scores?.edge ?? 'unknown'),
    byLtfGranularity: groupBy(events, e => e.ltfGranularityMin != null ? `${e.ltfGranularityMin}m` : 'unknown'),
    n,
  };
}
