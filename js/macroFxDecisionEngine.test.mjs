/**
 * MacroFX Decision Engine (assembled) — synthetic unit tests (no network).
 * Run: node js/macroFxDecisionEngine.test.mjs
 *
 * Proves the assembled pieces are sound: the state read directs sensibly, the
 * confidence gate makes the book SELECTIVE, manageTrade handles partial/BE/
 * trail/time with no lookahead, and the A/B wiring returns both books +
 * calibration. It does NOT and cannot prove edge — that is the OOS card's job.
 */

import assert from 'node:assert';
import {
  readState, confidenceFor, manageTrade, runDecision, compareDecision, calibrationByConfidence,
} from './macroFxDecisionEngine.js';

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); console.log('  ✓', m); passed++; };

function synthD1(n = 700, start = 1.10) {
  const bars = []; let px = start; const t0 = Date.UTC(2016, 0, 1) / 1000;
  for (let i = 0; i < n; i++) {
    const noise = Math.sin(i * 0.7) * 0.0018 + Math.cos(i * 0.29) * 0.0011;
    const revert = (start - px) * 0.03;
    const open = px, close = px + noise + revert;
    const high = Math.max(open, close) + 0.0009 + Math.abs(Math.sin(i * 1.3)) * 0.0006;
    const low = Math.min(open, close) - 0.0009 - Math.abs(Math.cos(i * 1.1)) * 0.0006;
    const date = new Date((t0 + i * 86400) * 1000).toISOString().substring(0, 10);
    bars.push({ date, open: +open.toFixed(5), high: +high.toFixed(5), low: +low.toFixed(5), close: +close.toFixed(5) });
    px = close;
  }
  return bars;
}
function synthM1(d1) {
  const map = new Map();
  for (const b of d1) {
    const de = Math.floor(Date.parse(b.date) / 1000), bars = [];
    for (let k = 0; k < 48; k++) {
      const f = k / 47, mid = b.open + (b.close - b.open) * f, wob = Math.sin(k * 0.9) * (b.high - b.low) * 0.35;
      const o = mid, c = mid + wob * 0.2;
      bars.push({ time: de + k * 1800, open: +o.toFixed(5), high: +Math.max(o, c).toFixed(5), low: +Math.min(o, c).toFixed(5), close: +c.toFixed(5) });
    }
    map.set(b.date, bars);
  }
  return map;
}

console.log('MacroFX Decision Engine (assembled) tests\n');
const d1 = synthD1();
const closes = d1.map(b => b.close);
const timed = d1.map(b => ({ ...b, time: Math.floor(Date.parse(b.date) / 1000) }));

// 1) State read: bounded, directs, and produces a stand-aside band.
{
  const seen = new Set();
  for (let i = 100; i < d1.length; i++) {
    const st = readState(timed.slice(0, i), closes, i, 0.006, 0.006, { followMin: 0.55, fadeMax: 0.38 });
    assert.ok(st.S >= 0 && st.S <= 1, 'S in [0,1]');
    seen.add(st.action);
  }
  ok(true, 'readState returns S∈[0,1] every session');
  ok(seen.has('none'), 'a stand-aside (action=none) band exists — the engine can decline to trade');
  ok(seen.has('fade') || seen.has('follow'), 'the engine also directs trades (fade/follow)');
}

// 2) Confidence: monotone in evidence count and state alignment.
{
  const base = { action: 'follow', S: 0.8, distFrac: 0.1, reachFrac: 1.0 };
  const c2 = confidenceFor({ ...base, zone: { distinctSources: 2 } });
  const c4 = confidenceFor({ ...base, zone: { distinctSources: 4 } });
  ok(c4 > c2, `more independent evidence → higher confidence (${c2} < ${c4})`);
  const aligned  = confidenceFor({ action: 'follow', S: 0.9, distFrac: 0.1, reachFrac: 1, zone: { distinctSources: 3 } });
  const opposed  = confidenceFor({ action: 'follow', S: 0.2, distFrac: 0.1, reachFrac: 1, zone: { distinctSources: 3 } });
  ok(aligned > opposed, 'state-aligned follow scores higher than state-opposed');
}

