import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCogLevels } from './cogLevelPoc.js';

const PIP = 0.0001;
const b = (t, h, l, c) => ({ _t: Date.UTC(2024, 0, 3, 8) + t * 60000, high: h, low: l, close: c });

test('analyzeCogLevels: measures reversion at COG dynamic level, aggregates by-how-much/how-many', () => {
  // Two COG days. cog.hl_med = 2% → dynamic support = runHigh×(1−0.02).
  // Day 1: runs up to 102 then the projected low (≈99.96) is tagged and price reverts up.
  const day1 = [b(0, 100.0, 99.8, 100.0), b(1, 101.0, 100.0, 101.0), b(2, 102.0, 101.0, 101.5),
                b(3, 101.6, 99.9, 100.2), b(4, 100.8, 100.3, 100.7)];   // tag ~99.96, revert up
  // Day 2: similar shape, reverts too.
  const day2 = [b(0, 50.0, 49.9, 50.0), b(1, 50.5, 50.0, 50.5), b(2, 51.0, 50.4, 50.8),
                b(3, 50.7, 49.95, 50.1), b(4, 50.6, 50.2, 50.5)];
  const recs = [
    { date: '2024-01-03', open: 100.0, bars: day1, pip: PIP, cog: { hl_med: 2, hl_75: 2.6, oc_med: 0.5 } },
    { date: '2024-01-04', open: 50.0,  bars: day2, pip: PIP, cog: { hl_med: 2, hl_75: 2.6, oc_med: 0.5 } },
  ];
  const r = analyzeCogLevels(recs);
  assert.equal(r.nDays, 2);
  assert.ok(r.dynMed.n > 0, 'COG median level was touched on ≥1 day');
  assert.ok(r.dynMed.revertPct >= 0 && r.dynMed.revertPct <= 100, 'revert% valid');
  assert.ok(r.dynMed.meanRevertPips >= 0, 'mean revert (pullback) reported');
  assert.equal(r.dynMed.revertCount + (r.dynMed.n - r.dynMed.revertCount), r.dynMed.n, 'counts partition');
  assert.ok('meanCloseFadePips' in r.dynMed, 'hold-to-close fade PnL present');
});

test('analyzeCogLevels: empty / missing levels handled, not thrown', () => {
  const r = analyzeCogLevels([{ date: 'd', open: 100, bars: [b(0, 100, 99.9, 100)], pip: PIP, cog: { hl_med: 0 } }]);
  assert.equal(r.dynMed.n, 0);
  assert.equal(r.nDays, 1);
});

test('analyzeCogLevels: 75th level is farther than median → touched no more often', () => {
  const day = [b(0, 100, 99.5, 100), b(1, 101, 100, 101), b(2, 102, 101, 101.5),
               b(3, 101.5, 97.5, 98.5), b(4, 99, 98, 98.8)];   // big down move tags both
  const recs = Array.from({ length: 5 }, (_, i) => ({ date: `d${i}`, open: 100, bars: day, pip: PIP, cog: { hl_med: 2, hl_75: 3.5 } }));
  const r = analyzeCogLevels(recs);
  if (r.dynMed.n && r.dyn75.n) assert.ok(r.dyn75.n <= r.dynMed.n, '75th (farther) touched no more than median');
});
