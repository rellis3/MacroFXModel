import test from 'node:test';
import assert from 'node:assert/strict';
import { vumanchuFade } from './vumanchuFadeEngine.js';

// Synthetic 1-min M1 with day-varying amplitude so bands get touched and there's
// enough intrabar structure for WaveTrend to produce a reading.
function synthM1(nDays) {
  const bars = []; const startSec = Math.floor(Date.UTC(2020, 0, 1, 22, 0, 0) / 1000);
  const perDay = 24 * 60; let px = 100;
  for (let d = 0; d < nDays; d++) {
    px *= 1 + (((d % 5) - 2) * 0.0006);
    const amp = 0.006 + 0.020 * Math.abs(Math.sin(d * 1.3) * Math.cos(d * 0.7));
    for (let m = 0; m < perDay; m++) {
      const frac = m / perDay;
      const shape = Math.sin(frac * Math.PI) + 0.15 * Math.sin(frac * Math.PI * 12);
      const mid = px * (1 + amp * shape);
      const o = mid, c = mid + px * 0.0004 * Math.sin(frac * 60);
      const hi = Math.max(o, c) + px * 0.0004, lo = Math.min(o, c) - px * 0.0004;
      bars.push({ time: startSec + (d * perDay + m) * 60, open: o, high: hi, low: lo, close: c });
    }
  }
  return bars;
}

test('vumanchuFade: produces blind + confirmed fade stats at both bands, IS/OOS', () => {
  const r = vumanchuFade(synthM1(300), { pair: 'EURUSD' });
  assert.ok(!r.insufficient, 'enough data');
  for (const band of ['median', 'p75']) {
    assert.ok(r[band].oos.blind && r[band].oos.confirmed, `${band} has blind + confirmed OOS`);
    assert.ok(typeof r[band].oos.blind.exp === 'number', `${band} blind exp numeric`);
  }
  assert.ok(r.median.oosVol.hiVol && r.median.oosVol.loVol, 'volatility split present');
});

test('vumanchuFade: confirmed set is a subset of blind (fewer or equal trades)', () => {
  const r = vumanchuFade(synthM1(300), { pair: 'EURUSD' });
  for (const band of ['median', 'p75']) {
    assert.ok(r[band].oos.confirmed.n <= r[band].oos.blind.n, `${band} confirmed ⊆ blind`);
  }
});

test('vumanchuFade: reports lift + edge verdicts', () => {
  const r = vumanchuFade(synthM1(300), { pair: 'EURUSD' });
  assert.ok('median' in r.lift && 'p75' in r.lift, 'lift per band');
  assert.equal(typeof r.edge.median, 'boolean', 'edge verdict boolean');
});

test('vumanchuFade: requireVwap tightens the confirmed set', () => {
  const a = vumanchuFade(synthM1(300), { pair: 'EURUSD', requireVwap: false });
  const b = vumanchuFade(synthM1(300), { pair: 'EURUSD', requireVwap: true });
  assert.ok(b.median.oos.confirmed.n <= a.median.oos.confirmed.n, 'requireVwap ≤ WT-only');
});

test('vumanchuFade: insufficient data flagged, not thrown', () => {
  assert.ok(vumanchuFade(synthM1(30), { pair: 'EURUSD' }).insufficient);
});
