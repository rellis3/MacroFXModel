// Unit tests for creditHmm.js — synthetic series with KNOWN regimes, no network.
// The key test: does the HMM recover a planted calm→stress→calm structure?
// Run: node js/creditHmm.test.mjs
import { fitGaussianHMM2, creditRegime } from './creditHmm.js';

let passed = 0, failed = 0;
const ok = (cond, msg) => { if (cond) { passed++; } else { failed++; console.error('  ✗', msg); } };
const near = (a, b, tol, msg) => ok(a != null && Math.abs(a - b) <= tol, `${msg} (got ${a}, want ~${b}±${tol})`);

// Deterministic pseudo-random (no Math.random — repeatable) : Mulberry32
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// Box-Muller normal from a uniform generator
function gaussGen(r) { return (mu, sd) => { const u1 = Math.max(r(), 1e-9), u2 = r(); return mu + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); }; }

// ── 1. Guards ────────────────────────────────────────────────────────────────
ok(fitGaussianHMM2([]) === null, 'empty → null');
ok(fitGaussianHMM2(Array(10).fill(1)) === null, 'too few obs → null');
ok(creditRegime(null) === null, 'creditRegime(null) → null');

// ── 2. Recover a planted calm / stress structure ─────────────────────────────
// Build 300 obs: calm (mean 3.0, sd 0.15) for the first 200, a stress block
// (mean 5.5, sd 0.4) for days 120–170, calm otherwise — i.e. a clear regime.
{
  const r = rng(42), g = gaussGen(r);
  const obs = [];
  for (let t = 0; t < 300; t++) {
    const inStress = t >= 120 && t < 170;
    obs.push(inStress ? g(5.5, 0.4) : g(3.0, 0.15));
  }
  const fit = fitGaussianHMM2(obs);
  ok(fit != null, 'fit returns a model on clean 2-regime data');
  const hi = Math.max(fit.mu[0], fit.mu[1]), lo = Math.min(fit.mu[0], fit.mu[1]);
  near(hi, 5.5, 0.6, 'recovers the stress mean ~5.5');
  near(lo, 3.0, 0.4, 'recovers the calm mean ~3.0');

  // The decoded path should light up "stress" mostly inside 120–170.
  const stressState = fit.mu[1] >= fit.mu[0] ? 1 : 0;
  let hitInside = 0, hitOutside = 0;
  for (let t = 0; t < 300; t++) {
    const isStress = fit.path[t] === stressState;
    if (t >= 120 && t < 170) { if (isStress) hitInside++; } else if (isStress) hitOutside++;
  }
  ok(hitInside >= 40, `stress decoded inside the planted block (got ${hitInside}/50)`);
  ok(hitOutside <= 15, `few false stress days outside the block (got ${hitOutside}/250)`);
  // Sticky transitions → high self-persistence.
  ok(fit.A[stressState][stressState] > 0.6, `stress regime is persistent (pStay=${fit.A[stressState][stressState].toFixed(2)})`);
}

// ── 3. creditRegime read: current state at series end ────────────────────────
{
  // ends in a long calm stretch → current state calm, low stress prob
  const r = rng(7), g = gaussGen(r);
  const obs = [];
  for (let t = 0; t < 250; t++) obs.push(t < 60 ? g(6.0, 0.4) : g(3.0, 0.15));
  const reg = creditRegime(obs);
  ok(reg != null, 'creditRegime returns a read');
  ok(reg.curState === 'calm', `ends calm → curState calm (got ${reg.curState})`);
  ok(reg.curStressProb < 0.3, `low current stress prob (got ${reg.curStressProb.toFixed(2)})`);
  ok(reg.daysInRegime > 20, `long trailing calm run (got ${reg.daysInRegime})`);
  ok(reg.expectedDuration > 1, 'expected duration > 1 day');
  ok(reg.stress.mean > reg.calm.mean, 'stress mean above calm mean');
}

// ── 4. ends in stress → flagged ──────────────────────────────────────────────
{
  const r = rng(99), g = gaussGen(r);
  const obs = [];
  for (let t = 0; t < 250; t++) obs.push(t < 190 ? g(3.0, 0.15) : g(6.0, 0.4));
  const reg = creditRegime(obs);
  ok(reg.curState === 'stress', `ends stressed → curState stress (got ${reg.curState})`);
  ok(reg.curStressProb > 0.6, `high current stress prob (got ${reg.curStressProb.toFixed(2)})`);
}

// ── 5. Determinism — same input, same fit ────────────────────────────────────
{
  const r = rng(1), g = gaussGen(r);
  const obs = Array.from({ length: 120 }, (_, t) => (t % 2 ? g(3, 0.2) : g(3.1, 0.2)));
  const a = fitGaussianHMM2(obs), b = fitGaussianHMM2(obs);
  ok(a && b && a.logLik === b.logLik && a.mu[0] === b.mu[0], 'deterministic: identical fit on identical input');
}

console.log(`\ncreditHmm.test: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
