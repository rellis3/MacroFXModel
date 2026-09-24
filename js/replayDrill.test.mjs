import assert from 'node:assert/strict';
import { buildRun, scoreRun, pathOf, STATES, STEPS_BACK } from './replayDrill.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

// A stub engine: the board is the same shape the real one returns, and the state is
// driven off the index so a window's path is whatever the test wants it to be.
const mkBundle = (N = 900) => ({ dates: Array.from({ length: N }, (_, i) => `d${String(i).padStart(4, '0')}`) });
const board = () => Array.from({ length: 25 }, (_, k) => ({
  key: ['us2y', 'us10y', 'curve', 'hy', 'vix', 'vixterm', 'spx', 'nq', 'r2k', 'eqwt', 'dxy', 'gold', 'oil'][k] ?? `x${k}`,
  label: `L${k}`, change: k - 5, z: (k % 7) - 3, kind: 'rate',
}));
const engineWith = stateFor => ({
  scanBoard: () => board(),
  marketState: (_b, _brd, i) => ({ state: stateFor(i), line: 'a line', teach: 'a teach', breadth: { sectorsUp: 3, sectorsTotal: 11, concentration: -2 } }),
});
/** every index the same reading — a window with nothing to learn */
const FLAT = engineWith(() => 'Rotation without direction');
/** the reading turns on the last two steps */
const TURNS = engineWith(i => (i % 1000) % 9 < 5 ? 'Broad risk appetite' : 'Risk is being sold');

t('a run walks five real sessions, oldest first', () => {
  const r = buildRun(mkBundle(), { seed: 3, engine: TURNS });
  assert.ok(r?.ok);
  assert.equal(r.steps.length, STEPS_BACK.length);
  assert.deepEqual(r.steps.map(s => s.n), [1, 2, 3, 4, 5]);
  const idx = r.steps.map(s => s.i);
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b), 'oldest first');
  assert.equal(idx.at(-1) - idx[0], Math.max(...STEPS_BACK));
});

// The first version picked "biggest move" days and the state was identical at all five
// steps — five questions, one answer, guessable after the first.
t('a window where the reading never changes is REJECTED, not served', () => {
  assert.equal(buildRun(mkBundle(), { seed: 5, engine: FLAT }), null,
    'a flat window teaches nothing and must not be offered');
  // unless the caller explicitly asks for one
  const forced = buildRun(mkBundle(), { seed: 5, engine: FLAT, requireChange: false });
  assert.ok(forced?.ok);
  assert.equal(forced.distinct, 1);
  assert.equal(forced.changedAt, null);
});

t('the step where the reading turned is identified', () => {
  const r = buildRun(mkBundle(), { seed: 3, engine: TURNS });
  assert.ok(r.distinct >= 2);
  const changed = r.steps.filter(s => s.changed);
  assert.ok(changed.length >= 1);
  assert.equal(r.steps[0].changed, false, 'the first step cannot be a change');
  assert.equal(r.changedAt, r.steps.findIndex(s => s.changed));
});

t('every step shows the same evidence, so what changes is the market not the question', () => {
  const r = buildRun(mkBundle(), { seed: 3, engine: TURNS });
  const keys = r.steps.map(s => s.evidence.map(e => e.key).join(','));
  assert.equal(new Set(keys).size, 1);
  assert.ok(r.steps[0].evidence.length >= 10, 'enough numbers to actually read from');
  // and nothing in the evidence names the answer
  for (const s of r.steps)
    assert.equal(JSON.stringify(s.evidence).includes(s.answer), false, 'the evidence must not give it away');
});

t('the six readings are the live page\'s own, so the skill transfers', () => {
  assert.equal(STATES.length, 6);
  for (const s of ['Rates are driving', 'Risk is being sold', 'Broad risk appetite',
                   'Narrow and concentrated', 'Rotation without direction', 'Nothing much is happening'])
    assert.ok(STATES.includes(s), s);
});

// The failure mode this exists to surface: four steady steps right, the turn missed.
t('missing the turn is called out and never softened by the total', () => {
  const r = buildRun(mkBundle(), { seed: 3, engine: TURNS });
  const k = r.changedAt;
  const picks = r.steps.map((s, j) => j === k ? 'Nothing much is happening' : s.answer);   // everything but the turn
  const sc = scoreRun(r, picks);
  assert.equal(sc.right, 4);
  assert.equal(sc.n, 5);
  assert.equal(sc.caughtChange, false);
  assert.match(sc.verdict, /You missed the turn at step/);
  assert.match(sc.verdict, /a good total here is not a good result/);
});

t('catching the turn is what gets credited', () => {
  const r = buildRun(mkBundle(), { seed: 3, engine: TURNS });
  const sc = scoreRun(r, r.steps.map(s => s.answer));
  assert.equal(sc.right, 5);
  assert.equal(sc.caughtChange, true);
  assert.match(sc.verdict, /You caught the turn at step/);
  assert.match(sc.verdict, /the steady steps either side of it are the easy ones/);
});

t('a part-finished run is scored on what was answered, and says it is unfinished', () => {
  const r = buildRun(mkBundle(), { seed: 3, engine: TURNS });
  const sc = scoreRun(r, [r.steps[0].answer, r.steps[1].answer]);
  assert.equal(sc.n, 2);
  assert.equal(sc.complete, false);
  assert.equal(scoreRun(null).ok, false);
  assert.equal(scoreRun({ ok: false }).ok, false);
});

// FRED revises, so a replay sees today's vintage. It teaches a shape; it is not a record.
t('every run carries the point-in-time warning', () => {
  const r = buildRun(mkBundle(), { seed: 3, engine: TURNS });
  assert.equal(r.pointInTime, false, 'a caller cannot quietly forget this');
});

t('the path reads as a sequence, with repeats squashed', () => {
  const r = buildRun(mkBundle(), { seed: 3, engine: TURNS });
  const p = pathOf(r);
  assert.ok(p.includes('→'), 'it is a path, not a state');
  assert.equal(p.includes('→ Broad risk appetite → Broad risk appetite'), false, 'repeats are squashed');
  assert.equal(pathOf(null), '');
});

t('a bundle too short to replay returns nothing rather than a broken run', () => {
  assert.equal(buildRun(mkBundle(200), { engine: TURNS }), null);
  assert.equal(buildRun(null, { engine: TURNS }), null);
  assert.equal(buildRun(mkBundle(), {}), null, 'no engine, no run');
});

console.log(`replayDrill: ${n} groups, all passed`);
