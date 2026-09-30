// Offline tests for js/visitMemory.js — run: node js/visitMemory.test.mjs
import assert from 'node:assert/strict';
import { knownOutcome, prevOutcomeSameDayAt, rollingRateAt } from './visitMemory.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };

t('a visit reads as its outcome only once it has resolved', () => {
  const v = { outcome: 'out', resolveTime: 200 };
  assert.equal(knownOutcome(v, 199), 'neither');
  assert.equal(knownOutcome(v, 200), 'out');
  assert.equal(knownOutcome({ outcome: 'neither', resolveTime: null }, 1e9), 'neither');
  assert.equal(knownOutcome(null, 5), null);
});

t('THE LEAK: a re-armed retest before the first touch resolves sees nothing', () => {
  // touch A at 100 resolves 'out' at 300; retest B fires at 250.
  const hist = [{ outcome: 'out', resolveTime: 300, dayIdx: 7 }];
  assert.equal(prevOutcomeSameDayAt(hist, 7, 250), null);   // was 'out' via hist.at(-1)
  assert.equal(prevOutcomeSameDayAt(hist, 7, 300), 'out');
});

t('scans back past an unresolved visit to the latest one resolved by then', () => {
  const hist = [
    { outcome: 'back', resolveTime: 150, dayIdx: 7 },
    { outcome: 'out', resolveTime: 400, dayIdx: 7 },
  ];
  assert.equal(prevOutcomeSameDayAt(hist, 7, 200), 'back');
  assert.equal(prevOutcomeSameDayAt(hist, 7, 400), 'out');
});

t('never reaches into an earlier day for the same-day read', () => {
  const hist = [{ outcome: 'out', resolveTime: 50, dayIdx: 6 }, { outcome: 'neither', resolveTime: null, dayIdx: 7 }];
  assert.equal(prevOutcomeSameDayAt(hist, 7, 1e9), null);
  assert.equal(prevOutcomeSameDayAt(hist.map(v => ({ ...v, sessIdx: v.dayIdx })), 7, 1e9, 'sessIdx'), null);
});

t('rolling rate counts only outcomes known by then', () => {
  const hist = [
    { outcome: 'out', resolveTime: 10 }, { outcome: 'back', resolveTime: 20 },
    { outcome: 'out', resolveTime: 500 },
  ];
  assert.deepEqual(rollingRateAt(hist, 100), { n: 3, outPct: 33, backPct: 33 });
  assert.deepEqual(rollingRateAt(hist, 500), { n: 3, outPct: 67, backPct: 33 });
  assert.equal(rollingRateAt(hist.slice(0, 2), 100), null);
});

console.log(`\n${n} passed`);
