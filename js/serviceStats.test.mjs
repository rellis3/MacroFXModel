// Unit test for js/serviceStats.js — the persisted half of /api/services.
//
// The property that matters most: the same work is never counted twice, and a
// restart contributes its own run rather than resetting the day.
//
// Run: node js/serviceStats.test.mjs

import assert from 'node:assert/strict';
import { STORE_VERSION, dayKey, emptyStore, normalizeStore, mergeDeltas, trimDays, rollup, pendingDeltas } from './serviceStats.js';

let pass = 0;
const t = (name, fn) => { fn(); console.log(`  ok  ${name}`); pass++; };

t('dayKey is UTC, so a restart in another zone lands in the same bucket', () => {
  assert.equal(dayKey(new Date('2026-09-16T23:59:59Z')), '2026-09-16');
  assert.equal(dayKey(new Date('2026-09-17T00:00:00Z')), '2026-09-17');
});

t('deltas accumulate within a day rather than overwriting', () => {
  const s = emptyStore();
  mergeDeltas(s, { hmm5m: { runs: 10, errors: 0, totalMs: 500 } }, { day: '2026-09-16' });
  mergeDeltas(s, { hmm5m: { runs: 5,  errors: 1, totalMs: 250 } }, { day: '2026-09-16' });
  assert.deepEqual(s.days['2026-09-16'].hmm5m, { runs: 15, errors: 1, totalMs: 750 });
});

t('an idle service does not create a row', () => {
  const s = emptyStore();
  mergeDeltas(s, { idle: { runs: 0, errors: 0, totalMs: 0 } }, { day: '2026-09-16' });
  assert.deepEqual(s.days['2026-09-16'], {});
});

t('pendingDeltas subtracts what was already flushed — no double counting', () => {
  const live = new Map([['hmm5m', { runs: 100, errors: 2, totalMs: 9000 }]]);
  const [d1, next1] = pendingDeltas(live, {});
  assert.deepEqual(d1.hmm5m, { runs: 100, errors: 2, totalMs: 9000 });

  // nothing has run since; the next flush must contribute nothing
  const [d2] = pendingDeltas(live, next1);
  assert.deepEqual(d2, {});

  // ten more runs → only the ten are flushed
  live.set('hmm5m', { runs: 110, errors: 2, totalMs: 9900 });
  const [d3] = pendingDeltas(live, next1);
  assert.deepEqual(d3.hmm5m, { runs: 10, errors: 0, totalMs: 900 });
});

t('a counter going backwards is read as a restart, not a negative delta', () => {
  const flushed = { hmm5m: { runs: 5000, errors: 0, totalMs: 100000 } };
  const live = new Map([['hmm5m', { runs: 12, errors: 0, totalMs: 300 }]]);   // fresh process
  const [d] = pendingDeltas(live, flushed);
  assert.deepEqual(d.hmm5m, { runs: 12, errors: 0, totalMs: 300 });
});

t('a full restart cycle keeps the day total intact — the bug this exists to fix', () => {
  const store = emptyStore();
  const day = '2026-09-16';

  // process A runs, flushes twice, then is killed by a redeploy
  let live = new Map([['hmm5m', { runs: 40, errors: 0, totalMs: 4000 }]]);
  let [d, flushed] = pendingDeltas(live, {});
  mergeDeltas(store, d, { day });
  live.set('hmm5m', { runs: 90, errors: 1, totalMs: 9000 });
  [d, flushed] = pendingDeltas(live, flushed);
  mergeDeltas(store, d, { day });
  assert.deepEqual(store.days[day].hmm5m, { runs: 90, errors: 1, totalMs: 9000 });

  // process B boots: counters restart at zero, `flushed` came back from R2
  const liveB = new Map([['hmm5m', { runs: 7, errors: 0, totalMs: 700 }]]);
  const [dB] = pendingDeltas(liveB, flushed);
  mergeDeltas(store, dB, { day });
  assert.deepEqual(store.days[day].hmm5m, { runs: 97, errors: 1, totalMs: 9700 },
    'the redeploy must add to the day, not reset it');
});

