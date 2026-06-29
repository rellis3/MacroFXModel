// Synthetic, no-network unit tests for the vol-forecast benchmark brick.
// Proves: estimators obey the no-lookahead contract, HAR-RV OLS recovers a known
// linear law, QLIKE/MSE scoring is correct, and runBench ranks sensibly.
//
//   node js/volForecastBench.test.mjs

import {
  realizedVarSeries, logReturns, harRvPred, scoreSeries, runBench, ESTIMATORS, solve4,
} from './volForecastBench.js';

let failures = 0;
const ok   = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ── Deterministic synthetic D1 bars with vol clustering (no Math.random) ──────
// Vol regime oscillates slowly so range estimators have real signal to forecast.
const N = 1200;
const bars = [];
let px = 1.1000;
for (let i = 0; i < N; i++) {
  const sig = 0.004 + 0.003 * Math.sin(i / 60);          // clustered daily σ (0.1%–0.7%)
  const ret = sig * Math.sin(i / 3.3);                   // deterministic "shock"
  const o = px;
  const c = o * (1 + ret);
  const hi = Math.max(o, c) * (1 + Math.abs(sig) * 0.8);
  const lo = Math.min(o, c) * (1 - Math.abs(sig) * 0.8);
  bars.push({ date: `d${i}`, open: o, high: hi, low: lo, close: c });
  px = c;
}

console.log('[realizedVarSeries]');
const rvGk = realizedVarSeries(bars, 'gk');
const rvSq = realizedVarSeries(bars, 'sq');
const rvPk = realizedVarSeries(bars, 'parkinson');
ok('gk series length matches', rvGk.length === N);
ok('all proxies strictly positive', [rvGk, rvSq, rvPk].every(s => s.every(v => v > 0)));
// Garman-Klass reference for one interior bar
const b = bars[500];
const gkRef = Math.max(0.5 * Math.log(b.high / b.low) ** 2 - (2 * Math.LN2 - 1) * Math.log(b.close / b.open) ** 2, 1e-12);
ok('gk matches closed form', near(rvGk[500], gkRef, 1e-15), `gk=${rvGk[500].toExponential(3)}`);

console.log('[logReturns]');
const lr = logReturns(bars);
ok('logReturns length n-1', lr.length === N - 1);
ok('logReturns[0] correct', near(lr[0], Math.log(bars[1].close / bars[0].close), 1e-15));

console.log('[no-lookahead contract]');
// Mutating the LAST bar must not change any prediction except possibly bar N-1's.
// (A predictor for bar i may only read bars < i, so earlier preds are invariant.)
for (const key of Object.keys(ESTIMATORS)) {
  const ctx = { rv: rvGk, omega: 4.76e-6, harOpts: undefined };
  const base = ESTIMATORS[key].predVar(bars, ctx);
  const tampered = bars.map((x, i) => i === N - 1 ? { ...x, high: x.high * 1.5, low: x.low * 0.5, close: x.close * 1.2 } : x);
  const ctx2 = { rv: realizedVarSeries(tampered, 'gk'), omega: 4.76e-6, harOpts: undefined };
  const pred2 = ESTIMATORS[key].predVar(tampered, ctx2);
  let leaked = false;
  for (let i = 0; i < N - 1; i++) {
    const a = base[i], c = pred2[i];
    if (Number.isFinite(a) !== Number.isFinite(c)) { leaked = true; break; }
    if (Number.isFinite(a) && !near(a, c, 1e-12)) { leaked = true; break; }
  }
  ok(`${key}: tampering bar N-1 leaves earlier preds unchanged`, !leaked);
}

