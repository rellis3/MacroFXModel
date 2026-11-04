// Tests for js/optionsSkew.js.   node js/optionsSkew.test.mjs
import assert from 'node:assert/strict';
import { updateHist, skewBoard } from './optionsSkew.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const T = (atm, rr25, bf25) => ({ atm, rr25, bf25, c25: atm + rr25 / 2, p25: atm - rr25 / 2, n: 12 });
const pull = (day, rrJ) => ({ asOf: `${day}T19:30:00Z`, rows: {
  JPY: { label: 'Japanese yen (6J)', data: 'delayed', tenors: { '1w': T(11.5, rrJ + 0.2, 0.3), '1m': T(10, rrJ, 0.25), '3m': T(9.6, rrJ - 0.1, 0.22) } },
  NQ: { label: 'Nasdaq 100 (NQ)', tenors: { '1m': T(22, -4.1, 1.2) } } }, errors: { CHF: 'too thin' } });

t('history: one point a day, the same day overwritten', () => {
  let h = {}; ({ hist: h } = updateHist(h, pull('2026-11-02', 0.4)));
  ({ hist: h } = updateHist(h, pull('2026-11-02', 0.5)));
  ({ hist: h } = updateHist(h, pull('2026-11-03', 0.6)));
  assert.equal(h.JPY.length, 2); assert.equal(h.JPY[0].rr, 0.5); assert.equal(h.JPY[1].atm1w, 11.5);
  assert.equal(updateHist({}, {}).changed, false);
});
t('the board: leans, the pair sign, the term slope and the 5-day change', () => {
  let h = {}; for (let d = 1; d <= 7; d++) ({ hist: h } = updateHist(h, pull(`2026-10-0${d}`, 0.1 * d)));
  const b = skewBoard(pull('2026-10-08', 0.9), h, Date.parse('2026-11-04T19:30:00Z'));
  const j = b.rows.find(r => r.id === 'JPY'), q = b.rows.find(r => r.id === 'NQ');
  assert.equal(b.rows[0].id, 'JPY'); assert.equal(j.pairRr, -0.9); assert.equal(j.pair, 'USD/JPY');
  assert.match(j.lean, /JPY strength/); assert.equal(j.slope, 1.5); assert.match(j.event, /event/);
  assert.equal(j.rr5d, 0.7); assert.equal(j.rrPct, null, 'fewer than 20 days: no percentile');
  assert.match(q.lean, /downside/); assert.equal(q.slope, null);
  assert.deepEqual(b.errors, { CHF: 'too thin' }); assert.equal(b.ageH, 27 * 24);
  assert.equal(skewBoard(null).ok, false);
});
console.log(`optionsSkew: ${n} tests passed`);
