// Synthetic, no-network unit tests for extremesCore. Deterministic samples are
// built by inverse-CDF on a uniform grid (no Math.random), so the fits have
// known right answers to recover.
//
//   node js/extremesCore.test.mjs

import {
  quantileSorted, hillEstimator, fitGPD, potFit,
  gpdQuantile, gpdES, returnLevel, evtVaR, evtES,
} from './extremesCore.js';

let failures = 0;
const ok   = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const rel  = (a, b, tol) => Math.abs(a - b) <= tol * Math.abs(b);

// Deterministic "perfect" samples: u on a midpoint grid, x = F⁻¹(u).
const N = 2000;
const grid = Array.from({ length: N }, (_, i) => (i + 0.5) / N);
const expSample = (beta) => grid.map(u => -beta * Math.log(1 - u));                   // GPD ξ=0
const gpdSample = (xi, beta) => grid.map(u => (beta / xi) * (Math.pow(1 - u, -xi) - 1));
const paretoSample = (alpha) => grid.map(u => Math.pow(1 - u, -1 / alpha));           // P(X>x)=x^−α, x≥1

console.log('[quantileSorted]');
{
  const ramp = Array.from({ length: 101 }, (_, i) => i);   // 0..100
  ok('type-7 on ramp: q(0.95) = 95', near(quantileSorted(ramp, 0.95), 95));
  ok('interpolates: q(0.5) of [0,10] = 5', near(quantileSorted([0, 10], 0.5), 5));
  ok('empty → NaN', Number.isNaN(quantileSorted([], 0.5)));
}

console.log('\n[fitGPD — recovers known distributions]');
{
  const fe = fitGPD(expSample(2));
  ok('exponential(β=2) → ξ ≈ 0', Math.abs(fe.xi) < 0.02, `ξ=${fe.xi.toFixed(4)}`);
  ok('exponential(β=2) → β ≈ 2', rel(fe.beta, 2, 0.02), `β=${fe.beta.toFixed(4)}`);
  const fg = fitGPD(gpdSample(0.3, 1));
  ok('GPD(ξ=0.3, β=1) → ξ ≈ 0.3', Math.abs(fg.xi - 0.3) < 0.03, `ξ=${fg.xi.toFixed(4)}`);
  ok('GPD(ξ=0.3, β=1) → β ≈ 1', rel(fg.beta, 1, 0.03), `β=${fg.beta.toFixed(4)}`);
  ok('too few points → null', fitGPD([1, 2, 3]) === null);
  ok('non-positive filtered out', fitGPD(expSample(1).concat([-1, 0, NaN])) !== null);
}

console.log('\n[hillEstimator]');
{
  const h = hillEstimator(paretoSample(3), 200);
  ok('Pareto(α=3) → Hill α ≈ 3', rel(h.alpha, 3, 0.05), `α=${h.alpha.toFixed(3)}`);
  ok('ξ = 1/α', near(h.xi, 1 / h.alpha));
  ok('infeasible k → null', hillEstimator([1, 2], 5) === null);
}

console.log('\n[gpdQuantile / gpdES / returnLevel — analytic hand checks]');
{
  // ξ=0.3, β=1, u=0, ζ=1: q(0.99) = ((0.01)^−0.3 − 1)/0.3 = (10^0.6 − 1)/0.3.
  const fit = { u: 0, xi: 0.3, beta: 1, zeta: 1 };
  const q99 = (Math.pow(10, 0.6) - 1) / 0.3;
  ok('q(0.99) matches analytic', near(gpdQuantile(0.99, fit), q99, 1e-12), `=${gpdQuantile(0.99, fit).toFixed(6)}`);
  // ES = (VaR + β − ξu)/(1 − ξ) = (q99 + 1)/0.7.
  ok('ES(0.99) matches analytic', near(gpdES(0.99, fit), (q99 + 1) / 0.7, 1e-12), `=${gpdES(0.99, fit).toFixed(6)}`);
  ok('ES > VaR always (tail mean beats threshold)', gpdES(0.99, fit) > gpdQuantile(0.99, fit));
  // ξ=0 branch: u=1, β=2, ζ=0.05, p=0.99 → 1 + 2·ln(0.05/0.01) = 1 + 2·ln5.
  const fit0 = { u: 1, xi: 0, beta: 2, zeta: 0.05 };
  ok('ξ=0 branch matches analytic', near(gpdQuantile(0.99, fit0), 1 + 2 * Math.log(5), 1e-12));
  // Return level: once-per-m ≡ quantile 1 − 1/m.
  ok('returnLevel(100) ≡ q(0.99)', near(returnLevel(100, fit), gpdQuantile(0.99, fit)));
  ok('monotone in p', gpdQuantile(0.999, fit) > gpdQuantile(0.99, fit));
  ok('ξ ≥ 1 → ES is NaN, not a fake number', Number.isNaN(gpdES(0.99, { u: 0, xi: 1.1, beta: 1, zeta: 1 })));
}

console.log('\n[potFit — end-to-end on known tails]');
{
  // Memorylessness: excesses of exp(β=2) over ANY threshold are exp(β=2).
  const pf = potFit(expSample(2), { q: 0.90 });
  ok('POT on exponential: ξ ≈ 0', Math.abs(pf.xi) < 0.05, `ξ=${pf.xi.toFixed(4)}`);
  ok('POT on exponential: β ≈ 2 (memoryless)', rel(pf.beta, 2, 0.06), `β=${pf.beta.toFixed(4)}`);
  ok('ζ ≈ 1 − q', Math.abs(pf.zeta - 0.10) < 0.01, `ζ=${pf.zeta.toFixed(3)}`);
  // Extrapolated VaR vs analytic: exp(2) q(0.999) = 2·ln(1000) = 13.8155.
  const v = evtVaR(expSample(2), 0.999, { q: 0.95 });
  ok('evtVaR(0.999) ≈ analytic 2·ln(1000)', rel(v, 2 * Math.log(1000), 0.03), `=${v.toFixed(3)} vs ${(2 * Math.log(1000)).toFixed(3)}`);
  ok('evtES ≥ evtVaR', evtES(expSample(2), 0.999) >= v);
  ok('too-small sample → null / NaN', potFit([1, 2, 3]) === null && Number.isNaN(evtVaR([1, 2, 3], 0.99)));
}

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
