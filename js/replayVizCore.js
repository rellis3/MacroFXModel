/**
 * Replay on one visualisation (Desk Terminal, preview): the pure core. No DOM, no fetch, no clock (`now` is passed in).
 *
 *   SPEEDS, DEFAULT_SPEED         the three playback speeds (frames per second)
 *   initState(n, opts)            the player's state for n frames
 *   advance(state, dtMs)          move the clock by dtMs of real time (play only); loops or stops at the end
 *   step(state, dir) / seek(state, i) / toggle(state) / setSpeed(state, x) / setLoop(state, on)
 *   keyAction(key)                a key name -> an action name (Space, arrows, Home/End, +/-, L)
 *   coverageOf(frames, wanted)    the honest "what history exists" line: first date, last date, how many frames, and whether it fell short
 *   curveFrames(S, opts)          the US Treasury curve, one frame per day, from the daily series the curve board already holds
 *
 * The player never invents a frame. A visual supplies frames [{ t, data }] from a series we already hold; when the history is shorter than what was
 * asked for, coverageOf says so with the start date and the frame count. A frame is dated by its own print: the Treasury H.15 curve for day D is
 * published on the next business day, so a frame says "dated D", and the replay is a description of history, not a record of what was on a screen at D.
 * It says nothing about what any market will do next (the structure of the curve as a predictor is a tested null: Evidence Book rate-curve-structure).
 */

import { londonDate, prevDate } from './replayCore.js';

/** Frames per second at each speed. x1 is slow enough to read a curve change; x16 runs 90 days in under 2 seconds. */
export const SPEEDS = { 1: 3, 4: 12, 16: 48 };
export const DEFAULT_SPEED = 1;

