/**
 * Entry Trigger Lab — pure detection bricks for five discretionary entry ideas
 * pulled from `education/jordan_video_transcripts/JORDAN_VIDEO_INSIGHTS.md`
 * (Husky's markup-call transcripts), built for VISUAL inspection on a chart
 * rather than a Sharpe/IS-OOS verdict — that's the deliberate point of this
 * module: eyeball where each rule actually fires before spending a full honest
 * backtest on any of them.
 *
 * Level generation is NOT reimplemented here — it reuses the repo's one
 * canonical range/ladder/confluence engine (`ranges.js` + `confluence-core.js`,
 * the same bricks the live dashboard and the MT5 backtest port both already
 * use). What IS new here is the WALK: `ranges.js`'s calculateAsiaRanges /
 * calculateMondayRanges only ever compute "today vs yesterday" (the latest
 * live snapshot) — this file walks every session in an arbitrary loaded
 * history so a date range can be scanned, not just the newest day.
 *
 * Five detectors, each named for the Theme Index entry it encodes:
 *   detectWickEngulfing        — "Wick + engulfing-candle micro-confirmation"
 *   detectMidpointPullback     — "Levels are bidirectional" (4th, continuation use)
 *   detectSessionExtremeAnchor — "Edge case explicitly considered, then rejected"
 *   detectVwapTap              — "VWAP used as context/frame" (tapping/magnet facet)
 *   detectAdxRegimeSwitch      — "ADX-based regime filter"
 *
 * Pure over normalized bars — no DOM, no network. Every function is a
 * candidate for a Node unit test (see entryTriggerLabEngine.test.mjs).
 */

import { computeBodyRange, projectFibLevels } from './ranges.js';
import { barLondonHour, barLondonDay, getPipSize, getConfluenceThreshold } from './utils.js';
import { detectConfluencesCore } from './confluence-core.js';
import { adxWilder, atrWilder } from './indicatorCore.js';
import { computeSessionVwap } from './vwapReversionEngine.js';

// ── Bar normalization ────────────────────────────────────────────────────────

// `/api/ohlc-range` returns { values: [{datetime,open,high,low,close,volume?}] }
// with numeric fields as strings. Normalize once: keep `datetime` (the London-
// local string the barLondonHour/barLondonDay helpers parse) alongside numeric
// o/h/l/c/time so every detector below can do plain arithmetic.
export function normalizeBars(values) {
  return (values ?? [])
    .map(v => ({
      datetime: v.datetime,
      time: Math.floor(new Date(v.datetime.replace(' ', 'T') + 'Z').getTime() / 1000),
      open: +v.open, high: +v.high, low: +v.low, close: +v.close,
      volume: v.volume != null ? +v.volume : undefined,
    }))
    .filter(b => Number.isFinite(b.open) && Number.isFinite(b.time))
    .sort((a, b) => a.time - b.time);
}

// ── Session grouping (the walk-forward part `ranges.js` doesn't provide) ────

