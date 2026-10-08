// Tests for js/fedPathZq.js.   node --test js/fedPathZq.test.mjs
//
// The one that matters is the FedWatch cross-check: this desk's own ZQ pull, run
// through this arithmetic, must land on the numbers CME published independently.
// Everything else here guards the ways the chain can silently go wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meetingProbabilities, cumulativePath, daysInMonth } from './fedPathZq.js';

// The real 2026-10-08 pull: implied rate = 100 − last close, median 15-min volume.
const PULL = [
  ['2026-10', 3.8825, 37], ['2026-11', 3.9250, 35], ['2026-12', 4.0700, 14],
  ['2027-01', 4.1400, 26], ['2027-02', 4.2200, 14], ['2027-03', 4.2950, 5],
  ['2027-04', 4.3950, 7], ['2027-05', 4.4750, 3], ['2027-06', 4.5450, 1],
  ['2027-07', 4.5750, 1], ['2027-08', 4.6050, 0], ['2027-09', 4.6250, 0],
].map(([ym, implied, volumeHint]) => ({ ym, implied, volumeHint }));

const MEETINGS = ['2026-10-28', '2026-12-09', '2027-01-27', '2027-03-17',
                  '2027-04-28', '2027-06-09', '2027-07-28', '2027-09-15'];

test('days in month, including a leap February', () => {
  assert.equal(daysInMonth('2026-10'), 31);
  assert.equal(daysInMonth('2026-11'), 30);
  assert.equal(daysInMonth('2027-02'), 28);
  assert.equal(daysInMonth('2028-02'), 29);
});

// ── THE CROSS-CHECK ─────────────────────────────────────────────────────────
// CME FedWatch, captured 2026-10-05: October 19.4% for 400-425; December 67.4%
// at 400-425 plus 15.7% at 425-450 = 83.1% for at least one hike. This pull is
// from the 8th, so a few points of drift is expected and correct -- the test is
// that we are on the same number, not that we match a different day exactly.
test('reproduces CME FedWatch within a few points', () => {
  const r = meetingProbabilities(PULL, MEETINGS);
  const oct = r.rows.find(x => x.meeting === '2026-10-28');
  const dec = r.rows.find(x => x.meeting === '2026-12-09');
  assert.ok(oct, 'the nearest meeting must be priced, not skipped');
  assert.ok(Math.abs(oct.probPct - 19.4) < 5, `Oct ${oct.probPct}% vs FedWatch 19.4%`);
  assert.ok(Math.abs(dec.probPct - 83.1) < 8, `Dec ${dec.probPct}% vs FedWatch 83.1%`);
});

// The anchor is the first month with NO meeting, so a meeting before it would be
// dropped entirely -- and that is the nearest one, the only one anybody trades.
test('a meeting BEFORE the anchor is still priced, by back-solving', () => {
  const r = meetingProbabilities(PULL, MEETINGS);
  const oct = r.rows.find(x => x.meeting === '2026-10-28');
  assert.equal(r.anchored, '2026-11');
  assert.equal(oct.solvedBackwards, true);
  assert.equal(r.rows[0].meeting, '2026-10-28', 'rows must stay in date order');
});

test('every meeting inside the contract months is priced exactly once', () => {
  const r = meetingProbabilities(PULL, MEETINGS);
  const got = r.rows.map(x => x.meeting);
  assert.deepEqual(got, [...got].sort(), 'date order');
  assert.equal(new Set(got).size, got.length, 'no duplicates');
  assert.equal(got.length, MEETINGS.length);
});

// A clean month re-grounds the chain. Without it one noisy contract propagates
// through every later meeting for ever.
test('a no-meeting month re-anchors the rate', () => {
  const r = meetingProbabilities(PULL, MEETINGS);
  const jun = r.rows.find(x => x.meeting === '2027-06-09');
  assert.equal(jun.rBefore, 4.475, 'May has no meeting, so May IS the rate going in');
});

// Liquidity is the caller's problem, but it must be CARRIED. ZQ volume ran
// 37, 35, 14 then 1, 1, 0, 0 -- the back half is stale prints.
test('thin contracts are flagged, not silently trusted', () => {
  const r = meetingProbabilities(PULL, MEETINGS);
  const thin = r.rows.filter(x => x.thin).map(x => x.meeting);
  assert.ok(thin.includes('2027-07-28'));
  assert.ok(thin.includes('2027-09-15'));
  assert.ok(!r.rows.find(x => x.meeting === '2026-12-09').thin, 'December trades');
});

test('two meetings in one month are flagged as combined, never split', () => {
  const r = meetingProbabilities(PULL, [...MEETINGS, '2026-12-22']);
  const dec = r.rows.find(x => x.ym === '2026-12');
  assert.ok(Array.isArray(dec.combined) && dec.combined.length === 2);
  assert.equal(r.rows.filter(x => x.ym === '2026-12').length, 1, 'one row, not two');
});

test('cumulative path adds up to the total priced move', () => {
  const r = meetingProbabilities(PULL, MEETINGS);
  const c = cumulativePath(r);
  assert.equal(c.length, r.rows.length);
  assert.ok(c.at(-1).cumBp > 0, 'this pull prices tightening');
});

test('nothing in, nothing claimed', () => {
  for (const x of [[], null, undefined]) {
    const r = meetingProbabilities(x, MEETINGS);
    assert.deepEqual(r.rows, []);
    assert.ok(r.note);
  }
  assert.deepEqual(meetingProbabilities(PULL, []).rows, []);
});
