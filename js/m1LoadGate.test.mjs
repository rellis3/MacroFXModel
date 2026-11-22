import test from 'node:test';
import assert from 'node:assert/strict';
import { loadM1ForPair, m1LoadStats } from './volBacktestM1Engine.js';

// the gate must never run more than the limit at once and must let every caller through; use a pair with no file so each call fails fast, and watch the concurrency from the stats
test('loadM1ForPair callers queue behind the gate and all complete (concurrency never above the limit)', async () => {
  let maxActive = 0; const tick = setInterval(() => { maxActive = Math.max(maxActive, m1LoadStats.active()); }, 1);
  const calls = Array.from({ length: 8 }, (_, i) => loadM1ForPair(`nopair${i}`, '/nonexistent-m1-dir').then(() => 'ok', e => 'err'));
  const res = await Promise.all(calls); clearInterval(tick);
  assert.equal(res.length, 8); assert.ok(maxActive <= 2, `max active ${maxActive}`);
  assert.equal(m1LoadStats.active(), 0); assert.equal(m1LoadStats.waiting(), 0); assert.ok(m1LoadStats.total >= 8);
});
