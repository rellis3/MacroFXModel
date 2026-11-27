import test from 'node:test'; import assert from 'node:assert/strict';
import { asOfInfo, asOfLabel, drawAsOf } from './helixAsOf.js';

const now = Date.parse('2026-11-27T12:00:00Z');
test('labels: today, an earlier day, a date-only stamp, stale, unknown', () => {
  assert.equal(asOfLabel({ asOf: Date.parse('2026-11-27T07:02:00Z') }, now), 'AS OF 07:02 UTC');
  assert.equal(asOfLabel({ asOf: Date.parse('2026-11-26T21:00:00Z') }, now), 'AS OF 26 NOV 21:00 UTC');
  assert.equal(asOfLabel(asOfInfo('2026-11-24'), now), 'AS OF 24 NOV');
  assert.equal(asOfLabel({ asOf: Date.parse('2026-11-26T21:00:00Z'), stale: true }, now), 'AS OF 26 NOV 21:00 UTC · STALE');
  assert.equal(asOfLabel({ asOf: null }, now), 'AS OF —'); assert.equal(asOfLabel({ asOf: null, stale: true }, now), 'DATA UNAVAILABLE');
});
test('asOfInfo takes load() results, strings, seconds and marks age-stale', () => {
  assert.equal(asOfInfo({ asOf: 1_790_000_000 }).asOf, 1_790_000_000_000);
  const i = asOfInfo({ asOf: '2026-11-20T00:00:00Z' }, { now, maxAgeMs: 3 * 864e5 }); assert.equal(i.stale, true); assert.ok(i.ageMs > 6 * 864e5);
  assert.equal(asOfInfo({ asOf: now - 1000, stale: false }, { now, maxAgeMs: 864e5 }).stale, false);
});
test('drawAsOf writes one line and restores the context', () => {
  const calls = []; const ctx = { save: () => calls.push('save'), restore: () => calls.push('restore'), fillText: (t) => calls.push(t) };
  const t = drawAsOf(ctx, { W: 800, C: { tx2: '#aaa', gold: '#fc0' }, fade: 1 }, { asOf: now, stale: true }, { now });
  assert.equal(t, 'AS OF 12:00 UTC · STALE'); assert.deepEqual(calls, ['save', 'AS OF 12:00 UTC · STALE', 'restore']); assert.equal(ctx.fillStyle, '#fc0');
});
