/**
 * Bias Engine through the day (owner, 2026-11-23: "can we see the times when bias was taken, to see if it shifts over the
 * day and what time it shifted?"). The engine issues once, 05:30-06:00 London, and that issue stays the record of the day.
 * This adds hourly re-runs of the same shadow machinery (V1's logic on fresh data, "v1r", and V2), stored write-once per
 * slot beside the morning issue, never editing it, never read by anything in production. Pure: no fetch, no KV.
 * Server: server.js `_bevIntradayTick` and GET /api/bias-engine-v2/intraday. View: js/terminal/biasEngineV2View.js.
 * Tested by js/biasIntraday.test.mjs.
 *
 *   SLOTS                     the London times re-run (07:00 to 21:00, hourly)
 *   dueSlot(nowMs, londonMs)  the slot whose [slot, slot + 30 min) window contains now, or null
 *   compact(rec)              a V2 record (js/biasEngineV2.js buildV2Record) -> { v1r: {m: [dir, score, strength]}, v2: {...} }
 *   timeline(day)             per market and engine: the calls in time order and each change of direction, with its time
 */

export const SLOTS = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
export const WINDOW_MS = 30 * 60_000;
export const ENGINES = ['v2', 'v1r'];
const fin = x => typeof x === 'number' && Number.isFinite(x);
const r3 = x => (fin(x) ? Math.round(x * 1000) / 1000 : null);

/** londonMs(date, h, m) -> epoch ms of that London wall time (server.js _bsLondonMs). */
export function dueSlot(nowMs, date, londonMs) {
  for (const s of SLOTS) { const [h, m] = s.split(':').map(Number), t = londonMs(date, h, m); if (nowMs >= t && nowMs < t + WINDOW_MS) return s; }
  return null;
}

const slim = markets => Object.fromEntries(Object.entries(markets ?? {}).map(([m, v]) => [m, [v.dir, r3(v.score), v.strength ?? null]]));
/** Only what the timeline needs from a full V2 record (a full record is ~100 KB; this is ~3 KB). */
export function compact(rec) {
  return { v1r: slim(rec?.variants?.v1r?.markets), v2: slim(rec?.variants?.v2?.markets) };
}

const dkey = x => (x.leg ? `${x.leg} ${x.key}` : x.key);
/** The drivers behind each call (for "what moved"): { v1r: {m: [[driver, contrib, reading]]}, v2: {...} }. Stored per slot, apart
 *  from the day's compact calls, so the timeline stays small and the detail is read one market at a time. */
export function detail(rec) {
  const one = markets => Object.fromEntries(Object.entries(markets ?? {}).map(([m, v]) => [m, (v.drivers ?? []).map(x => [dkey(x), r3(x.contrib), String(x.reading ?? '').slice(0, 140)])]));
  return { v1r: one(rec?.variants?.v1r?.markets), v2: one(rec?.variants?.v2?.markets) };
}
/** The drivers whose contribution changed most between two points (each [[driver, contrib, reading]]), largest change first. */
export function whatMoved(prev, cur, n = 3) {
  const P = new Map((prev ?? []).map(d => [d[0], d])), C = new Map((cur ?? []).map(d => [d[0], d]));
  const keys = new Set([...P.keys(), ...C.keys()]);
  return [...keys].map(k => { const a = P.get(k)?.[1] ?? 0, b = C.get(k)?.[1] ?? 0; return { driver: k, from: a, to: b, d: r3(b - a), was: P.get(k)?.[2] ?? null, now: C.get(k)?.[2] ?? null }; })
    .filter(x => Math.abs(x.d) >= 0.005).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, n);
}

/** FundaBias readings the owner logs through the day (time as published, London HH:MM): validate one row. */
export function fbRow(b, markets) {
  const m = String(b?.market ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''), market = markets[m] ?? null;
  const dir = String(b?.dir ?? '').toUpperCase(), score10 = Number(b?.score10), at = String(b?.at ?? '');
  if (!market) return { error: `unknown market ${b?.market}` };
  if (!['BULLISH', 'BEARISH', 'NEUTRAL'].includes(dir)) return { error: 'dir must be BULLISH, BEARISH or NEUTRAL' };
  if (!Number.isInteger(score10) || score10 < 0 || score10 > 10) return { error: 'score10 must be an integer 0-10' };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(at)) return { error: 'at must be the London time it was published, HH:MM' };
  return { row: { market, dir, score10, at, note: String(b?.note ?? '').slice(0, 300) || null } };
}

/**
 * day = { issue: { at, v1r, v2 } | null, slots: { 'HH:MM': { at, v1r, v2 } } }  (each engine as compact() gives it)
 * -> { points: ['issue', '07:00', ...] that exist, markets: [{ market, calls: {v2: [[point, dir, score, strength]...], v1r: [...]},
 *      shifts: {v2: [{ at: point, from, to }], v1r: [...]}, shifted: bool }] } sorted with shifted markets first.
 */
export function timeline(day) {
  const points = [];
  if (day?.issue) points.push(['issue', day.issue]);
  for (const s of SLOTS) if (day?.slots?.[s]) points.push([s, day.slots[s]]);
  const names = new Set(); for (const [, p] of points) for (const e of ENGINES) for (const m of Object.keys(p[e] ?? {})) names.add(m);
  const markets = [...names].map(market => {
    const calls = {}, shifts = {};
    for (const e of ENGINES) {
      calls[e] = points.map(([k, p]) => { const c = p[e]?.[market]; return c ? [k, c[0], c[1], c[2]] : null; }).filter(Boolean);
      shifts[e] = [];
      for (let i = 1; i < calls[e].length; i++) if (calls[e][i][1] !== calls[e][i - 1][1]) shifts[e].push({ at: calls[e][i][0], from: calls[e][i - 1][1], to: calls[e][i][1] });
    }
    return { market, calls, shifts, shifted: ENGINES.some(e => shifts[e].length > 0) };
  });
  markets.sort((a, b) => Number(b.shifted) - Number(a.shifted) || (a.market < b.market ? -1 : 1));
  return { points: points.map(([k]) => k), markets };
}

/** The day's schedule for the strip: each slot done / missed / due / later (London wall times). */
export function schedule(day, nowMs, date, londonMs) {
  return SLOTS.map(s => { const [h, m] = s.split(':').map(Number), t = londonMs(date, h, m);
    return { slot: s, state: day?.slots?.[s] ? 'done' : nowMs >= t + WINDOW_MS ? 'missed' : nowMs >= t ? 'due' : 'later' }; });
}
