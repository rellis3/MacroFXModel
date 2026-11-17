// node --test js/terminal/surpriseRollup.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { surpriseRollup, rollupHtml, Z_CLIP } from './surpriseRollup.js';

const NOW = Date.UTC(2026, 10, 17, 17, 0), H = 3600e3;
const p = (h, ccy, z, event = 'CPI', ok = true) => ({ ms: NOW - h * H, ccy, event, surprise: { ok, z } });
const row = (r, c) => r.rows.find(x => x.ccy === c);

test('sums z per currency inside the window, names the biggest print', () => {
  const r = surpriseRollup([p(2, 'EUR', 1.9, 'CPI'), p(5, 'EUR', -0.4, 'Trade'), p(3, 'CAD', -0.56, 'Housing')], NOW);
  assert.equal(row(r, 'EUR').sum, 1.5); assert.equal(row(r, 'EUR').n, 2); assert.equal(row(r, 'EUR').top.event, 'CPI');
  assert.equal(row(r, 'CAD').sum, -0.56); assert.equal(row(r, 'USD').n, 0); assert.equal(row(r, 'USD').sum, null);
});
test('window edges: older than the window and future prints are out', () => {
  const r = surpriseRollup([p(25, 'GBP', 2), p(-1, 'GBP', 2), p(23, 'GBP', 1)], NOW, 24);
  assert.equal(row(r, 'GBP').n, 1); assert.equal(row(r, 'GBP').sum, 1);
});
test('one outlier is clipped so it cannot be the whole sum', () => {
  const r = surpriseRollup([p(1, 'JPY', 9)], NOW);
  assert.equal(row(r, 'JPY').sum, Z_CLIP); assert.equal(row(r, 'JPY').top.z, 9);
});
test('a print with no z or no currency is skipped and counted, never zero-filled', () => {
  const r = surpriseRollup([p(1, 'USD', null), p(1, 'USD', 1, 'x', false), { ms: NOW - H, surprise: { ok: true, z: 1 } }, p(1, 'USD', 0.5)], NOW);
  assert.equal(row(r, 'USD').n, 1); assert.equal(r.skipped, 3); assert.equal(r.used, 1);
});
test('empty or bad input does not throw and says so', () => {
  assert.equal(surpriseRollup(undefined, NOW).used, 0);
  assert.match(rollupHtml(surpriseRollup([], NOW)), /No high-impact print/);
});
test('html carries no good/bad wording and escapes event names', () => {
  const h = rollupHtml(surpriseRollup([p(1, 'EUR', 1.2, '<b>CPI</b>')], NOW));
  assert.ok(!h.includes('<b>CPI</b>')); assert.match(h, /not good or bad/); assert.match(h, /EUR \+1\.2σ/);
});
