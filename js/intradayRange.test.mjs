/**
 * Tests for the live intraday re-forecast (js/intradayRange.js). About meaning: information at h
 * uses only bars before h, the projected high never sits below the running high, more range
 * left early than late, and probabilities behave like probabilities.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionState, reforecast, londonParts, classOf, morningLevels } from './intradayRange.js';
import { INTRADAY_PARAMS } from './intradayRangeParams.js';

// A London winter day (UTC = London) of 5-minute bars, 00:00 → 21:55, gently trending.
function day(date = '2026-01-14', step = 0.00005) {
  const t0 = Date.parse(`${date}T00:00:00Z`) / 1000, out = [];
  let px = 1.1;
  for (let i = 0; i < 22 * 12; i++) {
    const o = px, c = px + (i % 7 === 0 ? -step : step); px = c;
    out.push({ t: t0 + i * 300, open: o, high: Math.max(o, c) + step / 2, low: Math.min(o, c) - step / 2, close: c });
  }
  return out;
}

test('London time conversion handles BST', () => {
  assert.deepEqual(londonParts(Date.parse('2026-07-01T07:30:00Z') / 1000), { date: '2026-07-01', hour: 8.5 });
  assert.deepEqual(londonParts(Date.parse('2026-01-01T07:30:00Z') / 1000), { date: '2026-01-01', hour: 7.5 });
});

test('checkpoint h uses only bars strictly before h:00', () => {
  const b = day();
  const s = sessionState(b);
  const cp9 = s.checkpoints.find(c => c.h === 9);
  const before9 = b.filter(x => londonParts(x.t).hour < 9);
  assert.equal(cp9.runHigh, Math.max(...before9.map(x => x.high)));
  // adding later bars must not change an earlier checkpoint
  const s2 = sessionState(b.slice(0, 12 * 10));
  assert.deepEqual(s2.checkpoints.find(c => c.h === 9), cp9);
  assert.equal(s2.checkpoints.at(-1).h, 9, 'no checkpoint beyond the data');
});

test('re-forecast: projected lines outside the running range, ordered, and shrinking through the day', () => {
  const s = sessionState(day());
  const at = h => reforecast(s.checkpoints.find(c => c.h === h), { instrument: 'EURUSD', open: s.open, sigmaDailyPct: 0.35 });
  const r8 = at(8), r20 = at(20);
  for (const r of [r8, r20]) {
    assert.ok(r.projHigh.p50 >= s.checkpoints.find(c => c.h === r.h).runHigh - 1e-12);
    assert.ok(r.projHigh.p50 <= r.projHigh.p75 && r.projHigh.p75 <= r.projHigh.p90);
    assert.ok(r.projLow.p90 <= r.projLow.p75 && r.projLow.p75 <= r.projLow.p50);
  }
  assert.ok(r8.remaining.p75 > r20.remaining.p75, 'more range left at 08:00 than at 20:00');
  const lvl = r8.projHigh.p75;
  const p = r8.probUp(lvl);
  assert.ok(p > 0.15 && p < 0.35, `P(reach its own p75 line) ≈ 25%, got ${p}`);
  assert.equal(r8.probUp(s.checkpoints.find(c => c.h === 8).runHigh - 1e-6), 1, 'already traded through = certain');
});

test('aliases and coverage: SPX500 maps to the index class; unknown instruments return null', () => {
  assert.equal(classOf('SPX500'), 'indices');
  assert.equal(classOf('EURUSD'), 'fx_gold');
  const s = sessionState(day());
  assert.equal(reforecast(s.checkpoints[0], { instrument: 'WHEAT', open: 1, sigmaDailyPct: 1 }), null);
  assert.equal(Object.keys(INTRADAY_PARAMS.classes).length, 2);
});

test('morning levels sit off the open', () => {
  const m = morningLevels({ oh: { p50: 0.2, p75: 0.35, p90: 0.5 }, ol: { p50: 0.2, p75: 0.35, p90: 0.5 } }, 100);
  assert.ok(Math.abs(m.up_p75 - 100.35) < 1e-9 && Math.abs(m.dn_p50 - 99.8) < 1e-9);
});
