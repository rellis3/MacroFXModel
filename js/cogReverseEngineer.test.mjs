import test from 'node:test';
import assert from 'node:assert/strict';
import { reverseEngineer, fitEstimator, ratioDiagnostics, fitBlend, FELLER_HL75_OVER_HL50 } from './cogReverseEngineer.js';

// Synthesise COG-like records: hl_med = C·σ (Feller), hl_75 = 1.303·hl_med, where the
// TRUE estimator is 'yz' and the others are noisy decoys. Then the fitter should pick yz.
function synth(nDays, { trueName = 'yz', C = 1.60, noise = 0 } = {}) {
  const recs = [];
  for (let i = 0; i < nDays; i++) {
    const sigTrue = 0.004 + 0.004 * ((i * 37) % 100) / 100;   // 0.4%–0.8% daily, deterministic
    const hl_med = C * sigTrue * 100 * (1 + noise * (((i * 13) % 7) / 7 - 0.5));   // %
    recs.push({
      date: `2026-06-${String((i % 28) + 1).padStart(2, '0')}`,
      cog: { hl_med, hl_75: hl_med * FELLER_HL75_OVER_HL50, oc_med: hl_med * 0.508, oc_75: hl_med * 0.508 * 1.61 },
      sigmas: {
        [trueName]: sigTrue,
        decoy1: 0.006 + 0.001 * ((i * 71) % 100) / 100,           // ~constant, uncorrelated
        decoy2: sigTrue * 0.5 + 0.003 * ((i * 91) % 100) / 100,   // partly-correlated
      },
    });
  }
  return recs;
}

test('ratioDiagnostics: recovers the 75th/median mapping and flags Feller match', () => {
  const d = ratioDiagnostics(synth(30));
  assert.ok(Math.abs(d.hl75_over_hl50.mean - FELLER_HL75_OVER_HL50) < 1e-3, '75/50 ratio ≈ 1.303 (rounded)');
  assert.equal(d.hl75_over_hl50.matchesFeller, true, 'flagged as matching Feller');
  assert.ok(d.hl75_over_hl50.cv < 1e-6, 'ratio is perfectly stable in synth');
});

test('fitEstimator: implied constant C matches the generator and is stable', () => {
  const f = fitEstimator(synth(30, { C: 1.60 }), 'yz');
  assert.ok(Math.abs(f.cMean - 1.60) < 0.01, 'implied C ≈ 1.60');
  assert.ok(f.cCv < 1e-6, 'C is stable (CV≈0) when the estimator is the true one');
  assert.ok(f.r > 0.99, 'σ correlates with hl_med');
});

test('reverseEngineer: picks the true estimator over decoys', () => {
  const out = reverseEngineer(synth(40, { trueName: 'yz' }));
  assert.ok(!out.insufficient);
  assert.equal(out.best.name, 'yz', 'true estimator ranked first');
  assert.ok(out.best.cCv < out.fits[1].cCv + 1e-9, 'true estimator has the most stable constant');
});

test('reverseEngineer: parsimony holds when no blend helps (true single estimator)', () => {
  const out = reverseEngineer(synth(40, { trueName: 'yz' }));
  // yz already fits perfectly → a blend with a decoy cannot beat it materially.
  assert.equal(out.blendWins, false, 'no blend beats a perfect single fit');
});

test('reverseEngineer: insufficient data flagged, not thrown', () => {
  assert.equal(reverseEngineer([{ cog: {}, sigmas: {} }]).insufficient, true);
});

test('fitBlend: returns a convex weight and correlation', () => {
  const b = fitBlend(synth(30), 'yz', 'decoy2');
  assert.ok(b && b.alpha >= 0 && b.alpha <= 1, 'alpha in [0,1]');
  assert.ok(b.r > 0.9, 'blend correlates (yz dominates)');
});
