/**
 * surpriseAlertCore — decide when a Forecast-Path cone reading is "surprising"
 * enough to ping, and build the Telegram message (with a next-steps line).
 *
 * This is a CONTEXT ping, never a trade signal. The engine prices range /
 * timing / risk and treats intraday direction as a proven coin flip, so every
 * message says so out loud. A "stretched" alert gives fade context, not a sell;
 * a "quiet" alert flags likely expansion, not a buy.
 *
 * Pure + synthetic-testable (no network, no clock). Consumes the object shape
 * emitted by server.js `_fpSummarizePair` (the /api/forecast-path/summary row).
 *
 *   detectSurprise(summary, opts) -> null | { category, pct, z, severity, text, ... }
 *   shouldFire(state, pair, category, nowSec, minGapSec) -> bool   (dedupe)
 *   recordFired(state, pair, category, nowSec) -> newState
 *
 * Contract is documented in LEGO_MODULES.md §1.
 */

export const SURPRISE_DEFAULTS = {
  pctHigh:   90,   // cone percentile >= this  → STRETCHED (move unusually large)
  pctLow:    10,   // cone percentile <= this  → QUIET     (unusually compressed)
  zMin:      1.4,  // |z| magnitude floor — both the pct band AND this must trip
  minCalibN: 120,  // don't ping unless the hour-of-day cone has real calibration
  minGapMin: 90,   // dedupe: no repeat ping for same pair+category within the gap
};

const round = (x, d = 0) => { const p = 10 ** d; return Math.round(x * p) / p; };

/**
 * Decide whether `summary` (one _fpSummarizePair row) is surprising.
 * Returns null when nothing crosses, else a fully-formed alert object whose
 * `.text` is HTML ready for sendTelegram (parse_mode HTML).
 */
export function detectSurprise(summary, opts = {}) {
  const o = { ...SURPRISE_DEFAULTS, ...opts };
  if (!summary || !summary.surprise) return null;
  const { pct, z } = summary.surprise;
  if (pct == null || z == null) return null;

  // Guard on calibration — an uncalibrated cone shouldn't drive a ping.
  const calibN = summary.calib?.n ?? 0;
  if (calibN < o.minCalibN) return null;

  const stretched = pct >= o.pctHigh && z >= o.zMin;
  const quiet     = pct <= o.pctLow  && z <= -o.zMin;
  if (!stretched && !quiet) return null;

  const category = stretched ? 'stretched' : 'quiet';
  // Severity 1..3 by how far into the tail the calibrated percentile sits.
  const tail = stretched ? pct : (100 - pct);
  const severity = tail >= 98 ? 3 : tail >= 95 ? 2 : 1;

  const pair = summary.pair || 'PAIR';
  const bandLo = summary.p75Lo, bandHi = summary.p75Hi;
  const dig = _digits(summary.anchor);
  const loStr = bandLo != null ? bandLo.toFixed(dig) : '—';
  const hiStr = bandHi != null ? bandHi.toFixed(dig) : '—';

  // Context lines (event window, calibration shakiness, day-range budget).
  const context = [];
  const evs = summary.upcomingEvents || [];
  if (evs.length) {
    context.push(`⚠️ Event near/inside the window (${evs.slice(0, 3).join(', ')}) — this move may be event-driven, not mean-reverting.`);
  }
  const hour = summary.dayBudget?.hour;
  if (hour != null && Array.isArray(summary.shakyHours) && summary.shakyHours.includes(hour)) {
    context.push(`ℹ️ This hour's cone has been historically less reliable — treat the percentile as softer.`);
  }
  const db = summary.dayBudget;
  if (db && db.reliable && db.consumedPercentile != null) {
    if (stretched && db.consumedPercentile >= 75) {
      context.push(`📐 ~${round(db.rangeSoFarPct, 2)}% range already travelled — around the ${round(db.consumedPercentile)}th pct of a typical day's budget.`);
    } else if (quiet && db.consumedPercentile <= 25) {
      context.push(`📐 Only ~${round(db.rangeSoFarPct, 2)}% travelled — near the ${round(db.consumedPercentile)}th pct of a typical day; room left in the budget.`);
    }
  }

  const nextSteps = _nextSteps(category, { loStr, hiStr, hasEvent: evs.length > 0 });

  const dot = stretched ? '🟡' : '🔵';
  const zStr = (z >= 0 ? '+' : '') + z.toFixed(1);
  const headline = `${dot} <b>${pair}</b> — ${category} (${_ord(round(pct))} pct)`;
  const lead = stretched
    ? `Price sits at the ${_ord(round(pct))} percentile of today's calibrated 4h range (z=${zStr}). A move this large this far into the session is unusual — <b>continuation is statistically stretched</b>.`
    : `Price sits at the ${_ord(round(pct))} percentile of today's calibrated 4h range (z=${zStr}). Unusually compressed for this time of day — <b>quiet stretches tend to expand</b>.`;

  const calibLine = `📊 Cone ±${summary.p75HalfPct != null ? summary.p75HalfPct.toFixed(2) : '?'}% (P75), calibrated on ${calibN} windows. Range edges: ${loStr} / ${hiStr}.`;

  const text = [headline, '', lead, ...context, '', `👉 <b>Next:</b> ${nextSteps}`, '', calibLine].join('\n');

  return { pair, category, pct: round(pct), z: round(z, 2), severity, headline, context, nextSteps, text };
}

// The next-steps line the owner asked for — practical, and explicitly NOT a
// buy/sell call. Direction stays a coin flip; the cone only sizes/frames risk.
function _nextSteps(category, { loStr, hiStr, hasEvent }) {
  if (category === 'stretched') {
    const base = `this is context, not a signal. If you're already positioned with the move, the easy part may be done — consider trailing a stop rather than adding. Fresh fade setups now have statistical backing, but wait for your own trigger; don't fade a strong trend blindly.`;
    return hasEvent
      ? base + ` With an event in the window, hold off until it clears — event moves can keep extending.`
      : base;
  }
  // quiet
  const base = `this is context, not a signal. Expect a range expansion — a break has more room than usual. Set price alerts on the range edges (${loStr} / ${hiStr}) and let it come to you rather than forcing an entry into the chop.`;
  return hasEvent
    ? base + ` An event is near — the expansion may be the event itself, so size for it.`
    : base + ` Direction here is a coin flip; don't pre-pick a side.`;
}

/** Dedupe: has enough time passed since the last ping of this pair+category? */
export function shouldFire(state, pair, category, nowSec, minGapSec) {
  if (!state) return true;
  const rec = state[_k(pair, category)];
  if (!rec || rec.at == null) return true;
  return nowSec - rec.at >= minGapSec;
}

/** Immutably stamp a fired ping into the dedupe state. */
export function recordFired(state, pair, category, nowSec) {
  const next = { ...(state || {}) };
  next[_k(pair, category)] = { at: nowSec };
  return next;
}

const _k = (pair, category) => `${String(pair).toUpperCase()}|${category}`;

function _digits(anchor) {
  if (anchor == null) return 5;
  const a = Math.abs(anchor);
  if (a >= 1000) return 1;
  if (a >= 100) return 2;
  if (a >= 10) return 3;
  if (a >= 1) return 4;
  return 5;
}

function _ord(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
