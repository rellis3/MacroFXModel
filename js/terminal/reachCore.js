// js/terminal/reachCore.js: the Level-reach calculator (Insight tab): "how likely is price to TOUCH this level" from the two calibrated models the desk already has.
// Pure: no DOM, no fetch, no clock (now is passed in).
//
//   REST OF THE SESSION   js/remainingTravelParamsR3.js (layer 5, "remaining travel"): from the latest London checkpoint (01, 03 ... 21), how far price still travels
//                         by the end of the London day, as multipliers of the HAR daily sigma on three rungs (p50 / p75 / p90: price goes at least that far 50 / 25 / 10% of
//                         the time). Calibrated on 2025-26 test data: mean miss 1.6 points, worst hour-and-side cell 5.1; the 21:00 checkpoint is flagged. A WORKING model: it
//                         narrowly missed its frozen rule (by 0.1 point), so it is shown with that note and a wider interval.
//   WHOLE SESSION         the forecast ladder's open-to-high / open-to-low rungs (the "lines" the desk draws), in % of the session open: price reaches p50 50%, p75 25%, p90 10%
//                         of the time by design; calibrated on average, off by up to about 3 points by volatility regime.
// Between and beyond the rungs the chance is read off a smooth curve through them (log-linear; beyond p90 an exponential tail), and beyond p90 it is flagged as extrapolated.
// "Touch" counts a wick. The chance says how likely price is to REACH a level, not whether it holds or which way it goes next. Never a trade.
import { REMAINING_TRAVEL_R3 } from '../remainingTravelParamsR3.js';

export const CHECKPOINTS = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21];
const MAJORS = new Set(['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']);
const INDICES = new Set(['NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100']);
const SQRT252 = Math.sqrt(252);
const fin = v => v != null && Number.isFinite(+v);

/** The R3 class of an instrument (index / gold / major / cross), or null when the model was not fitted for it. (Same rule as js/harShadowCore.js; a test checks they agree.) */
export function travelClass(sym) {
  const s = String(sym).toUpperCase();
  if (INDICES.has(s)) return 'index';
  if (s === 'GOLD') return 'gold';
  if (MAJORS.has(s)) return 'major';
  return /^[A-Z]{6}$/.test(s) ? 'cross' : null;
}

/** Epoch ms of the most recent London midnight at or before nowMs (the London session's own start; Europe/London handles the clock change). */
export function londonOpenMs(nowMs) {
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const part = (ms, t) => +fmt.formatToParts(new Date(ms)).find(p => p.type === t).value;
  const d0 = Date.UTC(part(nowMs, 'year'), part(nowMs, 'month') - 1, part(nowMs, 'day'));   // that London calendar date at 00:00 UTC
  for (const c of [d0, d0 - 3600e3]) if (part(c, 'hour') === 0 && part(c, 'minute') === 0 && part(c, 'day') === part(nowMs, 'day')) return c;
  return d0;
}
/** The London hours gone since the session open (a decimal), and the latest R3 checkpoint passed (null before 01:00). */
export function checkpointAt(nowMs) {
  const open = londonOpenMs(nowMs), h = (nowMs - open) / 3600e3;
  let cp = null; for (const c of CHECKPOINTS) if (h >= c) cp = c;
  return { openMs: open, hours: h, checkpoint: cp };
}

/**
 * The chance that the travel is at least x, from the three calibrated rungs: rungs = [{ x, p }] ascending in x (p: 0.5, 0.25, 0.10). Anchored at (0, 1): travel is always at least 0.
 * Log-linear between points; beyond the last rung an exponential tail at the decay rate of the last segment. Returns { p, tail } (tail = beyond the last rung: extrapolated).
 */
export function exceedance(rungs, x) {
  if (!(x > 0)) return { p: 1, tail: false };
  const pts = [{ x: 0, p: 1 }, ...rungs.filter(r => fin(r.x) && r.x > 0)].sort((a, b) => a.x - b.x);
  if (pts.length < 3) return { p: null, tail: false };
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i].x) { const a = pts[i - 1], b = pts[i], w = (x - a.x) / (b.x - a.x); return { p: Math.exp(Math.log(a.p) + w * (Math.log(b.p) - Math.log(a.p))), tail: false }; }
  }
  const a = pts[pts.length - 2], b = pts[pts.length - 1], lam = (Math.log(a.p) - Math.log(b.p)) / (b.x - a.x);
  return { p: Math.max(0.001, b.p * Math.exp(-lam * (x - b.x))), tail: true };
}

/** A plus-or-minus band in probability points around p for how far to trust it. */
export function band(p, { kind, tail = false, flagged = false } = {}) {
  let h = kind === 'r3' ? 0.02 : 0.03;
  if (flagged) h = Math.max(h, 0.05);
  if (tail) h = Math.max(h, 0.06);
  return { lo: Math.max(0, p - h), hi: Math.min(1, p + h), h };
}

/** The HAR daily sigma (%) as the R3 model was fitted on it: the stored annual vol with the old one-sided news multiplier divided back out (same as js/harShadowCore.js harSigmaDailyPct). */
export function harSigmaDailyPct(fc) {
  const h = fc?.harLog; if (!(h?.vol_annual > 0)) return null;
  const nm = h.news_mult > 1 ? h.news_mult : 1;
  return h.vol_annual / SQRT252 / nm;
}

