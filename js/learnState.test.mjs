import assert from 'node:assert/strict';
import { CONCEPTS, INTERVALS, answer, due, nextTopic, progress, recordFor, known } from './learnState.js';
import { GENERATORS } from './marketDrill.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const DAY = 864e5;
const T0 = Date.UTC(2026, 0, 1);
const topics = Object.keys(CONCEPTS);

t('every concept maps to a real drill generator, and explains why it matters', () => {
  const gens = new Set(GENERATORS.map(g => g.id));
  for (const [id, c] of Object.entries(CONCEPTS)) {
    assert.ok(gens.has(id), `${id} has no generator to ask it with`);
    assert.ok(c.label && c.label.length > 5, `${id} needs a label`);
    assert.ok(c.why && c.why.length > 70, `${id} must say why it is worth knowing`);
  }
});

t('intervals widen, so a concept you keep getting right stops interrupting', () => {
  let s = {};
  const gaps = [];
  for (let i = 0; i < 5; i++) {
    s = answer(s, 'yield-split', true, T0 + i * DAY);
    gaps.push((recordFor(s, 'yield-split').dueAt - (T0 + i * DAY)) / DAY);
  }
  assert.deepEqual(gaps, INTERVALS.slice(1, 6));
  for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] > gaps[i - 1], 'each gap must be longer');
});

t('a wrong answer resets the interval but only halves mastery', () => {
  let s = {};
  for (let i = 0; i < 4; i++) s = answer(s, 'curve-led', true, T0 + i * DAY);
  const before = recordFor(s, 'curve-led').mastery;
  s = answer(s, 'curve-led', false, T0 + 5 * DAY);
  const after = recordFor(s, 'curve-led');
  assert.equal(after.step, 0, 'the interval goes back to the start');
  assert.equal((after.dueAt - (T0 + 5 * DAY)) / DAY, 1);
  assert.ok(after.mastery > 0, 'one slip must not erase months of work');
  assert.ok(Math.abs(after.mastery - before / 2) < 1e-9, 'it halves, deliberately');
  assert.equal(after.streak, 0);
});

t('nothing due means NO question, rather than filler', () => {
  let s = {};
  for (const tp of topics) s = answer(s, tp, true, T0);
  assert.equal(nextTopic(s, topics, T0 + 0.5 * DAY), null, 'a learner who is up to date is told so');
  assert.deepEqual(due(s, topics, T0 + 0.5 * DAY), []);
  // a first correct answer schedules two days out (a WRONG one schedules one), so
  // nothing is due tomorrow and everything is due the day after
  assert.equal(nextTopic(s, topics, T0 + 1.1 * DAY), null);
  assert.ok(nextTopic(s, topics, T0 + 2.1 * DAY), 'and then it comes back');
  let w = answer({}, 'yield-split', false, T0);
  assert.ok(nextTopic(w, ['yield-split'], T0 + 1.1 * DAY), 'something you got wrong returns tomorrow');
});

t('never-seen material comes before revision of things already met', () => {
  let s = {};
  s = answer(s, 'yield-split', false, T0);          // weak, but seen
  const pick = nextTopic(s, ['yield-split', 'curve-led'], T0 + 2 * DAY);
  assert.equal(pick, 'curve-led', 'new material outranks a low mastery score');
});

t('among things already met, the weakest is asked first', () => {
  let s = {};
  s = answer(s, 'yield-split', true, T0);
  s = answer(s, 'curve-led', false, T0);
  s = answer(s, 'which-gold', true, T0);
  s = answer(s, 'which-gold', true, T0);
  const pick = nextTopic(s, ['yield-split', 'curve-led', 'which-gold'], T0 + 40 * DAY);
  assert.equal(pick, 'curve-led');
});

t('the same topic is not asked twice running while anything else is due', () => {
  let s = answer({}, 'yield-split', false, T0);
  const pick = nextTopic(s, ['yield-split', 'curve-led'], T0 + 2 * DAY);
  assert.notEqual(pick, 'yield-split');
  // unless it is genuinely the only one available
  assert.equal(nextTopic(s, ['yield-split'], T0 + 2 * DAY), 'yield-split');
});

t('progress reports coverage honestly, and names the weakest thing', () => {
  let s = {};
  for (let i = 0; i < 4; i++) s = answer(s, 'yield-split', true, T0 + i * DAY);
  s = answer(s, 'curve-led', false, T0);
  const p = progress(s, topics, T0 + 5 * DAY);
  assert.equal(p.total, topics.length);
  assert.equal(p.started, 2, 'five topics untouched must not count as started');
  assert.ok(p.solid >= 1 && p.solid < p.total);
  assert.ok(p.coverage > 0 && p.coverage < 1, 'coverage is solid/total, not seen/total');
  assert.equal(p.weakest.topic, 'curve-led');
  assert.equal(p.answers, 5);
});

t('mastery weights recent answers, so an old success does not carry a current failure', () => {
  let s = {};
  for (let i = 0; i < 6; i++) s = answer(s, 'which-gold', true, T0 + i * DAY);
  const peak = recordFor(s, 'which-gold').mastery;
  for (let i = 0; i < 3; i++) s = answer(s, 'which-gold', false, T0 + (10 + i) * DAY);
  const now = recordFor(s, 'which-gold');
  assert.ok(now.mastery < peak * 0.2, `three recent failures must dominate, got ${now.mastery} from ${peak}`);
  assert.ok(now.right > now.seen / 2, 'even though the lifetime record is still positive');
});

t('known() only returns what has actually been demonstrated', () => {
  let s = {};
  assert.deepEqual(known(s), []);
  for (let i = 0; i < 3; i++) s = answer(s, 'dollar-link', true, T0 + i * DAY);
  assert.deepEqual(known(s), ['dollar-link']);
  s = answer(s, 'dollar-link', false, T0 + 9 * DAY);
  assert.deepEqual(known(s), [], 'and it stops being known when you stop getting it right');
});

t('a corrupt or empty stored state never throws', () => {
  for (const bad of [null, undefined, {}, { topics: null }, { topics: { 'yield-split': null } }, { history: 'nope' }]) {
    assert.doesNotThrow(() => progress(bad, topics, T0));
    assert.doesNotThrow(() => nextTopic(bad, topics, T0));
    assert.doesNotThrow(() => recordFor(bad, 'yield-split'));
  }
});

console.log(`learnState: ${n} groups, all passed`);
