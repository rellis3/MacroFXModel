import assert from 'node:assert/strict';
import { expectedRanges, formatDigest } from './digest.js';
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

t('expected range: 1.0 ATR plus firing tested one-session effects; five-session effects spread; described triggers ignored', () => {
  const states = [
    { id: 'event-range', kind: 'tested', label: 'Market-moving release in the next 24h', firing: true, expect: [{ inst: 'EURUSD', window: 1, effAtr: 0.42, after: 64, unit: 'pips' }] },
    { id: 'vix-inversion', kind: 'tested', label: 'VIX curve inverted', firing: true, expect: [{ inst: 'USDJPY', window: 5, effAtr: 0.44, after: 200, unit: 'pips' }] },
    { id: 'chain-x', kind: 'described', label: 'Chain link broken', firing: true, expect: [{ inst: 'EURUSD', window: 1, effAtr: 9 }] },
    { id: 'nq-down-week', kind: 'tested', label: 'Nasdaq down-week', firing: false, expect: [{ inst: 'NQ', window: 1, effAtr: 0.21 }] },
  ];
  const r = expectedRanges(states, { EURUSD: 0.0045, USDJPY: 0.90, NQ: 250 });
  assert.equal(r.EURUSD.expectedAtr, 1.42); assert.equal(r.EURUSD.expected, 64); assert.equal(r.EURUSD.unit, 'pips'); assert.equal(r.EURUSD.drivers.length, 1);
  assert.equal(r.USDJPY.expectedAtr, 1.09); assert.equal(r.USDJPY.atr, 90);
  assert.equal(r.NQ.expectedAtr, 1); assert.deepEqual(r.NQ.drivers, []);
});
t('the digest reads as five lines', () => {
  const txt = formatDigest({ dateLabel: 'Mon 22 Sep', regime: { regime: 'goldilocks', months: 5, what: 'growth improving, inflation easing' }, weekUnusual: [{ label: 'Policy', z: 3.1 }],
    states: [{ id: 'event-range', kind: 'tested', label: 'Market-moving release in the next 24h', firing: true, expect: [{ inst: 'EURUSD', after: 64, unit: 'pips' }] }, { id: 'chain-oil-bei', kind: 'described', label: 'Chain link broken: oil → inflation pricing', firing: true }],
    prints: [{ time: '13:30', country: 'US', event: 'CPI m/m', estimate: '0.3%', model: '0.43%', size: 'EUR/USD 2.9× a normal half-hour', call: 'higher' }],
    ranges: { EURUSD: { inst: 'EURUSD', expected: 64, unit: 'pips', expectedAtr: 1.42, drivers: [{ label: 'Market-moving release in the next 24h' }] }, GOLD: { inst: 'GOLD', expected: 48, unit: '$', expectedAtr: 1, drivers: [] } },
    yesterday: { leans: { hits: 3, n: 6 }, ranges: [{ inst: 'EURUSD', expectedAtr: 1.0, realisedAtr: 0.8 }], calls: [{ event: 'Retail Sales m/m', result: 'hit' }] } }, { html: false });
  const lines = txt.split('\n');
  assert.equal(lines.length, 8);
  assert.match(txt, /Backdrop: Goldilocks, month 5/); assert.match(txt, /Unusual this week: Policy z \+3\.1/); assert.match(txt, /On, tested: Market-moving release/); assert.match(txt, /Described: Chain link broken/);
  assert.match(txt, /Today: 13:30 US CPI m\/m \(0\.3% exp\., model 0\.43%\) — EUR\/USD 2\.9× a normal half-hour — you: higher/);
  assert.match(txt, /Expected range: EUR\/USD ~64 pips \(1\.42× a normal day: Market-moving release in the next 24h\) · the rest an ordinary day \(GOLD ~48\)/);
  assert.match(txt, /Yesterday: page leans 3 of 6 right · expected range vs realised: EUR\/USD 1× → 0\.8× · your calls: Retail Sales m\/m ✓/);
});
console.log(`digest: ${n} groups, all passed`);
