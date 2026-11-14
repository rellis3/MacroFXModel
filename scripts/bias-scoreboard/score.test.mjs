// node scripts/bias-scoreboard/score.test.mjs   -- the §3.9 positive control of forge/BIAS_SCOREBOARD_PREREG.md, plus Holm / BH / verdict plumbing
import assert from 'node:assert/strict';
import { positiveControl, coinUniformity, holm, bh, judge } from './score.mjs';

let passed = 0;
const ok = async (name, fn) => { await fn(); passed++; console.log('  ok ', name); };

await ok('planted forecaster (hit 0.65, coverage 0.5): hit recovered within its CI, log diff > 0; B0 vs itself exactly 0', async () => {
  const pc = await positiveControl();
  assert.ok(pc.planted.ci_contains_target, JSON.stringify(pc.planted.hit_excess_ci));
  assert.ok(pc.planted.logdiff > 0 && pc.planted.z > 1.977);
  assert.ok(pc.planted.coin_pct > 97.5);
  assert.equal(pc.b0_self_logdiff_max_abs, 0);
});

await ok('random-sign forecaster: coin-control percentiles uniform (KS p > 0.05, 200 replications)', async () => {
  const u = await coinUniformity({ reps: 200 });
  assert.ok(u.ks_p > 0.05, JSON.stringify(u));
});

await ok('Holm and BH step correctly', () => {
  assert.deepEqual(holm([0.01, 0.04, 0.03, 0.005], 0.05), [true, false, false, true]);
  assert.deepEqual(holm([0.001, 0.02], 0.048), [true, true]);
  assert.deepEqual(bh([0.01, 0.02, 0.5], 0.10), [true, true, false]);
});

await ok('judge: an incomplete record is labelled incomplete and gives no verdict word at look 1', () => {
  const J = judge([], [], { look: 1, coinB: 10 });
  assert.equal(J.complete, false);
  assert.ok(J.cells.every(c => c.verdict === 'interim'));
});

console.log(`\n${passed} passed`);