/**
 * Everything for one market and one level. inputs: sym, fc (the instrument's /api/vol-forecast entry), bars (desk bars, ascending [{ time (s), open, high, low, close }]), nowMs, level.
 * Returns { ok, price, open, side, sessionDate, rest: {...}|null, whole: {...}|null, notes[] } or { ok: false, error }.
 */
export function reach({ sym, fc, bars, nowMs, level }) {
  if (!fin(level) || !(level > 0)) return { ok: false, error: 'Type a price level.' };
  if (!bars?.length) return { ok: false, error: 'No recent prices for this market yet.' };
  const last = bars[bars.length - 1], P = last.close;
  const cp = checkpointAt(nowMs), openSec = cp.openMs / 1000;
  const sessionBars = bars.filter(b => b.time >= openSec);
  const open = sessionBars.length ? sessionBars[0].open : P, started = sessionBars.length > 0;
  const hi = sessionBars.length ? Math.max(...sessionBars.map(b => b.high)) : P, lo = sessionBars.length ? Math.min(...sessionBars.map(b => b.low)) : P;
  const side = level >= P ? 'up' : 'down', notes = [];
  const out = { ok: true, sym, price: P, open, started, level, side, distancePct: (level - P) / P * 100, sessionDate: null, rest: null, whole: null, notes, sessionHigh: hi, sessionLow: lo, checkpoint: cp.checkpoint, hours: cp.hours };

  // already touched this session? (a wick counts)
  out.alreadyTouched = started && ((side === 'up' && hi >= level) || (side === 'down' && lo <= level));

  // rest of the session (R3)
  const cls = travelClass(sym), M = cls ? REMAINING_TRAVEL_R3.classes[cls]?.[String(cp.checkpoint)] : null, sigma = harSigmaDailyPct(fc);
  if (!cls) notes.push('The remaining-travel model was not fitted for this market, so there is no rest-of-session chance.');
  else if (cp.checkpoint == null) notes.push('The remaining-travel model starts at the 01:00 London checkpoint, so it has nothing before then.');
  else if (!M || !(sigma > 0)) notes.push('The daily volatility this model needs is not available for this market.');
  else {
    const unit = sigma / 100 * open, d = Math.abs(level - P) / unit, m = M[side];
    const ex = exceedance([{ x: m.p50, p: 0.5 }, { x: m.p75, p: 0.25 }, { x: m.p90, p: 0.1 }], d), flagged = REMAINING_TRAVEL_R3.flagged_hours.includes(cp.checkpoint);
    out.rest = { p: ex.p, d, tail: ex.tail, flagged, checkpoint: cp.checkpoint, class: cls, rungs: { p50: P + (side === 'up' ? 1 : -1) * m.p50 * unit, p75: P + (side === 'up' ? 1 : -1) * m.p75 * unit, p90: P + (side === 'up' ? 1 : -1) * m.p90 * unit },
      band: band(ex.p, { kind: 'r3', tail: ex.tail, flagged }) };
    if (flagged) notes.push('The 21:00 London checkpoint is the one hour the research flagged as unreliable on the downside; read this one loosely.');
  }

  // whole session from its open (the ladder)
  const L = fc?.ladder, rung = L?.[side === 'up' ? 'oh' : 'ol'];
  if (rung && fin(rung.p50) && fin(rung.p75) && fin(rung.p90) && open > 0) {
    const x = (side === 'up' ? level - open : open - level) / open * 100;
    const ex = x <= 0 ? { p: 1, tail: false } : exceedance([{ x: rung.p50, p: 0.5 }, { x: rung.p75, p: 0.25 }, { x: rung.p90, p: 0.1 }], x);
    out.whole = { p: ex.p, xPct: x, tail: ex.tail, rungs: { p50: open * (1 + (side === 'up' ? 1 : -1) * rung.p50 / 100), p75: open * (1 + (side === 'up' ? 1 : -1) * rung.p75 / 100), p90: open * (1 + (side === 'up' ? 1 : -1) * rung.p90 / 100) },
      band: band(ex.p, { kind: 'whole', tail: ex.tail }), fromOpen: started };
    if (!started) notes.push('This session has not started, so the whole-session chance is measured from the last price.');
  } else notes.push('No forecast ladder for this market, so no whole-session chance.');
  return out;
}

/** A ladder of levels at multiples of the day's own sigma from the price, each with its rest-of-session chance (or the whole-session one when there is none). */
export function ladderRows({ sym, fc, bars, nowMs }, mults = [0.25, 0.5, 1, 1.5, 2, 3]) {
  const P = bars?.[bars.length - 1]?.close, sigma = harSigmaDailyPct(fc);
  if (!(P > 0) || !(sigma > 0)) return [];
  const unit = sigma / 100 * P;
  return mults.map(k => {
    const up = reach({ sym, fc, bars, nowMs, level: P + k * unit }), dn = reach({ sym, fc, bars, nowMs, level: P - k * unit });
    const pick = r => (r.ok ? (r.rest?.p ?? r.whole?.p ?? null) : null);
    return { k, up: { level: P + k * unit, p: pick(up) }, down: { level: P - k * unit, p: pick(dn) } };
  });
}
export const MODEL_NOTE = {
  rest: 'Rest of the session: the remaining-travel model (calibrated on 2025-26 data: it was off by 1.6 points on average and by up to 5 in its worst hour and side). It narrowly missed its own pre-set pass mark, so it is a working model, not a passed one.',
  whole: 'Whole session: the forecast ladder (price reaches its first line 50% of the time, its second 25%, its third 10%, by design; calibrated on average, off by up to about 3 points depending on how volatile the recent past was).',
};
