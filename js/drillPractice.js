/**
 * Practice mode for the reading drill — volume, as opposed to the one-a-day.
 *
 * WHY THIS IS A SEPARATE FILE FROM js/learnState.js, AND MUST STAY ONE.
 *
 * The drill on today.html is a SPACED-REPETITION schedule: one question, chosen by
 * what is due, and `nextTopic` deliberately returns null when nothing is. That refusal
 * is the feature — it is what makes "I got it right" mean something, because you were
 * asked at the edge of forgetting rather than five minutes after reading the answer.
 *
 * Practice is the opposite thing and wants the opposite rules: unlimited questions, on
 * demand, whichever concept you feel weakest on. Both are worth having. What is NOT
 * worth having is one writing into the other's record — a fifty-question practice run
 * folded into the spaced schedule would mark every concept freshly seen and silence the
 * daily question for a month, which is precisely the loop the daily one exists to keep
 * open. So this module knows nothing about learnState, stores under its own key, and
 * the separation is asserted in the tests rather than left to whoever edits next.
 *
 * WHAT IT ADDS ON TOP OF js/marketDrill.js, which already does the hard part (2,884
 * distinct questions out of ~1,580 days of real board history):
 *
 *   BALANCE. Seeding buildQuestion at random is NOT an even spread. Measured over 1,500
 *   seeds: rates 567, gold 406, inflation 216, macro 164, the chain 75, risk 72 — the
 *   most-served concept arrives eight times as often as the least. Left alone, an
 *   evening's practice is mostly one idea. So the CONCEPT is chosen first, by what you
 *   have seen least, and the question is built to order.
 *
 *   NO REPEATS. Within a session you never see the same question id twice.
 *
 *   A THIN CONCEPT DOES NOT STALL THE SESSION. Not every generator can build on every
 *   bundle. When the rotation is balancing it skips one that cannot and moves on; when
 *   the caller has PINNED a concept it returns nothing and says which. Those two have to
 *   behave differently, and conflating them either dead-ends the page or silently answers
 *   a question nobody asked.
 *
 *   WEAKNESS-FIRST. Once a concept has a real sample, ties break toward the one you are
 *   worst at, not the one you have merely seen least.
 *
 * Pure: no fetch, no DOM, no clock, no storage. The caller persists what it gets back.
 * Tested in js/drillPractice.test.mjs.
 */

/** Its own key. Sharing `learn_state_v1` would corrupt the daily schedule. */
export const PRACTICE_KEY = 'drill_practice_v1';

/** A concept needs this many answers before its accuracy is allowed to steer anything. */
export const MIN_FOR_WEAKNESS = 4;

/** Seeds to try before giving up on finding an unseen question. */
const MAX_TRIES = 60;

export function blankSession(at = 0) {
  return { startedAt: at, cursor: 1, seen: [], history: [], byConcept: {} };
}

const rec = (s, c) => ({ n: 0, right: 0, ...(s?.byConcept?.[c] ?? {}) });

/**
 * Which concept to ask next.
 *
 * Least-seen first, because an even spread is the whole point. Among concepts tied on
 * count, prefer the one with the worst accuracy — but only once it has MIN_FOR_WEAKNESS
 * answers behind it, since one unlucky miss is not a weakness and chasing it would
 * hand you the same idea over and over.
 */
export function orderConcepts(session, concepts) {
  const list = (concepts ?? []).filter(Boolean);
  return list
    .map((c, i) => { const r = rec(session, c); return { c, i, n: r.n, acc: r.n >= MIN_FOR_WEAKNESS ? r.right / r.n : 1 }; })
    .sort((a, b) => a.n - b.n || a.acc - b.acc || a.i - b.i)
    .map(x => x.c);
}

/** The single best next concept — the head of that order. */
export function pickConcept(session, concepts) {
  return orderConcepts(session, concepts)[0] ?? null;
}

/**
 * The next question, avoiding anything this session has already asked.
 *
 * `build` is marketDrill.buildQuestion, injected so this file stays pure and the tests
 * can drive it with a stub. `concept` pins one idea (the focus mode); leaving it null
 * lets pickConcept balance the rotation.
 *
 * Returns { q, session } — or q: null when the bundle genuinely cannot produce an
 * unseen question, which the caller must report rather than showing a blank card.
 */
export function nextQuestion(bundle, session, { build, concept = null, concepts = [] } = {}) {
  if (typeof build !== 'function') throw new TypeError('nextQuestion needs a build function');
  const s = { ...blankSession(), ...(session ?? {}) };
  const seen = new Set(s.seen);
  // A PINNED concept is a promise: focus mode must return that idea or nothing, never a
  // substitute. A BALANCED request is the opposite — it asks for the best next question,
  // so a concept this bundle cannot currently build is skipped rather than dead-ending
  // the session. Getting this backwards stalls the page on one thin generator while
  // thousands of questions sit available behind it.
  const order = concept ? [concept] : orderConcepts(s, concepts);
  if (!order.length) return { q: null, session: s, exhausted: null };
  let cursor = s.cursor;
  for (const want of order) {
    for (let k = 0; k < MAX_TRIES; k++) {
      const q = build(bundle, { seed: cursor + k, only: [want] });
      if (q && !seen.has(q.id)) return { q, session: { ...s, cursor: cursor + k + 1 } };
    }
    cursor += MAX_TRIES;      // that concept is spent; the next one starts past its seeds
  }
  return { q: null, session: { ...s, cursor }, exhausted: concept ?? order.join(',') };
}

/** Fold one answer in. `q.gen` is the concept id; `q.topic` is the coarser grouping. */
export function fold(session, q, chosen, at = 0) {
  const s = { ...blankSession(), ...(session ?? {}) };
  if (!q?.id) return s;
  const correct = chosen === q.answer;
  const c = q.gen;
  const prev = rec(s, c);
  return { ...s,
    seen: s.seen.includes(q.id) ? s.seen : [...s.seen, q.id],
    history: [...s.history, { id: q.id, concept: c, topic: q.topic, date: q.date, chosen, answer: q.answer, correct, at }],
    byConcept: { ...s.byConcept, [c]: { n: prev.n + 1, right: prev.right + (correct ? 1 : 0) } } };
}

/** Session scoreboard. `weakest` stays null until some concept has a real sample. */
export function stats(session) {
  const h = session?.history ?? [];
  const right = h.filter(x => x.correct).length;
  let streak = 0, best = 0;
  for (const x of h) { if (x.correct) { streak++; best = Math.max(best, streak); } else streak = 0; }
  const proven = Object.entries(session?.byConcept ?? {}).filter(([, v]) => v.n >= MIN_FOR_WEAKNESS);
  const weakest = proven.length
    ? proven.map(([c, v]) => ({ concept: c, ...v, acc: v.right / v.n })).sort((a, b) => a.acc - b.acc)[0]
    : null;
  return { n: h.length, right, pct: h.length ? right / h.length : null, streak, best, weakest,
           covered: Object.keys(session?.byConcept ?? {}).length };
}
