// Synthetic, no-network unit tests for ouCore (the Tier-1 promotion of
// js/mve/ou.js). MVE's own suite (js/mve/mve.test.mjs) proves the shim moved
// nothing; these tests pin the math itself with hand calculations.
//
//   node js/ouCore.test.mjs

import { ouFit, ouConvergence, empiricalSnapback, normCdf } from './ouCore.js';
import * as shim from './mve/ou.js';

let failures = 0;
const ok   = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

console.log('[shim identity]');
{
  ok('mve/ou.js re-exports the SAME functions (no second copy)',
     shim.ouFit === ouFit && shim.ouConvergence === ouConvergence &&
     shim.empiricalSnapback === empiricalSnapback && shim.normCdf === normCdf);
}

console.log('\n[ouFit — noiseless AR(1): exact recovery]');
{
  // z_{t+1} = μ + φ(z_t − μ) exactly, φ = 0.9, μ = 5, z0 = 10. OLS on a
  // perfect fit recovers b = φ − 1 = −0.1 ⇒ κ = 0.1, half-life = ln2/0.1.
  const phi = 0.9, mu = 5;
  const z = [10];
  for (let i = 1; i < 60; i++) z.push(mu + phi * (z[i - 1] - mu));
  const f = ouFit(z);
  ok('κ = 1 − φ exactly', near(f.kappa, 0.1, 1e-9), `κ=${f.kappa}`);
  ok('half-life = ln2/κ = 6.9315', near(f.halfLife, Math.log(2) / 0.1, 1e-6), `hl=${f.halfLife.toFixed(4)}`);
  ok('μ recovered', near(f.mu, 5, 1e-6), `μ=${f.mu.toFixed(6)}`);
  ok('ok = true (reverting)', f.ok === true);
  ok('t-stat strongly negative (perfect reversion)', f.tStat < -50, `t=${f.tStat.toFixed(1)}`);
}

console.log('\n[ouFit — degenerate cases]');
{
  // Pure trend z_t = t: Δz constant ⇒ b = 0 ⇒ κ = 0 ⇒ not reverting.
  const trend = Array.from({ length: 50 }, (_, i) => i);
  const ft = ouFit(trend);
  ok('trend → κ = 0, ok = false, half-life ∞', near(ft.kappa, 0, 1e-12) && ft.ok === false && ft.halfLife === Infinity);
  ok('too short → null', ouFit([1, 2, 3]) === null);
  ok('constant series → null (sxx = 0)', ouFit(new Array(30).fill(7)) === null);
}

console.log('\n[ouConvergence — closed-form hand checks]');
{
  // Hand-built OU: κ = ln2 (half-life exactly 1 bar), μ = 0, σ = 1.
  const ou = { kappa: Math.log(2), mu: 0, sigma: 1, halfLife: 1, ok: true };
  const c1 = ouConvergence(2, ou, 1);
  ok('decay e^{−κ·1} = 1/2 ⇒ E[z] = z0/2', near(c1.expectedZ, 1, 1e-12), `=${c1.expectedZ}`);
  ok('closedFraction = 1/2', near(c1.closedFraction, 0.5, 1e-12));
  ok('expectedMagnitude = z0/2', near(c1.expectedMagnitude, 1, 1e-12));
  // Var = σ²/(2κ)(1 − e^{−2κ}) = (1 − 1/4)/(2 ln2) = 0.75/(2 ln2).
  ok('sd matches hand calc', near(c1.sd, Math.sqrt(0.75 / (2 * Math.log(2))), 1e-12), `sd=${c1.sd.toFixed(6)}`);
  ok('stationary σ = 1/√(2κ)', near(c1.stationarySd, 1 / Math.sqrt(2 * Math.log(2)), 1e-12));
  // Longer horizon ⇒ more gap closed, higher reversion probability.
  const c5 = ouConvergence(2, ou, 5);
  ok('pRevert grows with horizon', c5.pRevert > c1.pRevert, `${c1.pRevert.toFixed(3)} → ${c5.pRevert.toFixed(3)}`);
  ok('CI95 wider than CI68', (c1.ci95[1] - c1.ci95[0]) > (c1.ci68[1] - c1.ci68[0]));
  ok('non-reverting fit → null', ouConvergence(2, { ok: false }, 5) === null);
}

console.log('\n[normCdf]');
{
  ok('Φ(0) = 0.5', near(normCdf(0), 0.5, 1e-7));
  ok('Φ(1.96) ≈ 0.975', near(normCdf(1.96), 0.975, 1e-4), `=${normCdf(1.96).toFixed(5)}`);
  ok('symmetry Φ(−x) = 1 − Φ(x)', near(normCdf(-1.3) + normCdf(1.3), 1, 1e-7));
}

console.log('\n[empiricalSnapback — counted by hand]');
{
  // Two crossing events above entry=1.5: one reverts inside |z|≤0.5 within
  // horizon 3, one never does. Base rate = 1/2 exactly.
  const z = [0, 2.0, 0.3, 0, 0, 0,      // event 1 at i=1 → reverts at +1
             2.0, 1.9, 1.8, 1.7, 1.6, 1.6, 1.6, 1.6, 1.6, 0];  // event 2 at i=6 → never inside 0.5 within 3
  const s = empiricalSnapback(z, { entry: 1.5, band: 0.5, horizon: 3 });
  ok('events counted = 2', s.events === 2, `events=${s.events}`);
  ok('base rate = 1/2', near(s.baseRate, 0.5), `=${s.baseRate}`);
  ok('too short → null', empiricalSnapback([0, 1], { horizon: 10 }) === null);
}

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
