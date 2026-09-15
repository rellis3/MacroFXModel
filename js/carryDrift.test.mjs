import test from 'node:test';
import assert from 'node:assert/strict';
import { brokerCarry, resolveCarryDrift, carryComparison } from './carryDrift.js';

const NOW = Date.parse('2026-09-15T00:00:00Z');
const daysAgo = n => new Date(NOW - n * 864e5).toISOString().slice(0, 10);

// ── Stripping the broker spread ──────────────────────────────────────────────

test('brokerCarry recovers the mid carry and the spread from an asymmetric quote', () => {
  // Construct from known c and s so there is a truth to hit:
  //   longRate = c - s, shortRate = -c - s
  const c = -1.4, s = 0.7;
  const b = brokerCarry(c - s, -c - s);
  assert.ok(Math.abs(b.midCarryPctPerYear - c) < 1e-9, `${b.midCarryPctPerYear} vs ${c}`);
  assert.ok(Math.abs(b.spreadPctPerYear - s) < 1e-9, `${b.spreadPctPerYear} vs ${s}`);
  assert.ok(Math.abs(b.fwdDriftPctPerYear + c) < 1e-9, 'forward drift is the mirror of long-base carry');
});

// The bug this guards: longRate alone folds the broker's spread into the market's
// drift, biasing every pair the same way. With a symmetric spread the mid is the
// average, never the long leg.
test('taking longRate alone would be biased by the spread; the mid is not', () => {
  const b = brokerCarry(-2.1, 0.7);           // c = -1.4, s = 0.7
  assert.equal(b.midCarryPctPerYear, -1.4);
  assert.notEqual(b.midCarryPctPerYear, -2.1, 'must not just echo longRate');
  assert.ok(b.spreadPctPerYear > 0, 'broker keeps something on each side');
});

test('a zero-spread quote gives carry with no haircut', () => {
  const b = brokerCarry(1.5, -1.5);
  assert.equal(b.midCarryPctPerYear, 1.5);
  assert.equal(b.spreadPctPerYear, 0);
});

test('brokerCarry surfaces an impossible negative spread rather than clamping it', () => {
  // longRate + shortRate > 0 would mean the broker pays both sides — the sign of
  // inputs passed as fractions, or swapped. Reported, not hidden.
  const b = brokerCarry(2.0, 1.0);
  assert.ok(b.spreadPctPerYear < 0, `${b.spreadPctPerYear} should be negative and visible`);
});

test('brokerCarry returns nulls on unusable input', () => {
  for (const bad of [[NaN, 1], [1, undefined], [null, null]]) {
    assert.equal(brokerCarry(bad[0], bad[1]).fwdDriftPctPerYear, null);
  }
});

// ── Source preference ────────────────────────────────────────────────────────

test('broker financing wins over interbank when both are fresh', () => {
  const r = resolveCarryDrift({
    pair: 'EURUSD', base: 'EUR', quote: 'USD',
    broker: { longRatePct: -2.1, shortRatePct: 0.7, asOf: daysAgo(1) },
    interbank: { basePct: 2.0, quotePct: 4.0, baseAsOf: daysAgo(40), quoteAsOf: daysAgo(40) },
    now: NOW,
  });
  assert.equal(r.source, 'broker');
  assert.ok(r.spreadPctPerYear > 0, 'broker path reports the spread');
});

test('interbank is used when no broker data is supplied', () => {
  const r = resolveCarryDrift({
    pair: 'EURUSD', base: 'EUR', quote: 'USD',
    interbank: { basePct: 2.0, quotePct: 4.0, baseAsOf: daysAgo(40), quoteAsOf: daysAgo(40) },
    now: NOW,
  });
  assert.equal(r.source, 'interbank');
  // CIP: quote pays more, so the forward sits above spot -> positive spot drift.
  assert.ok(r.fwdDriftPctPerYear > 0, `${r.fwdDriftPctPerYear}`);
  assert.ok(Math.abs(r.fwdDriftPctPerDay - 2 / 252) < 1e-5);
  assert.equal(r.spreadPctPerYear, null, 'interbank has no broker spread to report');
});

// ── Staleness, the failure this repo has already had once ───────────────────

test('stale broker data is refused and falls through to interbank', () => {
  const r = resolveCarryDrift({
    pair: 'EURUSD', base: 'EUR', quote: 'USD',
    broker: { longRatePct: -2.1, shortRatePct: 0.7, asOf: daysAgo(45) },   // > daily budget
    interbank: { basePct: 2.0, quotePct: 4.0, baseAsOf: daysAgo(40), quoteAsOf: daysAgo(40) },
    now: NOW,
  });
  assert.equal(r.source, 'interbank', 'must not silently use 45-day-old financing');
  assert.equal(r.refused.length, 1);
  assert.equal(r.refused[0].source, 'broker');
  assert.equal(r.refused[0].why, 'stale');
  assert.equal(r.refused[0].ageDays, 45);
});

// The CHF case: a discontinued FRED series scored a 2024 print for 33 months.
test('a long-dead interbank leg yields NO carry rather than an old one', () => {
  const r = resolveCarryDrift({
    pair: 'USDCHF', base: 'USD', quote: 'CHF',
    interbank: { basePct: 4.0, quotePct: 1.0, baseAsOf: daysAgo(30), quoteAsOf: daysAgo(1000) },
    now: NOW,
  });
  assert.equal(r.source, null, 'a 1000-day-old leg must not produce a number');
  assert.equal(r.fwdDriftPctPerDay, null);
  assert.equal(r.stale, true);
  assert.equal(r.refused[0].ageDays, 1000, 'the OLDER leg governs');
});

