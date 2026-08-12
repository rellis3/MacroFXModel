import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCogBands, computeCogV2Bands, COG_CONST } from './cogBands.js';
import { computeBands } from './forecastCore.js';

test('computeCogBands: fractions are COG constants × σ, no asset-class correction', () => {
  const open = 100, sigma = 0.01;
  const b = computeCogBands(open, sigma);
  assert.ok(Math.abs(b.hl50  - COG_CONST.BM_P50 * sigma) < 1e-12);
  assert.ok(Math.abs(b.hl75  - COG_CONST.BM_P75 * sigma) < 1e-12);
  assert.ok(Math.abs(b.ocMed - COG_CONST.HN_P50 * sigma) < 1e-12);
  assert.ok(Math.abs(b.oc75  - COG_CONST.HN_P75 * sigma) < 1e-12);
});

test('computeCogBands: price levels hang off open', () => {
  const b = computeCogBands(100, 0.01);
  assert.ok(Math.abs(b.up50 - 100 * (1 + b.hl50)) < 1e-9);
  assert.ok(Math.abs(b.dn50 - 100 * (1 - b.hl50)) < 1e-9);
  assert.ok(Math.abs(b.up75 - 100 * (1 + b.hl75)) < 1e-9);
  assert.ok(Math.abs(b.ocUp - 100 * (1 + b.ocMed)) < 1e-9);
  assert.ok(Math.abs(b.ocDn - 100 * (1 - b.ocMed)) < 1e-9);
});

test('computeCogBands is uniform where computeBands (Feller) is class-dependent', () => {
  const open = 100, sigma = 0.01;
  const cog = computeCogBands(open, sigma);
  const fx  = computeBands(open, sigma, 'fx');
  const idx = computeBands(open, sigma, 'index');
  // Feller bands differ by asset class; COG does not depend on class at all.
  assert.ok(Math.abs(fx.hl50 - idx.hl50) > 1e-6, 'Feller is class-dependent');
  // COG median H-L (1.56σ) sits wider than Feller-fx median (~1.29σ).
  assert.ok(cog.hl50 > fx.hl50, 'COG median H-L wider than Feller-fx');
});

test('computeCogBands: output keys match computeBands (drop-in shape)', () => {
  const cog = new Set(Object.keys(computeCogBands(100, 0.01)));
  for (const k of Object.keys(computeBands(100, 0.01, 'fx'))) assert.ok(cog.has(k), `missing key ${k}`);
});

test('computeCogV2Bands: gold uses forecaster per-asset bands (no COG widening)', () => {
  const open = 2000, sigma = 0.01;
  const v2gold = computeCogV2Bands(open, sigma, 'commodity');
  const feller = computeBands(open, sigma, 'commodity');
  const cog    = computeCogBands(open, sigma);
  // gold leg == forecaster commodity bands, NOT COG's uniform (wider) median
  assert.ok(Math.abs(v2gold.hl50 - feller.hl50) < 1e-12, 'gold == forecaster commodity');
  assert.ok(v2gold.hl50 < cog.hl50, 'gold median tighter than COG (no widening)');
});

test('computeCogV2Bands: fx & indices stay COG (unchanged)', () => {
  const open = 100, sigma = 0.01;
  for (const ac of ['fx', 'index']) {
    const v2 = computeCogV2Bands(open, sigma, ac);
    const cog = computeCogBands(open, sigma);
    assert.ok(Math.abs(v2.hl50 - cog.hl50) < 1e-12 && Math.abs(v2.hl75 - cog.hl75) < 1e-12,
      `${ac} == COG`);
  }
});
