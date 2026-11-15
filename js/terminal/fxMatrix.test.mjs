// js/terminal/fxMatrix.test.mjs: the currency matrix core and HTML on a synthetic /api/ccy-strength payload. node --test js/terminal/fxMatrix.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { strengthTable, pairMatrix, pairOf, turning, tableSentence } from './fxMatrixCore.js';
import { tableHtml, matrixHtml, fxHtml } from './fxMatrixView.js';

const CC = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
const hz = (vals, extra = {}) => { const scores = CC.map((c, i) => ({ ccy: c, score: vals[i] })).sort((a, b) => b.score - a.score).map((s, i) => ({ ...s, rank: i + 1 })); return { available: true, flat: false, from: '2026-11-13T21:00:00Z', to: '2026-11-13T22:00:00Z', unitPct: 0.31, scores, leader: scores[0].ccy, laggard: scores[7].ccy, spread: scores[0].score - scores[7].score, ...extra }; };
const sum0 = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return a.map(x => x - m); };
const payload = () => ({ ok: true, asOf: '2026-11-13T22:00:00Z', closed: false, horizons: {
  '1H': hz(sum0([2, 1, 0, -1, -1, 0, 0.5, -1.5])), '4H': hz(sum0([1.5, 1, 0.5, -1, -0.5, 0, 0.5, -2])), '1D': hz(sum0([-1, -0.5, 0, 1.5, 1, 0.5, -1, -0.5])), '1W': hz(sum0([-1.5, -1, 0, 2, 1, 0.5, -0.5, -0.5])) } });

test('pairOf names the pair the way the market quotes it, either order; none for a combination that is not quoted', () => {
  assert.deepEqual(pairOf('USD', 'EUR'), { inst: 'EURUSD', base: 'EUR', quote: 'USD' }); assert.equal(pairOf('EUR', 'USD').inst, 'EURUSD'); assert.equal(pairOf('JPY', 'CHF').inst, 'CHFJPY'); assert.equal(pairOf('USD', 'USD'), null);
});
test('strengthTable: eight rows ordered by the 1D rank, four columns, a score and rank per cell', () => {
  const t = strengthTable(payload()); assert.equal(t.ok, true); assert.equal(t.rows.length, 8); assert.equal(t.orderedBy, '1D'); assert.equal(t.rows[0].ccy, 'JPY');
  assert.ok(t.rows.every(r => ['1H', '4H', '1D', '1W'].every(k => r.cells[k] && Number.isFinite(r.cells[k].score) && r.cells[k].rank >= 1))); assert.ok(t.cols.every(c => c.available));
});
test('turning: firming when the short windows rank clearly better than the long, fading when worse, steady otherwise, null without both', () => {
  const c = (a, b, d, e) => ({ '1H': { rank: a }, '4H': { rank: b }, '1D': { rank: d }, '1W': { rank: e } });
  assert.equal(turning(c(1, 1, 5, 6)), 'firming'); assert.equal(turning(c(7, 8, 2, 3)), 'fading'); assert.equal(turning(c(3, 4, 4, 3)), 'steady'); assert.equal(turning({ '1H': { rank: 1 } }), null);
  const t = strengthTable(payload()); assert.equal(t.rows.find(r => r.ccy === 'USD').turning, 'firming'); assert.equal(t.rows.find(r => r.ccy === 'JPY').turning, 'fading');
});
test('a window with no data is shown as not available with its reason, and the rest still draw; a failed payload gives a plain message', () => {
  const p = payload(); p.horizons['1H'] = { available: false, reason: 'only 0 of 28 pairs had prices and a normal move for 1H', pairs: 0 };
  const t = strengthTable(p); assert.equal(t.cols[0].available, false); assert.equal(t.rows[0].cells['1H'], null);
  const h = tableHtml(t); assert.match(h, /only 0 of 28 pairs/); assert.match(h, /class="in-mv/);
  assert.match(tableHtml(strengthTable({ ok: false, error: 'no bars' })), /no bars/); assert.equal(pairMatrix(p, '1H'), null);
});
test('pairMatrix: cell = row minus column, antisymmetric, the diagonal is empty, ordered strongest first; the cell opens the pair', () => {
  const m = pairMatrix(payload(), '1D'); assert.equal(m.ccys[0], 'JPY'); assert.equal(m.cells[0][0], null);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if (i !== j) assert.ok(Math.abs(m.cells[i][j] + m.cells[j][i]) < 1e-9);
  const h = matrixHtml(m, '1D'); assert.match(h, /data-go="USDJPY"|data-go="EURJPY"/); assert.equal((h.match(/class="in-pm/g) ?? []).length, 56);
});
test('the sentence and the page text: leaders named, no direction or trade wording, no hard-coded colours, a closed market says so', () => {
  const p = payload(); p.closed = true; p.closeLabel = 'Fri 22:00 UTC';
  const t = strengthTable(p), s = tableSentence(t); assert.match(s, /Strongest over weakest/);
  const h = fxHtml(p, '1D'); assert.match(h, /market is shut/); assert.ok(!/#[0-9a-f]{6}\b/i.test(h));
  assert.ok(!/\b(buy|sell|go long|go short|stop loss|take profit)\b/i.test(h.replace(/<[^>]+>/g, ' ')), 'no trade wording'); assert.match(h, /does not say what happens next/);
});
