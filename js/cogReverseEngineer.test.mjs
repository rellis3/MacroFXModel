import test from 'node:test';
import assert from 'node:assert/strict';
import { reverseEngineer, fitEstimator, ratioDiagnostics, fitBlend, fitVol, reconstructionFit, COG_CONST, FELLER, SQRT252, FELLER_HL75_OVER_HL50 } from './cogReverseEngineer.js';

// COG's ACTUAL published numbers from his manual (19 May 2026) — vol%, hl med/75, oc med/75.
const MANUAL = [
  { date: '2026-05-19', cog: { vol: 26.61, hl_med: 2.65, hl_75: 3.23, oc_med: 1.28, oc_75: 2.10 } }, // Gold
  { date: '2026-05-19b', cog: { vol: 5.59, hl_med: 0.55, hl_75: 0.68, oc_med: 0.26, oc_75: 0.42 } }, // EURUSD
  { date: '2026-05-19c', cog: { vol: 25.37, hl_med: 2.47, hl_75: 3.09, oc_med: 1.16, oc_75: 2.02 } }, // NQ
];

test('reconstructionFit: COG_CONST reproduces his OWN published levels from his OWN vol (<3% err)', () => {
  const rc = reconstructionFit(MANUAL, COG_CONST);
  assert.equal(rc.n, 3);
  assert.ok(rc.overallMeanAbsPct < 3, `COG-const reconstructs his levels tightly (${rc.overallMeanAbsPct}%)`);
  // Raw Feller is materially worse on his numbers (his 75th + O-C run tighter).
  const rf = reconstructionFit(MANUAL, FELLER);
  assert.ok(rf.overallMeanAbsPct > rc.overallMeanAbsPct, 'Feller fits his numbers worse than COG_CONST');
});

test('MANUAL: his 75th/median ratio is ~1.23 (tighter than Feller 1.303)', () => {
  const d = ratioDiagnostics(MANUAL);
  assert.ok(Math.abs(d.hl75_over_hl50.mean - 1.235) < 0.02, `~1.235, got ${d.hl75_over_hl50.mean}`);
  assert.equal(d.hl75_over_hl50.matchesFeller, false, 'not a Feller match — his stretch is tighter');
});

// Synthesise COG-like records: hl_med = C·σ (Feller), hl_75 = 1.303·hl_med, where the
// TRUE estimator is 'yz' and the others are noisy decoys. Then the fitter should pick yz.
function synth(nDays, { trueName = 'yz', C = 1.60, noise = 0 } = {}) {
  const recs = [];
  for (let i = 0; i < nDays; i++) {
    const sigTrue = 0.004 + 0.004 * ((i * 37) % 100) / 100;   // 0.4%–0.8% daily, deterministic
    const hl_med = C * sigTrue * 100 * (1 + noise * (((i * 13) % 7) / 7 - 0.5));   // %
    recs.push({
      date: `2026-06-${String((i % 28) + 1).padStart(2, '0')}`,
      cog: { vol: sigTrue * SQRT252 * 100, hl_med, hl_75: hl_med * FELLER_HL75_OVER_HL50, oc_med: hl_med * 0.508, oc_75: hl_med * 0.508 * 1.61 },
      sigmas: {
        [trueName]: sigTrue,
        decoy1: 0.006 + 0.001 * ((i * 71) % 100) / 100,           // ~constant, uncorrelated
        decoy2: sigTrue * 0.5 + 0.003 * ((i * 91) % 100) / 100,   // partly-correlated
      },
    });
  }
  return recs;
}

test('fitVol: the true estimator reproduces the published vol (ratio ≈ 1, stable)', () => {
  const f = fitVol(synth(30, { trueName: 'yz' }), 'yz');
  assert.ok(Math.abs(f.ratioMean - 1) < 1e-6, 'ratio ≈ 1 for the true estimator');
  assert.ok(f.ratioCv < 1e-6, 'ratio is stable');
});

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
