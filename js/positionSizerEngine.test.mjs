import test from 'node:test';
import assert from 'node:assert/strict';
import { sizePosition, sizePortfolio } from './positionSizerEngine.js';

test('sizePosition: a stop-out loses exactly riskPct of equity (currency-agnostic)', () => {
  const s = sizePosition({ equity: 100000, riskPct: 0.5, stopMult: 1, rangePct: 0.55 });
  // notionalFraction × stopPct(%) should equal riskPct: loss = notional × stop% = equity × riskPct%.
  assert.ok(Math.abs(s.notionalFraction * s.stopPct - 0.5) < 1e-3, 'notional×stop = riskPct (within rounding)');
  assert.equal(s.riskDollar, 500, '$risk = 0.5% of 100k');
  assert.equal(s.stopPct, 0.55, 'stop = 1× the range');
});

test('sizePosition: a WIDER forecast range ⇒ smaller position (vol normalisation)', () => {
  const tight = sizePosition({ equity: 100000, riskPct: 0.5, rangePct: 0.4 });
  const wide = sizePosition({ equity: 100000, riskPct: 0.5, rangePct: 1.2 });
  assert.ok(wide.notionalFraction < tight.notionalFraction, 'wider range → smaller notional');
  // Both risk the same dollars.
  assert.equal(wide.riskDollar, tight.riskDollar, 'equal $ risk regardless of vol');
});

test('sizePosition: pips + lots appear only when price + pip are supplied', () => {
  const noPx = sizePosition({ equity: 100000, riskPct: 0.5, rangePct: 0.55 });
  assert.equal(noPx.stopPips, null); assert.equal(noPx.lotsApprox, null);
  const withPx = sizePosition({ equity: 100000, riskPct: 0.5, rangePct: 0.55, price: 1.08, pip: 0.0001 });
  assert.ok(withPx.stopPips > 0 && withPx.lotsApprox > 0, 'pips + lots computed with price/pip');
});

test('sizePortfolio: total heat is capped and positions scale down proportionally', () => {
  const positions = Array.from({ length: 8 }, (_, i) => ({ pair: `P${i}`, rangePct: 0.5 }));
  const p = sizePortfolio({ equity: 100000, riskPct: 0.5, maxHeatPct: 2, positions });
  assert.equal(p.grossHeatPct, 4, '8 × 0.5% = 4% nominal');
  assert.ok(p.scaledDown, 'scaled down to fit the 2% cap');
  assert.equal(p.effectiveHeatPct, 2, 'effective heat = the cap');
  assert.ok(Math.abs(p.riskPctPerTrade - 0.25) < 1e-9, 'per-trade risk halved to fit');
});

test('sizePortfolio: no cap breach ⇒ no scaling', () => {
  const positions = [{ pair: 'A', rangePct: 0.5 }, { pair: 'B', rangePct: 0.8 }];
  const p = sizePortfolio({ equity: 100000, riskPct: 0.5, maxHeatPct: 5, positions });
  assert.equal(p.scaledDown, false);
  assert.equal(p.riskPctPerTrade, 0.5);
});

test('sizePosition: invalid inputs flagged, not thrown', () => {
  assert.equal(sizePosition({ equity: 0, riskPct: 0.5, rangePct: 0.5 }).invalid, true);
  assert.equal(sizePosition({ equity: 100000, riskPct: 0.5, rangePct: 0 }).invalid, true);
});
