// The bias engine on the Desk Terminal (js/terminal/biasEngineView.js): labels, chips, split, top drivers, agreement, the grid cells and that the flip line
// is always wrapped in its 'trade' surface. Colours are theme tokens only.
//   node --test js/terminal/biasEngineView.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBiasRecord } from '../biasEngine.js';
import * as V from './biasEngineView.js';
import { surfaceById } from './tabRegistry.js';

const ISSUE = '2026-11-13T07:00:00.000Z', ago = d => new Date(Date.parse(ISSUE) - d * 864e5).toISOString();
const rec = () => buildBiasRecord({
  asOf: ISSUE,
  policy: { USD: { weekBp: 16, asOf: ago(0.5) }, EUR: { weekBp: -6, asOf: ago(0.5) }, JPY: { weekBp: 3, asOf: ago(0.5) }, AUD: { weekBp: -20, asOf: ago(0.5) }, CAD: { weekBp: 0, asOf: ago(0.5) }, CHF: { weekBp: 7, asOf: ago(0.5) }, GBP: { weekBp: 10, asOf: ago(0.5) }, NZD: { weekBp: -8, asOf: ago(0.5) } },
  data: Object.fromEntries(['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'].map((c, i) => [c, { score: [0.6, -0.2, 0.2, 0.6, -0.55, -0.3, -0.1, 0.0][i], asOf: ago(20) }])),
  risk: { vix: { level: 22, pct1y: 85, asOf: ago(0.4) }, vixTerm: { ratio: 0.97, asOf: ago(0.4) }, hy: { chg20bp: 30, level: 3.1, asOf: ago(1.4) } },
});
const m = (dir, strength, score, drivers = [], extra = {}) => ({ dir, strength, score, coverage: 0.8, drivers, missing: [], ...extra });

test('labels and signs: "Bearish 7/10", Neutral without a strength, the ring on the page\'s ±5 scale', () => {
  assert.equal(V.engineLabel(m('BEARISH', 7, -1.4)), 'Bearish 7/10');
  assert.equal(V.engineLabel(m('NEUTRAL', 2, 0.4)), 'Neutral');
  assert.equal(V.engineLabel(null), null);
  assert.deepEqual([V.engineSign(m('BULLISH', 5, 1)), V.engineSign(m('BEARISH', 5, -1)), V.engineSign(m('NEUTRAL', 1, 0.1)), V.engineSign(null)], [1, -1, 0, null]);
  assert.equal(V.ring5(m('BEARISH', 7, -1.4)), -3.5);
  assert.equal(V.ring5({}), null);
  assert.equal(V.sgn(-0.126), '−0.13'); assert.equal(V.sgn(0.004), '0.00'); assert.equal(V.sgn(null), '–');
  const chip = V.engineChip(m('BEARISH', 7, -1.4));
  assert.match(chip, /class="chip dn be-chip"/); assert.match(chip, />Macro tilt: Bearish 7\/10</); assert.match(chip, /not a trade signal/);
  assert.equal(V.engineChip(null), '');
});

test('split: engine and desk on different sides (Neutral is a side); nothing when either has no read', () => {
  assert.equal(V.deskSign({ rating: 'STRONG_SHORT' }), -1); assert.equal(V.deskSign({ rating: 'FLAT' }), 0); assert.equal(V.deskSign({ rating: 'junk' }), null);
  assert.equal(V.deskSign({ bias: 2 }), 1); assert.equal(V.deskSign({ bias: null }), null);
  assert.equal(V.isSplit(m('BEARISH', 7, -1.4), 1), true);
  assert.equal(V.isSplit(m('BEARISH', 7, -1.4), -1), false);
  assert.equal(V.isSplit(m('NEUTRAL', 1, 0.1), 1), true);
  assert.equal(V.isSplit(m('BULLISH', 5, 1), null), false);
  assert.equal(V.isSplit(null, 1), false);
  assert.match(V.splitChip(m('BEARISH', 7, -1.4), 1), />tilt differs</);
  assert.equal(V.splitChip(m('BEARISH', 7, -1.4), -1), '');
});

test('top drivers: the three largest contributions by size, ties kept in driver order', () => {
  const ds = [{ label: 'a', contrib: 0.1 }, { label: 'b', contrib: -0.5 }, { label: 'c', contrib: 0.3 }, { label: 'd', contrib: -0.3 }, { label: 'e', contrib: 0 }];
  assert.deepEqual(V.topDrivers({ drivers: ds }).map(x => x.label), ['b', 'c', 'd']);
  const h = V.keyDriversHtml({ drivers: ds });
  assert.match(h, /Key drivers/); assert.match(h, /−0\.50/); assert.ok(!h.includes('>e<'));
  assert.equal(V.keyDriversHtml({ drivers: [] }), '');
});

test('the flip line is always inside the panel.asset.beflip surface, a hidden-by-default trade surface', () => {
  assert.equal(surfaceById('panel.asset.beflip')?.hidden, 'trade');
  const r = rec(), usd = r.currencies.USD;
  for (const h of [V.flipHtml(usd), V.fullBlockHtml(usd, { rec: r }), V.pairCardHtml(V.marketView(r, 'NZDCHF'), r)]) {
    assert.ok(h.includes('data-surface="panel.asset.beflip"'), 'flip wrapped');
    const outside = h.replace(/<div class="sfc" data-surface="panel\.asset\.beflip">[\s\S]*?<\/p><\/div><\/div>/g, '');
    assert.ok(!outside.includes(usd.flip) && !/What would flip/.test(outside), 'no flip text outside its surface');
  }
  assert.equal(V.flipHtml({}), '');
});

