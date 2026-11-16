/**
 * Ghost walk, the pure core (Desk Terminal, preview). One London day of a market drawn in units of that day's own EXPECTED RANGE, from its open, with the
 * option-OI levels known then, and the paths of EARLIER days drawn faintly under it (the ghosts) so you can see whether the day is behaving like the others.
 * Nothing here touches the network or the page: the route (js/ghostWalkRoutes.js) and the draw/player modules (js/terminal/ghostWalk*.js) call it.
 *
 *   UNIT       1 unit = the day's archived forecast MEDIAN high-low range (percent of the open), the same "p50" the vol clock and the range replay use.
 *              y = (price - open) / (open * unit / 100). So +1 means price is a whole median day's range above the open.
 *   POINT IN TIME   the day's levels are the OI capture whose SAVED time is the latest not after the end of the day (the capture is saved ~06:45 London, so the
 *              levels exist from that moment, never before); touches are counted only from that moment. The unit is used only when the forecast was computed by the open or within the first hour of the London day (FORECAST_GRACE_MS).
 *   GHOSTS     only EARLIER days than the one shown (never a later one), with a unit, and optionally only days with the same OI regime or the same side of the gamma flip.
 *   TOUCHES    a level counts as touched when a 15-minute bar's range includes it. Beside each real count sits the SAME level mirrored to the other side of the
 *              open (the placebo), so the by-chance rate is on the page. Walls were tested against that mirror and found no pull (Evidence Book: wall-placebo, null).
 *
 * DESCRIPTION ONLY: it shows where price was against the levels, not where it will go.
 */
import { INSTRUMENTS, londonDate, sessionWindow, activeOi, oiLines } from './replayCore.js';

export const fin = v => typeof v === 'number' && Number.isFinite(v);
export const STEP_MS = 15 * 60e3;
/** Fewer earlier days than this and no ghosts are drawn: a handful of paths is an anecdote, not a spread. */
export const MIN_GHOSTS = 12;
/** A band at one time of day needs at least this many ghosts that reach it. */
export const MIN_BAND = 8;
export const MAX_DAYS = 120;
/** The forecast is computed around the London midnight (a few minutes either side, sometimes up to an hour late). A forecast computed later than this after the first bar is not used: the day is dropped and counted. */
export const FORECAST_GRACE_MS = 60 * 60e3;
/** Levels further than this (in units) from the open are not scored for touches (a level two ranges away cannot be reached on a normal day). */
export const TOUCH_MAX_UNITS = 1;
export const GHOST_FILTERS = [{ v: 'all', label: 'All earlier days' }, { v: 'regime', label: 'Same OI regime' }, { v: 'gamma', label: 'Same side of the gamma flip' }];
export const GHOST_MARKETS = Object.entries(INSTRUMENTS).filter(([, v]) => v.oi).map(([k]) => k);

