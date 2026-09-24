import assert from 'node:assert/strict';
import { ukMinutesOf, branchAt, ladder, medianLift } from './bandLadder.js';
import { BAND_REACH_PARAMS, BAND_REACH_CHECKPOINTS } from './bandReachParams.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

t('UTC instants become UK minutes, in both halves of the year', () => {
  assert.equal(ukMinutesOf('2026-09-24T05:00:00.000000000Z'), 6 * 60, 'BST is UTC+1');
  assert.equal(ukMinutesOf('2026-09-24T08:00:00.000000000Z'), 9 * 60);
  assert.equal(ukMinutesOf('2026-01-15T08:00:00.000000000Z'), 8 * 60, 'GMT is UTC+0');
  assert.equal(ukMinutesOf(null), null);
  assert.equal(ukMinutesOf('not a date'), null);
});

t('a band reached LATER than a checkpoint had not been reached at it', () => {
  const s = { medMins: 9 * 60, b75Mins: 12 * 60 };
  assert.equal(branchAt(s, 8 * 60), 'waiting', 'at 08:00 nothing was in yet');
  assert.equal(branchAt(s, 9 * 60), 'extended', 'the median lands exactly on the checkpoint');
  assert.equal(branchAt(s, 10.5 * 60), 'extended');
  assert.equal(branchAt(s, 12 * 60), 'stretch');
  assert.equal(branchAt({}, 12 * 60), 'waiting', 'nothing reached at all');
});

// NQ on 2026-09-24: the low band reached 05:00 UTC, the 75th at 08:00 UTC — so the read
// genuinely changed branch twice before lunch.
const NQ_SESSION = { oh_reached_at: null, oh_75_reached_at: null, oh_ratio: 3.03,
                     ol_reached_at: '2026-09-24T05:00:00.000000000Z', ol_75_reached_at: '2026-09-24T08:00:00.000000000Z', ol_ratio: 235.59 };

t('the ladder reconstructs every checkpoint the day has passed', () => {
  const r = ladder({ params: BAND_REACH_PARAMS.NQ, session: NQ_SESSION, checkpoints: BAND_REACH_CHECKPOINTS, nowMins: 14 * 60 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.rows.map(x => x.cp), ['07:00', '08:00', '09:00', '10:30', '12:00', '13:30']);
  assert.equal(r.rows.every(x => x.side === 'dn'), true, 'the low side is the one that extended');
  // 05:00 UTC = 06:00 UK, so the median was already in at the 07:00 checkpoint
  assert.equal(r.rows[0].branch, 'extended');
  // 08:00 UTC = 09:00 UK, so the 75th lands exactly on the 09:00 checkpoint
  assert.equal(r.rows.find(x => x.cp === '08:00').branch, 'extended');
  assert.equal(r.rows.find(x => x.cp === '09:00').branch, 'stretch');
  assert.equal(r.rows.at(-1).branch, 'stretch');
});

t('the row where the read CHANGED is marked, and it is the only one', () => {
  const r = ladder({ params: BAND_REACH_PARAMS.NQ, session: NQ_SESSION, checkpoints: BAND_REACH_CHECKPOINTS, nowMins: 14 * 60 });
  assert.deepEqual(r.rows.filter(x => x.changed).map(x => x.cp), ['09:00']);
  assert.equal(r.rows[0].first, true, 'the first row is not a change, it is the opening read');
  assert.equal(r.changes, 1);
  assert.match(r.whyUnchanged, /changed at 09:00 — a band was reached/);
  assert.match(r.whyUnchanged, /the clock running down/);
});

// The honest answer to "is the value in the constant re-checking?"
t('a day where nothing happened says the re-reads added nothing', () => {
  const quiet = { oh_reached_at: null, ol_reached_at: null, oh_75_reached_at: null, ol_75_reached_at: null, oh_ratio: 40, ol_ratio: 30 };
  const r = ladder({ params: BAND_REACH_PARAMS.NQ, session: quiet, checkpoints: BAND_REACH_CHECKPOINTS, nowMins: 16 * 60 });
  assert.equal(r.changes, 0);
  assert.equal(r.rows.every(x => x.branch === 'waiting'), true);
  assert.match(r.whyUnchanged, /the same read with less of the session left/);
  assert.match(r.whyUnchanged, /time runs out, not because the market said anything new/);
  // and the probability falls through the day purely because the session is ending
  const ps = r.rows.map(x => x.p).filter(Number.isFinite);
  assert.ok(ps[0] > ps.at(-1), 'the odds decay');
  assert.deepEqual(ps, [...ps].sort((a, b) => b - a), 'monotonically — that is the clock, not a signal');
});

t('an assumed side is flagged rather than presented as reconstructed fact', () => {
  const quiet = { oh_reached_at: null, ol_reached_at: null, oh_75_reached_at: null, ol_75_reached_at: null, oh_ratio: 40, ol_ratio: 30 };
  const r = ladder({ params: BAND_REACH_PARAMS.NQ, session: quiet, checkpoints: BAND_REACH_CHECKPOINTS, nowMins: 16 * 60 });
  assert.equal(r.rows.every(x => x.sideAssumed), true, 'nothing reached, so the side rests on a ratio only known now');
  // once a band is reached the side is a FACT and is not flagged
  const r2 = ladder({ params: BAND_REACH_PARAMS.NQ, session: NQ_SESSION, checkpoints: BAND_REACH_CHECKPOINTS, nowMins: 14 * 60 });
  assert.equal(r2.rows.some(x => x.sideAssumed), false);
});

t('the ladder stops at now and never shows a checkpoint that has not happened', () => {
  const r = ladder({ params: BAND_REACH_PARAMS.NQ, session: NQ_SESSION, checkpoints: BAND_REACH_CHECKPOINTS, nowMins: 9 * 60 + 30 });
  assert.deepEqual(r.rows.map(x => x.cp), ['07:00', '08:00', '09:00']);
  assert.equal(ladder({ params: BAND_REACH_PARAMS.NQ, session: NQ_SESSION, checkpoints: BAND_REACH_CHECKPOINTS, nowMins: 6 * 60 }).rows.length, 0);
});

t('a missing instrument refuses rather than rendering an empty ladder', () => {
  assert.equal(ladder({ params: null, session: NQ_SESSION, checkpoints: BAND_REACH_CHECKPOINTS, nowMins: 600 }).ok, false);
  assert.equal(ladder({ params: BAND_REACH_PARAMS.NQ, session: null, checkpoints: BAND_REACH_CHECKPOINTS, nowMins: 600 }).ok, false);
  assert.equal(ladder({}).ok, false);
  assert.match(ladder({}).reason, /no band parameters/);
});

// The claim "watch for the state change, not the hour" has to be backed by the same
// numbers the read is built from, not asserted.
t('the median lift is real across the whole parameter set, not just one pair', () => {
  const L = medianLift(BAND_REACH_PARAMS, BAND_REACH_CHECKPOINTS);
  assert.ok(L.n >= 100, `${L.n} instrument-checkpoint-side cells`);
  assert.ok(L.median >= 2, `reaching the median lifts the 75th by ${L.median}x`);
  assert.ok(L.atLeast15 >= 90, `${L.atLeast15}% of cells clear 1.5x`);
  assert.equal(medianLift({}, BAND_REACH_CHECKPOINTS), null);
});

console.log(`bandLadder: ${n} groups, all passed`);
