/**
 * OI over time, the pure core (Desk Terminal, preview): the stored option-OI captures played day by day against what price did. Three views share it:
 *   1. TERRAIN OVER TIME  each day's strike profile (the 8 biggest call strikes right, put strikes left), max pain, gamma flip and GEX flips, with the day's price range and
 *                         the recent daily candles on the same price axis; within a day, the 15-minute path against that day's capture.
 *   2. LEVEL WALK         one level fixed (a wall, max pain or the gamma flip as it stood on a start day) followed day by day as its expiry nears (the DTE of the capture's
 *                         primary expiry counts down), with price over it, touches marked and the distance in average daily ranges; and, over EVERY start day held, the touch
 *                         tally for the real level against the same level mirrored through the start-day spot (the by-chance control).
 *   3. OI GAUGE           the calls-against-puts gauge the Options tab draws, day by day, tinted by what price did that day, with a strip of daily moves.
 * DESCRIPTION ONLY. Point in time: a day's capture exists from its saved time (the capture is saved ~06:45 London and describes the previous settlement: `asOf`); the level walk
 * counts touches only on days AFTER the start day. Prior art says walls attract nothing: Evidence Book wall-placebo NULL, oi-max-pain NULL, wall-dte-style underpowered/null.
 * What is NOT held: the per-expiry book (the archive keeps only the primary expiry's summary), so there is no 8d/7d/6d ladder by expiry band; the DTE shown is the primary expiry's.
 */
import { londonDate } from './replayCore.js';
import { wilson } from './ghostWalkCore.js';

