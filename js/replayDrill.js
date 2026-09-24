/**
 * Sequence recognition: walk a real past window forward and read it as it unfolds.
 *
 * The drill in js/marketDrill.js teaches SINGLE-MOMENT reading — "the 10-year moved
 * +16bp, of which real yields -1bp: what happened to the cost of money?" That is the
 * right first step and it is not what reading a market live actually is. Live, the
 * question is which STAGE of something you are in: a squeeze building, a squeeze
 * exhausting, a reversal under way. You cannot learn that from frozen frames, and you
 * cannot learn it from live markets either, because live hands you one clean example a
 * month.
 *
 * So: replay. Five sessions of a real past window, one step at a time, the board
 * recomputed as it stood at each. You name the state; then it tells you.
 *
 * BUILT ON TRANSITIONS, NOT ON BIG MOVES. The first version picked the existing
 * "episode" days — the biggest gold move, the largest fear spike — and the state was
 * IDENTICAL at all five steps of the first one tested. Five questions with the same
 * answer teach nothing and are guessable after the first. The informative thing is the
 * window where the reading CHANGES, which is the same conclusion the band ladder
 * reached about checkpoints: the state change is the event, the rest is time passing.
 * A run is only accepted if at least two distinct states appear in it.
 *
 * WHAT IT CANNOT BE. The replay is not point-in-time — FRED revises, so it sees today's
 * vintage of that history. It will teach the SHAPE of a regime and it must never be
 * presented as a track record; `pointInTime: false` rides on every run so a caller
 * cannot quietly forget.
 *
 * Pure: no fetch, no DOM. Tested in js/replayDrill.test.mjs.
 */

/** The six readings the live page uses, so what you learn here transfers to it. */
export const STATES = [
  'Rates are driving', 'Narrow and concentrated', 'Risk is being sold',
  'Broad risk appetite', 'Rotation without direction', 'Nothing much is happening',
];

/** Sessions back from the end of the window, oldest first. */
export const STEPS_BACK = [8, 6, 4, 2, 0];

/** The numbers a reader would actually look at, and nothing that names the answer. */
const EVIDENCE_KEYS = ['us2y', 'us10y', 'curve', 'hy', 'vix', 'vixterm', 'spx', 'nq', 'r2k', 'eqwt', 'dxy', 'gold', 'oil'];

const mulberry = seed => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * One step: the board as it stood, and the reading that was correct.
 *
 * `evidence` is the same set of numbers at every step, so the thing that changes
 * between steps is the market and not the question.
 */
function stepAt(bundle, i, { scanBoard, marketState }) {
  const board = scanBoard(bundle, i);
  if (!board || board.length < 20) return null;
  const st = marketState(bundle, board, i);
  const by = new Map(board.map(b => [b.key, b]));
  return {
    i, date: bundle.dates[i], answer: st.state,
    line: st.line ?? null, teach: st.teach ?? null,
    evidence: EVIDENCE_KEYS.map(k => by.get(k)).filter(Boolean)
      .map(r => ({ key: r.key, label: r.label, change: +r.change.toFixed(2), z: +r.z.toFixed(1), kind: r.kind })),
    breadth: st.breadth ? { sectorsUp: st.breadth.sectorsUp, sectorsTotal: st.breadth.sectorsTotal, concentration: st.breadth.concentration } : null,
  };
}

/**
 * Find a window worth replaying, and build it.
 *
 * Tries random end-points until one contains a real change of reading. Bounded, so a
 * bundle with no transitions returns null rather than spinning — and `null` is the
 * honest answer there, not a run with five identical answers.
 */
export function buildRun(bundle, { seed = 1, tries = 40, engine = null, requireChange = true } = {}) {
  const { scanBoard, marketState } = engine ?? {};
  const N = bundle?.dates?.length ?? 0;
  if (!scanBoard || !marketState || N < 500) return null;
  const rand = mulberry(seed);
  const span = Math.max(...STEPS_BACK);

  for (let t = 0; t < tries; t++) {
    const end = 420 + span + Math.floor(rand() * (N - 420 - span - 1));
    const steps = STEPS_BACK.map(b => stepAt(bundle, end - b, { scanBoard, marketState })).filter(Boolean);
    if (steps.length !== STEPS_BACK.length) continue;
    const distinct = new Set(steps.map(s => s.answer));
    if (requireChange && distinct.size < 2) continue;
    // which step is the one where the reading changed -- the thing worth catching
    const changedAt = steps.findIndex((s, k) => k > 0 && s.answer !== steps[k - 1].answer);
    return {
      ok: true, seed, from: steps[0].date, to: steps.at(-1).date,
      steps: steps.map((s, k) => ({ ...s, n: k + 1, changed: k > 0 && s.answer !== steps[k - 1].answer })),
      changedAt: changedAt >= 0 ? changedAt : null,
      distinct: distinct.size,
      // stated on every run so it cannot quietly become a track record: FRED revises,
      // so this is today's vintage of that history, not what was on the screen then
      pointInTime: false,
    };
  }
  return null;
}

/**
 * Score a completed run.
 *
 * `caughtChange` is the number that matters. Getting four steady steps right and
 * missing the turn is the failure mode this exists to surface, and an overall
 * "4 of 5" would hide it — so it is reported separately and never averaged in.
 */
export function scoreRun(run, picks = []) {
  if (!run?.ok) return { ok: false, reason: 'no run to score' };
  const rows = run.steps.map((s, k) => ({
    n: s.n, date: s.date, answer: s.answer, picked: picks[k] ?? null,
    right: picks[k] === s.answer, changed: s.changed,
  }));
  const answered = rows.filter(r => r.picked != null);
  const changeRow = rows.find(r => r.changed) ?? null;
  return {
    ok: true,
    right: answered.filter(r => r.right).length, n: answered.length,
    complete: answered.length === rows.length,
    caughtChange: changeRow ? changeRow.right : null,
    changeStep: changeRow?.n ?? null,
    rows,
    // the sentence that teaches, and it refuses to congratulate a missed turn
    verdict: !changeRow ? 'No reading changed in this window.'
      : changeRow.right
      ? `You caught the turn at step ${changeRow.n} — the reading went to "${changeRow.answer}". That is the part worth getting right; the steady steps either side of it are the easy ones.`
      : `You missed the turn at step ${changeRow.n}: it became "${changeRow.answer}" and you read it as "${changeRow.picked ?? 'nothing'}". Steps that hold their reading are the easy ones — the turn is the whole exercise, so a good total here is not a good result.`,
  };
}

/** The path, as a line: what the window did from end to end. */
export function pathOf(run) {
  if (!run?.ok) return '';
  const seq = run.steps.map(s => s.answer);
  const squashed = seq.filter((s, k) => k === 0 || s !== seq[k - 1]);
  return squashed.join(' → ');
}