const SCORED = new Set(['call', 'put', 'maxpain', 'gammaflip', 'gexflip']);
const round = (v, d = 4) => (fin(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

/** Units from a price: how many median day-ranges above (+) or below (-) the open. */
export const toUnits = (price, open, unitPct) => (fin(price) && fin(open) && open > 0 && fin(unitPct) && unitPct > 0 ? (price - open) / (open * unitPct / 100) : null);
/** And back: the price a number of units from the open. */
export const fromUnits = (y, open, unitPct) => open * (1 + y * unitPct / 100);

/** Wilson 95% interval for k of n, as percents. */
export function wilson(k, n, z = 1.96) {
  if (!(n > 0)) return { p: null, lo: null, hi: null, n: 0, k: 0 };
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return { p: p * 100, lo: Math.max(0, (c - m) / d) * 100, hi: Math.min(1, (c + m) / d) * 100, n, k };
}

const quantile = (sorted, q) => { if (!sorted.length) return null; const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };

// ── the data layer: one market's 15-minute bars, OI captures and forecasts -> one record per London day ────────────────────────────

/** Bars [[t ms, o, h, l, c]] ascending -> Map(London date -> rows of that day). */
export function groupByLondonDate(bars) {
  const m = new Map();
  for (const b of bars ?? []) { if (![b?.[0], b?.[1], b?.[2], b?.[3], b?.[4]].every(fin)) continue; const d = londonDate(b[0]); (m.get(d) ?? m.set(d, []).get(d)).push(b); }
  return m;
}

/**
 * One London day -> { date, openX, open, unitPct, path, bars?, hiU, loU, oi, levels, touches, partial } or { dropped: 'few-bars' | 'no-forecast' }.
 * x is milliseconds since London midnight of that day, so days line up by the wall clock whatever the daylight-saving shift.
 * entries = every OI capture of the market (each with savedAtMs); fc = { hl_median, knownFrom } for the day or null.
 */
export function buildDay(date, rows, { entries = [], fc = null, today = null, withBars = false } = {}) {
  const win = sessionWindow(date), r = (rows ?? []).filter(b => b[0] >= win.start && b[0] < win.end).sort((a, b) => a[0] - b[0]);
  const partial = date === today;
  if (r.length < (partial ? 2 : 24)) return { date, dropped: 'few-bars' };
  const open = r[0][1], openT = r[0][0];
  const unitPct = fc && fin(fc.hl_median) && fc.hl_median > 0 && (!fin(fc.knownFrom) || fc.knownFrom <= openT + FORECAST_GRACE_MS) ? fc.hl_median : null;
  if (unitPct == null) return { date, dropped: 'no-forecast' };
  const path = [[openT - win.start, round(open, 5)], ...r.map(b => [b[0] + STEP_MS - win.start, round(b[4], 5)])];
  let hi = -Infinity, lo = Infinity; for (const b of r) { if (b[2] > hi) hi = b[2]; if (b[3] < lo) lo = b[3]; }
  // the capture in force by the end of the day: saved during the day it counts from its saved time, saved earlier it counts from the open
  const e = activeOi(entries, win.end - 1);
  const fresh = e && e.savedAtMs >= win.start - 4 * 864e5 ? e : null;
  const from = fresh ? Math.max(openT, fresh.savedAtMs) : null;   // ms, absolute: levels exist (and touches count) from here
  let levels = [], touches = [];
  if (fresh) {
    levels = oiLines(fresh, { walls: 3, near: 0.03 }).filter(l => fin(l.price)).map(l => ({ type: l.type, tier: l.tier ?? null, price: round(l.price, 5), y: round(toUnits(l.price, open, unitPct), 3) }));
    const after = r.filter(b => b[0] + STEP_MS > from);
    for (const l of levels) {
      if (!SCORED.has(l.type) || !(Math.abs(l.y) <= TOUCH_MAX_UNITS) || !after.length) continue;
      const mirror = 2 * open - l.price, hit = p => after.some(b => b[3] <= p && p <= b[2]);
      touches.push({ type: l.type, y: l.y, hit: hit(l.price), mHit: hit(mirror) });
    }
  }
  const oi = fresh ? { date: fresh.date ?? null, asOf: fresh.asOf ?? null, savedX: fresh.savedAtMs - win.start, regime: fresh.regime ?? null,
    gammaSide: fin(fresh.spot) && fin(fresh.gammaFlip) ? (fresh.spot >= fresh.gammaFlip ? 'above' : 'below') : null, stale: openT - fresh.savedAtMs > 3 * 864e5 } : null;
  return { date, openX: openT - win.start, open: round(open, 5), unitPct, path, hiU: round(toUnits(hi, open, unitPct), 3), loU: round(toUnits(lo, open, unitPct), 3), oi, levels, touches, partial,
    ...(withBars ? { bars: r.map(b => [b[0] - win.start, b[1], b[2], b[3], b[4]]) } : {}) };
}

/**
 * Everything the route sends. bars = 15-minute rows; entries = OI captures; forecasts = { [date]: { hl_median, knownFrom } }; focus = the London date shown.
 * Only dates from the first OI capture's date to the focus date are built (it only goes back as far as the OI capture). The focus day carries its bars (for touches in play).
 */
export function buildGhostPayload({ bars, entries = [], forecasts = {}, focus, today = null, n = 90 } = {}) {
  const by = groupByLondonDate(bars), first = (entries ?? []).map(e => e.date).filter(Boolean).sort()[0] ?? null;
  const dates = [...by.keys()].filter(d => first && d >= first && d <= focus).sort().slice(-Math.min(MAX_DAYS, Math.max(1, n)));
  const days = [], dropped = { 'few-bars': 0, 'no-forecast': 0 };
  for (const d of dates) {
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay(); if (dow === 0 || dow === 6) continue;   // a Saturday or Sunday London date holds only the Sunday-evening stub of the next week's open
    const x = buildDay(d, by.get(d), { entries, fc: forecasts[d] ?? null, today, withBars: d === focus });
    if (x.dropped) { dropped[x.dropped]++; continue; }
    days.push(x);
  }
  return { days, dropped, firstOi: first, oiDays: new Set((entries ?? []).map(e => e.date).filter(Boolean)).size, focusFound: days.some(d => d.date === focus) };
}

// ── the reading layer: ghosts, bands, frames, touches, words ──────────────────────────────────────────────────────────────────────

/** Earlier days that can be ghosts for `focus`, by filter. Never the day itself, never a later day, never a day without a unit, never a partial day. */
export function selectGhosts(days, focus, filter = 'all') {
  const pool = (days ?? []).filter(d => d.date < focus.date && !d.partial && fin(d.unitPct) && d.path?.length > 8);
  let g = pool, label = 'earlier days';
  if (filter === 'regime') { const k = focus.oi?.regime ?? null; g = k ? pool.filter(d => d.oi?.regime === k) : []; label = k ? `earlier days with the same OI regime (${k})` : 'earlier days with the same OI regime (none known for this day)'; }
  if (filter === 'gamma') { const k = focus.oi?.gammaSide ?? null; g = k ? pool.filter(d => d.oi?.gammaSide === k) : []; label = k ? `earlier days with price ${k} the gamma flip` : 'earlier days by side of the gamma flip (not known for this day)'; }
  return { ghosts: g, n: g.length, pool: pool.length, label, enough: g.length >= MIN_GHOSTS };
}

/** A day's path in units at the clock x (ms since London midnight): the last point at or before x, or null if the path has not started / has ended before x. */
export function yAt(day, x) {
  const p = day?.path; if (!p?.length || x < p[0][0] || x > p[p.length - 1][0] + STEP_MS / 2) return null;
  let lo = 0, hi = p.length - 1, a = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (p[m][0] <= x) { a = m; lo = m + 1; } else hi = m - 1; }
  return toUnits(p[a][1], day.open, day.unitPct);
}

/** The spread of the ghosts at one clock time: { n, med, p10, p90 } (null when fewer than MIN_BAND reach it). */
export function bandAt(ghosts, x) {
  const ys = []; for (const g of ghosts ?? []) { const y = yAt(g, x); if (fin(y)) ys.push(y); }
  if (ys.length < MIN_BAND) return { n: ys.length, med: null, p10: null, p90: null };
  ys.sort((a, b) => a - b); return { n: ys.length, med: quantile(ys, 0.5), p10: quantile(ys, 0.1), p90: quantile(ys, 0.9) };
}

/** The focus day's price at the end of the bar closing at x (from its own bars when held, else its path). */
export const priceAt = (day, x) => { const p = day.path; let a = null; for (const q of p) { if (q[0] <= x) a = q; else break; } return a ? a[1] : null; };

/** The focus day's levels as lines: each exists from its capture's saved time (savedX) or the open, whichever is later. */
export function levelLines(day) {
  const from = Math.max(day.openX ?? 0, day.oi?.savedX ?? 0);
  return (day.levels ?? []).map((l, i) => ({ id: `${l.type}${i}`, ...l, x: from }));
}

/** First time (x) the focus day's bars touched each level, from the level's own start: { [id]: x }. Uses only bars up to the frame, so it is lookahead-free by construction. */
export function touchTimes(day) {
  const out = {}, bars = day.bars ?? [];
  for (const l of levelLines(day)) {
    const hit = bars.find(b => b[0] + STEP_MS > l.x && b[3] <= l.price && l.price <= b[2]);
    if (hit) out[l.id] = hit[0] + STEP_MS;
  }
  return out;
}

/** One frame per 15 minutes of the focus day: { t (absolute ms), data: { x, y, price, band, higher, touched: [ids], hi, lo } }. */
export function makeFrames(focus, ghosts, { stepMs = STEP_MS } = {}) {
  if (!focus?.path?.length) return [];
  const win = sessionWindow(focus.date), end = focus.path[focus.path.length - 1][0], tt = touchTimes(focus), frames = [];
  let hi = -Infinity, lo = Infinity;
  const bars = focus.bars ?? [];
  for (let x = Math.ceil((focus.path[0][0] + 1) / stepMs) * stepMs; x <= end + 1; x += stepMs) {
    for (const b of bars) if (b[0] + STEP_MS <= x) { const h = toUnits(b[2], focus.open, focus.unitPct), l = toUnits(b[3], focus.open, focus.unitPct); if (h > hi) hi = h; if (l < lo) lo = l; }
    const price = priceAt(focus, x), y = toUnits(price, focus.open, focus.unitPct);
    if (!fin(y)) continue;
    const band = bandAt(ghosts, x), ys = (ghosts ?? []).map(g => yAt(g, x)).filter(fin);
    frames.push({ t: win.start + x, data: { x, y, price, band, higher: ys.length >= MIN_BAND ? ys.filter(v => v > y).length / ys.length : null, hi: fin(hi) ? hi : y, lo: fin(lo) ? lo : y,
      touched: Object.keys(tt).filter(id => tt[id] <= x + 1) } });
  }
  return frames;
}

/** The touch table over every day held: real levels against the same levels mirrored through the open (the by-chance rate), with 95% intervals. */
export function touchSummary(days, { upTo = null } = {}) {
  const rows = (days ?? []).filter(d => !d.partial && (!upTo || d.date < upTo)), t = rows.flatMap(d => d.touches ?? []);
  const nDays = rows.filter(d => (d.touches ?? []).length).length, n = t.length;
  const real = wilson(t.filter(x => x.hit).length, n), mirror = wilson(t.filter(x => x.mHit).length, n);
  const overlap = n > 0 && real.lo <= mirror.hi && mirror.lo <= real.hi;
  return { n, nDays, real, mirror, overlap, enough: nDays >= 30 };
}

/** What the OI capture holds, in words and numbers, for the coverage line and the "where it goes back to" chip. */
export function coverageOf(payload) {
  const f = payload?.firstOi ?? null, used = payload?.days?.length ?? 0;
  return { from: f, oiDays: payload?.oiDays ?? 0, used, dropped: payload?.dropped ?? {}, enough: used - 1 >= MIN_GHOSTS };
}

// ── words ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const HM = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });
/** Clock text for x ms since London midnight (wall clock, so it is the same on a daylight-saving day). */
export const hmOf = x => HM.format(new Date(Math.round(x / 6e4) * 6e4));
export const fmtU = y => (fin(y) ? `${y >= 0 ? '+' : '−'}${Math.abs(y).toFixed(2)}` : '–');
const word = l => ({ call: 'call wall', put: 'put wall', maxpain: 'max pain', gammaflip: 'gamma flip', gexflip: 'GEX flip' }[l.type] ?? l.type);
const pxF = (v, dp) => (fin(v) ? Number(v).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp }) : '–');

