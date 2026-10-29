/**
 * The newsletter's opening, written by the intelligence brief at the moment it is generated, and the checks that stand between the model's words and the page.
 *
 * Two jobs, both pure:
 *   checkOpening(opening, facts)  server side, once, when the brief is made. Keeps { headline, lede } only if it is the right size, predicts and advises nothing
 *                                 (the same test the market reads pass) and every figure in it can be found in the facts the model was given. Otherwise null and a reason.
 *   briefOpening(n)               client side, each build. Returns the saved opening only when the brief was written on the same UK day as the issue, with the time it was written.
 * Anything else falls back to the rule-built opening, so the daily never goes out without one.
 *
 * Tested in js/openingCheck.test.mjs.
 */
import { readIsSafe } from './newsletterRecord.js';

const TZ = 'Europe/London';
const ukDay = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ });
const ukTime = ms => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const NUM = /(\d[\d,]*(?:\.\d+)?)(\s*(?:%|bp|bps|pts|points|pp|basis points)(?![a-z]))?/gi;

/** Every number in the facts, as floats. */
function factNumbers(facts) {
  const out = [];
  for (const m of String(facts ?? '').matchAll(/\d[\d,]*(?:\.\d+)?/g)) { const v = parseFloat(m[0].replace(/,/g, '')); if (Number.isFinite(v)) out.push(v); }
  return out;
}

/** The figures in a piece of text that must be traceable: anything with a unit, a decimal point, or three or more digits. Times, dates and years are left alone. */
function claims(text) {
  const out = [], s = String(text ?? '');
  for (const m of s.matchAll(NUM)) {
    const raw = m[1].replace(/,/g, ''), unit = (m[2] ?? '').trim().toLowerCase(), end = m.index + m[0].length, before = s[m.index - 1] ?? '', after = s.slice(end, end + 8);
    if (/^:\d\d/.test(s.slice(end, end + 3)) || before === ':') continue;                  // a time, 13:15
    if (!unit && /^\d{4}$/.test(raw) && /^(19|20)/.test(raw)) continue;                    // a year
    if (!unit && !raw.includes('.') && raw.length < 3) continue;                           // a small whole number: a count, a date, "10-year"
    if (/^-?(year|day|week|month)/i.test(after.trim())) continue;
    out.push({ v: parseFloat(raw), dp: (raw.split('.')[1] ?? '').length, unit });
  }
  return out;
}

/** True when the number can be found in the facts, allowing for the model rounding, and for a yield in percent being quoted in basis points. */
const found = (c, nums) => nums.some(f => Math.abs(f - c.v) <= 0.5 * 10 ** -c.dp + 1e-9 || (/^b/.test(c.unit) && Math.abs(f * 100 - c.v) <= 0.51) || (c.unit === '%' && c.dp === 0 && Math.abs(f - c.v) <= 0.51));

/** { ok: true, opening: { headline, lede } } or { ok: false, reason }. */
export function checkOpening(opening, facts) {
  const h = String(opening?.headline ?? '').replace(/\s+/g, ' ').trim(), l = String(opening?.lede ?? '').replace(/\s+/g, ' ').trim();
  if (!h || !l) return { ok: false, reason: 'missing' };
  if (h.length < 20 || h.length > 170) return { ok: false, reason: 'headline length' };
  if (l.length < 120 || l.length > 1200) return { ok: false, reason: 'lede length' };
  if (!readIsSafe(h) || !readIsSafe(l)) return { ok: false, reason: 'predicts or advises' };
  const nums = factNumbers(facts), lost = claims(`${h} ${l}`).filter(c => !found(c, nums));
  if (lost.length) return { ok: false, reason: `figures not in the data: ${lost.map(c => c.v + c.unit).join(', ')}` };
  return { ok: true, opening: { headline: h, lede: l } };
}

/** The saved opening for this issue, or null. n: { brief, generatedAt, nowMs }. Same UK day only: a brief from yesterday describes yesterday. */
export function briefOpening(n) {
  const o = n?.brief?.opening, at = Date.parse(n?.generatedAt ?? ''), now = Number.isFinite(n?.nowMs) ? n.nowMs : Date.now();
  if (!o?.headline || !o?.lede || !Number.isFinite(at) || ukDay(at) !== ukDay(now)) return null;
  if (!readIsSafe(o.headline) || !readIsSafe(o.lede)) return null;
  return { headline: String(o.headline), lede: String(o.lede), writtenAt: ukTime(at) };
}
