/**
 * How the desk's scores are shown, in one place (owner-approved fix, 2026-11-04).
 *
 * THE PROBLEM. The terminal and the newsletters put the desk's −2..+2 views on a 0–10 scale with 5 as "no view", so a
 * strong short at high conviction read "A+" beside "0.0/10": best grade, zero score. And a missing bias became 5.0,
 * which looks exactly like a neutral ruling.
 *
 * THE CONVENTION (used everywhere a currency or asset score appears: the terminal's rings, Assets tiles, Pair tab,
 * modals, playbook cards and hero map, the terminal newsletter edition and the pictograph):
 *   score   −5 … +5, signed. The sign is the direction (+ long / bullish, − short / bearish); the size is the view's
 *           strength times its conviction. 0 is "no view". Always shown with an arrow and a word:
 *           "▼ −5.0 · strong short", "▲ +2.5 · bullish".
 *   asset   2.5 × direction (−2..+2) × conviction (low 0.6, medium 0.8, high 1).
 *   ccy     2.5 × bias (−2..+2).
 *   missing null, shown as "–" / "no data", never as 0: an unknown rating or conviction, or a bias that is absent
 *           (NOK and SEK are traded, not debated, so they have none).
 *   grade   the card's conviction grade (A+ … B), always labelled "A+ conviction": it grades how strong and sure the
 *           view is, not how often such views come off, and not which way it points.
 *
 * desk-terminal.html is a classic script and mirrors these few lines between its SCORE-DISPLAY markers; a test
 * (js/scoreDisplay.test.mjs) runs the page's copy against this module so the two cannot drift.
 * Pure: no DOM, no fetch.
 */

export const DIR = { STRONG_LONG: 2, LONG: 1, FLAT: 0, NEUTRAL: 0, SHORT: -1, STRONG_SHORT: -2 };
export const CONV = { low: 0.6, medium: 0.8, high: 1 };
export const SCORE_MAX = 5;
export const SCALE_NOTE = 'Scores run −5 to +5: the sign is the direction (+ long or bullish, − short or bearish), the size is strength × conviction, 0 is no view and – is no data.';
export const GRADE_NOTE = 'The grade is the card\'s conviction (A+ = strong view, high conviction), not a hit rate and not a direction.';

const num = v => (v == null || v === '' || typeof v === 'boolean' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** A card's signed score, or null when its rating or (for a directional card) its conviction is unknown. */
export function assetScore(c) {
  if (!c || !Object.prototype.hasOwnProperty.call(DIR, c.rating)) return null;
  const d = DIR[c.rating]; if (!d) return 0;
  const k = CONV[c.conviction]; if (k == null) return null;
  return +(2.5 * d * k).toFixed(1);
}
/** A currency's signed score from its −2..+2 bias, or null when there is no bias. */
export function ccyScore(bias) {
  const b = num(bias); if (b == null) return null;
  return +(2.5 * Math.max(-2, Math.min(2, b))).toFixed(1);
}
/** The bias itself, or null when absent (never 0 for "missing"). */
export const biasOf = v => num(v?.bias);

/** "strong short", "long", "no view" for a card. */
export function assetWord(c) {
  if (!c || !Object.prototype.hasOwnProperty.call(DIR, c.rating)) return 'no data';
  const d = DIR[c.rating];
  return d === 2 ? 'strong long' : d === 1 ? 'long' : d === -1 ? 'short' : d === -2 ? 'strong short' : 'no view';
}
/** "strongly bullish" … "strongly bearish" for a bias; "no data" when there is none. */
export function ccyWord(bias) {
  const b = num(bias); if (b == null) return 'no data';
  return b >= 2 ? 'strongly bullish' : b > 0 ? 'bullish' : b <= -2 ? 'strongly bearish' : b < 0 ? 'bearish' : 'neutral';
}
/** The arrow and the signed number: "▲ +2.5", "▼ −5.0", "● 0.0", "–". */
export function fmtScore(s) {
  if (s == null || !Number.isFinite(s)) return '–';
  return s > 0 ? `▲ +${s.toFixed(1)}` : s < 0 ? `▼ −${Math.abs(s).toFixed(1)}` : '● 0.0';
}
/** The number alone, signed with a true minus: "+2.5", "−5.0", "0.0", "–". */
export const signed = s => (s == null || !Number.isFinite(s) ? '–' : s > 0 ? `+${s.toFixed(1)}` : s < 0 ? `−${Math.abs(s).toFixed(1)}` : '0.0');
/** "▼ −5.0 · strong short"; "no data" when the score is missing. */
export const scoreText = (s, word) => (s == null || !Number.isFinite(s) ? 'no data' : `${fmtScore(s)} · ${word}`);
export const assetText = c => scoreText(assetScore(c), assetWord(c));
export const ccyText = bias => scoreText(ccyScore(bias), ccyWord(bias));
/** How full a ring or bar is: |score| / 5, 0 for missing. */
export const fill = s => (s == null || !Number.isFinite(s) ? 0 : Math.min(1, Math.abs(s) / SCORE_MAX));
/** −1, 0, +1 for colouring; null for missing. */
export const tone = s => (s == null || !Number.isFinite(s) ? null : s > 0.2 ? 1 : s < -0.2 ? -1 : 0);

/** The card's conviction grade: A+, A, A-, B+, B, or null for a flat or unsized card. */
export function grade(c) {
  const d = Math.abs(DIR[c?.rating] ?? 0); if (!d || !(c.size > 0)) return null;
  return d === 2 && c.conviction === 'high' ? 'A+' : c.conviction === 'high' ? 'A' : c.conviction === 'medium' ? (d === 2 ? 'A-' : 'B+') : 'B';
}
/** "A+ conviction", or null. */
export const gradeLabel = c => { const g = grade(c); return g ? `${g} conviction` : null; };
