// Tests for js/volCheck.js.   node js/volCheck.test.mjs
import assert from 'node:assert/strict';
import { realisedDays, compare } from './volCheck.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
// 2026-07-01 (BST): London midnight is 2026-06-30 23:00 UTC
const start = Date.parse('2026-06-30T23:00:00Z') / 1000;
const bars = Array.from({ length: 30 }, (_, i) => ({ time: start + i * 3600, open: 100 + (i === 0 ? 0 : 0.1), high: 100.5 + (i === 5 ? 0.5 : 0), low: 99.8, close: 100.2 }));
t('London day window, open at the first bar, range as % of it', () => {
  const r = realisedDays(bars, ['2026-07-01']);
  assert.equal(r['2026-07-01'].bars, 24);
  assert.equal(r['2026-07-01'].hl, 1.2);   // (101.0 - 99.8) / 100
  assert.deepEqual(realisedDays(bars.slice(0, 3), ['2026-07-01']), {});   // too few bars
});
t('coverage against p50 and p75', () => {
  const c = compare({ a: { hl_median: 1, hl_75: 1.5 }, b: { hl_median: 1, hl_75: 1.5 }, c: { hl_median: 1, hl_75: 1.5 }, d: { hl_median: 1, hl_75: 1.5 }, e: { hl_median: 1 } },
    { a: { hl: 0.5 }, b: { hl: 1.2 }, c: { hl: 2 }, d: { hl: 0.9 }, e: { hl: 3 } });
  assert.equal(c.n, 4); assert.equal(c.over50, 0.5); assert.equal(c.over75, 0.25); assert.equal(c.rows[2].over75, true);
});
console.log(`volCheck: ${n} tests passed`);
