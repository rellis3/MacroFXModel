/**
 * gen_vumanchu_vectors.mjs — the cross-language bridge for the VuManChu maths.
 *
 * Imports the CANONICAL JS brick (`js/vumanchuCore.js` + the causal MTF
 * aligner from `js/vumanchuMtf.js`) and writes reference vectors that
 * `pylego/indicators/vumanchu_test.py` asserts against. Generate, don't port
 * (PYTHON_LEGO.md §3): the JS stays the single author of these numbers, the
 * Python module is only ever a second reader, and the test is what stops the
 * two drifting the way the three hand-written Python copies already have.
 *
 * Deterministic synthetic bars (a seeded LCG — no network, no data files), so
 * the vectors are reproducible on any machine and in CI.
 *
 *   node scripts/gen_vumanchu_vectors.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeWaveTrend, computeMoneyFlow, computeVWAP, ema, sma } from '../js/vumanchuCore.js';
import { alignHtfCausal } from '../js/vumanchuMtf.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'pylego', 'indicators', 'vumanchu_vectors.json');

// Deterministic LCG — same constants as scripts/gen_volatility_vectors.mjs.
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Synthetic bars with drift + two cycles + noise, and a fat volume outlier
 *  so the Money-Flow normalisation path is exercised the way real data does
 *  (real M15 carries ~18x volume spikes). */
function makeBars(n, seed, { withVolume = true } = {}) {
  const rnd = lcg(seed);
  const bars = [];
  let px = 100;
  for (let i = 0; i < n; i++) {
    px += 0.02 * Math.sin(i / 11) + 0.05 * Math.sin(i / 47) + (rnd() - 0.5) * 0.3 + 0.004;
    const open = px + (rnd() - 0.5) * 0.1;
    const close = px + (rnd() - 0.5) * 0.1;
    const high = Math.max(open, close) + rnd() * 0.15;
    const low = Math.min(open, close) - rnd() * 0.15;
    // Base tick-count-ish volume, with a rare 18x outlier.
    const spike = (i % 137 === 0) ? 18 : 1;
    const volume = withVolume ? Math.round((5 + rnd() * 40) * spike) : undefined;
    bars.push({ t: 1451865600 + i * 60, open, high, low, close, ...(withVolume ? { volume } : {}) });
  }
  return bars;
}

const bars = makeBars(600, 12345);
const barsNoVol = makeBars(300, 999, { withVolume: false });

// Degenerate-input case: a flat series drives the WT channel-index guard
// (d <= WT_EPS) down the `ci = 0` branch, which is the one place the two
// former JS copies had actually drifted.
const flatBars = Array.from({ length: 80 }, (_, i) => ({
  t: 1451865600 + i * 60, open: 50, high: 50, low: 50, close: 50, volume: 10,
}));

const H = bars.map(b => b.high), L = bars.map(b => b.low);
const C = bars.map(b => b.close), O = bars.map(b => b.open), V = bars.map(b => b.volume);

// ── MTF alignment fixture: M1 fast grid vs M15 slow grid ─────────────────────
const slowBars = [];
for (let i = 0; i + 15 <= bars.length; i += 15) {
  const w = bars.slice(i, i + 15);
  slowBars.push({
    t: w[0].t,
    open: w[0].open, close: w[w.length - 1].close,
    high: Math.max(...w.map(b => b.high)), low: Math.min(...w.map(b => b.low)),
    volume: w.reduce((s, b) => s + b.volume, 0),
  });
}
const slowWt = computeWaveTrend(slowBars, { n1: 9, n2: 12, sp: 3 });
const aligned = alignHtfCausal(bars, slowBars, slowWt.wt1, { fastSec: 60, slowSec: 900 });

const lib = computeWaveTrend(bars, { n1: 10, n2: 21, sp: 4 });
const op = computeWaveTrend(bars, { n1: 9, n2: 12, sp: 3 });
const flat = computeWaveTrend(flatBars, { n1: 9, n2: 12, sp: 3 });
const noVolWt = computeWaveTrend(barsNoVol, { n1: 10, n2: 21, sp: 4 });
const vwap = computeVWAP(bars);

const payload = {
  _generated_by: 'scripts/gen_vumanchu_vectors.mjs',
  _source_of_truth: 'js/vumanchuCore.js + js/vumanchuMtf.js alignHtfCausal',
  _note: 'Regenerate, never hand-edit. Python asserts against these.',
  bars: bars.map(b => ({ t: b.t, o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume })),
  bars_no_volume: barsNoVol.map(b => ({ t: b.t, o: b.open, h: b.high, l: b.low, c: b.close })),
  flat_bars: flatBars.map(b => ({ t: b.t, o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume })),
  ema_5: ema(C, 5),
  sma_7: sma(C, 7),
  wt_library: { params: { n1: 10, n2: 21, sp: 4 }, wt1: lib.wt1, wt2: lib.wt2 },
  wt_operator: { params: { n1: 9, n2: 12, sp: 3 }, wt1: op.wt1, wt2: op.wt2 },
  wt_flat: { params: { n1: 9, n2: 12, sp: 3 }, wt1: flat.wt1, wt2: flat.wt2 },
  wt_no_volume: { params: { n1: 10, n2: 21, sp: 4 }, wt1: noVolWt.wt1, wt2: noVolWt.wt2 },
  money_flow_14: computeMoneyFlow(bars, { period: 14 }),
  vwap_cumulative: vwap.vwap,
  vwap_osc: vwap.osc,
  mtf: {
    slow_bars: slowBars.map(b => ({ t: b.t, o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume })),
    fast_sec: 60, slow_sec: 900,
    slow_wt1: slowWt.wt1,
    aligned_values: aligned.values,
    aligned_slow_idx: aligned.slowIdx,
  },
};

writeFileSync(OUT, JSON.stringify(payload));
console.log(`wrote ${OUT}`);
console.log(`  bars=${bars.length} slow=${slowBars.length} flat=${flatBars.length}`);
