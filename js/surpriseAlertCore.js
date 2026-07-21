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
  pctHigh:   90,   // displacement pct ≥ this → STRETCHED UP   (far above the open)
  pctLow:    10,   // displacement pct ≤ this → STRETCHED DOWN (far below the open)
  zMin:      1.4,  // |z| magnitude floor — the pct band AND this must trip
  quietBudgetPct: 20, // day-range consumed ≤ this pct (reliable) → QUIET/compressed
  minCalibN: 120,  // don't ping a stretch unless the cone has real calibration
  minGapMin: 90,   // dedupe: no repeat ping for same pair+category within the gap
};

const round = (x, d = 0) => { const p = 10 ** d; return Math.round(x * p) / p; };
const _sp = v => v == null ? '?' : (v >= 0 ? '+' : '') + v.toFixed(2) + '%';   // signed pct

/**
 * Decide whether `summary` (one _fpSummarizePair row) is surprising.
 * Returns null when nothing crosses, else a fully-formed alert object whose
 * `.text` is HTML ready for sendTelegram (parse_mode HTML).
 */
export function detectSurprise(summary, opts = {}) {
  const o = { ...SURPRISE_DEFAULTS, ...opts };
  if (!summary) return null;

  const s = summary.surprise || {};
  const pct = s.pct, z = s.z;
  const calibN = summary.calib?.n ?? 0;
  const haveDisp = pct != null && z != null && calibN >= o.minCalibN;

  // Displacement percentile is DIRECTIONAL: high pct = far above the open
  // (stretched up), low pct = far below (stretched down). Both are "stretched",
  // opposite sides — a big directional move, NOT a quiet one.
  const stretchedUp   = haveDisp && pct >= o.pctHigh && z >= o.zMin;
  const stretchedDown = haveDisp && pct <= o.pctLow  && z <= -o.zMin;
  const stretched = stretchedUp || stretchedDown;

  // TRUE quiet = little of the day's typical range travelled (compression), read
  // off the range budget — NOT the displacement pct (a big directional move is
  // stretched, not quiet; that pre-2026-07-21 mislabel is fixed here).
  const db = summary.dayBudget;
  const quiet = !stretched && db && db.reliable && db.consumedPercentile != null
             && db.consumedPercentile <= o.quietBudgetPct;

  if (!stretched && !quiet) return null;

  const category  = stretched ? 'stretched' : 'quiet';
  const direction = stretchedUp ? 'up' : stretchedDown ? 'down' : null;
  const reversing = stretched && s.reversing === true;   // rolled over from the intraday extreme
  const phase     = stretched ? (reversing ? 'reversing' : 'extending') : null;

  const pair = summary.pair || 'PAIR';
  const dig = _digits(summary.anchor);
  const loStr = summary.p75Lo != null ? summary.p75Lo.toFixed(dig) : '—';
  const hiStr = summary.p75Hi != null ? summary.p75Hi.toFixed(dig) : '—';

  // Severity 1..3.
  let severity;
  if (stretched) { const tail = stretchedUp ? pct : (100 - pct); severity = tail >= 98 ? 3 : tail >= 95 ? 2 : 1; }
  else { const cp = db.consumedPercentile; severity = cp <= 5 ? 3 : cp <= 12 ? 2 : 1; }

  // Context lines.
  const context = [];
  const evs = summary.upcomingEvents || [];
  if (evs.length) context.push(`⚠️ Event near/inside the window (${evs.slice(0, 3).join(', ')}) — this move may be event-driven, not mean-reverting.`);
  const hour = db?.hour;
  if (stretched && hour != null && Array.isArray(summary.shakyHours) && summary.shakyHours.includes(hour))
    context.push(`ℹ️ This hour's cone has been historically less reliable — treat the percentile as softer.`);
  if (stretched && db && db.reliable && db.consumedPercentile != null && db.consumedPercentile >= 75)
    context.push(`📐 ~${round(db.rangeSoFarPct, 2)}% range already travelled — around the ${round(db.consumedPercentile)}th pct of a typical day's budget.`);

  const dirWord = direction === 'up' ? 'upside' : direction === 'down' ? 'downside' : '';
  const zStr = z != null ? ((z >= 0 ? '+' : '') + z.toFixed(1)) : '?';

  let dot, headline, lead;
  if (stretched && reversing) {
    dot = '🟠';
    headline = `${dot} <b>${pair}</b> — extended ${direction}, now reversing (${_ord(round(pct))} pct)`;
    lead = `Price ran to ~${_sp(s.peakPct)} from the open and has pulled back to ~${_sp(s.dispPct)} (z=${zStr}). Still historically far, but <b>the move has already started reversing</b> — the fade is underway, not ahead.`;
  } else if (stretched) {
    dot = '🟡';
    headline = `${dot} <b>${pair}</b> — stretched ${direction} (${_ord(round(pct))} pct)`;
    lead = `Price sits at the ${_ord(round(pct))} percentile of today's calibrated 4h range (z=${zStr}), ~${_sp(s.dispPct)} from the open and near its intraday extreme. A move this large this far into the session is unusual — <b>continuation is statistically stretched to the ${dirWord}</b>.`;
  } else {
    dot = '🔵';
    headline = `${dot} <b>${pair}</b> — quiet / compressed (${_ord(round(db.consumedPercentile))} pct of typical)`;
    lead = `Only ~${round(db.rangeSoFarPct, 2)}% of the day's range has travelled — around the ${_ord(round(db.consumedPercentile))} percentile for this hour. Unusually compressed — <b>quiet stretches tend to expand</b>.`;
  }

  const nextSteps = _nextSteps(category, { phase, direction, loStr, hiStr, hasEvent: evs.length > 0 });

  const calibLine = stretched
    ? `📊 Cone ±${summary.p75HalfPct != null ? summary.p75HalfPct.toFixed(2) : '?'}% (P75), calibrated on ${calibN} windows. Range edges: ${loStr} / ${hiStr}.`
    : `📊 Range edges: ${loStr} / ${hiStr}. Typical full-day range ~${db.typicalFullPct != null ? db.typicalFullPct + '%' : '?'}.`;

  const text = [headline, '', lead, ...context, '', `👉 <b>Next:</b> ${nextSteps}`, '', calibLine].join('\n');

  return { pair, category, direction, phase, dedupeKey: category + (phase ? ':' + phase : ''),
           pct: pct != null ? round(pct) : null, z: z != null ? round(z, 2) : null,
           severity, headline, context, nextSteps, text };
}

// The next-steps line the owner asked for — practical, and explicitly NOT a
// buy/sell call. Direction stays a coin flip; the cone only sizes/frames risk.
function _nextSteps(category, { phase, direction, loStr, hiStr, hasEvent }) {
  if (category === 'stretched') {
    if (phase === 'reversing') {
      const base = `this is context, not a signal. The move already ran and is rolling over — a fade here is LATE, so don't chase it. If you're positioned with the original ${direction} move, protect profit (trail / lock in) rather than add. Take a fresh counter-trade only on your own trigger, not just because it's pulled back.`;
      return hasEvent ? base + ` An event is in the window — the reversal could be event-driven, so treat levels loosely.` : base;
    }
    const base = `this is context, not a signal. The move is still near its extreme, so if you're positioned with it the easy part may be done — consider trailing rather than adding. A fade now has statistical backing but no path confirmation yet; wait for a turn on your own trigger, don't fade a strong trend blindly.`;
    return hasEvent ? base + ` With an event in the window, hold off until it clears — event moves can keep extending.` : base;
  }
  // quiet / compressed
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
