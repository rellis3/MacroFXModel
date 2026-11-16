// js/cbMeetingPath.test.mjs: the meeting-by-meeting path from a 3-month futures strip. node --test js/cbMeetingPath.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { meetingPath, periods, MEETINGS, calendarCoverage } from './cbMeetingPath.js';

const NOW = Date.parse('2026-11-16T12:00:00Z');
const strip = (rates, expiries = ['20261215', '20270316', '20270615', '20270915', '20271215']) => rates.map((rate, i) => ({ expiry: expiries[i], rate, local: `R${i}` }));

test('a flat strip at the overnight rate prices no moves', () => {
  const p = meetingPath(strip([2.437, 2.437, 2.437, 2.437, 2.437]), 'EUR', 2.5, NOW);
  assert.ok(p.meetings.length >= 6);
  for (const m of p.meetings) assert.ok(Math.abs(m.stepBp) < 1, `${m.date} ${m.stepBp}`);
  assert.ok(p.meetings.every(m => m.direction === 'none'));
});

test('periods run from the previous expiry; the first starts 91 days before its end', () => {
  const P = periods(strip([1, 2, 3]));
  assert.equal(P[1].start, Date.UTC(2026, 11, 15));
  assert.equal(Math.round((P[0].end - P[0].start) / 86400000), 91);
});

test('the front period is not used when no meeting is left inside it, and says so', () => {
  const p = meetingPath(strip([2.60, 2.437, 2.437, 2.437, 2.437]), 'EUR', 2.5, NOW);
  assert.equal(p.frontPeriod.usedInFit, false);
  assert.equal(p.frontPeriod.vsOvernightBp, 16);
});

test('a hike effective before a period starts is reproduced exactly by that quarter', () => {
  // ECB decides 2026-12-17, effective 2026-12-23: the Dec-Mar quarter starts 2026-12-15, so it sees 83 of 91 days after the move
  const r = 2.437 + 0.25 * (83 / 91);
  const p = meetingPath(strip([2.437, r, r + 0.25 * 8 / 91 * 0 + 0.0, r, r]), 'EUR', 2.5, NOW);
  const first = p.meetings[0];
  assert.ok(first.stepBp > 15 && first.stepBp < 30, String(first.stepBp));
  assert.ok(p.fit.every(f => Math.abs(f.residualBp) < 3), JSON.stringify(p.fit));
});

test('the solved steps reproduce every rung they were fitted to (residual under 3 bp) on a rising strip', () => {
  const p = meetingPath(strip([2.45, 2.70, 2.90, 3.00, 3.05]), 'EUR', 2.5, NOW);
  assert.ok(p.fit.length >= 3);
  for (const f of p.fit) assert.ok(Math.abs(f.residualBp) < 3, JSON.stringify(f));
  assert.ok(p.meetings.at(-1).cumBp > 40);
});

test('a falling strip prices cuts, and the probability is |step| / 25 capped at 1', () => {
  const p = meetingPath(strip([1.2, 1.0, 0.8, 0.7, 0.7]), 'JPY', 1.227, NOW);
  assert.ok(p.meetings.some(m => m.direction === 'cut'));
  for (const m of p.meetings) { assert.ok(m.probMove >= 0 && m.probMove <= 1); assert.equal(m.probMove, +Math.min(1, Math.abs(m.stepBp) / 25).toFixed(2)); }
});

test('the strip carries the 1-day, 1-week and 4-week moves of each rung', () => {
  const rungs = strip([2.45, 2.70, 2.90]).map(r => ({ ...r, rateDayAgo: r.rate - 0.01, rateWeekAgo: r.rate - 0.05, rate4wAgo: r.rate - 0.20 }));
  const p = meetingPath(rungs, 'EUR', 2.5, NOW);
  assert.deepEqual(p.strip[1].movedBp, { d1: 1, w1: 5, w4: 20 });
});

test('no policy rate, no calendar or no rungs gives null, never a guess', () => {
  assert.equal(meetingPath(strip([2]), 'EUR', null, NOW), null);
  assert.equal(meetingPath(strip([2]), 'CHF', 1, NOW), null);
  assert.equal(meetingPath([], 'EUR', 2.5, NOW), null);
});

test('calendar guard: every bank lists dates for the next 12 months from 2026-11-16, strictly increasing, and the stale flag works', () => {
  const cov = calendarCoverage(NOW);
  for (const [c, m] of Object.entries(MEETINGS)) {
    assert.ok(cov[c] >= 365, `${c} ${cov[c]}`);
    assert.deepEqual([...m.dates].sort(), m.dates, `${c} sorted`);
  }
  const late = meetingPath(strip([2.5, 2.5]), 'EUR', 2.5, Date.parse('2027-10-01T00:00:00Z'));
  assert.equal(late.calendar.stale, true);
});

test('known calendar facts: ECB 2026-12-17 and BoE 2026-12-17 are the next decisions, BoJ 2026-12-18', () => {
  assert.equal(MEETINGS.EUR.dates[0], '2026-12-17'); assert.equal(MEETINGS.GBP.dates[0], '2026-12-17'); assert.equal(MEETINGS.JPY.dates[0], '2026-12-18');
});
