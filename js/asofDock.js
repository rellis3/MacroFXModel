// js/asofDock.js: the pure rules of the docked time bar of the as-of clock (Desk Terminal, preview widget.asof): what the coverage heat strip shows, where the
// handle sits, which keys do what, and the words on the bar. No DOM, no network; the browser part is js/terminal/asofClock.js. Tested in js/asofDock.test.mjs.
import { londonParts, formatClock, dayLabel, SPEEDS } from './asofCore.js';

const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The range the track covers: the first record to now (or the last record if later). With nothing recorded, the last 24 hours. */
export function trackRange(cv, nowMs) {
  if (!cv?.nCore) return { from: nowMs - DAY, to: nowMs, empty: true };
  return { from: cv.firstCore, to: Math.max(nowMs, cv.lastCore), empty: false };
}
export const fracOf = (t, from, to) => (to > from ? Math.min(1, Math.max(0, (t - from) / (to - from))) : 1);
/** A fraction of the track back to a time, rounded to the 5-minute snapshot cadence and kept inside the range. */
export function timeAtFrac(f, from, to) {
  if (!(f > 0)) return from;
  if (f >= 1) return to;
  const raw = from + f * (to - from);
  return Math.min(to, Math.max(from, Math.round(raw / (5 * MIN)) * 5 * MIN));
}

/**
 * The coverage heat strip: one bin per hour from the first record to now. level -1 = before capture began (nothing could have been recorded), 0 = a gap
 * (no point), 1 = sparse (the shut-market 30-minute cadence, or a thin hour), 2 = partial, 3 = dense (about every 5 minutes).
 * points: [{ ts }] ascending or not; stepMin: the spacing the API answered with (it widens a long range).
 */
export function heatBins(points, from, to, { binMs = HOUR, stepMin = 5 } = {}) {
  const ts = (points ?? []).map(p => p.ts).filter(Number.isFinite).sort((a, b) => a - b);
  const first = ts[0] ?? null, last = ts[ts.length - 1] ?? null;
  const step = Math.max(5, Number(stepMin) || 5), expected = Math.max(1, Math.round(binMs / (step * MIN)));
  const start = Math.floor(from / binMs) * binMs, bins = [];
  let j = 0;
  for (let t = start; t < to; t += binMs) {
    while (j < ts.length && ts[j] < t) j++;
    let k = j, n = 0; while (k < ts.length && ts[k] < t + binMs) { n++; k++; }
    const beforeStart = first == null || t + binMs <= first, afterEnd = last != null && t > last + 60 * MIN;
    const level = beforeStart ? -1 : n === 0 ? 0 : n <= 2 ? 1 : n < expected * 0.6 ? 2 : 3;
    bins.push({ t, n, level, left: fracOf(Math.max(t, from), from, to), right: fracOf(Math.min(t + binMs, to), from, to), gapAfterEnd: afterEnd && n === 0 });
  }
  return bins;
}
/** The date labels under the track: one at each UTC midnight inside the range, thinned to at most maxLabels so they do not collide. */
export function dayTicks(from, to, maxLabels = 8) {
  const out = [];
  for (let t = Math.floor(from / DAY) * DAY + DAY; t < to; t += DAY) out.push({ t, frac: fracOf(t, from, to), label: `${DOW[new Date(t).getUTCDay()]} ${new Date(t).getUTCDate()}` });
  if (out.length <= maxLabels) return out;
  const every = Math.ceil(out.length / maxLabels);
  return out.filter((_, i) => i % every === 0);
}
/** Roughly when a day's full daily record is taken: 10:00 London that day (returns ms, or null for a bad date). */
export function fullMarkTs(ld) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ld ?? '')); if (!m) return null;
  for (const off of [0, -HOUR]) {
    const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 10) + off, p = londonParts(ms);
    if (p.date === ld && p.minutes === 600) return ms;
  }
  return null;
}
export const fullMarks = (days, from, to) => (days ?? []).map(fullMarkTs).filter(t => t != null && t >= from && t <= to).map(t => ({ t, frac: fracOf(t, from, to) }));

/** What a key does on the bar: { op: 'step', ms } | 'first' | 'live' | 'play' | null. Arrows step 15 minutes, shift+arrows an hour, PageUp/PageDown a day. */
export function keyAction(key, { shift = false, ctrl = false, meta = false, alt = false } = {}) {
  if (ctrl || meta || alt) return null;
  switch (key) {
    case 'ArrowLeft': return { op: 'step', ms: shift ? -HOUR : -15 * MIN };
    case 'ArrowRight': return { op: 'step', ms: shift ? HOUR : 15 * MIN };
    case 'PageUp': return { op: 'step', ms: -DAY };
    case 'PageDown': return { op: 'step', ms: DAY };
    case 'Home': return { op: 'first' };
    case 'End': case 'Escape': return { op: 'live' };
    case ' ': case 'Spacebar': return { op: 'play' };
    default: return null;
  }
}

/** The words on the bar. */
export function readout({ active, t, loading = false, preview = null }) {
  if (loading) return `Loading ${formatClock(t)}…`;
  if (preview != null) return `${formatClock(preview)}  (let go to move there)`;
  return active ? formatClock(t) : 'Now';
}
export function firstRecordText(cv) {
  if (!cv?.nCore) return 'No records yet';
  return `First record ${formatClock(cv.firstCore)} · ${cv.nCore} points · ${cv.fullDays.length} daily record${cv.fullDays.length === 1 ? '' : 's'} (${cv.fullDays.map(dayLabel).join(', ')})`;
}
export const STEP_BUTTONS = [['-1d', '−1d'], ['-1h', '−1h'], ['-15m', '−15m'], ['+15m', '+15m'], ['+1h', '+1h'], ['+1d', '+1d']];
export { SPEEDS };
