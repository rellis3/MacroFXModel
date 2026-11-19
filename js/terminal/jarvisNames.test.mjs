import test from 'node:test';
import assert from 'node:assert/strict';
import { marketName, currencyName, spokenName, getNameStyle, setNameStyle } from './jarvisNames.js';
import { MARKET_KEYS } from './jarvisMarkets.js';

test('names mode: every desk market has a readable name, never the raw key', () => {
  setNameStyle('names');
  for (const k of MARKET_KEYS) for (const short of [false, true]) { const n = marketName(k, { short }); assert.ok(n && n !== k, `${k} -> ${n}`); }
  assert.equal(marketName('EURUSD'), 'Euro / Dollar'); assert.equal(marketName('NZDJPY'), 'Kiwi / Yen'); assert.equal(marketName('GBPJPY'), 'Pound / Yen');
  assert.equal(marketName('EURUSD', { short: true }), 'Euro/Dollar'); assert.equal(marketName('NQ'), 'Nasdaq'); assert.equal(marketName('SPX500'), 'S&P 500');
  assert.equal(currencyName('JPY'), 'Yen'); assert.equal(currencyName('CHF'), 'Swiss franc'); assert.equal(currencyName('CHF', { short: true }), 'Franc'); assert.equal(currencyName('XXX'), 'XXX');
});
test('codes mode gives EUR/USD style and the raw keys; the choice is kept', () => {
  setNameStyle('codes'); assert.equal(getNameStyle(), 'codes');
  assert.equal(marketName('EURUSD'), 'EUR/USD'); assert.equal(marketName('NQ'), 'NQ'); assert.equal(marketName('BTCUSD'), 'BTCUSD'); assert.equal(currencyName('JPY'), 'JPY');
  setNameStyle('names'); assert.equal(getNameStyle(), 'names');
});
test('unknown keys pass through; spoken names never carry a raw code and ignore the switch', () => {
  setNameStyle('names'); assert.equal(marketName('FOO'), 'FOO'); assert.equal(marketName('USD*'), 'USD*');
  setNameStyle('codes');
  for (const k of MARKET_KEYS) assert.ok(!/\b[A-Z]{6}\b/.test(spokenName(k)) && !/\b(EUR|USD|GBP|JPY|AUD|NZD|CAD|CHF|NOK|SEK)\b/.test(spokenName(k)), spokenName(k));
  assert.equal(spokenName('EURUSD'), 'Euro Dollar'); assert.equal(spokenName('NQ'), 'Nasdaq');
  setNameStyle('names');
});
