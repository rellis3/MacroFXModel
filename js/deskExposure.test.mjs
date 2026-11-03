import assert from 'node:assert/strict';
import { exposureLegs, netExposure, capExposure } from './deskExposure.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const card = (rating, size) => ({ rating, conviction: 'medium', why: '', invalidation: '', ...(size != null ? { size } : {}) });

t('legs: pair = base and quote; USD-priced commodities and crypto = short USD when long; indices none', () => {
  assert.deepEqual(exposureLegs('EURUSD'), [['EUR', 1], ['USD', -1]]);
  assert.deepEqual(exposureLegs('GBPJPY'), [['GBP', 1], ['JPY', -1]]);
  assert.deepEqual(exposureLegs('GOLD'), [['USD', -1]]);
  assert.deepEqual(exposureLegs('BTCUSD'), [['USD', -1]]);
  assert.deepEqual(exposureLegs('NQ'), []);
});

t('net exposure: short EURUSD + short GOLD + long USDJPY are all long USD', () => {
  const { net } = netExposure({ EURUSD: card('SHORT'), GOLD: card('SHORT', 0.5), USDJPY: card('STRONG_LONG'), NQ: card('SHORT'), GBPUSD: card('FLAT'), AUDUSD: card('REVIEW') });
  assert.equal(net.USD, 1 + 0.5 + 1.5);
  assert.equal(net.EUR, -1); assert.equal(net.JPY, -1.5);
});

t('under the cap nothing changes', () => {
  const cards = { EURUSD: card('SHORT'), GBPUSD: card('SHORT') };
  const r = capExposure(cards, { cap: 4 });
  assert.deepEqual(r.report.cuts, []);
  assert.equal(r.cards.EURUSD.size, undefined);
  assert.ok(!('sizeBeforeCap' in r.cards.EURUSD));
});

t('over the cap: same-side cards shrink in proportion to land on the cap, the cut is recorded, the input is untouched', () => {
  const cards = { EURUSD: card('SHORT'), GBPUSD: card('SHORT'), AUDUSD: card('SHORT'), NZDUSD: card('SHORT'), GOLD: card('SHORT'), USDCAD: card('LONG'), USDCHF: card('SHORT', 1) };
  const r = capExposure(cards, { cap: 4 });
  assert.equal(r.report.before.USD, 5);
  assert.ok(Math.abs(r.report.after.USD) <= 4.01);
  assert.equal(r.report.cuts[0].ccy, 'USD');
  assert.equal(r.cards.EURUSD.sizeBeforeCap, 1); assert.ok(r.cards.EURUSD.size < 1);
  assert.deepEqual(r.cards.EURUSD.cappedBy, ['USD']);
  assert.ok(!('sizeBeforeCap' in r.cards.USDCHF), 'the card on the other side is not cut');
  assert.equal(cards.EURUSD.size, undefined, 'input not mutated');
});

t('cutting a cross for one currency is re-checked against its other leg', () => {
  const cards = { AUDJPY: card('STRONG_SHORT'), AUDCAD: card('STRONG_SHORT'), AUDUSD: card('STRONG_SHORT'), EURAUD: card('STRONG_LONG') };
  const r = capExposure(cards, { cap: 3 });
  assert.ok(Math.abs(r.report.after.AUD) <= 3.01);
  for (const c of ['USD', 'EUR', 'GBP', 'JPY', 'NZD', 'CAD', 'CHF']) assert.ok(Math.abs(r.report.after[c]) <= 3.01, c);
});

console.log(`deskExposure: ${n} tests passed`);
