// js/terminal/helixDeltas.js: HELIX MEMORY, day on day. Pure. Compares this run's movers (multiples of each market's usual move) with the last stored day (GET /api/helix/diary?before=,
// which carries that day's close from the evening scorer and its morning movers), and yields short optional lines such as "Gold has moved more than twice its usual for a second day
// running". The planner says at most ONE of them (broadcastCore.js: with the lead mover it is about, else in the Markets segment). DESCRIPTION ONLY: what happened on two days, side by side.
import { spokenName } from './jarvisNames.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
const cap1 = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const DAY = 864e5;
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Calendar days from date a to date b (YYYY-MM-DD, UTC noon on both, so DST never matters). */
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);
const weekdayOf = d => WD[new Date(`${d}T12:00:00Z`).getUTCDay()];

/** The previous day's multiple per market: the scored close when there is one (ratio at the close), else that day's morning movers (vsUsual at the same hour). { KEY: { ratio, from } } */
export function prevRatios(prev) {
  const out = {}, rows = prev?.close?.rows;
  if (rows && typeof rows === 'object') for (const [k, r] of Object.entries(rows)) if (fin(r?.ratio)) out[k] = { ratio: r.ratio, from: 'close' };
  const mv = prev?.parts?.morning?.movers ?? prev?.movers ?? [];
  for (const m of Array.isArray(mv) ? mv : []) if (m?.key && fin(m.vsUsual) && !out[m.key]) out[m.key] = { ratio: m.vsUsual, from: 'morning' };
  return out;
}

/**
 * The day-on-day lines, best first: [{ kind, key, score, text }]. inp.movers: today's rows { key, ratio, oc } (biggest first); prev: the last stored day { date, close, parts }; today: YYYY-MM-DD.
 *   again     |ratio| >= 2 on both days: "for a second day running" (or "as on Friday" across a weekend / gap); same way or the other way named
 *   reversal  yesterday >= 2, today >= 1.2 the other way: "moving back against yesterday's big move"
 *   wakes     yesterday under half its usual, today >= 2: "was quiet yesterday"
 * Nothing when the last stored day is more than 4 calendar days back or there is no overlap.
 */
export function dayDeltas(inp, prev, today) {
  if (!prev?.date || !today) return [];
  const gap = daysBetween(prev.date, today); if (!(gap >= 1 && gap <= 4)) return [];
  const P = prevRatios(prev), when = gap === 1 ? 'yesterday' : `on ${weekdayOf(prev.date)}`, out = [];
  for (const m of inp?.movers ?? []) {
    if (!m?.key || !fin(m.ratio)) continue;
    const p = P[m.key]; if (!p) continue;
    const a = Math.abs(m.ratio), b = Math.abs(p.ratio), same = Math.sign(m.ratio) === Math.sign(p.ratio), name = cap1(spokenName(m.key));
    if (a >= 2 && b >= 2) {
      const run = gap === 1 ? 'for a second day running' : `again, as it did ${when}`, way = same ? 'the same way' : 'the other way this time';
      out.push({ kind: 'again', key: m.key, score: 3 + Math.min(a, 6) / 6, text: `${name} has moved more than twice its usual ${run}, ${way}.` });
    } else if (b >= 2 && a >= 1.2 && !same) {
      out.push({ kind: 'reversal', key: m.key, score: 2 + Math.min(a, 6) / 6, text: `${name} is moving back against ${gap === 1 ? "yesterday's" : `${weekdayOf(prev.date)}'s`} big move, which ran more than twice its usual.` });
    } else if (b < 0.5 && a >= 2) {
      out.push({ kind: 'wakes', key: m.key, score: 1 + Math.min(a, 6) / 6, text: `${name} was quiet ${when}, under half its usual move; today it has moved more than twice its usual.` });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}
/** Today's London date (YYYY-MM-DD); once per broadcast, never in a loop. */
export const londonToday = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
/** The one line the planner may say (or null). */
export const dayDelta = (inp, prev, today) => dayDeltas(inp, prev, today)[0] ?? null;
