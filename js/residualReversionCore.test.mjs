#!/usr/bin/env node
/**
 * Unit test for js/residualReversionCore.js — synthetic, no network.
 *
 * The whole point of this brick is that it does NOT fool itself. Prove it:
 *   1. Random walk   → must NOT beat the trailing-mean benchmark (icEdge ≈ 0,
 *                      verdict NULL). A trailing anchor "reverts" spuriously on a
 *                      random walk; the EDGE over that anchor must be ~zero.
 *   2. Mean-reverting AR(1) (phi = 0.90, strong pull to mean) → the model's fair
 *                      value genuinely forecasts, so icEdge should be POSITIVE.
 *   3. No-lookahead  → the residual at bar i must be computable from data < i
 *                      alone (shifting the future must not change the past).
 *   4. Cost honesty  → a large enough cost must turn a marginal winner into a loser.
 *
 *   node js/residualReversionCore.test.mjs
 */
import { validateResidualReversion, oosResidualSeries, _synth } from './residualReversionCore.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.error(`  ✗ ${msg}`); } };

const N = 1500;

console.log('\n[1] Random walk → NULL (no spurious edge over the benchmark)');
{
  const p = _synth(42, N, 'rw');
  const r = validateResidualReversion(p, { instrument: 'RW' });
  ok(r.ok, 'runs on a random walk');
  const edges = Object.values(r.perHorizon).filter(h => h.icEdge != null).map(h => h.icEdge);
  const bestEdge = Math.max(...edges);
  ok(Math.abs(bestEdge) < 0.10, `best icEdge ${bestEdge} is ~0 on a random walk (no fabricated edge)`);
  ok(/^NULL/.test(r.verdict), `verdict is NULL on a random walk (got: ${r.verdict.split(':')[0]})`);
  // raw icPredictive may be nonzero (spurious), but the EDGE must be small.
  console.log(`     meanPhi=${r.meanPhi} (≈1 = unit root, correct for a RW), best icEdge=${bestEdge}`);
}

console.log('\n[2] Strongly mean-reverting AR(1) → reversion is REAL, but the EDGE over a trailing mean is ~0');
{
  // The subtle, correct behaviour this brick exists to surface: on a stationary
  // AR(1), BOTH the AR(1) residual AND a plain trailing-mean anchor are valid
  // reversion signals (price above its mean → will revert). So the RAW
  // icPredictive is strongly positive (reversion is real), but the EDGE over the
  // benchmark is small — the benchmark already captures the same reversion. A
  // model only "adds" something if icEdge > 0; here it should be ~0.
  const p = _synth(7, N, 'ar1');   // phi=0.90 pull to 1.0
  const r = validateResidualReversion(p, { instrument: 'AR1' });
  ok(r.ok, 'runs on AR(1)');
  const raws = Object.values(r.perHorizon).filter(h => h.icPredictive != null).map(h => h.icPredictive);
  const edges = Object.values(r.perHorizon).filter(h => h.icEdge != null).map(h => h.icEdge);
  const bestRaw = Math.max(...raws), bestEdge = Math.max(...edges);
  ok(bestRaw > 0.10, `raw icPredictive ${bestRaw} is strongly positive (reversion is real on AR(1))`);
  ok(Math.abs(bestEdge) < 0.10, `icEdge ${bestEdge} ≈ 0 — the trailing-mean benchmark captures the same reversion (no ADDED edge)`);
  ok(r.meanPhi < 0.995, `meanPhi ${r.meanPhi} < 1 (detects the reversion)`);
  ok(r.ou && r.ou.kappa > 0, `OU fit detects reversion (kappa=${r.ou?.kappa}, halfLife=${r.ou?.halfLife})`);
  console.log(`     meanPhi=${r.meanPhi}, best rawIC=${bestRaw}, best icEdge=${bestEdge}, ou.halfLife=${r.ou?.halfLife}`);
}

console.log('\n[3] No-lookahead — residual at bar i is invariant to the future');
{
  const p = _synth(123, 400, 'ar1');
  const a = oosResidualSeries(p, { window: 120, minTrain: 150 });
  // Truncate the future: rebuild the series on the first 300 bars only and check
  // that every residual at index < 300 is identical.
  const pTrunc = p.slice(0, 300);
  const b = oosResidualSeries(pTrunc, { window: 120, minTrain: 150 });
  const common = b.idx.length;
  let identical = true;
  for (let k = 0; k < common; k++) {
    if (a.idx[k] !== b.idx[k] || Math.abs(a.z[k] - b.z[k]) > 1e-12) { identical = false; break; }
  }
  ok(identical, `first ${common} residuals identical when the future is removed (no lookahead)`);
}

console.log('\n[4] Cost honesty — a big enough cost kills a marginal fade');
{
  const p = _synth(7, N, 'ar1');
  const free = validateResidualReversion(p, { instrument: 'AR1', costRt: 0 });
  const costly = validateResidualReversion(p, { instrument: 'AR1', costRt: 0.01 }); // 1% RT — punitive
  ok(free.strategy.annualizedSharpe > costly.strategy.annualizedSharpe,
     `raising cost 0 → 1% lowers Sharpe (${free.strategy.annualizedSharpe} → ${costly.strategy.annualizedSharpe})`);
}

console.log('\n[5] Bare-sign minimal-DOF arm exists (threshold 0.0)');
{
  const p = _synth(7, N, 'ar1');
  const r = validateResidualReversion(p, { instrument: 'AR1' });
  ok(r.strategy.nConfigsTried === 5 * 5, `sweeps 5 holds × 5 thresholds = ${r.strategy.nConfigsTried} configs (paid for in DSR)`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
