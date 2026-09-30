/**
 * Vote Atlas v4 — the line engine.
 *
 * Reproduces the lines the owner actually trades: the Vol Forecast v3 page's
 * "⬇ Forecast p50/75/90" export, drawn by pine/cog_volatility_v3_sessions.pine.
 * Vote Atlas v1-v3 used the same ladder engine but differed from that export in
 * three ways, each checked against the code on 2026-09-29:
 *
 *   1. Line set. v1-v3 traded only OH/OL. The chart also draws Close med/75p
 *      (static off the open) and Proj H/L med/75p (trailing the opposite running
 *      extreme) — neither was ever backtested.
 *   2. Event conditioning. v1-v3 (and the live bot's plan producer) built every
 *      day's ladder with eventTag 'none'. The export tags each day per instrument
 *      (volForecastScheduler.js -> detectEventTagFor), which moves every band by
 *      up to ~25% on FOMC/NFP days.
 *   3. σ source. The export's σ comes from OANDA daily candles with no
 *      dailyAlignment, i.e. days ending 17:00 New York
 *      (volForecastScheduler.js fetchOHLCOanda). v1-v3 used London-midnight days.
 *
 * This module reuses forecastSigma + buildLadder (no vol math copied) and fixes
 * all three. Everything is CAUSAL by construction and checked by
 * js/voteAtlasV4Lines.test.mjs's truncation test:
 *   - a London day's ladder only reads NY-17:00 daily bars that had CLOSED before
 *     that day's London-midnight open;
 *   - Proj H/L at bar k trail the running extreme through bar k-1 only (the Pine
 *     indicator includes bar k's own extreme, which is unknowable intrabar — a
 *     backtest must not);
 *   - the event tag for day D is the scheduled calendar for D, known in advance.
 */

import { forecastSigma } from './forecastSigma.js';
import { buildLadder, paramsFor } from './forecastLadder.js';
import { bucketM1IntoSessions } from './forecastAnalyser.js';

// ── NY-17:00 daily bars from M1 ──────────────────────────────────────────────
// A bar belongs to the NY trading day that ENDS at the next 17:00 America/New_York.
// Shifting NY local time forward 7h puts that boundary at local midnight, so the
// shifted calendar date is the day key. NY UTC offset is cached per UTC hour.
const _nyFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' });
const _nyOffsetCache = new Map();
function nyOffsetHours(tSec) {
  const hourKey = Math.floor(tSec / 3600);
  let off = _nyOffsetCache.get(hourKey);
  if (off === undefined) {
    const p = Object.fromEntries(_nyFmt.formatToParts(new Date(hourKey * 3600_000)).map(x => [x.type, x.value]));
    const localAsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24) / 1000;
    off = Math.round((localAsUtc - hourKey * 3600) / 3600);   // -4 (EDT) or -5 (EST)
    _nyOffsetCache.set(hourKey, off);
  }
  return off;
}

/**
 * nyCloseDailyBars(packed) -> [{ key, endSec, open, high, low, close }]
 * `endSec` is the UTC instant the day closed (17:00 NY) — the moment its bar
 * becomes usable by anything downstream.
 */
export function nyCloseDailyBars(packed) {
  const out = [];
  let cur = null;
  for (let i = 0; i < packed.n; i++) {
    const t = packed.times[i];
    const off = nyOffsetHours(t);
    const shifted = t + (off + 7) * 3600;                       // NY local + 7h
    const key = new Date(shifted * 1000).toISOString().slice(0, 10);
    if (!cur || cur.key !== key) {
      if (cur) out.push(cur);
      // 17:00 NY on the day before `key`'s shifted midnight == shifted midnight - 7h local
      const keyMidnightShifted = Date.parse(key + 'T00:00:00Z') / 1000;
      cur = { key, endSec: keyMidnightShifted + 24 * 3600 - (off + 7) * 3600,
              open: packed.opens[i], high: packed.highs[i], low: packed.lows[i], close: packed.closes[i], n: 0 };
    }
    if (packed.highs[i] > cur.high) cur.high = packed.highs[i];
    if (packed.lows[i] < cur.low) cur.low = packed.lows[i];
    cur.close = packed.closes[i];
    cur.n++;
  }
  if (cur) out.push(cur);
  return out;
}

// ── Lines ────────────────────────────────────────────────────────────────────
// Static lines are fixed off the day open. Proj lines are functions of the running
// extreme, so they are described by (anchor, pct) and priced per bar.
export const STATIC_LINES = [
  ['OH_p50', 'up', 'oh', 'p50'], ['OH_p75', 'up', 'oh', 'p75'], ['OH_p90', 'up', 'oh', 'p90'],
  ['OL_p50', 'dn', 'ol', 'p50'], ['OL_p75', 'dn', 'ol', 'p75'], ['OL_p90', 'dn', 'ol', 'p90'],
  ['CloseUp_p50', 'up', 'oc', 'p50'], ['CloseUp_p75', 'up', 'oc', 'p75'],
  ['CloseDn_p50', 'dn', 'oc', 'p50'], ['CloseDn_p75', 'dn', 'oc', 'p75'],
];
export const PROJ_LINES = [
  ['ProjH_p50', 'up', 'hl', 'p50'], ['ProjH_p75', 'up', 'hl', 'p75'],
  ['ProjL_p50', 'dn', 'hl', 'p50'], ['ProjL_p75', 'dn', 'hl', 'p75'],
];

