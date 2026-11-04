// Tests for js/pairSelector.js.   node js/pairSelector.test.mjs
import assert from 'node:assert/strict';
import { ALL_PAIRS, selectPairs, uOf } from './pairSelector.js';
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const C = (bias, conviction = 'high') => ({ bias, conviction });
const currencies = { EUR: C(2), GBP: C(1, 'medium'), AUD: C(0), NZD: C(-1, 'low'), USD: C(0), CAD: C(0), CHF: C(-2), JPY: C(-2, 'medium') };
t('28 pairs in market order', () => { assert.equal(ALL_PAIRS.length, 28); assert.ok(ALL_PAIRS.includes('EURUSD') && ALL_PAIRS.includes('GBPJPY') && ALL_PAIRS.includes('AUDNZD') && !ALL_PAIRS.includes('USDEUR')); });
t('strongest vs weakest is the cleanest expression; picks spread across currencies', () => {
  const r = selectPairs({ currencies });
  assert.equal(r.strongestWeakest.pair, 'EURCHF'); assert.equal(r.strongestWeakest.direction, 'Long'); assert.equal(r.strongestWeakest.usdFree, true);
  assert.equal(r.picks[0].pair, 'EURCHF');
  const count = c => r.picks.filter(p => p.base === c || p.quote === c).length;
  for (const c of ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY']) assert.ok(count(c) <= 2, `${c} used ${count(c)} times`);
  assert.equal(r.matrix.EUR.CHF, 4); assert.equal(r.matrix.CHF.EUR, -4);
});
t('cost, carry and the card move the score', () => {
  const cards = { EURCHF: { rating: 'SHORT', size: 1, levels: { up: { p50: 0.95 }, down: { p50: 0.93 } } }, EURJPY: { rating: 'LONG', size: 1, levels: { up: { p50: 171 }, down: { p50: 169 } } } };
  assert.ok(Math.abs(uOf(cards.EURCHF) - 0.01) < 1e-12);
  const r = selectPairs({ currencies, cards, spreads: { eurchf: 25, eurjpy: 2 }, rates: { EUR: { rate: 2 }, JPY: { rate: 0.5 }, CHF: { rate: 0 } } });
  const ec = r.rows.find(x => x.pair === 'EURCHF'), ej = r.rows.find(x => x.pair === 'EURJPY');
  assert.equal(ec.costShare, 0.25); assert.equal(ec.cardAgrees, false); assert.equal(ej.cardAgrees, true); assert.equal(ej.carry, 1.5);
  assert.ok(ej.score > ec.score, 'a cheap pair whose card agrees beats an expensive one whose card disagrees');
  assert.match(r.picks[0].why, /EUR over JPY.*carry \+1.5% a year in favour.*card agrees/);
});
t('missing biases are skipped', () => { assert.equal(selectPairs({ currencies: { EUR: C(1) } }).picks.length, 0); });
console.log(`pairSelector: ${n} tests passed`);
