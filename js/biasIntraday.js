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
