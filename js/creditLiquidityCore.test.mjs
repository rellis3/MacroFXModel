// Credit & liquidity board: the shaping (creditLiquidityCore.js) and the HTML (terminal/creditLiquidityView.js).
//   node js/creditLiquidityCore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCreditLiquidity, describe, csiWord, csiTone } from './creditLiquidityCore.js';
import { boardHtml } from './terminal/creditLiquidityView.js';
import { moreFixtures } from './terminal/moreBoards.fixtures.mjs';

const NOW = Date.parse('2026-11-13T12:00:00Z');
const F = () => moreFixtures.creditLiquidity(NOW);

test('the CSI is described on its own scale, and the tone follows the frozen 1 and 2 marks', () => {
  assert.equal(csiWord(-1.4), 'much easier than the past year');
  assert.equal(csiWord(0), 'about normal for the past year');
  assert.equal(csiWord(2.3), 'sharply stressed against the past year');
  assert.deepEqual([-1.2, 0, 1.4, 2.5].map(csiTone), ['up', 'flat', 'gold', 'dn']);
});

test('the payload carries the CSI, the Baa spread with its two percentiles, global liquidity and the gate z-scores, and no gate verdict', () => {
  const cl = buildCreditLiquidity({ ...F(), now: NOW });
  assert.equal(cl.ok, true);
  assert.equal(cl.csi.value, -0.89);
  assert.ok(cl.csi.series.length > 20 && cl.csi.series.length < 400, 'about weekly over three years');
  assert.ok(cl.spread.bp > 0 && cl.spread.pct5y >= 0 && cl.spread.pct20y >= 0);
  assert.equal(cl.spread.asOf, '2026-11-12', 'the Moody\'s 2-day point-in-time lag is undone for the label');
  assert.equal(cl.gateZ.curve, -1.69);
  const text = JSON.stringify(cl);
  assert.doesNotMatch(text, /BLOCKED|"gate1"|composite|exposure/, 'the gate\'s trade verdicts are not carried');
  assert.ok(cl.g4.asOf <= '2026-11-13', 'a future-stamped week end is capped at today');
});

test('the sentence is rule-built, names what it measured and never says forecast', () => {
  const s = describe(buildCreditLiquidity({ ...F(), now: NOW }));
  assert.match(s, /Credit Stress Index is −0\.89: credit conditions are easier than the past year/);
  assert.match(s, /Baa over the 10-year Treasury is \d+bp/);
  assert.match(s, /global central-bank liquidity is falling/);
  assert.doesNotMatch(s, /forecast|will|signal|buy|sell|long|short/i);
});

test('with no CSI it says so instead of drawing', () => {
  assert.equal(buildCreditLiquidity({ csi: { series: [] } }).ok, false);
  assert.match(boardHtml({ ok: false, error: 'the Credit Stress Index has no data yet' }), /no data yet.*stand on their own/);
});

test('the board: own surface, evidence chips, the gate verdict absent, owner links owner-only, no hard-coded colour', () => {
  const html = boardHtml(buildCreditLiquidity({ ...F(), now: NOW }));
  assert.match(html, /data-surface="panel\.macro\.creditliq"/);
  assert.match(html, /Credit Stress Index/);
  assert.match(html, /macro-confluence-baa-credit/);
  assert.doesNotMatch(html, /BLOCKED|go long|go short/);
  assert.doesNotMatch(html, /#[0-9a-f]{3,6}\b|rgb\(/i, 'tokens only');
  assert.match(html, /next-day corr/i);
  assert.match(html, /<svg/);
});
