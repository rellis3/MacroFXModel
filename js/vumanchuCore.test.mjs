// Golden, no-network test for the unified VuManChu compute. Proves the single
// core reproduces BOTH former copies bit-for-bit on realistic data, and that the
// two use cases (series vs signal) run the same underlying compute.
//   node js/vumanchuCore.test.mjs

import {
  computeWaveTrend, waveTrendSeries, waveTrendReading, vumanchuWaveTrend,
  computeVWAP, computeMoneyFlow, WT_EPS,
} from './vumanchuCore.js';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const arrEq = (a, b, eps = 0) => a.length === b.length && a.every((v, i) =>
  (Number.isNaN(v) && Number.isNaN(b[i])) || Math.abs(v - b[i]) <= eps);

// ── Synthetic OHLCV bars (deterministic, no Math.random) ──────────────────────
const bars = [];
let px = 1.2000;
for (let i = 0; i < 400; i++) {
  const o = px, c = px * (1 + 0.0006 * Math.sin(i / 7) + 0.0002 * Math.cos(i / 3));
  bars.push({ open: o, high: Math.max(o, c) * 1.0008, low: Math.min(o, c) * 0.9992, close: c, volume: 100 + (i % 13) });
  px = c;
}

// ── Reference A: asiaRangeEngine._computeWT1Series, copied verbatim (d>1e-10) ──
function refAsiaWT1(bars, n1 = 10, n2 = 21) {
  const n = bars.length, k1 = 2 / (n1 + 1), k2 = 2 / (n2 + 1);
  const hlc3 = new Array(n); for (let i = 0; i < n; i++) hlc3[i] = (bars[i].high + bars[i].low + bars[i].close) / 3;
  const esa = new Array(n); esa[0] = hlc3[0]; for (let i = 1; i < n; i++) esa[i] = hlc3[i] * k1 + esa[i - 1] * (1 - k1);
  const d = new Array(n); d[0] = Math.abs(hlc3[0] - esa[0]); for (let i = 1; i < n; i++) d[i] = Math.abs(hlc3[i] - esa[i]) * k1 + d[i - 1] * (1 - k1);
  const ci = new Array(n); for (let i = 0; i < n; i++) ci[i] = d[i] > 1e-10 ? (hlc3[i] - esa[i]) / (0.015 * d[i]) : 0;
  const wt1 = new Array(n); wt1[0] = ci[0]; for (let i = 1; i < n; i++) wt1[i] = ci[i] * k2 + wt1[i - 1] * (1 - k2);
  return wt1;
}

// ── Reference B: old js/vumanchu.js computeWT, copied verbatim (d>0) ───────────
function refVumanchuWT(bars, { n1 = 10, n2 = 21, sp = 4 } = {}) {
  const ema = (v, p) => { const k = 2 / (p + 1); const o = [v[0]]; for (let i = 1; i < v.length; i++) o.push(v[i] * k + o[i - 1] * (1 - k)); return o; };
  const sma = (v, p) => v.map((_, i) => i < p - 1 ? NaN : v.slice(i - p + 1, i + 1).reduce((s, x) => s + x, 0) / p);
  const hlc3 = bars.map(b => (b.high + b.low + b.close) / 3);
  const esa_ = ema(hlc3, n1), d_ = ema(hlc3.map((h, i) => Math.abs(h - esa_[i])), n1);
  const ci = hlc3.map((h, i) => d_[i] > 0 ? (h - esa_[i]) / (0.015 * d_[i]) : 0);
  return { wt1: ema(ci, n2), wt2: sma(ema(ci, n2), sp) };
}

console.log('[golden — one compute reproduces both former copies]');
const coreWT1 = waveTrendSeries(bars, { n1: 10, n2: 21 });
ok('core WT1 == asiaRangeEngine._computeWT1Series (bit-identical)', arrEq(coreWT1, refAsiaWT1(bars, 10, 21), 0));
const core = computeWaveTrend(bars, { n1: 10, n2: 21, sp: 4 });
const refV = refVumanchuWT(bars, { n1: 10, n2: 21, sp: 4 });
ok('core WT1 == old vumanchu.computeWT.wt1 (bit-identical here)', arrEq(core.wt1, refV.wt1, 0));
ok('core WT2 == old vumanchu.computeWT.wt2 (bit-identical here)', arrEq(core.wt2, refV.wt2, 0));

console.log('[why the standardized guard is the SAFER one]');
// On a dead/flat market the deviation d is ~0, but float rounding leaves it at a
// tiny ~1e-16 (not exactly 0). The old `d > 0` guard then divides by that noise
// and emits spurious ±66 oscillator spikes; the standardized `d > 1e-10` guard
// suppresses them → 0. This is the edge case, and 1e-10 is the correct behaviour.
const flat = Array.from({ length: 60 }, () => ({ open: 1.5, high: 1.5, low: 1.5, close: 1.5, volume: 1 }));
const coreFlat = waveTrendSeries(flat);
const oldFlat = refVumanchuWT(flat).wt1;
ok('core (d>1e-10) suppresses flat-market noise → all 0', coreFlat.every(v => v === 0));
ok('old (d>0) emitted spurious nonzero spikes from float noise', oldFlat.some(v => Math.abs(v) > 1));
ok('→ standardizing on WT_EPS=1e-10 is an improvement, not just a merge', WT_EPS === 1e-10 && coreFlat.every(v => v === 0) && oldFlat.some(v => Math.abs(v) > 1));

console.log('[two use cases, one compute]');
const series = waveTrendSeries(bars, { n1: 10, n2: 21 });
const reading = waveTrendReading(bars, { n1: 10, n2: 21, sp: 4, direction: 'LONG' });
ok('use case 1 → WT1[] series', Array.isArray(series) && series.length === bars.length);
ok('use case 2 → latest-bar signal off the SAME compute', reading.value === series[series.length - 1]);
ok('signal is a known label', ['OVERSOLD', 'OVERBOUGHT', 'BULLISH', 'BEARISH', 'NEUTRAL'].includes(reading.signal));
ok('direction agreement is a boolean', typeof reading.agree === 'boolean');
ok('dispatcher mode:series == waveTrendSeries', arrEq(vumanchuWaveTrend(bars, { mode: 'series', n1: 10, n2: 21 }), series, 0));
ok('dispatcher mode:signal == waveTrendReading.value', vumanchuWaveTrend(bars, { mode: 'signal', n1: 10, n2: 21 }).value === reading.value);

console.log('[VWAP / Money Flow]');
const { vwap, osc } = computeVWAP(bars);
ok('VWAP aligned + within data range', vwap.length === bars.length && vwap.every(v => v > 1.0 && v < 1.5));
ok('VWAP oscillator in [-100,100]', osc.every(v => v >= -100 - 1e-9 && v <= 100 + 1e-9));
const mf = computeMoneyFlow(bars, { period: 14 });
ok('Money Flow aligned + bounded', mf.length === bars.length && mf.every(v => v >= -100 - 1e-9 && v <= 100 + 1e-9));

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
