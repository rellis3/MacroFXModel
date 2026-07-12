import test from 'node:test';
import assert from 'node:assert/strict';
import { honestPolicy, netPortfolio } from './honestPolicyEngine.js';

// Synthetic 1-min M1: day-varying amplitude so some sessions pierce the band and
// revert (fade setup), split at 22:00 UTC.
function synthM1(nDays, step = 1) {
  const bars = [];
  const startSec = Math.floor(Date.UTC(2020, 0, 1, 22, 0, 0) / 1000);
  const perDay = Math.floor((24 * 60) / step);
  let px = 100;
  for (let d = 0; d < nDays; d++) {
    px *= 1 + (((d % 5) - 2) * 0.0005);
    const amp = 0.006 + 0.020 * Math.abs(Math.sin(d * 1.3) * Math.cos(d * 0.7));
    for (let m = 0; m < perDay; m++) {
      const frac = m / perDay;
      const shape = Math.sin(frac * Math.PI);
      const mid = px * (1 + amp * shape);
      const wob = px * 0.0006 * Math.sin(frac * Math.PI * 40);
      const o = mid, c = mid + wob * 0.2;
      const hi = Math.max(o, c) + Math.abs(wob) + px * 0.0002;
      const lo = Math.min(o, c) - Math.abs(wob) - px * 0.0002;
      bars.push({ time: startSec + (d * perDay + m) * step * 60, open: o, high: hi, low: lo, close: c });
    }
  }
  return bars;
}

test('honestPolicy: learns a per-cell policy and emits an OOS selected stream', () => {
  const r = honestPolicy(synthM1(300), { pair: 'EURUSD' });
  assert.ok(!r.insufficient, 'enough data');
  assert.ok(Array.isArray(r.keptCells), 'kept cells listed');
  assert.ok(typeof r.selected.sharpe === 'number', 'selected OOS sharpe present');
  assert.ok(Array.isArray(r.selected.byDate), 'selected daily stream present');
  assert.ok(typeof r.all.sharpe === 'number', 'trade-all baseline present');
});

test('honestPolicy: only IS-positive cells are kept (selection is real)', () => {
  const r = honestPolicy(synthM1(300), { pair: 'EURUSD', marginPct: 0 });
  for (const c of r.keptCells) assert.ok(c.isExp > 0, `kept cell ${c.key} has IS exp>0`);
});

test('honestPolicy: conditionOnVel splits cells by approach-velocity bucket', () => {
  const r = honestPolicy(synthM1(300), { pair: 'EURUSD', conditionOnVel: true, marginPct: -5, minCellTrades: 3 });
  assert.ok(r.nCells >= 4, 'velocity conditioning can fragment into >4 cells');
  for (const c of r.keptCells) assert.ok(['fast', 'med', 'slow', 'na'].includes(c.velBucket), `cell ${c.key} carries a velocity bucket`);
  // coarse mode collapses to the 4 base action×dir cells
  const coarse = honestPolicy(synthM1(300), { pair: 'EURUSD', conditionOnVel: false, marginPct: -5, minCellTrades: 3 });
  assert.ok(coarse.nCells <= 4, 'coarse mode has ≤4 cells');
});

test('netPortfolio: nets instrument streams into an equity curve with a Sharpe', () => {
  // permissive margin + low min-trades so cells are kept and the plumbing is exercised
  const a = honestPolicy(synthM1(300), { pair: 'EURUSD', marginPct: -5, minCellTrades: 5, conditionOnVel: false });
  const b = honestPolicy(synthM1(300), { pair: 'GBPUSD', marginPct: -5, minCellTrades: 5, conditionOnVel: false });
  assert.ok(a.nKept > 0 && b.nKept > 0, 'cells kept under permissive margin');
  const port = netPortfolio({ EURUSD: a.selected.byDate, GBPUSD: b.selected.byDate });
  assert.ok(typeof port.sharpe === 'number', 'portfolio sharpe');
  assert.ok(Array.isArray(port.curve) && port.curve.length > 0, 'equity curve points');
  assert.ok('maxDrawdownPct' in port && 'totalReturnPct' in port, 'curve stats present');
});

test('honestPolicy: insufficient data flagged, not thrown', () => {
  assert.ok(honestPolicy(synthM1(30)).insufficient, 'flagged');
});
