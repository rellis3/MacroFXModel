/**
 * Synthetic causal-logic check for detectImpulses() (Phase-3 validation) —
 * confirms cooldown + trailing-local-max selection behave like the Pine
 * script on a hand-built bar sequence where the right answer is known by
 * construction, independent of any real market data. Run: node unit_test_impulse_detection.mjs
 */
import { detectImpulses } from '../../../js/impulse4hRangeLevelsEngine.js';
import { atrWilder } from '../../../js/indicatorCore.js';

const H4 = 14400;
const mkBar = (t, o, h, l, c) => ({ time: t, open: o, high: h, low: l, close: c });

const bars = [];
let t = 0;
// 20-bar quiet warmup (range ~1) so ATR(14) settles near ~1 before anything interesting happens.
for (let i = 0; i < 20; i++) { bars.push(mkBar(t, 100, 100.5, 99.5, 100 + (i % 2 === 0 ? 0.2 : -0.2))); t += H4; }
// Clean standalone impulse: range 10 (~10x the ~1 ATR), body 9/10 = 0.9 ratio.
bars.push(mkBar(t, 100, 110, 100, 109)); t += H4;
// Two more elevated-range bars right after (range 4 each) — should NOT fire: eligible on ATR/body
// terms alone, but not the LARGEST range in the trailing 20-bar window (the range-10 bar still is).
bars.push(mkBar(t, 109, 112, 108, 111)); t += H4;
bars.push(mkBar(t, 111, 113, 109, 108)); t += H4;
// 25 quiet bars — clears both the rangeLookback(20) window and the cooldown(20).
for (let i = 0; i < 25; i++) { bars.push(mkBar(t, 100, 100.5, 99.5, 100 + (i % 2 === 0 ? 0.2 : -0.2))); t += H4; }
// Second genuine impulse, bearish: range 11, body 9 -> ratio 0.818.
bars.push(mkBar(t, 105, 106, 95, 96)); t += H4;

const cfg = { atrLen: 14, impulseMult: 1.5, minBodyRatio: 0.6, rangeLookback: 20, cooldownBars: 20 };
const atr = atrWilder(bars, 14);
const impulses = detectImpulses(bars, atr, cfg);

console.log(`Detected ${impulses.length} impulses (expect exactly 2: the range-10 BULL bar and the range-11 BEAR bar; the two range-4 imposters and the quiet bars must NOT fire)`);
for (const imp of impulses) {
  console.log(`  idx=${imp.idx} bullish=${imp.bullish} range=${imp.range} atrMult=${imp.rangeAtrMult.toFixed(2)} bodyRatio=${imp.bodyRatio.toFixed(2)}`);
}
const pass = impulses.length === 2 && impulses[0].range === 10 && impulses[0].bullish === true
  && impulses[1].range === 11 && impulses[1].bullish === false;
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
