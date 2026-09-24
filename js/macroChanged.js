/**
 * Which line of the macro picture is the one that is NEW today.
 *
 * The panel reads as static and the reason is structural, not a bug. Measured over 250
 * sessions, each thread holds its verdict for 4 to 7 sessions:
 *
 *   rates & the dollar   every 4     the market mood    every 4
 *   real yields & gold   every 5     credit spreads     every 6
 *   oil                  every 6     the yield curve    every 7
 *
 * So across six threads roughly ONE changes its word per day, and five say exactly what
 * they said yesterday. That is correct — the verdicts are driven by the sign of a
 * 20-session change, which moves by a twentieth a day, and the explanatory prose around
 * them is fixed because it is the teaching half. What was missing is any way to see
 * WHICH of the six is the one that moved, without reading all six and remembering
 * yesterday.
 *
 * NO NEW PRINT IS NOT "UNCHANGED". The macro series come from FRED and settle one to
 * three sessions behind, so on plenty of days the number is identical because nothing
 * was published, not because nothing happened. Those two are reported separately and
 * conflating them is the same failure as a board header claiming one date for series
 * with six days between their vintages.
 *
 * Pure: no fetch, no DOM. Tested in js/macroChanged.test.mjs.
 */

/**
 * The floors, copied from the panel's own `trend()` calls so the two cannot drift.
 * Below the floor the panel says "steady", and so does this.
 */
export const THREAD_FLOORS = {
  us10y:   { floor: 8,  label: 'Interest rates & the dollar' },
  tips:    { floor: 8,  label: 'Real yields & gold' },
  hy:      { floor: 15, label: 'Credit spreads' },
  vix:     { floor: 3,  label: 'The market mood' },
  us2s10s: { floor: 8,  label: 'The yield curve' },
  oil:     { floor: 3,  label: 'Oil' },
};

/** The word the panel would print for one series, from its 20-session change. */
export function verdictOf(d20, floor) {
  if (!Number.isFinite(d20)) return null;
  return Math.abs(d20) < floor ? 'steady' : d20 > 0 ? 'rising' : 'falling';
}

/** Every thread's verdict, from a macro-changes style row list. */
export function verdicts(rows = []) {
  const by = new Map((Array.isArray(rows) ? rows : []).map(r => [r.key, r]));
  const out = {};
  for (const [key, { floor }] of Object.entries(THREAD_FLOORS)) {
    const r = by.get(key);
    const d20 = r?.deltas?.[20] ?? r?.d20;
    out[key] = { verdict: verdictOf(d20, floor), d20: Number.isFinite(d20) ? d20 : null, lastDate: r?.lastDate ?? null };
  }
  return out;
}

/**
 * What changed since the last stored day.
 *
 * `changed` is a thread whose WORD is different — the thing a reader would notice.
 * `noNewPrint` is a thread whose series has not published since, which is why its
 * number is identical; saying "unchanged" there would be claiming a measurement that
 * was never taken.
 */
export function whatChangedToday(todayRows = [], priorRows = null, priorDay = null) {
  const now = verdicts(todayRows);
  if (!priorRows) return { ok: false, reason: 'no earlier day stored to compare with', changed: [], held: [], noNewPrint: [] };
  const was = verdicts(priorRows);
  const changed = [], held = [], noNewPrint = [];
  for (const [key, { label }] of Object.entries(THREAD_FLOORS)) {
    const a = was[key]?.verdict, b = now[key]?.verdict;
    if (b == null) continue;
    // A series with no new print can STILL change its word, because the 20-session
    // window slides: the value dropping off the back moves even when the front does
    // not. Suppressing that would hide a real change in what the panel says, so the
    // change is reported and its CAUSE is named instead.
    const newPrint = !(now[key].lastDate && now[key].lastDate === was[key]?.lastDate);
    if (!newPrint) noNewPrint.push({ key, label, verdict: b, lastDate: now[key].lastDate });
    if (a != null && a !== b) changed.push({ key, label, from: a, to: b, d20: now[key].d20, newPrint });
    else held.push({ key, label, verdict: b, newPrint });
  }
  return { ok: true, priorDay, changed, held, noNewPrint, n: Object.keys(THREAD_FLOORS).length };
}

/**
 * The line that goes at the top of the panel.
 *
 * When nothing changed it says so plainly rather than going quiet — "five of six say
 * what they said yesterday" is the useful sentence on a slow day, and it is the honest
 * answer most days, because a 20-session verdict is supposed to be slow.
 */
export function changedLine(res) {
  if (!res?.ok) return res?.reason ?? '';
  const bits = [];
  if (res.changed.length) {
    bits.push(res.changed.map(c => `<b>${c.label}</b> went from ${c.from} to <b>${c.to}</b>${c.newPrint ? '' : ' <span class="muted">(on the window sliding, not a new print)</span>'}`).join('; '));
  } else {
    bits.push(`No thread changed its reading${res.priorDay ? ` since ${res.priorDay}` : ''}`);
  }
  if (res.noNewPrint.length) {
    bits.push(`${res.noNewPrint.length} of ${res.n} ${res.noNewPrint.length === 1 ? 'series has' : 'series have'} not published since (${res.noNewPrint.map(x => x.label).join(', ')}) — a number that has not moved there means nothing new printed, not that nothing happened`);
  }
  return bits.join('. ') + '.';
}
