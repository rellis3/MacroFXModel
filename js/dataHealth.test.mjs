// Tests for js/dataHealth.js.
//
// The two rules that matter are the ones a naive "older than N days" check gets wrong:
// cadence (a weekly series six days old is fine) and weekends (Friday's close is ONE
// session old on Monday, not three days). An alarm that fires every Monday morning is an
// alarm nobody reads, which is how EVZ sat dead for 570 days behind a correct `stale` flag.
//
// Run:  node --test js/dataHealth.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, health, businessDaysBetween } from './dataHealth.js';

const iso = s => Date.parse(s + 'T12:00:00Z');
const MON = iso('2026-10-05'), FRI = iso('2026-10-02');

test('business days skip the weekend', () => {
  assert.equal(businessDaysBetween(FRI, MON), 1, 'Friday to Monday is ONE session');
  assert.equal(businessDaysBetween(iso('2026-10-01'), iso('2026-10-02')), 1);
  assert.equal(businessDaysBetween(iso('2026-10-01'), iso('2026-10-08')), 5);
  assert.equal(businessDaysBetween(MON, FRI), 0, 'backwards is zero, never negative');
  assert.equal(businessDaysBetween(NaN, MON), 0);
});

// THE MONDAY TEST. A daily market feed that printed Friday must read fresh on Monday.
test('a daily feed that printed Friday is fresh on Monday morning', () => {
  const r = classify({ id: 'dgs10', label: 'US 10y', last: '2026-10-02', cadenceDays: 1 }, MON);
  assert.equal(r.state, 'fresh', `read ${r.state}: ${r.why}`);
});

test('cadence is respected — six days old is fine weekly, bad daily', () => {
  const when = iso('2026-10-09');
  const weekly = classify({ id: 'walcl', label: 'Fed balance sheet', last: '2026-10-01', cadenceDays: 7 }, when);
  const daily  = classify({ id: 'dgs10', label: 'US 10y',            last: '2026-10-01', cadenceDays: 1 }, when);
  assert.equal(weekly.state, 'fresh');
  assert.ok(['lagging', 'stale'].includes(daily.state), `daily read ${daily.state}`);
});

test('a monthly series is not called late a fortnight in', () => {
  const r = classify({ id: 'cpi', label: 'CPI', last: '2026-09-15', cadenceDays: 30 }, iso('2026-10-02'));
  assert.equal(r.state, 'fresh');
});

test('the states step through in the right order as a feed rots', () => {
  // 1 / 5 / 16 / 457 business days behind a daily cadence
  const seen = ['2026-10-01', '2026-09-25', '2026-09-10', '2025-01-01']
    .map(d => classify({ id: 'x', label: 'x', last: d, cadenceDays: 1 }, iso('2026-10-02')).state);
  assert.deepEqual(seen, ['fresh', 'lagging', 'stale', 'dead']);
});

// The H.10 FX fixings publish on a lag and sit ~5 business days behind while working
// perfectly. If that reads "stale" the badge is red most of the week and stops meaning
// anything -- the precise failure this module exists to prevent.
test('a normal publication lag is LAGGING, not stale', () => {
  const r = classify({ id: 'dexuseu', label: 'USD/EUR fixing', last: '2026-09-25', cadenceDays: 1 }, iso('2026-10-02'));
  assert.equal(r.state, 'lagging', `read ${r.state}: ${r.why}`);
  assert.match(r.why, /holiday|slow publisher/);
});

// EVZ: 570 days behind a daily cadence. That is not "late".
test('a discontinued feed reads DEAD, not merely stale', () => {
  const r = classify({ id: 'evz', label: 'EVZ', last: '2025-03-11', cadenceDays: 1 }, iso('2026-10-02'));
  assert.equal(r.state, 'dead');
  assert.match(r.why, /discontinued, not late/);
});

// A manual export is not an outage. Letting it paint the badge red teaches people to
// ignore red, which is the failure this whole module exists to avoid.
test('a snapshot gets its own state and never reads as broken', () => {
  const r = classify({ id: 'cme', label: 'CME CVOL', last: '2026-08-20', cadenceDays: 1, kind: 'snapshot' }, iso('2026-10-02'));
  assert.equal(r.state, 'snapshot');
  assert.match(r.why, /Not failing/);
  const h = health([r.last ? { id: 'cme', label: 'CME CVOL', last: '2026-08-20', kind: 'snapshot' } : null,
                    { id: 'ok', label: 'ok', last: '2026-10-02', cadenceDays: 1 }], iso('2026-10-02'));
  assert.equal(h.worst, 'fresh', 'a stale snapshot must not drive the badge');
});

test('wall-clock sources are aged in calendar days, not sessions', () => {
  const market = classify({ id: 'm', label: 'm', last: '2026-10-02', cadenceDays: 1 }, MON);
  const clock  = classify({ id: 'c', label: 'c', last: '2026-10-02', cadenceDays: 1, market: false }, MON);
  assert.ok(clock.overdue > market.overdue, 'the weekend counts for a wall-clock job and not for a market feed');
});

test('a missing timestamp is UNKNOWN, never silently fresh', () => {
  for (const last of [null, undefined, '', 'not a date']) {
    const r = classify({ id: 'x', label: 'x', last }, MON);
    assert.equal(r.state, 'unknown');
    assert.equal(r.ageDays, null);
  }
});

test('health sorts worst-first and counts what needs eyes', () => {
  const h = health([
    { id: 'a', label: 'fine', last: '2026-10-02', cadenceDays: 1 },
    { id: 'b', label: 'gone', last: '2024-01-01', cadenceDays: 1 },
    { id: 'c', label: 'late', last: '2026-09-25', cadenceDays: 1 },
  ], iso('2026-10-02'));
  assert.equal(h.rows[0].id, 'b', 'the dead one comes first');
  assert.equal(h.worst, 'dead');
  assert.equal(h.needsEyes, 2);
  assert.match(h.summary, /2 of 3 need eyes/);
});

test('all-clear says so plainly', () => {
  const h = health([
    { id: 'a', label: 'a', last: '2026-10-02', cadenceDays: 1 },
    { id: 'b', label: 'b', last: '2026-09-28', cadenceDays: 7 },
  ], iso('2026-10-02'));
  assert.equal(h.worst, 'fresh');
  assert.equal(h.needsEyes, 0);
  assert.match(h.summary, /2 sources current/);
});

test('nothing in, nothing claimed', () => {
  for (const x of [[], null, undefined]) {
    const h = health(x, MON);
    assert.equal(h.n, 0);
    assert.equal(h.worst, 'fresh');
    assert.deepEqual(h.rows, []);
  }
});
