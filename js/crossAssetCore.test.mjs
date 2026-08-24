// Tests for js/crossAssetCore.js
// Run:  node --test js/crossAssetCore.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  logReturns, realisedVolSeries, percentileOf, volDirection, volRegimeLabel,
  normaliseFromStart, lastFinite, usdStrengthSeries, driverAlignment,
} from './crossAssetCore.js';

const approx = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} !== ${b}`);

// ── realised vol ────────────────────────────────────────────────────────────

test('realisedVolSeries recovers a known volatility', () => {
  // Alternating ±1% daily moves: sd of returns ≈ 0.01 (mean ~0), annualised
  // ≈ 0.01 * sqrt(252) ≈ 15.87%.
  const closes = [100];
  for (let i = 1; i <= 60; i++) closes.push(closes[i - 1] * (i % 2 ? 1.01 : 1 / 1.01));
  const rv = realisedVolSeries(closes, 20);
  const last = rv[rv.length - 1];
  assert.ok(last > 14 && last < 18, `expected ~15.9%, got ${last}`);
});

test('realisedVolSeries never uses future data', () => {
  // Vol is flat then explodes. The reading at the last calm bar must not yet
  // know about the explosion that follows it.
  const closes = [];
  for (let i = 0; i < 40; i++) closes.push(100 + (i % 2 ? 0.1 : -0.1));
  const calmEnd = closes.length - 1;
  for (let i = 0; i < 40; i++) closes.push(100 + (i % 2 ? 10 : -10));
  const rv = realisedVolSeries(closes, 20);
  assert.ok(rv[calmEnd] < 5, `calm-period reading leaked the later spike: ${rv[calmEnd]}`);
  assert.ok(rv[closes.length - 1] > 50, 'the spike itself should read high');
});

test('realisedVolSeries leaves a partial window null rather than guessing', () => {
  const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
  const rv = realisedVolSeries(closes, 20);
  for (let i = 0; i < 20; i++) assert.equal(rv[i], null, `index ${i} should be null`);
  assert.ok(rv[25] != null);
  assert.equal(rv.length, closes.length, 'output must stay aligned to input');
});

test('a bad price nulls only the windows that span it', () => {
  const closes = Array.from({ length: 60 }, (_, i) => 100 * (1 + 0.001 * (i % 3)));
  closes[30] = 0;                       // a zero/garbage print
  const rv = realisedVolSeries(closes, 10);
  assert.equal(rv[35], null, 'a window containing the bad print must be null');
  assert.ok(rv[59] != null, 'a window clear of it must still compute');
});

test('logReturns marks gaps instead of skipping them', () => {
  const r = logReturns([100, 110, null, 120]);
  assert.equal(r.length, 3);
  approx(r[0], Math.log(1.1));
  assert.equal(r[1], null);
});

// ── percentile / direction / regime ─────────────────────────────────────────

test('percentileOf ranks within the sample', () => {
  const arr = Array.from({ length: 101 }, (_, i) => i);
  assert.equal(percentileOf(50, arr), 50);
  assert.equal(percentileOf(0, arr), 0);
  assert.equal(percentileOf(100, arr), 99);
  assert.equal(percentileOf(null, arr), null);
  assert.equal(percentileOf(5, []), null);
});

test('volDirection needs a real move, not noise', () => {
  const flat = Array.from({ length: 40 }, () => 20 + (Math.sin(1) * 0.01));
  assert.equal(volDirection(flat).label, 'Stable');
  // Defaults compare the last 5 readings against the 15 BEFORE them, so the
  // step has to land inside the tail — a 20/20 split puts the whole prior
  // window on the far side of it and correctly reads Stable.
  const rising = [...Array(35).fill(10), ...Array(5).fill(30)];
  assert.equal(volDirection(rising).label, 'Expanding');
  const falling = [...Array(35).fill(30), ...Array(5).fill(10)];
  assert.equal(volDirection(falling).label, 'Contracting');
  const stepTooEarly = [...Array(20).fill(10), ...Array(20).fill(30)];
  assert.equal(volDirection(stepTooEarly).label, 'Stable',
    'a move entirely inside the comparison window is not a change in direction');
});

test('volDirection is null without enough history', () => {
  assert.equal(volDirection([1, 2, 3]), null);
});

test('volRegimeLabel tiers on percentile', () => {
  assert.equal(volRegimeLabel(85), 'Elevated');
  assert.equal(volRegimeLabel(50), 'Normal');
  assert.equal(volRegimeLabel(10), 'Compressed');
  assert.equal(volRegimeLabel(null), null);
});

// ── driver board ────────────────────────────────────────────────────────────

test('normaliseFromStart puts different scales on one axis', () => {
  approx(normaliseFromStart([100, 110])[1], 10);
  approx(normaliseFromStart([20000, 19000])[1], -5);
  assert.equal(normaliseFromStart([100, 110])[0], 0, 'the window start is always 0%');
});

test('normaliseFromStart survives leading nulls', () => {
  const out = normaliseFromStart([null, 200, 220]);
  assert.equal(out[0], null);
  approx(out[2], 10, 1e-9);
});

test('usdStrengthSeries inverts the quote-currency legs', () => {
  // EUR/USD down 1% and USD/JPY up 1% are the SAME event: a stronger dollar.
  const { series, legs } = usdStrengthSeries({ 'EUR/USD': [0, -1], 'USD/JPY': [0, 1] });
  assert.equal(legs, 2);
  approx(series[1], 1, 1e-9);
});

test('usdStrengthSeries with every leg agreeing is unambiguous', () => {
  const { series } = usdStrengthSeries({
    'EUR/USD': [0, -2], 'GBP/USD': [0, -2], 'AUD/USD': [0, -2], 'USD/JPY': [0, 2],
  });
  approx(series[1], 2, 1e-9);
});

test('a missing leg degrades the basket, it does not skew it', () => {
  const both = usdStrengthSeries({ 'EUR/USD': [0, -1], 'USD/JPY': [0, 1] });
  const one  = usdStrengthSeries({ 'EUR/USD': [0, -1] });
  assert.equal(one.legs, 1);
  approx(one.series[1], both.series[1], 1e-9, 'dropping an agreeing leg must not change the level');
  assert.deepEqual(usdStrengthSeries({}).series, []);
});

test('driverAlignment separates aligned, mixed and quiet', () => {
  assert.equal(driverAlignment({ a: 1, b: 2, c: 0.5 }).label, 'Risk-on tilt');
  assert.equal(driverAlignment({ a: -1, b: -2 }).label, 'Risk-off tilt');
  assert.equal(driverAlignment({ a: 1, b: -2 }).label, 'Mixed');
  assert.equal(driverAlignment({ a: 0.01, b: -0.02 }).label, 'Quiet');
  assert.equal(driverAlignment({}).label, 'No data');
});

test('one lone mover is not an alignment', () => {
  const d = driverAlignment({ a: 3, b: 0.01, c: 0.01, d: -0.01 });
  assert.equal(d.up, 1);
  assert.equal(d.label, 'Quiet', 'a single driver moving is not a board-wide tilt');
});

test('driverAlignment counts add up to the inputs it could read', () => {
  const d = driverAlignment({ a: 1, b: -1, c: 0, d: null });
  assert.equal(d.total, 3);
  assert.equal(d.up + d.down + d.neutral, 3);
});

test('lastFinite ignores trailing nulls', () => {
  assert.equal(lastFinite([1, 2, 3, null, null]), 3);
  assert.equal(lastFinite([null]), null);
});
