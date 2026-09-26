import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PRACTICE_KEY, MIN_FOR_WEAKNESS, blankSession, pickConcept, orderConcepts, nextQuestion, fold, stats } from './drillPractice.js';
import { GENERATORS, buildQuestion } from './marketDrill.js';
import { CONCEPTS } from './learnState.js';
import * as LearnState from './learnState.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const IDS = GENERATORS.map(g => g.id);

// ── The separation that must never be edited away ──────────────────────────────
// A practice run folded into the spaced schedule would mark every concept freshly
// seen and silence the daily question for a month.
t('practice cannot touch the daily spaced-repetition state', () => {
  assert.notEqual(PRACTICE_KEY, 'learn_state_v1');
  const text = fs.readFileSync(new URL('./drillPractice.js', import.meta.url), 'utf8');
  assert.doesNotMatch(text, /from '\.\/learnState/, 'practice must not import learnState');
  // and the two state shapes are not interchangeable, so a mix-up cannot go unnoticed
  const p = blankSession();
  assert.ok('byConcept' in p && !('topics' in p));
  assert.ok('topics' in LearnState.answer(undefined, 'which-gold', true));
});

t('a blank session is empty, not pre-seeded with anything', () => {
  const s = blankSession(5);
  assert.deepEqual(s.seen, []); assert.deepEqual(s.history, []); assert.deepEqual(s.byConcept, {});
  assert.equal(s.startedAt, 5); assert.equal(s.cursor, 1);
});

// ── Balance: the measured reason this module exists ────────────────────────────
// Raw seeding serves rates 8x more often than risk. A full pass must touch all 7.
t('the rotation covers every concept before repeating any', () => {
  let s = blankSession();
  const order = [];
  for (let i = 0; i < IDS.length; i++) {
    const c = pickConcept(s, IDS); order.push(c);
    s = fold(s, { id: `x${i}`, gen: c, topic: 't', date: 'd', answer: 'a' }, 'a');
  }
  assert.deepEqual([...new Set(order)].sort(), IDS.slice().sort(), 'a full pass must touch all 7');
});

t('an unproven miss is not treated as a weakness', () => {
  // One wrong answer on a concept nobody has sampled must not hijack the rotation,
  // or a single unlucky guess hands you the same idea over and over.
  let s = blankSession();
  s = fold(s, { id: 'a', gen: 'which-gold', topic: 't', date: 'd', answer: 'a' }, 'WRONG');
  assert.notEqual(pickConcept(s, IDS), 'which-gold', 'least-seen still wins over one miss');
});

t('once a concept has a real sample, weakness breaks the tie', () => {
  let s = blankSession();
  // give every concept the SAME count so only accuracy can separate them
  for (const c of IDS) for (let i = 0; i < MIN_FOR_WEAKNESS; i++)
    s = fold(s, { id: `${c}-${i}`, gen: c, topic: 't', date: 'd', answer: 'a' }, c === 'curve-led' ? 'no' : 'a');
  assert.equal(pickConcept(s, IDS), 'curve-led', 'the one being got wrong should come back');
});

t('pickConcept is total', () => {
  assert.equal(pickConcept(blankSession(), []), null);
  assert.equal(pickConcept(undefined, IDS), IDS[0]);
  assert.equal(pickConcept(blankSession(), [null, undefined]), null);
});

// ── Against the REAL generator, on a real-shaped bundle ────────────────────────
// The same fixture shape js/marketDrill.test.mjs uses, and for the same reason: the
// ramps have to be steep enough and DIVERGENT enough that a 20-session move clears each
// generator's own floor. A bundle where every series moves identically asks nothing,
// which is correct behaviour on a quiet tape and a useless fixture.
const bundle = (() => {
  // Sequential and UNIQUE, unlike marketDrill.test.mjs's cycling dates — a question id is
  // `gen@date`, so repeated dates would collide and the no-repeat assertion below could
  // not tell a real duplicate from a fixture artefact.
  const dates = Array.from({ length: 400 }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10));
  const ramp = (from, per) => dates.map((_, i) => from + i * per);
  return { dates, n: 400, from: dates[0], to: dates.at(-1), series: {
    us2y: ramp(4, 0.02), us10y: ramp(4, 0.02), us30y: ramp(4, 0.002), tips: ramp(2, 0.018), bei: ramp(2, 0.002),
    vix: ramp(15, 0.2), hy: ramp(3, 0.02), dxy: ramp(100, 0.1),
    gold: ramp(2000, -4), oil: ramp(70, 0.5), copper: ramp(4, 0.02),
    audusd: ramp(0.65, -0.001), usdjpy: ramp(150, 0.3) } };
})();

t('the real generator produces questions on a real-shaped bundle', () => {
  const { q } = nextQuestion(bundle, blankSession(), { build: buildQuestion, concepts: IDS });
  assert.ok(q, 'no question at all — the bundle fixture is wrong, not the module');
  assert.ok(IDS.includes(q.gen)); assert.ok(q.options.length >= 2); assert.ok(q.answer);
});

