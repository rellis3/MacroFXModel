// Synthetic, no-network unit tests for diversificationCore.
//
//   node js/diversificationCore.test.mjs
//
// Anchors: N identical strategies (ρ=1) → 1 effective bet; N uncorrelated
// strategies (ρ=0) → N effective bets. Plus a hand-computable 2×2 case.

import {
  pearson, correlationMatrix, symmetricEigenvalues,
  effectiveBetsPCA, effectiveBetsEntropy, effectiveBetsWeighted,
  effectiveBetsAvgCorr, diversificationSummary,
} from './diversificationCore.js';

let failures = 0;
const ok   = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

console.log('diversificationCore');

// ── pearson ──────────────────────────────────────────────────────────────────
ok('pearson perfect +1', near(pearson([1, 2, 3, 4], [2, 4, 6, 8]), 1));
ok('pearson perfect -1', near(pearson([1, 2, 3, 4], [4, 3, 2, 1]), -1));
ok('pearson skips NaN pairwise',
  near(pearson([1, 2, NaN, 4], [2, 4, 100, 8]), 1));
ok('pearson n<2 → NaN', Number.isNaN(pearson([1], [2])));

// ── correlationMatrix ─────────────────────────────────────────────────────────
{
  const cols = [[1, 2, 3, 4], [2, 4, 6, 8], [4, 3, 2, 1]];
  const C = correlationMatrix(cols);
  ok('corr diagonal is 1', C[0][0] === 1 && C[1][1] === 1 && C[2][2] === 1);
  ok('corr symmetric', C[0][2] === C[2][0]);
  ok('corr identical cols → 1', near(C[0][1], 1));
  ok('corr opposite cols → -1', near(C[0][2], -1));
}

// ── symmetricEigenvalues ──────────────────────────────────────────────────────
{
  // Identity → all eigenvalues 1.
  const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const evI = symmetricEigenvalues(I3);
  ok('eig(I) all 1', evI.every(v => near(v, 1)));
  // 2×2 with ρ=0.5 → eigenvalues 1.5, 0.5.
  const ev2 = symmetricEigenvalues([[1, 0.5], [0.5, 1]]);
  ok('eig 2×2 ρ=0.5 → 1.5,0.5', near(ev2[0], 1.5) && near(ev2[1], 0.5));
  // All-ones 3×3 (ρ=1) → eigenvalues 3,0,0.
  const evOnes = symmetricEigenvalues([[1, 1, 1], [1, 1, 1], [1, 1, 1]]);
  ok('eig all-ones 3×3 → 3,0,0',
    near(evOnes[0], 3) && near(evOnes[1], 0) && near(evOnes[2], 0));
  // Non-finite entry → all-NaN.
  ok('eig with NaN → NaN', symmetricEigenvalues([[1, NaN], [NaN, 1]]).every(Number.isNaN));
}

// ── effectiveBets: anchors ────────────────────────────────────────────────────
{
  const N = 5;
  const identity = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => (i === j ? 1 : 0)));
  const allOnes  = Array.from({ length: N }, () => new Array(N).fill(1));

  ok('PCA ENB: ρ=0 → N',      near(effectiveBetsPCA(identity), N));
  ok('PCA ENB: ρ=1 → 1',      near(effectiveBetsPCA(allOnes), 1));
  ok('Entropy ENB: ρ=0 → N',  near(effectiveBetsEntropy(identity), N));
  ok('Entropy ENB: ρ=1 → 1',  near(effectiveBetsEntropy(allOnes), 1));
  ok('Weighted ENB: ρ=0 → N', near(effectiveBetsWeighted(identity), N));
  ok('Weighted ENB: ρ=1 → 1', near(effectiveBetsWeighted(allOnes), 1));
}

// ── effectiveBetsAvgCorr (single-ρ approximation) ─────────────────────────────
{
  ok('avgCorr ρ=0 → n',   near(effectiveBetsAvgCorr(5, 0), 5));
  ok('avgCorr ρ=1 → 1',   near(effectiveBetsAvgCorr(5, 1), 1));
  // n=4, ρ=0.5 → 4/(1+3·0.5) = 4/2.5 = 1.6
  ok('avgCorr n=4 ρ=0.5 → 1.6', near(effectiveBetsAvgCorr(4, 0.5), 1.6));
  ok('avgCorr bad n → NaN', Number.isNaN(effectiveBetsAvgCorr(0, 0.3)));
}

// ── effectiveBets: hand-computed 2×2 (ρ=0.5) ──────────────────────────────────
{
  const C = [[1, 0.5], [0.5, 1]];
  // eigenvalues 1.5, 0.5 → PCA = (2)²/(1.5²+0.5²) = 4/2.5 = 1.6
  ok('PCA ENB 2×2 ρ=0.5 = 1.6', near(effectiveBetsPCA(C), 1.6));
  // equal weights: wᵀCw = 0.25*(1+0.5+0.5+1)=0.75 → ENB = 1/0.75 = 1.3333…
  ok('Weighted ENB 2×2 ρ=0.5 = 1.333', near(effectiveBetsWeighted(C), 4 / 3));
  // ENB is bounded: 1 ≤ ENB ≤ N
  ok('PCA ENB in [1,N]', effectiveBetsPCA(C) >= 1 && effectiveBetsPCA(C) <= 2);
}

// ── effectiveBetsWeighted respects allocation ─────────────────────────────────
{
  // 3 strategies: A,B identical (ρ=1), C independent. Equal weight collapses the
  // duplicate pair to an effective 2/3 position → (1)²/(5/9) = 1.8 bets.
  const C = [[1, 1, 0], [1, 1, 0], [0, 0, 1]];
  ok('weighted equal: 2 identical + 1 indep → 1.8', near(effectiveBetsWeighted(C), 1.8));
  // PCA: eigenvalues {2,1,0} → 9/5 = 1.8. The duplicated pair is one
  // OVER-WEIGHTED factor, not two clean ones, so effective bets < 2.
  ok('PCA: 2 identical + 1 indep → 1.8', near(effectiveBetsPCA(C), 1.8));
  // Put all weight on the two identical ones → 1 bet.
  ok('weighted all-on-duplicates → 1', near(effectiveBetsWeighted(C, [0.5, 0.5, 0]), 1));
}

// ── diversificationSummary end-to-end ─────────────────────────────────────────
{
  // Two identical return columns + one anti-correlated + one independent-ish.
  const a = [0.01, -0.02, 0.03, -0.01, 0.02, -0.03, 0.015, -0.005];
  const s = diversificationSummary([a, a.slice(), a.map(v => -v)]);
  ok('summary n', s.n === 3);
  ok('summary ratio in (0,1]', s.ratio > 0 && s.ratio <= 1 + 1e-9);
  ok('summary pca ≤ n', s.pca <= 3 + 1e-9);
  ok('summary duplicated+mirror collapses to ~1 bet', s.pca < 1.05,
    `pca=${s.pca.toFixed(4)}`);
}

console.log(failures ? `\n${failures} FAILED` : '\nAll passed');
process.exit(failures ? 1 : 0);
