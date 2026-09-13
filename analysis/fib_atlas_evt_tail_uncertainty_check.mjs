// Checks the "Extreme tail fit" card's shape (xi) point estimate for
// sampling uncertainty, and lists the actual worst days against the fit's
// own implied ceiling -- following up on a shared screenshot of the GPD fit
// (xi=-0.25, ceiling~1.9%) with the specific question: is a bounded-tail
// call defensible on ~205 exceedances, or is that within noise of xi>=0
// (unbounded)? js/evtTail.js's fitGPD is a closed-form PWM estimator with
// no confidence interval computed anywhere in the codebase -- this adds one
// via a nonparametric bootstrap (resample the exceedances with replacement,
// refit, repeat), read-only, no engine files touched.
import { readFileSync } from 'fs';
import { fitTailModel, fitGPD } from '../js/evtTail.js';

const j = JSON.parse(readFileSync(process.argv[2] || 'vp_combined.json', 'utf8'));
const dailyReturns = (j.equityCurve || []).map(p => p.dailyReturn);
console.log(`n days: ${dailyReturns.length}`);

const model = fitTailModel(dailyReturns);
if (!model.ok) { console.log('Fit failed:', model.reason); process.exit(1); }
console.log(`\nLive fit: threshold=${model.threshold} shape=${model.shape} scale=${model.scale} nExceed=${model.nExceed}/${model.n}`);
const ceiling = model.shape < 0 ? -model.threshold + model.scale / Math.abs(model.shape) : null;
console.log(`Implied ceiling (loss magnitude): ${ceiling?.toFixed(2)}%`);

// Worst 10 actual days (raw return, so a loss is negative) vs the ceiling.
const sorted = [...j.equityCurve].sort((a, b) => a.dailyReturn - b.dailyReturn);
console.log('\nWorst 10 actual days:');
console.log('date\tdailyReturn%\tlossMagnitude%\tbeyondCeiling?');
for (const d of sorted.slice(0, 10)) {
  const lossMag = -d.dailyReturn;
  console.log(`${d.date}\t${d.dailyReturn.toFixed(3)}\t${lossMag.toFixed(3)}\t${ceiling != null && lossMag > ceiling ? 'YES' : 'no'}`);
}

// Bootstrap CI on shape: resample the EXCEEDANCES (not the raw series) with
// replacement, refit GPD, repeat. This isolates the estimator's own sampling
// variance at the fitted threshold/exceedance-count, holding the threshold
// fixed (matches how the live page fixes thresholdPctile=0.90).
const losses = dailyReturns.map(r => -r).sort((a, b) => a - b);
const n = losses.length;
const thIdx = Math.min(n - 1, Math.floor(0.90 * n));
const threshold = losses[thIdx];
const exceedances = losses.filter(l => l > threshold).map(l => l - threshold);

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0x9e3779b9);
const B = 5000;
const shapes = [];
for (let b = 0; b < B; b++) {
  const resample = new Array(exceedances.length);
  for (let i = 0; i < exceedances.length; i++) resample[i] = exceedances[(rng() * exceedances.length) | 0];
  const fit = fitGPD(resample);
  if (fit) shapes.push(fit.shape);
}
shapes.sort((a, b) => a - b);
const pctile = p => shapes[Math.min(shapes.length - 1, Math.floor(p * shapes.length))];
const pctNonNegative = shapes.filter(s => s >= 0).length / shapes.length;
console.log(`\nBootstrap (${shapes.length}/${B} successful refits) on shape (xi):`);
console.log(`  p5=${pctile(0.05).toFixed(3)}  p25=${pctile(0.25).toFixed(3)}  median=${pctile(0.50).toFixed(3)}  p75=${pctile(0.75).toFixed(3)}  p95=${pctile(0.95).toFixed(3)}`);
console.log(`  P(shape >= 0, i.e. unbounded/fat tail) = ${(pctNonNegative * 100).toFixed(1)}%`);
console.log(`  Point estimate shape=${model.shape} -- ${pctNonNegative > 0.10 ? 'NOT confidently distinguishable from an unbounded tail at 90% level' : 'reasonably confidently bounded'}`);

// Same exercise for the ceiling itself, in loss-magnitude %, across the
// bootstrap draws whose shape came out negative (ceiling undefined otherwise).
const ceilings = [];
for (let b = 0; b < B; b++) {
  const resample = new Array(exceedances.length);
  for (let i = 0; i < exceedances.length; i++) resample[i] = exceedances[(rng() * exceedances.length) | 0];
  const fit = fitGPD(resample);
  if (fit && fit.shape < -1e-6) ceilings.push(threshold + fit.scale / Math.abs(fit.shape));
}
ceilings.sort((a, b) => a - b);
const cPctile = p => ceilings[Math.min(ceilings.length - 1, Math.floor(p * ceilings.length))];
console.log(`\nOf ${B} bootstrap draws, ${ceilings.length} produced a bounded (shape<0) fit at all.`);
if (ceilings.length > 10) {
  console.log(`Ceiling (%) among those: p5=${cPctile(0.05).toFixed(2)} median=${cPctile(0.50).toFixed(2)} p95=${cPctile(0.95).toFixed(2)}`);
}
