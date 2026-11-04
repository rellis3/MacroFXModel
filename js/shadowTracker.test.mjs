// Tests for js/shadowTracker.js.   node js/shadowTracker.test.mjs
import assert from 'node:assert/strict';
import { keysOf, ruleFromSlice, validateRule, takes, evaluate, describe } from './shadowTracker.js';
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
t('keys use London time and the review buckets', () => {
  const k = keysOf({ inst: 'eurusd', dir: -1, openMs: Date.parse('2026-07-06T07:30:00Z'), closeMs: Date.parse('2026-07-06T10:00:00Z') });
  assert.deepEqual(k, { instrument: 'EURUSD', direction: 'Short', hour: '07-12', weekday: 'Mon', month: '07', hold: '1-4h' });
});
t('rules from slices; only entry-time dimensions', () => {
  assert.deepEqual(ruleFromSlice('instrument = EURUSD', 'drop'), [{ dim: 'instrument', op: 'drop', values: ['EURUSD'] }]);
  assert.throws(() => ruleFromSlice('feature:atr = low', 'drop')); assert.throws(() => ruleFromSlice('tag:x = yes', 'keep')); assert.throws(() => validateRule([{ dim: 'hour', op: 'maybe', values: ['07-12'] }]));
  const r = validateRule([{ dim: 'instrument', op: 'keep', values: ['gbpusd', 'EURUSD'] }, { dim: 'direction', op: 'drop', values: 'Short' }]);
  assert.equal(describe(r), 'only instrument GBPUSD or EURUSD, skip direction Short');
  assert.equal(takes(r, { inst: 'GBPUSD', dir: 1, openMs: 0 }), true); assert.equal(takes(r, { inst: 'GBPUSD', dir: -1, openMs: 0 }), false);
});
const start = Date.parse('2026-11-01T00:00:00Z');
const mk = (i, inst, R, before = false) => ({ inst, dir: 1, R, openMs: (before ? start - 864e5 * 10 : start) + i * 3600e3, closeMs: (before ? start - 864e5 * 10 : start) + i * 3600e3 + 1800e3 });
t('only forward trades count; collecting until enough', () => {
  const tr = [...Array.from({ length: 50 }, (_, i) => mk(i, 'EURUSD', -1, true)), ...Array.from({ length: 20 }, (_, i) => mk(i, 'GBPUSD', 1))];
  const e = evaluate({ rule: ruleFromSlice('instrument = EURUSD', 'drop'), startedAt: start }, tr);
  assert.equal(e.trades, 20); assert.equal(e.verdict, 'collecting'); assert.match(e.need, /10 more kept and 10 more skipped/);
});
t('a real filter helps; a useless one does not', () => {
  const tr = []; for (let i = 0; i < 160; i++) tr.push(mk(i, i % 2 ? 'EURUSD' : 'GBPUSD', i % 2 ? (i % 4 === 1 ? -1 : 0.2) : (i % 3 ? 1 : -1)));
  const good = evaluate({ rule: ruleFromSlice('instrument = EURUSD', 'drop'), startedAt: start }, tr);
  assert.equal(good.verdict, 'helping'); assert.ok(good.filtered.meanR > good.asTraded.meanR);
  const bad = evaluate({ rule: ruleFromSlice('instrument = GBPUSD', 'drop'), startedAt: start }, tr); assert.equal(bad.verdict, 'hurting');
});
console.log(`shadowTracker: ${n} tests passed`);