t('no question repeats within a session', () => {
  let s = blankSession(); const ids = new Set();
  for (let i = 0; i < 60; i++) {
    const r = nextQuestion(bundle, s, { build: buildQuestion, concepts: IDS });
    if (!r.q) break;
    assert.ok(!ids.has(r.q.id), `repeat at ${i}: ${r.q.id}`);
    ids.add(r.q.id);
    s = fold(r.session, r.q, r.q.answer);
  }
  assert.ok(ids.size >= 30, `only ${ids.size} distinct questions from the fixture`);
});

// This fixture deliberately cannot build every concept — `dollar-link` gets nothing from
// it. That must not stop the session: the balanced rotation skips what it cannot build.
t('a concept this bundle cannot build does not dead-end a balanced session', () => {
  let s = blankSession(); let served = 0;
  for (let i = 0; i < 40; i++) {
    const r = nextQuestion(bundle, s, { build: buildQuestion, concepts: IDS });
    if (!r.q) break;
    served++; s = fold(r.session, r.q, r.q.answer);
  }
  assert.ok(served >= 30, `stalled after ${served} — a thin generator halted the rotation`);
  const unbuildable = IDS.filter(c => !nextQuestion(bundle, blankSession(), { build: buildQuestion, concept: c }).q);
  assert.ok(unbuildable.length > 0, 'fixture no longer exercises the skip path — weaken it or drop this test');
  for (const c of unbuildable) assert.ok(!s.history.some(h => h.concept === c), `${c} cannot build yet was served`);
});

t('orderConcepts returns the whole preference list, not just the head', () => {
  const s = blankSession();
  assert.deepEqual(orderConcepts(s, IDS).slice().sort(), IDS.slice().sort());
  assert.equal(orderConcepts(s, IDS)[0], pickConcept(s, IDS));
  assert.deepEqual(orderConcepts(s, []), []);
});

t('focus mode returns that concept or nothing — never a different one', () => {
  for (const c of IDS) {
    const { q, exhausted } = nextQuestion(bundle, blankSession(), { build: buildQuestion, concept: c });
    if (q) assert.equal(q.gen, c, `asked for ${c}, got ${q.gen}`);
    else assert.equal(exhausted, c, 'a no-question must come back named, not silent');
  }
});

t('the cursor always advances, so a caller cannot loop forever', () => {
  let s = blankSession();
  for (let i = 0; i < 5; i++) {
    const r = nextQuestion(bundle, s, { build: buildQuestion, concepts: IDS });
    assert.ok(r.session.cursor > s.cursor);
    s = r.session;
  }
});

t('nextQuestion refuses to run without a builder rather than failing quietly', () => {
  assert.throws(() => nextQuestion(bundle, blankSession(), {}), TypeError);
});

// ── Scoring ───────────────────────────────────────────────────────────────────
t('stats counts, streaks and coverage', () => {
  let s = blankSession();
  const q = (i, c) => ({ id: `q${i}`, gen: c, topic: 't', date: 'd', answer: 'a' });
  s = fold(s, q(1, 'which-gold'), 'a'); s = fold(s, q(2, 'which-gold'), 'a');
  s = fold(s, q(3, 'curve-led'), 'no'); s = fold(s, q(4, 'curve-led'), 'a');
  const st = stats(s);
  assert.equal(st.n, 4); assert.equal(st.right, 3); assert.equal(st.pct, 0.75);
  assert.equal(st.streak, 1); assert.equal(st.best, 2); assert.equal(st.covered, 2);
  assert.equal(st.weakest, null, 'nothing has a real sample yet');
});

t('weakest names the worst concept once it has a sample', () => {
  let s = blankSession();
  for (let i = 0; i < MIN_FOR_WEAKNESS; i++) {
    s = fold(s, { id: `g${i}`, gen: 'which-gold', topic: 't', date: 'd', answer: 'a' }, 'a');
    s = fold(s, { id: `c${i}`, gen: 'curve-led', topic: 't', date: 'd', answer: 'a' }, 'no');
  }
  assert.equal(stats(s).weakest.concept, 'curve-led');
  assert.equal(stats(s).weakest.acc, 0);
});

t('an empty session scores cleanly rather than dividing by zero', () => {
  const st = stats(blankSession());
  assert.equal(st.n, 0); assert.equal(st.pct, null); assert.equal(st.weakest, null); assert.equal(st.covered, 0);
  assert.equal(stats(undefined).n, 0);
});

t('fold is immutable and ignores a junk question', () => {
  const s = blankSession(); const before = JSON.stringify(s);
  fold(s, { id: 'a', gen: 'which-gold', topic: 't', date: 'd', answer: 'a' }, 'a');
  assert.equal(JSON.stringify(s), before, 'fold must not mutate its input');
  assert.equal(fold(s, null, 'a').history.length, 0);
  assert.equal(fold(s, {}, 'a').history.length, 0);
});

t('every concept the practice page can serve has a mechanism to explain it', () => {
  // The whole reason this page is worth building is that the explanation ships with it.
  assert.deepEqual(IDS.slice().sort(), Object.keys(CONCEPTS).sort());
});

console.log(`drillPractice: ${n} groups, all passed`);
