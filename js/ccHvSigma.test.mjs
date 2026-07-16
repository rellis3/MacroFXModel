import test from 'node:test';
import assert from 'node:assert/strict';
import { ccHvSigma, ccHvMulti, ccHvIntraday } from './ccHvSigma.js';

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

test('ccHvIntraday: builds London-daily closes from intraday then CC-HV', () => {
  // 5-min bars over ~60 days with ~1%/day close-to-close drift → plausible σ.
  const bars = []; const start = Math.floor(Date.UTC(2022, 0, 3, 0, 0, 0) / 1000);
  const perDay = 288; let px = 15000;
  for (let d = 0; d < 60; d++) {
    const dayRet = (d % 2 === 0 ? 1 : -1) * 0.012;   // alternating ~1.2%/day
    for (let m = 0; m < perDay; m++) {
      const o = px, c = px * (1 + dayRet / perDay);
      bars.push({ time: start + (d * perDay + m) * 300, open: o, high: Math.max(o, c) * 1.0005, low: Math.min(o, c) * 0.9995, close: c });
      px = c;
    }
  }
  const r = ccHvIntraday(bars, { window: 20 });
  assert.ok(!r.insufficient, `built (${JSON.stringify(r).slice(0, 120)})`);
  assert.ok(r.volAnnual > 5 && r.volAnnual < 40, `σ ${r.volAnnual}% plausible`);
  assert.ok(r.nDaily >= 40 && r.byWindow.w20 > 0, 'London-daily built + windows');
});

test('ccHvIntraday: insufficient intraday flagged', () => {
  assert.ok(ccHvIntraday([], {}).insufficient);
});
