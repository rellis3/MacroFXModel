/**
 * S1 shadow core — time-aware intraday probabilities (forge/VF3_SHADOW_P1_PREREG.md). Pure: no network, no clock, no I/O.
 *
 * Two targets, each scored against what the Vol Forecast V3 page displays today:
 *   T1 next line:  after the FIRST touch of an export O-H/O-L p50 (p75) line, P(the p75 (p90) line on the same side is touched
 *                  before 22:00 London). Display = oos_exceed(next) / oos_exceed(this) (js/ladderPathStats.js).
 *   T2 range-to-line: at a London-hour checkpoint with running H-L below line L, P(session H-L >= L by 22:00).
 *                  L_A = incumbent hl_median (what the card uses); L_B = export HL p50. Display = the card's _breakoutProb.
 * Challenger = frozen P1 tables (js/intradayProbShadowParams.js) + fixed logit level correction delta. Clim = training rate.
 * Read-only shadow: nothing live reads this.
 */
import { IPS_PARAMS as P0 } from './intradayProbShadowParams.js';

export const CHECK_HOURS = Array.from({ length: 19 }, (_, i) => i + 2);   // 02..20 London
export const END_MIN = 22 * 60;
const STEPS = [['oh', 'OH', 'p50', 'p75'], ['oh', 'OH', 'p75', 'p90'], ['ol', 'OL', 'p50', 'p75'], ['ol', 'OL', 'p75', 'p90']];

const logit = p => Math.log(Math.min(Math.max(p, 1e-4), 1 - 1e-4) / (1 - Math.min(Math.max(p, 1e-4), 1 - 1e-4)));
const sigm = x => 1 / (1 + Math.exp(-x));
export const corrected = (p, delta) => sigm(logit(p) + delta);
const r4 = x => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e4) / 1e4);

// Standard normal CDF (Abramowitz-Stegun 26.2.17), identical to the page's _normCdf / _breakoutProb helper.
function phi(x) {
  if (x < 0) return 1 - phi(-x);
  const t = 1 / (1 + 0.2316419 * x);
  const p = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x) * p;
}

/** The card's "x% to median" (vol-forecast-v3.html _breakoutProb), as a fraction. timeFrac = UTC minutes / 1440. */
export function cardDisplay(consumed, timeFrac) {
  const remaining = Math.max(0, 1 - consumed), timeLeft = Math.max(0.01, 1 - Math.min(0.99, timeFrac));
  return Math.max(0, Math.min(1, Math.round(2 * (1 - phi(remaining / Math.sqrt(timeLeft))) * 100) / 100));
}

/** Path-stats display (js/ladderPathStats.js): oos_exceed[next] / oos_exceed[this], null when non-monotone or missing. */
export function pathDisplay(oosExceed, q, a, b) {
  const x = oosExceed?.[`${q}_${a}`], y = oosExceed?.[`${q}_${b}`];
  if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y > x) return null;
  return y / x;
}

/** Session state from M1 bars (sorted, epoch s) since London midnight, up to (not including) `untilSec`. */
export function sessionState(bars, untilSec) {
  let hi = -Infinity, lo = Infinity, last = null, open = null, openTime = null;
  for (const b of bars) {
    if (b.t >= untilSec) break;
    if (open == null) { open = b.open; openTime = b.t; }
    if (b.high > hi) hi = b.high;
    if (b.low < lo) lo = b.low;
    last = b;
  }
  if (open == null) return null;
  return { open, openTime, high: hi, low: lo, lastBarTime: last.t, runHLpct: (hi - lo) / open * 100 };
}

/**
 * T2 predictions at one checkpoint. lines: { L_A: % of open (incumbent hl_median), L_B: % (export hl_p50) }.
 * hour = London checkpoint hour; utcFrac = UTC clock fraction at the checkpoint (what the page's bar_time gives).
 */
export function t2Predictions({ hour, runHLpct, lines, utcFrac, params = P0 }) {
  const out = {};
  for (const k of ['L_A', 'L_B']) {
    const L = lines[k];
    if (!(L > 0) || !(runHLpct < L)) continue;                    // only rows whose line is not yet reached
    const consumed = Math.min(1, Math.max(0, runHLpct / L));
    const P = params[`T2_${k}`];
    const cdec = Math.min(9, Math.floor(consumed * 10));
    const tab = P.table[`${hour}|${cdec}`] ?? P.hour[String(hour)] ?? P.clim;
    out[k] = { line_pct: r4(L), consumed: r4(consumed), display: r4(cardDisplay(consumed, utcFrac)), clim: r4(P.clim),
               chal_fixed: r4(corrected(tab, params.delta[`T2_${k}`])), table: r4(tab) };
  }
  return out;
}

/** First-touch time (epoch s) of each export O-H/O-L rung in `bars` (bar high/low; London day, before 22:00). */
export function firstTouches(bars, open, flat, end22Sec) {
  const lv = {};
  for (const r of ['p50', 'p75', 'p90']) {
    if (Number.isFinite(flat?.[`oh_${r}`])) lv[`OH_${r}`] = open * (1 + flat[`oh_${r}`] / 100);
    if (Number.isFinite(flat?.[`ol_${r}`])) lv[`OL_${r}`] = open * (1 - flat[`ol_${r}`] / 100);
  }
  const ft = {};
  for (const b of bars) {
    if (b.t >= end22Sec) break;
    for (const [k, L] of Object.entries(lv)) {
      if (ft[k] != null) continue;
      if (k.startsWith('OH') ? b.high >= L : b.low <= L) ft[k] = b.t;
    }
  }
  return { levels: lv, ft };
}

/** T1 events whose touch falls in [fromSec, toSec). londonHourOf(sec) -> London hour of that instant. */
export function t1Events({ ft, fromSec, toSec, londonHourOf, oosExceed, params = P0 }) {
  const ev = [];
  for (const [q, S, a, b] of STEPS) {
    const t = ft[`${S}_${a}`];
    if (t == null || t < fromSec || t >= toSec) continue;
    const step = `${S} ${a}->${b}`, hour = londonHourOf(t);
    const tab = params.T1.table[`${step}|${hour}`] ?? params.T1.clim[step];
    ev.push({ step, touch_sec: t, touch_hour: hour, display: r4(pathDisplay(oosExceed, q, a, b)), clim: r4(params.T1.clim[step]),
              chal_fixed: r4(corrected(tab, params.delta.T1)), table: r4(tab) });
  }
  return ev;
}

/** Outcomes for a finished day: T2 y = session H-L (to 22:00) >= line; T1 y = next rung touched at/after the touch, before 22:00. */
export function outcomes({ bars, end22Sec, open, flat }) {
  let hi = -Infinity, lo = Infinity, nb = 0, maxGap = 0, prev = null;
  for (const b of bars) { if (b.t >= end22Sec) break; hi = Math.max(hi, b.high); lo = Math.min(lo, b.low); nb++; if (prev != null) maxGap = Math.max(maxGap, b.t - prev); prev = b.t; }
  const { ft } = firstTouches(bars, open, flat, end22Sec);
  return { hl_pct: nb ? (hi - lo) / open * 100 : null, ft, bars: nb, max_gap_min: Math.round(maxGap / 60) };
}