console.log('[HAR-RV OLS recovers a known linear law]');
// Build an RV series that is EXACTLY a linear function of its own lags, then check
// the walk-forward OLS predictions converge to that law (in-sample residual ~0).
const M = 800;
const rv = new Float64Array(M);
for (let i = 0; i < 22; i++) rv[i] = 1 + 0.1 * Math.sin(i);   // arbitrary positive seed
const B0 = 0.002, B1 = 0.5, B5 = 0.3, B22 = 0.15;
for (let i = 22; i < M; i++) {
  let wk = 0, mo = 0;
  for (let k = 1; k <= 5; k++)  wk += rv[i - k];
  for (let k = 1; k <= 22; k++) mo += rv[i - k];
  rv[i] = Math.max(B0 + B1 * rv[i - 1] + B5 * (wk / 5) + B22 * (mo / 22), 1e-12);
}
const harPred = harRvPred(rv, { warmup: 60 });
// late predictions should match the generating law to high precision
let maxErr = 0, counted = 0;
for (let i = 400; i < M; i++) {
  if (!Number.isFinite(harPred[i])) continue;
  maxErr = Math.max(maxErr, Math.abs(harPred[i] - rv[i]) / rv[i]); counted++;
}
ok('HAR-RV recovers generating law (rel err < 1e-6)', counted > 100 && maxErr < 1e-6, `maxRelErr=${maxErr.toExponential(2)}, n=${counted}`);

console.log('[solve4]');
// solve a known 4×4 system A x = b with x = [1,2,3,4]
const A = [[4, 1, 0, 0], [1, 3, 1, 0], [0, 1, 5, 1], [0, 0, 1, 2]];
const xTrue = [1, 2, 3, 4];
const bb = A.map(row => row.reduce((s, v, j) => s + v * xTrue[j], 0));
const xSol = solve4(A.map(r => Float64Array.from(r)), Float64Array.from(bb));
ok('solve4 solves a known system', xSol && xSol.every((v, j) => near(v, xTrue[j], 1e-6)), xSol && `x=[${xSol.map(v => v.toFixed(3))}]`);

console.log('[scoreSeries QLIKE/MSE]');
// perfect forecast → QLIKE = 0, MSE = 0
const realV = Float64Array.from([0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.10]);
const perfect = scoreSeries(realV, realV, 0.4);
ok('perfect forecast QLIKE≈0', near(perfect.full.qlike, 0, 1e-12));
ok('perfect forecast MSE≈0', near(perfect.full.mse, 0, 1e-18));
// constant biased forecast: QLIKE term = r/p − ln(r/p) − 1 averaged
const predC = Float64Array.from(new Array(10).fill(0.05));
const biased = scoreSeries(predC, realV, 0.4);
let qRef = 0; for (let i = 0; i < 10; i++) { const x = realV[i] / 0.05; qRef += x - Math.log(x) - 1; } qRef /= 10;
ok('biased forecast QLIKE matches closed form', near(biased.full.qlike, qRef, 1e-12), `q=${biased.full.qlike.toFixed(5)}`);
ok('IS/OOS split sizes correct', biased.is.n === 6 && biased.oos.n === 4, `is=${biased.is.n} oos=${biased.oos.n}`);
ok('QLIKE is >= 0 (proper loss, min at perfect)', biased.full.qlike >= 0);

console.log('[runBench end-to-end]');
const res = runBench(bars, 'fx', { oosFrac: 0.4, proxy: 'gk' });
ok('runBench returns all estimators', res.estimators.length === Object.keys(ESTIMATORS).length);
ok('runBench picks a best key', typeof res.best === 'string' && ESTIMATORS[res.best]);
ok('runBench ranked by OOS QLIKE ascending', res.estimators.every((r, i, a) => i === 0 || (a[i - 1].oos.qlike ?? Infinity) <= (r.oos.qlike ?? Infinity)));
ok('every estimator scored a non-trivial OOS sample', res.estimators.every(r => r.oos.n >= 30));
ok('rankOos assigned 1..n', res.estimators.every((r, i) => r.rankOos === i + 1));
console.log('  → ranking:', res.estimators.map(r => `${r.label}=${(r.oos.qlike ?? NaN).toFixed(4)}`).join('  '));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll vol-forecast-bench tests passed.');
process.exit(failures ? 1 : 0);
