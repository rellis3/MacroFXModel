import test from 'node:test';
import assert from 'node:assert/strict';
import { ccHvSigma, ccHvMulti } from './ccHvSigma.js';

// Build daily closes whose close-to-close log returns have a KNOWN std, so we can
// assert the annualised σ ≈ std × √252 × 100.
function dailyWithRetStd(nDays, retStd) {
  const bars = []; let px = 15000;
  for (let d = 0; d < nDays; d++) {
    const sign = (d % 2 === 0) ? 1 : -1;           // alternating → |ret| = retStd each day → std ≈ retStd
    px = px * Math.exp(sign * retStd);
    bars.push({ close: px });
  }
  return bars;
}

test('ccHvSigma: annualises close-to-close return std correctly', () => {
  const retStd = 0.012;                            // 1.2% daily → ~19% annualised
  const r = ccHvSigma(dailyWithRetStd(60, retStd), { window: 20 });
  assert.ok(!r.insufficient);
  const expected = retStd * Math.sqrt(252) * 100;  // ~19.05%
  assert.ok(Math.abs(r.volAnnual - expected) < 1.0, `${r.volAnnual}% ≈ ${expected.toFixed(2)}%`);
  assert.equal(r.window, 20);
});

test('ccHvSigma: higher return std → higher σ; window respected', () => {
  const lo = ccHvSigma(dailyWithRetStd(80, 0.008), { window: 30 }).volAnnual;
  const hi = ccHvSigma(dailyWithRetStd(80, 0.016), { window: 30 }).volAnnual;
  assert.ok(hi > lo, `${hi} > ${lo}`);
});

test('ccHvSigma: insufficient data flagged', () => {
  assert.ok(ccHvSigma(dailyWithRetStd(5, 0.01), { window: 20 }).insufficient);
  assert.ok(ccHvSigma([], { window: 20 }).insufficient);
});

test('ccHvMulti: returns σ per window', () => {
  const m = ccHvMulti(dailyWithRetStd(60, 0.01), [10, 20, 30]);
  assert.ok(m.w10 > 0 && m.w20 > 0 && m.w30 > 0);
});