/**
 * v4Days(packed, { instrument, assetClass, eventTagFor, minDays, minBars })
 *   -> [{ date, openSec, open, bars, ladder, sigmaFrac, eventTag, static: {name: level} }]
 *
 * eventTagFor(date) -> 'FOMC'|'NFP'|'CPI'|'high'|'holiday'|'none'|null. null means
 * "calendar unknown for this date" and applies NO conditioning (×1.0) — the same
 * thing the live export does when its feed can't be read.
 */
// Day eligibility is decided from the CALENDAR, never from how many bars the day
// ends up with: Vote Atlas's `>= 200 bars` filter uses the day's final length,
// which is unknowable at an early-morning touch — caught by this module's own
// truncation test on its first run. Weekend London dates are the only exclusion
// (Sunday's pre-midnight stub, Saturday's nothing); `minBars` stays available for
// callers that need a structural floor, default off.
export function v4Days(packed, { instrument, assetClass = 'fx', eventTagFor = () => 'none',
                                 minDays = 60, minBars = 1 } = {}) {
  const sym = String(instrument).toUpperCase();
  const est = paramsFor(sym, assetClass).estimator ?? 'yz_30';
  const ny = nyCloseDailyBars(packed).filter(d => d.n >= 60);   // drop weekend stubs
  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const dates = [...sessions.keys()].sort();
  const out = [];
  let j = 0;   // ny[0..j) have closed before the current London day's open
  for (const date of dates) {
    const dow = new Date(date + 'T12:00:00Z').getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const bars = sessions.get(date);
    if (!bars || bars.length < minBars) continue;
    const openSec = bars[0].time;
    while (j < ny.length && ny[j].endSec <= openSec) j++;
    if (j < minDays) continue;
    const sigma = forecastSigma(ny.slice(0, j), est);
    if (!(sigma > 0)) continue;
    const eventTag = eventTagFor(date);
    // Unknown calendar -> an unrecognised tag, which eventMultiplier prices at ×1.0
    // (passing null/undefined would fall through to buildLadder's 'none' default).
    const ladder = buildLadder(sigma, { instrument: sym, assetClass, horizon: 'daily',
                                        eventTag: eventTag ?? 'unknown' });
    const open = bars[0].open;
    const lv = {};
    for (const [name, side, q, rung] of STATIC_LINES) {
      const pct = ladder[q]?.[rung];
      if (pct == null) continue;
      lv[name] = side === 'up' ? open * (1 + pct / 100) : open * (1 - pct / 100);
    }
    out.push({ date, openSec, open, bars, ladder, sigmaFrac: ladder.sigma_used_pct / 100, eventTag,
               nyBarsUsed: j, lastNyKey: ny[j - 1].key, static: lv });
  }
  return out;
}

/**
 * Level of every line at bar k of a day, using ONLY bars[0..k-1] for the running
 * extremes (bar 0 uses the open). Returns { name: level }.
 */
export function linesAtBar(day, k, runHi, runLo) {
  const lv = { ...day.static };
  for (const [name, side, q, rung] of PROJ_LINES) {
    const pct = day.ladder[q]?.[rung];
    if (pct == null) continue;
    lv[name] = side === 'up' ? runLo * (1 + pct / 100) : runHi * (1 - pct / 100);
  }
  return lv;
}

export const LINE_SIDE = Object.fromEntries([...STATIC_LINES, ...PROJ_LINES].map(([n, s]) => [n, s]));
export const ALL_LINES = [...STATIC_LINES, ...PROJ_LINES].map(([n]) => n);

/**
 * firstTouches(day) -> [{ line, side, k, time, level }]
 * First touch of each line in the day. A touch at bar k means bar k's high (up
 * lines) / low (down lines) reached the line as priced from bars before k.
 */
export function firstTouches(day) {
  const { bars, open } = day;
  const done = new Set();
  const out = [];
  let runHi = open, runLo = open;
  for (let k = 0; k < bars.length; k++) {
    const b = bars[k];
    const lv = linesAtBar(day, k, runHi, runLo);
    for (const name of ALL_LINES) {
      if (done.has(name) || lv[name] == null) continue;
      const up = LINE_SIDE[name] === 'up';
      if (up ? b.high >= lv[name] : b.low <= lv[name]) {
        done.add(name);
        out.push({ line: name, side: LINE_SIDE[name], k, time: b.time, level: lv[name] });
      }
    }
    if (b.high > runHi) runHi = b.high;
    if (b.low < runLo) runLo = b.low;
  }
  return out;
}
