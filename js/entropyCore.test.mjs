// Synthetic, no-network unit tests for entropyCore — every number checked
// against a hand calculation (measurement brick: the bar is correctness).
//
//   node js/entropyCore.test.mjs

import {
  histProbs, shannonEntropy, normalizedEntropy,
  klDivergence, jsDivergence, mutualInformation, regimeShiftSeries,
} from './entropyCore.js';

let failures = 0;
const ok   = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

console.log('[histProbs]');
{
  // 8 values into 4 bins over [0,4): two per bin → uniform 0.25s.
  const p = histProbs([0.1, 0.2, 1.1, 1.2, 2.1, 2.2, 3.1, 3.2], 4, 0, 4);
  ok('uniform fill → 0.25 per bin', p.every(x => near(x, 0.25)));
  ok('probs sum to 1', near(p.reduce((s, x) => s + x, 0), 1));
  // Out-of-range values clamp into edge bins, not dropped.
  const q = histProbs([-5, 10], 2, 0, 1);
  ok('out-of-range clamps to edge bins', near(q[0], 0.5) && near(q[1], 0.5));
  ok('NaN/empty safe', histProbs([NaN], 3).every(x => x === 0));
}

console.log('\n[shannonEntropy / normalizedEntropy]');
{
  ok('fair coin = 1 bit', near(shannonEntropy([0.5, 0.5]), 1));
  ok('certainty = 0 bits', shannonEntropy([1, 0, 0]) === 0);
  ok('uniform 4 bins = 2 bits', near(shannonEntropy([0.25, 0.25, 0.25, 0.25]), 2));
  // Hand calc: [0.75, 0.25] → 0.75·log2(4/3) + 0.25·log2(4) = 0.81128 bits.
  ok('skewed coin matches hand calc', near(shannonEntropy([0.75, 0.25]), 0.75 * Math.log2(4 / 3) + 0.5), `=${shannonEntropy([0.75, 0.25]).toFixed(5)}`);
  // Normalized: constant series → all mass in one bin → 0; even spread → 1.
  ok('normalizedEntropy: constant series → 0', normalizedEntropy([5, 5, 5, 5], { bins: 4, lo: 0, hi: 10 }) === 0);
  ok('normalizedEntropy: even spread → 1', near(normalizedEntropy([0.5, 1.5, 2.5, 3.5], { bins: 4, lo: 0, hi: 4 }), 1));
}

console.log('\n[klDivergence / jsDivergence]');
{
  ok('KL(p‖p) = 0', klDivergence([0.3, 0.7], [0.3, 0.7]) === 0);
  // Hand calc: KL([.5,.5]‖[.25,.75]) = .5·log2(2) + .5·log2(2/3) = 1 − .5·log2(3) ≈ 0.20752.
  ok('KL matches hand calc', near(klDivergence([0.5, 0.5], [0.25, 0.75]), 1 - 0.5 * Math.log2(3), 1e-12), `=${klDivergence([0.5, 0.5], [0.25, 0.75]).toFixed(5)}`);
  ok('KL is +∞ on unshared support', klDivergence([1, 0], [0, 1]) === Infinity);
  ok('KL is asymmetric', !near(klDivergence([0.5, 0.5], [0.25, 0.75]), klDivergence([0.25, 0.75], [0.5, 0.5])));
  const a = [0.6, 0.3, 0.1], b = [0.1, 0.3, 0.6];
  ok('JS is symmetric', near(jsDivergence(a, b), jsDivergence(b, a)));
  ok('JS(p,p) = 0', jsDivergence(a, a) === 0);
  ok('JS disjoint = 1 bit (upper bound)', near(jsDivergence([1, 0], [0, 1]), 1));
  ok('JS finite where KL blows up', Number.isFinite(jsDivergence([1, 0], [0, 1])));
}

console.log('\n[mutualInformation]');
{
  // Independent by construction: x has period 2, y period 4 → over 8-step
  // cycles every (x,y) combo appears equally. MI must be exactly 0.
  const n = 400;
  const x = Array.from({ length: n }, (_, i) => i % 2);
  const y = Array.from({ length: n }, (_, i) => Math.floor(i / 2) % 2);
  ok('independent series → MI 0', near(mutualInformation(x, y, { bins: 2 }), 0, 1e-12));
  // Fully determined: y = x → MI = H(x) = 1 bit.
  ok('y = x → MI = H(x) = 1 bit', near(mutualInformation(x, x, { bins: 2 }), 1, 1e-12));
  // Nonlinear dependence correlation misses: y = |x| on symmetric x.
  const xs = Array.from({ length: 401 }, (_, i) => (i - 200) / 100);   // [-2, 2]
  const ys = xs.map(Math.abs);
  ok('MI catches y=|x| (nonlinear)', mutualInformation(xs, ys, { bins: 8 }) > 0.5);
  ok('MI empty-safe', mutualInformation([], [], {}) === 0);
}

console.log('\n[regimeShiftSeries]');
{
  // Deterministic vol break: 300 bars of ±0.001 oscillation, then 100 bars of
  // ±0.010 — a 10× dispersion regime change at bar 300, no randomness.
  const xs = Array.from({ length: 400 }, (_, i) => (i < 300 ? 0.001 : 0.010) * Math.sin(i * 1.7));
  const w = 50, ref = 200;
  const out = regimeShiftSeries(xs, { window: w, ref, bins: 10 });
  ok('NaN until warm', out.slice(0, w + ref - 1).every(Number.isNaN) && Number.isFinite(out[w + ref - 1]));
  const pre = out[290], post = out[360];   // window fully pre-break vs fully post-break
  ok('quiet before the break', pre < 0.15, `pre=${pre.toFixed(4)}`);
  ok('spikes after the break', post > 0.5, `post=${post.toFixed(4)}`);
  ok('post ≫ pre (detects the regime change)', post > pre * 4);
  // No lookahead: the value at bar 299 must be identical whether or not the
  // post-break data exists at all.
  const truncated = regimeShiftSeries(xs.slice(0, 300), { window: w, ref, bins: 10 });
  ok('no lookahead (bar 299 unchanged by future data)', out[299] === truncated[299]);
}

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