export const fin = v => typeof v === 'number' && Number.isFinite(v);
const wk = d => { const x = new Date(`${d}T12:00:00Z`).getUTCDay(); return x !== 0 && x !== 6; };
export const HORIZON = 8;
export const ADR_WINDOW = 20;
export const TOUCH_MAX_ADR = 1;
const r = (v, d = 4) => (fin(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

/** oi_history entries for one market ({ date: summary }) + daily candles [[t ms, o, h, l, c]] -> one compact record per WEEKDAY with a capture (a Saturday or Sunday filing is not a session). */
export function buildOiDays(per, candles, { tzDate = londonDate } = {}) {
  const px = new Map(); for (const b of candles ?? []) if ([b?.[0], b?.[1], b?.[2], b?.[3], b?.[4]].every(fin)) px.set(tzDate(b[0]), { o: b[1], h: b[2], l: b[3], c: b[4] });
  const trim = a => (Array.isArray(a) ? a.filter(w => fin(w?.strike) && fin(w?.oi)).slice(0, 8).map(w => ({ k: r(w.strike, 3), oi: w.oi, tier: w.tier ?? null })) : []);
  const days = [];
  for (const d of Object.keys(per ?? {}).sort()) {
    const e = per[d]; if (!wk(d) || !e || !fin(e.savedAtMs) || !fin(e.spot)) continue;
    const p = px.get(d) ?? null;
    days.push({ date: d, asOf: e.asOf ?? null, savedAtMs: e.savedAtMs, spot: r(e.spot, 3), maxPain: r(e.maxPain, 3), gammaFlip: r(e.gammaFlip, 3), flips: Array.isArray(e.gexFlips) ? e.gexFlips.slice(0, 2).map(f => ({ k: r(f.price, 3), dir: f.dir ?? null })) : [],
      calls: trim(e.callWalls), puts: trim(e.putWalls), pc: r(e.pcRatio, 4), callOI: e.totalCallOI ?? null, putOI: e.totalPutOI ?? null, gex: fin(e.gex) ? e.gex : null, regime: e.regime ?? null,
      dte: fin(e.primaryDTE) ? e.primaryDTE : null, px: p ? { o: r(p.o, 3), h: r(p.h, 3), l: r(p.l, 3), c: r(p.c, 3) } : null });
  }
  return days;
}

/** The average daily range (high-low over close) of the ADR_WINDOW days BEFORE index i, as a fraction of price: the unit for distances. Null with fewer than 5 days. */
export function adrBefore(days, i, n = ADR_WINDOW) {
  const v = []; for (let k = i - 1; k >= 0 && v.length < n; k--) { const p = days[k].px; if (p && p.c > 0) v.push((p.h - p.l) / p.c); }
  return v.length >= 5 ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

// ── 1. terrain over time ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** One fixed scale for the whole replay: how far from spot (a fraction) the picture reaches, and the biggest bar. The window is the 85th percentile of the walls' distance, clamped. */
export function terrainScale(days) {
  const dist = [], oi = [];
  for (const d of days ?? []) for (const w of [...d.calls, ...d.puts]) { if (d.spot > 0) dist.push(Math.abs(w.k / d.spot - 1)); oi.push(w.oi); }
  dist.sort((a, b) => a - b); oi.sort((a, b) => a - b);
  const q = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : null);
  return { half: Math.min(0.08, Math.max(0.012, (q(dist, 0.85) ?? 0.03) * 1.1)), oiMax: (q(oi, 0.98) ?? 1) * 1.05 };
}

/** Day frames: one per day held. t is noon UTC of the date so the player's coverage line reads the date. */
export function dayFrames(days) { return (days ?? []).map((d, i) => ({ t: `${d.date}T12:00:00Z`, data: { i } })); }

/** The recent candles (up to n days up to and including i) for the right-hand panel. */
export const recentCandles = (days, i, n = 20) => days.slice(Math.max(0, i - n + 1), i + 1).map((d, k, a) => ({ date: d.date, px: d.px, now: k === a.length - 1 }));

/** Where the day's range sat against its capture: how many of the 8+8 strikes, max pain and the flip lay inside the day's high-low (a count, not a claim). */
export function levelsInRange(d) {
  if (!d?.px) return { inside: null, total: 0 };
  const lv = [...d.calls.map(w => w.k), ...d.puts.map(w => w.k), d.maxPain, d.gammaFlip].filter(fin);
  return { inside: lv.filter(p => p >= d.px.l && p <= d.px.h).length, total: lv.length };
}

const nice = s => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${s}T12:00:00Z`));
const pxF = (v, dp) => (fin(v) ? Number(v).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp }) : '–');

/** Plain words for one day of the terrain. */
export function terrainCaption(days, i, { label, dp = 1 } = {}) {
  const d = days?.[i]; if (!d) return '';
  const prev = days[i - 1] ?? null, big = [...d.calls].sort((a, b) => b.oi - a.oi)[0], bigP = [...d.puts].sort((a, b) => b.oi - a.oi)[0];
  let s = `${nice(d.date)}: the capture (book of ${d.asOf ?? 'the previous settlement'}) puts max pain at ${pxF(d.maxPain, dp)} and the gamma flip at ${pxF(d.gammaFlip, dp)}; the biggest call strike is ${pxF(big?.k, dp)} (${big?.oi ?? '–'} contracts), the biggest put strike ${pxF(bigP?.k, dp)} (${bigP?.oi ?? '–'}).`;
  if (prev && fin(prev.maxPain) && fin(d.maxPain)) { const dm = d.maxPain - prev.maxPain; s += ` Max pain moved ${dm >= 0 ? 'up' : 'down'} ${pxF(Math.abs(dm), dp)} from the day before.`; }
  const lr = levelsInRange(d);
  if (lr.inside != null) s += ` Price traded ${pxF(d.px.l, dp)} to ${pxF(d.px.h, dp)}, which covered ${lr.inside} of the ${lr.total} levels.`;
  return s;
}

// ── 2. level walk ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export const LEVEL_KINDS = [{ v: 'call', label: 'Biggest call strike' }, { v: 'put', label: 'Biggest put strike' }, { v: 'maxpain', label: 'Max pain' }, { v: 'gamma', label: 'Gamma flip' }];

/** The level of one kind on one day (the biggest call or put strike by open interest, max pain, or the gamma flip), or null. */
export function levelOf(d, kind) {
  if (!d) return null;
  if (kind === 'call') return [...d.calls].sort((a, b) => b.oi - a.oi)[0]?.k ?? null;
  if (kind === 'put') return [...d.puts].sort((a, b) => b.oi - a.oi)[0]?.k ?? null;
  if (kind === 'maxpain') return fin(d.maxPain) ? d.maxPain : null;
  if (kind === 'gamma') return fin(d.gammaFlip) ? d.gammaFlip : null;
  return null;
}

/** The OI at (or nearest to, within tol of the level) a fixed level on a later day, for the call or put side; null when it is not among that day's 8 biggest. */
function oiNear(d, level, kind, tol) {
  const side = kind === 'put' ? d.puts : kind === 'call' ? d.calls : [...d.calls, ...d.puts];
  let best = null; for (const w of side) { const dist = Math.abs(w.k - level) / level; if (dist <= tol && (!best || dist < best.dist)) best = { oi: w.oi, dist }; }
  return best ? best.oi : null;
}

/**
 * Follow one level from a start day for up to HORIZON later days. Returns { level, start: { date, spot }, adr, steps: [{ date, dte, oi, px, touched, distAdr }], touchedAt } or null.
 * Steps are the days AFTER the start day (the level existed from the start day's save time, so its own session is not counted). distAdr is the distance of that day's close from the
 * level in average daily ranges, using only the ranges before the start day. `dte` is the primary expiry's days to expiry on the step's own capture.
 */
export function walkLevel(days, i, kind, { horizon = HORIZON, tol = 0.002 } = {}) {
  const s = days?.[i], level = levelOf(s, kind), adr = adrBefore(days, i);
  if (!s || !fin(level)) return null;
  const steps = []; let touchedAt = null;
  for (let k = i + 1; k < days.length && steps.length < horizon; k++) {
    const d = days[k], p = d.px; if (!p) continue;
    const touched = p.l <= level && level <= p.h; if (touched && touchedAt == null) touchedAt = d.date;
    steps.push({ date: d.date, dte: d.dte, oi: oiNear(d, level, kind, tol), px: p, touched, distAdr: fin(adr) && adr > 0 && p.c > 0 ? (p.c - level) / (p.c * adr) : null });
  }
  return { kind, level, start: { date: s.date, spot: s.spot, dte: s.dte }, adr, steps, touchedAt };
}

/**
 * The touch tally over every start day with a full horizon: for each kind of level within TOUCH_MAX_ADR average daily ranges of the start spot, did price touch it within the
 * horizon, and did it touch the SAME distance on the other side of the start spot (the mirror, what chance gives)? Windows overlap (each day is a start day), so n is not
 * independent: said in the words. Returns per kind and overall { real, mirror (Wilson), n, nStarts, overlap }.
 */
export function tally(days, { horizon = HORIZON } = {}) {
  const out = { all: { k: 0, m: 0, n: 0 } };
  for (const kd of LEVEL_KINDS) out[kd.v] = { k: 0, m: 0, n: 0 };
  let starts = 0;
  for (let i = 0; i < days.length; i++) {
    const adr = adrBefore(days, i), s = days[i];
    if (!fin(adr) || adr <= 0 || !(s.spot > 0)) continue;
    const fut = days.slice(i + 1, i + 1 + horizon).filter(d => d.px); if (fut.length < horizon) continue;
    let any = false;
    for (const kd of LEVEL_KINDS) {
      const L = levelOf(s, kd.v); if (!fin(L) || Math.abs(L - s.spot) / s.spot > adr * TOUCH_MAX_ADR) continue;
      const mirror = 2 * s.spot - L, hit = p => fut.some(d => d.px.l <= p && p <= d.px.h);
      const a = out[kd.v], t = hit(L), m = hit(mirror); a.n++; out.all.n++; if (t) { a.k++; out.all.k++; } if (m) { a.m++; out.all.m++; } any = true;
    }
    if (any) starts++;
  }
  const w = x => ({ real: wilson(x.k, x.n), mirror: wilson(x.m, x.n), n: x.n });
  const res = { starts, all: w(out.all), kinds: Object.fromEntries(LEVEL_KINDS.map(k => [k.v, w(out[k.v])])) };
  const o = (a, b) => a.n > 0 && a.lo <= b.hi && b.lo <= a.hi;
  res.all.overlap = o(res.all.real, res.all.mirror); for (const k of LEVEL_KINDS) res.kinds[k.v].overlap = o(res.kinds[k.v].real, res.kinds[k.v].mirror);
  res.enough = starts >= 30;
  return res;
}

export function tallySentence(t) {
  if (!t?.all?.n) return 'Too few start days with a full eight-day follow-up are held to tally touches.';
  const pc = v => `${Math.round(v)}%`, a = t.all;
  const base = `Over ${t.starts} start days (each followed for ${HORIZON} sessions), ${a.real.k} of ${a.n} levels within one average daily range of the spot were touched (${pc(a.real.p)}, 95% interval ${pc(a.real.lo)} to ${pc(a.real.hi)}); the same distance on the other side was touched ${pc(a.mirror.p)} (${pc(a.mirror.lo)} to ${pc(a.mirror.hi)}).`;
  return `${base} ${a.overlap ? 'The intervals overlap, so there is no sign that these levels are touched more than empty prices at the same distance.' : 'The intervals do not overlap; read that against the Evidence Book, which found no pull toward walls.'} Start days overlap each other, so these are not independent trials${t.enough ? '' : ' and the sample is small'}.`;
}

export function walkCaption(w, k) {
  if (!w) return '';
  const st = w.steps[k], dp = w.level > 1000 ? 1 : w.level > 100 ? 2 : 4;
  if (k < 0 || !st) return `${nice(w.start.date)}: the level is ${pxF(w.level, dp)} (${LEVEL_KINDS.find(x => x.v === w.kind)?.label.toLowerCase()}), with the spot at ${pxF(w.start.spot, dp)}${fin(w.start.dte) ? ` and ${w.start.dte} days to the primary expiry` : ''}. It is held fixed from here.`;
  const first = w.touchedAt && w.touchedAt <= st.date;
  return `${nice(st.date)}${fin(st.dte) ? ` (${st.dte} days to the primary expiry)` : ''}: the level is still ${pxF(w.level, dp)}; the day closed ${fin(st.distAdr) ? `${Math.abs(st.distAdr).toFixed(1)} average daily ranges ${st.distAdr >= 0 ? 'above' : 'below'} it` : 'away from it'}${st.touched ? ', and the day\'s range touched it' : ''}.${st.oi != null ? ` The capture shows ${st.oi} contracts at about that strike.` : ' The capture no longer lists a big strike there.'}${first ? ` It was first touched on ${nice(w.touchedAt)}.` : w.touchedAt ? '' : ' Not touched so far.'}`;
}

// ── 3. gauge over time ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Gauge frames: one per day with a put/call ratio, with the day's price change (close over the previous close, percent), and the cumulative strip. */
export function gaugeFrames(days) {
  const rows = [];
  for (let i = 0; i < (days ?? []).length; i++) {
    const d = days[i]; if (!fin(d.pc)) continue;
    const prev = [...days.slice(0, i)].reverse().find(x => x.px)?.px?.c ?? null, chg = d.px && prev > 0 ? (d.px.c - prev) / prev * 100 : null;
    rows.push({ t: `${d.date}T12:00:00Z`, data: { i, date: d.date, pc: d.pc, callOI: d.callOI, putOI: d.putOI, gex: d.gex, chg } });
  }
  return rows;
}
export function gaugeCaption(frames, k, { label } = {}) {
  const f = frames?.[k]; if (!f) return '';
  const d = f.data, c = d.chg == null ? 'price change not held' : `price ${d.chg >= 0 ? 'rose' : 'fell'} ${Math.abs(d.chg).toFixed(2)}% that day`;
  const sh = d.pc / (1 + d.pc) * 100, past = frames.slice(0, k + 1).map(x => x.data.pc).sort((a, b) => a - b), pct = Math.round((past.filter(v => v <= d.pc).length / past.length) * 100);
  return `${nice(d.date)}: ${label} option open interest has ${d.pc.toFixed(2)} puts for every call (puts are ${sh.toFixed(0)}% of the total), at the ${pct}th percentile of the days held so far; ${c}. This is CME option open interest, not COT positioning.`;
}

export const coverage = days => ({ n: days?.length ?? 0, from: days?.[0]?.date ?? null, to: days?.at(-1)?.date ?? null, withPrice: (days ?? []).filter(d => d.px).length });