/** Plain words for one frame. Description only: where the day is against its open, its own earlier days and its levels. */
export function captionFor(frames, i, extra) {
  const f = frames?.[i]; if (!f || !extra) return '';
  const d = f.data, dp = extra.dp ?? 2, dir = d.y >= 0 ? 'above' : 'below';
  let s = `${hmOf(d.x)} London: ${extra.label} is ${fmtU(d.y)} units ${dir} its open (${pxF(d.price, dp)}); one unit is ${extra.unitPct.toFixed(2)}% of the open, the day's forecast median range.`;
  if (d.higher != null) s += ` At this time of day ${Math.round(d.higher * 100)}% of the ${d.band.n} earlier days were higher.`;
  else if (extra.ghostsOn) s += ' Too few earlier days reach this time of day to compare.';
  const lines = extra.lines ?? [], hit = lines.filter(l => d.touched.includes(l.id));
  if (hit.length) { const last = hit.sort((a, b) => (extra.touchAt[a.id] ?? 0) - (extra.touchAt[b.id] ?? 0)).at(-1); s += ` Levels touched so far: ${hit.length} of ${lines.length}; the latest was the ${word(last)} at ${pxF(last.price, dp)}.`; }
  else if (lines.length) s += d.x >= (extra.levelsFrom ?? 0) ? ` None of the ${lines.length} option levels has been touched yet.` : ` The day's option levels are not out yet (they appear at ${hmOf(Math.max(0, extra.levelsFrom ?? 0))} London).`;
  return s;
}

