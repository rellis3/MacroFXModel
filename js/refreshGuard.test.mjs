import test from 'node:test'; import assert from 'node:assert/strict';
import { createRefreshGuard } from './refreshGuard.js';

test('concurrent refreshes share one run', async () => {
  let runs = 0, release; const gate = new Promise(r => { release = r; });
  const refresh = createRefreshGuard(async () => { runs++; await gate; return { at: 1, error: null }; });
  const ps = Array.from({ length: 20 }, () => refresh()); release();
  const out = await Promise.all(ps); assert.equal(runs, 1); assert.ok(out.every(o => o === out[0]));
});
test('after a failure it backs off (growing), then tries again; success resets', async () => {
  let t = 0, runs = 0, fail = true; const state = { error: null };
  const refresh = createRefreshGuard(async () => { runs++; state.error = fail ? 'OANDA 504' : null; return state; }, { now: () => t, idle: () => state, backoffMs: [1000, 5000] });
  await refresh(); assert.equal(runs, 1); assert.equal(refresh.state().fails, 1);
  await refresh(); await refresh(); assert.equal(runs, 1, 'inside the back-off the cached state is returned');
  t = 1500; await refresh(); assert.equal(runs, 2); assert.equal(refresh.state().fails, 2);
  t = 4000; await refresh(); assert.equal(runs, 2, 'second back-off is longer');
  t = 7000; fail = false; await refresh(); assert.equal(runs, 3); assert.equal(refresh.state().fails, 0);
  await refresh({ force: true }); assert.equal(runs, 4);
});
test('a throwing run rejects the callers and counts as a failure', async () => {
  let t = 0; const refresh = createRefreshGuard(async () => { throw new Error('boom'); }, { now: () => t, idle: () => 'cached' });
  await assert.rejects(refresh(), /boom/); assert.equal(await refresh(), 'cached');
});
