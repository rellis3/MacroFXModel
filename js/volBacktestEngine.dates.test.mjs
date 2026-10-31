/**
 * fetchD1Aligned date labelling — synthetic candles, no network.
 * Run: node --test js/volBacktestEngine.dates.test.mjs
 *
 * Contracts (REPO_REVIEW_2026-10-31 S1):
 *   1. A London-midnight candle is labelled with its LONDON date in summer and winter,
 *      including the DST changeover weeks (it starts 23:00 UTC the previous day in BST).
 *   2. Friday candles keep a Friday label; weekend-dated candles (Sunday stub) are dropped.
 *   3. `to` cuts the series inclusively (lockbox).
 *   4. Non-midnight alignment keeps the original UTC-date label.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { _mapD1Candles } from './volBacktestEngine.js';

const LON = { dailyAlignment: 0, alignmentTimezone: 'Europe/London' };
const c = (iso, close = 1.1) => ({ time: iso, complete: true, mid: { o: '1', h: '1.2', l: '0.9', c: String(close) } });

test('BST: London-midnight candle starting 23:00 UTC is labelled with the next (London) date', () => {
  const out = _mapD1Candles([c('2026-06-14T23:00:00.000000000Z'), c('2026-06-18T23:00:00.000000000Z')], LON);
  assert.deepEqual(out.map(b => b.date), ['2026-06-15', '2026-06-19']);   // Monday, Friday
});

test('GMT: candle starting 00:00 UTC keeps its date', () => {
  const out = _mapD1Candles([c('2026-01-12T00:00:00Z'), c('2026-01-16T00:00:00Z')], LON);
  assert.deepEqual(out.map(b => b.date), ['2026-01-12', '2026-01-16']);
});

test('DST changeover weeks label every weekday once', () => {
  // spring: BST starts Sun 2026-03-29; autumn: GMT returns Sun 2026-10-25
  const spring = ['2026-03-26T00:00:00Z', '2026-03-27T00:00:00Z', '2026-03-29T23:00:00Z', '2026-03-30T23:00:00Z'];
  const autumn = ['2026-10-21T23:00:00Z', '2026-10-22T23:00:00Z', '2026-10-26T00:00:00Z', '2026-10-27T00:00:00Z'];
  assert.deepEqual(_mapD1Candles(spring.map(t => c(t)), LON).map(b => b.date), ['2026-03-26', '2026-03-27', '2026-03-30', '2026-03-31']);
  assert.deepEqual(_mapD1Candles(autumn.map(t => c(t)), LON).map(b => b.date), ['2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27']);
});

test('weekend-dated candles (Sunday stub) are dropped', () => {
  const out = _mapD1Candles([c('2026-06-11T23:00:00Z'), c('2026-06-13T23:00:00Z'), c('2026-06-14T23:00:00Z')], LON);
  assert.deepEqual(out.map(b => b.date), ['2026-06-12', '2026-06-15']);   // Fri kept, Sun stub gone, Mon kept
});

test('`to` cuts inclusively at the lockbox', () => {
  const out = _mapD1Candles([c('2026-08-20T23:00:00Z'), c('2026-08-23T23:00:00Z')], { ...LON, to: '2026-08-21' });
  assert.deepEqual(out.map(b => b.date), ['2026-08-21']);
});

test('non-midnight alignment keeps the UTC-date label', () => {
  const out = _mapD1Candles([c('2026-06-14T21:00:00Z')], { dailyAlignment: 17, alignmentTimezone: 'America/New_York' });
  assert.deepEqual(out.map(b => b.date), ['2026-06-14']);
});

test('incomplete or zero-close candles are dropped', () => {
  const out = _mapD1Candles([{ ...c('2026-06-14T23:00:00Z'), complete: false }, c('2026-06-15T23:00:00Z', 0)], LON);
  assert.equal(out.length, 0);
});
