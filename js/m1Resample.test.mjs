/**
 * Tests for the streaming M1 → N-minute resampler's fold step (_foldM1Buckets),
 * the core of readM1Resampled. The invariant that matters: a bucket that STRADDLES
 * a chunk boundary must still get its open from the first row and close from the
 * last, with high/low spanning both chunks — because the accumulator persists
 * across fold calls. Pure, no network, no parquet.
 *
 *   node --test js/m1Resample.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _foldM1Buckets } from './volBacktestM1Engine.js';

// Row format matches the M1 parquet: [open, high, low, close, vol, time].
const row = (o, h, l, c, iso) => [o, h, l, c, 0, iso];
const BUCKET = 300; // 5 min

test('fold: single bucket, one chunk — OHLC correct', () => {
  const acc = _foldM1Buckets(new Map(), [
    row(1.1000, 1.1005, 1.0998, 1.1002, '2021-01-04 08:00:00'),
    row(1.1002, 1.1010, 1.1001, 1.1008, '2021-01-04 08:01:00'),
    row(1.1008, 1.1009, 1.0995, 1.1004, '2021-01-04 08:02:00'),
  ], BUCKET);
  assert.equal(acc.size, 1);
  const b = [...acc.values()][0];
  assert.equal(b.open, 1.1000, 'open = first row');
  assert.equal(b.close, 1.1004, 'close = last row');
  assert.equal(b.high, 1.1010, 'high = max across rows');
  assert.equal(b.low, 1.0995, 'low = min across rows');
});

test('fold: bucket straddling a chunk boundary keeps open/close correct', () => {
  const acc = new Map();
  // Chunk 1: first two minutes of the 08:00 bucket.
  _foldM1Buckets(acc, [
    row(1.2000, 1.2005, 1.1999, 1.2003, '2021-01-04 08:00:00'),
    row(1.2003, 1.2012, 1.2002, 1.2009, '2021-01-04 08:01:00'),
  ], BUCKET);
  // Chunk 2: last three minutes of the SAME bucket — arrives in a later fold call.
  _foldM1Buckets(acc, [
    row(1.2009, 1.2011, 1.1990, 1.1995, '2021-01-04 08:02:00'),
    row(1.1995, 1.2000, 1.1988, 1.1997, '2021-01-04 08:03:00'),
    row(1.1997, 1.2001, 1.1996, 1.2000, '2021-01-04 08:04:00'),
  ], BUCKET);
  assert.equal(acc.size, 1, 'still one bucket across the split');
  const b = [...acc.values()][0];
  assert.equal(b.open, 1.2000, 'open from chunk 1 survives the boundary');
  assert.equal(b.close, 1.2000, 'close from chunk 2');
  assert.equal(b.high, 1.2012, 'high spans both chunks');
  assert.equal(b.low, 1.1988, 'low spans both chunks');
});

test('fold: rows split into distinct 5-min buckets by timestamp', () => {
  const acc = _foldM1Buckets(new Map(), [
    row(1, 1, 1, 1, '2021-01-04 08:04:59'),   // 08:00 bucket
    row(2, 2, 2, 2, '2021-01-04 08:05:00'),   // 08:05 bucket
    row(3, 3, 3, 3, '2021-01-04 08:09:59'),   // 08:05 bucket
    row(4, 4, 4, 4, '2021-01-04 08:10:00'),   // 08:10 bucket
  ], BUCKET);
  assert.equal(acc.size, 3, 'three distinct 5-min buckets');
  const times = [...acc.keys()].sort((a, b) => a - b);
  assert.equal(times[1] - times[0], BUCKET, 'buckets are 5 min apart');
});

test('fold: Date-typed timestamps (hyparquet emits Date) parse identically', () => {
  const acc = _foldM1Buckets(new Map(), [
    [1.5, 1.6, 1.4, 1.55, 0, new Date(Date.UTC(2021, 0, 4, 8, 0, 30))],
    [1.55, 1.7, 1.5, 1.65, 0, new Date(Date.UTC(2021, 0, 4, 8, 3, 0))],
  ], BUCKET);
  assert.equal(acc.size, 1);
  const b = [...acc.values()][0];
  assert.equal(b.open, 1.5); assert.equal(b.close, 1.65);
  assert.equal(b.high, 1.7); assert.equal(b.low, 1.4);
});

test('fold: unparseable timestamps are skipped, not fatal', () => {
  const acc = _foldM1Buckets(new Map(), [
    row(1, 1, 1, 1, 'not-a-date'),
    row(2, 2, 2, 2, '2021-01-04 08:00:00'),
  ], BUCKET);
  assert.equal(acc.size, 1, 'only the valid row bucketed');
  assert.equal([...acc.values()][0].open, 2);
});
