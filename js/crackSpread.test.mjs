import test from 'node:test';
import assert from 'node:assert/strict';
import { crack321, crackHistory, crackContext } from './crackSpread.js';

test('3-2-1 crack: (2 gasoline + 1 heating oil) x 42 minus 3 crude, per barrel', () => {
  // 2026-09-15 prints: WTI 107.02, gasoline 3.535, heating oil 5.163 -> ~64.2
  assert.equal(+crack321(107.02, 3.535, 5.163).toFixed(1), 64.2);
  assert.equal(crack321(100, 2.0, 2.0), (3 * 2 * 42 - 300) / 3);
  assert.equal(crack321(NaN, 2, 2), null);
});

test('history uses common dates only and keeps the inputs', () => {
  const h = crackHistory({ wti: [{ date: 'd1', value: 80 }, { date: 'd2', value: 90 }], gasoline: [{ date: 'd2', value: 3 }], heatingOil: [{ date: 'd2', value: 4 }, { date: 'd3', value: 4 }] });
  assert.equal(h.length, 1); assert.equal(h[0].date, 'd2'); assert.equal(h[0].wti, 90);
});

test('context ranks the last print against history and gives it a word', () => {
  const hist = Array.from({ length: 300 }, (_, i) => ({ date: `2015-01-${String(1 + (i % 28)).padStart(2, '0')}`, crack: 15 + (i % 20) }));
  hist.push({ date: '2026-09-15', crack: 60 });
  const c = crackContext(hist, '2000-01-01');
  assert.ok(c.percentile > 0.99 && /blow-out/.test(c.word));
});
