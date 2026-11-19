import test from 'node:test'; import assert from 'node:assert/strict';
import { UNIVERSE } from './commandCore.js';
import { MARKET_GEO, MARKET_KEYS, MIN_SEP_DEG, arcDeg, buildMarketGeo, marketSizes, rankMarkets, marketLabel } from './jarvisMarkets.js';

test('MARKET_KEYS matches the desk universe', () => { assert.deepEqual([...MARKET_KEYS].sort(), Object.values(UNIVERSE).flat().sort()); });
test('every UNIVERSE key has a valid position', () => {
  for (const k of Object.values(UNIVERSE).flat()) { const g = MARKET_GEO[k]; assert.ok(g, k); assert.ok(g[0] >= -85 && g[0] <= 85 && g[1] >= -180 && g[1] <= 180, k); assert.ok(g[2]); }
});
test('no two markets stack', () => {
  const ks = Object.keys(MARKET_GEO);
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) assert.ok(arcDeg(MARKET_GEO[ks[i]], MARKET_GEO[ks[j]]) >= MIN_SEP_DEG - 1e-6, `${ks[i]} ${ks[j]}`);
});
test('table is deterministic', () => { assert.deepEqual(buildMarketGeo(), MARKET_GEO); });
test('marketSizes: bounded, toned, skips bad rows', () => {
  const s = marketSizes({ ok: true, instruments: { GOLD: { oc: 1.2, forecast: { oc_median: 0.4 } }, NQ: { oc: -0.1, forecast: { oc_median: 0.5 } }, EURUSD: { oc: 0.3, forecast: { hl_median: 0.6 } }, WTI: { error: 'x' }, SPX500: { oc: 'a', forecast: { oc_median: 1 } }, JUNK: { oc: 1, forecast: { oc_median: 1 } }, US30: { oc: 50, forecast: { oc_median: 0.1 } } } });
  assert.equal(s.GOLD.tone, 'up'); assert.ok(s.GOLD.size > 0.999); assert.equal(s.NQ.tone, 'quiet'); assert.ok(s.NQ.size > 0 && s.NQ.size < 0.2);
  assert.equal(s.EURUSD.noise, 0.3); assert.equal(s.US30.size, 1);
  for (const k of ['WTI', 'SPX500', 'JUNK']) assert.equal(s[k], undefined);
  for (const v of Object.values(s)) assert.ok(v.size >= 0 && v.size <= 1);
  assert.equal(marketSizes({ ok: false }).GOLD, undefined); assert.deepEqual(marketSizes(null), {});
  assert.equal(rankMarkets(s)[0].key, 'US30');
  assert.equal(marketSizes({ instruments: { GBPUSD: { oc: -0.9, forecast: { oc_median: 0.3 } } } }).GBPUSD.tone, 'dn');
});
test('labels', () => { assert.equal(marketLabel('EURUSD'), 'EUR/USD'); assert.equal(marketLabel('BTCUSD'), 'BTCUSD'); assert.equal(marketLabel('GOLD'), 'GOLD'); });
