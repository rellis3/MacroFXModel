// js/fedPathZq.js — per-FOMC-meeting probabilities from fed funds futures.
//
// WHAT THIS IS FOR. rates.html has shown a 2-year-minus-policy PROXY since it was
// built and says so in its own note ("a proper implied path needs fed funds futures,
// which have no free feed this desk trusts"); fed-path.html stamps "window, not
// meeting" on every surface because the Atlanta Fed series prices a 3-month AVERAGE
// over a forward window rather than a decision. This is the real calculation, and it
// is the one CME FedWatch publishes.
//
// THE ARITHMETIC, which is all it is. ZQ settles to the AVERAGE effective fed funds
// rate over its contract month, so implied rate = 100 − price. For a month holding a
// meeting on day d of n:
//
//     impliedAvg = (daysBefore · rBefore + daysAfter · rAfter) / n
//  ⇒  rAfter     = rBefore + (impliedAvg − rBefore) · n / daysAfter
//
// and the priced move is rAfter − rBefore, read against a 25bp step.
//
// WHY THE CHAIN MATTERS. rBefore is not "today's rate" for anything past the first
// meeting — it is whatever the previous meeting left behind. So the months are walked
// IN ORDER, carrying the rate forward. A month with NO meeting is the clean anchor:
// its implied average IS the prevailing rate for that whole month, which re-grounds
// the chain and stops one noisy contract propagating forward for ever.
//
// WHAT IT CANNOT DO, stated here so a caller never has to guess:
//   · TWO MEETINGS IN ONE MONTH are not separable from one contract. The pair is
//     reported as a single combined move for that month, flagged `combined`.
//   · The effective date is taken as the day AFTER the decision, which is the
//     convention; an inter-meeting move or an unusual effective date breaks it.
//   · A contract nobody trades gives a stale price and therefore a stale probability.
//     Liquidity is the caller's problem and `volumeHint` exists to carry it — ZQ
//     median 15-min volume ran 37, 35, 14 then 1, 1, 0, 0 across twelve months on
//     2026-10-08, so the back half of any pull is decoration.
//
// Pure: values in, plain objects out. No fetch, no DOM.

/** Days in a calendar month from 'YYYY-MM'. */
export function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 'YYYY-MM' of a 'YYYY-MM-DD'. */
const ymOf = d => String(d).slice(0, 7);

/**
 * Per-meeting priced moves.
 *
 * @param {Array<{ym:string, implied:number, volumeHint?:number}>} contracts
 *        one per consecutive month, implied rate in PERCENT, ascending by ym
 * @param {string[]} meetings  'YYYY-MM-DD' decision dates
 * @param {object} [opts]
 * @param {number} [opts.stepBp=25]  the assumed move size
 */
export function meetingProbabilities(contracts, meetings, { stepBp = 25 } = {}) {
  const byYm = new Map();
  for (const c of contracts ?? []) if (c?.ym && Number.isFinite(c.implied)) byYm.set(c.ym, c);
  const months = [...byYm.keys()].sort();
  if (!months.length) return { rows: [], anchored: null, note: 'no contracts' };

  // meetings grouped by month, in date order
  const mtgByYm = new Map();
  for (const d of (meetings ?? []).slice().sort()) {
    const k = ymOf(d);
    if (!mtgByYm.has(k)) mtgByYm.set(k, []);
    mtgByYm.get(k).push(d);
  }

  // The chain starts at the first month's implied rate. If that month holds a meeting
  // its average is already contaminated, so the first CLEAN month (no meeting) is
  // preferred as the anchor and the walk starts there.
  let startIdx = months.findIndex(m => !mtgByYm.has(m));
  if (startIdx < 0) startIdx = 0;
  const anchored = months[startIdx];
  let rCurrent = byYm.get(anchored).implied;

  const rows = [];

  // BACKWARD first. The anchor is the first month with no meeting, so any meeting
  // BEFORE it would simply be skipped -- and that is usually the NEAREST one, the
  // meeting anyone actually cares about. Same identity, solved the other way:
  //     impliedAvg = (daysBefore·rBefore + daysAfter·rAfter) / n
  //  ⇒  rBefore    = (impliedAvg·n − daysAfter·rAfter) / daysBefore
  // where rAfter is the rate the chain already knows from the clean month ahead.
  {
    let rAhead = rCurrent;
    for (let i = startIdx - 1; i >= 0; i--) {
      const ym = months[i];
      const c = byYm.get(ym);
      const mtgs = mtgByYm.get(ym);
      if (!mtgs) { rAhead = c.implied; continue; }
      const n = daysInMonth(ym);
      const effDay = Number(String(mtgs[0]).slice(8, 10)) + 1;
      const daysAfter = Math.max(1, n - effDay + 1);
      const daysBefore = Math.max(1, n - daysAfter);
      const rBefore = (c.implied * n - daysAfter * rAhead) / daysBefore;
      const moveBp = (rAhead - rBefore) * 100;
      rows.push({
        meeting: mtgs[0], ym, combined: mtgs.length > 1 ? mtgs : null,
        rBefore: +rBefore.toFixed(4), rAfter: +rAhead.toFixed(4),
        moveBp: +moveBp.toFixed(2), probPct: +((moveBp / stepBp) * 100).toFixed(1),
        direction: moveBp > 0 ? 'hike' : moveBp < 0 ? 'cut' : 'hold',
        volumeHint: c.volumeHint ?? null,
        thin: c.volumeHint != null && c.volumeHint < 5,
        solvedBackwards: true,
      });
      rAhead = rBefore;
    }
    rows.reverse();   // back into date order before the forward walk appends
  }

  for (let i = startIdx; i < months.length; i++) {
    const ym = months[i];
    const c = byYm.get(ym);
    const mtgs = mtgByYm.get(ym);
    if (!mtgs) { rCurrent = c.implied; continue; }   // no meeting: the month IS the rate

    const n = daysInMonth(ym);
    // effective the day AFTER the decision
    const dayOf = d => Number(String(d).slice(8, 10));
    const effDay = dayOf(mtgs[0]) + 1;
    const daysAfter = Math.max(1, n - effDay + 1);
    const rAfter = rCurrent + (c.implied - rCurrent) * (n / daysAfter);
    const moveBp = (rAfter - rCurrent) * 100;
    rows.push({
      meeting: mtgs[0],
      ym,
      combined: mtgs.length > 1 ? mtgs : null,
      rBefore: +rCurrent.toFixed(4),
      rAfter: +rAfter.toFixed(4),
      moveBp: +moveBp.toFixed(2),
      // A probability only in the one-move-of-one-size sense FedWatch uses: the
      // priced move as a fraction of a step. Above 100 means more than one step is
      // priced, which is a real answer and not an error.
      probPct: +((moveBp / stepBp) * 100).toFixed(1),
      direction: moveBp > 0 ? 'hike' : moveBp < 0 ? 'cut' : 'hold',
      volumeHint: c.volumeHint ?? null,
      thin: c.volumeHint != null && c.volumeHint < 5,
    });
    rCurrent = rAfter;
  }
  return { rows, anchored, stepBp, note: rows.length ? null : 'no meetings inside the contract months' };
}

/** Cumulative priced change from the anchor, in bp, after each meeting. */
export function cumulativePath(result) {
  if (!result?.rows?.length) return [];
  const base = result.rows[0].rBefore;
  return result.rows.map(r => ({ meeting: r.meeting, rate: r.rAfter,
                                 cumBp: +(((r.rAfter - base) * 100)).toFixed(2) }));
}