test('the full block and the driver table: every column, the missing list, the coverage, the footnote', () => {
  const r = rec(), usd = r.currencies.USD, h = V.fullBlockHtml(usd, { rec: r, desk: -1 });
  for (const col of ['Driver', 'Reading', '>d<', '>w<', 'contrib', 'Source', 'as of']) assert.ok(h.includes(col), col);
  assert.match(h, /coverage \d+% of the weight/); assert.match(h, /Missing \(\d+\)/);
  assert.ok(h.includes(V.FOOTNOTE)); assert.ok(h.includes('tilt differs') === (V.engineSign(usd) !== -1));
  assert.equal(V.fullBlockHtml(null), '');
});

test('agreement: over the desk cards the engine covers, and the eight currencies', () => {
  const r = rec(), eu = V.marketView(r, 'EURUSD'), side = V.engineSign(eu);
  const want = side > 0 ? 'LONG' : side < 0 ? 'SHORT' : 'FLAT', other = side > 0 ? 'SHORT' : 'LONG';
  const a = V.agreement(r, { cards: { EURUSD: { rating: want }, USDJPY: { rating: other === 'LONG' ? (V.engineSign(V.marketView(r, 'USDJPY')) > 0 ? 'LONG' : 'SHORT') : 'LONG' }, BTCUSD: { rating: 'LONG' } }, ccy: { USD: { bias: 2 }, EUR: { bias: null } } });
  assert.equal(a.markets.total, 2, 'BTCUSD is not covered by the engine');
  assert.ok(a.markets.agree >= 1);
  assert.equal(a.currencies.total, 1);
  assert.match(V.agreementLine(a), /^engine vs desk agree on \d of 2 markets · \d of 1 currencies$/);
  assert.equal(V.agreementLine(V.agreement(null)), '');
  const strip = V.rankingStripHtml(r, { deskRanking: ['USD', 'EUR'], agree: a });
  assert.match(strip, /Currency ranking · bias engine/); assert.match(strip, /engine vs desk agree on/); assert.match(strip, /desk #1/);
  assert.equal(V.rankingStripHtml(null), '');
});

test('the Macro grid: a cell per driver (contribution, missing, n/a), heat in theme tokens, weights, gaps', () => {
  const r = rec();
  assert.equal(V.cellOf(r.currencies.USD, 'policy').kind, 'used');
  assert.equal(V.cellOf(r.currencies.USD, 'commodity').kind, 'na');
  assert.equal(V.cellOf(r.currencies.NZD, 'commodity').kind, 'missing');
  assert.equal(V.heat(0), 'var(--bg3)'); assert.equal(V.heat(0.5), 'rgba(var(--uprgb),0.53)'); assert.equal(V.heat(-0.1), 'rgba(var(--dnrgb),0.17)');
  const h = V.macroSectionHtml(r);
  for (const [, l] of V.CCY_COLS) assert.ok(h.includes(`>${l}<`), l);
  for (const c of ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF']) assert.ok(h.includes(`<th>${c}</th>`), c);
  assert.match(h, /Weights · theory-v1/); assert.match(h, /Gaps/); assert.match(h, /Global risk R/);
  assert.ok(!/#[0-9a-f]{3,6}\b/i.test(h), 'no hard-coded colours');
  assert.equal(V.macroSectionHtml(null), '');
});

test('the Pair card: any cross, both legs side by side; an asset shows its driver table; the Replay card', () => {
  const r = rec(), v = V.marketView(r, 'CHFNZD');
  const h = V.pairCardHtml(v, { date: '2026-11-13', footnote: r.footnote });
  assert.match(h, /Bias engine · CHFNZD/); assert.match(h, /class="be-legs"/); assert.match(h, /<b class="mono">CHF<\/b>/); assert.match(h, /<b class="mono">NZD<\/b>/);
  assert.match(V.pairCardHtml(V.marketView(r, 'GOLD')), /be-table/);
  assert.equal(V.pairCardHtml(null), '');
  const rp = V.replayHtml(V.marketView(r, 'EURUSD'), { date: '2026-11-13', asOf: ISSUE });
  assert.match(rp, /Macro tilt: /); assert.match(rp, /2026-11-13/); assert.ok(!rp.includes('panel.asset.beflip') && !rp.includes(r.markets.EURUSD.flip));
  assert.equal(V.replayHtml(null), '');
});

test('text is escaped', () => {
  const h = V.keyDriversHtml({ drivers: [{ label: '<x>', reading: '"q"', contrib: 0.2 }] });
  assert.ok(h.includes('&lt;x&gt;') && h.includes('&quot;q&quot;') && !h.includes('<x>'));
});

test('fallbackChip: a flat or missing desk call shows the engine lean; a real call or no engine read shows nothing', () => {
  const bear = { dir: 'BEARISH', strength: 3, score: -0.6 }, neut = { dir: 'NEUTRAL', score: 0.1 };
  assert.match(V.fallbackChip(bear, 'FLAT'), /Desk call neutral . engine leans Bearish 3\/10/);
  assert.match(V.fallbackChip(bear, undefined), /No desk view today . engine leans Bearish 3\/10/);
  assert.match(V.fallbackChip(neut, 'FLAT'), /engine also neutral/);
  assert.equal(V.fallbackChip(bear, 'LONG'), '');
  assert.equal(V.fallbackChip(null, 'FLAT'), '');
  assert.equal(V.fallbackChip({ dir: null }, 'FLAT'), '');
});
