import test from 'node:test';
import assert from 'node:assert/strict';
import { pooledFade, poolPortfolio } from './pooledFadeEngine.js';

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

test('pooledFade: produces OOS confirmed + blind trade streams (confirmed ⊆ blind)', () => {
  const r = pooledFade(synthM1(300), { pair: 'EURUSD' });
  assert.ok(!r.insufficient, 'enough data');
  assert.ok(Array.isArray(r.confirmedOOS) && Array.isArray(r.blindOOS), 'streams present');
  assert.ok(r.confirmedOOS.length <= r.blindOOS.length, 'confirmed ⊆ blind');
  for (const t of r.confirmedOOS) assert.ok(typeof t.gross === 'number' && t.date, 'trade well-formed');
});

test('pooledFade: the exit caps losses near the stop (5-pip vol-scaled)', () => {
  const r = pooledFade(synthM1(300), { pair: 'EURUSD', stopPips: 5 });
  // no single trade should lose more than a few R (stop + slippage of one bar) as % of price
  const worst = Math.min(...r.blindOOS.map(t => t.gross), 0);
  assert.ok(worst > -1.0, `worst gross ${worst}% is bounded by the managed stop`);
});

test('poolPortfolio: nets instrument streams into one curve with Sharpe + per-year', () => {
  const a = pooledFade(synthM1(300), { pair: 'EURUSD' });
  const b = pooledFade(synthM1(300), { pair: 'GBPUSD' });
  const port = poolPortfolio({ EURUSD: { cost: a.cost, trades: a.confirmedOOS }, GBPUSD: { cost: b.cost, trades: b.confirmedOOS } }, 1);
  assert.ok(port.n > 0, 'pooled trades');
  assert.ok(typeof port.sharpe === 'number', 'pooled sharpe');
  assert.ok(Array.isArray(port.curve) && port.curve.length === port.n, 'equity curve');
  assert.ok('maxDD' in port && 'totalReturn' in port && 'perYear' in port, 'stats present');
});

test('poolPortfolio: higher cost multiple lowers the pooled return (monotone)', () => {
  const a = pooledFade(synthM1(300), { pair: 'EURUSD' });
  const byInst = { EURUSD: { cost: a.cost, trades: a.blindOOS } };
  const x1 = poolPortfolio(byInst, 1).totalReturn, x3 = poolPortfolio(byInst, 3).totalReturn;
  assert.ok(x3 <= x1, `×3 cost total ${x3} ≤ ×1 ${x1}`);
});

test('pooledFade: insufficient data flagged, not thrown', () => {
  assert.ok(pooledFade(synthM1(30), { pair: 'EURUSD' }).insufficient);
});

test('pooledFade: volSource "har" runs, reports its source, and differs from platform', () => {
  const bars = synthM1(320);
  const plat = pooledFade(bars, { pair: 'SPX500', assetClass: 'index' });
  const har = pooledFade(bars, { pair: 'SPX500', assetClass: 'index', volSource: 'har' });
  assert.equal(plat.volSource, 'platform', 'default is platform');
  assert.equal(har.volSource, 'har', 'har reported');
  assert.ok(!har.insufficient, 'har produced a result');
  // HAR σ places the bands differently → the OOS trade set should not be identical
  const sig = a => a.map(t => `${t.date}:${t.gross}`).join('|');
  assert.notEqual(sig(har.blindOOS), sig(plat.blindOOS), 'HAR bands change the touches');
});
