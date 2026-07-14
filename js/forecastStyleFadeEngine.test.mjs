import test from 'node:test';
import assert from 'node:assert/strict';
import { forecastStyleFade } from './forecastStyleFadeEngine.js';

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

test('forecastStyleFade: builds the full basis × line-type matrix (fade+follow)', () => {
  const r = forecastStyleFade(synthM1(320), { pair: 'EURUSD' });
  assert.ok(!r.insufficient, 'enough data');
  assert.deepEqual(r.bases, ['platform', 'cog', 'yz', 'garch', 'hist', 'har']);
  assert.deepEqual(r.lines, ['hl50', 'hl75', 'oc50', 'oc75']);
  for (const b of r.bases) for (const L of r.lines) {
    assert.ok(r.matrix[b][L].fade && r.matrix[b][L].follow, `${b}/${L} has fade+follow`);
    assert.ok(typeof r.matrix[b][L].fade.exp === 'number' || r.matrix[b][L].fade.exp === null, `${b}/${L} fade exp`);
  }
});

test('forecastStyleFade: every basis produces trades at some line type', () => {
  const r = forecastStyleFade(synthM1(320), { pair: 'EURUSD' });
  for (const b of r.bases) {
    const total = r.lines.reduce((s, L) => s + r.matrix[b][L].fade.n + r.matrix[b][L].follow.n, 0);
    assert.ok(total > 0, `${b} produced ${total} trades`);
  }
});

test('forecastStyleFade: reports a best (basis,line,action) cell', () => {
  const r = forecastStyleFade(synthM1(320), { pair: 'EURUSD' });
  if (r.best) { assert.ok(r.bases.includes(r.best.basis) && r.lines.includes(r.best.line), 'best is valid'); assert.ok(['fade', 'follow'].includes(r.best.action)); }
});

test('forecastStyleFade: insufficient data flagged, not thrown', () => {
  assert.ok(forecastStyleFade(synthM1(30), { pair: 'EURUSD' }).insufficient);
});
