/**
 * Golden-vector generator for the Python approach-velocity port.
 *
 * The Volatility Bot's ONLY ported strategy math is approach-velocity bucketing
 * (the policy cell key). This script runs the CANONICAL js/touchFeatures.js on a
 * handful of synthetic touches and writes the expected {value, bucket} to
 * pylego/strategy/volatility_vectors.json. The Python golden test asserts parity.
 *
 * Regenerate (never hand-edit the JSON) whenever touchFeatures changes:
 *   node scripts/gen_volatility_vectors.mjs
 */
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createTouchFeatures, TOUCH_DEFAULTS } from '../js/touchFeatures.js';

const here = dirname(fileURLToPath(import.meta.url));
const tf = createTouchFeatures();                          // locked defaults
const cfg = { velWin: TOUCH_DEFAULTS.velWin, velFast: TOUCH_DEFAULTS.velFast, velSlow: TOUCH_DEFAULTS.velSlow };

// approachVelocity reads only close[touchIdx] and close[touchIdx - velWin]; fill
// the rest flat so each case isolates a known Δ over the velocity window.
function mkCase(label, { len = 21, touchIdx = 20, open = 1.10, sigma = 0.006, base = 1.10, delta = 0 }) {
  const closes = new Array(len).fill(base);
  closes[touchIdx] = base + delta;                         // move over the window = delta
  const bars = closes.map((c, i) => ({ time: i * 60, open: c, high: c, low: c, close: c }));
  const out = tf.compute({ bars, touchIdx, open, sigma, side: 'up' });
  return { label, closes, touchIdx, open, sigma, cfg, expect: out.approachVel };
}

// σ=0.006, open=1.10, velWin=15 → vSig = |delta|/open/σ.
// grind ≤0.25 · spike ≥0.60 · else med.  Δ=0.001→0.152(grind) ·0.003→0.455(med) ·0.006→0.909(spike)
const cases = [
  mkCase('grind_up',   { delta:  0.001 }),
  mkCase('med_up',     { delta:  0.003 }),
  mkCase('spike_up',   { delta:  0.006 }),
  mkCase('grind_down', { delta: -0.001 }),
  mkCase('spike_down', { delta: -0.006 }),
  mkCase('boundary_fast', { delta: 0.0036 + 1e-7 }),       // just over velFast·σ·open
  mkCase('boundary_slow', { delta: 0.00165 - 1e-7 }),      // just under velSlow·σ·open
  mkCase('insufficient_bars', { touchIdx: 10, delta: 0.006 }),  // touchIdx < velWin → null
];

const path = join(here, '..', 'pylego', 'strategy', 'volatility_vectors.json');
writeFileSync(path, JSON.stringify({ generatedFrom: 'js/touchFeatures.js', cfg, cases }, null, 2) + '\n');
console.log(`wrote ${cases.length} vectors → ${path}`);
