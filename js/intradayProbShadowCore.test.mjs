// node --test js/intradayProbShadowCore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { cardDisplay, pathDisplay, sessionState, t2Predictions, firstTouches, t1Events, outcomes, corrected, CHECK_HOURS } from './intradayProbShadowCore.js';
import { IPS_PARAMS, IPS_MODEL_VERSION } from './intradayProbShadowParams.js';

test('params frozen and versioned', () => {
  assert.equal(IPS_MODEL_VERSION.length, 64);
  assert.ok(IPS_PARAMS.T1.table && IPS_PARAMS.T2_L_B.table && IPS_PARAMS.T2_L_A.table);
  assert.equal(CHECK_HOURS[0], 2); assert.equal(CHECK_HOURS.at(-1), 20);
});

test('card display reproduces the page formula', () => {
  // _breakoutProb(consumed 0.5, timeFrac 0.5): z = 0.5/sqrt(0.5) = 0.7071 -> 2(1-Phi) = 0.4795 -> 48%
  assert.equal(cardDisplay(0.5, 0.5), 0.48);
  assert.equal(cardDisplay(1, 0.5), 1);          // nothing remaining -> 100%
});

test('path display is the exceedance ratio, null when non-monotone', () => {
  assert.equal(pathDisplay({ oh_p50: 0.5, oh_p75: 0.25 }, 'oh', 'p50', 'p75'), 0.5);
  assert.equal(pathDisplay({ oh_p50: 0.2, oh_p75: 0.25 }, 'oh', 'p50', 'p75'), null);
});

test('level correction is a logit shift', () => {
  assert.ok(Math.abs(corrected(0.5, 0) - 0.5) < 1e-12);
  assert.ok(corrected(0.5, -0.15) < 0.5);
});

const bars = [
  { t: 0, open: 100, high: 100.1, low: 99.9, close: 100 },
  { t: 60, open: 100, high: 100.6, low: 99.95, close: 100.5 },   // touches OH p50 (0.5%)
  { t: 120, open: 100.5, high: 101.1, low: 100.4, close: 101 },  // touches OH p75 (1.0%)
];
const flat = { oh_p50: 0.5, oh_p75: 1.0, oh_p90: 1.5, ol_p50: 0.5, ol_p75: 1.0, ol_p90: 1.5, hl_p50: 1.2 };

test('session state uses bars strictly before the checkpoint', () => {
  const s = sessionState(bars, 120);
  assert.equal(s.open, 100); assert.equal(s.high, 100.6); assert.equal(s.lastBarTime, 60);
});

test('first touches and T1 events in a window', () => {
  const { ft } = firstTouches(bars, 100, flat, 10_000);
  assert.equal(ft.OH_p50, 60); assert.equal(ft.OH_p75, 120); assert.equal(ft.OL_p50, undefined);
  const ev = t1Events({ ft, fromSec: 0, toSec: 100, londonHourOf: () => 8, oosExceed: { oh_p50: 0.5, oh_p75: 0.25 } });
  assert.equal(ev.length, 1); assert.equal(ev[0].step, 'OH p50->p75'); assert.equal(ev[0].display, 0.5);
  assert.ok(ev[0].chal_fixed > 0 && ev[0].chal_fixed < 1);
});

test('T2 rows only below the line; outcomes to 22:00', () => {
  const p = t2Predictions({ hour: 9, runHLpct: 0.7, lines: { L_A: 1.5, L_B: 0.6 }, utcFrac: 9 / 24 });
  assert.ok(p.L_A && !p.L_B);                      // L_B already exceeded -> no row
  assert.equal(p.L_A.consumed, 0.4667);
  const o = outcomes({ bars, end22Sec: 10_000, open: 100, flat });
  assert.ok(Math.abs(o.hl_pct - 1.2) < 1e-9); assert.equal(o.ft.OH_p75, 120);
});
