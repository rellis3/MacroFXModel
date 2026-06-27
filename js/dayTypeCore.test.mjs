// Synthetic, no-network unit test for the lego brick.
import { dayTypeScore, classifyDayType, ESTIMATORS, DAYTYPE_PRESETS } from './dayTypeCore.js';

// Reference: the ORIGINAL inline implementation, copied verbatim from the old
// forecastCore.js, to prove the extracted default preset matches bit-for-bit.
function refScore(closes, idx, win = 14) {
  if (idx < win + 2) return 0.5;
  const a = closes[idx - 1], b = closes[idx - 1 - win];
  let sumAbs = 0;
  for (let j = idx - win; j < idx; j++) sumAbs += Math.abs(closes[j] - closes[j - 1]);
  const er = sumAbs > 1e-12 ? Math.min(Math.abs(a - b) / sumAbs, 1) : 0;
  const r1 = [], r2 = [];
  for (let j = idx - win; j < idx; j++) r1.push(Math.log(closes[j] / closes[j - 1]));
  for (let j = idx - win; j < idx - 1; j++) r2.push(Math.log(closes[j + 1] / closes[j - 1]));
  const v = arr => { const m = arr.reduce((s, x) => s + x, 0) / arr.length; return arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length; };
  const v1 = v(r1), v2 = v(r2);
  const vr = v1 > 1e-18 ? v2 / (2 * v1) : 1;
  const vrTrend = Math.min(Math.max((vr - 0.5) / 1.0, 0), 1);
  return +(0.6 * er + 0.4 * vrTrend).toFixed(4);
}

// Deterministic synthetic series (no Math.random): a trend leg + a choppy leg.
const N = 400;
const trend = [], chop = [];
let pt = 100, pc = 100;
for (let i = 0; i < N; i++) {
  pt *= 1 + 0.0008 + 0.002 * Math.sin(i / 50);          // persistent drift
  trend.push(pt);
  pc *= 1 + 0.004 * Math.sin(i) * Math.cos(i * 0.7);    // mean-reverting wiggle
  chop.push(pc);
}

let maxDiff = 0, checked = 0;
for (const series of [trend, chop]) {
  for (let idx = 50; idx < N; idx++) {             // real usage starts well above win+2
    const got = dayTypeScore(series, idx, 14);
    const exp = refScore(series, idx, 14);
    maxDiff = Math.max(maxDiff, Math.abs(got - exp));
    checked++;
  }
}
console.log(`[1] default preset vs original inline: ${checked} points, max|Δ| = ${maxDiff}`);
if (maxDiff > 1e-12) { console.error('  ✗ FAIL — numerics drifted'); process.exit(1); }
console.log('  ✓ bit-identical');

// Estimators bounded in [0,1] and ordering: trend day should score higher.
const ctx = (closes, idx) => ({ closes, idx, win: 14 });
let bad = 0;
for (const series of [trend, chop]) for (let idx = 50; idx < N; idx++)
  for (const [n, fn] of Object.entries(ESTIMATORS)) {
    const v = fn(ctx(series, idx));
    if (!(v >= 0 && v <= 1)) { bad++; console.error(`  ✗ ${n} out of [0,1]: ${v}`); }
  }
console.log(`[2] all estimators in [0,1]: ${bad === 0 ? '✓' : '✗ ' + bad + ' violations'}`);
if (bad) process.exit(1);

const avg = (series) => { let s = 0, c = 0; for (let i = 50; i < N; i++) { s += dayTypeScore(series, i, 14); c++; } return s / c; };
const tT = avg(trend), tC = avg(chop);
console.log(`[3] mean T  trend=${tT.toFixed(3)}  chop=${tC.toFixed(3)}  (trend should be higher): ${tT > tC ? '✓' : '✗'}`);
if (!(tT > tC)) process.exit(1);

// Presets switch behaviour and labels populate.
const r = classifyDayType(ctx(trend, 300), { weights: DAYTYPE_PRESETS.balanced });
console.log(`[4] balanced preset @ trend[300]: T=${r.T} label=${r.label} components=${Object.keys(r.components).join(',')}`);
if (!(r.T >= 0 && r.T <= 1) || !r.label) process.exit(1);

// signedT = (T-0.5)*2, stays in [-1,1], and agrees with T's side everywhere.
let sBad = 0, sMax = 0;
for (const series of [trend, chop]) for (let idx = 50; idx < N; idx++) {
  const o = classifyDayType(ctx(series, idx));
  const expected = +((o.T - 0.5) * 2).toFixed(4);
  if (o.signedT !== expected || o.signedT < -1 || o.signedT > 1) sBad++;
  sMax = Math.max(sMax, Math.abs(o.signedT - expected));
  // sign must match side: T>0.5 → signedT>0 (follow), T<0.5 → signedT<0 (fade)
  if ((o.T > 0.5 && o.signedT <= 0) || (o.T < 0.5 && o.signedT >= 0)) sBad++;
}
console.log(`[4b] signedT = (T-0.5)*2, in [-1,1], side-consistent: ${sBad === 0 ? '✓' : '✗ ' + sBad + ' violations'} (max|Δ|=${sMax})`);
if (sBad) process.exit(1);

// rangeBudget brick returns neutral without its inputs, and a value with them.
const rbNeutral = ESTIMATORS.rangeBudget({});
const rbLow = ESTIMATORS.rangeBudget({ realizedRangeFrac: 0.002, forecastRangeFrac: 0.01 });
console.log(`[5] rangeBudget: neutral=${rbNeutral} (want 0.5), lowBudget=${rbLow} (want >0.5): ${rbNeutral === 0.5 && rbLow > 0.5 ? '✓' : '✗'}`);
if (!(rbNeutral === 0.5 && rbLow > 0.5)) process.exit(1);

console.log('\nALL PASSED ✓');
