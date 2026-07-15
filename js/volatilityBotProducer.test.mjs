import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshVolatilityPlan } from './volatilityBotProducer.js';

// Minimal fakes: 3 survivors (fx / index / commodity), each resolving to a distinct
// OANDA symbol. σ sources are stubbed so we can assert WHICH one each pair used.
const BOOK = { horizon: 'daily', survivors: { pairs: ['eurusd', 'spx500', 'gold'] }, policy: { 'up75': { decision: 'fade' } } };
const RESOLVE = p => ({ eurusd: { oanda: 'EUR_USD', assetClass: 'fx', pip: 0.0001 },
  spx500: { oanda: 'SPX500_USD', assetClass: 'index', pip: 0.1 },
  gold:   { oanda: 'XAU_USD', assetClass: 'commodity', pip: 0.01 } }[p]);
const bars = Array.from({ length: 120 }, (_, i) => ({ open: 100 + i * 0.1, high: 101 + i * 0.1, low: 99 + i * 0.1, close: 100 + i * 0.1 }));
const base = {
  getBook: async () => BOOK,
  fetchD1: async () => bars,
  sigmaSeries: () => new Float64Array(bars.length).fill(0.01),   // platform σ = 0.01
  kvPut: async () => {},
  resolveInstrument: RESOLVE,
  fetchSessionOpen: async () => 100,
  now: () => '2020-01-01T00:00:00Z', stamp: () => 0,
};

test('platform σ (default): every class uses volSigmaSeries, sigmaSource=platform', async () => {
  let written;
  const plan = await refreshVolatilityPlan({ ...base, kvPut: async (_k, v) => { written = JSON.parse(v).data; } });
  assert.equal(plan.sigmaSource, 'platform');
  for (const p of Object.values(plan.pairs)) assert.ok(Math.abs(p.sigma - 0.01) < 1e-9, 'platform σ used');
  assert.equal(written.sigmaSource, 'platform');
});

test('har-nonfx: indices+gold use HAR σ, fx stays platform', async () => {
  const harSigma = (b, ac) => 0.02;    // distinct HAR σ
  const plan = await refreshVolatilityPlan({ ...base, volSource: 'har-nonfx', harSigma });
  assert.equal(plan.sigmaSource, 'har-nonfx');
  assert.ok(Math.abs(plan.pairs.eurusd.sigma - 0.01) < 1e-9, 'fx keeps platform σ');
  assert.ok(Math.abs(plan.pairs.spx500.sigma - 0.02) < 1e-9, 'index uses HAR σ');
  assert.ok(Math.abs(plan.pairs.gold.sigma - 0.02) < 1e-9, 'gold uses HAR σ');
});

test('har-nonfx falls back to platform σ when HAR returns bad', async () => {
  const harSigma = () => null;        // HAR unavailable
  const plan = await refreshVolatilityPlan({ ...base, volSource: 'har-nonfx', harSigma });
  assert.ok(Math.abs(plan.pairs.spx500.sigma - 0.01) < 1e-9, 'index falls back to platform σ');
});

test('har-nonfx without a harSigma fn behaves as platform', async () => {
  const plan = await refreshVolatilityPlan({ ...base, volSource: 'har-nonfx' });
  assert.equal(plan.sigmaSource, 'platform', 'no harSigma ⇒ platform');
});