test('the older interbank leg governs, not the average of the two', () => {
  // A fresh USD leg must not rescue a dead CHF one. Average age would be 500 and
  // would pass the 130-day monthly budget; the max is 1000 and does not.
  const r = resolveCarryDrift({
    base: 'USD', quote: 'CHF',
    interbank: { basePct: 4, quotePct: 1, baseAsOf: daysAgo(0), quoteAsOf: daysAgo(1000) },
    now: NOW,
  });
  assert.equal(r.source, null);
});

test('both sources stale -> nothing, with both refusals explained', () => {
  const r = resolveCarryDrift({
    base: 'EUR', quote: 'USD',
    broker: { longRatePct: -2.1, shortRatePct: 0.7, asOf: daysAgo(60) },
    interbank: { basePct: 2, quotePct: 4, baseAsOf: daysAgo(900), quoteAsOf: daysAgo(900) },
    now: NOW,
  });
  assert.equal(r.source, null);
  assert.equal(r.stale, true);
  assert.deepEqual(r.refused.map(x => x.source), ['broker', 'interbank']);
});

test('missing dates are treated as usable, not as infinitely old', () => {
  // Age is unknown, not large. Refusing here would drop every caller that has
  // rates but no timestamp — the pre-existing shape elsewhere in this repo.
  const r = resolveCarryDrift({
    base: 'EUR', quote: 'USD',
    interbank: { basePct: 2.0, quotePct: 4.0 },
    now: NOW,
  });
  assert.equal(r.source, 'interbank');
  assert.equal(r.ageDays, null);
  assert.equal(r.stale, false);
});

test('no data at all is a clean null with nothing refused', () => {
  const r = resolveCarryDrift({ base: 'EUR', quote: 'USD', now: NOW });
  assert.equal(r.source, null);
  assert.equal(r.stale, false, 'absent is not the same as stale');
  assert.deepEqual(r.refused, []);
});

// ── Units ────────────────────────────────────────────────────────────────────

test('per-day is per-TRADING-day, matching driftAnatomy pctPerDay', () => {
  const r = resolveCarryDrift({
    base: 'EUR', quote: 'USD', interbank: { basePct: 0, quotePct: 252 }, now: NOW,
  });
  assert.ok(Math.abs(r.fwdDriftPctPerDay - 1) < 1e-6, '252%/yr over 252 days is 1%/day');
});

test('a fractional financing rate passed by mistake is 100x too small, visibly', () => {
  // Documented trap: OANDA returns fractions. This asserts the module does NOT
  // silently rescale, so the caller's unit bug stays the caller's to find.
  const asFraction = resolveCarryDrift({
    base: 'EUR', quote: 'USD',
    broker: { longRatePct: -0.021, shortRatePct: 0.007, asOf: daysAgo(1) }, now: NOW,
  });
  const asPercent = resolveCarryDrift({
    base: 'EUR', quote: 'USD',
    broker: { longRatePct: -2.1, shortRatePct: 0.7, asOf: daysAgo(1) }, now: NOW,
  });
  assert.ok(Math.abs(asPercent.fwdDriftPctPerYear / asFraction.fwdDriftPctPerYear - 100) < 1e-6);
});

// ── Comparison ───────────────────────────────────────────────────────────────

test('carryComparison reports the haircut between tradeable and theoretical', () => {
  const c = carryComparison({
    pair: 'EURUSD', base: 'EUR', quote: 'USD',
    broker: { longRatePct: -2.6, shortRatePct: 0.6, asOf: daysAgo(1) },   // mid -1.6, spread 1.0
    interbank: { basePct: 2.0, quotePct: 4.0, baseAsOf: daysAgo(30), quoteAsOf: daysAgo(30) },
    now: NOW,
  });
  assert.equal(c.tradeable.source, 'broker');
  assert.equal(c.theoretical.source, 'interbank');
  // interbank mid carry long-EUR is -2.0; broker mid is -1.6. |2.0| - |1.6| = 0.4.
  assert.ok(Math.abs(c.haircutPctPerYear - 0.4) < 1e-6, `${c.haircutPctPerYear}`);
});

test('carryComparison leaves the haircut null when either side is unavailable', () => {
  const c = carryComparison({
    base: 'EUR', quote: 'USD',
    interbank: { basePct: 2, quotePct: 4, baseAsOf: daysAgo(30), quoteAsOf: daysAgo(30) },
    now: NOW,
  });
  assert.equal(c.tradeable.source, null);
  assert.equal(c.haircutPctPerYear, null);
});

test('carryComparison keeps the two sources independent', () => {
  // A stale broker leg must not contaminate the theoretical side.
  const c = carryComparison({
    base: 'EUR', quote: 'USD',
    broker: { longRatePct: -2.6, shortRatePct: 0.6, asOf: daysAgo(90) },
    interbank: { basePct: 2, quotePct: 4, baseAsOf: daysAgo(30), quoteAsOf: daysAgo(30) },
    now: NOW,
  });
  assert.equal(c.tradeable.source, null);
  assert.equal(c.theoretical.source, 'interbank');
  assert.equal(c.haircutPctPerYear, null);
});