const fin = v => v != null && Number.isFinite(+v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function initState(n, { speed = DEFAULT_SPEED, loop = false, playing = false, i = null } = {}) {
  const N = Math.max(0, Math.floor(n) || 0);
  return { n: N, i: N ? clamp(i == null ? N - 1 : i, 0, N - 1) : 0, playing: !!playing && N > 1, speed: SPEEDS[speed] ? speed : DEFAULT_SPEED, loop: !!loop, acc: 0 };
}

/** Move by dtMs of real time. Returns a NEW state. At the last frame it loops (back to 0) or stops. */
export function advance(s, dtMs) {
  if (!s.playing || s.n < 2 || !(dtMs > 0)) return s;
  let acc = s.acc + (dtMs / 1000) * SPEEDS[s.speed], i = s.i, playing = true;
  while (acc >= 1) {
    acc -= 1;
    if (i < s.n - 1) i++;
    else if (s.loop) i = 0;
    else { playing = false; acc = 0; break; }
  }
  return { ...s, i, acc, playing };
}
export const step = (s, dir) => ({ ...s, i: clamp(s.i + (dir < 0 ? -1 : 1), 0, Math.max(0, s.n - 1)), playing: false, acc: 0 });
export const seek = (s, i) => ({ ...s, i: clamp(Math.round(+i) || 0, 0, Math.max(0, s.n - 1)), acc: 0 });
/** Play / pause. Pressing play on the last frame starts again from the first. */
export function toggle(s) {
  if (s.n < 2) return s;
  if (s.playing) return { ...s, playing: false, acc: 0 };
  return { ...s, playing: true, i: s.i >= s.n - 1 ? 0 : s.i, acc: 0 };
}
export const setSpeed = (s, x) => (SPEEDS[x] ? { ...s, speed: +x, acc: 0 } : s);
export const setLoop = (s, on) => ({ ...s, loop: !!on });

const KEYS = { ' ': 'toggle', Spacebar: 'toggle', ArrowRight: 'next', ArrowLeft: 'prev', Home: 'first', End: 'last', '+': 'faster', '=': 'faster', '-': 'slower', _: 'slower', l: 'loop', L: 'loop', Escape: 'close' };
export const keyAction = key => KEYS[key] ?? null;
/** Apply a named action to a state (the DOM layer calls this for keys and for buttons alike). */
export function act(s, action) {
  switch (action) {
    case 'toggle': return toggle(s);
    case 'next': return step(s, 1);
    case 'prev': return step(s, -1);
    case 'first': return { ...seek(s, 0), playing: false };
    case 'last': return { ...seek(s, s.n - 1), playing: false };
    case 'faster': { const k = Object.keys(SPEEDS).map(Number); return setSpeed(s, k[Math.min(k.length - 1, k.indexOf(s.speed) + 1)]); }
    case 'slower': { const k = Object.keys(SPEEDS).map(Number); return setSpeed(s, k[Math.max(0, k.indexOf(s.speed) - 1)]); }
    case 'loop': return setLoop(s, !s.loop);
    default: return s;
  }
}

const DAY = 864e5, ts = d => Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`), iso = t => new Date(t).toISOString().slice(0, 10);
const NICE = d => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ts(d)));
export const niceDate = d => (d ? NICE(d) : '');

/**
 * The honest coverage line. frames = [{ t }] ascending (t = ISO date or ms). wanted = { from, to } the window the owner asked for (ISO dates), or null.
 * Returns { n, first, last, short, text }: `short` is true when the first frame is more than a week after what was asked for.
 */
export function coverageOf(frames, wanted = null) {
  const n = frames?.length ?? 0;
  if (!n) return { n: 0, first: null, last: null, short: true, text: 'No history is held for this view yet, so there is nothing to replay.' };
  const d = t => (typeof t === 'number' ? iso(t) : String(t).slice(0, 10));
  const first = d(frames[0].t), last = d(frames[n - 1].t);
  const short = !!(wanted?.from && ts(first) - ts(wanted.from) > 7 * DAY);
  const text = `${n} frame${n === 1 ? '' : 's'}, ${NICE(first)} to ${NICE(last)}.${short ? ` No history before ${NICE(first)}: asked for back to ${NICE(wanted.from)}, shown from where we hold it.` : ''}`;
  return { n, first, last, short, text };
}

// ── the yield curve ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const TENORS = [['FF', 'effr'], ['2y', 'us2y'], ['5y', 'us5y'], ['10y', 'us10y'], ['30y', 'us30y']];
const onOrBefore = (a, date) => {
  let lo = 0, hi = a.length - 1, ans = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (a[m].date <= date) { ans = a[m]; lo = m + 1; } else hi = m - 1; }
  return ans;
};

/**
 * One frame per day for the last `days` calendar days, from S = { effr, us2y, us5y, us10y, us30y } (ascending [{ date, value }] in percent, the same daily
 * series the curve board holds). A frame is { t: ISO date, data: { pts: [{ k, v }], s2s10, s2s30, shape } }. A day is kept only when every tenor has a print
 * within 6 days (the same rule the curve board uses), so a frame is never a half-curve. Dates come from the 10y series (the days that exist).
 */
export function curveFrames(S, { days = 90, now = Date.now() } = {}) {
  const base = S?.us10y;
  if (!Array.isArray(base) || !base.length) return { ok: false, error: 'the Treasury series are not loaded yet', frames: [] };
  const lastDate = base[base.length - 1].date, from = iso(ts(lastDate) - days * DAY);
  const frames = [];
  for (const p of base) {
    if (p.date < from) continue;
    const pts = [];
    let ok = true;
    for (const [k, key] of TENORS) {
      const o = Array.isArray(S[key]) ? onOrBefore(S[key], p.date) : null;
      if (!o || !fin(o.value) || (ts(p.date) - ts(o.date)) / DAY > 6) { ok = false; break; }
      pts.push({ k, v: +o.value });
    }
    if (!ok) continue;
    const v = k => pts.find(q => q.k === k)?.v;
    frames.push({ t: p.date, data: { pts, s2s10: Math.round((v('10y') - v('2y')) * 100), s2s30: Math.round((v('30y') - v('2y')) * 100) } });
  }
  return { ok: frames.length > 0, asOf: lastDate, days, builtAt: new Date(now).toISOString(), tenors: TENORS.map(t => t[0]), frames, note: 'Each frame is the official daily print dated that day (H.15 is published the next business day). A description of history, not what a screen showed at the time.' };
}

/** Fixed y-axis for a whole replay so the picture does not jump: min and max yield over every frame, padded. */
export function curveBounds(frames) {
  let lo = Infinity, hi = -Infinity;
  for (const f of frames ?? []) for (const p of f.data?.pts ?? []) { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; }
  if (!Number.isFinite(lo)) return null;
  const pad = Math.max(0.1, (hi - lo) * 0.08);
  return { lo: Math.floor((lo - pad) * 10) / 10, hi: Math.ceil((hi + pad) * 10) / 10 };
}

/** The plain-words caption for one frame: the shape and how the 2s10s moved since the first frame. Description only. */
export function curveCaption(frames, i) {
  const f = frames?.[i], f0 = frames?.[0]; if (!f) return '';
  const s = f.data.s2s10, d = f0 ? s - f0.data.s2s10 : 0;
  const shape = s < 0 ? 'inverted' : s < 50 ? 'flat' : 'upward-sloping';
  const mv = i === 0 ? 'the first day of this window' : d === 0 ? 'unchanged since the first day' : `${d > 0 ? 'steeper' : 'flatter'} by ${Math.abs(d)}bp since the first day`;
  return `${niceDate(f.t)}: the curve is ${shape}, 2y to 10y at ${s > 0 ? '+' : s < 0 ? '−' : ''}${Math.abs(s)}bp, ${mv}.`;
}

// ── which visuals can be replayed (the command line, the Replay buttons and the tests all read this one list) ────────────────────
/** id, the words that name it on the command line, what it is called, and the registry surface of the board whose card gets the Replay button. */
export const VISUALS = [
  { id: 'curve', name: 'Yield curve', words: ['curve', 'yields', 'yield', 'treasury', 'curvethroughtime'], what: 'the Treasury curve morphing day by day over the last 90 days, with ghosts of earlier shapes and the 2y to 10y slope', surface: 'panel.macro.curve', cardLabel: 'The curve through time', route: '/api/replay/curve?days=90' },
  { id: 'strength', name: 'Currency strength', words: ['strength', 'ccy', 'currencies', 'currency'], what: 'the eight currencies racing through one London session (15-minute steps), ranked by how far each moved in units of its own normal move, on the 1H, 4H or 1D window', surface: 'panel.ov.ccystrength', cardRe: ' window$', route: '/api/replay/strength?date=' },
  { id: 'fedpath', name: 'Fed path odds', words: ['fed', 'fedpath', 'path', 'atlanta', 'policy'], what: 'the odds of a rate above (and below) the current range for each of the next four 3-month windows, day by day over the months we hold, with the history of each window drawn under it', surface: 'panel.macro.fedyields', cardRe: '^Atlanta Fed window odds', route: '/api/fed-path' },
];
export const vizByWord = w => { const k = String(w ?? '').toLowerCase(); return VISUALS.find(v => v.id === k || v.words.includes(k)) ?? null; };

// ── currency strength ───────────────────────────────────────────────────────────────────────────────────────────────────────
const LHM = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false });
const LDAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' });
/** "Thu 12 Nov 09:15 London" for a millisecond time. */
export const londonStamp = ms => `${LDAY.format(ms)} ${LHM.format(ms)} London`;
export const londonDay = d => LDAY.format(Date.parse(`${d}T12:00:00Z`));
export const STRENGTH_WINDOWS = ['1H', '4H', '1D'];

/** The last n weekday London dates before today, newest first (the sessions a strength replay can be asked for). */
export function recentSessions(now, n = 5) {
  const out = []; let d = prevDate(londonDate(now));
  for (let guard = 0; out.length < n && guard < 20; guard++) { const dow = new Date(`${d}T12:00:00Z`).getUTCDay(); if (dow !== 0 && dow !== 6) out.push(d); d = prevDate(d); }
  return out;
}

/** /api/replay/strength -> frames. A step the engine could not build (ok:false, no `h`) is dropped and counted, never filled. */
export function strengthFrames(series) {
  const ccys = series?.ccys ?? [], steps = Array.isArray(series?.steps) ? series.steps : [];
  const frames = steps.filter(x => x && x.h && typeof x.t === 'number').map(x => ({ t: x.t, data: { h: x.h, closed: !!x.closed } }));
  return { frames, ccys, dropped: steps.length - frames.length, stepMs: series?.stepMs ?? 15 * 60e3 };
}
/** One scale for the whole replay of a window: the biggest absolute score seen, at least 1 sigma, rounded up to a half. */
export function strengthBound(frames, hz) {
  let m = 0; for (const f of frames ?? []) for (const v of f.data?.h?.[hz] ?? []) if (fin(v) && Math.abs(v) > m) m = Math.abs(v);
  return Math.max(1, Math.ceil(m * 2) / 2);
}
/** The eight rows for one frame and window, strongest first: [{ ccy, score, rank (1 = strongest) }], or null when that window has no reading then. */
export function strengthRows(frame, hz, ccys) {
  const v = frame?.data?.h?.[hz]; if (!Array.isArray(v) || v.length !== ccys.length) return null;
  return ccys.map((ccy, k) => ({ ccy, score: v[k] })).filter(r => fin(r.score)).sort((a, b) => b.score - a.score).map((r, k) => ({ ...r, rank: k + 1 }));
}
const sgn1 = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;
/** Plain words for one step: who leads and trails, and who has climbed furthest since the first step. Description only. */
export function strengthCaption(frames, i, hz, ccys) {
  const f = frames?.[i], rows = strengthRows(f, hz, ccys), first = strengthRows(frames?.[0], hz, ccys);
  if (!f) return '';
  if (!rows) return `${londonStamp(f.t)}: no ${hz} reading at this step (the window needs more finished bars).`;
  const top = rows[0], bot = rows[rows.length - 1];
  let move = '';
  if (first && i > 0) {
    const climb = rows.map(r => ({ ccy: r.ccy, d: first.find(x => x.ccy === r.ccy).rank - r.rank })).sort((a, b) => b.d - a.d)[0];
    if (climb && climb.d >= 2) move = ` ${climb.ccy} has climbed ${climb.d} places since the session began.`;
  }
  return `${londonStamp(f.t)}: on the ${hz} window ${top.ccy} is strongest (${sgn1(top.score)}σ) and ${bot.ccy} weakest (${sgn1(bot.score)}σ).${move}${f.data.closed ? ' The market is shut, so the windows end at the last price.' : ''}`;
}

// ── the Fed path (Atlanta Fed window odds) ─────────────────────────────────────────────────────────────────────────────────
const MONTH = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'short', year: 'numeric' });
export const windowLabel = ref => MONTH.format(Date.parse(`${String(ref).slice(0, 10)}T00:00:00Z`));

/**
 * /api/fed-path -> frames, one per tracker date. `series` is { [window start]: [[date, hike %, cut %], ...] } (the store keeps the last 180 observations of
 * four windows, written daily). Odds are for the 3-month AVERAGE rate over a forward window, not for a meeting: a window is never labelled as one.
 * A date a window lacks is null for that window, never filled. The per-meeting ZQ strip is not replayed here: only a handful of lookback strips exist.
 */
export function fedFrames(fp) {
  const series = fp?.series; if (!series || typeof series !== 'object') return { ok: false, error: 'the Fed path store has no daily series yet', frames: [], windows: [] };
  const refs = Object.keys(series).sort(), by = {};
  const dates = new Set();
  for (const r of refs) { by[r] = new Map(); for (const row of Array.isArray(series[r]) ? series[r] : []) { if (!row?.[0] || !fin(row[1])) continue; by[r].set(row[0], { hike: +row[1], cut: fin(row[2]) ? +row[2] : null }); dates.add(row[0]); } }
  const frames = [...dates].sort().map(d => ({ t: d, data: { w: refs.map(r => ({ ref: r, ...(by[r].get(d) ?? { hike: null, cut: null }) })) } }));
  return { ok: frames.length > 0, asOf: fp.asOf ?? null, windows: refs.map(r => ({ ref: r, label: windowLabel(r) })), frames, note: 'Odds for the 3-month average rate over a forward window (Atlanta Fed Market Probability Tracker, CME 3-month SOFR options), not for a meeting.' };
}
const pc = v => (fin(v) ? `${Math.round(v)}%` : 'n/a');
/** Plain words for one date: the nearest window's hike and cut odds, and which window's hike odds moved most since the first day. */
export function fedCaption(frames, i) {
  const f = frames?.[i], f0 = frames?.[0]; if (!f) return '';
  const w = f.data.w[0]; let move = '';
  if (i > 0 && f0) {
    const d = f.data.w.map((x, k) => ({ ref: x.ref, d: fin(x.hike) && fin(f0.data.w[k]?.hike) ? x.hike - f0.data.w[k].hike : null })).filter(x => x.d != null).sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0];
    if (d && Math.abs(d.d) >= 5) move = ` Since the first day the ${windowLabel(d.ref)} window's hike odds are ${d.d > 0 ? 'up' : 'down'} ${Math.abs(Math.round(d.d))} points.`;
  }
  return `${niceDate(f.t)}: for the 3-month window starting ${windowLabel(w.ref)}, the odds of a rate above the current range are ${pc(w.hike)} and below it ${pc(w.cut)}.${move}`;
}
