/**
 * Question of the day / Question of the week, drawn from the desk's own education (js/questionBank.js, every answer backed by a quote from the lesson it
 * came from). The newsletter shows today's question with its clue and, underneath, YESTERDAY's answer, so a reader has a day to think before the answer
 * appears (a week for the weekly edition). Nothing here asks which way a market will go.
 *
 * The order is a fixed shuffle of the bank (a hash of each id), so the same date always gives the same question, no question repeats until the whole bank
 * has been used, and the choice needs no stored state. Weekly picks use only the harder questions when there are enough of them.
 *
 * Pure: no clock (the caller passes the issue date 'YYYY-MM-DD'). Tested in js/questionOfDay.test.mjs.
 */
const DAY = 864e5;
const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const dayNo = d => Math.floor(Date.parse(d + 'T00:00:00Z') / DAY);

function ordered(bank, weekly) {
  let pool = bank.slice();
  if (weekly) { const hard = pool.filter(q => q.level >= 2); if (hard.length >= 8) pool = hard; }
  return pool.sort((a, b) => hash(a.id) - hash(b.id) || (a.id < b.id ? -1 : 1));
}

/** The question for an issue date, and the answer to the previous one. null when the bank is empty or the date is not valid. */
export function questionFor(bank, date, { weekly = false } = {}) {
  if (!Array.isArray(bank) || !bank.length || !Number.isFinite(dayNo(date))) return null;
  const pool = ordered(bank, weekly), step = weekly ? 7 : 1, i = Math.floor(dayNo(date) / step), n = pool.length;
  const pick = k => pool[((k % n) + n) % n];
  return { today: pick(i), previous: n > 1 ? pick(i - 1) : null, weekly };
}
