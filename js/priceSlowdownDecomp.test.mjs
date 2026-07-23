/**
 * Synthetic unit tests for priceSlowdownDecomp.js — no network, no parquet.
 * Verifies the decomposition invariants and the fade/trend labelling on
 * hand-built sessions with known geometry.
 *
 *   node --test js/priceSlowdownDecomp.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decomposeSessions, groupSessions } from './priceSlowdownDecomp.js';

const SESSION_HOUR = 22;
const DAY = 86400;
// Build a session's 5-min bars from a close-price path; O/H/L derived so the
// path's own extremes are the session extremes. `dayIndex` sets the date.
function session(dayIndex, closes) {
  const base = Date.UTC(2020, 0, 1, SESSION_HOUR, 0, 0) / 1000 + dayIndex * DAY;
  return closes.map((c, i) => {
    const prev = i === 0 ? c : closes[i - 1];
    return { time: base + i * 300, open: prev, high: Math.max(prev, c), low: Math.min(prev, c), close: c };
  });
}
function flatNoise(dayIndex, mid = 100) {
  // 24 bars wobbling around mid with a day-to-day drift term, so the warmup
  // daily bars differ and Yang-Zhang σ is well-defined (identical days → σ→0).
  const closes = Array.from({ length: 24 }, (_, i) => mid + (i % 2 ? 0.03 : -0.03) + (dayIndex % 3) * 0.01);
  return session(dayIndex, closes);
}

test('groupSessions anchors on the session hour and orders chronologically', () => {
  const bars = [...flatNoise(0), ...flatNoise(1)];
  const s = groupSessions(bars, SESSION_HOUR);
  assert.equal(s.length, 2);
  assert.ok(s[0].date < s[1].date);
});

test('invariants hold on real-shaped synthetic data', () => {
  const warm = [];
  for (let d = 0; d < 42; d++) warm.push(...flatNoise(d));
  // A round-trip day: up to 101.5 then back to ~100 (open).
  const rt = session(42, [100, 100.5, 101.0, 101.5, 101.0, 100.4, 100.05, 100.0]
    .concat(Array(16).fill(100.0)));
  const { records } = decomposeSessions([...warm, ...rt], { warmup: 35, tagBand: 'hl50' });
  assert.ok(records.length >= 1);
  for (const r of records) {
    // path length ≥ net displacement, always (both are non-negative σ-normalised)
    assert.ok(r.rangeMax + 1e-9 >= Math.abs(r.dispClose), `rangeMax≥|dispClose| for ${r.date}`);
    if (r.tagged) {
      assert.ok(r.rangeAtTag >= 0 && r.budgetAtTag >= 0);
      // returning to the open implies passing the (nearer) OC-median line
      if (r.retraceToOpen) assert.equal(r.retraceToOcMed, true);
    }
  }
});

test('a round-trip day is labelled REVERSION and retraces to open', () => {
  const warm = [];
  for (let d = 0; d < 42; d++) warm.push(...flatNoise(d));
  const rt = session(42, [100, 100.5, 101.0, 101.5, 101.0, 100.4, 100.0, 100.0]
    .concat(Array(16).fill(100.0)));
  const { records } = decomposeSessions([...warm, ...rt], { warmup: 41, tagBand: 'hl50' });
  const day = records[records.length - 1];
  assert.equal(day.tagged, true);
  assert.equal(day.tagSide, 'up');
  assert.equal(day.outcome, 'REVERSION');       // closed back at the open
  assert.equal(day.retraceToOpen, true);
});

test('a one-way trend day is labelled CONTINUATION with range≈displacement', () => {
  const warm = [];
  for (let d = 0; d < 42; d++) warm.push(...flatNoise(d));
  // monotone climb, closes far from open
  const closes = [100];
  for (let i = 1; i < 24; i++) closes.push(100 + i * 0.12);
  const tr = session(42, closes);
  const { records } = decomposeSessions([...warm, ...tr], { warmup: 41, tagBand: 'hl50' });
  const day = records[records.length - 1];
  assert.equal(day.tagged, true);
  assert.equal(day.outcome, 'CONTINUATION');
  // on a pure trend, almost nothing is given back: range ≈ |displacement|
  assert.ok(Math.abs(day.rangeMax - Math.abs(day.dispClose)) < day.rangeMax * 0.1);
});
