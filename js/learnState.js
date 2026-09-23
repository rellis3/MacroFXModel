/**
 * What you know, and what to ask you next.
 *
 * THE PROBLEM THIS SOLVES. Every other part of this page explains at the moment you
 * look at it, and then forgets you. A beginner and someone who has read it for six
 * months see identical content at identical depth, forever. That is a reference work,
 * not a teacher.
 *
 * WHAT ACTUALLY MAKES THINGS STICK, and these are the two findings in learning
 * research robust enough to build on:
 *
 *   RETRIEVAL PRACTICE — answering from memory beats re-reading, by a wide margin and
 *   in nearly every study that has looked. Re-reading FEELS like learning because the
 *   text is familiar; the familiarity is the illusion. So the page asks rather than
 *   tells, and it makes you commit before it reveals.
 *
 *   SPACING — a concept recalled at widening intervals is retained; the same concept
 *   drilled five times in one sitting is not. So each concept carries its own next-due
 *   date, and the intervals stretch as you get it right.
 *
 * WHAT MAKES THIS DIFFERENT FROM A FLASHCARD APP. The questions are built from TODAY'S
 * BOARD. You are not memorising that rising real yields hurt gold; you are being shown
 * that real yields did +24bp and gold did -6.4% and asked what that combination means.
 * That is the transfer that matters, and it is only possible because the numbers are
 * already here.
 *
 * WHAT THIS IS NOT. Not a claim that answering questions makes anyone a good trader.
 * It makes the READINGS automatic, which is a prerequisite and nothing more. Nothing
 * in this file is a tested claim of this desk, and it is not in the evidence book.
 *
 * Pure: no storage, no DOM. The caller persists the returned state. Tested in
 * js/learnState.test.mjs.
 */

/** Concepts, keyed by the drill generator that tests them. */
export const CONCEPTS = {
  'yield-split': { label: 'Real yields vs inflation', why: 'A nominal yield is a real yield plus expected inflation. Splitting it is the single most useful thing you can do with a bond move, because the two halves mean opposite things for gold and for the currency.' },
  'curve-led': { label: 'The curve and banks', why: 'Banks borrow short and lend long, so the gap between the two IS their margin. This is the most reliable rates-to-equity mechanism there is.' },
  'oil-breakevens': { label: 'Oil into inflation pricing', why: 'Crude feeds headline inflation, so the bond market usually reprices with it. When it does not, the market is calling the oil move a supply story.' },
  'which-gold': { label: 'Which gold is trading', why: 'Gold is four different trades wearing one name — rates, dollar, reserve demand, fear. Knowing which one is moving is the difference between a view and a guess.' },
  'credit-confirms': { label: 'Credit as the earlier vote', why: 'Lenders price the odds of not being repaid, which is a harder question than what a share is worth. Credit usually moves first.' },
  'dollar-link': { label: 'The dollar as the unit', why: 'Everything is priced in something. When the unit itself moves, half the board moves with it for no reason of its own.' },
  'regime-quad': { label: 'Growth and inflation together', why: 'Two axes, four quadrants. Almost every macro asset can be placed by what it wants growth and inflation to do.' },
};

// Widening intervals, in days. A concept you keep getting right stops interrupting.
export const INTERVALS = [1, 2, 4, 8, 16, 32, 64];
const DAY = 864e5;
const clamp01 = v => Math.max(0, Math.min(1, v));

/** A fresh, empty record for a topic. */
const blank = () => ({ seen: 0, right: 0, streak: 0, step: 0, mastery: 0, lastAt: null, dueAt: 0 });

/** Read one topic's record, defaulting cleanly. */
export function recordFor(state, topic) {
  return { ...blank(), ...(state?.topics?.[topic] ?? {}) };
}

/**
 * Fold one answer into the state.
 *
 * Mastery is an exponentially weighted average of correctness rather than a raw
 * percentage, so recent answers count for more — someone who understood this in March
 * and has got it wrong three times since does not "know" it, whatever their lifetime
 * average says.
 *
 * A wrong answer resets the interval to the start but only HALVES mastery. Dropping it
 * to zero would make one slip erase months, which is both wrong and discouraging.
 */
export function answer(state, topic, correct, at = Date.now()) {
  const r = recordFor(state, topic);
  const seen = r.seen + 1;
  const right = r.right + (correct ? 1 : 0);
  const streak = correct ? r.streak + 1 : 0;
  const step = correct ? Math.min(r.step + 1, INTERVALS.length - 1) : 0;
  const mastery = correct ? clamp01(r.mastery + (1 - r.mastery) * 0.4) : clamp01(r.mastery * 0.5);
  return {
    ...state,
    topics: { ...(state?.topics ?? {}), [topic]: { seen, right, streak, step, mastery: +mastery.toFixed(3), lastAt: at, dueAt: at + INTERVALS[step] * DAY } },
    history: [...(state?.history ?? []), { topic, correct, at }].slice(-400),
  };
}

/** Topics whose next-due date has passed. Unseen topics are due immediately. */
export function due(state, available = Object.keys(CONCEPTS), at = Date.now()) {
  return available.filter(t => recordFor(state, t).dueAt <= at);
}

/**
 * What to ask next.
 *
 * Due first, weakest of those first; never the topic just asked, unless it is the only
 * one left. When nothing is due the answer is NULL — a learner who is up to date should
 * be told so, not handed filler. That restraint is what makes the prompt worth reading
 * when it does appear.
 */
export function nextTopic(state, available = Object.keys(CONCEPTS), at = Date.now()) {
  const pool = available.filter(t => CONCEPTS[t]);
  if (!pool.length) return null;
  const last = state?.history?.at(-1)?.topic ?? null;
  let d = due(state, pool, at);
  if (!d.length) return null;
  if (d.length > 1 && last) d = d.filter(t => t !== last);
  return d.sort((a, b) => {
    const ra = recordFor(state, a), rb = recordFor(state, b);
    if (ra.seen === 0 && rb.seen > 0) return -1;      // never-seen first: it is new material
    if (rb.seen === 0 && ra.seen > 0) return 1;
    return ra.mastery - rb.mastery || ra.dueAt - rb.dueAt;
  })[0];
}

/** Where you are, overall. */
export function progress(state, available = Object.keys(CONCEPTS), at = Date.now()) {
  const rows = available.filter(t => CONCEPTS[t]).map(t => ({ topic: t, label: CONCEPTS[t].label, ...recordFor(state, t) }));
  const seen = rows.filter(r => r.seen > 0);
  const solid = rows.filter(r => r.mastery >= 0.7);
  const shaky = seen.filter(r => r.mastery < 0.4);
  const answers = (state?.history ?? []).length;
  return {
    rows: rows.sort((a, b) => b.mastery - a.mastery),
    total: rows.length, started: seen.length, solid: solid.length, shaky: shaky.length,
    dueNow: due(state, available, at).length, answers,
    // the honest headline: how much of the map you have actually demonstrated
    coverage: rows.length ? +(solid.length / rows.length).toFixed(2) : 0,
    weakest: shaky.sort((a, b) => a.mastery - b.mastery)[0] ?? null,
  };
}

/** Terms you have demonstrated you know, so the page can stop defining them. */
export function known(state, threshold = 0.7) {
  return Object.keys(CONCEPTS).filter(t => recordFor(state, t).mastery >= threshold);
}
