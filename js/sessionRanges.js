/**
 * sessionRanges.js — canonical session-range + London-DST helpers (Tier-1 brick).
 *
 * Extracted 2026-07-23 from the private copies inside `rangeFibEngine.js` and
 * `asiaRangeEngine.js` (both still carry their own copies today — flagged as
 * un-migrated in LEGO_MODULES §2; new code imports THIS). Pure: the only
 * dependency is the `barUtils` packed-array brick. No network, no DOM, no state.
 *
 * Contract
 * --------
 *   dayStartEpoch(dateStr, tz)            → UTC epoch (sec) of local midnight
 *   dowOf(dateStr)                        → 0=Sun..6=Sat (date-only, tz-agnostic)
 *   isoDate(epochSec)                     → 'YYYY-MM-DD' (UTC)
 *   eachDate(packed, fn)                  → iterate every calendar date in the data
 *   buildAsiaSessions(packed, tz, hrs, tfMin, startHour)
 *                                          → [{epoch,date,high,low,range}]  (startHour→startHour+hrs)
 *   buildMondayRanges(packed, tz, tfMin)  → [{epoch,date,high,low,range}]  (full Monday)
 *   prevSession(sessions, dayEpoch)       → most recent session strictly BEFORE dayEpoch
 *   mondayForDay(ranges, dayEpoch)        → this-week's Monday range (or null)
 *   prevMonday(ranges, mondayEpoch)       → the Monday range immediately before
 *
 * A "session" is `{ epoch (UTC sec of the window's own start, local midnight
 * + startHour), date ('YYYY-MM-DD'), high, low, range }` where high/low are
 * BODY extremes (see barUtils.bodyRange — closes/opens, wicks ignored),
 * matching the range-extension lesson's "closes = acceptance, not wicks" rule.
 *
 * `startHour` (added 2026-09-12, default 0 — fully backward compatible):
 * generalizes the window's own start away from local midnight, so the SAME
 * builder can produce a London-session range (startHour=7), a NY-session
 * range (startHour=13), or any arbitrary hour, not just the Asia range
 * (startHour=0, the range-extension lesson's own window). Every downstream
 * caller that anchors off `session.epoch` (e.g. asiaFibAtlasEngine.js's
 * `winEnd = asia.epoch + 24*3600`) keeps working unchanged: "valid until the
 * next calendar day's SAME window" falls out of shifting the epoch itself,
 * not a second code path.
 */

import { extractBars, bodyRange } from './barUtils.js';

// ── Timezone (Europe/London, DST-aware) ───────────────────────────────────────
// London is UTC in winter and UTC+1 (BST) from the last Sunday of March to the
// last Sunday of October. Transitions happen at 01:00 UTC; we treat the offset
// as constant across each calendar day (≤1h imprecision on the 2 switch days/yr).

function lastSundayDate(year, monthIdx0) {
  const lastDay = new Date(Date.UTC(year, monthIdx0 + 1, 0));
  return lastDay.getUTCDate() - lastDay.getUTCDay();
}

export function londonOffsetHours(y, mo /* 1-12 */, d) {
  const marSun = lastSundayDate(y, 2);   // March
  const octSun = lastSundayDate(y, 9);   // October
  const afterMar  = mo > 3  || (mo === 3  && d >= marSun);
  const beforeOct = mo < 10 || (mo === 10 && d <  octSun);
  return (afterMar && beforeOct) ? 1 : 0;
}

// UTC epoch (seconds) of local midnight for `dateStr` ('YYYY-MM-DD') in tz.
export function dayStartEpoch(dateStr, tz) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const utcMidnight = Date.UTC(y, mo - 1, d) / 1000;
  if (tz === 'london') return utcMidnight - londonOffsetHours(y, mo, d) * 3600;
  return utcMidnight;
}

// Day-of-week (0=Sun..6=Sat) of a calendar date (date-only → tz-agnostic).
export function dowOf(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

export function isoDate(epochSec) {
  return new Date(epochSec * 1000).toISOString().substring(0, 10);
}

// Iterate every calendar date spanned by the data (UTC calendar labels).
export function eachDate(packed, fn) {
  const { n, times } = packed;
  if (!n) return;
  const toUTC = (ds) => Date.UTC(...(ds.split('-').map((v, i) => (i === 1 ? +v - 1 : +v))));
  let cur = toUTC(isoDate(times[0]));
  const end = toUTC(isoDate(times[n - 1]));
  for (; cur <= end; cur += 86400 * 1000) fn(new Date(cur).toISOString().substring(0, 10));
}

// ── Session builders ──────────────────────────────────────────────────────────

// One range per calendar date. Window = `startHour` → `startHour + asiaHrs`
// local (default startHour=0, asiaHrs=6h, i.e. 00:00–06:00 London = the
// range-extension lesson's Asia session). Bodies on 5-minute candles.
// `startHour` (default 0) generalizes the window's start hour so the same
// builder produces a London (startHour=7), NY (startHour=13), or any other
// session-window range — see this file's header for the full rationale.
export function buildAsiaSessions(packed, tz = 'utc', asiaHrs = 6, tfMin = 5, startHour = 0) {
  const out = [];
  eachDate(packed, (ds) => {
    const start = dayStartEpoch(ds, tz) + startHour * 3600;
    const bars  = extractBars(packed, start, start + asiaHrs * 3600);
    if (bars.length < 10) return;
    const r = bodyRange(bars, tfMin);
    if (r) out.push({ epoch: start, date: ds, ...r });
  });
  return out.sort((a, b) => a.epoch - b.epoch);
}

// One range per Monday (full local Monday), bodies on the chosen timeframe.
export function buildMondayRanges(packed, tz = 'utc', mondayTfMin = 15) {
  const out = [];
  eachDate(packed, (ds) => {
    if (dowOf(ds) !== 1) return;   // 1 = Monday
    const start = dayStartEpoch(ds, tz);
    const bars  = extractBars(packed, start, start + 24 * 3600);
    if (bars.length < 20) return;
    const r = bodyRange(bars, mondayTfMin);
    if (r) out.push({ epoch: start, date: ds, ...r });
  });
  return out.sort((a, b) => a.epoch - b.epoch);
}

// Most recent session strictly BEFORE dayEpoch (for previous-Asia confluence).
export function prevSession(sessions, dayEpoch) {
  let prev = null;
  for (const s of sessions) { if (s.epoch >= dayEpoch) break; prev = s; }
  return prev;
}

// Most recent Monday on/before this day, within the same week (else null).
export function mondayForDay(ranges, dayEpoch) {
  let mon = null;
  for (const m of ranges) { if (m.epoch > dayEpoch) break; mon = m; }
  if (!mon) return null;
  return (dayEpoch - mon.epoch) < 7 * 86400 ? mon : null;
}

// The Monday range immediately before the given Monday.
export function prevMonday(ranges, mondayEpoch) {
  let prev = null;
  for (const m of ranges) { if (m.epoch >= mondayEpoch) break; prev = m; }
  return prev;
}