// Asia session = 00:00-06:00 London, Mon-Fri only. Mirrors the >=36-bar (3h)
// "complete session" rule from ranges.js's calculateAsiaRanges so the same
// definition of "usable session" is honored, just applied to every day
// present in the loaded range instead of only the newest one.
export function groupAsiaSessions(bars5m) {
  const byDate = new Map();
  for (const bar of bars5m) {
    const hour = barLondonHour(bar);
    if (hour < 0 || hour >= 6) continue;
    const date = bar.datetime.split(' ')[0];
    const dow = barLondonDay(bar);
    if (dow === 0 || dow === 6) continue;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(bar);
  }
  return [...byDate.entries()]
    .filter(([, bars]) => bars.length >= 36)
    .map(([date, bars]) => ({ date, bars }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// The 2 hours immediately after the Asia window (06:00-08:00 London), same
// calendar day — the "run straight outside of Asia" window Husky described
// live, then declined to use as the default anchor. Kept separate from
// groupAsiaSessions so callers can compare the two anchors directly.
export function groupPostAsiaWindow(bars5m) {
  const byDate = new Map();
  for (const bar of bars5m) {
    const hour = barLondonHour(bar);
    if (hour < 6 || hour >= 8) continue;
    const date = bar.datetime.split(' ')[0];
    const dow = barLondonDay(bar);
    if (dow === 0 || dow === 6) continue;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(bar);
  }
  return byDate;
}

// Monday session = full Monday, 15m bars, body high/low — mirrors
// calculateMondayRanges' >=40-bar "complete Monday" rule, walked across every
// Monday in the loaded history.
export function groupMondaySessions(bars15m) {
  const byDate = new Map();
  for (const bar of bars15m) {
    if (barLondonDay(bar) !== 1) continue;
    const date = bar.datetime.split(' ')[0];
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(bar);
  }
  return [...byDate.entries()]
    .filter(([, bars]) => bars.length >= 40)
    .map(([date, bars]) => ({ date, bars }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── Level history + timeline (reuses computeBodyRange / projectFibLevels /
//    detectConfluences from ranges.js — no range/ladder/clustering math is
//    reimplemented here) ──────────────────────────────────────────────────

export function buildAsiaRangeHistory(bars5m) {
  return groupAsiaSessions(bars5m).map(s => ({ date: s.date, range: computeBodyRange(s.bars) }));
}

export function buildMondayRangeHistory(bars15m) {
  return groupMondaySessions(bars15m).map(s => ({ date: s.date, range: computeBodyRange(s.bars) }));
}

// Video 8: "don't use 1.25 on Asia/daily ranges — fine on weekly." FIB_LEVELS
// only carries the outlier on the positive side (there's no matching -1.25
// entry), so this drops fib===1.25 for the 'asia' source only.
function applyDailyOutlierExclusion(levels, source) {
  if (source !== 'asia') return levels;
  return levels.filter(l => l.fib !== 1.25);
}

// Walks `history` (ascending, from buildAsiaRangeHistory/buildMondayRangeHistory)
// and for each entry after the first builds that period's own ladder (the
// levels actually traded during it) plus its confluence cross-check against
// the PRIOR period's ladder — today's N levels vs yesterday's N levels (or
// this Monday's vs last Monday's), exactly the group's own "Asia Session Fib
// Retracement" Pine indicator.
//
// This calls detectConfluencesCore DIRECTLY rather than through ranges.js's
// detectConfluences wrapper. That wrapper is state-coupled (reads
// S._caps.clusterMerge) and defaults to clusterMerge:true — the LIVE
// DASHBOARD's own convenience mode, which averages nearby (today,yesterday)
// pairs into one merged line. The actual Pine indicator members trade off
// does NOT do that: it keeps every qualifying pair as its own line and only
// dedupes when two SELECTED prices land within 0.1 pip of each other
// (confluence-core.js's clusterMerge:false branch) — that's what this calls,
// so the tool matches the real indicator's behavior, not the dashboard's.
// Per-instrument threshold (2 pips FX / $20 gold / etc, via
// getConfluenceThreshold) and the 10%-of-threshold "tight" cutoff both mirror
// the indicator's own calculated_threshold table and
// tight_confluence_percentage default exactly.
export function buildLevelTimeline(history, symbol, source) {
  const out = [];
  const pipSize = getPipSize(symbol);
  const normalDistance = getConfluenceThreshold(symbol) * pipSize;
  const tightDistance = normalDistance * 0.10;
  for (let i = 1; i < history.length; i++) {
    const curr = history[i].range, prev = history[i - 1].range;
    if (!curr || !prev) continue;
    const levels = applyDailyOutlierExclusion(projectFibLevels(curr), source);
    const prevLevels = applyDailyOutlierExclusion(projectFibLevels(prev), source);
    const confluences = detectConfluencesCore(levels, prevLevels, {
      pipSize, normalDistance, tightDistance,
      priceMode: 'lowest', clusterMerge: false,
      source, sessionRange: curr.range,
    });
    out.push({ date: history[i].date, range: curr, levels, confluences });
  }
  return out;
}

// The timeline entry whose period covers `dateStr`. Asia levels are valid the
// same calendar day only (video 12's "10pm same day" cutoff is NOT modeled
// here — this is same-date-only, a known simplification, see file header).
// Monday levels are valid Monday..Friday of that week (video 12's "10pm
// Friday" cutoff likewise not modeled to the hour).
export function levelsActiveOn(dateStr, timeline, periodKind) {
  if (periodKind === 'asia') return timeline.find(t => t.date === dateStr) ?? null;
  // 'monday': find the most recent Monday entry with date <= dateStr, within 4 days.
  let best = null;
  for (const t of timeline) {
    if (t.date > dateStr) continue;
    const days = (new Date(dateStr + 'T00:00:00Z') - new Date(t.date + 'T00:00:00Z')) / 86400000;
    if (days >= 0 && days <= 4 && (!best || t.date > best.date)) best = t;
  }
  return best;
}

// fib < 0 or fib > 1 = outside the session's own body range (the ladder's
// extension zone, as opposed to its 0..1 inside-range quarter-levels). The
// Pine indicator's Strong/Strongest modes both gate on the confluence's
// SELECTED price sitting outside the session's actual (wick) high/low —
// this uses the body-range fib instead (the same convention already used
// by detectAdxRegimeSwitch's near/far banding below), a documented
// simplification since this engine's ranges are body-based throughout and
// don't separately track wick extremes.
export function isOutsideRange(fib) { return fib < 0 || fib > 1; }

// Merge the active Asia-day ladder and active Monday-week ladder for a given
// bar's calendar date into one flat, tagged level array.
//
// opts.levelMode mirrors the Pine indicator's "Display Mode" dropdown:
//   'all'      — the full raw ladder (every fib multiple), the default.
//   'strong'   — CONFLUENT levels only (today's ladder landing within the
//                pip/dollar threshold of yesterday's — or this week's vs
//                last week's), restricted to OUTSIDE the range (matches the
//                indicator's "Strong Levels": green + orange lines).
//   'strongest'— confluent AND tight (within 10% of the threshold) AND
//                outside the range (matches "Strongest Levels": green only).
// `fib` on a confluent entry is TODAY's own extension multiple (todayFib) —
// the level actually live/traded that period — kept so near/far banding
// (see detectAdxRegimeSwitch) still works.
export function activeLevelsAt(bar, asiaTimeline, mondayTimeline, opts = {}) {
  const date = bar.datetime.split(' ')[0];
  const asia = levelsActiveOn(date, asiaTimeline, 'asia');
  const monday = levelsActiveOn(date, mondayTimeline, 'monday');
  const mode = opts.levelMode ?? 'all';
  const pick = period => {
    if (!period) return [];
    if (mode === 'all') {
      return period.levels.map(l => ({ price: l.price, fib: l.fib, strong: false, strongest: false }));
    }
    return period.confluences
      .filter(c => isOutsideRange(c.todayFib) && (mode === 'strong' || c.isTight))
      .map(c => ({ price: c.price, fib: c.todayFib, isTight: c.isTight, density: c.density, strong: true, strongest: !!c.isTight }));
  };
  const out = [];
  for (const l of pick(asia)) out.push({ ...l, source: 'asia' });
  for (const l of pick(monday)) out.push({ ...l, source: 'monday' });
  return out;
}

// ── 1. Wick rejection + engulfing candle ─────────────────────────────────────
// "candle 1: wick into/beyond the level without closing beyond it; candle 2:
// full-range engulf of candle 1 in the trade direction." (video 14)
//
// opts: { tolerance } — price tolerance (in price units) for "at the level",
// since a raw price equality never happens on real bars. Defaults to 1 pip.
export function detectWickEngulfing(bars, asiaTimeline, mondayTimeline, opts = {}) {
  const tol = opts.tolerance ?? 0;
  const events = [];
  for (let i = 1; i < bars.length - 1; i++) {
    const a = bars[i];
    const levels = activeLevelsAt(a, asiaTimeline, mondayTimeline, { levelMode: opts.levelMode });
    for (const lvl of levels) {
      const L = lvl.price;
      // Approached from below (level acts as resistance → short setup):
      // candle A wicks up into/through L but closes back below it.
      const wickedUpNoClose = a.high >= L - tol && a.close < L - tol && a.open < L - tol;
      // Approached from above (level acts as support → long setup):
      const wickedDownNoClose = a.low <= L + tol && a.close > L + tol && a.open > L + tol;
      if (!wickedUpNoClose && !wickedDownNoClose) continue;
      const b = bars[i + 1];
      const dir = wickedUpNoClose ? 'short' : 'long';
      // "Full-range engulf" means candle B's own REALIZED range (high/low —
      // what it actually traded through) fully brackets candle A's range,
      // with B closing decisively in the trade direction. Checking b.open
      // against a.high/a.low instead (an earlier version of this) requires B
      // to already be gapped beyond A's extreme before it even opens — on
      // continuous intrabar data b.open is essentially always ≈ a.close,
      // which sits INSIDE a's own range, so that check was nearly always
      // false and made this pattern almost never fire. b.high/b.low is what
      // "candle 2 traded past candle 1's full range" actually means.
      const engulfs = dir === 'short'
        ? (b.close < b.open && b.high >= a.high && b.low <= a.low)
        : (b.close > b.open && b.low <= a.low && b.high >= a.high);
      if (!engulfs) continue;
      events.push({
        time: b.time, price: b.close, level: L, levelSource: lvl.source, fib: lvl.fib,
        dir, kind: 'wick_engulf', wickBarTime: a.time, strong: !!lvl.strong, strongest: !!lvl.strongest,
      });
    }
  }
  return events;
}

// ── 2. Midpoint continuation-pullback ────────────────────────────────────────
// "when price is already trending in one direction and pulls back to the
// midpoint without breaking through it, that pullback is a continuation
// entry." (video 15) Midpoint = fib 0.5 of the active Asia/Monday range.
//
// Trend proxy (documented simplification, not from the transcripts): once
// price closes beyond the midpoint by `breakoutTol` in one direction, that
// direction is "established" until a close on the opposite side invalidates
// it. Any later bar that trades back to the midpoint without CLOSING through
// it, while the trend is still established, is a continuation trigger.
export function detectMidpointPullback(bars, asiaTimeline, mondayTimeline, opts = {}) {
  const breakoutTol = opts.breakoutTol ?? 0;
  const events = [];
  // one trend state per (source, period-date) so Asia and Monday midpoints
  // don't interfere with each other's trend tracking.
  const trendState = new Map(); // key -> 'up' | 'down' | null

  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i];
    const date = bar.datetime.split(' ')[0];
    for (const [kind, timeline] of [['asia', asiaTimeline], ['monday', mondayTimeline]]) {
      const active = levelsActiveOn(date, timeline, kind);
      if (!active) continue;
      const mid = active.levels.find(l => l.fib === 0.5);
      if (!mid) continue;
      const key = `${kind}:${active.date}`;
      // Trend as of BEFORE this bar — established by a prior bar's close, never
      // by this same bar (otherwise the bar that first breaks out could also
      // count as its own pullback).
      const trend = trendState.get(key) ?? null;
      if (trend) {
        const touchedWithoutBreak = trend === 'up'
          ? (bar.low <= mid.price && bar.close > mid.price)
          : (bar.high >= mid.price && bar.close < mid.price);
        if (touchedWithoutBreak) {
          events.push({
            time: bar.time, price: bar.close, level: mid.price, levelSource: kind,
            dir: trend === 'up' ? 'long' : 'short', kind: 'midpoint_pullback',
          });
        }
      }
      let next = trend;
      if (bar.close > mid.price + breakoutTol) next = 'up';
      else if (bar.close < mid.price - breakoutTol) next = 'down';
      trendState.set(key, next);
    }
  }
  return events;
}

// ── 3. Session-extreme anchoring ─────────────────────────────────────────────
// Video 7: a live case for anchoring to the post-Asia breakout extreme
// (06:00-08:00 London) instead of the in-window high/low when price runs hard
// right after the session closes — demonstrated, then explicitly declined for
// simplicity. Returns, per Asia day, BOTH ladders (in-window vs alt-anchored)
// so they can be overlaid and visually compared; `diverges: true` when the
// post-window extreme would have extended the range by more than `minPips`.
export function detectSessionExtremeAnchor(bars5m, symbol, opts = {}) {
  const minPips = opts.minPips ?? 3;
  const pip = getPipSize(symbol);
  const asiaSessions = groupAsiaSessions(bars5m);
  const postWindows = groupPostAsiaWindow(bars5m);
  const out = [];
  for (const { date, bars } of asiaSessions) {
    const inWindow = computeBodyRange(bars);
    if (!inWindow) continue;
    const post = postWindows.get(date);
    if (!post?.length) { out.push({ date, inWindow, altRange: null, diverges: false }); continue; }
    const postRange = computeBodyRange(post);
    const altHigh = Math.max(inWindow.high, postRange.high);
    const altLow = Math.min(inWindow.low, postRange.low);
    const diverges = (altHigh - inWindow.high) / pip >= minPips || (inWindow.low - altLow) / pip >= minPips;
    const altRange = { high: altHigh, low: altLow, range: altHigh - altLow, barCount: inWindow.barCount };
    out.push({
      date, inWindow, altRange, diverges,
      inWindowLevels: projectFibLevels(inWindow),
      altLevels: diverges ? projectFibLevels(altRange) : null,
    });
  }
  return out;
}

// ── 4. VWAP tap / magnet ─────────────────────────────────────────────────────
// "price crossing above/below VWAP and repeatedly tapping it... a magnet or
// pivot on lower timeframes." (video 2, reconfirmed live video 18) Reuses
// computeSessionVwap (the same brick forecast-reversion.html and the
// already-nulled VWAP engines use) — per-session VWAP, reset each day.
// A "tap" = price actually crosses/touches VWAP after having been away from
// it by at least `awayTol` price units on the prior bar (so a series of bars
// glued to VWAP doesn't spam one tap per bar).
export function detectVwapTap(bars5m, opts = {}) {
  const awayTol = opts.awayTol ?? 0;
  const events = [];
  const byDate = new Map();
  for (const bar of bars5m) {
    const date = bar.datetime.split(' ')[0];
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(bar);
  }
  for (const [, dayBars] of byDate) {
    if (dayBars.length < 2) continue;
    const { vwap } = computeSessionVwap(dayBars);
    let awaySide = null; // 'above' | 'below' | null — tracks whether we're "away" and on which side
    for (let i = 0; i < dayBars.length; i++) {
      const bar = dayBars[i], v = vwap[i];
      const touched = bar.low <= v && bar.high >= v;
      if (touched) {
        if (awaySide) {
          events.push({ time: bar.time, price: v, level: v, levelSource: 'vwap', dir: awaySide === 'above' ? 'short' : 'long', kind: 'vwap_tap' });
        }
        awaySide = null;
      } else if (bar.low > v + awayTol) {
        awaySide = 'above';
      } else if (bar.high < v - awayTol) {
        awaySide = 'below';
      }
    }
  }
  return events;
}

// ── 5. ADX regime switch ─────────────────────────────────────────────────────
// video 6 (live) / video 17 (restated, Husky's own "no data on this, I've not
// tested this" disclaimer attached): 4H ADX < ~30 → fade the FAR extension
// back toward basis; ADX >= ~30 → skip the fade, buy a NEAR extension as a
// pullback-continuation entry in the trend direction.

// Resample to 4-hour buckets by wall-clock epoch time (not bar-count chunks,
// so this works regardless of the loaded timeframe — 5m or 15m alike).
export function resampleToH4(bars) {
  const H4 = 4 * 3600;
  const buckets = new Map();
  for (const bar of bars) {
    const key = Math.floor(bar.time / H4);
    let b = buckets.get(key);
    if (!b) { b = { time: key * H4, open: bar.open, high: bar.high, low: bar.low, close: bar.close, lastBarIdxInBucket: [] }; buckets.set(key, b); }
    b.high = Math.max(b.high, bar.high);
    b.low = Math.min(b.low, bar.low);
    b.close = bar.close;
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

// Causal per-bar ADX(4H) read: each intraday bar sees the ADX of the last
// H4 bucket that had already CLOSED before it (no lookahead into the bucket
// still forming).
export function computeH4AdxSeries(bars, period = 14) {
  const H4 = 4 * 3600;
  const h4 = resampleToH4(bars);
  const adx = adxWilder(h4, period);
  const h4ByKey = new Map(h4.map((b, idx) => [b.time, idx]));
  const out = new Array(bars.length).fill(null);
  for (let i = 0; i < bars.length; i++) {
    const bucketKey = Math.floor(bars[i].time / H4) * H4;
    // last COMPLETED bucket = the one strictly before this bar's own bucket
    const prevKey = bucketKey - H4;
    const idx = h4ByKey.get(prevKey);
    out[i] = idx != null && adx[idx] > 0 ? adx[idx] : null;
  }
  return out;
}

// Near = the smallest-magnitude extension outside the range (1 < |fib| <= 1.5);
// far = anything beyond that (|fib| > 1.5). Matches video 6's worked example
// (skip the far fade, buy the 1.5x pullback).
function levelBand(fib) {
  const m = Math.abs(fib);
  if (m <= 1) return null; // inside-range levels aren't part of this rule
  return m <= 1.5 ? 'near' : 'far';
}

export function detectAdxRegimeSwitch(bars, asiaTimeline, mondayTimeline, opts = {}) {
  const threshold = opts.threshold ?? 30;
  const tol = opts.tolerance ?? 0;
  const adxSeries = computeH4AdxSeries(bars);
  const events = [];
  for (let i = 1; i < bars.length; i++) {
    const bar = bars[i];
    const adx = adxSeries[i];
    if (adx == null) continue;
    const trending = adx >= threshold;
    const levels = activeLevelsAt(bar, asiaTimeline, mondayTimeline, { levelMode: opts.levelMode });
    for (const lvl of levels) {
      const band = levelBand(lvl.fib);
      if (!band) continue;
      const touchedUp = bar.high >= lvl.price - tol && bars[i - 1].high < lvl.price - tol;
      const touchedDown = bar.low <= lvl.price + tol && bars[i - 1].low > lvl.price + tol;
      if (!touchedUp && !touchedDown) continue;
      if (!trending && band === 'far') {
        // ranging regime: fade the far level back toward basis
        events.push({ time: bar.time, price: bar.close, level: lvl.price, levelSource: lvl.source, fib: lvl.fib, adx, dir: touchedUp ? 'short' : 'long', kind: 'adx_fade_far', strong: !!lvl.strong, strongest: !!lvl.strongest });
      } else if (trending && band === 'near') {
        // trending regime: buy/sell the near level as a pullback-continuation
        // in the direction the level was approached FROM (fib>0 side reached
        // from below on a pullback in an uptrend = long continuation, etc.)
        events.push({ time: bar.time, price: bar.close, level: lvl.price, levelSource: lvl.source, fib: lvl.fib, adx, dir: lvl.fib > 0 ? 'long' : 'short', kind: 'adx_continuation_near', strong: !!lvl.strong, strongest: !!lvl.strongest });
      }
    }
  }
  return events;
}

// ── Trade planning — SL/TP + walk-forward outcome ────────────────────────────
// Every detector above only marks WHERE a rule fired; it deliberately doesn't
// plan a trade (see file header — visual scan, not a backtest). This adds an
// OPTIONAL, uniform trade plan on top of any point-event list so the outcome
// is actually visible: SL = 1.5x ATR(14) beyond entry — "ATR-based initial
// stop-loss sizing" is the single most repeated, highest-confidence rule in
// the whole transcripts file (videos 4, 6, 11, 17) — and TP = a 2R target
// (2x the SL distance), a standard, uniform default rather than a
// per-test-tuned number. Applies to wick_engulf/midpoint_pullback/vwap_tap/
// adx_regime events only — session-extreme-anchor isn't a directional entry
// signal, it's a per-day level-anchor comparison, so it's not planned here.
//
// Deliberately does NOT reuse walkBars from forecastCore.js: that brick
// solves a different sub-problem (a RESTING order waiting to be filled, then
// walked to SL/TP). Every event here already executed at the event bar's own
// close — there's no fill-wait step — so forcing it through walkBars' fill
// semantics would be more confusing than the ~10 lines below.
function walkToExit(fwdBars, entry, sl, tp, isBuy) {
  for (const bar of fwdBars) {
    if (isBuy) {
      if (bar.low <= sl) return { outcome: 'loss', exitTime: bar.time, exitPrice: sl };
      if (bar.high >= tp) return { outcome: 'win', exitTime: bar.time, exitPrice: tp };
    } else {
      if (bar.high >= sl) return { outcome: 'loss', exitTime: bar.time, exitPrice: sl };
      if (bar.low <= tp) return { outcome: 'win', exitTime: bar.time, exitPrice: tp };
    }
  }
  const last = fwdBars[fwdBars.length - 1];
  return { outcome: 'open', exitTime: last ? last.time : null, exitPrice: last ? last.close : entry };
}

// opts: { atrPeriod=14, slMult=1.5, tpMult=2 (R-multiple of the SL distance),
// maxHoldBars=288 (~1 trading day of M5 bars — the max forward window before
// a still-open trade is marked 'open' rather than walked indefinitely) }.
// Returns the same events, each augmented with { planned, sl, tp, outcome,
// exitTime, exitPrice } — 'planned:false' (SL/TP omitted) only when ATR
// wasn't warmed up yet at that bar.
export function planTrades(bars, events, opts = {}) {
  const atrPeriod = opts.atrPeriod ?? 14;
  const slMult = opts.slMult ?? 1.5;
  const tpMult = opts.tpMult ?? 2;
  const maxHoldBars = opts.maxHoldBars ?? 288;
  const atr = atrWilder(bars, atrPeriod);
  const timeIndex = new Map(bars.map((b, i) => [b.time, i]));

  return events.map(ev => {
    const i = timeIndex.get(ev.time);
    if (i == null || !(atr[i] > 0)) return { ...ev, planned: false };
    const isBuy = ev.dir === 'long';
    const entry = ev.price;
    const slDist = slMult * atr[i];
    const sl = isBuy ? entry - slDist : entry + slDist;
    const tp = isBuy ? entry + slDist * tpMult : entry - slDist * tpMult;
    const fwd = bars.slice(i + 1, i + 1 + maxHoldBars);
    const { outcome, exitTime, exitPrice } = walkToExit(fwd, entry, sl, tp, isBuy);
    return { ...ev, planned: true, sl, tp, outcome, exitTime, exitPrice };
  });
}
