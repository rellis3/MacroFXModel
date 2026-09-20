import assert from 'node:assert/strict';
import { fridays, weekly, changes, zSeries, zWord, histogram, analogues, forward, placeboTest, median } from './weekMap.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

t('fridays: ends on the last Friday on or before `to`, steps back by seven days', () => {
  const f = fridays(Date.parse('2026-08-01'), Date.parse('2026-09-20'));   // Sunday 20 Sep -> Fri 18 Sep
  assert.equal(f.at(-1), '2026-09-18'); assert.equal(f[0], '2026-08-07'); assert.equal(f.length, 7);
  for (const d of f) assert.equal(new Date(d).getUTCDay(), 5);
});
t('weekly: the last observation on or before each Friday; a stale series (>10 days) reads null', () => {
  const obs = [{ date: '2026-09-10', value: 1 }, { date: '2026-09-11', value: 2 }, { date: '2026-09-17', value: 3 }];
  assert.deepEqual(weekly(obs, ['2026-09-11', '2026-09-18', '2026-10-02']), [2, 3, null]);
});
t('changes by kind, z walk-forward needs a year', () => {
  assert.deepEqual(changes([4.5, 4.6, 4.4], 'bp').map(x => x == null ? null : +x.toFixed(6)), [null, 10, -20]);
  assert.deepEqual(changes([100, 110, 99], 'pct').map(x => x == null ? null : +x.toFixed(2)), [null, 10, -10]);
  assert.deepEqual(changes([15, 17], 'pt'), [null, 2]);
  const ch = Array.from({ length: 60 }, (_, i) => (i % 2 ? 1 : -1)); ch.push(5);
  const z = zSeries(ch); assert.equal(z[10], null); assert.ok(z[60] > 3);
  assert.equal(zWord(0.4), 'ordinary'); assert.equal(zWord(-1.5), 'notable'); assert.equal(zWord(2.4), 'unusual'); assert.equal(zWord(3.2), 'rare');
});
t('histogram bins in z, counts every change', () => {
  const ch = Array.from({ length: 500 }, (_, i) => Math.sin(i) * 3);
  const h = histogram(ch); assert.equal(h.counts.reduce((a, b) => a + b, 0), 500); assert.equal(h.counts.length, 41);
});
t('analogues: nearest in z, crowding rule keeps neighbours eight weeks apart, only the past', () => {
  const states = []; for (let i = 0; i < 100; i++) states.push([i % 10 === 0 ? 0.1 : 5, i % 10 === 0 ? 0.1 : 5]);   // every tenth week looks like [0,0]
  states.push([0, 0]);
  const an = analogues(states, 100, { k: 3, crowd: 8 });
  assert.deepEqual(an.map(x => x.i).sort((a, b) => a - b), [70, 80, 90]);
  // crowding: two near-identical adjacent weeks -> only one taken
  const s2 = [[0, 0], [0, 0.01], [9, 9], [9, 9], [9, 9], [9, 9], [9, 9], [9, 9], [9, 9], [9, 9], [9, 9], [0.02, 0]];
  const an2 = analogues(s2, 11, { k: 2, crowd: 8 });
  assert.equal(an2[0].i, 0); assert.ok(!an2.some(x => x.i === 1));   // week 1 is a near-twin of week 0 and inside the crowding window
  assert.deepEqual(analogues([[null, 1], [1, 1]], 1), []);   // a candidate with a missing dimension is skipped
});
t('forward change and the placebo test run end to end on synthetic data', () => {
  assert.equal(+forward([100, 101, 110], 'pct', 0, 2).toFixed(6), 10); assert.equal(+forward([4.0, 4.1, 4.3], 'bp', 0, 2).toFixed(6), 30);
  let a = 7; const rnd = () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; };
  const N = 700; const states = Array.from({ length: N }, () => [rnd() * 2 - 1, rnd() * 2 - 1]);
  const vals = [100]; for (let i = 1; i < N; i++) vals.push(vals[i - 1] * (1 + (rnd() - 0.5) * 0.04));
  const r = placeboTest(states, { x: { vals, kind: 'pct' } }, { weeks: 120, reps: 20, h: 13 });
  assert.ok(r.x.n > 50); assert.ok(r.x.placebo.p95 >= r.x.placebo.p50); assert.ok(['PASS', 'NULL'].includes(r.x.verdict));
});
console.log(`weekMap: ${n} groups, all passed`);