/** The one-sentence touch read, with the by-chance rate beside it. */
export function touchSentence(s) {
  if (!s || !s.n) return 'No scored levels in the days held, so there is no touch count to show.';
  const pc = v => `${Math.round(v)}%`;
  const base = `Over ${s.nDays} earlier days, ${s.real.k} of ${s.n} option levels within one range of the open were touched (${pc(s.real.p)}, 95% interval ${pc(s.real.lo)} to ${pc(s.real.hi)}); the same levels mirrored to the other side of the open were touched ${pc(s.mirror.p)} (${pc(s.mirror.lo)} to ${pc(s.mirror.hi)}).`;
  const tail = s.overlap ? ' The intervals overlap, so there is no sign that these levels are touched more than equally distant empty prices.' : ' The intervals do not overlap; read that against the Evidence Book, which found no pull toward walls.';
  return `${base}${tail}${s.enough ? '' : ` Only ${s.nDays} days are held, which is a small sample: treat the percentages as rough.`} Levels on one day are not independent of each other.`;
}

// ── export ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const csvCell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/** CSV of the focus day: its path in price and units, then its levels. Made in the browser from what the page shows. */
export function ghostCsv(focus, extra) {
  const rows = [['time_london', 'price', 'units_from_open']];
  for (const p of focus.path) rows.push([hmOf(p[0]), p[1], round(toUnits(p[1], focus.open, focus.unitPct), 3)]);
  rows.push([], ['level', 'price', 'units_from_open', 'tier']);
  for (const l of focus.levels ?? []) rows.push([word(l), l.price, l.y, l.tier ?? '']);
  rows.push([], ['market', extra?.label ?? ''], ['date', focus.date], ['unit', `${focus.unitPct}% of the open (forecast median high-low)`]);
  return rows.map(r => r.map(csvCell).join(',')).join('\n');
}
