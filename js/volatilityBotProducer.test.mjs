import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshVolatilityPlan } from './volatilityBotProducer.js';
import { COG_CONST } from './cogBands.js';

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

// ── COG bands (the new default) ───────────────────────────────────────────────
test('default bandMode is COG: uniform constants, no asset-class correction', async () => {
  let written;
  const plan = await refreshVolatilityPlan({ ...base, kvPut: async (_k, v) => { written = JSON.parse(v).data; } });
  assert.equal(plan.bandSource, 'cog');
  assert.equal(plan.bandMode, 'cog');
  assert.equal(written.bandSource, 'cog');
  // σ = 0.01 for every class ⇒ COG bands are identical across fx/index/gold
  // (no correction): hl50 = 1.56×0.01, hl75 = 1.93×0.01, etc.
  for (const p of Object.values(plan.pairs)) {
    assert.ok(Math.abs(p.hl50 - COG_CONST.BM_P50 * 0.01) < 1e-9, 'hl50 = COG × σ');
    assert.ok(Math.abs(p.hl75 - COG_CONST.BM_P75 * 0.01) < 1e-9, 'hl75 = COG × σ');
    assert.ok(Math.abs(p.ocMed - COG_CONST.HN_P50 * 0.01) < 1e-9, 'ocMed = COG × σ');
    assert.ok(Math.abs(p.oc75 - COG_CONST.HN_P75 * 0.01) < 1e-9, 'oc75 = COG × σ');
  }
  // uniform: fx and index end up with the same fractions
  assert.ok(Math.abs(plan.pairs.eurusd.hl50 - plan.pairs.spx500.hl50) < 1e-12, 'no per-class correction');
});

test('bandMode=feller keeps the original per-asset-class band math', async () => {
  const plan = await refreshVolatilityPlan({ ...base, bandMode: 'feller' });
  assert.equal(plan.bandSource, 'feller');
  // Feller applies distinct corrections per class ⇒ fx ≠ index hl50, and both
  // differ from the uniform COG value.
  assert.ok(Math.abs(plan.pairs.eurusd.hl50 - plan.pairs.spx500.hl50) > 1e-6, 'per-class correction present');
  assert.ok(Math.abs(plan.pairs.eurusd.hl50 - COG_CONST.BM_P50 * 0.01) > 1e-6, 'fx ≠ COG uniform');
});

test('cogHvSigma overrides σ for NQ only (matches the v2 COG export)', async () => {
  const BOOK_NQ = { horizon: 'daily', survivors: { pairs: ['eurusd', 'nq'] }, policy: {} };
  const RESOLVE_NQ = p => ({ eurusd: { oanda: 'EUR_USD', assetClass: 'fx', pip: 0.0001 },
    nq: { oanda: 'NAS100_USD', assetClass: 'index', pip: 0.1 } }[p]);
  let calls = 0;
  const cogHvSigma = async (_sym, pair) => { calls++; return String(pair).toLowerCase() === 'nq' ? 0.02 : null; };
  const plan = await refreshVolatilityPlan({ ...base, getBook: async () => BOOK_NQ, resolveInstrument: RESOLVE_NQ, cogHvSigma });
  // NQ σ swapped to the cc-HV value; eurusd untouched (fx isn't consulted).
  assert.ok(Math.abs(plan.pairs.nq.sigma - 0.02) < 1e-9, 'NQ uses cc-HV σ');
  assert.ok(Math.abs(plan.pairs.eurusd.sigma - 0.01) < 1e-9, 'fx keeps platform σ');
  assert.ok(Math.abs(plan.pairs.nq.hl50 - COG_CONST.BM_P50 * 0.02) < 1e-9, 'NQ band built from cc-HV σ');
  assert.equal(calls, 1, 'cogHvSigma consulted for the non-fx pair only');
});

test('cogHvSigma is ignored under bandMode=feller', async () => {
  const cogHvSigma = async () => 0.02;
  const plan = await refreshVolatilityPlan({ ...base, bandMode: 'feller', cogHvSigma });
  assert.ok(Math.abs(plan.pairs.spx500.sigma - 0.01) < 1e-9, 'feller ⇒ no cc-HV override');
});