// 3) manageTrade: partial+BE+trail+time, MAE off the path, sane accounting.
{
  // A long that runs up: entry 100, stop 99 (R=1). Bars rise to 103 then close 102.5.
  const bars = [
    { time: 1, open: 100, high: 100.2, low: 99.9, close: 100.1 },   // fill bar (limit long fills on low<=entry)
    { time: 2, open: 100.1, high: 101.2, low: 100.0, close: 101.1 },// +1R hit → partial + BE
    { time: 3, open: 101.1, high: 103.0, low: 101.0, close: 102.8 },// runs
    { time: 4, open: 102.8, high: 103.1, low: 101.8, close: 102.5 },// pulls back, close
  ];
  const r = manageTrade(bars, { entry: 100, sl: 99, isBuy: true, entryType: 'limit' }, 100, { partialFrac: 0.5, beAtR: 1, trailR: 1, costPct: 0.01, slipPct: 0 });
  ok(r && r.filled, 'manageTrade fills the limit long');
  ok(r.partialTaken, 'partial taken once +1R was reached');
  ok(r.pnlR > 0, `winning managed trade books positive R (${r.pnlR})`);
  ok(r.maePct >= 0, 'MAE is non-negative, read off the path');
  // A long stopped out immediately: entry 100 stop 99, next bar low 98.
  const bad = [
    { time: 1, open: 100, high: 100.1, low: 100.0, close: 100.05 },
    { time: 2, open: 100, high: 100.05, low: 98.5, close: 98.6 },
  ];
  const rb = manageTrade(bad, { entry: 100, sl: 99, isBuy: true, entryType: 'limit' }, 100, { partialFrac: 0.5, beAtR: 1, trailR: 1, costPct: 0.01, slipPct: 0 });
  ok(rb.exitReason === 'stop' && rb.pnlR < 0, `full stop before any partial → ~−1R (${rb.pnlR})`);
  ok(rb.pnlR >= -1.2 && rb.pnlR <= -0.9, 'stop loss is about −1R (risk-defined)');
}

// 4) Selectivity: the assembled book trades far LESS than the naked skeleton.
{
  const m1 = synthM1(d1);
  const managed = runDecision(d1, m1, 'fx', 'EURUSD', { minLookback: 100, confThresh: 0.5 });
  // naked skeleton via the same options through compareDecision
  const cmp = compareDecision(d1, m1, 'fx', 'EURUSD', { minLookback: 100, confThresh: 0.5, oosFrac: 0.4 });
  const nManaged = cmp.trades.managed.length, nNaked = cmp.trades.naked.length;
  ok(nManaged > 0, `assembled book produced trades (${nManaged})`);
  ok(nManaged < nNaked, `assembled is SELECTIVE: ${nManaged} managed << ${nNaked} naked`);
  ok(cmp.managed.oos && cmp.naked.oos, 'A/B returns both managed and naked IS/OOS');
}

// 5) No lookahead: truncating at a trade's date can't change that trade.
{
  const managed = runDecision(d1, null, 'fx', 'EURUSD', { minLookback: 100, confThresh: 0.45 });
  assert.ok(managed.length > 3, 'need trades to test causality');
  const probe = managed[Math.floor(managed.length / 2)];
  const cut = d1.findIndex(b => b.date === probe.date);
  const again = runDecision(d1.slice(0, cut + 1), null, 'fx', 'EURUSD', { minLookback: 100, confThresh: 0.45 }).find(r => r.date === probe.date);
  ok(again && Math.abs(again.pnl_pct - probe.pnl_pct) < 1e-9 && again.side === probe.side,
     'assembled trade identical when future bars removed → no lookahead');
}

// 6) Calibration block is well-formed.
{
  const managed = runDecision(d1, null, 'fx', 'EURUSD', { minLookback: 100, confThresh: 0.4 });
  const cal = calibrationByConfidence(managed);
  ok(Array.isArray(cal) && cal.length >= 3, `calibration returns confidence buckets (${cal.length})`);
  ok(cal.every(b => 'expectancy' in b && 'trades' in b && b.lo <= b.hi), 'buckets carry lo/hi/trades/expectancy');
}

console.log(`\n${passed} checks passed.`);