t('trimDays keeps the most recent window', () => {
  const s = emptyStore();
  for (const d of ['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13']) {
    mergeDeltas(s, { x: { runs: 1, errors: 0, totalMs: 1 } }, { day: d, keepDays: 99 });
  }
  trimDays(s, 2);
  assert.deepEqual(Object.keys(s.days).sort(), ['2026-09-12', '2026-09-13']);
});

t('mergeDeltas trims as it goes, so the store cannot grow without bound', () => {
  const s = emptyStore();
  for (let i = 1; i <= 40; i++) {
    const day = `2026-10-${String(i).padStart(2, '0')}`;
    mergeDeltas(s, { x: { runs: 1, errors: 0, totalMs: 1 } }, { day, keepDays: 14 });
  }
  assert.equal(Object.keys(s.days).length, 14);
});

t('rollup sums a window and reports its span', () => {
  const s = emptyStore();
  mergeDeltas(s, { a: { runs: 1, errors: 0, totalMs: 100 } }, { day: '2026-09-14' });
  mergeDeltas(s, { a: { runs: 2, errors: 0, totalMs: 200 }, b: { runs: 9, errors: 3, totalMs: 50 } }, { day: '2026-09-15' });
  mergeDeltas(s, { a: { runs: 4, errors: 1, totalMs: 400 } }, { day: '2026-09-16' });

  const today = rollup(s, { days: 1, until: '2026-09-16' });
  assert.deepEqual(today.services.a, { runs: 4, errors: 1, totalMs: 400 });
  assert.equal(today.days, 1);

  const week = rollup(s, { days: 7, until: '2026-09-16' });
  assert.deepEqual(week.services.a, { runs: 7, errors: 1, totalMs: 700 });
  assert.deepEqual(week.services.b, { runs: 9, errors: 3, totalMs: 50 });
  assert.equal(week.from, '2026-09-14');
  assert.equal(week.to, '2026-09-16');
});

t('rollup ignores buckets after `until`', () => {
  const s = emptyStore();
  mergeDeltas(s, { a: { runs: 1, errors: 0, totalMs: 10 } }, { day: '2026-09-16' });
  mergeDeltas(s, { a: { runs: 99, errors: 0, totalMs: 990 } }, { day: '2026-09-17' });
  assert.deepEqual(rollup(s, { days: 1, until: '2026-09-16' }).services.a, { runs: 1, errors: 0, totalMs: 10 });
});

t('a corrupt or foreign store degrades to empty instead of throwing', () => {
  for (const bad of [null, undefined, 'nope', 42, {}, { version: 99, days: {} }, { version: STORE_VERSION }]) {
    const s = normalizeStore(bad);
    assert.equal(s.version, STORE_VERSION);
    assert.deepEqual(s.days, {});
  }
});

t('normalizeStore drops junk keys and coerces junk values', () => {
  const s = normalizeStore({
    version: STORE_VERSION,
    updatedAt: '2026-09-16T00:00:00.000Z',
    days: {
      'not-a-date': { a: { runs: 1 } },
      '2026-09-16': { a: { runs: 5, totalMs: 'x' }, b: null },
    },
  });
  assert.deepEqual(Object.keys(s.days), ['2026-09-16']);
  assert.deepEqual(s.days['2026-09-16'].a, { runs: 5, errors: 0, totalMs: 0 });
  assert.ok(!('b' in s.days['2026-09-16']));
});

t('a round trip through JSON survives — this is what R2 stores', () => {
  const s = emptyStore();
  mergeDeltas(s, { a: { runs: 3, errors: 1, totalMs: 30 } }, { day: '2026-09-16' });
  assert.deepEqual(normalizeStore(JSON.parse(JSON.stringify(s))), s);
});

console.log(`\n${pass} passed`);
