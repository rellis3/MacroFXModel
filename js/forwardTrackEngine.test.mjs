import test from 'node:test';
import assert from 'node:assert/strict';
import { scanConfirmedSignals, mergeLog, forwardStats } from './forwardTrackEngine.js';

// synthetic 1-min with clear intraday swings so some confirmed fades fire.
function synthM1(nDays) {
  const bars = []; const startSec = Math.floor(Date.UTC(2020, 0, 1, 22, 0, 0) / 1000);
  const perDay = 24 * 60; let px = 100;
  for (let d = 0; d < nDays; d++) {
    px *= 1 + (((d % 5) - 2) * 0.0006);
    const amp = 0.006 + 0.02 * Math.abs(Math.sin(d * 1.3) * Math.cos(d * 0.7));
    for (let m = 0; m < perDay; m++) {
      const frac = m / perDay;
      const shape = Math.sin(frac * Math.PI) + 0.2 * Math.sin(frac * Math.PI * 14);
      const mid = px * (1 + amp * shape);
      const o = mid, c = mid + px * 0.0004 * Math.sin(frac * 60);
      const hi = Math.max(o, c) + px * 0.0005, lo = Math.min(o, c) - px * 0.0005;
      bars.push({ time: startSec + (d * perDay + m) * 60, open: o, high: hi, low: lo, close: c });
    }
  }
  return bars;
}

test('scanConfirmedSignals: returns confirmed signals with realised outcome, never the last session', () => {
  const bars = synthM1(200);
  const r = scanConfirmedSignals(bars, { pair: 'EURUSD', requireVwap: false });
  assert.ok(!r.insufficient, 'enough data');
  assert.ok(Array.isArray(r.signals));
  for (const s of r.signals) {
    assert.ok(['up50', 'dn50', 'up75', 'dn75'].includes(s.line));
    assert.ok(s.dir === 'sell' || s.dir === 'buy');
    assert.equal(typeof s.gross, 'number');
    assert.ok(s.cost >= 0);
  }
  // the last (possibly partial) session must never be logged
  const lastSess = new Date(bars.at(-1).time * 1000).toISOString().slice(0, 10);
  assert.ok(!r.signals.some(s => s.date === lastSess), 'excludes the most recent session');
});

test('scanConfirmedSignals: sinceDate only appends newer sessions', () => {
  const bars = synthM1(200);
  const all = scanConfirmedSignals(bars, { pair: 'EURUSD', requireVwap: false });
  if (all.signals.length < 4) return;                       // need a couple of days
  const cut = all.signals[Math.floor(all.signals.length / 2)].date;
  const inc = scanConfirmedSignals(bars, { pair: 'EURUSD', requireVwap: false, sinceDate: cut });
  assert.ok(inc.signals.every(s => s.date > cut), 'only sessions strictly after sinceDate');
});

test('mergeLog: de-dupes by (date,pair,line) and keeps date order', () => {
  const a = [{ date: '2020-02-01', pair: 'EURUSD', line: 'up50', gross: 0.1, cost: 0.012 }];
  const b = [
    { date: '2020-02-01', pair: 'EURUSD', line: 'up50', gross: 0.9, cost: 0.012 }, // dup — must not overwrite
    { date: '2020-01-15', pair: 'EURUSD', line: 'dn75', gross: 0.2, cost: 0.012 },
  ];
  const m = mergeLog(a, b);
  assert.equal(m.length, 2, 'one dup dropped');
  assert.equal(m[0].date, '2020-01-15', 'sorted by date');
  assert.equal(m.find(t => t.line === 'up50').gross, 0.1, 'existing row wins');
});

test('forwardStats: splits baseline vs forward at trackingStart, cost monotone', () => {
  const log = [
    { date: '2020-01-10', pair: 'EURUSD', line: 'up50', gross: 0.20, cost: 0.012 },
    { date: '2020-01-20', pair: 'EURUSD', line: 'dn50', gross: 0.10, cost: 0.012 },
    { date: '2020-03-01', pair: 'EURUSD', line: 'up75', gross: 0.30, cost: 0.012 },
    { date: '2020-03-05', pair: 'GBPUSD', line: 'dn75', gross: 0.05, cost: 0.012 },
  ];
  const s = forwardStats(log, { trackingStart: '2020-02-01' });
  assert.equal(s.baseline.n, 2, 'two pre-tracking rows');
  assert.equal(s.forward.n, 2, 'two forward rows');
  assert.ok(s.forward.totalReturn >= s.forward.x2.totalReturn, 'higher cost lowers return');
  assert.ok(s.byInst.EURUSD && s.byInst.GBPUSD, 'per-instrument split');
});
